import { Router } from "express";
import { z } from "zod";
import { AppError } from "../errors";
import { armarReporte, reporteEnExcel } from "../services/reportes";

// Reporte para el contador (D106): JSON para la pantalla (que también se imprime o guarda en PDF) y Excel.

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD.");
const periodoSchema = z.object({ desde: dia, hasta: dia });

const leerPeriodo = (query: unknown) => {
  const { desde, hasta } = periodoSchema.parse(query);
  if (desde > hasta) throw new AppError(400, "La fecha «desde» va antes que «hasta».");
  return { desde, hasta };
};

export const reportesRouter = Router();

reportesRouter.get("/", async (req, res) => {
  const { desde, hasta } = leerPeriodo(req.query);
  res.json(await armarReporte(desde, hasta));
});

reportesRouter.get("/excel", async (req, res) => {
  const { desde, hasta } = leerPeriodo(req.query);
  const archivo = await reporteEnExcel(await armarReporte(desde, hasta));
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="dulzura_reporte_${desde}_al_${hasta}.xlsx"`);
  res.send(archivo);
});
