// Motor de costeo: "explota" la receta de un producto (insumos + sub-recetas)
// y calcula su costo en tiempo real con los precios actuales de los insumos.
// Reglas: CONTEXT.md §5.
// Producto de venta (D60): costo de lo que se vende = ingredientes ÷ rendimiento × unidadesPorVenta + empaques.
// Los empaques (caja, etiqueta, envase, film) van una vez por lo vendido: no se dividen por el rendimiento.

import { CategoriaInsumo, Prisma, TipoProducto, type UnidadMedida } from "@prisma/client";
import type { Db } from "../prisma";
import { AppError } from "../errors";

type Decimal = Prisma.Decimal;

export const costoUnitarioInsumo = (insumo: { precioEnvase: Decimal; contenidoEnvase: Decimal }): Decimal =>
  insumo.precioEnvase.div(insumo.contenidoEnvase);

export interface LineaInsumo {
  insumoId: number;
  nombre: string;
  unidadBase: UnidadMedida;
  cantidad: Decimal; // por tanda; los empaques de un producto de venta, por lo que se vende
  costoUnitario: Decimal; // Bs por unidad base
  costo: Decimal; // Bs en la tanda (o por lo vendido, si es empaque)
  esEmpaque: boolean; // solo en productos de venta (D60)
}

export interface LineaSubReceta {
  subProductoId: number;
  nombre: string;
  unidad: UnidadMedida;
  cantidad: Decimal; // por tanda, en unidadRendimiento del sub-producto
  costoUnitario: Decimal; // Bs por unidad del sub-producto (ej. por gramo de relleno)
  costo: Decimal; // Bs en la tanda
}

export interface CostoProducto {
  productoId: number;
  nombre: string;
  tipo: TipoProducto;
  rendimientoReceta: Decimal;
  unidadRendimiento: UnidadMedida;
  unidadesPorVenta: Decimal; // 4 en un pack de 4 brownies; 1 en lo demás (D60)
  costoTanda: Decimal; // ingredientes y sub-recetas de la tanda, sin empaques
  costoEmpaque: Decimal; // empaques por lo que se vende (0 en INTERMEDIO)
  costoUnitario: Decimal; // de lo que se vende: costoTanda / rendimiento × unidadesPorVenta + costoEmpaque
  costoPorUnidad: Decimal; // costoUnitario / unidadesPorVenta (un brownie del pack)
  precioVenta: Decimal | null;
  gananciaUnitaria: Decimal | null; // precioVenta - costoUnitario (por lo que se vende)
  gananciaPorUnidad: Decimal | null; // gananciaUnitaria / unidadesPorVenta
  margenPorcentaje: Decimal | null; // gananciaUnitaria / precioVenta × 100
  insumos: LineaInsumo[];
  subRecetas: LineaSubReceta[];
}

const conReceta = {
  ingredientes: { include: { insumo: true }, orderBy: { id: "asc" } },
  subRecetas: { include: { subProducto: true }, orderBy: { id: "asc" } },
} satisfies Prisma.ProductoInclude;
type ProductoConReceta = Prisma.ProductoGetPayload<{ include: typeof conReceta }>;

// Caché de una sola petición (R2, AUDITORIA.md). Al listar productos se precargan todas las recetas en una consulta y
// cada costo (los rellenos compartidos también) se calcula una vez, en memoria. No es global: nunca muestra un precio
// viejo. Guarda solo resultados terminados; un ciclo lo corta `ruta`.
export interface MemoCosteo {
  costos: Map<number, CostoProducto>;
  recetas: Map<number, ProductoConReceta>;
}

export async function precargarCosteo(db: Db): Promise<MemoCosteo> {
  const todos = await db.producto.findMany({ include: conReceta });
  return { costos: new Map(), recetas: new Map(todos.map((p) => [p.id, p])) };
}

export async function calcularCostoProducto(
  db: Db,
  productoId: number,
  ruta: readonly number[] = [],
  memo: MemoCosteo = { costos: new Map(), recetas: new Map() },
): Promise<CostoProducto> {
  if (ruta.includes(productoId)) {
    throw new AppError(422, `Ciclo de sub-recetas detectado: ${[...ruta, productoId].join(" → ")}.`);
  }
  const listo = memo.costos.get(productoId);
  if (listo) return listo;
  const costo = await calcularSinMemo(db, productoId, ruta, memo);
  memo.costos.set(productoId, costo);
  return costo;
}

