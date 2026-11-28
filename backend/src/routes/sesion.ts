import { Router } from "express";
import { z } from "zod";
import { AppError } from "../errors";
import {
  MINUTOS_INACTIVIDAD,
  PIN_VALIDO,
  abrirSesion,
  anotarActividad,
  anotarIntento,
  cerrarSesion,
  cookieBorrada,
  cookieDeSesion,
  enDemo,
  enLinea,
  guardarPin,
  hayPin,
  leerCookie,
  pinCorrecto,
  segundosDeEspera,
  sesionActiva,
} from "../services/sesion";

// Entrar con el PIN, bloquear y cambiar el PIN (D105). Estas rutas no piden sesión.

const pin = z.string().regex(PIN_VALIDO, "El PIN son de 4 a 6 números.");
const pinSchema = z.object({ pin });
const cambiarSchema = z.object({ actual: z.string(), nuevo: pin });

export const sesionRouter = Router();

sesionRouter.get("/", async (req, res) => {
  res.json({
    pinCreado: enDemo() || (await hayPin()),
    activa: sesionActiva(leerCookie(req.headers.cookie)),
    minutosInactividad: MINUTOS_INACTIVIDAD,
  });
});

// La primera vez: la dueña elige su PIN y queda adentro.
sesionRouter.post("/pin", async (req, res) => {
  const { pin: nuevo } = pinSchema.parse(req.body);
  if (await hayPin()) throw new AppError(409, "Ya hay un PIN. Para cambiarlo, entra y usa «Cambiar PIN».");
  // En internet (D128) el primer PIN se crea en la consola del servidor: si no, el primero en abrir la página lo elegiría.
  if (enLinea()) throw new AppError(409, "Este ERP todavía no tiene PIN. Pídele a quien lo administra que lo cree.");
  await guardarPin(nuevo);
  res.setHeader("Set-Cookie", cookieDeSesion(abrirSesion()));
  res.status(201).json({ activa: true });
});

const comprobar = async (valor: string): Promise<void> => {
  const espera = segundosDeEspera();
  if (espera > 0) throw new AppError(429, `Demasiados intentos. Espera ${espera} segundos y vuelve a probar.`);
  const correcto = await pinCorrecto(valor);
  anotarIntento(correcto);
  if (!correcto) throw new AppError(401, "PIN incorrecto.");
};

sesionRouter.post("/entrar", async (req, res) => {
  const { pin: valor } = pinSchema.parse(req.body);
  if (!(await hayPin())) throw new AppError(409, "Todavía no hay PIN: créalo primero.");
  await comprobar(valor);
  res.setHeader("Set-Cookie", cookieDeSesion(abrirSesion()));
  res.json({ activa: true });
});

sesionRouter.post("/salir", (req, res) => {
  cerrarSesion(leerCookie(req.headers.cookie));
  res.setHeader("Set-Cookie", cookieBorrada());
  res.status(204).end();
});

// El navegador avisa que la dueña está usando el ERP (como mucho cada pocos minutos).
sesionRouter.post("/actividad", (req, res) => {
  if (!anotarActividad(leerCookie(req.headers.cookie))) {
    res.status(401).json({ error: "El ERP está bloqueado: ingresa tu PIN.", sesion: "bloqueado" });
    return;
  }
  res.status(204).end();
});

sesionRouter.put("/pin", async (req, res) => {
  if (!sesionActiva(leerCookie(req.headers.cookie))) {
    res.status(401).json({ error: "El ERP está bloqueado: ingresa tu PIN.", sesion: "bloqueado" });
    return;
  }
  const { actual, nuevo } = cambiarSchema.parse(req.body);
  await comprobar(actual);
  await guardarPin(nuevo);
  res.json({ ok: true });
});
