import { Router } from "express";
import { z } from "zod";
import { Prisma, type TipoCliente, type VentaHistorica } from "@prisma/client";
import { prisma } from "../prisma";
import { AppError } from "../errors";
import { alMenosUnCampo, decimalNoNegativo, decimalPositivo, parseId } from "../validacion";
import { guardarFilas, leerExcel, plantillaExcel, revisarFilas } from "../services/ventasAnteriores";

const fechaDia = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD.")
  .optional();
// clienteId (D127): el historial de un cliente pide solo lo suyo, no todas las ventas.
const filtrosSchema = z.object({ desde: fechaDia, hasta: fechaDia, clienteId: z.string().min(1).max(64).optional() });

// Corrección desde el Historial (D43).
const editarSchema = z
  .object({
    fecha: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD.")
      .refine((dia) => new Date(`${dia}T12:00:00`).toLocaleDateString("sv-SE") === dia, "No es una fecha válida.")
      .refine((dia) => dia <= new Date().toLocaleDateString("sv-SE"), "No puede ser una fecha futura.")
      .optional(),
    cantidad: decimalPositivo.optional(),
    valor: decimalNoNegativo.optional(),
  })
  .refine(alMenosUnCampo, "Envía al menos un campo para corregir.");

interface Totales {
  ventas: number;
  unidades: Prisma.Decimal;
  valor: Prisma.Decimal;
  comision: Prisma.Decimal;
  costo: Prisma.Decimal;
  utilidad: Prisma.Decimal;
}

const cero = new Prisma.Decimal(0);
const vacio = (): Totales => ({ ventas: 0, unidades: cero, valor: cero, comision: cero, costo: cero, utilidad: cero });
const sumar = (t: Totales, v: VentaHistorica): Totales => ({
  ventas: t.ventas + 1,
  unidades: t.unidades.add(v.cantidad),
  valor: t.valor.add(v.valor),
  comision: t.comision.add(v.comision),
  costo: t.costo.add(v.costo ?? 0), // las notas de 2026 no traen costo ni utilidad
  utilidad: t.utilidad.add(v.utilidad ?? 0),
});

// Lunes (AAAA-MM-DD, hora local) de la semana de una fecha.
const lunesDe = (fecha: Date): string => {
  const lunes = new Date(fecha);
  lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7));
  return lunes.toLocaleDateString("sv-SE");
};

// Una nota de varios sabores son varias líneas con la misma hoja + fila (D57): cuenta como un pedido.
const clavePedido = (v: VentaHistorica) => `${v.hoja}|${v.fila}`;
const totalizar = (ventas: VentaHistorica[]): Totales => ({
  ...ventas.reduce(sumar, vacio()),
  ventas: new Set(ventas.map(clavePedido)).size,
});

function agrupar(ventas: VentaHistorica[], clave: (v: VentaHistorica) => string): Map<string, Totales> {
  const grupos = new Map<string, VentaHistorica[]>();
  for (const v of ventas) grupos.set(clave(v), [...(grupos.get(clave(v)) ?? []), v]);
  return new Map([...grupos].map(([k, vs]) => [k, totalizar(vs)]));
}

export const historicoRouter = Router();

// Ventas importadas del Excel (CONTEXT.md D24), con totales generales, por semana y por producto.
// Filtros opcionales por día (hora local), ambos inclusive. Solo lectura.
historicoRouter.get("/", async (req, res) => {
  const { desde, hasta, clienteId } = filtrosSchema.parse(req.query);
  const fecha: Prisma.DateTimeFilter = {};
  if (desde) fecha.gte = new Date(`${desde}T00:00:00`);
  if (hasta) fecha.lte = new Date(`${hasta}T23:59:59.999`);

  const conCliente = await prisma.ventaHistorica.findMany({
    where: { fecha, eliminada: false, ...(clienteId ? { clienteId } : {}) },
    include: { clienteRegistrado: { select: { tipo: true } }, producto: { select: { categoria: true } } },
    orderBy: [{ fecha: "asc" }, { hoja: "asc" }, { fila: "asc" }, { linea: "asc" }],
  });
  const tipos = new Map<number, TipoCliente | null>(conCliente.map((v) => [v.id, v.clienteRegistrado?.tipo ?? null]));
  const familias = new Map<number, string | null>(conCliente.map((v) => [v.id, v.producto?.categoria ?? null]));
  const ventas: VentaHistorica[] = conCliente.map(({ clienteRegistrado: _cliente, producto: _producto, ...v }) => v);
  const lineasPorPedido = new Map<string, number>();
  for (const v of ventas) lineasPorPedido.set(clavePedido(v), (lineasPorPedido.get(clavePedido(v)) ?? 0) + 1);

  const semanas = [...agrupar(ventas, (v) => lunesDe(v.fecha))].map(([semana, totales]) => ({ semana, ...totales }));
  const productoIds = new Map(ventas.map((v) => [v.productoNombre, v.productoId]));
  const productos = [...agrupar(ventas, (v) => v.productoNombre)]
    .map(([producto, totales]) => ({ producto, productoId: productoIds.get(producto) ?? null, ...totales }))
    .sort((a, b) => b.valor.comparedTo(a.valor));

  res.json({
    resumen: totalizar(ventas),
    semanas,
    productos,
    ventas: ventas.map(({ hoja, fila, editada: _editada, eliminada: _eliminada, ...v }) => ({
      ...v,
      clienteTipo: tipos.get(v.id) ?? null,
      familia: familias.get(v.id) ?? null, // Queques, Brownies… (D55)
      // Las líneas de una misma nota se muestran como un pedido desplegable, como los de la Caja (D57).
      pedidoId: (lineasPorPedido.get(`${hoja}|${fila}`) ?? 0) > 1 ? `h-${hoja}-${fila}` : null,
    })),
  });
});

