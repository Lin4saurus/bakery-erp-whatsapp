import { Router } from "express";
import { z } from "zod";
import {
  EstadoAtencion,
  EstadoPedido,
  MetodoPago,
  MotivoAtencion,
  OrigenPedido,
  Prisma,
  TipoCliente,
  TipoEntrega,
} from "@prisma/client";
import { prisma } from "../prisma";
import { AppError } from "../errors";
import { precioAcordado } from "../services/precios";
import { decimalNoNegativo, decimalPositivo } from "../validacion";
import {
  celularSchema,
  descontarInsumosDePedido,
  devolverInsumosDePedido,
  eliminarVenta,
  productoVendible,
  registrarPedidoVenta,
  type OpcionesVenta,
  resolverCliente,
} from "./ventas";
import { avisarAlCliente, claveCelular, crearAtencion } from "./atenciones";
import {
  bs,
  evaluarComprobante,
  notaDeRechazoAnterior,
  redactarDescripcion,
  type ComprobanteLeido,
  type ContextoPago,
} from "../services/comprobantes";

// Pedidos por entregar (D81). El cliente paga primero (D86); los insumos bajan al preparar (D87). Ciclo de vida:
//   POR_PAGAR → (pago: se registra la venta) → PENDIENTE → (empezar a preparar: se descuentan los insumos)
//   → EN_PREPARACION → LISTO → ENTREGADO
//   cualquiera sin terminar → CANCELADO (si estaba pagado se anula su venta; los insumos solo vuelven si no se
//   había empezado a preparar)
// Se puede saltar pasos hacia adelante y volver uno atrás; volver a «Por pagar» es «Anular pago».
// Un pedido anterior a D86 sin pago registra su venta al entregarlo (cobro contra entrega).

const ORDEN: EstadoPedido[] = [
  EstadoPedido.POR_PAGAR,
  EstadoPedido.PENDIENTE,
  EstadoPedido.EN_PREPARACION,
  EstadoPedido.LISTO,
  EstadoPedido.ENTREGADO,
];
const TERMINADOS: EstadoPedido[] = [EstadoPedido.ENTREGADO, EstadoPedido.CANCELADO];

const hoyLocal = () => new Date().toLocaleDateString("sv-SE");

const fechaEntrega = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD.")
  .refine((dia) => new Date(`${dia}T12:00:00`).toLocaleDateString("sv-SE") === dia, "No es una fecha válida.");
const fechaNoPasada = fechaEntrega.refine((dia) => dia >= hoyLocal(), "La fecha de entrega no puede ser de un día que ya pasó.");
const horaEntrega = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Usa la hora como HH:MM (24 h).")
  .nullable()
  .optional();
const nota = z
  .string()
  .trim()
  .max(500, "Máximo 500 caracteres.")
  .transform((t) => t || null)
  .nullable()
  .optional();

// Recojo o delivery (D85). El envío lo cotiza la dueña: es del cliente, no entra en la venta.
const entrega = z.nativeEnum(TipoEntrega);
const ubicacion = z
  .string()
  .trim()
  .max(500, "Máximo 500 caracteres.")
  .transform((t) => t || null)
  .nullable()
  .optional();
const costoEnvio = z.coerce
  .number()
  .min(0, "El envío no puede ser negativo.")
  .max(10000, "Revisa el costo del envío.")
  .nullable()
  .optional();

// Comprobante: foto o PDF como data URL (hasta ~10 MB). Solo formatos sin código: un SVG puede llevar un script
// que correría dentro del ERP al abrirlo con «Ver comprobante» (S1, AUDITORIA.md).
const comprobante = z
  .string()
  .max(14_000_000, "El comprobante es demasiado grande.")
  .regex(
    /^data:(image\/(jpeg|jpg|png|webp|gif|heic|heif)|application\/pdf);base64,/i,
    "El comprobante debe ser una foto (JPG, PNG, WEBP, GIF o HEIC) o un PDF.",
  )
  .nullable()
  .optional();

const lineasSchema = z
  .array(
    z.object({
      productoId: z.number().int().positive(),
      cantidad: decimalPositivo,
      precioUnitario: decimalNoNegativo.optional(), // descuento anotado en Caja (D98); el acordado manda
    }),
  )
  .min(1, "Agrega al menos un producto al pedido.")
  .max(40, "Máximo 40 productos por pedido.")
  .superRefine((lineas, ctx) => {
    const ids = lineas.map((l) => l.productoId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Un producto aparece dos veces: suma las cantidades." });
    }
  });

const pagoSchema = z.object({
  metodo: z.nativeEnum(MetodoPago),
  monto: z.coerce.number().positive().max(1_000_000).nullable().optional(),
  referencia: z.string().trim().max(100).nullable().optional(),
  comprobante,
  avisarCliente: z.boolean().optional(), // desde Atención: el cliente recibe «ya está agendado» (D97)
});

