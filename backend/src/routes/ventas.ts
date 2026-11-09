import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { EstadoPago, Prisma, TipoCliente, TipoMovimiento, TipoProducto } from "@prisma/client";
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
    fiado: z.boolean().default(false),
    clienteId: z.string().uuid("Debe ser un id de cliente válido.").optional(),
    clienteNombre: z.string().trim().min(1).max(100).optional(),
    celular: celularSchema.optional(), // obligatorio si el cliente aún no tiene celular
    sabores: z.array(z.string().trim().min(1).max(40)).max(20).optional(), // ej. ["Coco", "Oreo"]
    fecha: fechaVenta.optional(), // por defecto, ahora
  })
  .superRefine((venta, ctx) => {
    if (!venta.clienteId && !venta.clienteNombre) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Escribe el nombre del cliente.", path: ["clienteNombre"] });
    }
  });

const faltaDato = (campo: string, mensaje: string) => new z.ZodError([{ code: z.ZodIssueCode.custom, path: [campo], message: mensaje }]);

const filtrosSchema = z.object({ desde: fechaDia, hasta: fechaDia });

// Corrección desde el Historial (D43): cantidad, precio, día y sabores.
const editarSchema = z
  .object({
    cantidad: decimalPositivo.optional(),
    precioUnitario: decimalNoNegativo.optional(),
    fecha: fechaVenta.optional(),
    sabores: z.array(z.string().trim().min(1).max(40)).max(20).nullable().optional(),
  })
  .refine(alMenosUnCampo, "Envía al menos un campo para corregir.");

// Lo que una venta tiene descontado hoy, por insumo (salidas − devoluciones − correcciones).
const netoPorInsumo = (movimientos: { insumoId: number; cantidad: Prisma.Decimal }[]) => {
  const neto = new Map<number, Prisma.Decimal>();
  for (const m of movimientos) neto.set(m.insumoId, (neto.get(m.insumoId) ?? new Prisma.Decimal(0)).add(m.cantidad));
  return neto;
};

// Mayorista: con más de esta cantidad la venta debe decir qué sabores lleva (para planificar la producción).
export const UNIDADES_SIN_SABORES = 5;

const rangoFechas = (desde?: string, hasta?: string): Prisma.DateTimeFilter => {
  const fecha: Prisma.DateTimeFilter = {};
  if (desde) fecha.gte = new Date(`${desde}T00:00:00`);
  if (hasta) fecha.lte = new Date(`${hasta}T23:59:59.999`);
  return fecha;
};

const conCliente = { producto: { select: { nombre: true } }, clienteRegistrado: { select: { id: true, nombre: true, tipo: true } } };

