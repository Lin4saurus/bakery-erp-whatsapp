// Inventario de insumos: consumo por receta y movimientos de stock.
// Regla (CONTEXT.md §5): vender N unidades descuenta cantidad × N / rendimientoReceta de cada insumo,
// y de forma recursiva los insumos de cada sub-receta. Producto de venta (D60): N es lo vendido × unidadesPorVenta
// y los empaques se descuentan enteros, uno por cada cosa vendida (1 caja por pack).

import { CategoriaInsumo, Prisma, TipoMovimiento, TipoProducto, type Insumo } from "@prisma/client";
import type { Db } from "../prisma";
import { AppError } from "../errors";

type Decimal = Prisma.Decimal;

// Devuelve insumoId -> cantidad (en unidad base) que consumen `unidades` del producto.
export async function explotarInsumos(
  db: Db,
  productoId: number,
  unidades: Decimal,
  ruta: readonly number[] = [],
  consumo: Map<number, Decimal> = new Map(),
): Promise<Map<number, Decimal>> {
  if (ruta.includes(productoId)) {
    throw new AppError(422, `Ciclo de sub-recetas detectado: ${[...ruta, productoId].join(" → ")}.`);
  }
  const producto = await db.producto.findUnique({
    where: { id: productoId },
    include: { ingredientes: { include: { insumo: { select: { categoria: true } } } }, subRecetas: true },
  });
  if (!producto) throw new AppError(404, `No existe el producto ${productoId}.`);

  // `unidades` de un producto de venta es lo vendido (packs); de un intermedio, lo que usa la receta de arriba.
  const esVenta = producto.tipo === TipoProducto.VENTA;
  const tandas = (esVenta ? unidades.mul(producto.unidadesPorVenta) : unidades).div(producto.rendimientoReceta);
  for (const { insumoId, cantidad, insumo } of producto.ingredientes) {
    const previo = consumo.get(insumoId) ?? new Prisma.Decimal(0);
    const porLoVendido = esVenta && insumo.categoria === CategoriaInsumo.EMPAQUE;
    consumo.set(insumoId, previo.add(cantidad.mul(porLoVendido ? unidades : tandas)));
  }
  for (const { subProductoId, cantidad } of producto.subRecetas) {
    await explotarInsumos(db, subProductoId, cantidad.mul(tandas), [...ruta, productoId], consumo);
  }
  return consumo;
}

export interface AlertaStock {
  insumoId: number;
  nombre: string;
  stockActual: Decimal;
  stockMinimo: Decimal;
  nivel: "SIN_STOCK" | "BAJO_MINIMO";
}

export const alertaDe = (insumo: Insumo): AlertaStock | null => {
  if (!insumo.controlaStock) return null; // «No llevar stock» (D40)
  const base = { insumoId: insumo.id, nombre: insumo.nombre, stockActual: insumo.stockActual, stockMinimo: insumo.stockMinimo };
  if (insumo.stockActual.lte(0)) return { ...base, nivel: "SIN_STOCK" };
  if (insumo.stockActual.lt(insumo.stockMinimo)) return { ...base, nivel: "BAJO_MINIMO" };
  return null;
};

interface NuevoMovimiento {
  insumoId: number;
  tipo: TipoMovimiento;
  cantidad: Decimal; // con signo: + entra, − sale
  ventaId?: number;
  nota?: string;
}

// Decimales con que se guarda el stock: suficiente para 1/7 de huevo, sin restos de coma flotante.
export const DECIMALES_STOCK = 6;

// Aplica un movimiento: actualiza el stock y deja el registro. Debe correr dentro de una transacción.
export async function registrarMovimiento(tx: Prisma.TransactionClient, movimiento: NuevoMovimiento) {
  const actual = await tx.insumo.findUniqueOrThrow({ where: { id: movimiento.insumoId }, select: { stockActual: true } });
  const nuevo = actual.stockActual.add(movimiento.cantidad).toDecimalPlaces(DECIMALES_STOCK);
  const insumo = await tx.insumo.update({
    where: { id: movimiento.insumoId },
    data: { stockActual: nuevo },
  });
  const registro = await tx.movimientoInventario.create({
    data: {
      insumoId: movimiento.insumoId,
      tipo: movimiento.tipo,
      cantidad: movimiento.cantidad,
      stockResultante: insumo.stockActual,
      ventaId: movimiento.ventaId,
      nota: movimiento.nota,
    },
  });
  return { insumo, movimiento: registro };
}
