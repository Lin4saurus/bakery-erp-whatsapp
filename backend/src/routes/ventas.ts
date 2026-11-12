import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { Prisma, TipoCliente, TipoMovimiento, TipoProducto } from "@prisma/client";
import { prisma } from "../prisma";
import { AppError } from "../errors";
import { calcularCostoProducto } from "../services/costeo";
import { alertaDe, explotarInsumos, registrarMovimiento, type AlertaStock } from "../services/inventario";
import { precioAcordado } from "../services/precios";
import { alMenosUnCampo, decimalNoNegativo, decimalPositivo, parseId, normalizarNombre } from "../validacion";

const fechaDia = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD.")
  .optional();

// Para cargar una venta de un día anterior que se olvidó registrar. No se aceptan días futuros.
const fechaVenta = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD.")
  .refine((dia) => new Date(`${dia}T12:00:00`).toLocaleDateString("sv-SE") === dia, "No es una fecha válida.")
  .refine((dia) => dia <= new Date().toLocaleDateString("sv-SE"), "No puede ser una fecha futura.");

export const celularSchema = z
  .string()
  .trim()
  .max(30, "Máximo 30 caracteres.")
  .refine((t) => t.replace(/\D/g, "").length >= 7, "El celular debe tener al menos 7 dígitos.");

// Toda venta lleva cliente con nombre y celular (D44): uno registrado (clienteId) o un nombre;
// si el nombre no existe, se crea el cliente (minorista) con ese celular.
const ventaSchema = z
  .object({
    productoId: z.number().int().positive(),
    cantidad: decimalPositivo,
    precioUnitario: decimalNoNegativo.optional(), // por defecto, el precio de venta del producto
    clienteId: z.string().uuid("Debe ser un id de cliente válido.").optional(),
    clienteNombre: z.string().trim().min(1).max(100).optional(),
    celular: celularSchema.optional(), // obligatorio si el cliente aún no tiene celular
    fecha: fechaVenta.optional(), // por defecto, ahora
  })
  .superRefine((venta, ctx) => {
    if (!venta.clienteId && !venta.clienteNombre) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Escribe el nombre del cliente.", path: ["clienteNombre"] });
    }
  });

const faltaDato = (campo: string, mensaje: string) =>
  new z.ZodError([{ code: z.ZodIssueCode.custom, path: [campo], message: mensaje }]);

const filtrosSchema = z.object({ desde: fechaDia, hasta: fechaDia });

// Corrección desde el Historial (D43): cantidad, precio y día.
const editarSchema = z
  .object({
    cantidad: decimalPositivo.optional(),
    precioUnitario: decimalNoNegativo.optional(),
    fecha: fechaVenta.optional(),
  })
  .refine(alMenosUnCampo, "Envía al menos un campo para corregir.");

// Lo que una venta tiene descontado hoy, por insumo (salidas − devoluciones − correcciones).
const netoPorInsumo = (movimientos: { insumoId: number; cantidad: Prisma.Decimal }[]) => {
  const neto = new Map<number, Prisma.Decimal>();
  for (const m of movimientos) neto.set(m.insumoId, (neto.get(m.insumoId) ?? new Prisma.Decimal(0)).add(m.cantidad));
  return neto;
};

const rangoFechas = (desde?: string, hasta?: string): Prisma.DateTimeFilter => {
  const fecha: Prisma.DateTimeFilter = {};
  if (desde) fecha.gte = new Date(`${desde}T00:00:00`);
  if (hasta) fecha.lte = new Date(`${hasta}T23:59:59.999`);
  return fecha;
};

const conCliente = {
  producto: { select: { nombre: true, categoria: true } },
  clienteRegistrado: { select: { id: true, nombre: true, tipo: true } },
};

type VentaConCliente = Prisma.VentaGetPayload<{ include: typeof conCliente }>;
const plana = ({ producto, clienteRegistrado, ...venta }: VentaConCliente) => ({
  ...venta,
  // Cada sabor es su propio producto; solo las ventas partidas por sabor de un producto sin sabor en el nombre lo agregan (D57).
  producto: venta.sabor ? `${producto.nombre} · ${venta.sabor}` : producto.nombre,
  familia: producto.categoria, // para agrupar un pedido por familia en el Historial (D55)
  clienteTipo: clienteRegistrado?.tipo ?? null,
});

export const ventasRouter = Router();

type Tx = Prisma.TransactionClient;
type FichaCliente = Prisma.ClienteGetPayload<object>;
type ProductoVendible = Prisma.ProductoGetPayload<object>;