async function calcularSinMemo(db: Db, productoId: number, ruta: readonly number[], memo: MemoCosteo): Promise<CostoProducto> {
  const producto =
    memo.recetas.get(productoId) ?? (await db.producto.findUnique({ where: { id: productoId }, include: conReceta }));
  if (!producto) {
    throw new AppError(404, `No existe el producto ${productoId}.`);
  }

  const esVenta = producto.tipo === TipoProducto.VENTA;
  const insumos: LineaInsumo[] = producto.ingredientes.map(({ cantidad, insumo }) => {
    const costoUnitario = costoUnitarioInsumo(insumo);
    return {
      insumoId: insumo.id,
      nombre: insumo.nombre,
      unidadBase: insumo.unidadBase,
      cantidad,
      costoUnitario,
      costo: cantidad.mul(costoUnitario),
      esEmpaque: esVenta && insumo.categoria === CategoriaInsumo.EMPAQUE,
    };
  });

  const subRecetas: LineaSubReceta[] = [];
  for (const { cantidad, subProducto } of producto.subRecetas) {
    const sub = await calcularCostoProducto(db, subProducto.id, [...ruta, productoId], memo);
    subRecetas.push({
      subProductoId: subProducto.id,
      nombre: subProducto.nombre,
      unidad: subProducto.unidadRendimiento,
      cantidad,
      costoUnitario: sub.costoUnitario,
      costo: cantidad.mul(sub.costoUnitario),
    });
  }

  const cero = new Prisma.Decimal(0);
  const costoTanda = [...insumos.filter((l) => !l.esEmpaque), ...subRecetas].reduce(
    (total, linea) => total.add(linea.costo),
    cero,
  );
  const costoEmpaque = insumos.filter((l) => l.esEmpaque).reduce((total, linea) => total.add(linea.costo), cero);
  const unidadesPorVenta = esVenta ? producto.unidadesPorVenta : new Prisma.Decimal(1);
  const costoUnitario = costoTanda.div(producto.rendimientoReceta).mul(unidadesPorVenta).add(costoEmpaque);
  const { precioVenta } = producto;
  const gananciaUnitaria = precioVenta ? precioVenta.sub(costoUnitario) : null;
  const margenPorcentaje =
    precioVenta && gananciaUnitaria && precioVenta.gt(0) ? gananciaUnitaria.div(precioVenta).mul(100) : null;

  return {
    productoId: producto.id,
    nombre: producto.nombre,
    tipo: producto.tipo,
    rendimientoReceta: producto.rendimientoReceta,
    unidadRendimiento: producto.unidadRendimiento,
    unidadesPorVenta,
    costoTanda,
    costoEmpaque,
    costoUnitario,
    costoPorUnidad: costoUnitario.div(unidadesPorVenta),
    precioVenta,
    gananciaUnitaria,
    gananciaPorUnidad: gananciaUnitaria ? gananciaUnitaria.div(unidadesPorVenta) : null,
    margenPorcentaje,
    insumos,
    subRecetas,
  };
}

// Falla si usar `subProductoIds` dentro de `productoId` crearía un ciclo (A usa B que usa A).
export async function verificarSinCiclos(db: Db, productoId: number, subProductoIds: readonly number[]): Promise<void> {
  const pendientes = [...subProductoIds];
  const visitados = new Set<number>();
  for (let actual = pendientes.pop(); actual !== undefined; actual = pendientes.pop()) {
    if (actual === productoId) {
      throw new AppError(422, "Esa sub-receta crearía un ciclo: el producto terminaría usándose a sí mismo.");
    }
    if (visitados.has(actual)) continue;
    visitados.add(actual);
    const hijos = await db.componenteReceta.findMany({
      where: { productoId: actual },
      select: { subProductoId: true },
    });
    pendientes.push(...hijos.map((hijo) => hijo.subProductoId));
  }
}
