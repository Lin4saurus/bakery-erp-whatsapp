import { Router } from "express";
import { z } from "zod";
import { CategoriaInsumo, TipoProducto, UnidadMedida, type Producto } from "@prisma/client";
import { prisma } from "../prisma";
import { AppError } from "../errors";
import { crearRespaldo } from "../services/backup";
import { calcularCostoProducto, precargarCosteo, verificarSinCiclos, type MemoCosteo } from "../services/costeo";
import { alMenosUnCampo, decimalNoNegativo, decimalPositivo, nombre, parseId } from "../validacion";

const productoSchema = z.object({
  nombre,
  categoria: z.string().trim().min(1, "Es obligatorio.").max(60),
  tipo: z.nativeEnum(TipoProducto).optional(),
  rendimientoReceta: decimalPositivo,
  unidadRendimiento: z.nativeEnum(UnidadMedida).optional(),
  precioVenta: decimalNoNegativo.nullable().optional(),
  unidadesPorVenta: decimalPositivo.optional(), // unidades de la receta en lo que se vende: 4 en un pack de 4 (D60)
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
  activo: z
    .enum(["true", "false"])
    .transform((valor) => valor === "true")
    .optional(),
  disponible: z
    .enum(["true", "false"])
    .transform((valor) => valor === "true")
    .optional(),
});

async function buscarProducto(id: number): Promise<Producto> {
  const producto = await prisma.producto.findUnique({ where: { id } });
  if (!producto || producto.eliminado) throw new AppError(404, `No existe el producto ${id}.`);
  return producto;
}

async function resumenConCosto(producto: Producto, memo?: MemoCosteo) {
  const { costoTanda, costoEmpaque, costoUnitario, costoPorUnidad, gananciaUnitaria, gananciaPorUnidad, margenPorcentaje } =
    await calcularCostoProducto(prisma, producto.id, [], memo);
  return {
    ...producto,
    costoTanda,
    costoEmpaque,
    costoUnitario,
    costoPorUnidad,
    gananciaUnitaria,
    gananciaPorUnidad,
    margenPorcentaje,
  };
}

export const productosRouter = Router();

// ---------- CRUD ----------