const crearSchema = z
  .object({
    lineas: lineasSchema,
    clienteId: z.string().uuid("Debe ser un id de cliente válido.").optional(),
    clienteNombre: z.string().trim().min(1).max(100).optional(),
    clienteTipo: z.nativeEnum(TipoCliente).optional(),
    celular: celularSchema.optional(),
    fechaEntrega: fechaNoPasada,
    horaEntrega,
    nota,
    entrega: entrega.default(TipoEntrega.RECOJO),
    ubicacion,
    costoEnvio,
    origen: z.nativeEnum(OrigenPedido).default(OrigenPedido.MANUAL),
    pago: pagoSchema.optional(), // ya pagó al anotarlo (en el local): queda agendado
  })
  .refine((p) => p.clienteId || p.clienteNombre, { message: "Escribe el nombre del cliente.", path: ["clienteNombre"] });

const editarSchema = z
  .object({ lineas: lineasSchema, fechaEntrega, horaEntrega, nota, entrega, ubicacion, costoEnvio })
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Envía al menos un campo para actualizar.");

const estadoSchema = z.object({
  estado: z.nativeEnum(EstadoPedido),
  motivo: z.string().trim().max(300, "Máximo 300 caracteres.").optional(),
});

const filtrosSchema = z.object({
  vista: z.enum(["proximos", "historial"]).default("proximos"),
});

// Lo que el agente de WhatsApp leyó del comprobante (D86). El ERP decide si alcanza para confirmar el pago.
const textoOpcional = z
  .string()
  .trim()
  .max(200)
  .transform((t) => t || null)
  .nullable()
  .optional();
const pagoWhatsappSchema = z.object({
  celular: z.string().trim().min(7).max(40),
  nombre: textoOpcional,
  esComprobante: z.boolean().default(true),
  monto: z.coerce.number().nonnegative().max(1_000_000).nullable().optional(),
  referencia: textoOpcional,
  receptor: textoOpcional,
  enviadoPor: textoOpcional,
  fecha: textoOpcional, // «AAAA-MM-DD HH:MM» como lo leyó la IA
  banco: textoOpcional,
  confianza: z.coerce.number().min(0).max(1).nullable().optional(),
  titular: textoOpcional, // a nombre de quién está el QR de la pastelería
  cuentaDestino: textoOpcional, // nro. de cuenta o celular de destino que muestra el comprobante (D96)
  cuentaTitular: textoOpcional, // nro. de cuenta o celular del QR de la pastelería
  pareceEditado: z.boolean().default(false), // la IA ve letras, montos o fondos retocados (D91)
  sospecha: textoOpcional, // qué le pareció raro a la IA
  estadoPago: textoOpcional, // «exitoso», «pendiente», «rechazado»… como lo dice el comprobante (D95)
  comprobante,
});

const idSchema = z.string().uuid("Debe ser un id de pedido válido.");

const conDetalle = {
  cliente: { select: { id: true, nombre: true, tipo: true, celular: true } },
  lineas: { include: { producto: { select: { nombre: true, categoria: true } } }, orderBy: { id: "asc" } },
} satisfies Prisma.PedidoInclude;
type PedidoConDetalle = Prisma.PedidoGetPayload<{ include: typeof conDetalle }>;

// El comprobante no viaja en las listas (pesa): se pide aparte con GET /:id/comprobante. Las listas ni siquiera lo
// leen de la base (R1, AUDITORIA.md): llegan sin él y con `tieneComprobante` calculado aparte.
type PedidoSinArchivo = Omit<PedidoConDetalle, "comprobante"> & { comprobante?: string | null };
const plano = ({ lineas, comprobante, ...pedido }: PedidoSinArchivo, tieneComprobante = comprobante != null) => ({
  ...pedido,
  tieneComprobante,
  pagado: pedido.ventaPedidoId !== null,
  unidades: lineas.reduce((t, l) => t.add(l.cantidad), new Prisma.Decimal(0)),
  lineas: lineas.map(({ producto, ...l }) => ({
    ...l,
    producto: producto.nombre,
    familia: producto.categoria,
    subtotal: l.precioUnitario.mul(l.cantidad),
  })),
});

type Tx = Prisma.TransactionClient;

async function buscar(tx: Tx, id: string) {
  const pedido = await tx.pedido.findUnique({ where: { id }, include: conDetalle });
  if (!pedido) throw new AppError(404, `No existe el pedido ${id}.`);
  return pedido;
}

