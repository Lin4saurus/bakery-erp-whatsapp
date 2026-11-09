import { Router } from "express";
import { z } from "zod";
import { Prisma, type TipoCliente, type VentaHistorica } from "@prisma/client";
import { prisma } from "../prisma";
import { AppError } from "../errors";
import { alMenosUnCampo, decimalNoNegativo, decimalPositivo, parseId } from "../validacion";

const fechaDia = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD.")
  .optional();
const filtrosSchema = z.object({ desde: fechaDia, hasta: fechaDia });

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
    clienteId: z.string().uuid("Debe ser un id de cliente válido.").nullable().optional(),
    sabores: z.string().trim().max(300).nullable().optional(),
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

function agrupar(ventas: VentaHistorica[], clave: (v: VentaHistorica) => string): Map<string, Totales> {
  const grupos = new Map<string, Totales>();
  for (const v of ventas) grupos.set(clave(v), sumar(grupos.get(clave(v)) ?? vacio(), v));
  return grupos;
}

export const historicoRouter = Router();

// Ventas importadas del Excel (CONTEXT.md D24), con totales generales, por semana y por producto.
// Filtros opcionales por día (hora local), ambos inclusive. Solo lectura.
historicoRouter.get("/", async (req, res) => {
  const { desde, hasta } = filtrosSchema.parse(req.query);
  const fecha: Prisma.DateTimeFilter = {};
  if (desde) fecha.gte = new Date(`${desde}T00:00:00`);
  if (hasta) fecha.lte = new Date(`${hasta}T23:59:59.999`);

  const conCliente = await prisma.ventaHistorica.findMany({
    where: { fecha, eliminada: false },
    include: { clienteRegistrado: { select: { tipo: true } } },
    orderBy: [{ fecha: "asc" }, { hoja: "asc" }, { fila: "asc" }],
  });
  const tipos = new Map<number, TipoCliente | null>(conCliente.map((v) => [v.id, v.clienteRegistrado?.tipo ?? null]));
  const ventas: VentaHistorica[] = conCliente.map(({ clienteRegistrado: _cliente, ...v }) => v);

  const semanas = [...agrupar(ventas, (v) => lunesDe(v.fecha))].map(([semana, totales]) => ({ semana, ...totales }));
  const productoIds = new Map(ventas.map((v) => [v.productoNombre, v.productoId]));
  const productos = [...agrupar(ventas, (v) => v.productoNombre)]
    .map(([producto, totales]) => ({ producto, productoId: productoIds.get(producto) ?? null, ...totales }))
    .sort((a, b) => b.valor.comparedTo(a.valor));

  res.json({
    resumen: ventas.reduce(sumar, vacio()),
    semanas,
    productos,
    ventas: ventas.map(({ hoja: _hoja, fila: _fila, editada: _editada, eliminada: _eliminada, ...v }) => ({
      ...v,
      clienteTipo: tipos.get(v.id) ?? null,
    })),
  });
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
    venta.utilidad === null ? null : venta.utilidad.add(valor.sub(venta.valor)).sub((costo ?? venta.costo ?? cero).sub(venta.costo ?? cero));
  let cliente: { cliente: string | null; clienteId: string | null } | undefined;
  if (datos.clienteId === null) cliente = { cliente: null, clienteId: null };
  else if (datos.clienteId) {
    const ficha = await prisma.cliente.findUnique({ where: { id: datos.clienteId } });
    if (!ficha) throw new AppError(404, `No existe el cliente ${datos.clienteId}.`);
    cliente = { cliente: ficha.nombre, clienteId: ficha.id };
  }

  const actualizada = await prisma.ventaHistorica.update({
    where: { id },
    data: {
      cantidad,
      valor,
      costo,
      utilidad,
      ...(datos.fecha ? { fecha: new Date(`${datos.fecha}T12:00:00`), fechaEstimada: false } : {}),
      ...(cliente ?? {}),
      ...(datos.sabores !== undefined ? { sabores: datos.sabores || null } : {}),
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

