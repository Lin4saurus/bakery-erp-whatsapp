import type { Producto, Venta } from "../../api";

// Indicador del Dashboard. Solo para mostrar: los montos guardados los calcula la API con Decimal.

// TODO: Conectar con módulo de gastos fijos
export const GASTOS_FIJOS_MENSUALES = 300; // Bs, valor de prueba

const suma = (ventas: Venta[], campo: "totalVenta" | "costoTotal" | "cantidad"): number =>
  ventas.reduce((total, v) => total + Number(v[campo]), 0);

export type NivelEquilibrio = "lejos" | "cerca" | "superado";

export interface PuntoDeEquilibrio {
  gastosFijos: number;
  margenPromedio: number; // Bs que deja cada producto vendido, en promedio
  origenMargen: "ventas del mes" | "catálogo";
  meta: number | null; // productos a vender en el mes; null si el margen no es positivo
  vendidos: number;
  avance: number; // vendidos / meta (puede pasar de 1)
  nivel: NivelEquilibrio;
}

export const UMBRAL_CERCA = 0.75;

// Punto de equilibrio = gastos fijos / margen de contribución promedio.
// El margen sale de lo vendido en el mes (ponderado por unidades); si todavía no hay ventas,
// del promedio simple del catálogo activo (precio − costo de cada producto).
export function puntoDeEquilibrio(ventasMes: Venta[], productos: Producto[], gastosFijos: number): PuntoDeEquilibrio {
  const vigentes = ventasMes.filter((v) => !v.anulada);
  const vendidos = suma(vigentes, "cantidad");

  let margenPromedio: number;
  let origenMargen: PuntoDeEquilibrio["origenMargen"];
  if (vendidos > 0) {
    margenPromedio = (suma(vigentes, "totalVenta") - suma(vigentes, "costoTotal")) / vendidos;
    origenMargen = "ventas del mes";
  } else {
    const conPrecio = productos.filter((p) => p.tipo === "VENTA" && p.activo && p.precioVenta !== null);
    margenPromedio =
      conPrecio.length > 0
        ? conPrecio.reduce((t, p) => t + Number(p.precioVenta) - Number(p.costoUnitario), 0) / conPrecio.length
        : 0;
    origenMargen = "catálogo";
  }

  const meta = margenPromedio > 0 ? Math.ceil(gastosFijos / margenPromedio) : null;
  const avance = meta === null ? 0 : meta === 0 ? 1 : vendidos / meta; // sin gastos fijos, ya está cubierto
  const nivel: NivelEquilibrio = meta !== null && avance >= 1 ? "superado" : avance >= UMBRAL_CERCA ? "cerca" : "lejos";

  return { gastosFijos, margenPromedio, origenMargen, meta, vendidos, avance, nivel };
}
