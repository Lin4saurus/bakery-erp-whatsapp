import { Router } from "express";
import { z } from "zod";
import { CategoriaInsumo, Prisma, TipoMovimiento, UnidadMedida, type Insumo } from "@prisma/client";
import { prisma } from "../prisma";
import { AppError } from "../errors";
import { costoUnitarioInsumo } from "../services/costeo";
import { montoDeCompra, registrarCompra } from "../services/compras";
import { alertaDe, registrarMovimiento, type AlertaStock } from "../services/inventario";
import { alMenosUnCampo, decimalDistintoDeCero, decimalNoNegativo, decimalPositivo, nombre, parseId } from "../validacion";

const insumoSchema = z.object({
  nombre,
  categoria: z.nativeEnum(CategoriaInsumo).optional(),
  unidadBase: z.nativeEnum(UnidadMedida),
  contenidoEnvase: decimalPositivo,
  precioEnvase: decimalNoNegativo,
  stockActual: decimalNoNegativo.optional(),
  stockMinimo: decimalNoNegativo.optional(),
  controlaStock: z.boolean().optional(),
  activo: z.boolean().optional(),
});

const actualizarSchema = insumoSchema.partial().refine(alMenosUnCampo, "Envía al menos un campo para actualizar.");

// COMPRA: se indica la cantidad en unidad base o el número de envases; si cambió el precio, se actualiza.
// AJUSTE: `stockReal` (lo contado; el servidor calcula la diferencia) o `cantidad` con signo (ej. −200 por merma).
const movimientoSchema = z
  .discriminatedUnion("tipo", [
    z.object({
      tipo: z.literal(TipoMovimiento.COMPRA),
      cantidad: decimalPositivo.optional(),
      envases: decimalPositivo.optional(),
      precioEnvase: decimalNoNegativo.optional(),
      nota: z.string().trim().max(200).optional(),
    }),
    z.object({
      tipo: z.literal(TipoMovimiento.AJUSTE),
      cantidad: decimalDistintoDeCero.optional(),
      stockReal: decimalNoNegativo.optional(),
      nota: z.string().trim().min(1, "Explica el motivo del ajuste.").max(200),
    }),
  ])
  .superRefine((m, ctx) => {
    if (m.tipo === TipoMovimiento.COMPRA && (m.cantidad === undefined) === (m.envases === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Indica la cantidad o el número de envases (solo uno de los dos).",
        path: ["cantidad"],
      });
    }
    if (m.tipo === TipoMovimiento.AJUSTE && (m.cantidad === undefined) === (m.stockReal === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Indica el stock real o la cantidad a sumar/restar (solo uno de los dos).",
        path: ["stockReal"],
      });
    }
  });

const conCosto = (insumo: Insumo) => ({ ...insumo, costoUnitario: costoUnitarioInsumo(insumo) });

async function buscarInsumo(id: number): Promise<Insumo> {
  const insumo = await prisma.insumo.findUnique({ where: { id } });
  if (!insumo) throw new AppError(404, `No existe el insumo ${id}.`);
  return insumo;
}

export const insumosRouter = Router();

insumosRouter.get("/", async (_req, res) => {
  const insumos = await prisma.insumo.findMany({ orderBy: { nombre: "asc" } });
  res.json(insumos.map(conCosto));
});

// Insumos sin stock o por debajo del mínimo (para el dashboard).
insumosRouter.get("/alertas", async (_req, res) => {
  const insumos = await prisma.insumo.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } });
  res.json(insumos.map(alertaDe).filter((alerta): alerta is AlertaStock => alerta !== null));
});

insumosRouter.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const insumo = await buscarInsumo(id);
  const usos = await prisma.ingredienteReceta.findMany({
    where: { insumoId: id },
    select: { cantidad: true, producto: { select: { id: true, nombre: true } } },
  });
  res.json({ ...conCosto(insumo), usadoEn: usos.map(({ cantidad, producto }) => ({ ...producto, cantidad })) });
});

