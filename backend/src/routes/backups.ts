import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { carpetaRespaldos, crearRespaldo, listarRespaldos, type Respaldo } from "../services/backup";
import { configurarCorreo, enviarRespaldo, estadoCorreo, quitarCorreo } from "../services/correoRespaldo";

// La ruta completa del archivo no se expone; basta el nombre y la carpeta.
const publico = ({ archivo, fecha, bytes }: Respaldo) => ({ archivo, fecha, bytes });

export const backupsRouter = Router();

backupsRouter.get("/", async (_req, res) => {
  const [respaldos, correo] = await Promise.all([listarRespaldos(), estadoCorreo()]);
  res.json({ carpeta: carpetaRespaldos(), respaldos: respaldos.map(publico), correo });
});

// «Respaldar ahora»: respalda y, si hay Gmail configurado, lo manda (D111). Si el correo falla, el respaldo igual
// quedó en la portátil: se responde 201 con `correo.enviado = false` y el motivo.
backupsRouter.post("/", async (_req, res) => {
  const respaldo = await crearRespaldo(prisma);
  const correo = await enviarRespaldo(respaldo);
  res.status(201).json({ ...publico(respaldo), eliminados: respaldo.eliminados, correo });
});

// Respaldo por correo (D111). La contraseña de aplicación nunca vuelve al navegador.
const correoSchema = z.object({ correo: z.string().trim().toLowerCase(), contrasena: z.string() });

backupsRouter.put("/correo", async (req, res) => {
  const { correo, contrasena } = correoSchema.parse(req.body);
  await configurarCorreo(correo, contrasena);
  // Primer envío al momento: un respaldo nuevo, para que la dueña vea llegar el correo.
  const respaldo = await crearRespaldo(prisma);
  const envio = await enviarRespaldo(respaldo);
  res.json({ ...(await estadoCorreo()), envio });
});

backupsRouter.delete("/correo", async (_req, res) => {
  await quitarCorreo();
  res.status(204).end();
});
