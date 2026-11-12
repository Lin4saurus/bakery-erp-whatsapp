import type { EstadoPedido, Pedido } from "./api";
import { hoyISO } from "./formato";

// Ayudas compartidas por la pantalla Pedidos, el Inicio y el menú (D81).

export const nombreEstado: Record<EstadoPedido, string> = {
  PENDIENTE: "Pendiente",
  EN_PREPARACION: "En preparación",
  LISTO: "Listo",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
};

// Color de la etiqueta de cada estado (clases de Badge.css).
export const claseEstado: Record<EstadoPedido, string> = {
  PENDIENTE: "etiqueta-neutra",
  EN_PREPARACION: "etiqueta-alerta",
  LISTO: "etiqueta-mayorista",
  ENTREGADO: "etiqueta-positiva",
  CANCELADO: "etiqueta-negativa",
};

// El siguiente paso de cada estado y el texto de su botón.
export const siguiente: Partial<Record<EstadoPedido, { estado: EstadoPedido; accion: string }>> = {
  PENDIENTE: { estado: "EN_PREPARACION", accion: "Empezar a preparar" },
  EN_PREPARACION: { estado: "LISTO", accion: "Marcar listo" },
  LISTO: { estado: "ENTREGADO", accion: "Entregar y cobrar" },
};
export const anterior: Partial<Record<EstadoPedido, EstadoPedido>> = {
  EN_PREPARACION: "PENDIENTE",
  LISTO: "EN_PREPARACION",
};

export const diaMas = (dia: string, dias: number): string => {
  const fecha = new Date(`${dia}T12:00:00`);
  fecha.setDate(fecha.getDate() + dias);
  return fecha.toLocaleDateString("sv-SE");
};

export const esAtrasado = (p: Pedido, hoy = hoyISO()) => p.fechaEntrega < hoy;

// «Hoy», «Mañana», «Ayer» o «Viernes, 14 nov».
export function nombreDia(dia: string, hoy = hoyISO()): string {
  if (dia === hoy) return "Hoy";
  if (dia === diaMas(hoy, 1)) return "Mañana";
  if (dia === diaMas(hoy, -1)) return "Ayer";
  const texto = new Date(`${dia}T12:00:00`).toLocaleDateString("es-BO", { weekday: "long", day: "numeric", month: "short" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export const fechaLarga = (dia: string) =>
  new Date(`${dia}T12:00:00`).toLocaleDateString("es-BO", { weekday: "long", day: "numeric", month: "long" });

// Cuántos pedidos piden atención: atrasados y los de hoy (insignia del menú y aviso del Inicio).
export function urgentes(pedidos: Pedido[], hoy = hoyISO()) {
  const atrasados = pedidos.filter((p) => p.fechaEntrega < hoy).length;
  const deHoy = pedidos.filter((p) => p.fechaEntrega === hoy).length;
  const deManana = pedidos.filter((p) => p.fechaEntrega === diaMas(hoy, 1)).length;
  return { atrasados, deHoy, deManana, total: atrasados + deHoy };
}

// Lo que hay que preparar: unidades por producto de los pedidos dados (sin los ya listos).
export function paraPreparar(pedidos: Pedido[]) {
  const porProducto = new Map<string, number>();
  for (const p of pedidos) {
    if (p.estado === "LISTO") continue;
    for (const l of p.lineas) porProducto.set(l.producto, (porProducto.get(l.producto) ?? 0) + Number(l.cantidad));
  }
  return [...porProducto.entries()]
    .map(([producto, unidades]) => ({ producto, unidades }))
    .sort((a, b) => b.unidades - a.unidades || a.producto.localeCompare(b.producto, "es"));
}

// Ubicación de un delivery (D85): el enlace que mandó el cliente o, si es una dirección, una búsqueda en Google Maps.
export const enlaceMapa = (ubicacion: string): string =>
  /^https?:\/\//i.test(ubicacion.trim())
    ? ubicacion.trim()
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ubicacion.trim())}`;
