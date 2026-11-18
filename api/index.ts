// Demo en línea en Vercel (D114): toda /api/* llega aquí (ver vercel.json) y la atiende el mismo Express del ERP.
// Vercel no guarda archivos: cada servidor copia la base de ejemplo a su carpeta temporal al arrancar, y lo que
// se registre vive ahí hasta que Vercel apague ese servidor (entonces vuelve la base de ejemplo).
import { copyFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const base = path.join(tmpdir(), "dulzura-demo.db");
if (!existsSync(base)) copyFileSync(path.join(__dirname, "..", "database", "prisma", "demo.db"), base);

// Antes de cargar el ERP: Prisma lee DATABASE_URL al crearse. Hora de Bolivia (Vercel corre en UTC).
process.env.DATABASE_URL = `file:${base.replace(/\\/g, "/")}`;
process.env.DULZURA_DEMO = "1";
process.env.BACKUP_AUTO = "false";
process.env.BACKUP_DIR = path.join(tmpdir(), "dulzura-respaldos");
process.env.TZ = "America/La_Paz";

// El servidor compilado por `npm run demo:armar` (backend/js); require después de fijar las variables.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createApp } = require("../backend/js/app.js") as typeof import("../backend/src/app");

export default createApp();
