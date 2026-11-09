import type { Cliente, Producto } from "./api";

// Misma regla que la API (backend/src/services/precios.ts), solo para mostrar el precio antes de vender:
// si el cliente tiene precio acordado para el producto, ese; si no, el precio de venta (se puede cambiar).
export interface PrecioMostrado {
  precio: string | null;
  acordado: boolean; // true = lo fija el acuerdo con el cliente (no se edita en la Caja)
}

export function precioParaCliente(cliente: Cliente | null, producto: Producto): PrecioMostrado {
  const acordado = cliente?.precios.find((p) => p.productoId === producto.id);
  return acordado ? { precio: acordado.precio, acordado: true } : { precio: producto.precioVenta, acordado: false };
}
