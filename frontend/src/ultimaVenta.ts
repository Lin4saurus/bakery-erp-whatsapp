import type { PedidoCreado } from "./api";

// La Caja deja aquí el pedido recién registrado y vuelve a Inicio,
// que lo muestra una sola vez como confirmación.
let pendiente: PedidoCreado | null = null;

export function guardarUltimaVenta(pedido: PedidoCreado): void {
  pendiente = pedido;
}

export function tomarUltimaVenta(): PedidoCreado | null {
  const pedido = pendiente;
  pendiente = null;
  return pedido;
}