// Hoy = ahora; un día anterior se guarda al mediodía (hora local) para que no cambie de día.
const fechaParaGuardar = (fecha?: string) => {
  const hoy = new Date().toLocaleDateString("sv-SE");
  return fecha && fecha !== hoy ? new Date(`${fecha}T12:00:00`) : undefined;
};

// Cliente: el elegido, uno con el mismo nombre (sin importar mayúsculas ni tildes) o uno nuevo (D44).
export async function resolverCliente(
  tx: Tx,
  {
    clienteId,
    clienteNombre,
    celular,
    clienteTipo,
  }: { clienteId?: string; clienteNombre?: string; celular?: string; clienteTipo?: TipoCliente },
) {
  let ficha = clienteId
    ? await tx.cliente.findUnique({ where: { id: clienteId } })
    : ((await tx.cliente.findMany()).find((c) => normalizarNombre(c.nombre) === normalizarNombre(clienteNombre ?? "")) ?? null);
  if (clienteId && !ficha) throw new AppError(404, `No existe el cliente ${clienteId}.`);
  let clienteNuevo = false;
  if (!ficha) {
    if (!celular) throw faltaDato("celular", "Anota el celular del cliente nuevo.");
    // Un cliente nuevo es minorista salvo que la Caja diga mayorista (D53).
    ficha = await tx.cliente.create({
      data: { nombre: (clienteNombre ?? "").replace(/\s+/g, " "), celular, tipo: clienteTipo ?? TipoCliente.MINORISTA },
    });
    clienteNuevo = true;
  }
  if (celular && celular !== ficha.celular) ficha = await tx.cliente.update({ where: { id: ficha.id }, data: { celular } });
  if (!ficha.celular) throw faltaDato("celular", `Falta el celular de "${ficha.nombre}".`);
  return { ficha, clienteNuevo };
}

export async function productoVendible(tx: Tx, productoId: number): Promise<ProductoVendible> {
  const producto = await tx.producto.findUnique({ where: { id: productoId } });
  if (!producto || producto.eliminado) throw new AppError(404, `No existe el producto ${productoId}.`);
  if (producto.tipo !== TipoProducto.VENTA) {
    throw new AppError(422, `"${producto.nombre}" es un producto intermedio y no se vende directamente.`);
  }
  if (!producto.activo) throw new AppError(422, `"${producto.nombre}" está inactivo.`);
  // Todo producto activo se puede vender (D49): la Caja ya no separa «a la venta» de «no disponibles».
  return producto;
}

// Una línea de venta: foto del costo actual, venta con ganancia y descuento de insumos (incluidas sub-recetas).
// Si un insumo no alcanza, la venta igual se registra y se devuelve una alerta.
async function registrarLinea(
  tx: Tx,
  datos: {
    producto: ProductoVendible;
    ficha: FichaCliente;
    cantidad: Prisma.Decimal;
    precioUnitario?: Prisma.Decimal;
    fecha?: string;
    pedidoId?: string;
  },
) {
  const { producto, ficha, cantidad, precioUnitario, fecha, pedidoId } = datos;
  const fechaGuardada = fechaParaGuardar(fecha);
  // Cliente con precio acordado para este producto: se cobra ese y no se cambia a mano (evita errores).
  // Sin precio acordado, se cobra el precio de venta o el que se escriba (regateo).
  const acordado = await precioAcordado(tx, ficha.id, producto.id);
  if (acordado && precioUnitario && !precioUnitario.eq(acordado)) {
    throw new AppError(
      422,
      `Con "${ficha.nombre}" el precio acordado de "${producto.nombre}" es Bs ${acordado.toFixed(2)}; cámbialo en Clientes si se negoció otro.`,
    );
  }
  const precio = acordado ?? precioUnitario ?? producto.precioVenta;
  if (precio === null) {
    throw new AppError(422, `"${producto.nombre}" no tiene precio de venta. Cárgalo o envía precioUnitario.`);
  }

  const { costoUnitario } = await calcularCostoProducto(tx, producto.id);
  const totalVenta = precio.mul(cantidad);
  const costoTotal = costoUnitario.mul(cantidad);
  const venta = await tx.venta.create({
    data: {
      productoId: producto.id,
      cantidad,
      precioUnitario: precio,
      costoUnitario,
      totalVenta,
      costoTotal,
      gananciaBruta: totalVenta.sub(costoTotal),
      cliente: ficha.nombre,
      clienteId: ficha.id,
      pedidoId: pedidoId ?? null,
      fecha: fechaGuardada,
    },
  });

  const consumo = await explotarInsumos(tx, producto.id, cantidad);
  const sinControl = new Set(
    (await tx.insumo.findMany({ where: { controlaStock: false }, select: { id: true } })).map((i) => i.id),
  );
  const lineas = [];
  const alertas: AlertaStock[] = [];
  for (const [insumoId, usado] of consumo) {
    if (sinControl.has(insumoId)) continue; // «No llevar stock» (D40): ni movimiento ni alerta
    const { insumo } = await registrarMovimiento(tx, {
      insumoId,
      tipo: TipoMovimiento.VENTA,
      cantidad: usado.neg(),
      ventaId: venta.id,
      // El movimiento queda con la fecha en que se cargó; la nota dice de qué día era la venta.
      nota: fechaGuardada ? `Venta del ${fecha} cargada después` : undefined,
    });
    lineas.push({ insumoId, nombre: insumo.nombre, cantidad: usado, stockResultante: insumo.stockActual });
    const alerta = alertaDe(insumo);
    if (alerta) alertas.push(alerta);
  }
  return { venta: { ...venta, producto: producto.nombre, clienteTipo: ficha.tipo }, consumo: lineas, alertas };
}

