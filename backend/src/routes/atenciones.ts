import { Router } from "express";
import { z } from "zod";
import { EstadoAtencion, EstadoPedido, MotivoAtencion, Prisma, TipoEntrega } from "@prisma/client";
import { prisma } from "../prisma";
import { AppError } from "../errors";

// Atención humana (D85): el agente de WhatsApp avisa a la dueña cuando algo le toca a ella
// (cotizar el delivery en Yango, un pastel personalizado, un reclamo, un comprobante dudoso) y deja de
// contestar en ese chat hasta que ella lo devuelve al agente desde el ERP.
// Si la dueña escribe desde el WhatsApp del negocio (DUENA_RESPONDIO), el agente se calla solo;
// esa pausa vence sola a las PAUSA_DUENA_HORAS sin que ella vuelva a escribir, por si olvida devolverlo.

export const PAUSA_DUENA_HORAS = 6;

const soloDigitos = (t: string) => t.replace(/\D/g, "");
// Bolivia: el celular son los últimos 8 dígitos (el agente manda 591…; los clientes cargados, sin código).
export const claveCelular = (celular: string) => soloDigitos(celular).slice(-8);

const celular = z
  .string()
  .trim()
  .refine((t) => soloDigitos(t).length >= 7, "El celular debe tener al menos 7 dígitos.")
  .transform(soloDigitos);

const crearSchema = z.object({
  celular,
  nombre: z
    .string()
    .trim()
    .max(100)
    .transform((t) => t || null)
    .nullable()
    .optional(),
  motivo: z.nativeEnum(MotivoAtencion),
  descripcion: z.string().trim().min(1, "Describe brevemente qué necesita el cliente.").max(500, "Máximo 500 caracteres."),
  pedidoNumero: z.coerce.number().int().positive().nullable().optional(),
});

const filtrosSchema = z.object({
  estado: z.enum(["PENDIENTE", "RESUELTA", "TODAS"]).default("PENDIENTE"),
});

const idSchema = z.string().uuid("Debe ser un id de atención válido.");

const conDetalle = {
  cliente: { select: { id: true, nombre: true, celular: true } },
  pedido: {
    select: {
      id: true,
      numero: true,
      fechaEntrega: true,
      horaEntrega: true,
      entrega: true,
      ubicacion: true,
      estado: true,
      total: true,
    },
  },
} satisfies Prisma.AtencionInclude;
type AtencionConDetalle = Prisma.AtencionGetPayload<{ include: typeof conDetalle }>;

// El adjunto no viaja en las listas (pesa): se pide con GET /:id/adjunto. La lista ni lo lee de la base (R1).
type AtencionSinArchivo = Omit<AtencionConDetalle, "adjunto"> & { adjunto?: string | null };
const plana = ({ adjunto, ...a }: AtencionSinArchivo, tieneAdjunto = adjunto != null) => ({ ...a, tieneAdjunto });

type Tx = Prisma.TransactionClient;

async function clientePorCelular(tx: Tx, numero: string) {
  const buscado = claveCelular(numero);
  const candidatos = await tx.cliente.findMany({
    where: { celular: { contains: buscado.slice(-6) } },
    select: { id: true, celular: true },
  });
  return candidatos.find((c) => c.celular && claveCelular(c.celular) === buscado) ?? null;
}

// Atenciones que hoy tienen al agente callado en ese celular.
async function pendientesDe(tx: Tx, numero: string) {
  const vence = new Date(Date.now() - PAUSA_DUENA_HORAS * 3600 * 1000);
  const todas = await tx.atencion.findMany({
    where: { estado: EstadoAtencion.PENDIENTE, celularClave: claveCelular(numero) },
    orderBy: { createdAt: "asc" },
  });
  return todas.filter((a) => a.motivo !== MotivoAtencion.DUENA_RESPONDIO || a.updatedAt > vence);
}

