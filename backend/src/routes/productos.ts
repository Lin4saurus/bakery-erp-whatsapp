import { Router } from "express";
import { z } from "zod";
import { TipoProducto, UnidadMedida, type Producto } from "@prisma/client";
import { prisma } from "../prisma";
import { AppError } from "../errors";
import { calcularCostoProducto, verificarSinCiclos } from "../services/costeo";
import { alMenosUnCampo, decimalNoNegativo, decimalPositivo, nombre, parseId } from "../validacion";

const productoSchema = z.object({
  nombre,
  categoria: z.string().trim().min(1, "Es obligatorio.").max(60),
  tipo: z.nativeEnum(TipoProducto).optional(),
  rendimientoReceta: decimalPositivo,
  unidadRendimiento: z.nativeEnum(UnidadMedida).optional(),
  precioVenta: decimalNoNegativo.nullable().optional(),
  activo: z.boolean().optional(),
  disponible: z.boolean().optional(),
});

const actualizarSchema = productoSchema.partial().refine(alMenosUnCampo, "Envía al menos un campo para actualizar.");

const sinDuplicados = <T>(ids: T[]): boolean => new Set(ids).size === ids.length;

const recetaSchema = z.object({
  ingredientes: z
    .array(z.object({ insumoId: z.number().int().positive(), cantidad: decimalPositivo }))
    .refine((lista) => sinDuplicados(lista.map((i) => i.insumoId)), "Un insumo aparece más de una vez."),
  subRecetas: z
    .array(z.object({ subProductoId: z.number().int().positive(), cantidad: decimalPositivo }))
    .refine((lista) => sinDuplicados(lista.map((s) => s.subProductoId)), "Una sub-receta aparece más de una vez.")
    .default([]),
});

const cantidadSchema = z.object({ cantidad: decimalPositivo });

const filtrosSchema = z.object({
  tipo: z.nativeEnum(TipoProducto).optional(),
  activo: z.enum(["true", "false"]).transform((valor) => valor === "true").optional(),
  disponible: z.enum(["true", "false"]).transform((valor) => valor === "true").optional(),
});

async function buscarProducto(id: number): Promise<Producto> {
  const producto = await prisma.producto.findUnique({ where: { id } });
  if (!producto) throw new AppError(404, `No existe el producto ${id}.`);
  return producto;
}

async function resumenConCosto(producto: Producto) {
  const { costoTanda, costoUnitario, gananciaUnitaria, margenPorcentaje } = await calcularCostoProducto(
    prisma,
    producto.id,
  );
  return { ...producto, costoTanda, costoUnitario, gananciaUnitaria, margenPorcentaje };
}

export const productosRouter = Router();

// ---------- CRUD ----------

productosRouter.get("/", async (req, res) => {
  const { tipo, activo, disponible } = filtrosSchema.parse(req.query);
  const productos = await prisma.producto.findMany({ where: { tipo, activo, disponible }, orderBy: { nombre: "asc" } });
  res.json(await Promise.all(productos.map(resumenConCosto)));
});

productosRouter.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const producto = await buscarProducto(id);
  res.json(await resumenConCosto(producto));
});

productosRouter.post("/", async (req, res) => {
  const datos = productoSchema.parse(req.body);
  const producto = await prisma.producto.create({ data: datos });
  res.status(201).json(await resumenConCosto(producto));
});

productosRouter.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const datos = actualizarSchema.parse(req.body);
  const actual = await buscarProducto(id);
  if (datos.tipo === TipoProducto.VENTA && actual.tipo === TipoProducto.INTERMEDIO) {
    const usos = await prisma.componenteReceta.count({ where: { subProductoId: id } });
    if (usos > 0) {
      throw new AppError(409, `"${actual.nombre}" se usa como sub-receta; no puede pasar a ser producto de venta.`);
    }
  }
  const producto = await prisma.producto.update({ where: { id }, data: datos });
  res.json(await resumenConCosto(producto));
});

