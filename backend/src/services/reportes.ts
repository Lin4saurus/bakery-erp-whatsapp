// Reporte de un periodo para el contador (D106): ventas, ganancia por producto, gastos y utilidad.
// Todo el dinero se suma con Prisma.Decimal; recién al escribir el Excel se pasa a número.
// Mismas reglas que el resto del ERP: las ventas anuladas y las de pedidos de demostración no cuentan (D100), y la
// compra de insumos no se resta otra vez en la utilidad, porque su costo ya va en el costo de producción (D51).

import { CategoriaGasto, Prisma } from "@prisma/client";
// exceljs tarda ~1 s en cargarse: se trae recién al pedir un Excel, no al arrancar el ERP.
import type { Workbook, Worksheet } from "exceljs";
import { prisma } from "../prisma";
import { rangoFechas, sinVentasDemo } from "../routes/ventas";

const cero = () => new Prisma.Decimal(0);
const diaLocal = (fecha: Date): string => fecha.toLocaleDateString("sv-SE");

export const nombreCategoriaGasto: Record<CategoriaGasto, string> = {
  INSUMOS: "Compra de insumos",
  LIMPIEZA: "Limpieza",
  EQUIPAMIENTO: "Equipamiento",
  USO_PERSONAL: "Uso personal",
  OTROS: "Otros",
};

export interface FilaProducto {
  producto: string;
  categoria: string;
  cantidad: Prisma.Decimal;
  total: Prisma.Decimal;
  costo: Prisma.Decimal;
  ganancia: Prisma.Decimal;
}

export interface Reporte {
  desde: string;
  hasta: string;
  resumen: {
    lineasVendidas: number;
    pedidos: number;
    ventas: Prisma.Decimal;
    costoProduccion: Prisma.Decimal;
    gananciaBruta: Prisma.Decimal;
    gastosOperativos: Prisma.Decimal;
    compraInsumos: Prisma.Decimal;
    utilidad: Prisma.Decimal;
    anuladas: number;
    totalAnulado: Prisma.Decimal;
  };
  porProducto: FilaProducto[];
  porDia: { dia: string; ventas: Prisma.Decimal; ganancia: Prisma.Decimal }[];
  ventas: {
    fecha: Date;
    cliente: string;
    producto: string;
    cantidad: Prisma.Decimal;
    precioUnitario: Prisma.Decimal;
    total: Prisma.Decimal;
    costo: Prisma.Decimal;
    ganancia: Prisma.Decimal;
  }[];
  gastos: { fecha: Date; categoria: string; descripcion: string; monto: Prisma.Decimal }[];
  gastosPorCategoria: { categoria: string; monto: Prisma.Decimal }[];
}

