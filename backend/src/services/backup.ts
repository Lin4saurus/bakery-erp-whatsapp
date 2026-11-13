// Respaldo de la base SQLite: copia consistente (VACUUM INTO), verificación de integridad
// y compresión .gz con la fecha. Si BACKUP_DIR apunta a la carpeta de Google Drive para
// escritorio, Drive sube cada respaldo solo.

import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { PrismaClient } from "@prisma/client";
import type { Db } from "../prisma";
import { AppError } from "../errors";

const RAIZ = path.resolve(__dirname, "../../..");
const CARPETA_SCHEMA = path.join(RAIZ, "database/prisma");
const PATRON = /^dulzura_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})(?:-(\d+))?\.db\.gz$/;

// Clave de orden "AAAA-MM-DD_HH-MM-SS#NNN": no se puede ordenar por nombre porque
// "…02.db.gz" quedaría delante de "…02-3.db.gz" (respaldos del mismo segundo).
const claveOrden = (archivo: string): string => {
  const partes = PATRON.exec(archivo);
  const numero = Number(partes?.[3] ?? 1);
  return `${partes?.[1] ?? ""}_${partes?.[2] ?? ""}#${String(numero).padStart(3, "0")}`;
};

export interface Respaldo {
  archivo: string;
  ruta: string;
  fecha: Date;
  bytes: number;
}

export const carpetaRespaldos = (): string => path.resolve(RAIZ, process.env.BACKUP_DIR ?? "backups");

// Los más recientes que se guardan siempre (BACKUP_KEEP, por defecto 30, como antes).
const respaldosRecientes = (): number => {
  const valor = Number(process.env.BACKUP_KEEP ?? 30);
  return Number.isInteger(valor) && valor > 0 ? valor : 30;
};

// Retención escalonada (D1, AUDITORIA.md): nunca borra más que la regla anterior. Los N más recientes, más el último de cada día de los últimos 30 días y el
// último de cada mes de los últimos 12 meses. Así los respaldos manuales de un día de mucho trabajo (antes de cada
// migración) ya no se comen el de hace un mes. `respaldos` viene del más nuevo al más viejo.
export function elegirAConservar(respaldos: readonly { archivo: string }[], recientes: number, hoy = new Date()): Set<string> {
  const conservar = new Set(respaldos.slice(0, recientes).map((r) => r.archivo));
  const dia = (archivo: string) => PATRON.exec(archivo)?.[1] ?? "";
  const limiteDias = new Date(hoy.getTime() - 30 * 86_400_000).toLocaleDateString("sv-SE");
  const limiteMeses = new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1).toLocaleDateString("sv-SE").slice(0, 7);
  const vistosDia = new Set<string>();
  const vistosMes = new Set<string>();
  for (const r of respaldos) {
    const d = dia(r.archivo);
    if (!d) continue;
    if (d >= limiteDias && !vistosDia.has(d)) {
      vistosDia.add(d);
      conservar.add(r.archivo);
    }
    const mes = d.slice(0, 7);
    if (mes >= limiteMeses && !vistosMes.has(mes)) {
      vistosMes.add(mes);
      conservar.add(r.archivo);
    }
  }
  return conservar;
}

// DATABASE_URL de SQLite ("file:./dulzura.db") es relativa a la carpeta del schema.
export function rutaBaseDeDatos(url = process.env.DATABASE_URL ?? ""): string {
  if (!url.startsWith("file:")) {
    throw new AppError(500, "El respaldo solo funciona con SQLite (DATABASE_URL debe empezar con file:).");
  }
  const ruta = url.slice("file:".length).split("?")[0] ?? "";
  return path.isAbsolute(ruta) ? ruta : path.resolve(CARPETA_SCHEMA, ruta);
}

const dosDigitos = (n: number): string => String(n).padStart(2, "0");

const nombreParaFecha = (fecha: Date): string =>
  `dulzura_${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}_` +
  `${dosDigitos(fecha.getHours())}-${dosDigitos(fecha.getMinutes())}-${dosDigitos(fecha.getSeconds())}`;

export async function listarRespaldos(carpeta = carpetaRespaldos()): Promise<Respaldo[]> {
  if (!existsSync(carpeta)) return [];
  const archivos = (await readdir(carpeta)).filter((nombre) => PATRON.test(nombre));
  const respaldos = await Promise.all(
    archivos.map(async (archivo) => {
      const ruta = path.join(carpeta, archivo);
      const info = await stat(ruta);
      return { archivo, ruta, fecha: info.mtime, bytes: info.size };
    }),
  );
  return respaldos.sort((a, b) => claveOrden(b.archivo).localeCompare(claveOrden(a.archivo)));
}

async function verificarIntegridad(rutaCopia: string): Promise<void> {
  const cliente = new PrismaClient({ datasourceUrl: `file:${rutaCopia}` });
  try {
    const resultado = await cliente.$queryRawUnsafe<{ integrity_check: string }[]>("PRAGMA integrity_check");
    if (resultado[0]?.integrity_check !== "ok") {
      throw new AppError(500, `La copia de la base de datos no pasó la verificación: ${JSON.stringify(resultado)}`);
    }
  } finally {
    await cliente.$disconnect();
  }
}

export async function crearRespaldo(db: Db): Promise<Respaldo & { eliminados: string[] }> {
  const origen = rutaBaseDeDatos();
  if (!existsSync(origen)) throw new AppError(500, `No se encontró la base de datos en ${origen}.`);

  const carpeta = carpetaRespaldos();
  await mkdir(carpeta, { recursive: true });

  const ahora = new Date();
  let base = nombreParaFecha(ahora);
  for (let n = 2; existsSync(path.join(carpeta, `${base}.db.gz`)); n++) {
    base = `${nombreParaFecha(ahora)}-${n}`;
  }
  const destino = path.join(carpeta, `${base}.db.gz`);
  const temporal = path.join(os.tmpdir(), `${base}-${process.pid}.db`);

  try {
    // VACUUM INTO hace una copia consistente aunque la app esté usando la base.
    await db.$executeRawUnsafe(`VACUUM INTO '${temporal.replace(/'/g, "''")}'`);
    await verificarIntegridad(temporal);
    await pipeline(createReadStream(temporal), createGzip({ level: 9 }), createWriteStream(destino));
  } catch (error) {
    await rm(destino, { force: true });
    if (error instanceof AppError) throw error;
    const detalle = error instanceof Error ? error.message : String(error);
    throw new AppError(500, `No se pudo crear el respaldo: ${detalle}`);
  } finally {
    await rm(temporal, { force: true });
  }

  const eliminados: string[] = [];
  const todos = await listarRespaldos(carpeta);
  const conservar = elegirAConservar(todos, respaldosRecientes());
  for (const viejo of todos.filter((r) => !conservar.has(r.archivo))) {
    await rm(viejo.ruta, { force: true });
    eliminados.push(viejo.archivo);
  }

  const info = await stat(destino);
  return { archivo: path.basename(destino), ruta: destino, fecha: info.mtime, bytes: info.size, eliminados };
}

// Al iniciar la app: respalda si el último respaldo tiene más de `horas` horas (o no hay ninguno).
export async function respaldarSiCorresponde(db: Db, horas = 20): Promise<Respaldo | null> {
  const [ultimo] = await listarRespaldos();
  if (ultimo && Date.now() - ultimo.fecha.getTime() < horas * 3_600_000) return null;
  return crearRespaldo(db);
}
