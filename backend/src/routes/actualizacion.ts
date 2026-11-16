import { Router } from "express";
import { estadoActualizacion, instalarActualizacion, revisarActualizacion } from "../services/actualizacion";

// Actualización desde GitHub (D112).
export const actualizacionRouter = Router();

// ?revisar=1 busca en GitHub al momento («Buscar actualización»); si no, como mucho cada 6 horas.
actualizacionRouter.get("/", async (req, res) => {
  res.json(await revisarActualizacion(req.query.revisar === "1"));
});

// Avance mientras baja e instala (no vuelve a buscar en GitHub).
actualizacionRouter.get("/estado", (_req, res) => {
  res.json(estadoActualizacion());
});

actualizacionRouter.post("/instalar", (_req, res) => {
  res.status(202).json(instalarActualizacion());
});
