// exceljs tarda ~1 s en cargarse (D113): se trae recién la primera vez que se pide un Excel. Es CommonJS: al importarlo
// así sus clases quedan en `default`. Lo usan el reporte (D106), las descargas del Historial (D116) y la plantilla de
// ventas anteriores (D121).
import type ExcelJS from "exceljs";

export async function nuevoLibro(): Promise<ExcelJS.Workbook> {
  const excel = await import("exceljs");
  const { Workbook } = "default" in excel ? (excel as unknown as { default: typeof excel }).default : excel;
  return new Workbook();
}
