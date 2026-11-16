// PIN de la dueña (D105). Un solo usuario: no hay nombre de usuario, solo un PIN de 4 a 6 números.
// - El PIN se guarda con scrypt y sal (Configuracion «seguridad.pin»), nunca en texto.
// - Las sesiones viven en memoria: al reiniciar la PC (o el ERP) se vuelve a pedir el PIN.
// - Una sesión se cierra sola tras 1 hora sin que la dueña toque el ERP. Solo cuenta lo que ella hace
//   (el navegador avisa con POST /api/sesion/actividad), no las recargas automáticas de las pantallas.
// - El agente de WhatsApp (n8n) no usa PIN: manda su propia clave en «X-Clave-Agente» y solo puede usar
//   las rutas que necesita (RUTAS_DEL_AGENTE).

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { RequestHandler } from "express";
import { prisma } from "../prisma";

const scryptAsync = promisify(scrypt) as (clave: string, sal: Buffer, largo: number) => Promise<Buffer>;

const CLAVE_PIN = "seguridad.pin";
const CLAVE_AGENTE = "seguridad.claveAgente";
export const COOKIE = "dulzura_sesion";
export const MINUTOS_INACTIVIDAD = 60;
const INACTIVIDAD_MS = MINUTOS_INACTIVIDAD * 60_000;
export const PIN_VALIDO = /^\d{4,6}$/;

// ---------- PIN ----------

interface PinGuardado {
  sal: string;
  hash: string;
}

async function leerPin(): Promise<PinGuardado | null> {
  const fila = await prisma.configuracion.findUnique({ where: { clave: CLAVE_PIN } });
  if (!fila) return null;
  try {
    const valor = JSON.parse(fila.valor) as Partial<PinGuardado>;
    return typeof valor.sal === "string" && typeof valor.hash === "string" ? { sal: valor.sal, hash: valor.hash } : null;
  } catch {
    return null;
  }
}

export const hayPin = async (): Promise<boolean> => (await leerPin()) !== null;

export async function guardarPin(pin: string): Promise<void> {
  const sal = randomBytes(16);
  const hash = await scryptAsync(pin, sal, 32);
  const valor = JSON.stringify({ sal: sal.toString("hex"), hash: hash.toString("hex") });
  await prisma.configuracion.upsert({
    where: { clave: CLAVE_PIN },
    create: { clave: CLAVE_PIN, valor },
    update: { valor },
  });
}

export async function pinCorrecto(pin: string): Promise<boolean> {
  const guardado = await leerPin();
  if (!guardado || !PIN_VALIDO.test(pin)) return false;
  const esperado = Buffer.from(guardado.hash, "hex");
  const calculado = await scryptAsync(pin, Buffer.from(guardado.sal, "hex"), esperado.length);
  return timingSafeEqual(esperado, calculado);
}

// `npm run pin`: si la dueña olvida el PIN, se borra y el ERP pide crear uno nuevo.
export async function borrarPin(): Promise<boolean> {
  const { count } = await prisma.configuracion.deleteMany({ where: { clave: CLAVE_PIN } });
  cerrarTodas();
  return count > 0;
}

// ---------- Intentos fallidos: 5 seguidos → 1 minuto de espera ----------

const MAX_FALLOS = 5;
const ESPERA_MS = 60_000;
let fallos = 0;
let bloqueadoHasta = 0;

export const segundosDeEspera = (ahora = Date.now()): number =>
  bloqueadoHasta > ahora ? Math.ceil((bloqueadoHasta - ahora) / 1000) : 0;

export function anotarIntento(correcto: boolean, ahora = Date.now()): void {
  if (correcto) {
    fallos = 0;
    return;
  }
  fallos += 1;
  if (fallos >= MAX_FALLOS) {
    fallos = 0;
    bloqueadoHasta = ahora + ESPERA_MS;
  }
}

