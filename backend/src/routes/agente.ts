import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";

// Configuración del agente de WhatsApp que vive en el ERP (N4, D101). Hoy: el modo prueba, una lista de números a los
// que el agente atiende; vacía = atiende a todos. n8n la lee en cada mensaje y el Inicio avisa mientras esté activa.

const CLAVE_NUMEROS_PRUEBA = "agente.numerosPrueba";

const soloDigitos = (t: string) => t.replace(/\D/g, "");
const configSchema = z.object({
  numerosPrueba: z
    .array(
      z
        .string()
        .trim()
        .transform(soloDigitos)
        .refine((t) => t.length >= 7 && t.length <= 15, "Cada número debe tener entre 7 y 15 dígitos."),
    )
    .max(20, "Máximo 20 números de prueba."),
});

export async function leerNumerosPrueba(): Promise<string[]> {
  const fila = await prisma.configuracion.findUnique({ where: { clave: CLAVE_NUMEROS_PRUEBA } });
  if (!fila) return [];
  try {
    const valor: unknown = JSON.parse(fila.valor);
    return Array.isArray(valor) ? valor.filter((n): n is string => typeof n === "string") : [];
  } catch {
    return [];
  }
}

export const agenteRouter = Router();

agenteRouter.get("/config", async (_req, res) => {
  res.json({ numerosPrueba: await leerNumerosPrueba() });
});

agenteRouter.put("/config", async (req, res) => {
  const { numerosPrueba } = configSchema.parse(req.body);
  const unicos = [...new Set(numerosPrueba)];
  await prisma.configuracion.upsert({
    where: { clave: CLAVE_NUMEROS_PRUEBA },
    create: { clave: CLAVE_NUMEROS_PRUEBA, valor: JSON.stringify(unicos) },
    update: { valor: JSON.stringify(unicos) },
  });
  res.json({ numerosPrueba: unicos });
});
