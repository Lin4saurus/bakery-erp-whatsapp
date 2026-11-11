import { CategoriaGasto, Prisma, TipoMovimiento } from "@prisma/client";
import { registrarMovimiento } from "./inventario";

type Tx = Prisma.TransactionClient;
type Insumo = Prisma.InsumoGetPayload<object>;

// Una compra de insumo (D51): entra al stock (movimiento COMPRA) y queda en Gastos como «Compra de insumos».
// Se usa desde Gastos y desde Insumos → Movimientos, para que las dos formas de cargar una compra
// dejen lo mismo. Va dentro de la transacción de quien la llama.
export async function registrarCompra(
  tx: Tx,
  datos: {
    insumo: Insumo;
    envases?: Prisma.Decimal;
    cantidad?: Prisma.Decimal; // en la unidad base del insumo; si no, envases × contenido del envase
    monto: Prisma.Decimal; // lo pagado; con 0 no se crea gasto (insumo sin precio)
    descripcion?: string;
    nota?: string; // nota del movimiento de stock
    fecha?: Date;
    actualizarPrecio?: boolean; // con envases: el precio del envase pasa a monto / envases
  },
) {
  const { insumo, envases, monto, fecha } = datos;
  const comprado = datos.cantidad ?? insumo.contenidoEnvase.mul(envases ?? 0);
  if (envases && datos.actualizarPrecio && monto.gt(0)) {
    await tx.insumo.update({ where: { id: insumo.id }, data: { precioEnvase: monto.div(envases).toDecimalPlaces(4) } });
  }
  const detalle = envases ? `${envases.toString()} envase(s)` : `${comprado.toString()} ${insumo.unidadBase.toLowerCase()}`;
  // «No llevar stock» (D40): el gasto se guarda, pero el stock no se toca.
  const resultado = insumo.controlaStock
    ? await registrarMovimiento(tx, {
        insumoId: insumo.id,
        tipo: TipoMovimiento.COMPRA,
        cantidad: comprado,
        nota: datos.nota ?? `${detalle} por Bs ${monto.toFixed(2)}`,
      })
    : null;
  const gasto = monto.gt(0)
    ? await tx.gastoOperativo.create({
        data: {
          descripcion: datos.descripcion || `${insumo.nombre} · ${detalle}`,
          monto,
          categoria: CategoriaGasto.INSUMOS,
          fecha,
          insumoId: insumo.id,
          cantidad: comprado,
          movimientoId: resultado?.movimiento.id ?? null,
        },
        include: { insumo: { select: { nombre: true, unidadBase: true } } },
      })
    : null;
  return { gasto, movimiento: resultado?.movimiento ?? null, insumo: resultado?.insumo ?? insumo };
}

// Lo que costó una compra cargada sin monto (Insumos → Movimientos): al precio del envase.
export function montoDeCompra(insumo: Insumo, precioEnvase: Prisma.Decimal, envases?: Prisma.Decimal, cantidad?: Prisma.Decimal) {
  const monto = envases ? precioEnvase.mul(envases) : precioEnvase.div(insumo.contenidoEnvase).mul(cantidad ?? 0);
  return monto.toDecimalPlaces(2);
}
