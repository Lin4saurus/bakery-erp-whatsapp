import type { TipoCliente } from "../../api";

// Minorista en gris (también las ventas sin cliente), mayorista en azul.
export function TipoClienteBadge({ tipo }: { tipo: TipoCliente | null }) {
  return tipo === "MAYORISTA" ? (
    <span className="etiqueta etiqueta-mayorista">Mayorista</span>
  ) : (
    <span className="etiqueta etiqueta-neutra">Minorista</span>
  );
}
