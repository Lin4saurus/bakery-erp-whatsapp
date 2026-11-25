// Ventas de antes del ERP (D121): la dueña las agrega desde el Historial, una por una o con la plantilla de Excel.
// Van a VentaHistorica, como las que se importaron de la repostera anterior: salen en el Historial, en Desempeño y en
// las descargas, pero no tocan el stock ni la Caja. Si el producto está en el catálogo, la ganancia se estima con el
// costo actual de su receta; si no, queda sin ganancia («—»).
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { calcularCostoProducto, precargarCosteo } from "./costeo";
import { normalizarNombre } from "../validacion";

export interface FilaAnterior {
  fecha: string; // AAAA-MM-DD
  producto: string; // como está en el catálogo («Torta de limón · 8 personas») o como lo anotó
  cantidad: number;
  total: number; // Bs cobrados por toda la fila
  cliente?: string | null;
}

export interface FilaRevisada extends FilaAnterior {
  numero: number; // fila de la hoja o de la tabla, para los mensajes
  productoId: number | null; // null = no está en el catálogo
  productoNombre: string;
  costo: number | null;
  error: string | null;
}

const clave = (texto: string) => normalizarNombre(texto.replace(/·/g, " "));
const hoyISO = () => new Date().toLocaleDateString("sv-SE");
const DIA = /^\d{4}-\d{2}-\d{2}$/;
const diaValido = (dia: string) => DIA.test(dia) && new Date(`${dia}T12:00:00`).toLocaleDateString("sv-SE") === dia;

// Revisa cada fila (fecha, cantidad, total) y la une con el producto del catálogo para estimar el costo.
export async function revisarFilas(filas: (FilaAnterior & { numero: number })[]): Promise<FilaRevisada[]> {
  const productos = await prisma.producto.findMany({ where: { tipo: "VENTA", eliminado: false } });
  const porClave = new Map(productos.map((p) => [clave(p.nombre), p]));
  const memo = await precargarCosteo(prisma);
  const hoy = hoyISO();
  const revisadas: FilaRevisada[] = [];
  for (const f of filas) {
    const producto = f.producto.trim() ? porClave.get(clave(f.producto)) : undefined;
    let error: string | null = null;
    if (!diaValido(f.fecha)) error = "La fecha no es válida.";
    else if (f.fecha > hoy) error = "La fecha es de un día que todavía no llega.";
    else if (!f.producto.trim()) error = "Falta el producto.";
    else if (!(f.cantidad > 0)) error = "La cantidad tiene que ser mayor que 0.";
    else if (!(f.total >= 0)) error = "Falta el total en Bs.";
    const costo = producto ? Number((await calcularCostoProducto(prisma, producto.id, [], memo)).costoUnitario) * f.cantidad : null;
    revisadas.push({
      ...f,
      producto: f.producto.trim(),
      cliente: f.cliente?.trim() || null,
      productoId: producto?.id ?? null,
      productoNombre: producto?.nombre ?? f.producto.trim(),
      costo: costo === null ? null : Math.round(costo * 100) / 100,
      error,
    });
  }
  return revisadas;
}

// Guarda las filas sin error. `origen` es la «hoja»: «Anotadas en el ERP» o «Excel: archivo.xlsx».
export async function guardarFilas(filas: FilaRevisada[], origen: string): Promise<number> {
  const buenas = filas.filter((f) => f.error === null);
  if (buenas.length === 0) return 0;
  const clientes = await prisma.cliente.findMany({ select: { id: true, nombre: true } });
  const clientePorClave = new Map(clientes.map((c) => [normalizarNombre(c.nombre), c.id]));
  const ultima = await prisma.ventaHistorica.aggregate({ where: { hoja: origen }, _max: { fila: true } });
  const desde = (ultima._max.fila ?? 0) + 1;
  const D = (n: number) => new Prisma.Decimal(n.toFixed(2));
  await prisma.ventaHistorica.createMany({
    data: buenas.map((f, i) => ({
      hoja: origen,
      fila: desde + i,
      fecha: new Date(`${f.fecha}T12:00:00`),
      productoOriginal: f.producto,
      productoNombre: f.productoNombre,
      productoId: f.productoId,
      cantidad: new Prisma.Decimal(f.cantidad),
      valor: D(f.total),
      costo: f.costo === null ? null : D(f.costo),
      utilidad: f.costo === null ? null : D(f.total - f.costo),
      cliente: f.cliente ?? null,
      clienteId: f.cliente ? (clientePorClave.get(normalizarNombre(f.cliente)) ?? null) : null,
    })),
  });
  return buenas.length;
}

// ---------- Plantilla de Excel ----------

const COLUMNAS = ["Fecha", "Producto", "Tamaño", "Cantidad", "Total (Bs)", "Cliente"] as const;

async function libroExcel() {
  const excel = await import("exceljs");
  return "default" in excel ? (excel as unknown as { default: typeof excel }).default : excel;
}

