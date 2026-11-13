import { useState } from "react";
import {
  MdOutlineCheckCircle,
  MdOutlineDeliveryDining,
  MdOutlinePayments,
  MdOutlineReceiptLong,
  MdWhatsapp,
} from "react-icons/md";
import { api, mensajeDeError, type Atencion, type MotivoAtencion } from "../api";
import { bs, esNumeroValido, fechaCorta, hora, normalizarNumero } from "../formato";
import { abrirArchivo, enlaceMapa, nombreDia } from "../pedidos";
import { Aviso, Button, Campo, Cargando, Panel, useDatos } from "../ui";
import { avisarCambio, useAlAvisar } from "../avisos";
import "./Atenciones.css";

type Vista = "PENDIENTE" | "RESUELTA";

export const nombreMotivo: Record<MotivoAtencion, string> = {
  COTIZAR_DELIVERY: "Cotizar delivery",
  PEDIDO_PERSONALIZADO: "Pedido personalizado",
  RECLAMO: "Reclamo",
  VERIFICAR_PAGO: "Pago por confirmar",
  POSIBLE_ESTAFA: "⚠ Posible estafa",
  DUENA_RESPONDIO: "Respondiste tú",
  OTRO: "Otro",
};

const claseMotivo: Record<MotivoAtencion, string> = {
  COTIZAR_DELIVERY: "etiqueta-alerta",
  PEDIDO_PERSONALIZADO: "etiqueta-positiva",
  RECLAMO: "etiqueta-negativa",
  VERIFICAR_PAGO: "etiqueta-positiva",
  POSIBLE_ESTAFA: "etiqueta-negativa",
  DUENA_RESPONDIO: "etiqueta-neutra",
  OTRO: "etiqueta-neutra",
};

// wa.me necesita el código de país: los celulares bolivianos de 8 dígitos llevan 591.
const enlaceChat = (celular: string) => {
  const digitos = celular.replace(/\D/g, "");
  return `https://wa.me/${digitos.length === 8 ? `591${digitos}` : digitos}`;
};

// El número como lo ve la dueña en Bolivia: sin el 591 (59171234567 → 71234567).
const celularLocal = (celular: string) => {
  const digitos = celular.replace(/\D/g, "");
  return digitos.length === 11 && digitos.startsWith("591") ? digitos.slice(3) : digitos;
};

// La descripción viene por renglones (D94): «!- » es una incongruencia grave (monto incompleto), «- » una normal.
function Descripcion({ texto }: { texto: string }) {
  const renglones = texto.split("\n");
  const items = renglones.filter((r) => r.startsWith("- ") || r.startsWith("!- "));
  if (items.length === 0) return <p className="atencion__descripcion">{texto}</p>;
  return (
    <div className="atencion__descripcion">
      {renglones[0] && !items.includes(renglones[0]) && <p>{renglones[0]}</p>}
      <ul className="atencion__incongruencias">
        {items.map((r, i) => (
          <li key={i} className={r.startsWith("!- ") ? "atencion__grave" : undefined}>
            {r.replace(/^!?- /, "")}
          </li>
        ))}
      </ul>
      {renglones
        .slice(1)
        .filter((r) => r && !items.includes(r))
        .map((r, i) => (
          <p key={i}>{r}</p>
        ))}
    </div>
  );
}

// Un comprobante de pago: congruente (por confirmar) o con incongruencias (posible estafa) (D91).
const esPago = (a: Atencion) => a.motivo === "VERIFICAR_PAGO" || a.motivo === "POSIBLE_ESTAFA";
// Pago parcial válido (D95): todavía falta el saldo; se confirma cuando llegue el comprobante que lo completa.
const esParcial = (a: Atencion) => a.motivo === "VERIFICAR_PAGO" && Number(a.saldoPendiente ?? 0) > 0;

