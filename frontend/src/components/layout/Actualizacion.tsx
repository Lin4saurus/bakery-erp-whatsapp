import { useCallback, useEffect, useRef, useState } from "react";
import { MdOutlineSystemUpdateAlt } from "react-icons/md";
import { api, mensajeDeError, type EstadoActualizacion } from "../../api";
import { Aviso, Button, Ventana } from "../../ui";
import "./Actualizacion.css";

// Actualización desde GitHub (D112): aviso en el Inicio, versión en el pie del menú y la ventana que muestra el avance
// mientras el ERP baja la versión nueva, se reinicia y vuelve.

const megas = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function Instalando({ version, cerrar }: { version: string; cerrar: () => void }) {
  const [estado, setEstado] = useState<EstadoActualizacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [esperando, setEsperando] = useState(false); // el servidor se reinicia
  const [tarda, setTarda] = useState(false);
  const empezado = useRef(false);

  useEffect(() => {
    if (empezado.current) return;
    empezado.current = true;
    let vivo = true;
    let inicioEspera = 0;
    const seguir = async () => {
      while (vivo) {
        await new Promise((r) => window.setTimeout(r, 1_000));
        if (inicioEspera === 0) {
          try {
            const e = await api.avanceActualizacion();
            setEstado(e);
            if (e.proceso?.estado === "error") {
              setError(e.proceso.error ?? "No se pudo actualizar.");
              return;
            }
            if (e.proceso?.estado === "reiniciando") inicioEspera = Date.now();
          } catch {
            inicioEspera = Date.now(); // el servidor ya se cerró para actualizarse
          }
          if (inicioEspera !== 0) setEsperando(true);
        } else {
          // Vuelve con la versión nueva: se recarga la página (pedirá el PIN otra vez).
          if ((await api.versionServidor()) === version) {
            window.location.reload();
            return;
          }
          if (Date.now() - inicioEspera > 180_000) setTarda(true);
        }
      }
    };
    api
      .instalarActualizacion()
      .then((e) => {
        setEstado(e);
        void seguir();
      })
      .catch((e) => setError(mensajeDeError(e)));
    return () => {
      vivo = false;
    };
  }, [version]);

  const p = estado?.proceso;
  const porcentaje = p && p.total > 0 ? Math.min(100, Math.round((p.bajado / p.total) * 100)) : 0;
  const texto = esperando
    ? "Instalando y reiniciando el ERP… no cierres esta ventana."
    : p?.estado === "preparando"
      ? "Guardando un respaldo de tus datos y preparando la versión nueva…"
      : `Bajando la versión ${version}… ${p ? `${megas(p.bajado)} de ${megas(p.total)}` : ""}`;

  return (
    <Ventana titulo={`Actualizando a la versión ${version}`} cerrar={error || tarda ? cerrar : () => undefined}>
      <div className="actualizacion">
        {error ? (
          <>
            <Aviso tipo="error">{error}</Aviso>
            <p className="secundario">El ERP sigue funcionando con la versión de antes. Puedes intentarlo más tarde.</p>
            <Button onClick={cerrar}>Cerrar</Button>
          </>
        ) : tarda ? (
          <Aviso tipo="alerta">
            El ERP está tardando en volver. Abre el ícono «Dulzura ERP» del escritorio; si no arranca, revisa
            C:\DulzuraERP\logs\actualizacion.log.
          </Aviso>
        ) : (
          <>
            <p>{texto}</p>
            <div className="actualizacion__barra" aria-hidden>
              <div
                className={`actualizacion__relleno ${esperando || p?.estado === "preparando" ? "actualizacion__relleno--ocupado" : ""}`}
                style={{ width: `${esperando || p?.estado === "preparando" ? 100 : porcentaje}%` }}
              />
            </div>
            <p className="secundario">Tus ventas, clientes y tu PIN no se tocan. Al terminar, el ERP te pedirá el PIN.</p>
          </>
        )}
      </div>
    </Ventana>
  );
}

// Aviso del Inicio: solo en la portátil instalada y si hay una versión más nueva publicada.
export function AvisoActualizacion() {
  const [estado, setEstado] = useState<EstadoActualizacion | null>(null);
  const [instalando, setInstalando] = useState(false);
  useEffect(() => {
    api
      .actualizacion()
      .then(setEstado)
      .catch(() => undefined);
  }, []);
  const cerrar = useCallback(() => setInstalando(false), []);
  const d = estado?.puede ? estado.disponible : null;
  if (!d) return null;
  return (
    <Aviso tipo="alerta">
      <span className="actualizacion__aviso">
        <span>
          <strong>Hay una versión nueva del ERP ({d.version}).</strong> {d.notas}
          <span className="secundario"> · Baja {megas(d.bytes)}; tus datos no se tocan.</span>
        </span>
        <Button tamano="chico" variante="primario" onClick={() => setInstalando(true)}>
          <MdOutlineSystemUpdateAlt aria-hidden /> Actualizar ahora
        </Button>
      </span>
      {instalando && <Instalando version={d.version} cerrar={cerrar} />}
    </Aviso>
  );
}

// Pie del menú: la versión instalada y «Buscar actualización».
export function VersionErp() {
  const [estado, setEstado] = useState<EstadoActualizacion | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [instalando, setInstalando] = useState(false);
  const cerrar = useCallback(() => setInstalando(false), []);
  useEffect(() => {
    api
      .actualizacion()
      .then(setEstado)
      .catch(() => undefined);
  }, []);

  const buscar = async () => {
    setBuscando(true);
    setMensaje(null);
    try {
      const e = await api.actualizacion(true);
      setEstado(e);
      setMensaje(e.error ?? (e.disponible ? null : "Estás al día."));
    } catch (e) {
      setMensaje(mensajeDeError(e));
    } finally {
      setBuscando(false);
    }
  };

  if (!estado) return null;
  const d = estado.puede ? estado.disponible : null;
  return (
    <div className="version-erp">
      <span>Versión {estado.version}</span>
      {estado.puede &&
        (d ? (
          <button type="button" className="version-erp__enlace version-erp__nueva" onClick={() => setInstalando(true)}>
            Actualizar a {d.version}
          </button>
        ) : (
          <button type="button" className="version-erp__enlace" disabled={buscando} onClick={() => void buscar()}>
            {buscando ? "Buscando…" : "Buscar actualización"}
          </button>
        ))}
      {mensaje && <span className="version-erp__mensaje">{mensaje}</span>}
      {instalando && d && <Instalando version={d.version} cerrar={cerrar} />}
    </div>
  );
}