// Precio de cada línea al anotar: el acordado con el cliente, el que se anotó en Caja o el precio de venta.
async function preciarLineas(tx: Tx, clienteId: string, lineas: z.infer<typeof lineasSchema>) {
  const resultado = [];
  for (const l of lineas) {
    const producto = await productoVendible(tx, l.productoId);
    const precio = (await precioAcordado(tx, clienteId, producto.id)) ?? l.precioUnitario ?? producto.precioVenta;
    if (precio === null) throw new AppError(422, `"${producto.nombre}" no tiene precio de venta. Cárgalo en Recetas y precios.`);
    resultado.push({ productoId: producto.id, cantidad: l.cantidad, precioUnitario: precio });
  }
  return resultado;
}

const totalDe = (lineas: { cantidad: Prisma.Decimal; precioUnitario: Prisma.Decimal }[]) =>
  lineas.reduce((t, l) => t.add(l.precioUnitario.mul(l.cantidad)), new Prisma.Decimal(0));

// «Nro. 00-123 456» y «00123456» son la misma operación.
export const normalizarReferencia = (ref: string | null | undefined) =>
  (ref ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "") || null;

// La venta del pedido: usa el precio anotado, salvo que el cliente tenga hoy un precio acordado (ese manda).
async function registrarVentaDelPedido(tx: Tx, pedido: PedidoConDetalle, opciones: OpcionesVenta = {}) {
  const lineas = [];
  for (const l of pedido.lineas) {
    const acordado = await precioAcordado(tx, pedido.clienteId, l.productoId);
    lineas.push({ productoId: l.productoId, cantidad: l.cantidad, precioUnitario: acordado ? undefined : l.precioUnitario });
  }
  return registrarPedidoVenta(tx, { lineas, clienteId: pedido.clienteId }, opciones);
}

// Ya se está preparando o está listo: sus insumos se usaron (o se usan) de verdad.
const EN_COCINA: EstadoPedido[] = [EstadoPedido.EN_PREPARACION, EstadoPedido.LISTO];

// Para scripts (pedidos demo): pagar un pedido por su id. Los demo usan clientes del Excel sin celular.
export async function pagarPedidoPorId(
  tx: Tx,
  id: string,
  pago: z.infer<typeof pagoSchema>,
  opciones: { exigirCelular?: boolean } = {},
) {
  return pagarPedido(tx, await buscar(tx, id), pago, opciones);
}

// Confirmar el pago (D86): registra la venta (ingreso de hoy) y agenda el pedido. Los insumos bajan al preparar
// (D87); solo si ya se estaba preparando (pedidos anteriores sin pago) se descuentan ahora.
export async function pagarPedido(
  tx: Tx,
  pedido: PedidoConDetalle,
  pago: z.infer<typeof pagoSchema>,
  { exigirCelular = true }: { exigirCelular?: boolean } = {},
) {
  if (TERMINADOS.includes(pedido.estado)) {
    throw new AppError(409, `El pedido ${pedido.numero} ya está ${pedido.estado === "ENTREGADO" ? "entregado" : "cancelado"}.`);
  }
  if (pedido.ventaPedidoId) throw new AppError(409, `El pedido ${pedido.numero} ya está pagado.`);
  const referencia = normalizarReferencia(pago.referencia);
  if (referencia) {
    const otro = await tx.pedido.findUnique({ where: { pagoReferencia: referencia }, select: { numero: true } });
    if (otro) throw new AppError(409, `El nro. de operación ${pago.referencia} ya se usó para pagar el pedido ${otro.numero}.`);
  }
  const yaEnCocina = EN_COCINA.includes(pedido.estado) && !pedido.insumosDescontadosEn;
  const venta = await registrarVentaDelPedido(tx, pedido, { exigirCelular, descontarStock: yaEnCocina });
  const actualizado = await tx.pedido.update({
    where: { id: pedido.id },
    data: {
      ...(yaEnCocina ? { insumosDescontadosEn: new Date() } : {}),
      estado: pedido.estado === EstadoPedido.POR_PAGAR ? EstadoPedido.PENDIENTE : pedido.estado,
      pagadoEn: new Date(),
      metodoPago: pago.metodo,
      montoPagado: pago.monto ?? pedido.total,
      pagoReferencia: referencia,
      comprobante: pago.comprobante ?? null,
      ventaPedidoId: venta.pedidoId,
    },
    include: conDetalle,
  });
  return { pedido: actualizado, venta };
}

// Anular la venta de un pedido pagado (devolución del dinero). Los insumos vuelven al stock solo si no se había
// empezado a preparar: si ya se estaba preparando, se usaron (D87).
async function anularVentaDelPedido(tx: Tx, pedido: PedidoConDetalle) {
  if (!pedido.ventaPedidoId) return 0;
  const devolverStock = !EN_COCINA.includes(pedido.estado);
  const ventas = await tx.venta.findMany({ where: { pedidoId: pedido.ventaPedidoId }, select: { id: true } });
  for (const v of ventas) await eliminarVenta(tx, v.id, devolverStock);
  return ventas.length;
}

