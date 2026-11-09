// Importa ventas anteriores al sistema a la tabla VentaHistorica (solo consulta, no tocan el stock):
// - `datos/ventas-historicas-2024.json`: hojas Semana 1–3 de "Dulzura ondrive (1).xlsx" (CONTEXT.md D24).
// - `datos/notas-mayoristas-2026.json`: notas de venta a clientes mayoristas, jun–ago 2026 (D33, D38).
// Es idempotente: cada venta se identifica por hoja + fila, así que reimportar actualiza en vez de duplicar.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";

const D = (valor: string): Prisma.Decimal => new Prisma.Decimal(valor);

interface VentaExcel {
  hoja: string;
  fila: number;
  fecha: string; // AAAA-MM-DD
  fechaEstimada: boolean;
  producto: string;
  cantidad: string;
  valor: string;
  comision: string;
  costo: string | null; // null si no se conoce
  utilidad: string | null;
  cliente: string | null;
  sabores?: string | null;
}

interface ArchivoHistorico {
  ventas: VentaExcel[];
}

// Nombre del Excel → nombre agrupado. Los que existen en el ERP se vinculan con ese producto.
const nombres: Record<string, string> = {
  Queque: "Queque Vainilla", // notas mayoristas 2026: el queque sin sabor es el de vainilla (D50)
  // Productos del ERP (Brownies, D19–D21)
  "Brownie Premiun 4 unidades": "Brownies premium 4 u",
  "Pack 4 Brow. Pre.": "Brownies premium 4 u",
  "4 Premiun": "Brownies premium 4 u",
  "4 clasico": "Brownies clásicos 4 u",
  "9 Clasico": "Brownies clásicos 9 u",
  "9 Premiun": "Brownies premium 9 u",
  "Br. Personal Prem.": "Brownie personal premium",
  // Productos del ERP (tres leches y fresas, D25–D30)
  "Torta Tres Leches": "Tres leches",
  "Totra Tres Leches": "Tres leches",
  "Tres leches": "Tres leches",
  "Tres Leches Personal": "Tres leches personal",
  "Tres leches personal": "Tres leches personal",
  Familiar: "Tres leches familiar",
  "Torta Familiar": "Tres leches familiar",
  Mega: "Tres leches mega",
  "Trota MEGA": "Tres leches mega",
  "Fresas Con Crema": "Fresas con crema",
  "Fresas con crema": "Fresas con crema",
  "Fresa y Brownie": "Fresas con crema y brownie",
  "Fresas y Brownie": "Fresas con crema y brownie",
  "Nuetlla Brownie y freasas": "Fresas con crema, brownie y Nutella",
  "Premium Nutella, Brow": "Fresas con crema, brownie y Nutella",
  "Bañadas en chocolate": "Frutillas bañadas en chocolate",
  "Fresas Bañadas en Chocolate": "Frutillas bañadas en chocolate",
  // Productos sin receta en el ERP (todavía)
  "3 P. Frutos rojos": "Tres leches personal frutos rojos",
  Frutillita: "Frutillita",
  "Feliz Cumpleaños": "Feliz cumpleaños",
};

// Si el producto no existe (BD de prueba, que solo tiene el «Queque» genérico del seed), se usa este.
const RESPALDO: Record<string, string> = { "Queque Vainilla": "Queque" };

export const ARCHIVOS_HISTORICOS = [
  path.join(__dirname, "datos", "ventas-historicas-2024.json"),
  path.join(__dirname, "datos", "notas-mayoristas-2026.json"),
];

export async function importarVentasHistoricas(db: PrismaClient): Promise<number> {
  // datos/ no está en el repositorio (nombres reales de clientas): si falta un archivo, se salta.
  const ventas = ARCHIVOS_HISTORICOS.filter((archivo) => existsSync(archivo)).flatMap(
    (archivo) => (JSON.parse(readFileSync(archivo, "utf-8")) as ArchivoHistorico).ventas,
  );
  const productos = new Map((await db.producto.findMany()).map((p) => [p.nombre, p.id]));
  // Solo se vinculan clientes que ya existen (los crea el seed); el resto queda con el nombre.
  const clientes = new Map((await db.cliente.findMany()).map((c) => [c.nombre, c.id]));

  const sinNombre = [...new Set(ventas.map((v) => v.producto).filter((p) => !(p in nombres)))];
  if (sinNombre.length > 0) {
    throw new Error(`Productos del Excel sin nombre agrupado: ${sinNombre.join(", ")}. Agrégalos en importar-historico.ts.`);
  }

  await db.$transaction(async (tx) => {
    // Cada archivo manda sobre sus hojas: se borran las filas que ya no figuran (p. ej. notas renumeradas).
    for (const hoja of new Set(ventas.map((v) => v.hoja))) {
      const filas = ventas.filter((v) => v.hoja === hoja).map((v) => v.fila);
      await tx.ventaHistorica.deleteMany({ where: { hoja, fila: { notIn: filas } } });
    }
    // Lo que la dueña corrigió o eliminó en el Historial no se pisa (D43).
    const corregidas = new Set(
      (await tx.ventaHistorica.findMany({ where: { OR: [{ editada: true }, { eliminada: true }] }, select: { hoja: true, fila: true } })).map(
        (v) => `${v.hoja}|${v.fila}`,
      ),
    );
    for (const venta of ventas) {
      if (corregidas.has(`${venta.hoja}|${venta.fila}`)) continue;
      const agrupado = nombres[venta.producto] ?? venta.producto;
      const respaldo = RESPALDO[agrupado];
      const productoNombre = !productos.has(agrupado) && respaldo && productos.has(respaldo) ? respaldo : agrupado;
      const datos = {
        fecha: new Date(`${venta.fecha}T12:00:00`),
        fechaEstimada: venta.fechaEstimada,
        productoOriginal: venta.producto,
        productoNombre,
        productoId: productos.get(productoNombre) ?? null,
        cantidad: D(venta.cantidad),
        valor: D(venta.valor),
        comision: D(venta.comision),
        costo: venta.costo === null ? null : D(venta.costo),
        utilidad: venta.utilidad === null ? null : D(venta.utilidad),
        cliente: venta.cliente,
        clienteId: (venta.cliente && clientes.get(venta.cliente)) ?? null,
        sabores: venta.sabores ?? null,
      };
      await tx.ventaHistorica.upsert({
        where: { hoja_fila: { hoja: venta.hoja, fila: venta.fila } },
        create: { hoja: venta.hoja, fila: venta.fila, ...datos },
        update: datos,
      });
    }
  });
  return ventas.length;
}

async function main(): Promise<void> {
  const db = new PrismaClient();
  try {
    const importadas = await importarVentasHistoricas(db);
    const [total, vinculadas, suma] = await Promise.all([
      db.ventaHistorica.count(),
      db.ventaHistorica.count({ where: { productoId: { not: null } } }),
      db.ventaHistorica.aggregate({ _sum: { valor: true } }),
    ]);
    console.log(`Ventas históricas: ${importadas} importadas; en la BD hay ${total} (${vinculadas} vinculadas a un producto del ERP).`);
    console.log(`Total: Bs ${(suma._sum.valor ?? D("0")).toFixed(2)}`);
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const mensaje = error instanceof Error ? error.message : String(error);
    console.error(`Error al importar: ${mensaje}`);
    process.exitCode = 1;
  });
}