// Crea un aviso para la dueña. Una pendiente del mismo motivo en ese chat se actualiza en vez de repetirse.
export async function crearAtencion(
  tx: Tx,
  datos: {
    celular: string;
    nombre?: string | null;
    motivo: MotivoAtencion;
    descripcion: string;
    pedidoNumero?: number | null;
    adjunto?: string | null;
    montoReportado?: Prisma.Decimal | number | null;
    referencia?: string | null;
    saldoPendiente?: Prisma.Decimal | number | null;
    unir?: boolean; // false: siempre una tarjeta nueva (cada comprobante, la suya; D94)
    actualizarId?: string | null; // actualiza esa tarjeta (el mismo comprobante reenviado)
  },
) {
  const numero = soloDigitos(datos.celular);
  const cliente = await clientePorCelular(tx, numero);
  let pedidoId: string | null = null;
  if (datos.pedidoNumero) {
    const pedido = await tx.pedido.findUnique({ where: { numero: datos.pedidoNumero }, select: { id: true } });
    if (!pedido) throw new AppError(404, `No existe el pedido ${datos.pedidoNumero}.`);
    pedidoId = pedido.id;
  }
  const repetida = datos.actualizarId
    ? await tx.atencion.findUnique({ where: { id: datos.actualizarId } })
    : datos.unir === false
      ? null
      : await tx.atencion.findFirst({
          where: { estado: EstadoAtencion.PENDIENTE, motivo: datos.motivo, celularClave: claveCelular(numero) },
        });
  const data = {
    celular: numero,
    celularClave: claveCelular(numero),
    nombre: datos.nombre ?? repetida?.nombre ?? null,
    clienteId: cliente?.id ?? repetida?.clienteId ?? null,
    pedidoId: pedidoId ?? repetida?.pedidoId ?? null,
    motivo: datos.motivo,
    descripcion: datos.descripcion,
    ...(datos.adjunto !== undefined ? { adjunto: datos.adjunto } : {}),
    ...(datos.montoReportado !== undefined ? { montoReportado: datos.montoReportado } : {}),
    ...(datos.referencia !== undefined ? { referencia: datos.referencia } : {}),
    ...(datos.saldoPendiente !== undefined ? { saldoPendiente: datos.saldoPendiente } : {}),
  };
  const atencion = repetida
    ? await tx.atencion.update({ where: { id: repetida.id }, data, include: conDetalle })
    : await tx.atencion.create({ data, include: conDetalle });
  return { atencion: plana(atencion), nueva: !repetida };
}

export const atencionesRouter = Router();

atencionesRouter.get("/", async (req, res) => {
  const { estado } = filtrosSchema.parse(req.query);
  const atenciones = await prisma.atencion.findMany({
    where: estado === "TODAS" ? {} : { estado },
    include: conDetalle,
    omit: { adjunto: true },
    orderBy: estado === "PENDIENTE" ? { createdAt: "asc" } : { updatedAt: "desc" },
    take: estado === "PENDIENTE" ? undefined : 100,
  });
  const conArchivo = new Set(
    (
      await prisma.atencion.findMany({
        where: { id: { in: atenciones.map((a) => a.id) }, adjunto: { not: null } },
        select: { id: true },
      })
    ).map((a) => a.id),
  );
  // Una pausa por «respondiste tú» ya vencida no espera a nadie: no se muestra entre las pendientes.
  const vence = new Date(Date.now() - PAUSA_DUENA_HORAS * 3600 * 1000);
  res.json(
    (estado === "PENDIENTE"
      ? atenciones.filter((a) => a.motivo !== MotivoAtencion.DUENA_RESPONDIO || a.updatedAt > vence)
      : atenciones
    ).map((a) => plana(a, conArchivo.has(a.id))),
  );
});

// Lo consulta el agente antes de contestar: si hay pausa, no responde.
atencionesRouter.get("/pausa", async (req, res) => {
  const numero = celular.parse(req.query.celular ?? "");
  const pendientes = await pendientesDe(prisma, numero);
  res.json({ pausado: pendientes.length > 0, motivos: pendientes.map((a) => a.motivo) });
});

atencionesRouter.get("/:id/adjunto", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const atencion = await prisma.atencion.findUnique({ where: { id }, select: { adjunto: true } });
  if (!atencion) throw new AppError(404, `No existe la atención ${id}.`);
  if (!atencion.adjunto) throw new AppError(404, "Esta atención no tiene adjunto.");
  res.json({ adjunto: atencion.adjunto });
});

// El agente (o la dueña al escribir desde el negocio) pide atención.
atencionesRouter.post("/", async (req, res) => {
  const datos = crearSchema.parse(req.body);
  const resultado = await prisma.$transaction((tx) => crearAtencion(tx, datos));
  res.status(resultado.nueva ? 201 : 200).json(resultado.atencion);
});

