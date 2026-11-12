import { Router } from "express";
import { z } from "zod";
import { EstadoAtencion, MotivoAtencion, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { AppError } from "../errors";

// Atención humana (D85): el agente de WhatsApp avisa a la dueña cuando algo le toca a ella
// (cotizar el delivery en Yango, un pastel personalizado, un reclamo) y deja de contestar en ese chat
// hasta que ella lo devuelve al agente desde el ERP.
// Si la dueña escribe desde el WhatsApp del negocio (DUENA_RESPONDIO), el agente se calla solo;
// esa pausa vence sola a las PAUSA_DUENA_HORAS sin que ella vuelva a escribir, por si olvida devolverlo.

export const PAUSA_DUENA_HORAS = 6;

const soloDigitos = (t: string) => t.replace(/\D/g, "");
// Bolivia: el celular son los últimos 8 dígitos (el agente manda 591…; los clientes cargados, sin código).
const clave = (celular: string) => soloDigitos(celular).slice(-8);

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
  pedido: { select: { id: true, numero: true, fechaEntrega: true, horaEntrega: true, entrega: true, ubicacion: true } },
} satisfies Prisma.AtencionInclude;

type Tx = Prisma.TransactionClient;

async function clientePorCelular(tx: Tx, numero: string) {
  const buscado = clave(numero);
  const candidatos = await tx.cliente.findMany({
    where: { celular: { contains: buscado.slice(-6) } },
    select: { id: true, celular: true },
  });
  return candidatos.find((c) => c.celular && clave(c.celular) === buscado) ?? null;
}

// Atenciones que hoy tienen al agente callado en ese celular.
async function pendientesDe(tx: Tx, numero: string) {
  const vence = new Date(Date.now() - PAUSA_DUENA_HORAS * 3600 * 1000);
  const todas = await tx.atencion.findMany({
    where: { estado: EstadoAtencion.PENDIENTE, celular: { endsWith: clave(numero) } },
    orderBy: { createdAt: "asc" },
  });
  return todas.filter((a) => a.motivo !== MotivoAtencion.DUENA_RESPONDIO || a.updatedAt > vence);
}

export const atencionesRouter = Router();

atencionesRouter.get("/", async (req, res) => {
  const { estado } = filtrosSchema.parse(req.query);
  const atenciones = await prisma.atencion.findMany({
    where: estado === "TODAS" ? {} : { estado },
    include: conDetalle,
    orderBy: estado === "PENDIENTE" ? { createdAt: "asc" } : { updatedAt: "desc" },
    take: estado === "PENDIENTE" ? undefined : 100,
  });
  // Una pausa por «respondiste tú» ya vencida no espera a nadie: no se muestra entre las pendientes.
  const vence = new Date(Date.now() - PAUSA_DUENA_HORAS * 3600 * 1000);
  res.json(
    estado === "PENDIENTE"
      ? atenciones.filter((a) => a.motivo !== MotivoAtencion.DUENA_RESPONDIO || a.updatedAt > vence)
      : atenciones,
  );
});

// Lo consulta el agente antes de contestar: si hay pausa, no responde.
atencionesRouter.get("/pausa", async (req, res) => {
  const numero = celular.parse(req.query.celular ?? "");
  const pendientes = await pendientesDe(prisma, numero);
  res.json({ pausado: pendientes.length > 0, motivos: pendientes.map((a) => a.motivo) });
});

// El agente (o la dueña al escribir desde el negocio) pide atención. Una pendiente del mismo motivo
// en ese chat se actualiza en vez de repetirse.
atencionesRouter.post("/", async (req, res) => {
  const datos = crearSchema.parse(req.body);
  const resultado = await prisma.$transaction(async (tx) => {
    const cliente = await clientePorCelular(tx, datos.celular);
    let pedidoId: string | null = null;
    if (datos.pedidoNumero) {
      const pedido = await tx.pedido.findUnique({ where: { numero: datos.pedidoNumero }, select: { id: true } });
      if (!pedido) throw new AppError(404, `No existe el pedido ${datos.pedidoNumero}.`);
      pedidoId = pedido.id;
    }
    const repetida = await tx.atencion.findFirst({
      where: { estado: EstadoAtencion.PENDIENTE, motivo: datos.motivo, celular: { endsWith: clave(datos.celular) } },
    });
    const data = {
      celular: datos.celular,
      nombre: datos.nombre ?? repetida?.nombre ?? null,
      clienteId: cliente?.id ?? repetida?.clienteId ?? null,
      pedidoId: pedidoId ?? repetida?.pedidoId ?? null,
      motivo: datos.motivo,
      descripcion: datos.descripcion,
    };
    const atencion = repetida
      ? await tx.atencion.update({ where: { id: repetida.id }, data, include: conDetalle })
      : await tx.atencion.create({ data, include: conDetalle });
    return { atencion, nueva: !repetida };
  });
  res.status(resultado.nueva ? 201 : 200).json(resultado.atencion);
});

// «Listo, devolver al agente»: resuelve todas las pendientes de ese chat para que el agente vuelva a contestar.
atencionesRouter.post("/:id/resolver", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const resueltas = await prisma.$transaction(async (tx) => {
    const atencion = await tx.atencion.findUnique({ where: { id } });
    if (!atencion) throw new AppError(404, `No existe la atención ${id}.`);
    if (atencion.estado === EstadoAtencion.RESUELTA) throw new AppError(409, "Esta atención ya estaba resuelta.");
    const { count } = await tx.atencion.updateMany({
      where: { estado: EstadoAtencion.PENDIENTE, celular: { endsWith: clave(atencion.celular) } },
      data: { estado: EstadoAtencion.RESUELTA, resueltaEn: new Date() },
    });
    return count;
  });
  res.json({ resueltas });
});
