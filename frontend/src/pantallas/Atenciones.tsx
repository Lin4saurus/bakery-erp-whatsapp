import { useState } from "react";
import { MdOutlineCheckCircle, MdOutlineDeliveryDining, MdWhatsapp } from "react-icons/md";
import { api, mensajeDeError, type Atencion, type MotivoAtencion } from "../api";
import { fechaCorta, hora } from "../formato";
import { enlaceMapa, nombreDia } from "../pedidos";
import { Aviso, Button, Cargando, Panel, useDatos } from "../ui";
import "./Atenciones.css";

type Vista = "PENDIENTE" | "RESUELTA";

export const nombreMotivo: Record<MotivoAtencion, string> = {
  COTIZAR_DELIVERY: "Cotizar delivery",
  PEDIDO_PERSONALIZADO: "Pedido personalizado",
  RECLAMO: "Reclamo",
  DUENA_RESPONDIO: "Respondiste tú",
  OTRO: "Otro",
};

const claseMotivo: Record<MotivoAtencion, string> = {
  COTIZAR_DELIVERY: "etiqueta-alerta",
  PEDIDO_PERSONALIZADO: "etiqueta-positiva",
  RECLAMO: "etiqueta-negativa",
  DUENA_RESPONDIO: "etiqueta-neutra",
  OTRO: "etiqueta-neutra",
};

// wa.me necesita el código de país: los celulares bolivianos de 8 dígitos llevan 591.
const enlaceChat = (celular: string) => {
  const digitos = celular.replace(/\D/g, "");
  return `https://wa.me/${digitos.length === 8 ? `591${digitos}` : digitos}`;
};

// Avisa al menú que cambió la cuenta de chats esperando.
const avisarMenu = () => window.dispatchEvent(new Event("dulzura:avisos"));

const haceCuanto = (fechaISO: string) => {
  const minutos = Math.round((Date.now() - new Date(fechaISO).getTime()) / 60000);
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  if (minutos < 24 * 60) return `hace ${Math.floor(minutos / 60)} h`;
  return `${fechaCorta(fechaISO)} ${hora(fechaISO)}`;
};

// Atención humana (D85): chats de WhatsApp que el agente pasó a la dueña. Mientras estén aquí,
// el agente no contesta en ese chat; «Listo» se lo devuelve.
export function Atenciones() {
  const [vista, setVista] = useState<Vista>("PENDIENTE");
  const pendientes = useDatos(() => api.atenciones("PENDIENTE"));
  const resueltas = useDatos(() => api.atenciones("RESUELTA"));
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const resolver = async (a: Atencion) => {
    setOcupado(a.id);
    setMensaje(null);
    try {
      await api.resolverAtencion(a.id);
      setMensaje({ tipo: "ok", texto: `El agente vuelve a atender el chat de ${a.cliente?.nombre ?? a.nombre ?? a.celular}.` });
      await Promise.all([pendientes.recargar(), resueltas.recargar()]);
      avisarMenu();
    } catch (e) {
      setMensaje({ tipo: "error", texto: mensajeDeError(e) });
    } finally {
      setOcupado(null);
    }
  };

  const lista = (vista === "PENDIENTE" ? pendientes : resueltas).datos;
  const cargando = (vista === "PENDIENTE" ? pendientes : resueltas).cargando;
  const error = pendientes.error ?? resueltas.error;

  return (
    <div className="atenciones">
      <div className="cabecera-pantalla">
        <div>
          <h1>Atención</h1>
          <p>
            Chats de WhatsApp que el agente te pasó porque te toca a ti (cotizar el delivery, un pastel personalizado, un
            reclamo). Mientras estén aquí, el agente no contesta en ese chat.
          </p>
        </div>
      </div>

      {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}

      <div className="pedidos__pestanas" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={vista === "PENDIENTE"}
          className={`pedidos__pestana ${vista === "PENDIENTE" ? "pedidos__pestana--activa" : ""}`}
          onClick={() => setVista("PENDIENTE")}
        >
          Esperándote <span className="pedidos__cuenta">{pendientes.datos?.length ?? 0}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={vista === "RESUELTA"}
          className={`pedidos__pestana ${vista === "RESUELTA" ? "pedidos__pestana--activa" : ""}`}
          onClick={() => setVista("RESUELTA")}
        >
          Resueltas
        </button>
      </div>

      {cargando && !lista ? (
        <Cargando />
      ) : !lista || lista.length === 0 ? (
        <Panel titulo={vista === "PENDIENTE" ? "Nada por atender" : "Sin atenciones resueltas"}>
          <p className="vacio">
            {vista === "PENDIENTE"
              ? "El agente está atendiendo todos los chats. Cuando necesite que intervengas, aparecerá aquí."
              : "Todavía no resolviste ninguna atención."}
          </p>
        </Panel>
      ) : (
        <div className="atenciones__lista">
          {lista.map((a) => (
            <article key={a.id} className={`atencion atencion--${a.motivo.toLowerCase()}`}>
              <header className="atencion__cabecera">
                <span className={`etiqueta ${claseMotivo[a.motivo]}`}>{nombreMotivo[a.motivo]}</span>
                <span className="secundario">
                  {vista === "PENDIENTE" ? haceCuanto(a.updatedAt) : `Resuelta ${haceCuanto(a.resueltaEn ?? a.updatedAt)}`}
                </span>
              </header>
              <div>
                <strong>{a.cliente?.nombre ?? a.nombre ?? "Cliente sin nombre"}</strong>
                <div className="secundario">Cel. {a.celular}</div>
              </div>
              <p className="atencion__descripcion">{a.descripcion}</p>
              {a.pedido && (
                <p className="atencion__pedido">
                  Pedido N.º {a.pedido.numero} · {nombreDia(a.pedido.fechaEntrega)}
                  {a.pedido.horaEntrega ? ` ${a.pedido.horaEntrega}` : ""}
                  {a.pedido.entrega === "DELIVERY" && (
                    <>
                      {" "}
                      · <MdOutlineDeliveryDining aria-hidden /> Delivery
                      {a.pedido.ubicacion && (
                        <>
                          {" "}
                          <a href={enlaceMapa(a.pedido.ubicacion)} target="_blank" rel="noreferrer">
                            Ver en mapa
                          </a>
                        </>
                      )}
                    </>
                  )}
                </p>
              )}
              {vista === "PENDIENTE" && (
                <footer className="atencion__acciones">
                  <a className="boton atencion__chat" href={enlaceChat(a.celular)} target="_blank" rel="noreferrer">
                    <MdWhatsapp aria-hidden /> Abrir chat
                  </a>
                  <Button variante="exito" disabled={ocupado === a.id} onClick={() => void resolver(a)}>
                    <MdOutlineCheckCircle aria-hidden /> Listo, devolver al agente
                  </Button>
                </footer>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
