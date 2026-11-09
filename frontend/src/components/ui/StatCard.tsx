import type { ReactNode } from "react";
import "./StatCard.css";

export function Tarjeta({
  titulo,
  valor,
  detalle,
  tono,
  icono,
}: {
  titulo: string;
  valor: string;
  detalle?: ReactNode;
  tono?: "positivo" | "negativo";
  icono?: ReactNode;
}) {
  return (
    <div className="tarjeta">
      <div className="tarjeta-texto">
        <div className="tarjeta-titulo">{titulo}</div>
        <div className={`tarjeta-valor ${tono ?? ""}`}>{valor}</div>
        {detalle && <div className="tarjeta-detalle">{detalle}</div>}
      </div>
      {icono && (
        <div className="tarjeta-icono" aria-hidden>
          {icono}
        </div>
      )}
    </div>
  );
}