// Empezar a preparar (D87): descuenta los insumos de la receta una sola vez.
async function descontarAlPreparar(tx: Tx, pedido: PedidoConDetalle) {
  if (pedido.insumosDescontadosEn || !pedido.ventaPedidoId) return { data: {}, alertas: [] };
  const alertas = await descontarInsumosDePedido(tx, pedido.ventaPedidoId, `Pedido N.º ${pedido.numero} en preparación`);
  return { data: { insumosDescontadosEn: new Date() }, alertas };
}

const sinPago = {
  ventaPedidoId: null,
  pagadoEn: null,
  metodoPago: null,
  montoPagado: null,
  pagoReferencia: null,
  insumosDescontadosEn: null,
} satisfies Prisma.PedidoUpdateInput;

export const pedidosRouter = Router();

// Próximos: lo que falta entregar (también los por pagar), del más antiguo (atrasados primero) al más lejano.
// Historial: entregados y cancelados, los últimos primero.
pedidosRouter.get("/", async (req, res) => {
  const { vista } = filtrosSchema.parse(req.query);
  const pedidos =
    vista === "proximos"
      ? await prisma.pedido.findMany({
          where: { estado: { notIn: TERMINADOS } },
          include: conDetalle,
          omit: { comprobante: true },
          orderBy: [{ fechaEntrega: "asc" }, { horaEntrega: "asc" }, { numero: "asc" }],
        })
      : await prisma.pedido.findMany({
          where: { estado: { in: TERMINADOS } },
          include: conDetalle,
          omit: { comprobante: true },
          orderBy: [{ updatedAt: "desc" }],
          take: 100,
        });
  // Cuáles tienen comprobante, sin traer el archivo (SQLite revisa si es NULL sin leer el contenido).
  const conArchivo = new Set(
    (
      await prisma.pedido.findMany({
        where: { id: { in: pedidos.map((p) => p.id) }, comprobante: { not: null } },
        select: { id: true },
      })
    ).map((p) => p.id),
  );
  res.json(pedidos.map((p) => plano(p, conArchivo.has(p.id))));
});

