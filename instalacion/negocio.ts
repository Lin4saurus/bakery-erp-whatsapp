// Varias reposteras, un solo ERP (D126). Cada una tiene su base en database/prisma/datos/negocios/<id>/dulzura.db
// (privada: no va a GitHub) y sus respaldos en backups/<id>. Este comando elige con cuál trabaja el ERP de esta PC:
//   npm run negocio                 → cuál está en uso y cuáles hay
//   npm run negocio -- rainbow      → el ERP local pasa a usar la base de Rainbow (reinicia el ERP para que la tome)
// Para armar el instalador de una: npm run paquete -- --negocio rainbow (no hace falta elegirla antes).
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

export const RAIZ = path.resolve(__dirname, "..");
export const CARPETA_NEGOCIOS = path.join(RAIZ, "database", "prisma", "datos", "negocios");
const ENV = path.join(RAIZ, ".env");

export const baseDelNegocio = (id: string) => path.join(CARPETA_NEGOCIOS, id, "dulzura.db");
export const negocios = (): string[] =>
  existsSync(CARPETA_NEGOCIOS)
    ? readdirSync(CARPETA_NEGOCIOS, { withFileTypes: true })
        .filter((d) => d.isDirectory() && existsSync(baseDelNegocio(d.name)))
        .map((d) => d.name)
        .sort()
    : [];

// La URL relativa a la carpeta del schema (database/prisma), como la espera Prisma.
const urlDe = (id: string) => `file:./datos/negocios/${id}/dulzura.db`;

export async function nombreEnLaBase(id: string): Promise<string> {
  const db = new PrismaClient({ datasourceUrl: `file:${baseDelNegocio(id)}` });
  try {
    return (await db.configuracion.findUnique({ where: { clave: "negocio.nombre" } }))?.valor ?? "(sin nombre)";
  } finally {
    await db.$disconnect();
  }
}

// Cambia (o agrega) una línea CLAVE="valor" del .env sin tocar las demás.
function fijarEnEnv(texto: string, clave: string, valor: string): string {
  const linea = `${clave}="${valor}"`;
  const patron = new RegExp(`^${clave}=.*$`, "m");
  return patron.test(texto) ? texto.replace(patron, linea) : `${texto.trimEnd()}\n${linea}\n`;
}

async function main() {
  const lista = negocios();
  const env = existsSync(ENV) ? readFileSync(ENV, "utf8") : "";
  const actual = /negocios\/([^/]+)\/dulzura\.db/.exec(/^DATABASE_URL=.*$/m.exec(env)?.[0] ?? "")?.[1] ?? null;
  const elegido = process.argv[2];

  if (!elegido) {
    console.log(`En uso: ${actual ?? "ninguna de negocios/ (revisa DATABASE_URL en .env)"}`);
    for (const id of lista) console.log(`  ${id === actual ? "→" : " "} ${id}: ${await nombreEnLaBase(id)}`);
    console.log("\nPara cambiar: npm run negocio -- <nombre>");
    return;
  }
  if (!lista.includes(elegido)) {
    throw new Error(`No existe «${elegido}». Hay: ${lista.join(", ") || "ninguna"} (en ${CARPETA_NEGOCIOS}).`);
  }
  let texto = fijarEnEnv(env, "DATABASE_URL", urlDe(elegido));
  texto = fijarEnEnv(texto, "BACKUP_DIR", `backups/${elegido}`);
  writeFileSync(ENV, texto);
  console.log(`Listo: el ERP de esta PC usa la base de ${await nombreEnLaBase(elegido)} (${elegido}).`);
  console.log("Reinicia el ERP (npm run dev) para que la tome.");
}

if (require.main === module) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  });
}
