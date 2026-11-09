// Motor de costeo: "explota" la receta de un producto (insumos + sub-recetas)
// y calcula su costo en tiempo real con los precios actuales de los insumos.
// Reglas: CONTEXT.md §5.

import { Prisma, type TipoProducto, type UnidadMedida } from "@prisma/client";
import type { Db } from "../prisma";
import { AppError } from "../errors";

type Decimal = Prisma.Decimal;

export const costoUnitarioInsumo = (insumo: { precioEnvase: Decimal; contenidoEnvase: Decimal }): Decimal =>
  insumo.precioEnvase.div(insumo.contenidoEnvase);

export interface LineaInsumo {
  insumoId: number;
  nombre: string;
  unidadBase: UnidadMedida;
  cantidad: Decimal; // por tanda
  costoUnitario: Decimal; // Bs por unidad base
  costo: Decimal; // Bs en la tanda
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
  costoTanda: Decimal;
  costoUnitario: Decimal; // costoTanda / rendimientoReceta
  precioVenta: Decimal | null;
  gananciaUnitaria: Decimal | null; // precioVenta - costoUnitario
  margenPorcentaje: Decimal | null; // gananciaUnitaria / precioVenta × 100
  insumos: LineaInsumo[];
  subRecetas: LineaSubReceta[];
}

export async function calcularCostoProducto(
  db: Db,
  productoId: number,
  ruta: readonly number[] = [],
): Promise<CostoProducto> {
  if (ruta.includes(productoId)) {
    throw new AppError(422, `Ciclo de sub-recetas detectado: ${[...ruta, productoId].join(" → ")}.`);
  }

  const producto = await db.producto.findUnique({
    where: { id: productoId },
    include: {
      ingredientes: { include: { insumo: true }, orderBy: { id: "asc" } },
      subRecetas: { include: { subProducto: true }, orderBy: { id: "asc" } },
    },
  });
  if (!producto) {
    throw new AppError(404, `No existe el producto ${productoId}.`);
  }

  const insumos: LineaInsumo[] = producto.ingredientes.map(({ cantidad, insumo }) => {
    const costoUnitario = costoUnitarioInsumo(insumo);
    return {
      insumoId: insumo.id,
      nombre: insumo.nombre,
      unidadBase: insumo.unidadBase,
      cantidad,
      costoUnitario,
      costo: cantidad.mul(costoUnitario),
    };
  });

  const subRecetas: LineaSubReceta[] = [];
  for (const { cantidad, subProducto } of producto.subRecetas) {
    const sub = await calcularCostoProducto(db, subProducto.id, [...ruta, productoId]);
    subRecetas.push({
      subProductoId: subProducto.id,
      nombre: subProducto.nombre,
      unidad: subProducto.unidadRendimiento,
      cantidad,
      costoUnitario: sub.costoUnitario,
      costo: cantidad.mul(sub.costoUnitario),
    });
  }

  const costoTanda = [...insumos, ...subRecetas].reduce(
    (total, linea) => total.add(linea.costo),
    new Prisma.Decimal(0),
  );
  const costoUnitario = costoTanda.div(producto.rendimientoReceta);
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
    costoTanda,
    costoUnitario,
    precioVenta,
    gananciaUnitaria,
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
