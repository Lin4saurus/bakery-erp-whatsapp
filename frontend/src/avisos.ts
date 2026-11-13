import { useEffect, useRef } from "react";

// Avisos en vivo (D88): el servidor avisa por /api/eventos cuando cambian Pedidos o Atención
// (un chat nuevo que pide a la dueña, un comprobante, un pedido de WhatsApp) y las pantallas se recargan solas.
// Todo pasa por el evento de ventana «dulzura:avisos», que también disparan las pantallas al resolver algo.

export type TemaAviso = "pedidos" | "atenciones";
const EVENTO = "dulzura:avisos";

export const avisarCambio = (tema?: TemaAviso) => window.dispatchEvent(new CustomEvent(EVENTO, { detail: tema }));

// Una sola conexión por pestaña (la abre App). EventSource se reconecta solo si el servidor se reinicia;
// al reconectar se avisa igual, por si algo cambió mientras estaba cortada.
export function conectarAvisos(): () => void {
  if (typeof EventSource === "undefined") return () => undefined;
  const fuente = new EventSource("/api/eventos");
  let abierta = false;
  fuente.addEventListener("cambio", (e) => avisarCambio((e as MessageEvent<string>).data as TemaAviso));
  fuente.addEventListener("open", () => {
    if (abierta) avisarCambio();
    abierta = true;
  });
  return () => fuente.close();
}

// Ejecuta `alCambiar` cada vez que llega un aviso del tema (o de cualquiera, si no se indica).
export function useAlAvisar(alCambiar: () => void, tema?: TemaAviso) {
  const ultimo = useRef(alCambiar);
  ultimo.current = alCambiar;
  useEffect(() => {
    const escuchar = (e: Event) => {
      const recibido = (e as CustomEvent<TemaAviso | undefined>).detail;
      if (!tema || !recibido || recibido === tema) ultimo.current();
    };
    window.addEventListener(EVENTO, escuchar);
    return () => window.removeEventListener(EVENTO, escuchar);
  }, [tema]);
}