// Registra una venta de un solo producto (API anterior; la Caja usa /pedido).
ventasRouter.post("/", async (req, res) => {
  const { productoId, cantidad, precioUnitario, clienteId, clienteNombre, celular, fecha } = ventaSchema.parse(req.body);
  const resultado = await prisma.$transaction(async (tx) => {
    const producto = await productoVendible(tx, productoId);
    const { ficha, clienteNuevo } = await resolverCliente(tx, { clienteId, clienteNombre, celular });
    const linea = await registrarLinea(tx, { producto, ficha, cantidad, precioUnitario, fecha });
    return { ...linea, clienteNuevo };
  });
  res.status(201).json(resultado);
});

// Un pedido de la Caja con varios productos (D48): todas las líneas se guardan juntas o ninguna.
// Cada línea es una venta con su precio (el acordado con el cliente si lo hay) y su costo del momento;
// comparten cliente, fecha, estado de pago y pedidoId. Cada sabor es su propio producto: no se piden sabores.
const pedidoSchema = z
  .object({
    lineas: z
      .array(
        z.object({
          productoId: z.number().int().positive(),
          cantidad: decimalPositivo,
          precioUnitario: decimalNoNegativo.optional(),
        }),
      )
      .min(1, "Agrega al menos un producto al pedido.")
      .max(40, "Máximo 40 productos por pedido."),
    clienteId: z.string().uuid("Debe ser un id de cliente válido.").optional(),
    clienteNombre: z.string().trim().min(1).max(100).optional(),
    clienteTipo: z.nativeEnum(TipoCliente).optional(), // solo cuenta si el cliente es nuevo
    celular: celularSchema.optional(),
    fecha: fechaVenta.optional(),
  })
  .superRefine((pedido, ctx) => {
    if (!pedido.clienteId && !pedido.clienteNombre) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Escribe el nombre del cliente.", path: ["clienteNombre"] });
    }
    const ids = pedido.lineas.map((l) => l.productoId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Un producto aparece dos veces: suma las cantidades.",
        path: ["lineas"],
      });
    }
  });

ventasRouter.post("/pedido", async (req, res) => {
  const datos = pedidoSchema.parse(req.body);
  const resultado = await prisma.$transaction((tx) => registrarPedidoVenta(tx, datos));
  res.status(201).json(resultado);
});

// Registra un pedido como venta (Caja, o un Pedido que se entrega: D81). Todo dentro de la transacción recibida.
export async function registrarPedidoVenta(tx: Tx, datos: z.infer<typeof pedidoSchema>) {
  const { lineas, clienteId, clienteNombre, clienteTipo, celular, fecha } = datos;
  {
    const { ficha, clienteNuevo } = await resolverCliente(tx, { clienteId, clienteNombre, celular, clienteTipo });
    const pedidoId = randomUUID();
    const ventas = [];
    const alertas = new Map<number, AlertaStock>();
    for (const l of lineas) {
      const producto = await productoVendible(tx, l.productoId);
      const linea = await registrarLinea(tx, {
        producto,
        ficha,
        cantidad: l.cantidad,
        precioUnitario: l.precioUnitario,
        fecha,
        pedidoId,
      });
      ventas.push(linea.venta);
      for (const a of linea.alertas) alertas.set(a.insumoId, a); // queda el estado tras la última línea
    }
    const cero = new Prisma.Decimal(0);
    return {
      pedidoId,
      cliente: ficha.nombre,
      clienteNuevo,
      fecha: ventas[0]?.fecha ?? new Date(),
      ventas,
      unidades: ventas.reduce((t, v) => t.add(v.cantidad), cero),
      totalVenta: ventas.reduce((t, v) => t.add(v.totalVenta), cero),
      costoTotal: ventas.reduce((t, v) => t.add(v.costoTotal), cero),
      gananciaBruta: ventas.reduce((t, v) => t.add(v.gananciaBruta), cero),
      alertas: [...alertas.values()],
    };
  }
}

