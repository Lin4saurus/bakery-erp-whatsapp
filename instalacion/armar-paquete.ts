// Arma el instalador del ERP para la portátil de la repostera (D108, D110) y las piezas que usa publicar.ts (D112).
//   npm run paquete -- --negocio rainbow → instalador de la primera vez para esa repostera, con una copia de SU base
//                                          (database/prisma/datos/negocios/rainbow; sin PIN, demos ni WhatsApp; D126)
//   npm run paquete -- --sin-datos       → el mismo instalador sin base (no pisa la de ella si ya existe)
// Sale en ../dulzura-entrega (fuera del repo: la base tiene datos reales y no se sube a GitHub):
//   DulzuraERP_Instalador_<versión>_<Negocio>.exe → lo que se le manda: doble clic, copia a C:\DulzuraERP e instala
//   DulzuraERP_<versión>.zip             → lo mismo sin el .exe, por si el antivirus no deja pasar el .exe
// El paquete trae su propio Node.js (el de esta PC), las dependencias ya instaladas y las pantallas compiladas:
// en la portátil no hace falta instalar nada ni tener internet. Después se actualiza solo desde GitHub (D112).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { buildSync } from "esbuild";
import { baseDelNegocio, negocios, nombreEnLaBase } from "./negocio";

export const RAIZ = path.resolve(__dirname, "..");
export const SALIDA = path.resolve(RAIZ, "..", "dulzura-entrega");
// La base que se copia al instalador: la del negocio elegido con --negocio (D126).
let BASE = "";
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

export const paso = (texto: string) => console.log(`\n» ${texto}`);
const correr = (programa: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env) =>
  execFileSync(programa, args, { cwd, stdio: "inherit", env, shell: programa.endsWith(".cmd") });

export const versionActual = (): string => (JSON.parse(readFileSync(path.join(RAIZ, "package.json"), "utf8")) as { version: string }).version;

// Huella de lo que no viaja en una actualización liviana: las dependencias (package-lock.json) y Node.js.
// Si la de la portátil es igual, alcanza con el código; si no, va el paquete completo (D112).
export const huellaDependencias = (): string =>
  createHash("sha256")
    .update(readFileSync(path.join(RAIZ, "package-lock.json")))
    .update(`node ${process.version} ${process.arch}`)
    .digest("hex");

async function copiarBase(destino: string): Promise<void> {
  // VACUUM INTO: copia consistente aunque el ERP esté prendido y escribiendo.
  const origen = new PrismaClient({ datasources: { db: { url: `file:${BASE}` } } });
  try {
    await origen.$executeRawUnsafe(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
  } finally {
    await origen.$disconnect();
  }
  // Sobre la copia: primero el borrado de `npm run demo:pedidos:borrar` (también su venta y su stock) y después
  // limpiar-copia.ts (clientes de prueba, PIN, WhatsApp apagado, correo y revisión de integridad).
  const tsx = path.join(RAIZ, "node_modules", "tsx", "dist", "cli.mjs");
  const env = { ...process.env, DATABASE_URL: `file:${destino}`, BACKUP_AUTO: "false" };
  correr(process.execPath, [tsx, path.join(RAIZ, "database", "prisma", "demo-pedidos.ts"), "--borrar"], RAIZ, env);
  correr(process.execPath, [tsx, path.join(RAIZ, "instalacion", "limpiar-copia.ts")], RAIZ, env);
}

// El servidor va compilado a JavaScript en backend/js (D113): la portátil lo arranca con node directo, sin que tsx
// traduzca el TypeScript cada vez (al encender la PC eso tardaba varios segundos). Misma profundidad de carpetas que
// backend/src, para que las rutas con __dirname («../../..») sigan apuntando a la raíz. esbuild llega con tsx.
export function compilarServidor(carpeta: string): void {
  const origen = path.join(carpeta, "backend", "src");
  const archivos: string[] = [];
  const recorrer = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) recorrer(ruta);
      else if (ruta.endsWith(".ts")) archivos.push(ruta);
    }
  };
  recorrer(origen);
  buildSync({
    entryPoints: archivos,
    outdir: path.join(carpeta, "backend", "js"),
    outbase: origen,
    platform: "node",
    format: "cjs",
    target: `node${process.versions.node.split(".")[0]}`,
    logLevel: "warning",
  });
  if (!existsSync(path.join(carpeta, "backend", "js", "server.js"))) throw new Error("No se compiló el servidor.");
}

