import { useState, type FormEvent } from "react";
import { api, mensajeDeError, type EstadoCorreo } from "../../api";
import { Aviso, Button, Campo, Ventana } from "../../ui";
import { useNombreNegocio } from "../../negocio";

// Respaldo por correo (D111): la dueña escribe el Gmail del negocio y una contraseña de aplicación de Google.
// Al guardar, el ERP prueba la conexión y manda el primer respaldo al momento.
export function CorreoRespaldo({
  estado,
  cerrar,
  cambio,
}: {
  estado: EstadoCorreo | undefined;
  cerrar: () => void;
  cambio: () => void;
}) {
  const negocio = useNombreNegocio();
  const [correo, setCorreo] = useState(estado?.correo ?? "");
  const [contrasena, setContrasena] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);
  const letras = contrasena.replace(/\s/g, "").length;
  const puede = /^[^\s@]+@(gmail|googlemail)\.com$/i.test(correo.trim()) && letras === 16;

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (!puede || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await api.configurarCorreo(correo.trim(), contrasena);
      cambio();
      setListo(
        r.envio?.enviado
          ? `Listo. Ya llegó el primer respaldo a ${r.correo}: revisa la bandeja de entrada. Desde ahora llega uno cada día y cada vez que toques «Respaldar ahora».`
          : `Quedó guardado, pero el primer envío falló: ${r.envio && !r.envio.enviado ? r.envio.error : "sin detalle"}`,
      );
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async () => {
    setGuardando(true);
    setError(null);
    try {
      await api.quitarCorreo();
      cambio();
      cerrar();
    } catch (err) {
      setError(mensajeDeError(err));
      setGuardando(false);
    }
  };

  return (
    <Ventana titulo="Respaldo por correo" subtitulo="Una copia de los datos en el Gmail del negocio, fuera de la portátil." cerrar={cerrar} mediana>
      {listo ? (
        <div className="correo-respaldo">
          <Aviso tipo={listo.startsWith("Listo") ? "ok" : "alerta"}>{listo}</Aviso>
          <Button variante="primario" onClick={cerrar}>
            Cerrar
          </Button>
        </div>
      ) : (
        <form className="correo-respaldo" onSubmit={guardar}>
          <ol className="correo-respaldo__pasos secundario">
            <li>
              En la cuenta de Gmail del negocio, activa la <strong>verificación en 2 pasos</strong>: myaccount.google.com →
              Seguridad.
            </li>
            <li>
              Entra a <strong>myaccount.google.com/apppasswords</strong>, escribe «ERP {negocio}» y toca Crear.
            </li>
            <li>Copia las 16 letras que muestra Google y pégalas aquí abajo.</li>
          </ol>
          <Campo etiqueta="Gmail del negocio">
            <input
              type="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder="nombre@gmail.com"
              autoComplete="off"
              autoFocus
            />
          </Campo>
          <Campo
            etiqueta="Contraseña de aplicación (16 letras)"
            ayuda="No es la contraseña normal del correo. El ERP la guarda solo en esta portátil y no va en los respaldos."
          >
            <input
              type="password"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              placeholder="abcd efgh ijkl mnop"
              autoComplete="new-password"
            />
          </Campo>
          {letras > 0 && letras !== 16 && <p className="negativo correo-respaldo__nota">Tiene {letras} letras; deben ser 16.</p>}
          {error && <Aviso tipo="error">{error}</Aviso>}
          <div className="correo-respaldo__botones">
            <Button type="submit" variante="primario" disabled={!puede || guardando}>
              {guardando ? "Probando con Gmail…" : "Guardar y mandar el primer respaldo"}
            </Button>
            {estado?.correo && (
              <Button type="button" disabled={guardando} onClick={() => void quitar()}>
                Dejar de mandar
              </Button>
            )}
          </div>
        </form>
      )}
    </Ventana>
  );
}