export async function armarReporte(desde: string, hasta: string): Promise<Reporte> {
  const fecha = rangoFechas(desde, hasta);
  const [todas, gastos] = await Promise.all([
    prisma.venta.findMany({
      where: { fecha, ...(await sinVentasDemo()) },
      include: { producto: { select: { nombre: true, categoria: true } } },
      orderBy: { fecha: "asc" },
    }),
    prisma.gastoOperativo.findMany({ where: { fecha }, orderBy: { fecha: "asc" } }),
  ]);
  const ventas = todas.filter((v) => !v.anulada);
  const anuladas = todas.filter((v) => v.anulada);

  const porProducto = new Map<string, FilaProducto>();
  const porDia = new Map<string, { dia: string; ventas: Prisma.Decimal; ganancia: Prisma.Decimal }>();
  let total = cero();
  let costo = cero();
  let ganancia = cero();
  for (const v of ventas) {
    total = total.add(v.totalVenta);
    costo = costo.add(v.costoTotal);
    ganancia = ganancia.add(v.gananciaBruta);
    const nombre = v.sabor ? `${v.producto.nombre} · ${v.sabor}` : v.producto.nombre;
    const fila = porProducto.get(nombre) ?? {
      producto: nombre,
      categoria: v.producto.categoria,
      cantidad: cero(),
      total: cero(),
      costo: cero(),
      ganancia: cero(),
    };
    fila.cantidad = fila.cantidad.add(v.cantidad);
    fila.total = fila.total.add(v.totalVenta);
    fila.costo = fila.costo.add(v.costoTotal);
    fila.ganancia = fila.ganancia.add(v.gananciaBruta);
    porProducto.set(nombre, fila);
    const dia = diaLocal(v.fecha);
    const d = porDia.get(dia) ?? { dia, ventas: cero(), ganancia: cero() };
    d.ventas = d.ventas.add(v.totalVenta);
    d.ganancia = d.ganancia.add(v.gananciaBruta);
    porDia.set(dia, d);
  }

  const porCategoria = new Map<CategoriaGasto, Prisma.Decimal>();
  for (const g of gastos) porCategoria.set(g.categoria, (porCategoria.get(g.categoria) ?? cero()).add(g.monto));
  const compraInsumos = porCategoria.get(CategoriaGasto.INSUMOS) ?? cero();
  const gastosOperativos = gastos.reduce((s, g) => s.add(g.monto), cero()).sub(compraInsumos);

  // Un pedido de la Caja son varias líneas con el mismo pedidoId; una venta suelta antigua cuenta sola.
  const pedidos = new Set(ventas.map((v) => v.pedidoId ?? `venta-${v.id}`)).size;

  return {
    desde,
    hasta,
    resumen: {
      lineasVendidas: ventas.length,
      pedidos,
      ventas: total,
      costoProduccion: costo,
      gananciaBruta: ganancia,
      gastosOperativos,
      compraInsumos,
      utilidad: ganancia.sub(gastosOperativos),
      anuladas: anuladas.length,
      totalAnulado: anuladas.reduce((s, v) => s.add(v.totalVenta), cero()),
    },
    porProducto: [...porProducto.values()].sort((a, b) => b.total.cmp(a.total) || a.producto.localeCompare(b.producto)),
    porDia: [...porDia.values()],
    ventas: ventas.map((v) => ({
      fecha: v.fecha,
      cliente: v.cliente ?? "",
      producto: v.sabor ? `${v.producto.nombre} · ${v.sabor}` : v.producto.nombre,
      cantidad: v.cantidad,
      precioUnitario: v.precioUnitario,
      total: v.totalVenta,
      costo: v.costoTotal,
      ganancia: v.gananciaBruta,
    })),
    gastos: gastos.map((g) => ({
      fecha: g.fecha,
      categoria: nombreCategoriaGasto[g.categoria],
      descripcion: g.descripcion,
      monto: g.monto,
    })),
    gastosPorCategoria: Object.values(CategoriaGasto)
      .filter((c) => porCategoria.has(c))
      .map((c) => ({ categoria: nombreCategoriaGasto[c], monto: porCategoria.get(c) ?? cero() })),
  };
}

// ---------- Excel ----------

const BS = '"Bs" #,##0.00';
const num = (d: Prisma.Decimal): number => Number(d.toFixed(2));
const fechaCorta = (d: string): string => d.split("-").reverse().join("/");
// Excel no tiene zona horaria: se le pasa la hora de Bolivia (la de esta PC) para que no muestre la hora UTC.
const horaLocal = (d: Date): Date => new Date(d.getTime() - d.getTimezoneOffset() * 60_000);

function hoja(libro: Workbook, nombre: string, columnas: { titulo: string; ancho: number; bs?: boolean }[]) {
  const h = libro.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 1 }] });
  h.columns = columnas.map((c) => ({ header: c.titulo, width: c.ancho, style: c.bs ? { numFmt: BS } : {} }));
  const cabecera = h.getRow(1);
  cabecera.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cabecera.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8B6F47" } };
  return h;
}

function filaTotal(h: Worksheet, valores: (string | number | null)[]) {
  const fila = h.addRow(valores);
  fila.font = { bold: true };
  fila.border = { top: { style: "thin" } };
}

