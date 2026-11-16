// Actualización desde GitHub (D112). La portátil de la repostera busca la última Release del repositorio; si trae una
// versión más nueva, el Inicio lo avisa y un botón la instala:
//   1. baja el zip (solo el código si sus dependencias son las mismas, el completo si cambiaron) y revisa su sha256;
//   2. hace un respaldo y descomprime la versión nueva en actualizaciones/nueva;
//   3. lanza instalacion/aplicar-actualizacion.bat (copiado fuera de la carpeta que se va a reemplazar) y se cierra;
//   4. el .bat espera que el servidor termine, copia los archivos (sin tocar la base, el .env ni los respaldos),
//      aplica las migraciones y vuelve a prender el ERP.
// Solo funciona en una instalación hecha con el instalador (tiene node\node.exe y no es un repositorio de git):
// en la PC de desarrollo no hace nada. DULZURA_ACTUALIZACIONES=<url> usa otra fuente (pruebas sin publicar).

import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, createWriteStream, existsSync, readFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { prisma } from "../prisma";
import { AppError } from "../errors";
import { crearRespaldo } from "./backup";

const RAIZ = path.resolve(__dirname, "../../..");
const REPO = "Lin4saurus/bakery-erp-whatsapp";
const CARPETA = path.join(RAIZ, "actualizaciones");
const SEIS_HORAS = 6 * 3_600_000;
const CABECERAS = { "User-Agent": "DulzuraERP", Accept: "application/vnd.github+json" };

interface Pieza {
  archivo: string;
  sha256: string;
  bytes: number;
}

interface Manifiesto {
  version: string;
  publicada: string;
  notas: string;
  huellaDependencias: string;
  codigo: Pieza;
  completo: Pieza;
}

export interface Disponible {
  version: string;
  notas: string;
  publicada: string;
  completo: boolean; // trae Node.js y dependencias (baja más)
  bytes: number;
}

export interface Proceso {
  estado: "bajando" | "preparando" | "reiniciando" | "error";
  version: string;
  bajado: number;
  total: number;
  error?: string;
}

export interface EstadoActualizacion {
  version: string;
  puede: boolean;
  disponible: Disponible | null;
  revisado: string | null;
  error: string | null;
  proceso: Proceso | null;
}

export const versionInstalada = (): string =>
  (JSON.parse(readFileSync(path.join(RAIZ, "package.json"), "utf8")) as { version: string }).version;

export const esInstalacion = (): boolean => existsSync(path.join(RAIZ, "node", "node.exe")) && !existsSync(path.join(RAIZ, ".git"));

function huellaLocal(): string | null {
  try {
    return (JSON.parse(readFileSync(path.join(RAIZ, "dependencias.json"), "utf8")) as { huella?: string }).huella ?? null;
  } catch {
    return null;
  }
}

