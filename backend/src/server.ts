import type { Server } from "node:http";
import { createApp } from "./app";
import { prisma } from "./prisma";
import { respaldarSiCorresponde } from "./services/backup";

const PUERTO = Number(process.env.PORT ?? 3001);
// Solo esta PC (S2, AUDITORIA.md): la API no pide clave, así que no se abre a la red del local. n8n en Docker llega
// igual por host.docker.internal. Escucha en 127.0.0.1 y en ::1: en Windows «localhost» prueba primero ::1 y, si ahí no
// hay nadie, cada pedido perdía ~200 ms. HOST=0.0.0.0 la abre a la red (solo si hace falta y con el firewall de Windows).
const HOSTS = process.env.HOST ? [process.env.HOST] : ["127.0.0.1", "::1"];
const UN_DIA = 24 * 3_600_000;

const app = createApp();
const servidores: Server[] = HOSTS.map((host, i) => {
  const servidor = app.listen(PUERTO, host, () => {
    if (i === 0) console.log(`API Dulzura escuchando en http://localhost:${PUERTO}/api (${HOSTS.join(" y ")})`);
  });
  // Una PC sin IPv6 no tiene ::1: basta con 127.0.0.1.
  if (i > 0) servidor.on("error", (error) => console.warn(`No se pudo escuchar en ${host}: ${error.message}`));
  return servidor;
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
  Promise.all(servidores.map((s) => new Promise<void>((listo) => s.close(() => listo()))))
    .then(() => prisma.$disconnect())
    .catch((error: unknown) => console.error("Error al desconectar la BD:", error))
    .finally(() => process.exit(0));
};
process.on("SIGINT", cerrar);
process.on("SIGTERM", cerrar);
