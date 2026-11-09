import type { ReactNode } from "react";
import "./Field.css";

// `equivalencia`: lo escrito en otra unidad, bien visible (ej. 8000 ml → «8 L»).
export function Campo({
  etiqueta,
  children,
  ayuda,
  equivalencia,
}: {
  etiqueta: string;
  children: ReactNode;
  ayuda?: string;
  equivalencia?: string | null;
}) {
  return (
    <label className="campo">
      <span className="campo-etiqueta">{etiqueta}</span>
      {children}
      {equivalencia && (
        <span className="campo-equivalencia">
          = <strong>{equivalencia}</strong>
        </span>
      )}
      {ayuda && <span className="campo-ayuda">{ayuda}</span>}
    </label>
  );
}