// El agente de WhatsApp manda lo que leyó del comprobante (D86). El pago nunca se confirma solo (D91, como en el
// agente de TikTok): si todo cuadra con el pedido por pagar de ese celular, va a Atención como «Pago por confirmar»
// para que la dueña vea en su banco que llegó; si algo no cuadra, como «Posible estafa» con las incongruencias.
// Al cliente: «¡Gracias por tu compra!», el saldo que falta (D94), un rechazo técnico sin acusar con el motivo y el
// saldo que sigue pendiente (D95) o que la repostera lo revisa. Regla de oro: solo vale un comprobante de hoy, y uno
// rechazado no descuenta nada (cero confianza). Las descripciones no mencionan números de pedido (D94).
pedidosRouter.post("/pago-whatsapp", async (req, res) => {
  const d = pagoWhatsappSchema.parse(req.body);
  const resultado = await prisma.$transaction(async (tx) => {
    const clave = claveCelular(d.celular);
    // El monto en Decimal desde el principio (S3): se redondea a centavos, como lo muestra cualquier banco.
    const monto = d.monto === null || d.monto === undefined ? null : new Prisma.Decimal(d.monto).toDecimalPlaces(2);
    const porPagar = (
      await tx.pedido.findMany({
        where: { estado: EstadoPedido.POR_PAGAR, cliente: { celular: { contains: clave.slice(-6) } } },
        include: conDetalle,
        omit: { comprobante: true },
        orderBy: { createdAt: "desc" },
      })
    ).filter((p) => p.cliente.celular && claveCelular(p.cliente.celular) === clave);
    // Con varios por pagar, el que coincide con el monto; si no, el último anotado.
    const pedido = porPagar.find((p) => monto !== null && p.total.eq(monto)) ?? porPagar[0] ?? null;
    const referencia = normalizarReferencia(d.referencia);

    // Comprobantes de esta cotización que todavía esperan a la dueña: cada uno es su tarjeta (D94). Si el cliente
    // vuelve a mandar el mismo comprobante, se actualiza su tarjeta en vez de contarlo dos veces.
    const anteriores = pedido
      ? await tx.atencion.findMany({
          where: {
            pedidoId: pedido.id,
            estado: EstadoAtencion.PENDIENTE,
            motivo: { in: [MotivoAtencion.VERIFICAR_PAGO, MotivoAtencion.POSIBLE_ESTAFA] },
          },
          select: { id: true, referencia: true, montoReportado: true, saldoPendiente: true, motivo: true, descripcion: true },
          orderBy: { createdAt: "desc" },
        })
      : [];
    const reenvio = referencia ? (anteriores.find((a) => a.referencia === referencia) ?? null) : null;
    const otros = anteriores.filter((a) => a.id !== reenvio?.id);

    // El mismo nro. de operación ya pagó otro pedido, o lo mandó otro chat (u otra cotización) y espera confirmación.
    let referenciaRepetida: string | null = null;
    if (referencia) {
      const otro = await tx.pedido.findUnique({
        where: { pagoReferencia: referencia },
        select: { cliente: { select: { nombre: true } } },
      });
      const enEspera = otro
        ? null
        : await tx.atencion.findFirst({
            where: {
              referencia,
              estado: EstadoAtencion.PENDIENTE,
              motivo: { in: [MotivoAtencion.VERIFICAR_PAGO, MotivoAtencion.POSIBLE_ESTAFA] },
              NOT: { celularClave: clave, pedidoId: pedido?.id ?? null },
            },
            select: { celular: true },
          });
      referenciaRepetida = otro
        ? `El nro. de operación ${d.referencia} ya se usó para pagar otro pedido (${otro.cliente.nombre}).`
        : enEspera
          ? claveCelular(enEspera.celular) === clave
            ? `El nro. de operación ${d.referencia} ya lo mandó para otra cotización.`
            : `El nro. de operación ${d.referencia} ya lo mandó otro cliente (${claveCelular(enEspera.celular)}).`
          : null;
    }

    const leido: ComprobanteLeido = {
      esComprobante: d.esComprobante,
      monto,
      confianza: d.confianza ?? null,
      fecha: d.fecha ?? null,
      referencia: d.referencia ?? null,
      receptor: d.receptor ?? null,
      titular: d.titular ?? null,
      cuentaDestino: d.cuentaDestino ?? null,
      cuentaTitular: d.cuentaTitular ?? null,
      estadoPago: d.estadoPago ?? null,
      pareceEditado: d.pareceEditado,
      sospecha: d.sospecha ?? null,
      banco: d.banco ?? null,
      enviadoPor: d.enviadoPor ?? null,
    };
    // Cero confianza (D95): solo descuentan los comprobantes válidos; los rechazados se guardan sin monto.
    const contexto: ContextoPago = {
      hoy: new Date().toLocaleDateString("sv-SE", { timeZone: "America/La_Paz" }),
      total: pedido?.total ?? null,
      yaPago: otros.reduce((t, a) => t.add(a.montoReportado ?? 0), new Prisma.Decimal(0)),
      parcialesPrevios: otros.filter((a) => a.montoReportado !== null && a.saldoPendiente?.gt(0)).length,
      envioSinAceptar: pedido?.entrega === TipoEntrega.DELIVERY && !pedido.envioAceptadoEn,
      referenciaRepetida,
    };
    const e = evaluarComprobante(leido, contexto);

    // Un comprobante válido reemplaza la tarjeta de «posible estafa» de esta cotización (D96): la dueña ve una sola
    // tarjeta, ahora de pago por confirmar, con la nota del rechazo anterior. Las demás rechazadas se cierran.
    const estafas = e.valido && !reenvio ? otros.filter((a) => a.motivo === MotivoAtencion.POSIBLE_ESTAFA) : [];
    const reemplaza = estafas[0] ?? null;
    if (estafas.length > 1) {
      await tx.atencion.updateMany({
        where: { id: { in: estafas.slice(1).map((a) => a.id) } },
        data: { estado: EstadoAtencion.RESUELTA },
      });
    }

    await crearAtencion(tx, {
      celular: d.celular,
      nombre: d.nombre ?? null,
      motivo: !d.esComprobante ? MotivoAtencion.OTRO : e.valido ? MotivoAtencion.VERIFICAR_PAGO : MotivoAtencion.POSIBLE_ESTAFA,
      descripcion: redactarDescripcion(leido, contexto, e, reemplaza ? notaDeRechazoAnterior(reemplaza.descripcion) : null).slice(
        0,
        500,
      ),
      pedidoNumero: pedido?.numero ?? null,
      adjunto: d.comprobante ?? null,
      // Cero confianza: solo un comprobante válido guarda su monto (es lo que descuenta del saldo).
      montoReportado: e.valido ? monto : null,
      referencia: d.esComprobante ? referencia : null,
      saldoPendiente: e.valido ? (e.faltante ?? new Prisma.Decimal(0)) : e.saldo,
      // Cada comprobante, su tarjeta; el mismo comprobante reenviado actualiza la suya.
      ...(d.esComprobante ? { unir: false, actualizarId: reenvio?.id ?? reemplaza?.id ?? null } : {}),
    });
    // Para n8n los montos van como número (solo para mostrar; las cuentas ya se hicieron en Decimal).
    const numero = (n: Prisma.Decimal | null) => (n === null ? null : n.toNumber());
    return {
      // por_confirmar: «¡Gracias por tu compra!» · incompleto: se pide el saldo · rechazado: «❌ COMPROBANTE RECHAZADO»
      // con el motivo y el saldo que sigue pendiente · revision: la repostera lo revisa.
      resultado: e.resultado,
      faltante: numero(e.faltante),
      monto: e.legible ? numero(monto) : null,
      saldo: numero(e.saldo),
      motivosCliente: e.rechazos.map((r) => r.cliente),
      motivos: [...e.rechazos.map((r) => r.duena), ...e.revision, ...(e.faltante ? [`Faltan ${bs(e.faltante)}.`] : [])],
      pedido: pedido ? plano(pedido) : null,
    };
  });
  res.json(resultado);
});