productosRouter.get("/", async (req, res) => {
  const { tipo, activo, disponible } = filtrosSchema.parse(req.query);
  // Las recetas borradas que tenían ventas (D63) no se listan en ningún lado.
  const productos = await prisma.producto.findMany({
    where: { tipo, activo, disponible, eliminado: false },
    orderBy: { nombre: "asc" },
  });
  // Todas las recetas en una consulta y cada costo una vez por petición (R2).
  const memo = await precargarCosteo(prisma);
  res.json(await Promise.all(productos.map((p) => resumenConCosto(p, memo))));
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

// Borrar una categoría entera (D64): todas sus recetas del mismo tipo, con la regla de D63 para cada una
// (sin ventas se borra del todo; con ventas queda `eliminado` y sus ventas siguen en el Historial).
// Antes se hace un respaldo automático. Si un relleno de la categoría se usa en una receta de otra categoría,
// no se borra nada (409) y se dice dónde.
const tipoCategoriaSchema = z.object({ tipo: z.nativeEnum(TipoProducto).default(TipoProducto.VENTA) });

productosRouter.delete("/categorias/:categoria", async (req, res) => {
  const categoria = String(req.params.categoria).trim();
  const { tipo } = tipoCategoriaSchema.parse(req.query);
  const productos = await prisma.producto.findMany({
    where: { categoria, tipo, eliminado: false },
    select: { id: true, nombre: true },
  });
  if (productos.length === 0) throw new AppError(404, `No existe la categoría "${categoria}".`);
  const ids = productos.map((p) => p.id);

  const usosAfuera = await prisma.componenteReceta.findMany({
    where: { subProductoId: { in: ids }, productoId: { notIn: ids }, producto: { eliminado: false } },
    include: { producto: { select: { nombre: true } }, subProducto: { select: { nombre: true } } },
  });
  if (usosAfuera.length > 0) {
    throw new AppError(
      409,
      `No se borró nada: ${usosAfuera.map((u) => `"${u.subProducto.nombre}" se usa en "${u.producto.nombre}"`).join("; ")}. Quítalo de esas recetas primero.`,
    );
  }

  const respaldo = await crearRespaldo(prisma);
  const [conVentas, conHistoricas] = await Promise.all([
    prisma.venta.groupBy({ by: ["productoId"], where: { productoId: { in: ids } } }),
    prisma.ventaHistorica.groupBy({ by: ["productoId"], where: { productoId: { in: ids } } }),
  ]);
  const conservan = new Set([...conVentas, ...conHistoricas].map((v) => v.productoId));
  const aBorrar = ids.filter((id) => !conservan.has(id));
  const aArchivar = ids.filter((id) => conservan.has(id));

  await prisma.$transaction([
    // Primero las recetas (una puede usar a otra de la misma categoría), después los productos.
    prisma.componenteReceta.deleteMany({ where: { productoId: { in: ids } } }),
    prisma.ingredienteReceta.deleteMany({ where: { productoId: { in: ids } } }),
    prisma.precioCliente.deleteMany({ where: { productoId: { in: ids } } }),
    prisma.producto.updateMany({ where: { id: { in: aArchivar } }, data: { eliminado: true, activo: false } }),
    prisma.producto.deleteMany({ where: { id: { in: aBorrar } } }),
  ]);
  res.json({
    categoria,
    borradas: productos.map((p) => p.nombre),
    conservanVentas: productos.filter((p) => conservan.has(p.id)).map((p) => p.nombre),
    respaldo: respaldo.archivo,
  });
});

// Borra la receta (D63). Sin ventas, el producto se borra del todo. Con ventas (Caja o historial), se borran su
// receta y sus precios acordados y queda marcado `eliminado`: no aparece en Recetas ni en la Caja, pero sus
// ventas siguen en el Historial con su nombre. Un relleno que otra receta usa no se borra hasta quitarlo de ahí.
productosRouter.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const producto = await buscarProducto(id);
  const usadoEn = await prisma.componenteReceta.findMany({
    where: { subProductoId: id },
    include: { producto: { select: { nombre: true } } },
  });
  if (usadoEn.length > 0) {
    throw new AppError(
      409,
      `"${producto.nombre}" se usa en: ${usadoEn.map((u) => u.producto.nombre).join(", ")}. Quítalo de esas recetas primero.`,
    );
  }
  const [ventas, historicas] = await Promise.all([
    prisma.venta.count({ where: { productoId: id } }),
    prisma.ventaHistorica.count({ where: { productoId: id } }),
  ]);
  if (ventas + historicas === 0) {
    await prisma.producto.delete({ where: { id } }); // la receta se borra en cascada
    res.json({ borrado: id, conservaVentas: false });
    return;
  }
  await prisma.$transaction([
    prisma.ingredienteReceta.deleteMany({ where: { productoId: id } }),
    prisma.componenteReceta.deleteMany({ where: { productoId: id } }),
    prisma.precioCliente.deleteMany({ where: { productoId: id } }),
    prisma.producto.update({ where: { id }, data: { eliminado: true, activo: false } }),
  ]);
  res.json({ borrado: id, conservaVentas: true });
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
  const encontrados = await prisma.insumo.findMany({
    where: { id: { in: insumoIds } },
    select: { id: true, nombre: true, categoria: true },
  });
  const faltantes = insumoIds.filter((insumoId) => !encontrados.some((e) => e.id === insumoId));
  if (faltantes.length > 0) {
    throw new AppError(404, `No existen los insumos: ${faltantes.join(", ")}.`);
  }
  // «Limpieza y otros» es un gasto (se carga en Gastos), no sube el costo de los productos (D60).
  const gastos = encontrados.filter((e) => e.categoria === CategoriaInsumo.GASTO_INDIRECTO);
  if (gastos.length > 0) {
    throw new AppError(422, `"${gastos.map((g) => g.nombre).join('", "')}" es un gasto, no va en la receta. Cárgalo en Gastos.`);
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
