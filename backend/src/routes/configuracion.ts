import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { AppError } from "../errors";
import { decimalNoNegativo } from "../validacion";

// Ajustes del negocio que la dueña cambia desde el ERP (D103). Hoy: los gastos fijos del mes para el punto de
// equilibrio del Inicio (D77). Antes era un número de prueba escrito en el código (Bs 300); sigue siendo el valor inicial.

const CLAVE_GASTOS_FIJOS = "finanzas.gastosFijosMensuales";
const GASTOS_FIJOS_INICIALES = new Prisma.Decimal(300);

// Sin .refine() después del Decimal: correría aun con un valor inválido (ver validacion.ts). El tope va en la ruta.
const gastosFijosSchema = z.object({ gastosFijos: decimalNoNegativo });

async function leerGastosFijos(): Promise<Prisma.Decimal> {
  const fila = await prisma.configuracion.findUnique({ where: { clave: CLAVE_GASTOS_FIJOS } });
  if (!fila) return GASTOS_FIJOS_INICIALES;
  try {
    return new Prisma.Decimal(fila.valor);
  } catch {
    return GASTOS_FIJOS_INICIALES;
  }
}

export const configuracionRouter = Router();

configuracionRouter.get("/gastos-fijos", async (_req, res) => {
  res.json({ gastosFijos: await leerGastosFijos() });
});

configuracionRouter.put("/gastos-fijos", async (req, res) => {
  const { gastosFijos } = gastosFijosSchema.parse(req.body);
  if (gastosFijos.gt(1_000_000)) throw new AppError(400, "Revisa los gastos fijos: el monto parece demasiado grande.");
  const valor = gastosFijos.toDecimalPlaces(2);
  await prisma.configuracion.upsert({
    where: { clave: CLAVE_GASTOS_FIJOS },
    create: { clave: CLAVE_GASTOS_FIJOS, valor: valor.toString() },
    update: { valor: valor.toString() },
  });
  res.json({ gastosFijos: valor });
});