// ---------- Ventas de antes del ERP (D121) ----------

// Plantilla de Excel para llenar: columnas, dos filas de ejemplo, ayuda y la lista de productos.
historicoRouter.get("/plantilla", async (_req, res) => {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="plantilla_ventas_anteriores.xlsx"');
  res.send(await plantillaExcel());
});

const filaAnteriorSchema = z.object({
  fecha: z.string(),
  producto: z.string().max(200),
  cantidad: z.number().finite(),
  total: z.number().finite(),
  cliente: z.string().max(100).nullable().optional(),
});
const anotarSchema = z.object({ ventas: z.array(filaAnteriorSchema).min(1, "Anota al menos una venta.").max(500) });

// Una por una desde la pantalla: si alguna fila tiene un error no se guarda nada y se dice cuál.
historicoRouter.post("/anotar", async (req, res) => {
  const { ventas } = anotarSchema.parse(req.body);
  const revisadas = await revisarFilas(ventas.map((v, i) => ({ ...v, numero: i + 1 })));
  const conError = revisadas.filter((f) => f.error);
  if (conError.length > 0) {
    throw new AppError(
      400,
      "Revisa las filas marcadas.",
      conError.map((f) => ({ campo: `fila ${f.numero}`, mensaje: f.error as string })),
    );
  }
  const guardadas = await guardarFilas(revisadas, "Anotadas en el ERP");
  res.status(201).json({ guardadas, sinReceta: revisadas.filter((f) => f.productoId === null).length });
});

// Desde Excel: con `probar` solo revisa y devuelve cada fila (lo que se va a guardar y qué tiene error);
// sin `probar` guarda las filas buenas y salta las que tienen error.
const importarSchema = z.object({ nombre: z.string().max(200), archivo: z.string().min(1) });
historicoRouter.post("/importar", async (req, res) => {
  const { nombre, archivo } = importarSchema.parse(req.body);
  const probar = req.query.probar === "1";
  let filas;
  try {
    filas = await leerExcel(Buffer.from(archivo, "base64"));
  } catch {
    throw new AppError(400, "No se pudo leer el archivo: súbelo como Excel (.xlsx).");
  }
  if (filas.length === 0) {
    throw new AppError(400, "No encontré ventas: la primera hoja necesita columnas «Fecha» y «Producto» (usa la plantilla).");
  }
  const revisadas = await revisarFilas(filas);
  if (probar) {
    res.json({ filas: revisadas });
    return;
  }
  const guardadas = await guardarFilas(revisadas, `Excel: ${nombre}`.slice(0, 120));
  res.status(201).json({ guardadas, saltadas: revisadas.length - guardadas, sinReceta: revisadas.filter((f) => !f.error && f.productoId === null).length });
});

async function buscarVigente(id: number) {
  const venta = await prisma.ventaHistorica.findUnique({ where: { id } });
  if (!venta || venta.eliminada) throw new AppError(404, `No existe la venta ${id} del historial.`);
  return venta;
}

// Corrige una venta anotada antes del sistema. Si el Excel traía costo, se ajusta en proporción a la
// cantidad y la utilidad sigue la diferencia de valor y costo. Queda marcada para que reimportar no la pise.
historicoRouter.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const datos = editarSchema.parse(req.body);
  const venta = await buscarVigente(id);

  const cantidad = datos.cantidad ?? venta.cantidad;
  const valor = datos.valor ?? venta.valor;
  const costo = venta.costo === null ? null : venta.costo.mul(cantidad).div(venta.cantidad);
  const utilidad =
    venta.utilidad === null
      ? null
      : venta.utilidad.add(valor.sub(venta.valor)).sub((costo ?? venta.costo ?? cero).sub(venta.costo ?? cero));

  const actualizada = await prisma.ventaHistorica.update({
    where: { id },
    data: {
      cantidad,
      valor,
      costo,
      utilidad,
      ...(datos.fecha ? { fecha: new Date(`${datos.fecha}T12:00:00`), fechaEstimada: false } : {}),
      editada: true,
    },
  });
  const { hoja: _hoja, fila: _fila, editada: _editada, eliminada: _eliminada, ...resto } = actualizada;
  res.json(resto);
});

// Elimina una venta del historial (pedido cancelado o anotado por error). Se marca y deja de verse y de sumar;
// no se borra la fila para que volver a importar el Excel o las notas no la reviva.
historicoRouter.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  await buscarVigente(id);
  await prisma.ventaHistorica.update({ where: { id }, data: { eliminada: true, editada: true } });
  res.json({ eliminada: id });
});

// Elimina todas las líneas (sabores) de una misma nota a partir de cualquiera de ellas (D57).
historicoRouter.delete("/:id/pedido", async (req, res) => {
  const id = parseId(req.params.id);
  const venta = await buscarVigente(id);
  const { count } = await prisma.ventaHistorica.updateMany({
    where: { hoja: venta.hoja, fila: venta.fila, eliminada: false },
    data: { eliminada: true, editada: true },
  });
  res.json({ eliminadas: count });
});