export async function reporteEnExcel(r: Reporte): Promise<Buffer> {
  // exceljs es CommonJS: al importarlo así, sus clases quedan en `default`.
  const excel = await import("exceljs");
  const { Workbook: Libro } = "default" in excel ? (excel as unknown as { default: typeof excel }).default : excel;
  const libro = new Libro();
  libro.creator = "ERP Dulzura Pastelería";
  libro.created = new Date();
  const periodo = `${fechaCorta(r.desde)} al ${fechaCorta(r.hasta)}`;

  const resumen = hoja(libro, "Resumen", [
    { titulo: "Concepto", ancho: 42 },
    { titulo: "Monto", ancho: 18, bs: true },
  ]);
  resumen.addRows([
    ["Dulzura Pastelería · Reporte del " + periodo, null],
    [null, null],
    ["Ventas", num(r.resumen.ventas)],
    ["Costo de producción (insumos de las recetas)", num(r.resumen.costoProduccion)],
    ["Ganancia bruta", num(r.resumen.gananciaBruta)],
    ["Gastos operativos (sin compra de insumos)", num(r.resumen.gastosOperativos)],
    ["Utilidad (ganancia bruta − gastos operativos)", num(r.resumen.utilidad)],
    [null, null],
    ["Compra de insumos (stock; su costo ya está en producción)", num(r.resumen.compraInsumos)],
    [`Pedidos cobrados: ${r.resumen.pedidos} · líneas vendidas: ${r.resumen.lineasVendidas}`, null],
    [`Ventas anuladas (no suman): ${r.resumen.anuladas}`, num(r.resumen.totalAnulado)],
  ]);
  resumen.getRow(2).font = { bold: true, size: 13 };
  resumen.getRow(8).font = { bold: true };

  const productos = hoja(libro, "Por producto", [
    { titulo: "Producto", ancho: 38 },
    { titulo: "Categoría", ancho: 16 },
    { titulo: "Cantidad", ancho: 11 },
    { titulo: "Ventas", ancho: 14, bs: true },
    { titulo: "Costo", ancho: 14, bs: true },
    { titulo: "Ganancia", ancho: 14, bs: true },
  ]);
  for (const p of r.porProducto) {
    productos.addRow([p.producto, p.categoria, num(p.cantidad), num(p.total), num(p.costo), num(p.ganancia)]);
  }
  filaTotal(productos, ["Total", null, null, num(r.resumen.ventas), num(r.resumen.costoProduccion), num(r.resumen.gananciaBruta)]);

  const dias = hoja(libro, "Por día", [
    { titulo: "Día", ancho: 14 },
    { titulo: "Ventas", ancho: 14, bs: true },
    { titulo: "Ganancia", ancho: 14, bs: true },
  ]);
  for (const d of r.porDia) dias.addRow([fechaCorta(d.dia), num(d.ventas), num(d.ganancia)]);
  filaTotal(dias, ["Total", num(r.resumen.ventas), num(r.resumen.gananciaBruta)]);

  const detalle = hoja(libro, "Ventas", [
    { titulo: "Fecha", ancho: 17 },
    { titulo: "Cliente", ancho: 24 },
    { titulo: "Producto", ancho: 36 },
    { titulo: "Cantidad", ancho: 10 },
    { titulo: "Precio", ancho: 12, bs: true },
    { titulo: "Total", ancho: 13, bs: true },
    { titulo: "Costo", ancho: 13, bs: true },
    { titulo: "Ganancia", ancho: 13, bs: true },
  ]);
  for (const v of r.ventas) {
    const fila = detalle.addRow([
      horaLocal(v.fecha),
      v.cliente,
      v.producto,
      num(v.cantidad),
      num(v.precioUnitario),
      num(v.total),
      num(v.costo),
      num(v.ganancia),
    ]);
    fila.getCell(1).numFmt = "dd/mm/yyyy hh:mm";
  }

  const gastos = hoja(libro, "Gastos", [
    { titulo: "Fecha", ancho: 17 },
    { titulo: "Categoría", ancho: 20 },
    { titulo: "Descripción", ancho: 44 },
    { titulo: "Monto", ancho: 14, bs: true },
  ]);
  for (const g of r.gastos) gastos.addRow([horaLocal(g.fecha), g.categoria, g.descripcion, num(g.monto)]).getCell(1).numFmt = "dd/mm/yyyy";
  gastos.addRow([]);
  for (const c of r.gastosPorCategoria) filaTotal(gastos, [null, c.categoria, "Total de la categoría", num(c.monto)]);

  return Buffer.from(await libro.xlsx.writeBuffer());
}