insumosRouter.post("/", async (req, res) => {
  const datos = insumoSchema.parse(req.body);
  const insumo = await prisma.insumo.create({ data: datos });
  res.status(201).json(conCosto(insumo));
});

insumosRouter.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const datos = actualizarSchema.parse(req.body);
  await buscarInsumo(id);
  const insumo = await prisma.insumo.update({ where: { id }, data: datos });
  res.json(conCosto(insumo));
});

// ---------- Stock ----------

insumosRouter.get("/:id/movimientos", async (req, res) => {
  const id = parseId(req.params.id);
  await buscarInsumo(id);
  const movimientos = await prisma.movimientoInventario.findMany({
    where: { insumoId: id },
    orderBy: { id: "desc" },
    take: 200,
  });
  res.json(movimientos);
});

insumosRouter.post("/:id/movimientos", async (req, res) => {
  const id = parseId(req.params.id);
  const datos = movimientoSchema.parse(req.body);
  const insumo = await buscarInsumo(id);
  if (!insumo.controlaStock) {
    throw new AppError(422, `«${insumo.nombre}» está marcado como «No llevar stock»: no se actualiza su stock.`);
  }

  const resultado = await prisma.$transaction(async (tx) => {
    if (datos.tipo === TipoMovimiento.COMPRA) {
      if (datos.precioEnvase !== undefined) {
        await tx.insumo.update({ where: { id }, data: { precioEnvase: datos.precioEnvase } });
      }
      // La compra también queda en Gastos («Compra de insumos»), al precio del envase: así las compras
      // cargadas aquí o en Gastos quedan iguales (D51). Con precio 0 solo entra al stock.
      const compra = await registrarCompra(tx, {
        insumo,
        envases: datos.envases,
        cantidad: datos.cantidad,
        monto: montoDeCompra(insumo, datos.precioEnvase ?? insumo.precioEnvase, datos.envases, datos.cantidad),
        nota: datos.nota ?? (datos.envases ? `${datos.envases.toString()} envase(s)` : undefined),
      });
      if (!compra.movimiento) throw new AppError(500, "No se registró el movimiento de la compra.");
      return { movimiento: compra.movimiento, insumo: compra.insumo, gasto: compra.gasto };
    }
    const cantidad =
      datos.stockReal !== undefined ? datos.stockReal.sub(insumo.stockActual) : (datos.cantidad ?? new Prisma.Decimal(0));
    if (cantidad.isZero()) throw new AppError(422, "El stock real es igual al actual: no hay nada que actualizar.");
    return {
      ...(await registrarMovimiento(tx, { insumoId: id, tipo: TipoMovimiento.AJUSTE, cantidad, nota: datos.nota })),
      gasto: null,
    };
  });

  res.status(201).json({
    movimiento: resultado.movimiento,
    insumo: conCosto(resultado.insumo),
    alerta: alertaDe(resultado.insumo),
    gasto: resultado.gasto, // la compra que quedó en Gastos (null en un ajuste o con precio 0)
  });
});

insumosRouter.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const insumo = await buscarInsumo(id);
  const [usos, movimientos] = await Promise.all([
    prisma.ingredienteReceta.findMany({
      where: { insumoId: id },
      select: { producto: { select: { nombre: true } } },
    }),
    prisma.movimientoInventario.count({ where: { insumoId: id } }),
  ]);
  if (movimientos > 0) {
    throw new AppError(409, `"${insumo.nombre}" tiene movimientos de stock registrados. Márcalo como inactivo.`);
  }
  if (usos.length > 0) {
    const productos = usos.map((uso) => uso.producto.nombre).join(", ");
    throw new AppError(
      409,
      `No se puede borrar "${insumo.nombre}": se usa en ${productos}. Quítalo de esas recetas o márcalo como inactivo.`,
    );
  }
  await prisma.insumo.delete({ where: { id } });
  res.status(204).end();
});
