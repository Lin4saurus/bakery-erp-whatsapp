import { Router } from "express";
import { z } from "zod";
import { CategoriaGasto, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { AppError } from "../errors";
import { decimalPositivo } from "../validacion";

const fechaDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD.");

const gastoSchema = z.object({
  descripcion: z.string().trim().min(1, "Es obligatorio.").max(120, "Máximo 120 caracteres."),
  monto: decimalPositivo,
  categoria: z.nativeEnum(CategoriaGasto),
  fecha: fechaDia.optional(), // por defecto, ahora; sirve para cargar una compra de otro día
});
const filtrosSchema = z.object({ desde: fechaDia.optional(), hasta: fechaDia.optional() });
const idSchema = z.string().uuid("Debe ser un id válido.");

export const gastosRouter = Router();

gastosRouter.post("/", async (req, res) => {
  const { fecha, ...datos } = gastoSchema.parse(req.body);
  // Un día pasado se guarda al mediodía (hora local) para que no cambie de día por la zona horaria.
  const gasto = await prisma.gastoOperativo.create({
    data: { ...datos, fecha: fecha ? new Date(`${fecha}T12:00:00`) : undefined },
  });
  res.status(201).json(gasto);
});

// Gastos del período (días en hora local, ambos inclusive), del más nuevo al más viejo, con totales.
gastosRouter.get("/", async (req, res) => {
  const { desde, hasta } = filtrosSchema.parse(req.query);
  const fecha: Prisma.DateTimeFilter = {};
  if (desde) fecha.gte = new Date(`${desde}T00:00:00`);
  if (hasta) fecha.lte = new Date(`${hasta}T23:59:59.999`);

  const gastos = await prisma.gastoOperativo.findMany({ where: { fecha }, orderBy: { fecha: "desc" } });
  const cero = new Prisma.Decimal(0);
  const porCategoria = Object.fromEntries(Object.values(CategoriaGasto).map((c) => [c, cero])) as Record<
    CategoriaGasto,
    Prisma.Decimal
  >;
  for (const g of gastos) porCategoria[g.categoria] = porCategoria[g.categoria].add(g.monto);
  const total = gastos.reduce((suma, g) => suma.add(g.monto), cero);

  res.json({ total, porCategoria, gastos });
});

// Para corregir un gasto mal cargado: se borra y se vuelve a cargar.
gastosRouter.delete("/:id", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const { count } = await prisma.gastoOperativo.deleteMany({ where: { id } });
  if (count === 0) throw new AppError(404, `No existe el gasto ${id}.`);
  res.status(204).end();
});
