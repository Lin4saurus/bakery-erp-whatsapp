import { Router } from "express";
import { z } from "zod";
import { CategoriaGasto, Prisma, TipoMovimiento } from "@prisma/client";
import { prisma } from "../prisma";
import { AppError } from "../errors";
import { registrarCompra } from "../services/compras";
import { registrarMovimiento } from "../services/inventario";
import { decimalPositivo } from "../validacion";

const fechaDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD.");

// Compra de insumos (D51): se indica el insumo y cuánto se compró, en envases o en su unidad base (solo uno).
// La descripción es opcional: si falta, se arma con el insumo y la cantidad.
const gastoSchema = z
  .object({
    descripcion: z.string().trim().max(120, "Máximo 120 caracteres.").default(""),
    monto: decimalPositivo,
    categoria: z.nativeEnum(CategoriaGasto),
    fecha: fechaDia.optional(), // por defecto, ahora; sirve para cargar una compra de otro día
    insumoId: z.number().int().positive().optional(),
    envases: decimalPositivo.optional(),
    cantidad: decimalPositivo.optional(), // en la unidad base del insumo (g, ml, u)
    actualizarPrecio: z.boolean().default(true), // con envases: el precio del envase pasa a monto / envases
  })
  .superRefine((g, ctx) => {
    const problema = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (g.categoria === CategoriaGasto.INSUMOS) {
      if (!g.insumoId) problema("insumoId", "Elige qué insumo compraste.");
      if ((g.envases === undefined) === (g.cantidad === undefined)) {
        problema("envases", "Indica cuántos envases o la cantidad (solo uno de los dos).");
      }
    } else {
      if (!g.descripcion) problema("descripcion", "Es obligatorio.");
      if (g.insumoId || g.envases || g.cantidad) problema("insumoId", "El insumo solo se indica en «Compra de insumos».");
    }
  });
const filtrosSchema = z.object({ desde: fechaDia.optional(), hasta: fechaDia.optional() });
const idSchema = z.string().uuid("Debe ser un id válido.");

const conInsumo = { insumo: { select: { nombre: true, unidadBase: true } } } as const;

export const gastosRouter = Router();

gastosRouter.post("/", async (req, res) => {
  const { fecha, insumoId, envases, cantidad, actualizarPrecio, ...datos } = gastoSchema.parse(req.body);
  // Un día pasado se guarda al mediodía (hora local) para que no cambie de día por la zona horaria.
  const fechaGuardada = fecha ? new Date(`${fecha}T12:00:00`) : undefined;

  if (datos.categoria !== CategoriaGasto.INSUMOS) {
    const gasto = await prisma.gastoOperativo.create({ data: { ...datos, fecha: fechaGuardada }, include: conInsumo });
    res.status(201).json(gasto);
    return;
  }

  // Compra de insumo: el gasto y la entrada al stock se guardan juntos o ninguno.
  const gasto = await prisma.$transaction(async (tx) => {
    const insumo = await tx.insumo.findUnique({ where: { id: insumoId } });
    if (!insumo) throw new AppError(404, `No existe el insumo ${insumoId}.`);
    if (!insumo.activo) throw new AppError(422, `"${insumo.nombre}" está inactivo.`);
    if (!insumo.controlaStock) {
      throw new AppError(422, `"${insumo.nombre}" no se compra (no lleva stock). Si es limpieza, cárgalo en la categoría Limpieza.`);
    }
    const { gasto: compra } = await registrarCompra(tx, {
      insumo,
      envases,
      cantidad,
      monto: datos.monto,
      descripcion: datos.descripcion,
      fecha: fechaGuardada,
      actualizarPrecio,
    });
    return compra;
  });
  res.status(201).json(gasto);
});

// Gastos del período (días en hora local, ambos inclusive), del más nuevo al más viejo, con totales.
// `total` es todo lo que salió; `totalOperativo` deja fuera la compra de insumos, que ya se descuenta
// como costo de producción al vender: es el que se resta de la ganancia para la utilidad neta (D51).
gastosRouter.get("/", async (req, res) => {
  const { desde, hasta } = filtrosSchema.parse(req.query);
  const fecha: Prisma.DateTimeFilter = {};
  if (desde) fecha.gte = new Date(`${desde}T00:00:00`);
  if (hasta) fecha.lte = new Date(`${hasta}T23:59:59.999`);

  const gastos = await prisma.gastoOperativo.findMany({ where: { fecha }, include: conInsumo, orderBy: { fecha: "desc" } });
  const cero = new Prisma.Decimal(0);
  const porCategoria = Object.fromEntries(Object.values(CategoriaGasto).map((c) => [c, cero])) as Record<
    CategoriaGasto,
    Prisma.Decimal
  >;
  for (const g of gastos) porCategoria[g.categoria] = porCategoria[g.categoria].add(g.monto);
  const total = gastos.reduce((suma, g) => suma.add(g.monto), cero);
  const totalOperativo = total.sub(porCategoria[CategoriaGasto.INSUMOS]);

  res.json({ total, totalOperativo, porCategoria, gastos });
});

// Para corregir un gasto mal cargado: se borra y se vuelve a cargar. Si era una compra de insumo,
// se descuenta del stock lo que había sumado (movimiento AJUSTE).
gastosRouter.delete("/:id", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  await prisma.$transaction(async (tx) => {
    const gasto = await tx.gastoOperativo.findUnique({ where: { id }, include: { movimiento: true, insumo: true } });
    if (!gasto) throw new AppError(404, `No existe el gasto ${id}.`);
    if (gasto.movimiento && gasto.insumo) {
      await registrarMovimiento(tx, {
        insumoId: gasto.insumo.id,
        tipo: TipoMovimiento.AJUSTE,
        cantidad: gasto.movimiento.cantidad.neg(),
        nota: `Compra borrada en Gastos: ${gasto.descripcion}`,
      });
    }
    await tx.gastoOperativo.delete({ where: { id } });
  });
  res.status(204).end();
});