// La dueña cotizó el envío en Yango (D89): lo guarda en el pedido, devuelve el chat al agente y le pide a n8n que
// le mande al cliente el resumen del pedido con el costo del envío y le pregunte si lo confirma (D92). Si n8n no responde, el costo queda guardado y la
// pantalla avisa para que la dueña le escriba ella.
const costoEnvioSchema = z.object({
  costoEnvio: z.coerce.number().min(0, "El envío no puede ser negativo.").max(10000, "Revisa el costo del envío."),
});

// Le pide a n8n que le escriba al cliente por WhatsApp: el costo del envío (D92) o «ya está agendado» (D97).
export async function avisarAlCliente(datos: Record<string, unknown>) {
  const url = process.env.N8N_WEBHOOK_ENVIO ?? "http://localhost:5678/webhook/dulzura-envio";
  if (!url) return { enviado: false, error: "aviso automático desactivado" };
  try {
    const respuesta = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(datos),
      signal: AbortSignal.timeout(8000),
    });
    return respuesta.ok ? { enviado: true } : { enviado: false, error: `n8n respondió ${respuesta.status}` };
  } catch {
    return { enviado: false, error: "no se pudo contactar a n8n" };
  }
}

atencionesRouter.post("/:id/costo-envio", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const { costoEnvio } = costoEnvioSchema.parse(req.body);
  const datos = await prisma.$transaction(async (tx) => {
    const atencion = await tx.atencion.findUnique({
      where: { id },
      include: {
        pedido: { include: { lineas: { include: { producto: { select: { nombre: true } } }, orderBy: { id: "asc" } } } },
        cliente: true,
      },
    });
    if (!atencion) throw new AppError(404, `No existe la atención ${id}.`);
    if (atencion.estado === EstadoAtencion.RESUELTA) throw new AppError(409, "Esta atención ya estaba resuelta.");
    const pedido = atencion.pedido;
    if (!pedido || pedido.entrega !== TipoEntrega.DELIVERY) {
      throw new AppError(422, "Esta atención no tiene un pedido con delivery para cotizar.");
    }
    if (pedido.estado !== EstadoPedido.POR_PAGAR) throw new AppError(409, "Ese pedido ya no está en cotización.");
    await tx.pedido.update({ where: { id: pedido.id }, data: { costoEnvio } });
    await tx.atencion.updateMany({
      where: { estado: EstadoAtencion.PENDIENTE, celularClave: claveCelular(atencion.celular) },
      data: { estado: EstadoAtencion.RESUELTA, resueltaEn: new Date() },
    });
    return {
      celular: atencion.celular,
      nombre: atencion.cliente?.nombre ?? atencion.nombre ?? null,
      costoEnvio,
      // El agente le manda al cliente el resumen completo con el envío y le pregunta si confirma (D92).
      lineas: pedido.lineas.map((l) => ({
        cantidad: Number(l.cantidad),
        producto: l.producto.nombre,
        subtotal: Number(l.precioUnitario.mul(l.cantidad)),
      })),
      totalProductos: Number(pedido.total),
      fechaEntrega: pedido.fechaEntrega,
      horaEntrega: pedido.horaEntrega,
      ubicacion: pedido.ubicacion,
    };
  });
  res.json({ costoEnvio, ...(await avisarAlCliente({ tipo: "costo_envio", ...datos })) });
});

// «Listo, devolver al agente»: resuelve todas las pendientes de ese chat para que el agente vuelva a contestar.
atencionesRouter.post("/:id/resolver", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const resueltas = await prisma.$transaction(async (tx) => {
    const atencion = await tx.atencion.findUnique({ where: { id } });
    if (!atencion) throw new AppError(404, `No existe la atención ${id}.`);
    if (atencion.estado === EstadoAtencion.RESUELTA) throw new AppError(409, "Esta atención ya estaba resuelta.");
    const { count } = await tx.atencion.updateMany({
      where: { estado: EstadoAtencion.PENDIENTE, celularClave: claveCelular(atencion.celular) },
      data: { estado: EstadoAtencion.RESUELTA, resueltaEn: new Date() },
    });
    return count;
  });
  res.json({ resueltas });
});
