import { useState } from "react";
import { MdOutlineBackup } from "react-icons/md";
import { api, mensajeDeError } from "../../api";
import { useDatos } from "../../hooks/useDatos";
import "./EstadoRespaldo.css";

const hace = (fechaISO: string): string => {
  const minutos = Math.round((Date.now() - new Date(fechaISO).getTime()) / 60_000);
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  return `hace ${dias} día${dias === 1 ? "" : "s"}`;
};

// Pie del menú: cuándo fue el último respaldo y un botón para hacer uno al momento.
export function EstadoRespaldo() {
  const lista = useDatos(api.respaldos);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const respaldar = async () => {
    setGuardando(true);
    setError(null);
    try {
      await api.respaldar();
      await lista.recargar();
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  };

  const ultimo = lista.datos?.respaldos[0];
  const viejo = !ultimo || Date.now() - new Date(ultimo.fecha).getTime() > 2 * 24 * 3_600_000;

  return (
    <div className="estado-respaldo" title={lista.datos ? `Carpeta: ${lista.datos.carpeta}` : undefined}>
      <div className="estado-respaldo__linea">
        <MdOutlineBackup className="estado-respaldo__icono" aria-hidden />
        <span>
          Último respaldo:{" "}
          <span className={viejo ? "estado-respaldo__viejo" : undefined}>
            {lista.cargando && !lista.datos ? "…" : ultimo ? hace(ultimo.fecha) : "nunca"}
          </span>
        </span>
      </div>
      <button className="estado-respaldo__boton" disabled={guardando} onClick={() => void respaldar()}>
        {guardando ? "Respaldando…" : "Respaldar ahora"}
      </button>
      {(error ?? lista.error) && <div className="estado-respaldo__error">{error ?? lista.error}</div>}
    </div>
  );
}