export async function plantillaExcel(): Promise<Buffer> {
  const { Workbook } = await libroExcel();
  const libro = new Workbook();
  const hoja = libro.addWorksheet("Ventas anteriores");
  hoja.addRow([...COLUMNAS]).font = { bold: true };
  const productos = await prisma.producto.findMany({ where: { tipo: "VENTA", eliminado: false }, orderBy: [{ categoria: "asc" }, { nombre: "asc" }] });
  const ejemplo = productos[0];
  const ejemplo2 = productos.find((p) => p.tamano) ?? ejemplo;
  hoja.addRow([new Date(2025, 9, 15), ejemplo?.grupo ?? ejemplo?.nombre ?? "Torta de limón", ejemplo?.tamano ?? "", 1, Number(ejemplo?.precioVenta ?? 0), "Ana Pérez"]);
  hoja.addRow([new Date(2025, 9, 16), ejemplo2?.grupo ?? ejemplo2?.nombre ?? "", ejemplo2?.tamano ?? "", 2, Number(ejemplo2?.precioVenta ?? 0) * 2, ""]);
  hoja.columns.forEach((c, i) => {
    c.width = [14, 38, 22, 10, 12, 26][i];
  });
  hoja.getColumn(1).numFmt = "dd/mm/yyyy";
  hoja.getColumn(5).numFmt = "#,##0.00";

  const ayuda = libro.addWorksheet("Cómo llenarla");
  for (const linea of [
    "Una fila por venta (o por producto, si en una venta llevaron varios).",
    "Fecha: el día de la venta (15/10/2025).",
    "Producto y Tamaño: como están en la hoja «Productos» (así se calcula la ganancia). Si no está, escríbelo igual: se guarda sin ganancia.",
    "Cantidad: cuántos se vendieron. Total (Bs): lo que se cobró por toda la fila.",
    "Cliente: opcional.",
    "Borra las dos filas de ejemplo antes de subirla.",
  ])
    ayuda.addRow([linea]);
  ayuda.getColumn(1).width = 110;

  const lista = libro.addWorksheet("Productos");
  lista.addRow(["Producto", "Tamaño", "Precio (Bs)"]).font = { bold: true };
  for (const p of productos) lista.addRow([p.grupo ?? p.nombre, p.tamano ?? "", Number(p.precioVenta ?? 0)]);
  lista.columns.forEach((c, i) => {
    c.width = [40, 30, 12][i];
  });
  return Buffer.from(await libro.xlsx.writeBuffer());
}

// ---------- Leer el Excel que sube la dueña ----------

const texto = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && v !== null && "text" in v) return String((v as { text: unknown }).text ?? "");
  if (typeof v === "object" && v !== null && "result" in v) return texto((v as { result: unknown }).result);
  return String(v).trim();
};
const numero = (v: unknown): number => {
  if (typeof v === "number") return v;
  const t = texto(v).replace(/bs\.?/i, "").replace(/\s/g, "");
  if (!t) return Number.NaN;
  // «1.234,50» o «1234,5» o «1234.5»
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  return Number(normal);
};
const fecha = (v: unknown): string => {
  if (v instanceof Date) return v.toISOString().slice(0, 10); // exceljs da las fechas a medianoche UTC
  const t = texto(v);
  const dma = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t);
  if (dma) {
    const anio = (dma[3] as string).length === 2 ? `20${dma[3]}` : (dma[3] as string);
    return `${anio}-${(dma[2] as string).padStart(2, "0")}-${(dma[1] as string).padStart(2, "0")}`;
  }
  return t.slice(0, 10);
};

export async function leerExcel(archivo: Buffer): Promise<(FilaAnterior & { numero: number })[]> {
  const { Workbook } = await libroExcel();
  const libro = new Workbook();
  // exceljs pide el tipo Buffer de su propia versión de Node.
  await libro.xlsx.load(archivo as unknown as Parameters<typeof libro.xlsx.load>[0]);
  const hoja = libro.worksheets[0];
  if (!hoja) return [];
  // La fila de títulos: la primera que diga «Fecha» y «Producto».
  let titulos = 0;
  const columnas = new Map<string, number>();
  hoja.eachRow((fila, n) => {
    if (titulos) return;
    const valores = (fila.values as unknown[]).map((v) => clave(texto(v)));
    if (valores.includes("fecha") && valores.includes("producto")) {
      titulos = n;
      valores.forEach((v, i) => {
        if (v.startsWith("fecha")) columnas.set("fecha", i);
        else if (v.startsWith("producto")) columnas.set("producto", i);
        else if (v.startsWith("tamano") || v.startsWith("porcion")) columnas.set("tamano", i);
        else if (v.startsWith("cantidad")) columnas.set("cantidad", i);
        else if (v.startsWith("total") || v.startsWith("monto") || v.startsWith("valor")) columnas.set("total", i);
        else if (v.startsWith("cliente")) columnas.set("cliente", i);
      });
    }
  });
  if (!titulos) return [];
  const filas: (FilaAnterior & { numero: number })[] = [];
  hoja.eachRow((fila, n) => {
    if (n <= titulos) return;
    const celda = (c: string) => {
      const i = columnas.get(c);
      return i === undefined ? undefined : (fila.values as unknown[])[i];
    };
    const producto = texto(celda("producto"));
    const tamano = texto(celda("tamano"));
    if (!producto && !texto(celda("fecha")) && !texto(celda("total"))) return; // fila vacía
    filas.push({
      numero: n,
      fecha: fecha(celda("fecha")),
      producto: tamano ? `${producto} · ${tamano}` : producto,
      cantidad: columnas.has("cantidad") ? numero(celda("cantidad")) : 1,
      total: numero(celda("total")),
      cliente: texto(celda("cliente")) || null,
    });
  });
  return filas;
}
