// Último paso de la base de la demo (D114): WhatsApp apagado (no hay agente en línea) y sin PIN, respaldos
// por correo ni clave del agente, por si alguno quedara de un seed futuro.
import { prisma } from "../backend/src/prisma";

async function main() {
  if (!(process.env.DATABASE_URL ?? "").includes("demo.db")) throw new Error("Esto solo corre sobre demo.db.");
  await prisma.configuracion.deleteMany({
    where: { OR: [{ clave: { startsWith: "respaldo." } }, { clave: { startsWith: "seguridad." } }] },
  });
  await prisma.configuracion.upsert({
    where: { clave: "agente.whatsapp" },
    create: { clave: "agente.whatsapp", valor: "apagado" },
    update: { valor: "apagado" },
  });
  await prisma.$executeRawUnsafe("VACUUM");
  console.log("Base de la demo ajustada.");
}

main().finally(() => prisma.$disconnect());