// ---------- Cotización por WhatsApp (D89) ----------
// Todo lo anterior al pago es una cotización: el cliente puede retirarse. Con delivery, la dueña cotiza el envío
// (Yango) y el cliente lo acepta antes de recibir el QR; el envío se le paga al conductor, no entra en el QR.
const cotizacionSchema = z.object({ celular: z.string().trim().min(7).max(40) });
const cancelarCotizacionSchema = cotizacionSchema.extend({
  motivo: z.string().trim().max(300).optional(),
});

// La cotización abierta (por pagar) más reciente de ese celular.
async function cotizacionDe(tx: Tx, celular: string) {
  const clave = claveCelular(celular);
  const abiertas = await tx.pedido.findMany({
    where: { estado: EstadoPedido.POR_PAGAR, cliente: { celular: { contains: clave.slice(-6) } } },
    include: conDetalle,
    orderBy: { createdAt: "desc" },
  });
  return abiertas.find((p) => p.cliente.celular && claveCelular(p.cliente.celular) === clave) ?? null;
}

// El cliente aceptó el costo del envío: recién ahora se le manda el QR (solo por los productos).
pedidosRouter.post("/cotizacion/aceptar-envio", async (req, res) => {
  const { celular } = cotizacionSchema.parse(req.body);
  const pedido = await prisma.$transaction(async (tx) => {
    const abierta = await cotizacionDe(tx, celular);
    if (!abierta) throw new AppError(404, "El cliente no tiene una cotización abierta.");
    if (abierta.entrega === TipoEntrega.DELIVERY && abierta.costoEnvio === null) {
      throw new AppError(409, "La repostera todavía no cotizó el envío: dile al cliente que en un momento le confirma el costo.");
    }
    return tx.pedido.update({ where: { id: abierta.id }, data: { envioAceptadoEn: new Date() }, include: conDetalle });
  });
  res.json({
    total: pedido.total,
    costoEnvio: pedido.costoEnvio,
    entrega: pedido.entrega,
    fechaEntrega: pedido.fechaEntrega,
    horaEntrega: pedido.horaEntrega,
  });
});

// El cliente no siguió (por ejemplo, el envío le pareció caro): se cancela la cotización. No hay venta ni stock.
pedidosRouter.post("/cotizacion/cancelar", async (req, res) => {
  const { celular, motivo } = cancelarCotizacionSchema.parse(req.body);
  const numero = await prisma.$transaction(async (tx) => {
    const abierta = await cotizacionDe(tx, celular);
    if (!abierta) throw new AppError(404, "El cliente no tiene una cotización abierta.");
    await tx.pedido.update({
      where: { id: abierta.id },
      data: {
        estado: EstadoPedido.CANCELADO,
        canceladoEn: new Date(),
        motivoCancelacion: motivo || "El cliente no siguió con la compra",
      },
    });
    return abierta.numero;
  });
  res.json({ cancelado: true, numero });
});

pedidosRouter.get("/:id", async (req, res) => {
  res.json(plano(await buscar(prisma, idSchema.parse(req.params.id))));
});

pedidosRouter.get("/:id/comprobante", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const pedido = await prisma.pedido.findUnique({ where: { id }, select: { comprobante: true } });
  if (!pedido) throw new AppError(404, `No existe el pedido ${id}.`);
  if (!pedido.comprobante) throw new AppError(404, "Este pedido no tiene comprobante.");
  res.json({ comprobante: pedido.comprobante });
});

