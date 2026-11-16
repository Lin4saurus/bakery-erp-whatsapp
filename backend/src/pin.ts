// `npm run pin`: si la dueña olvidó su PIN, se borra. Al abrir el ERP pedirá crear uno nuevo (D105).
// Solo se puede hacer desde esta PC, con acceso a la carpeta del ERP.

import { prisma } from "./prisma";
import { borrarPin } from "./services/sesion";

borrarPin()
  .then((habia) => {
    console.log(
      habia
        ? "PIN borrado. Abre el ERP (o recarga la página) y elige un PIN nuevo. Si el ERP estaba abierto, reinícialo."
        : "No había PIN guardado: al abrir el ERP te pedirá crear uno.",
    );
  })
  .catch((error: unknown) => {
    console.error(`No se pudo borrar el PIN: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