type VentaConCliente = Prisma.VentaGetPayload<{ include: typeof conCliente }>;
const plana = ({ producto, clienteRegistrado, ...venta }: VentaConCliente) => ({
  ...venta,
  producto: producto.nombre,
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
async function resolverCliente(
  tx: Tx,
  { clienteId, clienteNombre, celular }: { clienteId?: string; clienteNombre?: string; celular?: string },
) {
  let ficha = clienteId
    ? await tx.cliente.findUnique({ where: { id: clienteId } })
    : ((await tx.cliente.findMany()).find((c) => normalizarNombre(c.nombre) === normalizarNombre(clienteNombre ?? "")) ?? null);
  if (clienteId && !ficha) throw new AppError(404, `No existe el cliente ${clienteId}.`);
  let clienteNuevo = false;
  if (!ficha) {
    if (!celular) throw faltaDato("celular", "Anota el celular del cliente nuevo.");
    ficha = await tx.cliente.create({ data: { nombre: (clienteNombre ?? "").replace(/\s+/g, " "), celular } });
    clienteNuevo = true;
  }
  if (celular && celular !== ficha.celular) ficha = await tx.cliente.update({ where: { id: ficha.id }, data: { celular } });
  if (!ficha.celular) throw faltaDato("celular", `Falta el celular de "${ficha.nombre}".`);
  return { ficha, clienteNuevo };
}

async function productoVendible(tx: Tx, productoId: number): Promise<ProductoVendible> {
  const producto = await tx.producto.findUnique({ where: { id: productoId } });
  if (!producto) throw new AppError(404, `No existe el producto ${productoId}.`);
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
    fiado: boolean;
    sabores?: string[];
    fecha?: string;
    pedidoId?: string;
  },
) {
  const { producto, ficha, cantidad, precioUnitario, fiado, sabores, fecha, pedidoId } = datos;
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
      estadoPago: fiado ? EstadoPago.PENDIENTE : EstadoPago.PAGADO,
      cliente: ficha.nombre,
      clienteId: ficha.id,
      sabores: sabores?.length ? sabores.join(", ") : null,
      pedidoId: pedidoId ?? null,
      fecha: fechaGuardada,
    },
  });

  const consumo = await explotarInsumos(tx, producto.id, cantidad);
  const sinControl = new Set((await tx.insumo.findMany({ where: { controlaStock: false }, select: { id: true } })).map((i) => i.id));
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
  const { productoId, cantidad, precioUnitario, fiado, clienteId, clienteNombre, celular, sabores, fecha } = ventaSchema.parse(req.body);
  const resultado = await prisma.$transaction(async (tx) => {
    const producto = await productoVendible(tx, productoId);
    const { ficha, clienteNuevo } = await resolverCliente(tx, { clienteId, clienteNombre, celular });
    if (ficha.tipo === TipoCliente.MAYORISTA && cantidad.gt(UNIDADES_SIN_SABORES) && !sabores?.length) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          path: ["sabores"],
          message: `Para más de ${UNIDADES_SIN_SABORES} unidades a un mayorista, indica los sabores.`,
        },
      ]);
    }
    const linea = await registrarLinea(tx, { producto, ficha, cantidad, precioUnitario, fiado, sabores, fecha });
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
    fiado: z.boolean().default(false),
    clienteId: z.string().uuid("Debe ser un id de cliente válido.").optional(),
    clienteNombre: z.string().trim().min(1).max(100).optional(),
    celular: celularSchema.optional(),
    fecha: fechaVenta.optional(),
  })
  .superRefine((pedido, ctx) => {
    if (!pedido.clienteId && !pedido.clienteNombre) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Escribe el nombre del cliente.", path: ["clienteNombre"] });
    }
    const ids = pedido.lineas.map((l) => l.productoId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Un producto aparece dos veces: suma las cantidades.", path: ["lineas"] });
    }
  });

ventasRouter.post("/pedido", async (req, res) => {
  const { lineas, fiado, clienteId, clienteNombre, celular, fecha } = pedidoSchema.parse(req.body);
  const resultado = await prisma.$transaction(async (tx) => {
    const { ficha, clienteNuevo } = await resolverCliente(tx, { clienteId, clienteNombre, celular });
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
        fiado,
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
      estadoPago: fiado ? EstadoPago.PENDIENTE : EstadoPago.PAGADO,
      fecha: ventas[0]?.fecha ?? new Date(),
      ventas,
      unidades: ventas.reduce((t, v) => t.add(v.cantidad), cero),
      totalVenta: ventas.reduce((t, v) => t.add(v.totalVenta), cero),
      costoTotal: ventas.reduce((t, v) => t.add(v.costoTotal), cero),
      gananciaBruta: ventas.reduce((t, v) => t.add(v.gananciaBruta), cero),
      alertas: [...alertas.values()],
    };
  });
  res.status(201).json(resultado);
});

