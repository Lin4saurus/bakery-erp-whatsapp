import { Router } from "express";
import { prisma } from "../prisma";
import { carpetaRespaldos, crearRespaldo, listarRespaldos, type Respaldo } from "../services/backup";

// La ruta completa del archivo no se expone; basta el nombre y la carpeta.
const publico = ({ archivo, fecha, bytes }: Respaldo) => ({ archivo, fecha, bytes });

export const backupsRouter = Router();

backupsRouter.get("/", async (_req, res) => {
  const respaldos = await listarRespaldos();
  res.json({ carpeta: carpetaRespaldos(), respaldos: respaldos.map(publico) });
});

backupsRouter.post("/", async (_req, res) => {
  const respaldo = await crearRespaldo(prisma);
  res.status(201).json({ ...publico(respaldo), eliminados: respaldo.eliminados });
});