// Sin fiados (D74): toda venta se cobra al momento; no hay «por cobrar» ni «cobrar».

// Lista de ventas con totales. Filtros opcionales por día (hora local), ambos inclusive.
ventasRouter.get("/", async (req, res) => {
  const { desde, hasta } = filtrosSchema.parse(req.query);
  const ventas = await prisma.venta.findMany({
    where: { fecha: rangoFechas(desde, hasta) },
    include: conCliente,
    orderBy: { fecha: "desc" },
  });

  // Las anuladas se listan (para ver qué pasó) pero no suman en los totales.
  const cero = new Prisma.Decimal(0);
  const sumar = (lista: typeof ventas) =>
    lista.reduce(
      (total, v) => ({
        ventas: total.ventas + 1,
        unidades: total.unidades.add(v.cantidad),
        totalVenta: total.totalVenta.add(v.totalVenta),
        costoTotal: total.costoTotal.add(v.costoTotal),
        gananciaBruta: total.gananciaBruta.add(v.gananciaBruta),
      }),
      { ventas: 0, unidades: cero, totalVenta: cero, costoTotal: cero, gananciaBruta: cero },
    );
  const vigentes = ventas.filter((v) => !v.anulada);
  const esMayorista = (v: (typeof ventas)[number]) => v.clienteRegistrado?.tipo === TipoCliente.MAYORISTA;
  const resumen = {
    ...sumar(vigentes),
    // Sin cliente o con cliente minorista = minorista.
    minoristas: sumar(vigentes.filter((v) => !esMayorista(v))),
    mayoristas: sumar(vigentes.filter(esMayorista)),
  };

  res.json({ resumen, ventas: ventas.map(plana) });
});

// Por cliente registrado: total vendido y cantidad de ventas en el período, y último pedido (de siempre).
// Suma las ventas del sistema y las del historial (notas y Excel) vinculadas al cliente.
ventasRouter.get("/reporte-clientes", async (req, res) => {
  const { desde, hasta } = filtrosSchema.parse(req.query);
  const fecha = rangoFechas(desde, hasta);
  const clientes = await prisma.cliente.findMany({ orderBy: { nombre: "asc" } });
  const [ventas, historicas, ultimas, ultimasHistoricas, lineas, pedidosHistoricos] = await Promise.all([
    prisma.venta.groupBy({
      by: ["clienteId"],
      where: { fecha, anulada: false, clienteId: { not: null } },
      _sum: { totalVenta: true, cantidad: true },
    }),
    prisma.ventaHistorica.groupBy({
      by: ["clienteId"],
      where: { fecha, clienteId: { not: null }, eliminada: false },
      _sum: { valor: true, cantidad: true },
    }),
    prisma.venta.groupBy({ by: ["clienteId"], where: { anulada: false, clienteId: { not: null } }, _max: { fecha: true } }),
    prisma.ventaHistorica.groupBy({
      by: ["clienteId"],
      where: { clienteId: { not: null }, eliminada: false },
      _max: { fecha: true },
    }),
    prisma.venta.findMany({
      where: { fecha, anulada: false, clienteId: { not: null } },
      select: { id: true, clienteId: true, pedidoId: true },
    }),
    // Una nota de varios sabores son varias líneas (D57): el pedido se cuenta por su primera línea.
    prisma.ventaHistorica.groupBy({
      by: ["clienteId"],
      where: { fecha, clienteId: { not: null }, eliminada: false, linea: 0 },
      _count: true,
    }),
  ]);
  // Un pedido de varios productos cuenta como un pedido (D48); las ventas sueltas anteriores, una cada una.
  const pedidosPorCliente = new Map<string, Set<string>>();
  for (const l of lineas) {
    const clave = l.clienteId as string;
    if (!pedidosPorCliente.has(clave)) pedidosPorCliente.set(clave, new Set());
    pedidosPorCliente.get(clave)?.add(l.pedidoId ?? `venta-${l.id}`);
  }

  const cero = new Prisma.Decimal(0);
  const reporte = clientes.map((c) => {
    const v = ventas.find((x) => x.clienteId === c.id);
    const h = historicas.find((x) => x.clienteId === c.id);
    const fechas = [
      ultimas.find((x) => x.clienteId === c.id)?._max.fecha,
      ultimasHistoricas.find((x) => x.clienteId === c.id)?._max.fecha,
    ]
      .filter((f): f is Date => f instanceof Date)
      .sort((a, b) => b.getTime() - a.getTime());
    return {
      id: c.id,
      nombre: c.nombre,
      tipo: c.tipo,
      activo: c.activo,
      totalVendido: (v?._sum.totalVenta ?? cero).add(h?._sum.valor ?? cero),
      unidades: (v?._sum.cantidad ?? cero).add(h?._sum.cantidad ?? cero),
      ventas: (pedidosPorCliente.get(c.id)?.size ?? 0) + (pedidosHistoricos.find((x) => x.clienteId === c.id)?._count ?? 0),
      ultimoPedido: fechas[0] ?? null,
    };
  });
  reporte.sort((a, b) => b.totalVendido.comparedTo(a.totalVendido) || a.nombre.localeCompare(b.nombre));
  res.json(reporte);
});

