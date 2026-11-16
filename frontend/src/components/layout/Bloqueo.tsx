import { useState, type FormEvent } from "react";
import { MdOutlineLock } from "react-icons/md";
import { api, mensajeDeError } from "../../api";
import { Aviso, Button, Campo, Ventana } from "../../ui";
import "./Bloqueo.css";

// Pantalla del PIN (D105). «crear»: la primera vez, la dueña elige su PIN. «entrar»: al encender la PC,
// tras 1 hora sin uso o después de tocar «Bloquear».

const soloNumeros = (texto: string) => texto.replace(/\D/g, "").slice(0, 6);
const pinValido = (pin: string) => /^\d{4,6}$/.test(pin);

function CampoPin({
  etiqueta,
  valor,
  cambiar,
  enfocar = false,
}: {
  etiqueta: string;
  valor: string;
  cambiar: (v: string) => void;
  enfocar?: boolean;
}) {
  return (
    <Campo etiqueta={etiqueta}>
      <input
        className="bloqueo__pin"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        autoFocus={enfocar}
        value={valor}
        onChange={(e) => cambiar(soloNumeros(e.target.value))}
      />
    </Campo>
  );
}

export function Bloqueo({
  modo,
  listo,
  reintentar,
  minutos,
}: {
  modo: "cargando" | "crear" | "entrar" | "sin-servidor";
  listo: () => void;
  reintentar: () => void;
  minutos: number;
}) {
  const [pin, setPin] = useState("");
  const [repetido, setRepetido] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const puedeEnviar = modo === "crear" ? pinValido(pin) && pin === repetido : pinValido(pin);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!puedeEnviar || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      if (modo === "crear") await api.crearPin(pin);
      else await api.entrar(pin);
      listo();
    } catch (err) {
      setError(mensajeDeError(err));
      setPin("");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="bloqueo">
      <div className="bloqueo__tarjeta">
        <div className="bloqueo__marca">
          <span className="bloqueo__logo" aria-hidden>
            D
          </span>
          <span>
            <strong>Dulzura</strong>
            <span>Pastelería</span>
          </span>
        </div>

        {modo === "cargando" && <p className="secundario">Abriendo…</p>}

        {modo === "sin-servidor" && (
          <>
            <Aviso tipo="error">No se pudo conectar con el ERP. ¿Está encendido?</Aviso>
            <Button variante="primario" onClick={reintentar}>
              Reintentar
            </Button>
          </>
        )}

        {(modo === "crear" || modo === "entrar") && (
          <form className="bloqueo__form" onSubmit={enviar}>
            <h1 className="bloqueo__titulo">
              <MdOutlineLock aria-hidden /> {modo === "crear" ? "Crea tu PIN" : "Ingresa tu PIN"}
            </h1>
            <p className="secundario bloqueo__texto">
              {modo === "crear"
                ? "Elige de 4 a 6 números. Te lo pediremos al encender la portátil y si el ERP queda sin uso por " +
                  `${minutos === 60 ? "1 hora" : `${minutos} minutos`}.`
                : "Para proteger las ventas y los datos de tus clientes."}
            </p>
            <CampoPin etiqueta="PIN" valor={pin} cambiar={setPin} enfocar />
            {modo === "crear" && <CampoPin etiqueta="Repite el PIN" valor={repetido} cambiar={setRepetido} />}
            {modo === "crear" && repetido.length >= 4 && pin !== repetido && (
              <p className="negativo bloqueo__nota">Los dos PIN no son iguales.</p>
            )}
            {error && <Aviso tipo="error">{error}</Aviso>}
            <Button type="submit" variante="primario" tamano="grande" disabled={!puedeEnviar || enviando}>
              {enviando ? "Revisando…" : modo === "crear" ? "Guardar PIN y entrar" : "Entrar"}
            </Button>
            {modo === "entrar" && (
              <p className="secundario bloqueo__nota">
                ¿Olvidaste tu PIN? En esta PC abre <code>C:\DulzuraERP\instalacion\olvide-pin.bat</code> y elige uno nuevo.
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

export function CambiarPin({ cerrar }: { cerrar: () => void }) {
  const [actual, setActual] = useState("");
  const [nuevo, setNuevo] = useState("");
  const [repetido, setRepetido] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const puede = pinValido(actual) && pinValido(nuevo) && nuevo === repetido;

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (!puede || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      await api.cambiarPin(actual, nuevo);
      setListo(true);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Ventana titulo="Cambiar PIN" cerrar={cerrar}>
      {listo ? (
        <div className="bloqueo__form">
          <Aviso tipo="ok">Listo: desde ahora entra con el PIN nuevo.</Aviso>
          <Button variante="primario" onClick={cerrar}>
            Cerrar
          </Button>
        </div>
      ) : (
        <form className="bloqueo__form" onSubmit={guardar}>
          <CampoPin etiqueta="PIN actual" valor={actual} cambiar={setActual} enfocar />
          <CampoPin etiqueta="PIN nuevo (4 a 6 números)" valor={nuevo} cambiar={setNuevo} />
          <CampoPin etiqueta="Repite el PIN nuevo" valor={repetido} cambiar={setRepetido} />
          {repetido.length >= 4 && nuevo !== repetido && <p className="negativo bloqueo__nota">Los dos PIN nuevos no son iguales.</p>}
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Button type="submit" variante="primario" disabled={!puede || enviando}>
            {enviando ? "Guardando…" : "Guardar PIN"}
          </Button>
        </form>
      )}
    </Ventana>
  );
}