// Avisa al menú que cambió la cuenta de chats esperando.
const avisarMenu = () => avisarCambio("atenciones");

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
  // Un chat nuevo o un comprobante aparecen solos, sin recargar la página (D88).
  useAlAvisar(() => {
    void pendientes.recargar();
    void resueltas.recargar();
  }, "atenciones");
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  // «Llegó el pago» pide un segundo toque (U1, AUDITORIA.md): registra la venta y le escribe al cliente (D97).
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [costos, setCostos] = useState<Record<string, string>>({}); // costo del envío escrito en cada tarjeta

  // La dueña cotizó el envío en Yango (D89): se guarda, el chat vuelve al agente y el agente le escribe al cliente
  // el costo y le pregunta si está de acuerdo.
  const enviarCosto = async (a: Atencion) => {
    const texto = (costos[a.id] ?? "").trim();
    if (!esNumeroValido(texto)) return;
    setOcupado(a.id);
    setMensaje(null);
    try {
      const r = await api.enviarCostoEnvio(a.id, normalizarNumero(texto));
      setMensaje(
        r.enviado
          ? {
              tipo: "ok",
              texto: `Se le escribió a ${celularLocal(a.celular)}: el envío cuesta ${bs(r.costoEnvio)}. El agente sigue con la venta.`,
            }
          : {
              tipo: "error",
              texto: `El costo (${bs(r.costoEnvio)}) quedó guardado, pero no se pudo avisar al cliente (${r.error ?? "sin respuesta"}). Escríbele tú por WhatsApp.`,
            },
      );
      await Promise.all([pendientes.recargar(), resueltas.recargar()]);
      avisarMenu();
    } catch (e) {
      setMensaje({ tipo: "error", texto: mensajeDeError(e) });
    } finally {
      setOcupado(null);
    }
  };

  const resolver = async (a: Atencion) => {
    setOcupado(a.id);
    setMensaje(null);
    try {
      await api.resolverAtencion(a.id);
      setMensaje({ tipo: "ok", texto: `El agente vuelve a atender el chat de ${celularLocal(a.celular)}.` });
      await Promise.all([pendientes.recargar(), resueltas.recargar()]);
      avisarMenu();
    } catch (e) {
      setMensaje({ tipo: "error", texto: mensajeDeError(e) });
    } finally {
      setOcupado(null);
    }
  };

  // La dueña vio el dinero en su banco (D91): registra el pago con lo que dice el comprobante (venta y agenda)
  // y devuelve el chat al agente. Al cliente ya se le agradeció la compra al mandar el comprobante.
  const confirmarPago = async (a: Atencion) => {
    if (!a.pedido) return;
    setOcupado(a.id);
    setMensaje(null);
    try {
      const comprobante = a.tieneAdjunto ? (await api.adjuntoAtencion(a.id)).adjunto : null;
      const { venta, aviso } = await api.pagarPedido(a.pedido.id, {
        metodo: "QR",
        comprobante,
        // Un pago que cuadra (aunque haya llegado en dos comprobantes) es el total de la cotización.
        monto: a.motivo === "VERIFICAR_PAGO" || a.montoReportado === null ? null : Number(a.montoReportado),
        referencia: a.referencia,
        avisarCliente: true,
      });
      await api.resolverAtencion(a.id);
      setMensaje({
        tipo: "ok",
        texto:
          `Pago de ${celularLocal(a.celular)} confirmado: venta de ${bs(venta.totalVenta)} registrada y pedido agendado. ` +
          (aviso?.enviado
            ? "Al cliente le llegó «Ya está agendado tu pedido». "
            : "No se pudo avisar al cliente por WhatsApp: escríbele tú que ya está agendado. ") +
          "El agente vuelve a atender su chat.",
      });
      await Promise.all([pendientes.recargar(), resueltas.recargar()]);
      avisarMenu();
    } catch (e) {
      setMensaje({ tipo: "error", texto: mensajeDeError(e) });
    } finally {
      setOcupado(null);
      setConfirmando(null);
    }
  };

  const verAdjunto = (a: Atencion) => {
    abrirArchivo(async () => (await api.adjuntoAtencion(a.id)).adjunto).catch((e) =>
      setMensaje({ tipo: "error", texto: mensajeDeError(e) }),
    );
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
            Chats de WhatsApp que el agente te pasó porque te toca a ti (cotizar el delivery, confirmar un pago, un pastel
            personalizado, un reclamo). Ningún pago se confirma solo: mira en tu banco que llegó el dinero antes de confirmarlo.
            Mientras estén aquí, el agente no contesta en ese chat.
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
            <article key={a.id} className={`atencion atencion--${esParcial(a) ? "pago_parcial" : a.motivo.toLowerCase()}`}>
              <header className="atencion__cabecera">
                <span className={`etiqueta ${esParcial(a) ? "etiqueta-alerta" : claseMotivo[a.motivo]}`}>
                  {esParcial(a) ? "Pago parcial" : nombreMotivo[a.motivo]}
                </span>
                <span className="secundario">
                  {vista === "PENDIENTE" ? haceCuanto(a.updatedAt) : `Resuelta ${haceCuanto(a.resueltaEn ?? a.updatedAt)}`}
                </span>
              </header>
              {/* Número primero (D88): muchos clientes no están guardados en el celular de la dueña y en WhatsApp
                  solo verá el número. */}
              <div className="atencion__contacto">
                <strong className="atencion__numero">{celularLocal(a.celular)}</strong>
                <div className="secundario">{a.cliente?.nombre ?? a.nombre ?? "Sin nombre"}</div>
              </div>
              <Descripcion texto={a.descripcion} />
              {a.tieneAdjunto && (
                <button type="button" className="atencion__adjunto" onClick={() => verAdjunto(a)}>
                  <MdOutlineReceiptLong aria-hidden /> Ver {esPago(a) ? "comprobante" : "lo que mandó"}
                </button>
              )}
              {a.pedido && (
                <p className="atencion__pedido">
                  {a.pedido.estado === "POR_PAGAR" ? "Cotización" : "Pedido"} de {bs(a.pedido.total)} ·{" "}
                  {nombreDia(a.pedido.fechaEntrega)}
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
                <>
                  {a.motivo === "COTIZAR_DELIVERY" && a.pedido?.estado === "POR_PAGAR" && a.pedido.entrega === "DELIVERY" && (
                    <div className="atencion__cotizar">
                      <Campo
                        etiqueta="Costo del envío según Yango (Bs)"
                        ayuda="El cliente se lo paga al conductor; no entra en el QR."
                      >
                        <input
                          value={costos[a.id] ?? ""}
                          onChange={(e) => setCostos((c) => ({ ...c, [a.id]: e.target.value }))}
                          inputMode="decimal"
                          placeholder="Ej. 12"
                        />
                      </Campo>
                      <Button
                        variante="exito"
                        disabled={ocupado === a.id || !esNumeroValido((costos[a.id] ?? "").trim())}
                        onClick={() => void enviarCosto(a)}
                      >
                        <MdOutlineDeliveryDining aria-hidden /> Enviar costo al cliente
                      </Button>
                    </div>
                  )}
                  {confirmando === a.id && a.pedido ? (
                    <div className="pedido__confirmar" role="alertdialog" aria-label="Confirmar el pago">
                      <p>
                        ¿Llegó <strong>{bs(a.pedido.total)}</strong> a tu banco? Se registra la venta, el pedido queda agendado y
                        al cliente le llega por WhatsApp que ya está agendado.
                      </p>
                      <div className="fila-botones">
                        <Button variante="exito" disabled={ocupado === a.id} onClick={() => void confirmarPago(a)}>
                          {ocupado === a.id ? "Confirmando…" : "Sí, llegó: confirmar"}
                        </Button>
                        <Button disabled={ocupado === a.id} onClick={() => setConfirmando(null)}>
                          Volver
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <footer className="atencion__acciones">
                      <a className="boton atencion__chat" href={enlaceChat(a.celular)} target="_blank" rel="noreferrer">
                        <MdWhatsapp aria-hidden /> Abrir chat
                      </a>
                      {esPago(a) && !esParcial(a) && a.pedido?.estado === "POR_PAGAR" && (
                        <Button
                          variante={a.motivo === "VERIFICAR_PAGO" ? "exito" : "secundario"}
                          disabled={ocupado === a.id}
                          onClick={() => setConfirmando(a.id)}
                        >
                          <MdOutlinePayments aria-hidden />{" "}
                          {a.motivo === "VERIFICAR_PAGO" ? "Llegó el pago" : "Sí llegó, confirmar"}
                        </Button>
                      )}
                      <Button
                        variante={
                          a.pedido?.estado === "POR_PAGAR" && (esPago(a) || a.motivo === "COTIZAR_DELIVERY")
                            ? "secundario"
                            : "exito"
                        }
                        disabled={ocupado === a.id}
                        onClick={() => void resolver(a)}
                      >
                        <MdOutlineCheckCircle aria-hidden /> Listo, devolver al agente
                      </Button>
                    </footer>
                  )}
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