const anularSchema = z.object({
  motivo: z.string().trim().min(1, "Explica por qué se anula.").max(200),
});

// Anula una venta por error de caja: devuelve al stock exactamente lo que descontó
// (un movimiento ANULACION por cada salida de la venta) y la saca de los totales.
ventasRouter.post("/:id/anular", async (req, res) => {
  const id = parseId(req.params.id);
  const { motivo } = anularSchema.parse(req.body);

  const resultado = await prisma.$transaction(async (tx) => {
    const venta = await tx.venta.findUnique({
      where: { id },
      include: { movimientos: true, producto: { select: { nombre: true } } },
    });
    if (!venta) throw new AppError(404, `No existe la venta ${id}.`);
    if (venta.anulada) throw new AppError(409, `La venta ${id} ya estaba anulada.`);

    const devuelto = [];
    for (const [insumoId, neto] of netoPorInsumo(venta.movimientos)) {
      if (neto.isZero()) continue;
      const { insumo } = await registrarMovimiento(tx, {
        insumoId,
        tipo: TipoMovimiento.ANULACION,
        cantidad: neto.neg(),
        ventaId: id,
        nota: `Anulación venta ${id}: ${motivo}`,
      });
      devuelto.push({ insumoId: insumo.id, nombre: insumo.nombre, cantidad: neto.neg(), stockResultante: insumo.stockActual });
    }

    const anulada = await tx.venta.update({
      where: { id },
      data: { anulada: true, fechaAnulacion: new Date(), motivoAnulacion: motivo },
    });
    return { venta: { ...anulada, producto: venta.producto.nombre }, devuelto };
  });

  res.json(resultado);
});