// Cobra de una vez todas las líneas fiadas de un pedido.
ventasRouter.post("/pedidos/:pedidoId/cobrar", async (req, res) => {
  const pedidoId = z.string().uuid("Debe ser un id de pedido válido.").parse(req.params.pedidoId);
  const lineas = await prisma.venta.findMany({ where: { pedidoId } });
  if (lineas.length === 0) throw new AppError(404, `No existe el pedido ${pedidoId}.`);
  const porCobrar = lineas.filter((v) => !v.anulada && v.estadoPago === EstadoPago.PENDIENTE);
  if (porCobrar.length === 0) throw new AppError(409, "Ese pedido no tiene nada por cobrar.");
  await prisma.venta.updateMany({
    where: { id: { in: porCobrar.map((v) => v.id) } },
    data: { estadoPago: EstadoPago.PAGADO, fechaPago: new Date() },
  });
  res.json({
    pedidoId,
    cobradas: porCobrar.length,
    total: porCobrar.reduce((t, v) => t.add(v.totalVenta), new Prisma.Decimal(0)),
    cliente: porCobrar[0]?.cliente ?? null,
  });
});

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
  const [ventas, historicas, ultimas, ultimasHistoricas, lineas] = await Promise.all([
    prisma.venta.groupBy({
      by: ["clienteId"],
      where: { fecha, anulada: false, clienteId: { not: null } },
      _sum: { totalVenta: true, cantidad: true },
    }),
    prisma.ventaHistorica.groupBy({
      by: ["clienteId"],
      where: { fecha, clienteId: { not: null }, eliminada: false },
      _sum: { valor: true, cantidad: true },
      _count: true,
    }),
    prisma.venta.groupBy({ by: ["clienteId"], where: { anulada: false, clienteId: { not: null } }, _max: { fecha: true } }),
    prisma.ventaHistorica.groupBy({ by: ["clienteId"], where: { clienteId: { not: null }, eliminada: false }, _max: { fecha: true } }),
    prisma.venta.findMany({ where: { fecha, anulada: false, clienteId: { not: null } }, select: { id: true, clienteId: true, pedidoId: true } }),
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
    const fechas = [ultimas.find((x) => x.clienteId === c.id)?._max.fecha, ultimasHistoricas.find((x) => x.clienteId === c.id)?._max.fecha]
      .filter((f): f is Date => f instanceof Date)
      .sort((a, b) => b.getTime() - a.getTime());
    return {
      id: c.id,
      nombre: c.nombre,
      tipo: c.tipo,
      activo: c.activo,
      totalVendido: (v?._sum.totalVenta ?? cero).add(h?._sum.valor ?? cero),
      unidades: (v?._sum.cantidad ?? cero).add(h?._sum.cantidad ?? cero),
      ventas: (pedidosPorCliente.get(c.id)?.size ?? 0) + (h?._count ?? 0),
      ultimoPedido: fechas[0] ?? null,
    };
  });
  reporte.sort((a, b) => b.totalVendido.comparedTo(a.totalVendido) || a.nombre.localeCompare(b.nombre));
  res.json(reporte);
});

// Fiados sin cobrar (de cualquier fecha), del más antiguo al más nuevo, con el total por cobrar.
ventasRouter.get("/pendientes", async (_req, res) => {
  const ventas = await prisma.venta.findMany({
    where: { estadoPago: EstadoPago.PENDIENTE, anulada: false },
    include: conCliente,
    orderBy: { fecha: "asc" },
  });
  const total = ventas.reduce((suma, v) => suma.add(v.totalVenta), new Prisma.Decimal(0));
  res.json({ total, ventas: ventas.map(plana) });
});

// Marca un fiado como cobrado. La venta y su ganancia ya se contaron el día que se entregó.
ventasRouter.post("/:id/cobrar", async (req, res) => {
  const id = parseId(req.params.id);
  const venta = await prisma.venta.findUnique({ where: { id }, include: { producto: { select: { nombre: true } } } });
  if (!venta) throw new AppError(404, `No existe la venta ${id}.`);
  if (venta.anulada) throw new AppError(409, `La venta ${id} está anulada; no hay nada que cobrar.`);
  if (venta.estadoPago === EstadoPago.PAGADO) {
    throw new AppError(409, `La venta ${id} ya estaba cobrada.`);
  }
  const { producto, ...cobrada } = await prisma.venta.update({
    where: { id },
    data: { estadoPago: EstadoPago.PAGADO, fechaPago: new Date() },
    include: { producto: { select: { nombre: true } } },
  });
  res.json({ ...cobrada, producto: producto.nombre });
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
    const sabores = datos.sabores === undefined ? venta.sabores : datos.sabores?.length ? datos.sabores.join(", ") : null;
    if (venta.clienteRegistrado?.tipo === TipoCliente.MAYORISTA && cantidad.gt(UNIDADES_SIN_SABORES) && !sabores) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          path: ["sabores"],
          message: `Para más de ${UNIDADES_SIN_SABORES} unidades a un mayorista, indica los sabores.`,
        },
      ]);
    }
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
        const objetivo = sinControl.has(insumoId) ? new Prisma.Decimal(0) : (consumo.get(insumoId) ?? new Prisma.Decimal(0)).neg();
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
      data: { cantidad, precioUnitario: precio, totalVenta, costoTotal, gananciaBruta: totalVenta.sub(costoTotal), sabores, fecha },
      include: conCliente,
    });
  });

  res.json(plana(resultado));
});

// Elimina una venta (pedido cancelado o cargado por error, D43). Si no estaba anulada, primero devuelve
// al stock lo descontado. Los movimientos quedan en la bitácora del inventario, sin la venta.
ventasRouter.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  await prisma.$transaction(async (tx) => {
    const venta = await tx.venta.findUnique({ where: { id }, include: { movimientos: true, producto: { select: { nombre: true } } } });
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
  });
  res.json({ eliminada: id });
});

