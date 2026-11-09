// Respaldo manual: `npm run backup`.
// Carpeta: BACKUP_DIR (por defecto ./backups). Respaldos conservados: BACKUP_KEEP (por defecto 30).

import { prisma } from "./prisma";
import { carpetaRespaldos, crearRespaldo } from "./services/backup";

async function main(): Promise<void> {
  const respaldo = await crearRespaldo(prisma);
  console.log(`Respaldo creado: ${respaldo.ruta} (${(respaldo.bytes / 1024).toFixed(1)} KB)`);
  if (respaldo.eliminados.length > 0) {
    console.log(`Se borraron ${respaldo.eliminados.length} respaldo(s) antiguo(s) de ${carpetaRespaldos()}.`);
  }
}

main()
  .catch((error: unknown) => {
    const mensaje = error instanceof Error ? error.message : String(error);
    console.error(`Error en el respaldo: ${mensaje}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