let pantallasCompiladas = false;

// Arma la carpeta del ERP en `carpeta`. Con `dependencias`: node_modules de producción y su propio node.exe.
// Con `datos`: una copia limpia de la base.
export async function prepararCarpeta(carpeta: string, { dependencias, datos }: { dependencias: boolean; datos: boolean }) {
  if (!carpeta.startsWith(SALIDA)) throw new Error(`La carpeta del paquete tiene que estar en ${SALIDA}.`);
  rmSync(carpeta, { recursive: true, force: true });
  mkdirSync(carpeta, { recursive: true });

  paso("Copiando el código");
  // Lo que está en git o es nuevo y no está ignorado: nunca .env, *.db, respaldos ni database/prisma/datos.
  const archivos = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: RAIZ, encoding: "utf8" })
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => f !== "" && !f.startsWith(".claude/") && existsSync(path.join(RAIZ, f)));
  for (const f of archivos) {
    const destino = path.join(carpeta, f);
    mkdirSync(path.dirname(destino), { recursive: true });
    copyFileSync(path.join(RAIZ, f), destino);
  }
  // Las instrucciones también a la vista, apenas se abre la carpeta.
  copyFileSync(path.join(RAIZ, "instalacion", "LEEME.txt"), path.join(carpeta, "LEEME - como instalar.txt"));
  writeFileSync(
    path.join(carpeta, "dependencias.json"),
    JSON.stringify({ version: versionActual(), huella: huellaDependencias(), node: process.version }, null, 2),
  );

  if (!pantallasCompiladas) {
    paso("Compilando las pantallas");
    correr(NPM, ["run", "--silent", "web:build"], RAIZ);
    pantallasCompiladas = true;
  }
  cpSync(path.join(RAIZ, "frontend", "dist"), path.join(carpeta, "frontend", "dist"), { recursive: true });
  paso("Compilando el servidor");
  compilarServidor(carpeta);

  if (dependencias) {
    paso("Instalando las dependencias del servidor (sin las de desarrollo)");
    correr(NPM, ["ci", "--omit=dev", "--no-audit", "--no-fund", "--loglevel=error"], carpeta);
    // Prisma anota dónde está el .env solo si existe al generar; sin eso el ERP no encuentra DATABASE_URL.
    // Se genera con un .env de ejemplo y se saca después: el .env de verdad lo crea instalar.bat (y no se pisa al actualizar).
    copyFileSync(path.join(carpeta, ".env.example"), path.join(carpeta, ".env"));
    correr(process.execPath, [path.join(carpeta, "node_modules", "prisma", "build", "index.js"), "generate"], carpeta);
    rmSync(path.join(carpeta, ".env"));
    const cliente = readFileSync(path.join(carpeta, "node_modules", ".prisma", "client", "index.js"), "utf8");
    if (!cliente.includes('"schemaEnvPath": "../../../.env"')) throw new Error("El cliente de Prisma no quedó apuntando al .env.");

    paso(`Copiando Node.js ${process.version} (${process.arch})`);
    if (Number(process.versions.node.split(".")[0]) < 20) throw new Error("Hace falta Node.js 20 o más nuevo en esta PC.");
    mkdirSync(path.join(carpeta, "node"), { recursive: true });
    copyFileSync(process.execPath, path.join(carpeta, "node", "node.exe"));
  }

  if (datos) {
    paso("Copiando la base de datos (sin PIN, demos, WhatsApp ni correo)");
    await copiarBase(path.join(carpeta, "database", "prisma", "dulzura.db"));
  }
}

// Comprime `carpeta` (que se llama DulzuraERP) en `zip`, con la carpeta adentro.
export function comprimir(carpeta: string, zip: string): void {
  rmSync(zip, { force: true });
  execFileSync("tar", ["-a", "-c", "-f", zip, "-C", path.dirname(carpeta), path.basename(carpeta)], { stdio: "inherit" });
}

export const sha256 = (archivo: string): string => createHash("sha256").update(readFileSync(archivo)).digest("hex");
export const mb = (ruta: string) => `${(statSync(ruta).size / 1024 / 1024).toFixed(1)} MB`;

