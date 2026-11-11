// «Registrar compra» en Insumos deja aquí el insumo y abre Gastos, que lo toma una sola vez
// para empezar la compra con ese insumo ya elegido (D51: las compras se cargan en Gastos).
let pendiente: number | null = null;

export function prepararCompra(insumoId: number): void {
  pendiente = insumoId;
}

export function tomarCompra(): number | null {
  const insumoId = pendiente;
  pendiente = null;
  return insumoId;
}

// «Actualizar stock» desde las alertas del Inicio (D72): Insumos abre ese insumo con el formulario de stock.
let ajustePendiente: number | null = null;

export function prepararAjuste(insumoId: number): void {
  ajustePendiente = insumoId;
}

export function tomarAjuste(): number | null {
  const insumoId = ajustePendiente;
  ajustePendiente = null;
  return insumoId;
}

// Un día tocado en «Últimos 7 días» del Inicio (D72): Desempeño lo muestra en «Por producto».
let diaPendiente: string | null = null;

export function prepararDia(dia: string): void {
  diaPendiente = dia;
}

export function tomarDia(): string | null {
  const dia = diaPendiente;
  diaPendiente = null;
  return dia;
}