pedidosRouter.post("/", async (req, res) => {
  // El agente de WhatsApp manda ?confirmado=no cuando el último mensaje del cliente no es un «sí» (D85):
  // así nunca anota un pedido de recojo que el cliente no confirmó. Un delivery se anota como cotización sin
  // resumen previo: el cliente confirma después, cuando ve el resumen con el costo del envío (D92).
  const datos = crearSchema.parse(req.body);
  if (req.query.confirmado === "no" && datos.entrega !== TipoEntrega.DELIVERY) {
    throw new AppError(
      409,
      "El cliente todavía no confirmó el pedido: envíale el resumen con el total y pregúntale si lo confirma.",
    );
  }
  const resultado = await prisma.$transaction(async (tx) => {
    const { ficha, clienteNuevo } = await resolverCliente(tx, {
      clienteId: datos.clienteId,
      clienteNombre: datos.clienteNombre,
      celular: datos.celular,
      clienteTipo: datos.clienteTipo,
    });
    const lineas = await preciarLineas(tx, ficha.id, datos.lineas);
    const ultimo = await tx.pedido.aggregate({ _max: { numero: true } });
    const creado = await tx.pedido.create({
      data: {
        numero: (ultimo._max.numero ?? 0) + 1,
        clienteId: ficha.id,
        fechaEntrega: datos.fechaEntrega,
        horaEntrega: datos.horaEntrega ?? null,
        nota: datos.nota ?? null,
        entrega: datos.entrega,
        ubicacion: datos.ubicacion ?? null,
        costoEnvio: datos.costoEnvio ?? null,
        origen: datos.origen,
        estado: EstadoPedido.POR_PAGAR,
        total: totalDe(lineas),
        lineas: { create: lineas },
      },
      include: conDetalle,
    });
    if (!datos.pago) return { ...plano(creado), clienteNuevo, venta: null };
    const { pedido, venta } = await pagarPedido(tx, creado, datos.pago);
    return { ...plano(pedido), clienteNuevo, venta };
  });
  res.status(201).json(resultado);
});

// Cambiar día, hora, nota, entrega, envío o productos mientras no esté entregado ni cancelado.
// Los productos de un pedido pagado no se cambian (ya es venta): primero se anula el pago.
pedidosRouter.patch("/:id", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const datos = editarSchema.parse(req.body);
  const pedido = await prisma.$transaction(async (tx) => {
    const actual = await buscar(tx, id);
    if (TERMINADOS.includes(actual.estado)) {
      throw new AppError(
        409,
        `El pedido ${actual.numero} ya está ${actual.estado === "ENTREGADO" ? "entregado" : "cancelado"}; no se puede cambiar.`,
      );
    }
    const data: Prisma.PedidoUpdateInput = {};
    if (datos.fechaEntrega !== undefined) data.fechaEntrega = datos.fechaEntrega;
    if (datos.horaEntrega !== undefined) data.horaEntrega = datos.horaEntrega;
    if (datos.nota !== undefined) data.nota = datos.nota;
    if (datos.entrega !== undefined) data.entrega = datos.entrega;
    if (datos.ubicacion !== undefined) data.ubicacion = datos.ubicacion;
    if (datos.costoEnvio !== undefined) data.costoEnvio = datos.costoEnvio;
    if (datos.lineas) {
      const lineas = await preciarLineas(tx, actual.clienteId, datos.lineas);
      if (actual.ventaPedidoId) {
        throw new AppError(409, `El pedido ${actual.numero} ya está pagado: para cambiar los productos, primero anula el pago.`);
      }
      await tx.pedidoLinea.deleteMany({ where: { pedidoId: id } });
      data.lineas = { create: lineas };
      data.total = totalDe(lineas);
    }
    return tx.pedido.update({ where: { id }, data, include: conDetalle });
  });
  res.json(plano(pedido));
});

// Registrar el pago a mano (efectivo en el local, o un QR que la dueña revisó): venta, stock y agenda.
pedidosRouter.post("/:id/pago", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const pago = pagoSchema.parse(req.body);
  const resultado = await prisma.$transaction(async (tx) => {
    const actual = await buscar(tx, id);
    const { pedido, venta } = await pagarPedido(tx, actual, pago);
    return { pedido: plano(pedido), venta, celular: pedido.cliente.celular, nombre: pedido.cliente.nombre };
  });
  const { celular, nombre, ...respuesta } = resultado;
  // La dueña confirmó el pago en Atención: recién ahora el cliente sabe que su pedido quedó agendado (D97).
  const aviso =
    pago.avisarCliente && celular
      ? await avisarAlCliente({
          tipo: "pago_confirmado",
          celular,
          nombre,
          fechaEntrega: respuesta.pedido.fechaEntrega,
          horaEntrega: respuesta.pedido.horaEntrega,
          entrega: respuesta.pedido.entrega,
        })
      : null;
  res.json({ ...respuesta, aviso });
});

// Anular el pago (se marcó por error): borra la venta y el pedido vuelve a «Por pagar». Solo antes de empezar
// a prepararlo (si no, primero «Deshacer», que devuelve los insumos).
pedidosRouter.delete("/:id/pago", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const pedido = await prisma.$transaction(async (tx) => {
    const actual = await buscar(tx, id);
    if (TERMINADOS.includes(actual.estado)) {
      throw new AppError(409, `El pedido ${actual.numero} ya está ${actual.estado === "ENTREGADO" ? "entregado" : "cancelado"}.`);
    }
    if (!actual.ventaPedidoId) throw new AppError(409, `El pedido ${actual.numero} no tiene un pago registrado.`);
    if (EN_COCINA.includes(actual.estado)) {
      throw new AppError(409, `El pedido ${actual.numero} ya se está preparando: primero vuelve a «Agendado» con «Deshacer».`);
    }
    await anularVentaDelPedido(tx, actual);
    return tx.pedido.update({
      where: { id },
      data: { ...sinPago, estado: EstadoPedido.POR_PAGAR },
      include: conDetalle,
    });
  });
  res.json(plano(pedido));
});