// Solo para las pruebas.
export function reiniciarIntentos(): void {
  fallos = 0;
  bloqueadoHasta = 0;
}

// ---------- Sesiones en memoria ----------

const sesiones = new Map<string, { ultimaActividad: number }>();

export function abrirSesion(ahora = Date.now()): string {
  const token = randomBytes(32).toString("hex");
  sesiones.set(token, { ultimaActividad: ahora });
  return token;
}

export function sesionActiva(token: string | undefined, ahora = Date.now()): boolean {
  for (const [t, s] of sesiones) if (ahora - s.ultimaActividad > INACTIVIDAD_MS) sesiones.delete(t);
  return token !== undefined && sesiones.has(token);
}

export function anotarActividad(token: string | undefined, ahora = Date.now()): boolean {
  if (!sesionActiva(token, ahora) || token === undefined) return false;
  sesiones.set(token, { ultimaActividad: ahora });
  return true;
}

export const cerrarSesion = (token: string | undefined): void => {
  if (token) sesiones.delete(token);
};

export const cerrarTodas = (): void => sesiones.clear();

export function leerCookie(cabecera: string | undefined): string | undefined {
  for (const parte of (cabecera ?? "").split(";")) {
    const [nombre, ...valor] = parte.trim().split("=");
    if (nombre === COOKIE) return decodeURIComponent(valor.join("="));
  }
  return undefined;
}

// Sin Max-Age: la cookie muere al cerrar el navegador. HttpOnly: ningún script de la página la puede leer.
export const cookieDeSesion = (token: string): string => `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/`;
export const cookieBorrada = `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;

// ---------- Clave del agente (n8n) ----------

let claveAgenteEnMemoria: string | null = null;

// Se crea sola la primera vez y queda en la base; n8n la manda en la cabecera «X-Clave-Agente».
export async function claveDelAgente(): Promise<string> {
  if (claveAgenteEnMemoria) return claveAgenteEnMemoria;
  const fila = await prisma.configuracion.findUnique({ where: { clave: CLAVE_AGENTE } });
  if (fila) {
    claveAgenteEnMemoria = fila.valor;
    return fila.valor;
  }
  const nueva = randomBytes(24).toString("hex");
  await prisma.configuracion.create({ data: { clave: CLAVE_AGENTE, valor: nueva } });
  claveAgenteEnMemoria = nueva;
  return nueva;
}

const mismaClave = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

// Lo único que hace el agente en el ERP (rutas relativas a /api).
const RUTAS_DEL_AGENTE: [string, RegExp][] = [
  ["GET", /^\/clientes\/por-celular\/[^/]+$/],
  ["GET", /^\/productos$/],
  ["GET", /^\/agente\/config$/],
  ["GET", /^\/atenciones\/pausa$/],
  ["POST", /^\/atenciones$/],
  ["POST", /^\/pedidos$/],
  ["POST", /^\/pedidos\/pago-whatsapp$/],
  ["POST", /^\/pedidos\/cotizacion\/(aceptar-envio|cancelar)$/],
];

const esRutaDelAgente = (metodo: string, ruta: string): boolean =>
  RUTAS_DEL_AGENTE.some(([m, patron]) => m === metodo && patron.test(ruta));

// Se monta en /api después de /api/salud y /api/sesion: todo lo demás pide sesión o la clave del agente.
export const exigirSesion: RequestHandler = async (req, res, next) => {
  if (sesionActiva(leerCookie(req.headers.cookie))) return next();
  const claveRecibida = req.header("x-clave-agente");
  if (claveRecibida) {
    if (mismaClave(claveRecibida, await claveDelAgente()) && esRutaDelAgente(req.method, req.path)) return next();
    res.status(403).json({ error: "La clave del agente no sirve para esta ruta." });
    return;
  }
  res.status(401).json({ error: "El ERP está bloqueado: ingresa tu PIN.", sesion: "bloqueado" });
};
