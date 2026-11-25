import type { RequestHandler } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { CLAVE_NOMBRE, nombreDelNegocio } from "../services/negocio";

// Nombre del negocio (D117). Leerlo no pide sesión (la pantalla del PIN lo muestra); cambiarlo, sí (ver app.ts).

const nombreSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(2, "Escribe el nombre del negocio (al menos 2 letras).")
    .max(60, "El nombre puede tener hasta 60 letras."),
});

export const leerNegocio: RequestHandler = async (_req, res) => {
  res.json({ nombre: await nombreDelNegocio() });
};

export const guardarNegocio: RequestHandler = async (req, res) => {
  const { nombre } = nombreSchema.parse(req.body);
  await prisma.configuracion.upsert({
    where: { clave: CLAVE_NOMBRE },
    create: { clave: CLAVE_NOMBRE, valor: nombre },
    update: { valor: nombre },
  });
  res.json({ nombre });
};
