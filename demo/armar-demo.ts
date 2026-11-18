// Demo en línea (D114): arma lo que publica Vercel (`npm run demo:armar`, lo corre Vercel al desplegar).
//  1. Una base de ejemplo nueva, database/prisma/demo.db: el catálogo del seed, los queques 2026 y los pedidos demo.
//     Nunca usa dulzura.db: en la demo no viaja ningún dato real del negocio.
//  2. El servidor compilado a JavaScript (backend/js), el mismo que lleva el instalador.
//  3. La pantalla compilada con VITE_DEMO=1 (entra sin PIN y muestra el aviso de demo).
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { compilarServidor, paso, RAIZ } from "../instalacion/armar-paquete";

const BASE = path.join(RAIZ, "database", "prisma", "demo.db");
const env = { ...process.env, DATABASE_URL: "file:./demo.db", CHECKPOINT_DISABLE: "1" };
const correr = (comando: string, extra: NodeJS.ProcessEnv = {}) =>
  execSync(comando, { cwd: RAIZ, stdio: "inherit", env: { ...env, ...extra } });

for (const sufijo of ["", "-journal"]) rmSync(BASE + sufijo, { force: true });

paso("Base de ejemplo");
// En Vercel el cliente de Prisma se genera para su Linux; en Windows ya está generado (y con el ERP prendido, bloqueado).
if (process.env.VERCEL) correr("npx prisma generate");
correr("npx prisma migrate deploy");
correr("npx tsx database/prisma/seed.ts");
correr("npx tsx database/prisma/cargar-queques-2026.ts");
correr("npx tsx database/prisma/demo-pedidos.ts");
correr("npx tsx demo/ajustar-base.ts");
if (!existsSync(BASE)) throw new Error("No se creó la base de la demo.");

paso("Servidor compilado");
compilarServidor(RAIZ);

paso("Pantalla en modo demo");
correr("npx vite build --config frontend/vite.config.ts", { VITE_DEMO: "1" });
console.log("\nDemo lista: database/prisma/demo.db + backend/js + frontend/dist");
