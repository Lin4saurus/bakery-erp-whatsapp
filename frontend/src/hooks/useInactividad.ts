import { useEffect } from "react";
import { api } from "../api";

// Bloqueo por inactividad (D105). Cuenta solo lo que hace la dueña (mouse, teclado, toques), no las recargas
// automáticas de las pantallas. Le avisa al servidor como mucho cada 4 minutos, para que su sesión siga viva.
// Si la portátil se suspendió, al despertar se revisa enseguida cuánto tiempo pasó.
const AVISO_CADA_MS = 4 * 60_000;
const EVENTOS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;

export function useInactividad(activo: boolean, minutos: number, bloquear: () => void): void {
  useEffect(() => {
    if (!activo) return;
    const limite = minutos * 60_000;
    let ultima = Date.now();
    let ultimoAviso = 0;

    const avisar = () => {
      if (Date.now() - ultimoAviso < AVISO_CADA_MS) return;
      ultimoAviso = Date.now();
      api.anotarActividad().catch(() => undefined); // si ya venció, el 401 muestra el PIN solo
    };
    const revisar = () => {
      if (Date.now() - ultima >= limite) bloquear();
    };
    const alUsar = () => {
      if (Date.now() - ultima >= limite) {
        bloquear();
        return;
      }
      ultima = Date.now();
      avisar();
    };
    const alVolver = () => {
      if (document.visibilityState === "visible") revisar();
    };

    avisar();
    for (const evento of EVENTOS) window.addEventListener(evento, alUsar, { passive: true });
    document.addEventListener("visibilitychange", alVolver);
    const reloj = window.setInterval(revisar, 30_000);
    return () => {
      for (const evento of EVENTOS) window.removeEventListener(evento, alUsar);
      document.removeEventListener("visibilitychange", alVolver);
      window.clearInterval(reloj);
    };
  }, [activo, minutos, bloquear]);
}
