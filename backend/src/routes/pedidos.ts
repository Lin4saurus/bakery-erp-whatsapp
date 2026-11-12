import { Router } from "express";
import { z } from "zod";
import { EstadoPedido, OrigenPedido, Prisma, TipoCliente, TipoEntrega } from "@prisma/client";
import { prisma } from "../prisma";
import { AppError } from "../errors";
import { precioAcordado } from "../services/precios";
import { decimalPositivo } from "../validacion";
import { celularSchema, productoVendible, registrarPedidoVenta, resolverCliente } from "./ventas";

// Pedidos por entregar (D81). Ciclo de vida:
//   PENDIENTE → EN_PREPARACION → LISTO → ENTREGADO (recién ahí es venta y baja el stock)
//   cualquiera sin terminar → CANCELADO
// Se puede saltar pasos hacia adelante (un pedido listo al anotarlo) y volver uno atrás si se tocó por error.

const ORDEN: EstadoPedido[] = [EstadoPedido.PENDIENTE, EstadoPedido.EN_PREPARACION, EstadoPedido.LISTO, EstadoPedido.ENTREGADO];
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

const lineasSchema = z
  .array(z.object({ productoId: z.number().int().positive(), cantidad: decimalPositivo }))
  .min(1, "Agrega al menos un producto al pedido.")
  .max(40, "Máximo 40 productos por pedido.")
  .superRefine((lineas, ctx) => {
    const ids = lineas.map((l) => l.productoId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Un producto aparece dos veces: suma las cantidades." });
    }
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

const idSchema = z.string().uuid("Debe ser un id de pedido válido.");

const conDetalle = {
  cliente: { select: { id: true, nombre: true, tipo: true, celular: true } },
  lineas: { include: { producto: { select: { nombre: true, categoria: true } } }, orderBy: { id: "asc" } },
} satisfies Prisma.PedidoInclude;
type PedidoConDetalle = Prisma.PedidoGetPayload<{ include: typeof conDetalle }>;

const plano = ({ lineas, ...pedido }: PedidoConDetalle) => ({
  ...pedido,
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

// Precio de cada línea al anotar: el acordado con el cliente o el precio de venta del producto.
async function preciarLineas(tx: Tx, clienteId: string, lineas: z.infer<typeof lineasSchema>) {
  const resultado = [];
  for (const l of lineas) {
    const producto = await productoVendible(tx, l.productoId);
    const precio = (await precioAcordado(tx, clienteId, producto.id)) ?? producto.precioVenta;
    if (precio === null) throw new AppError(422, `"${producto.nombre}" no tiene precio de venta. Cárgalo en Recetas y precios.`);
    resultado.push({ productoId: producto.id, cantidad: l.cantidad, precioUnitario: precio });
  }
  return resultado;
}

const totalDe = (lineas: { cantidad: Prisma.Decimal; precioUnitario: Prisma.Decimal }[]) =>
  lineas.reduce((t, l) => t.add(l.precioUnitario.mul(l.cantidad)), new Prisma.Decimal(0));

export const pedidosRouter = Router();

// Próximos: lo que falta entregar, del más antiguo (atrasados primero) al más lejano.
// Historial: entregados y cancelados, los últimos primero.
pedidosRouter.get("/", async (req, res) => {
  const { vista } = filtrosSchema.parse(req.query);
  const pedidos =
    vista === "proximos"
      ? await prisma.pedido.findMany({
          where: { estado: { notIn: TERMINADOS } },
          include: conDetalle,
          orderBy: [{ fechaEntrega: "asc" }, { horaEntrega: "asc" }, { numero: "asc" }],
        })
      : await prisma.pedido.findMany({
          where: { estado: { in: TERMINADOS } },
          include: conDetalle,
          orderBy: [{ updatedAt: "desc" }],
          take: 100,
        });
  res.json(pedidos.map(plano));
});

pedidosRouter.get("/:id", async (req, res) => {
  res.json(plano(await buscar(prisma, idSchema.parse(req.params.id))));
});

pedidosRouter.post("/", async (req, res) => {
  // El agente de WhatsApp manda ?confirmado=no cuando el último mensaje del cliente no es un «sí» (D85):
  // así nunca anota un pedido que el cliente no confirmó.
  if (req.query.confirmado === "no") {
    throw new AppError(
      409,
      "El cliente todavía no confirmó el pedido: envíale el resumen con el total y pregúntale si lo confirma.",
    );
  }
  const datos = crearSchema.parse(req.body);
  const resultado = await prisma.$transaction(async (tx) => {
    const { ficha, clienteNuevo } = await resolverCliente(tx, {
      clienteId: datos.clienteId,
      clienteNombre: datos.clienteNombre,
      celular: datos.celular,
      clienteTipo: datos.clienteTipo,
    });
    const lineas = await preciarLineas(tx, ficha.id, datos.lineas);
    const ultimo = await tx.pedido.aggregate({ _max: { numero: true } });
    const pedido = await tx.pedido.create({
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
        total: totalDe(lineas),
        lineas: { create: lineas },
      },
      include: conDetalle,
    });
    return { ...plano(pedido), clienteNuevo };
  });
  res.status(201).json(resultado);
});

// Cambiar día, hora, nota, entrega, envío o productos mientras no esté entregado ni cancelado.
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
      await tx.pedidoLinea.deleteMany({ where: { pedidoId: id } });
      data.lineas = { create: lineas };
      data.total = totalDe(lineas);
    }
    return tx.pedido.update({ where: { id }, data, include: conDetalle });
  });
  res.json(plano(pedido));
});

// Avanzar, retroceder un paso o cancelar. ENTREGADO registra la venta y baja el stock (como la Caja).
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
      const pedido = await tx.pedido.update({
        where: { id },
        data: { estado, canceladoEn: new Date(), motivoCancelacion: motivo || null },
        include: conDetalle,
      });
      return { pedido: plano(pedido), venta: null };
    }

    const desde = ORDEN.indexOf(actual.estado);
    const hasta = ORDEN.indexOf(estado);
    if (hasta < desde - 1) throw new AppError(422, "Solo se puede volver un paso atrás.");

    if (estado !== EstadoPedido.ENTREGADO) {
      const pedido = await tx.pedido.update({ where: { id }, data: { estado }, include: conDetalle });
      return { pedido: plano(pedido), venta: null };
    }

    // Entregar: la venta usa el precio anotado, salvo que el cliente tenga hoy un precio acordado (ese manda).
    const lineas = [];
    for (const l of actual.lineas) {
      const acordado = await precioAcordado(tx, actual.clienteId, l.productoId);
      lineas.push({ productoId: l.productoId, cantidad: l.cantidad, precioUnitario: acordado ? undefined : l.precioUnitario });
    }
    const venta = await registrarPedidoVenta(tx, { lineas, clienteId: actual.clienteId });
    const pedido = await tx.pedido.update({
      where: { id },
      data: { estado, entregadoEn: new Date(), ventaPedidoId: venta.pedidoId },
      include: conDetalle,
    });
    return { pedido: plano(pedido), venta };
  });
  res.json(resultado);
});

// Borrar un pedido anotado por error. Uno entregado ya es venta: se corrige en el Historial de ventas.
pedidosRouter.delete("/:id", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  await prisma.$transaction(async (tx) => {
    const actual = await buscar(tx, id);
    if (actual.estado === EstadoPedido.ENTREGADO) {
      throw new AppError(409, `El pedido ${actual.numero} ya se entregó y es una venta: elimínalo desde el Historial de ventas.`);
    }
    await tx.pedido.delete({ where: { id } });
  });
  res.json({ eliminado: id });
});
