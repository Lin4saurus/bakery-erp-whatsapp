import { Router } from "express";
import { z } from "zod";
import { Prisma, TipoCliente } from "@prisma/client";
import { prisma } from "../prisma";
import { AppError } from "../errors";
import { alMenosUnCampo, decimalNoNegativo, nombre, normalizarNombre } from "../validacion";

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .transform((t) => t || null)
    .nullable()
    .optional();

const clienteSchema = z.object({
  nombre,
  tipo: z.nativeEnum(TipoCliente).default(TipoCliente.MINORISTA),
  celular: textoOpcional(30),
  email: z
    .string()
    .trim()
    .email("Correo inválido.")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  direccion: textoOpcional(200),
});
const actualizarSchema = clienteSchema
  .partial()
  .omit({ tipo: true })
  .extend({ tipo: z.nativeEnum(TipoCliente).optional() })
  .refine(alMenosUnCampo, "Envía al menos un campo para actualizar.");
const filtrosSchema = z.object({
  tipo: z.nativeEnum(TipoCliente).optional(),
});
const idSchema = z.string().uuid("Debe ser un id válido.");

const productoIdSchema = z.coerce.number().int().positive("Debe ser un id de producto válido.");
const precioSchema = z.object({ precio: decimalNoNegativo });

// Cada cliente trae sus precios acordados (D42).
const conPrecios = {
  precios: {
    select: { productoId: true, precio: true, producto: { select: { nombre: true, precioVenta: true } } },
    orderBy: { producto: { nombre: "asc" } },
  },
} satisfies Prisma.ClienteInclude;

async function buscar(id: string) {
  const cliente = await prisma.cliente.findUnique({ where: { id }, include: conPrecios });
  if (!cliente) throw new AppError(404, `No existe el cliente ${id}.`);
  return cliente;
}

// No puede haber dos clientes con el mismo nombre y apellido, aunque cambien mayúsculas o tildes (D45).
async function revisarRepetido(nombreCliente: string, exceptoId?: string) {
  const buscado = normalizarNombre(nombreCliente);
  const otro = (await prisma.cliente.findMany({ select: { id: true, nombre: true } })).find(
    (c) => c.id !== exceptoId && normalizarNombre(c.nombre) === buscado,
  );
  if (otro) throw new AppError(409, `Ya existe el cliente "${otro.nombre}". Si es otra persona, agrega su apellido.`);
}

export const clientesRouter = Router();

clientesRouter.get("/", async (req, res) => {
  const { tipo } = filtrosSchema.parse(req.query);
  res.json(
    await prisma.cliente.findMany({ where: { tipo }, include: conPrecios, orderBy: [{ tipo: "asc" }, { nombre: "asc" }] }),
  );
});

// El agente de WhatsApp busca solo al cliente que escribe (N3, D101), en vez de bajar la lista entera en cada
// mensaje. Mismo criterio que antes en n8n: los últimos 8 dígitos y, si hay varios, el primero activo de la lista.
// Siempre responde un objeto (con cliente null si no existe) para que el flujo de n8n siga.
clientesRouter.get("/por-celular/:celular", async (req, res) => {
  const clave = z
    .string()
    .transform((t) => t.replace(/\D/g, "").slice(-8))
    .refine((t) => t.length >= 7, "El celular debe tener al menos 7 dígitos.")
    .parse(req.params.celular);
  const candidatos = await prisma.cliente.findMany({
    where: { celular: { contains: clave.slice(-6) } },
    include: conPrecios,
    orderBy: [{ tipo: "asc" }, { nombre: "asc" }],
  });
  const iguales = candidatos.filter((c) => c.celular && c.celular.replace(/\D/g, "").slice(-8) === clave);
  res.json({ cliente: iguales.find((c) => c.activo) ?? null });
});

clientesRouter.get("/:id", async (req, res) => {
  res.json(await buscar(idSchema.parse(req.params.id)));
});

clientesRouter.post("/", async (req, res) => {
  const datos = clienteSchema.parse(req.body);
  await revisarRepetido(datos.nombre);
  res.status(201).json(await prisma.cliente.create({ data: datos, include: conPrecios }));
});

clientesRouter.patch("/:id", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const datos = actualizarSchema.parse(req.body);
  await buscar(id);
  if (datos.nombre) await revisarRepetido(datos.nombre, id);
  res.json(await prisma.cliente.update({ where: { id }, data: datos, include: conPrecios }));
});

// Los clientes no se borran ni se desactivan: su historial siempre queda a la vista (D45).

// ---------- Precios acordados (solo mayoristas) ----------

async function mayorista(id: string) {
  const cliente = await buscar(id);
  if (cliente.tipo !== TipoCliente.MAYORISTA) {
    throw new AppError(
      422,
      `"${cliente.nombre}" es minorista: paga el precio de venta. Cámbialo a mayorista para acordar precios.`,
    );
  }
  return cliente;
}

// Fija (o cambia) el precio acordado con el cliente para un producto.
clientesRouter.put("/:id/precios/:productoId", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const productoId = productoIdSchema.parse(req.params.productoId);
  const { precio } = precioSchema.parse(req.body);
  await mayorista(id);
  const producto = await prisma.producto.findUnique({ where: { id: productoId } });
  if (!producto) throw new AppError(404, `No existe el producto ${productoId}.`);
  await prisma.precioCliente.upsert({
    where: { clienteId_productoId: { clienteId: id, productoId } },
    create: { clienteId: id, productoId, precio },
    update: { precio },
  });
  res.json(await buscar(id));
});

// Quita el precio acordado: vuelve a cobrarse el precio de venta.
clientesRouter.delete("/:id/precios/:productoId", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const productoId = productoIdSchema.parse(req.params.productoId);
  await buscar(id);
  await prisma.precioCliente.deleteMany({ where: { clienteId: id, productoId } });
  res.json(await buscar(id));
});
