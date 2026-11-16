import { useCallback, useState } from "react";
import { MdOutlineBackup, MdOutlineMarkEmailRead, MdOutlineMailOutline } from "react-icons/md";
import { api, mensajeDeError } from "../../api";
import { useDatos } from "../../hooks/useDatos";
import { CorreoRespaldo } from "./CorreoRespaldo";
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

// Pie del menú: cuándo fue el último respaldo, un botón para hacer uno al momento y, debajo, el respaldo por correo
// (D111): a qué Gmail va y cuándo llegó el último.
export function EstadoRespaldo({ compacto = false }: { compacto?: boolean }) {
  const lista = useDatos(api.respaldos);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configurando, setConfigurando] = useState(false);
  const cerrarCorreo = useCallback(() => setConfigurando(false), []);

  const respaldar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const r = await api.respaldar();
      if (r.correo && !r.correo.enviado) setError(`Respaldo guardado en la portátil. ${r.correo.error}`);
      await lista.recargar();
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  };

  const ultimo = lista.datos?.respaldos[0];
  const correo = lista.datos?.correo;
  const viejo = !ultimo || Date.now() - new Date(ultimo.fecha).getTime() > 2 * 24 * 3_600_000;
  const cuando = lista.cargando && !lista.datos ? "…" : ultimo ? hace(ultimo.fecha) : "nunca";
  const textoCorreo = !correo?.correo
    ? "Respaldo por correo: sin configurar"
    : correo.error
      ? `Correo: ${correo.error}`
      : `Correo: ${correo.ultimoEnvio ? `enviado ${hace(correo.ultimoEnvio)}` : "todavía sin envíos"}`;
  const ventana = configurando && (
    <CorreoRespaldo estado={correo} cerrar={cerrarCorreo} cambio={() => void lista.recargar()} />
  );

  // Menú de solo íconos (D62): un botón con el ícono; el detalle va en el texto al pasar el mouse.
  if (compacto) {
    return (
      <button
        className={`estado-respaldo__compacto ${viejo ? "estado-respaldo__viejo" : ""}`}
        disabled={guardando}
        onClick={() => void respaldar()}
        title={`Último respaldo: ${cuando}. ${textoCorreo}. Tocar para respaldar ahora.${error ? ` ${error}` : ""}`}
        aria-label={`Respaldar ahora. Último respaldo: ${cuando}`}
      >
        <MdOutlineBackup aria-hidden />
      </button>
    );
  }

  return (
    <div className="estado-respaldo" title={lista.datos ? `Carpeta: ${lista.datos.carpeta}` : undefined}>
      <div className="estado-respaldo__linea">
        <MdOutlineBackup className="estado-respaldo__icono" aria-hidden />
        <span>
          Último respaldo:{" "}
          <span className={viejo ? "estado-respaldo__viejo" : undefined}>
            {cuando}
          </span>
        </span>
      </div>
      <button className="estado-respaldo__boton" disabled={guardando} onClick={() => void respaldar()}>
        {guardando ? (correo?.correo ? "Respaldando y enviando…" : "Respaldando…") : "Respaldar ahora"}
      </button>
      {lista.datos && (
        <button
          type="button"
          className={`estado-respaldo__correo ${correo?.error ? "estado-respaldo__correo--error" : ""}`}
          onClick={() => setConfigurando(true)}
          title={correo?.correo ? `Se manda a ${correo.correo}. Tocar para cambiarlo.` : "Mandar cada respaldo al Gmail del negocio"}
        >
          {correo?.correo && !correo.error ? (
            <MdOutlineMarkEmailRead className="estado-respaldo__icono" aria-hidden />
          ) : (
            <MdOutlineMailOutline className="estado-respaldo__icono" aria-hidden />
          )}
          <span>{correo?.correo ? textoCorreo : "Mandar al correo…"}</span>
        </button>
      )}
      {(error ?? lista.error) && <div className="estado-respaldo__error">{error ?? lista.error}</div>}
      {ventana}
    </div>
  );
}
