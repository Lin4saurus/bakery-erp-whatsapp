import { Router } from "express";
import { z } from "zod";
import { ventasEnExcel, ventasEnPdf, ventasEnWord, type ListaVentas } from "../services/exportarVentas";

// Descargar el Historial de ventas en Excel, Word o PDF (D116). La pantalla manda la lista que está mostrando
// (ya filtrada), así el archivo trae exactamente lo que la dueña ve.

const filaSchema = z.object({
  fecha: z.string().datetime(),
  conHora: z.boolean(),
  producto: z.string().max(200),
  cliente: z.string().max(200).nullable(),
  mayorista: z.boolean(),
  cantidad: z.number().finite(),
  total: z.number().finite(),
  ganancia: z.number().finite().nullable(),
  anulada: z.boolean(),
});
const listaSchema = z.object({
  titulo: z.string().max(200),
  filtros: z.string().max(500),
  filas: z.array(filaSchema).max(20_000),
});
const formatoSchema = z.object({ formato: z.enum(["xlsx", "docx", "pdf"]) });

const TIPOS = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
} as const;

export const exportarRouter = Router();

exportarRouter.post("/ventas", async (req, res) => {
  const { formato } = formatoSchema.parse(req.query);
  const lista: ListaVentas = listaSchema.parse(req.body);
  const archivo =
    formato === "xlsx" ? await ventasEnExcel(lista) : formato === "docx" ? await ventasEnWord(lista) : await ventasEnPdf(lista);
  res.setHeader("Content-Type", TIPOS[formato]);
  res.setHeader("Content-Disposition", `attachment; filename="historial_de_ventas.${formato}"`);
  res.send(archivo);
});