ventasRouter.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const venta = await prisma.venta.findUnique({
    where: { id },
    include: {
      producto: { select: { nombre: true } },
      movimientos: {
        where: { tipo: TipoMovimiento.VENTA },
        include: { insumo: { select: { nombre: true, unidadBase: true } } },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!venta) throw new AppError(404, `No existe la venta ${id}.`);
  const { producto, movimientos, ...datos } = venta;
  res.json({
    ...datos,
    producto: producto.nombre,
    consumo: movimientos.map((m) => ({
      insumoId: m.insumoId,
      nombre: m.insumo.nombre,
      unidadBase: m.insumo.unidadBase,
      cantidad: m.cantidad.neg(),
      stockResultante: m.stockResultante,
    })),
  });
});

// Corrige una venta (D43). Si cambia la cantidad, el stock se ajusta por la diferencia
// (correcciones con tipo VENTA si se descuenta más, ANULACION si se devuelve). El costo por unidad
// se mantiene (foto del día de la venta) y los totales se recalculan.
ventasRouter.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const datos = editarSchema.parse(req.body);

  const resultado = await prisma.$transaction(async (tx) => {
    const venta = await tx.venta.findUnique({ where: { id }, include: { movimientos: true, clienteRegistrado: true } });
    if (!venta) throw new AppError(404, `No existe la venta ${id}.`);
    if (venta.anulada) throw new AppError(409, `La venta ${id} está anulada: no se corrige. Elimínala si no corresponde.`);

    const cantidad = datos.cantidad ?? venta.cantidad;
    const acordado = venta.clienteId ? await precioAcordado(tx, venta.clienteId, venta.productoId) : null;
    if (acordado && datos.precioUnitario && !datos.precioUnitario.eq(acordado)) {
      throw new AppError(
        422,
        `Con "${venta.cliente}" el precio acordado es Bs ${acordado.toFixed(2)}; cámbialo en Clientes si se negoció otro.`,
      );
    }
    const precio = datos.precioUnitario ?? venta.precioUnitario;
    let fecha = venta.fecha;
    if (datos.fecha) {
      const hoy = new Date().toLocaleDateString("sv-SE");
      const eraHoy = venta.fecha.toLocaleDateString("sv-SE") === hoy;
      fecha = datos.fecha === hoy ? (eraHoy ? venta.fecha : new Date()) : new Date(`${datos.fecha}T12:00:00`);
    }

    if (!cantidad.eq(venta.cantidad)) {
      const sinControl = new Set(
        (await tx.insumo.findMany({ where: { controlaStock: false }, select: { id: true } })).map((i) => i.id),
      );
      const consumo = await explotarInsumos(tx, venta.productoId, cantidad);
      const neto = netoPorInsumo(venta.movimientos);
      const insumos = new Set([...neto.keys(), ...[...consumo.keys()].filter((i) => !sinControl.has(i))]);
      for (const insumoId of insumos) {
        const objetivo = sinControl.has(insumoId)
          ? new Prisma.Decimal(0)
          : (consumo.get(insumoId) ?? new Prisma.Decimal(0)).neg();
        const diferencia = objetivo.sub(neto.get(insumoId) ?? 0);
        if (diferencia.isZero()) continue;
        await registrarMovimiento(tx, {
          insumoId,
          tipo: diferencia.gt(0) ? TipoMovimiento.ANULACION : TipoMovimiento.VENTA,
          cantidad: diferencia,
          ventaId: id,
          nota: `Corrección venta ${id}: ${venta.cantidad.toString()} → ${cantidad.toString()} u`,
        });
      }
    }

    const totalVenta = precio.mul(cantidad);
    const costoTotal = venta.costoUnitario.mul(cantidad);
    return tx.venta.update({
      where: { id },
      data: { cantidad, precioUnitario: precio, totalVenta, costoTotal, gananciaBruta: totalVenta.sub(costoTotal), fecha },
      include: conCliente,
    });
  });

  res.json(plana(resultado));
});

// Elimina una venta (pedido cancelado o cargado por error, D43). Si no estaba anulada, primero devuelve
// al stock lo descontado. Los movimientos quedan en la bitácora del inventario, sin la venta.
export async function eliminarVenta(tx: Tx, id: number) {
  const venta = await tx.venta.findUnique({
    where: { id },
    include: { movimientos: true, producto: { select: { nombre: true } } },
  });
  if (!venta) throw new AppError(404, `No existe la venta ${id}.`);
  if (!venta.anulada) {
    for (const [insumoId, neto] of netoPorInsumo(venta.movimientos)) {
      if (neto.isZero()) continue;
      await registrarMovimiento(tx, {
        insumoId,
        tipo: TipoMovimiento.ANULACION,
        cantidad: neto.neg(),
        nota: `Venta ${id} eliminada (${venta.producto.nombre} × ${venta.cantidad.toString()})`,
      });
    }
  }
  await tx.movimientoInventario.updateMany({ where: { ventaId: id }, data: { ventaId: null } });
  await tx.venta.delete({ where: { id } });
}

// Elimina un pedido entero (todas sus líneas) en una sola transacción, devolviendo el stock (D54).
ventasRouter.delete("/pedidos/:pedidoId", async (req, res) => {
  const pedidoId = z.string().uuid("Debe ser un id de pedido válido.").parse(req.params.pedidoId);
  const eliminadas = await prisma.$transaction(async (tx) => {
    const lineas = await tx.venta.findMany({ where: { pedidoId }, select: { id: true } });
    if (lineas.length === 0) throw new AppError(404, `No existe el pedido ${pedidoId}.`);
    for (const l of lineas) await eliminarVenta(tx, l.id);
    return lineas.length;
  });
  res.json({ pedidoId, eliminadas });
});

ventasRouter.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  await prisma.$transaction((tx) => eliminarVenta(tx, id));
  res.json({ eliminada: id });
});