// «1.2.10» > «1.2.9». Devuelve >0 si a es más nueva.
export function compararVersiones(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

async function leerJson<T>(url: string): Promise<T | null> {
  const r = await abrirDescarga(url, 5, CABECERAS);
  if (r.statusCode === 404) {
    r.resume();
    return null;
  }
  if (r.statusCode !== 200) {
    r.resume();
    throw new Error(`${url} respondió ${r.statusCode ?? "sin código"}`);
  }
  let texto = "";
  r.setEncoding("utf8");
  for await (const trozo of r) texto += trozo as string;
  return JSON.parse(texto) as T;
}

interface Fuente {
  manifiesto: Manifiesto;
  url: (archivo: string) => string | undefined;
}

async function buscarFuente(): Promise<Fuente | null> {
  const base = process.env.DULZURA_ACTUALIZACIONES?.replace(/\/$/, "");
  if (base) {
    const manifiesto = await leerJson<Manifiesto>(`${base}/actualizacion.json`);
    return manifiesto ? { manifiesto, url: (a) => `${base}/${a}` } : null;
  }
  const release = await leerJson<{ assets: { name: string; browser_download_url: string }[] }>(
    `https://api.github.com/repos/${REPO}/releases/latest`,
  );
  const urls = new Map((release?.assets ?? []).map((a) => [a.name, a.browser_download_url]));
  const urlManifiesto = urls.get("actualizacion.json");
  if (!urlManifiesto) return null;
  const manifiesto = await leerJson<Manifiesto>(urlManifiesto);
  return manifiesto ? { manifiesto, url: (a) => urls.get(a) } : null;
}

let ultimaRevision: { cuando: Date; disponible: Disponible | null; error: string | null } | null = null;
let proceso: Proceso | null = null;

const estado = (): EstadoActualizacion => ({
  version: versionInstalada(),
  puede: esInstalacion(),
  disponible: ultimaRevision?.disponible ?? null,
  revisado: ultimaRevision?.cuando.toISOString() ?? null,
  error: ultimaRevision?.error ?? null,
  proceso,
});

// Busca en GitHub como mucho cada 6 horas (o al momento, con `forzar`).
export async function revisarActualizacion(forzar = false): Promise<EstadoActualizacion> {
  if (!esInstalacion()) return estado();
  if (!forzar && ultimaRevision && Date.now() - ultimaRevision.cuando.getTime() < SEIS_HORAS) return estado();
  try {
    const fuente = await buscarFuente();
    const m = fuente?.manifiesto;
    const completo = m ? m.huellaDependencias !== huellaLocal() : false;
    ultimaRevision = {
      cuando: new Date(),
      error: null,
      disponible:
        m && compararVersiones(m.version, versionInstalada()) > 0
          ? { version: m.version, notas: m.notas, publicada: m.publicada, completo, bytes: (completo ? m.completo : m.codigo).bytes }
          : null,
    };
  } catch {
    ultimaRevision = {
      cuando: new Date(),
      disponible: ultimaRevision?.disponible ?? null,
      error: "No se pudo buscar actualizaciones (¿hay internet?). Se vuelve a intentar más tarde.",
    };
  }
  return estado();
}

export const estadoActualizacion = (): EstadoActualizacion => estado();

// GitHub manda los archivos de una Release con una redirección a su almacenamiento: se siguen hasta 5.
// Se usa http/https de Node y no fetch: el fetch de Node (undici) puede tirar un error interno que no se puede atrapar
// si el servidor corta la conexión de cierta forma, y eso apagaría el ERP en plena descarga.
function abrirDescarga(url: string, saltos = 5, cabeceras: Record<string, string> = { "User-Agent": "DulzuraERP" }): Promise<IncomingMessage> {
  return new Promise((resolver, rechazar) => {
    const cliente = url.startsWith("https:") ? https : http;
    const pedido = cliente.get(url, { headers: cabeceras, timeout: 60_000 }, (r) => {
      const codigo = r.statusCode ?? 0;
      if (codigo >= 300 && codigo < 400 && r.headers.location && saltos > 0) {
        r.resume();
        resolver(abrirDescarga(new URL(r.headers.location, url).toString(), saltos - 1, cabeceras));
      } else {
        resolver(r); // quien llama revisa el código
      }
    });
    pedido.on("timeout", () => pedido.destroy(new Error("La descarga se quedó sin respuesta.")));
    pedido.on("error", rechazar);
  });
}

async function descargar(url: string, destino: string, pieza: Pieza): Promise<void> {
  const r = await abrirDescarga(url);
  if (r.statusCode !== 200) {
    r.resume();
    throw new Error(`La descarga respondió ${r.statusCode ?? "sin código"}.`);
  }
  const hash = createHash("sha256");
  const contar = new Transform({
    transform(trozo: Buffer, _codificacion, listo) {
      hash.update(trozo);
      if (proceso) proceso.bajado += trozo.length;
      listo(null, trozo);
    },
  });
  await pipeline(r, contar, createWriteStream(destino));
  if (hash.digest("hex") !== pieza.sha256) {
    await rm(destino, { force: true });
    throw new Error("El archivo bajado no coincide con el publicado (sha256). No se instaló nada; prueba de nuevo.");
  }
}

const tar = promisify(execFile);

async function instalarEnSegundoPlano(): Promise<void> {
  try {
    const fuente = await buscarFuente();
    if (!fuente) throw new Error("Ya no se encuentra la versión publicada.");
    const m = fuente.manifiesto;
    const pieza = m.huellaDependencias === huellaLocal() ? m.codigo : m.completo;
    const url = fuente.url(pieza.archivo);
    if (!url) throw new Error(`La Release no tiene el archivo ${pieza.archivo}.`);
    proceso = { estado: "bajando", version: m.version, bajado: 0, total: pieza.bytes };

    await mkdir(CARPETA, { recursive: true });
    const zip = path.join(CARPETA, pieza.archivo);
    await descargar(url, zip, pieza);

    proceso.estado = "preparando";
    await crearRespaldo(prisma); // por si algo sale mal: los datos de justo antes
    const nueva = path.join(CARPETA, "nueva");
    await rm(nueva, { recursive: true, force: true });
    await mkdir(nueva, { recursive: true });
    await tar(path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe"), ["-x", "-f", zip, "-C", nueva]);
    const carpetaNueva = path.join(nueva, "DulzuraERP");
    const versionNueva = (JSON.parse(readFileSync(path.join(carpetaNueva, "package.json"), "utf8")) as { version: string }).version;
    if (versionNueva !== m.version) throw new Error(`El paquete trae la versión ${versionNueva}, no la ${m.version}.`);

    // El .bat va fuera de la carpeta instalacion\, que se reemplaza mientras corre.
    const bat = path.join(CARPETA, "aplicar.bat");
    copyFileSync(path.join(carpetaNueva, "instalacion", "aplicar-actualizacion.bat"), bat);
    spawn("cmd.exe", ["/d", "/s", "/c", `""${bat}" "${RAIZ}" "${carpetaNueva}" ${process.pid}"`], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      windowsVerbatimArguments: true,
    }).unref();

    proceso.estado = "reiniciando";
    // server.ts cierra las conexiones y la base al recibir SIGTERM; el .bat espera a que termine.
    setTimeout(() => process.emit("SIGTERM"), 1_500);
  } catch (error) {
    proceso = {
      estado: "error",
      version: proceso?.version ?? "",
      bajado: 0,
      total: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function instalarActualizacion(): EstadoActualizacion {
  if (!esInstalacion()) throw new AppError(409, "Esta copia del ERP no se actualiza sola (no es una instalación).");
  if (proceso && proceso.estado !== "error") throw new AppError(409, "Ya se está instalando una actualización.");
  if (!ultimaRevision?.disponible) throw new AppError(409, "No hay una versión nueva para instalar.");
  proceso = { estado: "bajando", version: ultimaRevision.disponible.version, bajado: 0, total: ultimaRevision.disponible.bytes };
  void instalarEnSegundoPlano();
  return estado();
}
