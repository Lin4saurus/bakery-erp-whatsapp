// Respaldo por correo (D111): cada respaldo se manda al Gmail del negocio, a sí mismo, con el .db.gz adjunto.
// Así hay una copia fuera de la portátil. Se manda al tocar «Respaldar ahora» y una vez al día (el respaldo automático).
// Gmail no acepta la contraseña normal: se usa una «contraseña de aplicación» (16 letras), que exige tener activada la
// verificación en 2 pasos. Se guarda en `Configuracion` y se saca de cada respaldo antes de comprimirlo.

import { createTransport } from "nodemailer";
import { prisma } from "../prisma";
import { AppError } from "../errors";
import type { Respaldo } from "./backup";

export const CLAVE_CORREO = "respaldo.correo";
export const CLAVE_CONTRASENA = "respaldo.claveCorreo";
const CLAVE_ULTIMO_ENVIO = "respaldo.ultimoEnvio";
const CLAVE_ERROR = "respaldo.errorEnvio";

export const CORREO_VALIDO = /^[^\s@]+@(gmail|googlemail)\.com$/i;

export interface EstadoCorreo {
  correo: string | null;
  ultimoEnvio: string | null;
  error: string | null;
}

async function leer(clave: string): Promise<string | null> {
  return (await prisma.configuracion.findUnique({ where: { clave } }))?.valor ?? null;
}

async function guardar(clave: string, valor: string): Promise<void> {
  await prisma.configuracion.upsert({ where: { clave }, create: { clave, valor }, update: { valor } });
}

export async function estadoCorreo(): Promise<EstadoCorreo> {
  const [correo, ultimoEnvio, error] = await Promise.all([leer(CLAVE_CORREO), leer(CLAVE_ULTIMO_ENVIO), leer(CLAVE_ERROR)]);
  return { correo, ultimoEnvio, error: correo ? error : null };
}

const transporte = (correo: string, contrasena: string) =>
  createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: correo, pass: contrasena },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  });

// Mensajes que la dueña entiende, en vez del texto en inglés de Gmail.
function explicar(error: unknown): string {
  const texto = error instanceof Error ? error.message : String(error);
  const codigo = (error as { code?: string; responseCode?: number } | null)?.code ?? "";
  const respuesta = (error as { responseCode?: number } | null)?.responseCode;
  if (codigo === "EAUTH" || respuesta === 535 || respuesta === 534) {
    return "Gmail no aceptó el correo o la contraseña de aplicación. Revisa que sea la de 16 letras y que la verificación en 2 pasos esté activada.";
  }
  if (["ECONNECTION", "ETIMEDOUT", "EDNS", "ESOCKET", "ENOTFOUND", "ECONNREFUSED"].includes(codigo)) {
    return "No hay internet o Gmail no respondió. El respaldo quedó en la portátil; se vuelve a intentar más tarde.";
  }
  return `No se pudo mandar el correo: ${texto}`;
}

// La contraseña de aplicación se muestra en grupos de 4 («abcd efgh ijkl mnop»): se guardan solo las letras.
const limpiarContrasena = (contrasena: string) => contrasena.replace(/\s/g, "");

export async function configurarCorreo(correo: string, contrasena: string): Promise<void> {
  const clave = limpiarContrasena(contrasena);
  if (!CORREO_VALIDO.test(correo)) throw new AppError(400, "Escribe un correo de Gmail (termina en @gmail.com).");
  if (!/^[a-z]{16}$/i.test(clave)) {
    throw new AppError(400, "La contraseña de aplicación tiene 16 letras (Google la muestra en 4 grupos de 4).");
  }
  // Primero se prueba con Gmail: si no entra, no se guarda nada.
  try {
    await transporte(correo, clave).verify();
  } catch (error) {
    throw new AppError(422, explicar(error));
  }
  await prisma.$transaction([
    prisma.configuracion.upsert({ where: { clave: CLAVE_CORREO }, create: { clave: CLAVE_CORREO, valor: correo }, update: { valor: correo } }),
    prisma.configuracion.upsert({ where: { clave: CLAVE_CONTRASENA }, create: { clave: CLAVE_CONTRASENA, valor: clave }, update: { valor: clave } }),
    prisma.configuracion.deleteMany({ where: { clave: { in: [CLAVE_ULTIMO_ENVIO, CLAVE_ERROR] } } }),
  ]);
}

export async function quitarCorreo(): Promise<void> {
  await prisma.configuracion.deleteMany({
    where: { clave: { in: [CLAVE_CORREO, CLAVE_CONTRASENA, CLAVE_ULTIMO_ENVIO, CLAVE_ERROR] } },
  });
}

const fechaLegible = (fecha: Date) =>
  fecha.toLocaleString("es-BO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export type ResultadoEnvio = { enviado: true } | { enviado: false; error: string } | null;

// Manda un respaldo al correo del negocio. null = no hay correo configurado. No lanza: el respaldo ya quedó guardado
// en la portátil aunque el correo falle, y el error queda anotado para mostrarlo en el menú.
export async function enviarRespaldo(respaldo: Respaldo): Promise<ResultadoEnvio> {
  const [correo, contrasena] = await Promise.all([leer(CLAVE_CORREO), leer(CLAVE_CONTRASENA)]);
  if (!correo || !contrasena) return null;
  try {
    await transporte(correo, contrasena).sendMail({
      from: { name: "Dulzura ERP", address: correo },
      to: correo,
      subject: `Respaldo Dulzura ERP · ${fechaLegible(respaldo.fecha)}`,
      text: [
        `Respaldo automático del ERP de Dulzura Pastelería (${fechaLegible(respaldo.fecha)}).`,
        "",
        "El archivo adjunto tiene todos los datos del ERP: productos, recetas, insumos, clientes, ventas, pedidos y gastos.",
        "No se abre con Excel: sirve para devolver el ERP a este día si la portátil se pierde o se daña.",
        "Guárdalo; no hace falta responder este correo.",
      ].join("\n"),
      attachments: [{ filename: respaldo.archivo, path: respaldo.ruta, contentType: "application/gzip" }],
    });
    await guardar(CLAVE_ULTIMO_ENVIO, new Date().toISOString());
    await prisma.configuracion.deleteMany({ where: { clave: CLAVE_ERROR } });
    return { enviado: true };
  } catch (error) {
    const mensaje = explicar(error);
    await guardar(CLAVE_ERROR, mensaje);
    return { enviado: false, error: mensaje };
  }
}

// Respaldo automático: manda el último respaldo si el último envío tiene más de `horas` horas (o nunca se mandó).
// Si un día no hubo internet, se manda en el siguiente intento (cada hora).
export async function enviarSiCorresponde(ultimo: Respaldo | undefined, horas = 20): Promise<ResultadoEnvio> {
  if (!ultimo) return null;
  const enviado = await leer(CLAVE_ULTIMO_ENVIO);
  if (enviado && Date.now() - new Date(enviado).getTime() < horas * 3_600_000) return null;
  return enviarRespaldo(ultimo);
}
