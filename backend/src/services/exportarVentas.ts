// Descargas del Historial de ventas (D116): la lista tal como la dueña la está viendo (con sus filtros) en Excel,
// Word o PDF. Las tres librerías se cargan recién al descargar, para no alargar el arranque del ERP (D113).
import { nuevoLibro } from "./excel";

export interface FilaVenta {
  fecha: string; // ISO
  conHora: boolean; // las de la Caja tienen hora; las anotadas antes del sistema, solo el día
  producto: string;
  cliente: string | null;
  mayorista: boolean;
  cantidad: number;
  total: number;
  ganancia: number | null; // null = no se conoce el costo
  anulada: boolean;
}

export interface ListaVentas {
  titulo: string; // «Historial de ventas 2026»
  filtros: string; // «Todo el año · Todas las ventas»
  filas: FilaVenta[];
}

const ZONA = "America/La_Paz";
const fecha = (f: FilaVenta) => {
  const d = new Date(f.fecha);
  const dia = d.toLocaleDateString("es-BO", { timeZone: ZONA, day: "2-digit", month: "2-digit", year: "numeric" });
  return f.conHora ? `${dia} ${d.toLocaleTimeString("es-BO", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hour12: false })}` : dia;
};
const bs = (n: number) => `Bs ${n.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: number) => n.toLocaleString("es-BO", { maximumFractionDigits: 2 });
const tipo = (f: FilaVenta) => (f.mayorista ? "Mayorista" : "Minorista");

export function totales(filas: FilaVenta[]) {
  const vigentes = filas.filter((f) => !f.anulada);
  return {
    ventas: vigentes.length,
    total: vigentes.reduce((t, f) => t + f.total, 0),
    ganancia: vigentes.reduce((t, f) => t + (f.ganancia ?? 0), 0),
    anuladas: filas.length - vigentes.length,
  };
}

const COLUMNAS = ["Fecha", "Producto", "Cliente", "Tipo", "Cantidad", "Total", "Ganancia"];
const celdas = (f: FilaVenta): string[] => [
  fecha(f),
  f.anulada ? `${f.producto} (anulada)` : f.producto,
  f.cliente ?? "—",
  tipo(f),
  num(f.cantidad),
  bs(f.total),
  f.ganancia === null ? "—" : bs(f.ganancia),
];
const resumen = (lista: ListaVentas) => {
  const t = totales(lista.filas);
  return `${t.ventas} ventas · Total ${bs(t.total)} · Ganancia ${bs(t.ganancia)}${t.anuladas ? ` · ${t.anuladas} anuladas (no suman)` : ""}`;
};

// ---------- Excel ----------

export async function ventasEnExcel(lista: ListaVentas): Promise<Buffer> {
  const libro = await nuevoLibro();
  const hoja = libro.addWorksheet("Ventas");
  hoja.addRow([lista.titulo]).font = { bold: true, size: 14 };
  hoja.addRow([lista.filtros]);
  hoja.addRow([resumen(lista)]);
  hoja.addRow([]);
  const cabecera = hoja.addRow(COLUMNAS);
  cabecera.font = { bold: true };
  for (const f of lista.filas) {
    const fila = hoja.addRow([fecha(f), f.anulada ? `${f.producto} (anulada)` : f.producto, f.cliente ?? "", tipo(f), f.cantidad, f.total, f.ganancia]);
    if (f.anulada) fila.font = { strike: true, color: { argb: "FF888888" } };
  }
  const t = totales(lista.filas);
  hoja.addRow([]);
  hoja.addRow(["Total", "", "", "", "", t.total, t.ganancia]).font = { bold: true };
  hoja.columns.forEach((c, i) => {
    c.width = [18, 42, 24, 12, 10, 14, 14][i];
    if (i >= 5) c.numFmt = '"Bs" #,##0.00';
  });
  return Buffer.from(await libro.xlsx.writeBuffer());
}

// ---------- Word ----------

export async function ventasEnWord(lista: ListaVentas): Promise<Buffer> {
  const { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, AlignmentType, PageOrientation } = await import("docx");
  const celda = (texto: string, negrita = false, derecha = false) =>
    new TableCell({
      children: [new Paragraph({ alignment: derecha ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: texto, bold: negrita, size: 18 })] })],
    });
  const derecha = (i: number) => i >= 4;
  const filas = [
    new TableRow({ tableHeader: true, children: COLUMNAS.map((c, i) => celda(c, true, derecha(i))) }),
    ...lista.filas.map((f) => new TableRow({ children: celdas(f).map((c, i) => celda(c, false, derecha(i))) })),
  ];
  const t = totales(lista.filas);
  filas.push(new TableRow({ children: ["Total", "", "", "", "", bs(t.total), bs(t.ganancia)].map((c, i) => celda(c, true, derecha(i))) }));
  const parrafo = (texto: string, tamano: number, negrita = false) =>
    new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: texto, size: tamano, bold: negrita })] });
  const documento = new Document({
    sections: [
      {
        properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } },
        children: [
          parrafo(lista.titulo, 32, true),
          parrafo(lista.filtros, 20),
          parrafo(resumen(lista), 20),
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: filas }),
        ],
      },
    ],
  });
  return Packer.toBuffer(documento);
}

// ---------- PDF ----------

export async function ventasEnPdf(lista: ListaVentas): Promise<Buffer> {
  const modulo = await import("pdfkit");
  const PDFDocument = ("default" in modulo ? modulo.default : modulo) as typeof import("pdfkit");
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36 });
  const partes: Buffer[] = [];
  doc.on("data", (p: Buffer) => partes.push(p));
  const listo = new Promise<Buffer>((resolver) => doc.on("end", () => resolver(Buffer.concat(partes))));

  const anchos = [95, 230, 150, 70, 60, 80, 80]; // suman 765 = ancho útil de A4 horizontal
  const x0 = doc.page.margins.left;
  const fila = (valores: string[], negrita = false, gris = false) => {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 20) doc.addPage();
    const y = doc.y;
    doc.font(negrita ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor(gris ? "#888888" : "#222222");
    let x = x0;
    let alto = 0;
    valores.forEach((v, i) => {
      const ancho = anchos[i] as number;
      const opciones = { width: ancho - 6, align: (i >= 4 ? "right" : "left") as "right" | "left" };
      doc.text(v, x, y, opciones);
      alto = Math.max(alto, doc.heightOfString(v, opciones));
      x += ancho;
    });
    doc.y = y + alto + 4;
    doc.moveTo(x0, doc.y - 2).lineTo(x0 + 765, doc.y - 2).lineWidth(0.3).strokeColor("#dddddd").stroke();
  };

  doc.font("Helvetica-Bold").fontSize(16).fillColor("#222222").text(lista.titulo);
  doc.font("Helvetica").fontSize(10).fillColor("#555555").text(lista.filtros).text(resumen(lista));
  doc.moveDown(0.8);
  fila(COLUMNAS, true);
  for (const f of lista.filas) fila(celdas(f), false, f.anulada);
  const t = totales(lista.filas);
  fila(["Total", "", "", "", "", bs(t.total), bs(t.ganancia)], true);
  doc.end();
  return listo;
}