// IExpress (viene con Windows) arma un .exe que se descomprime en una carpeta temporal y corre instalar-exe.cmd.
// IExpress no guarda carpetas, por eso va el .zip entero adentro y el .cmd lo descomprime en C:\.
function armarExe(zip: string, exe: string): void {
  const temporal = path.join(SALIDA, "_exe");
  rmSync(temporal, { recursive: true, force: true });
  mkdirSync(temporal, { recursive: true });
  copyFileSync(zip, path.join(temporal, "DulzuraERP.zip"));
  copyFileSync(path.join(RAIZ, "instalacion", "instalar-exe.cmd"), path.join(temporal, "instalar-exe.cmd"));
  const sed = path.join(temporal, "instalador.sed");
  writeFileSync(
    sed,
    [
      "[Version]",
      "Class=IEXPRESS",
      "SEDVersion=3",
      "[Options]",
      "PackagePurpose=InstallApp",
      "ShowInstallProgramWindow=0",
      "HideExtractAnimation=0",
      "UseLongFileName=1",
      "InsideCompressed=0",
      "CAB_FixedSize=0",
      "CAB_ResvCodeSigning=0",
      "RebootMode=N",
      "InstallPrompt=%InstallPrompt%",
      "DisplayLicense=%DisplayLicense%",
      "FinishMessage=%FinishMessage%",
      "TargetName=%TargetName%",
      "FriendlyName=%FriendlyName%",
      "AppLaunched=%AppLaunched%",
      "PostInstallCmd=%PostInstallCmd%",
      "AdminQuietInstCmd=%AdminQuietInstCmd%",
      "UserQuietInstCmd=%UserQuietInstCmd%",
      "SourceFiles=SourceFiles",
      "[Strings]",
      "InstallPrompt=",
      "DisplayLicense=",
      "FinishMessage=",
      `TargetName=${exe}`,
      "FriendlyName=Dulzura ERP",
      "AppLaunched=cmd /c instalar-exe.cmd",
      "PostInstallCmd=<None>",
      "AdminQuietInstCmd=",
      "UserQuietInstCmd=",
      'FILE0="DulzuraERP.zip"',
      'FILE1="instalar-exe.cmd"',
      "[SourceFiles]",
      `SourceFiles0=${temporal}\\`,
      "[SourceFiles0]",
      "%FILE0%=",
      "%FILE1%=",
      "",
    ].join("\r\n"),
  );
  rmSync(exe, { force: true });
  try {
    execFileSync(path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "iexpress.exe"), ["/N", "/Q", sed], { stdio: "inherit" });
  } catch {
    // iexpress a veces devuelve un código distinto de 0 aunque haya armado el .exe: se revisa abajo.
  }
  if (!existsSync(exe)) throw new Error("IExpress no armó el .exe.");
  rmSync(temporal, { recursive: true, force: true });
}

async function main(): Promise<void> {
  if (SALIDA.includes(" ")) throw new Error(`La carpeta de salida no puede tener espacios (IExpress): ${SALIDA}`);
  const conDatos = !process.argv.includes("--sin-datos");
  // Varias reposteras (D126): cada instalador lleva la base de una sola.
  const negocio = process.argv[process.argv.indexOf("--negocio") + 1];
  if (conDatos) {
    const hay = negocios();
    if (!process.argv.includes("--negocio") || !negocio || !hay.includes(negocio)) {
      throw new Error(`Di de qué repostera es: npm run paquete -- --negocio <${hay.join(" | ")}> (o --sin-datos).`);
    }
    BASE = baseDelNegocio(negocio);
  }
  const carpeta = path.join(SALIDA, "DulzuraERP");
  await prepararCarpeta(carpeta, { dependencias: true, datos: conDatos });

  paso("Comprimiendo");
  const etiqueta = conDatos ? (negocio as string).charAt(0).toUpperCase() + (negocio as string).slice(1) : "sin-datos";
  const sufijo = `${versionActual()}_${etiqueta}`;
  const zip = path.join(SALIDA, `DulzuraERP_${sufijo}.zip`);
  comprimir(carpeta, zip);
  rmSync(carpeta, { recursive: true, force: true });

  paso("Armando el .exe");
  const exe = path.join(SALIDA, `DulzuraERP_Instalador_${sufijo}.exe`);
  armarExe(zip, exe);

  console.log(`\nListo, versión ${versionActual()} (${conDatos ? `con la base de ${await nombreEnLaBase(negocio as string)}` : "sin datos"}):`);
  console.log(`  ${exe} (${mb(exe)})`);
  console.log(`  ${zip} (${mb(zip)})`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error("No se pudo armar el paquete:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
