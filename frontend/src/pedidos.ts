import type { EstadoPedido, Pedido } from "./api";
import { hoyISO } from "./formato";

// Ayudas compartidas por la pantalla Pedidos, el Inicio y el menú (D81).

export const nombreEstado: Record<EstadoPedido, string> = {
  POR_PAGAR: "Cotización", // todavía no pagó: puede retirarse (D89)
  PENDIENTE: "Agendado",
  EN_PREPARACION: "En preparación",
  LISTO: "Listo",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
};

// Color de la etiqueta de cada estado (clases de Badge.css).
export const claseEstado: Record<EstadoPedido, string> = {
  POR_PAGAR: "etiqueta-negativa",
  PENDIENTE: "etiqueta-neutra",
  EN_PREPARACION: "etiqueta-alerta",
  LISTO: "etiqueta-mayorista",
  ENTREGADO: "etiqueta-positiva",
  CANCELADO: "etiqueta-negativa",
};

// El siguiente paso de cada estado y el texto de su botón. «Por pagar» avanza con «Registrar pago» (D86).
export const siguiente: Partial<Record<EstadoPedido, { estado: EstadoPedido; accion: string }>> = {
  PENDIENTE: { estado: "EN_PREPARACION", accion: "Empezar a preparar" },
  EN_PREPARACION: { estado: "LISTO", accion: "Marcar listo" },
  LISTO: { estado: "ENTREGADO", accion: "Entregar" },
};

export const nombreMetodo = { QR: "QR", EFECTIVO: "Efectivo" } as const;

// Abre un comprobante (data URL) en otra pestaña. La pestaña se abre antes de esperar al servidor
// para que el navegador no la bloquee como ventana emergente.
// Solo se abren en una pestaña los formatos que no ejecutan código; cualquier otro se descarga (S1, AUDITORIA.md).
const TIPOS_SEGUROS = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "application/pdf"]);

export async function abrirArchivo(obtener: () => Promise<string>) {
  const ventana = window.open("", "_blank");
  try {
    const dataUrl = await obtener();
    const original = await (await fetch(dataUrl)).blob();
    const seguro = TIPOS_SEGUROS.has(original.type.toLowerCase());
    // Un tipo raro se entrega como binario genérico: el navegador lo descarga en vez de interpretarlo.
    const archivo = seguro ? original : new Blob([original], { type: "application/octet-stream" });
    const url = URL.createObjectURL(archivo);
    if (ventana) ventana.location.href = url;
    else window.open(url, "_blank");
  } catch (e) {
    ventana?.close();
    throw e;
  }
}
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
// Los que esperan pago no cuentan: todavía no están agendados (D86).
export function urgentes(todos: Pedido[], hoy = hoyISO()) {
  const pedidos = todos.filter((p) => p.estado !== "POR_PAGAR");
  const atrasados = pedidos.filter((p) => p.fechaEntrega < hoy).length;
  const deHoy = pedidos.filter((p) => p.fechaEntrega === hoy).length;
  const deManana = pedidos.filter((p) => p.fechaEntrega === diaMas(hoy, 1)).length;
  return { atrasados, deHoy, deManana, total: atrasados + deHoy };
}

// Lo que hay que preparar: unidades por producto de los pedidos dados (sin los ya listos).
export function paraPreparar(pedidos: Pedido[]) {
  const porProducto = new Map<string, number>();
  for (const p of pedidos) {
    if (p.estado === "LISTO" || p.estado === "POR_PAGAR") continue; // sin pago no se prepara
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