productosRouter.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const producto = await buscarProducto(id);
  const [ventas, usos] = await Promise.all([
    prisma.venta.count({ where: { productoId: id } }),
    prisma.componenteReceta.count({ where: { subProductoId: id } }),
  ]);
  if (ventas > 0) {
    throw new AppError(409, `"${producto.nombre}" tiene ${ventas} venta(s) registradas. Márcalo como inactivo.`);
  }
  if (usos > 0) {
    throw new AppError(409, `"${producto.nombre}" se usa como sub-receta en otros productos. Quítalo de esas recetas primero.`);
  }
  await prisma.producto.delete({ where: { id } }); // la receta se borra en cascada
  res.status(204).end();
});

// ---------- Costo ----------

productosRouter.get("/:id/costo", async (req, res) => {
  const id = parseId(req.params.id);
  res.json(await calcularCostoProducto(prisma, id));
});

// ---------- Receta ----------

// Reemplaza la receta completa del producto (insumos + sub-recetas).
productosRouter.put("/:id/receta", async (req, res) => {
  const id = parseId(req.params.id);
  const receta = recetaSchema.parse(req.body);
  await buscarProducto(id);

  const insumoIds = receta.ingredientes.map((i) => i.insumoId);
  const encontrados = await prisma.insumo.findMany({ where: { id: { in: insumoIds } }, select: { id: true } });
  const faltantes = insumoIds.filter((insumoId) => !encontrados.some((e) => e.id === insumoId));
  if (faltantes.length > 0) {
    throw new AppError(404, `No existen los insumos: ${faltantes.join(", ")}.`);
  }

  const subIds = receta.subRecetas.map((s) => s.subProductoId);
  const subProductos = await prisma.producto.findMany({ where: { id: { in: subIds } } });
  for (const subId of subIds) {
    const sub = subProductos.find((p) => p.id === subId);
    if (!sub) throw new AppError(404, `No existe el producto ${subId} para usar como sub-receta.`);
    if (sub.tipo !== TipoProducto.INTERMEDIO) {
      throw new AppError(422, `"${sub.nombre}" no es un producto intermedio; solo los intermedios pueden ser sub-recetas.`);
    }
  }
  await verificarSinCiclos(prisma, id, subIds);

  await prisma.$transaction([
    prisma.ingredienteReceta.deleteMany({ where: { productoId: id } }),
    prisma.componenteReceta.deleteMany({ where: { productoId: id } }),
    prisma.ingredienteReceta.createMany({
      data: receta.ingredientes.map(({ insumoId, cantidad }) => ({ productoId: id, insumoId, cantidad })),
    }),
    prisma.componenteReceta.createMany({
      data: receta.subRecetas.map(({ subProductoId, cantidad }) => ({ productoId: id, subProductoId, cantidad })),
    }),
  ]);
  res.json(await calcularCostoProducto(prisma, id));
});

// Agrega o cambia la cantidad de un insumo en la receta.
productosRouter.put("/:id/receta/insumos/:insumoId", async (req, res) => {
  const id = parseId(req.params.id);
  const insumoId = parseId(req.params.insumoId);
  const { cantidad } = cantidadSchema.parse(req.body);
  await buscarProducto(id);
  const insumo = await prisma.insumo.findUnique({ where: { id: insumoId } });
  if (!insumo) throw new AppError(404, `No existe el insumo ${insumoId}.`);

  await prisma.ingredienteReceta.upsert({
    where: { productoId_insumoId: { productoId: id, insumoId } },
    create: { productoId: id, insumoId, cantidad },
    update: { cantidad },
  });
  res.json(await calcularCostoProducto(prisma, id));
});

// Quita un insumo de la receta.
productosRouter.delete("/:id/receta/insumos/:insumoId", async (req, res) => {
  const id = parseId(req.params.id);
  const insumoId = parseId(req.params.insumoId);
  const { count } = await prisma.ingredienteReceta.deleteMany({ where: { productoId: id, insumoId } });
  if (count === 0) {
    throw new AppError(404, `El insumo ${insumoId} no está en la receta del producto ${id}.`);
  }
  res.status(204).end();
});
