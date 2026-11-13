import { useRef, type ComponentType, type KeyboardEvent } from "react";
import "./Opciones.css";

export interface Opcion<T extends string> {
  valor: T;
  texto: string;
  icono?: ComponentType<{ "aria-hidden"?: boolean }>;
}

// Botones de opción («Recoge / Delivery», «¿Ya pagó?»…) con el mismo aspecto en todo el ERP (M5, AUDITORIA.md).
// Se manejan como radios de verdad (U3): Tab entra solo en la elegida y las flechas ← → ↑ ↓ cambian de opción.
// `ancho="completo"` reparte el ancho entre las opciones (paneles angostos, como la Caja).
export function Opciones<T extends string>({
  etiqueta,
  valor,
  opciones,
  alCambiar,
  ancho = "ajustado",
  mostrarEtiqueta = true,
}: {
  etiqueta: string;
  valor: T;
  opciones: readonly Opcion<T>[];
  alCambiar: (valor: T) => void;
  ancho?: "ajustado" | "completo";
  mostrarEtiqueta?: boolean;
}) {
  const botones = useRef<(HTMLButtonElement | null)[]>([]);
  const actual = Math.max(
    0,
    opciones.findIndex((o) => o.valor === valor),
  );

  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    const paso = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (paso === 0) return;
    e.preventDefault();
    const siguiente = (actual + paso + opciones.length) % opciones.length;
    const opcion = opciones[siguiente];
    if (!opcion) return;
    alCambiar(opcion.valor);
    botones.current[siguiente]?.focus();
  };

  return (
    <div className="opciones">
      {mostrarEtiqueta && <span className="campo-etiqueta">{etiqueta}</span>}
      <div className={`opciones__grupo opciones__grupo--${ancho}`} role="radiogroup" aria-label={etiqueta} onKeyDown={alTeclear}>
        {opciones.map((o, i) => {
          const elegida = i === actual;
          const Icono = o.icono;
          return (
            <button
              key={o.valor}
              ref={(b) => {
                botones.current[i] = b;
              }}
              type="button"
              role="radio"
              aria-checked={elegida}
              tabIndex={elegida ? 0 : -1}
              className={`opciones__opcion ${elegida ? "opciones__opcion--elegida" : ""}`}
              onClick={() => alCambiar(o.valor)}
            >
              {Icono && <Icono aria-hidden />} {o.texto}
            </button>
          );
        })}
      </div>
    </div>
  );
}