// Avanzar, retroceder un paso o cancelar. Sin pago no se agenda; al empezar a preparar bajan los insumos (D87)
// y volver a «Agendado» los devuelve; cancelar uno pagado anula su venta.
pedidosRouter.post("/:id/estado", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const { estado, motivo } = estadoSchema.parse(req.body);
  const resultado = await prisma.$transaction(async (tx) => {
    const actual = await buscar(tx, id);
    if (TERMINADOS.includes(actual.estado)) {
      throw new AppError(409, `El pedido ${actual.numero} ya está ${actual.estado === "ENTREGADO" ? "entregado" : "cancelado"}.`);
    }
    if (estado === actual.estado) throw new AppError(409, "El pedido ya está en ese estado.");

    if (estado === EstadoPedido.CANCELADO) {
      const anuladas = await anularVentaDelPedido(tx, actual);
      const pedido = await tx.pedido.update({
        where: { id },
        data: { ...sinPago, estado, canceladoEn: new Date(), motivoCancelacion: motivo || null },
        include: conDetalle,
      });
      return { pedido: plano(pedido), venta: null, ventaAnulada: anuladas > 0 };
    }

    if (estado === EstadoPedido.POR_PAGAR) {
      throw new AppError(422, "Para volver a «Por pagar», usa «Anular pago».");
    }
    if (actual.estado === EstadoPedido.POR_PAGAR) {
      throw new AppError(409, `Primero registra el pago del pedido ${actual.numero}: recién pagado se agenda.`);
    }

    const desde = ORDEN.indexOf(actual.estado);
    const hasta = ORDEN.indexOf(estado);
    if (hasta < desde - 1) throw new AppError(422, "Solo se puede volver un paso atrás.");

    // Volver a «Agendado»: todavía no se empezó, los insumos vuelven al estante.
    if (estado === EstadoPedido.PENDIENTE) {
      if (actual.insumosDescontadosEn && actual.ventaPedidoId) {
        await devolverInsumosDePedido(tx, actual.ventaPedidoId, `Pedido N.º ${actual.numero}: se deshizo «Empezar a preparar»`);
      }
      const pedido = await tx.pedido.update({
        where: { id },
        data: { estado, insumosDescontadosEn: null },
        include: conDetalle,
      });
      return { pedido: plano(pedido), venta: null, alertas: [] };
    }

    if (estado !== EstadoPedido.ENTREGADO) {
      const { data, alertas } = await descontarAlPreparar(tx, actual);
      const pedido = await tx.pedido.update({ where: { id }, data: { ...data, estado }, include: conDetalle });
      return { pedido: plano(pedido), venta: null, alertas };
    }

    // Entregar. Un pedido anterior al cobro por adelantado (sin venta) se cobra ahora y descuenta sus insumos.
    const venta = actual.ventaPedidoId
      ? null
      : await registrarVentaDelPedido(tx, actual, { descontarStock: !actual.insumosDescontadosEn });
    const { data, alertas } = venta ? { data: {}, alertas: venta.alertas } : await descontarAlPreparar(tx, actual);
    const pedido = await tx.pedido.update({
      where: { id },
      data: {
        ...data,
        estado,
        entregadoEn: new Date(),
        ...(venta
          ? {
              ventaPedidoId: venta.pedidoId,
              pagadoEn: new Date(),
              metodoPago: MetodoPago.EFECTIVO,
              insumosDescontadosEn: actual.insumosDescontadosEn ?? new Date(),
            }
          : {}),
      },
      include: conDetalle,
    });
    return { pedido: plano(pedido), venta, alertas };
  });
  res.json(resultado);
});

// Borrar un pedido anotado por error. Uno pagado ya es venta: se cancela (anula la venta) o se anula el pago.
pedidosRouter.delete("/:id", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  await prisma.$transaction(async (tx) => {
    const actual = await buscar(tx, id);
    if (actual.ventaPedidoId) {
      throw new AppError(
        409,
        actual.estado === EstadoPedido.ENTREGADO
          ? `El pedido ${actual.numero} ya se entregó y es una venta: elimínalo desde el Historial de ventas.`
          : `El pedido ${actual.numero} está pagado: cancélalo (anula la venta) o anula el pago antes de borrarlo.`,
      );
    }
    await tx.pedido.delete({ where: { id } });
  });
  res.json({ eliminado: id });
});
