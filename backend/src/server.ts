import { createApp } from "./app";
import { prisma } from "./prisma";
import { respaldarSiCorresponde } from "./services/backup";

const PUERTO = Number(process.env.PORT ?? 3001);
const UN_DIA = 24 * 3_600_000;

const server = createApp().listen(PUERTO, () => {
  console.log(`API Dulzura escuchando en http://localhost:${PUERTO}/api`);
});

// Respaldo automático: al arrancar (si el último tiene más de 20 h) y luego una vez al día.
const respaldoAutomatico = (): void => {
  respaldarSiCorresponde(prisma)
    .then((respaldo) => {
      if (respaldo) console.log(`Respaldo automático: ${respaldo.ruta}`);
    })
    .catch((error: unknown) => {
      console.error("No se pudo hacer el respaldo automático:", error instanceof Error ? error.message : error);
    });
};
if (process.env.BACKUP_AUTO !== "false") {
  respaldoAutomatico();
  setInterval(respaldoAutomatico, UN_DIA).unref();
}

const cerrar = (): void => {
  server.close(() => {
    prisma
      .$disconnect()
      .catch((error: unknown) => console.error("Error al desconectar la BD:", error))
      .finally(() => process.exit(0));
  });
};
process.on("SIGINT", cerrar);
process.on("SIGTERM", cerrar);
