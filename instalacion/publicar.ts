// Publica una versión nueva del ERP en GitHub Releases (D112). La portátil de la repostera la ve en el Inicio
// («Hay una versión nueva») y se actualiza con un botón.
//   1. Sube la versión en package.json (ej. 1.0.0 → 1.0.1) y haz commit y push de los cambios.
//   2. npm run publicar -- --notas "Qué cambió, en palabras de la dueña"
// Arma en ../dulzura-entrega/version-<v>:
//   DulzuraERP_codigo_<v>.zip    → solo el código (unos MB): lo que baja la portátil si sus dependencias son las mismas
//   DulzuraERP_completo_<v>.zip  → con Node.js y dependencias: lo que baja si cambiaron
//   actualizacion.json           → versión, notas, huella de dependencias y sha256 de cada zip
// Ninguno lleva datos. Si está el comando `gh` (GitHub CLI), crea la Release; si no, dice qué subir por la web.

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { comprimir, huellaDependencias, mb, paso, prepararCarpeta, RAIZ, SALIDA, sha256, versionActual } from "./armar-paquete";

const REPO = "Lin4saurus/bakery-erp-whatsapp";

const git = (args: string[]) => execFileSync("git", args, { cwd: RAIZ, encoding: "utf8" }).trim();

function hayGh(): boolean {
  try {
    execFileSync("gh", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// Lo publicado tiene que ser lo que está en GitHub: sin cambios sin commit y con el push hecho.
function revisarGit(version: string): void {
  const pendientes = git(["status", "--porcelain"])
    .split("\n")
    .filter((l) => l.trim() !== "" && !l.includes(".claude/"));
  if (pendientes.length > 0) throw new Error(`Hay cambios sin commit:\n${pendientes.join("\n")}`);
  git(["fetch", "origin", "--quiet"]);
  const rama = git(["branch", "--show-current"]);
  if (git(["rev-parse", "HEAD"]) !== git(["rev-parse", `origin/${rama}`])) {
    throw new Error(`La rama ${rama} no está igual que en GitHub: haz push primero.`);
  }
  if (git(["tag", "--list", `v${version}`]) !== "") throw new Error(`La versión ${version} ya existe (tag v${version}): sube la versión en package.json.`);
}

async function main(): Promise<void> {
  const i = process.argv.indexOf("--notas");
  const notas = i >= 0 ? (process.argv[i + 1] ?? "").trim() : "";
  if (!notas) throw new Error('Faltan las notas: npm run publicar -- --notas "Qué cambió"');
  const version = versionActual();
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`La versión de package.json no es X.Y.Z: ${version}`);

  // --prueba: solo arma los paquetes (sin revisar git ni subir nada), para probar la actualización con
  // DULZURA_ACTUALIZACIONES apuntando a esa carpeta.
  const prueba = process.argv.includes("--prueba");
  if (!prueba) revisarGit(version);

  const destino = path.join(SALIDA, `version-${version}`);
  rmSync(destino, { recursive: true, force: true });
  mkdirSync(destino, { recursive: true });
  const carpeta = path.join(SALIDA, "_release", "DulzuraERP");

  paso("Paquete liviano (solo código)");
  await prepararCarpeta(carpeta, { dependencias: false, datos: false });
  const codigo = path.join(destino, `DulzuraERP_codigo_${version}.zip`);
  comprimir(carpeta, codigo);

  paso("Paquete completo (con Node.js y dependencias, sin datos)");
  await prepararCarpeta(carpeta, { dependencias: true, datos: false });
  const completo = path.join(destino, `DulzuraERP_completo_${version}.zip`);
  comprimir(carpeta, completo);
  rmSync(path.join(SALIDA, "_release"), { recursive: true, force: true });

  const pieza = (archivo: string) => ({ archivo: path.basename(archivo), sha256: sha256(archivo), bytes: statSync(archivo).size });
  const manifiesto = path.join(destino, "actualizacion.json");
  writeFileSync(
    manifiesto,
    JSON.stringify(
      {
        version,
        publicada: new Date().toISOString(),
        notas,
        huellaDependencias: huellaDependencias(),
        codigo: pieza(codigo),
        completo: pieza(completo),
      },
      null,
      2,
    ),
  );
  console.log(`\nArmado en ${destino}:`);
  for (const f of [codigo, completo, manifiesto]) console.log(`  ${path.basename(f)} (${mb(f)})`);

  const archivos = [manifiesto, codigo, completo];
  if (prueba) {
    console.log("\nModo prueba: no se subió nada.");
  } else if (hayGh()) {
    paso(`Creando la Release v${version} en GitHub`);
    const rama = git(["branch", "--show-current"]);
    execFileSync("gh", ["release", "create", `v${version}`, ...archivos, "--repo", REPO, "--target", rama, "--title", `Dulzura ERP ${version}`, "--notes", notas], {
      stdio: "inherit",
    });
    console.log(`\nPublicada. La portátil la verá en el Inicio en unas horas (o al tocar «Buscar actualización»).`);
  } else {
    console.log(`\nNo está el comando gh. Publícala a mano:`);
    console.log(`  1. Entra a https://github.com/${REPO}/releases/new`);
    console.log(`  2. Tag: v${version} (crear al publicar), título: Dulzura ERP ${version}, descripción: las notas`);
    console.log(`  3. Arrastra los 3 archivos de ${destino}`);
    console.log(`  4. «Publish release» (no la marques como pre-release: la portátil busca la última publicada)`);
  }
}

main().catch((error: unknown) => {
  console.error("No se pudo publicar:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
