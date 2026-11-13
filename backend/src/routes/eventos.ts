import { EventEmitter } from "node:events";
import { Router, type NextFunction, type Request, type Response } from "express";

// Avisos en vivo (D88): cuando cambia algo en Pedidos o Atención (un chat que pide a la dueña, un comprobante,
// un pedido de WhatsApp), el servidor avisa a las páginas abiertas para que se actualicen solas, sin recargar.
// Usa Server-Sent Events: una conexión abierta por pestaña; el navegador se reconecta solo si se corta.

export type Tema = "pedidos" | "atenciones";

const bus = new EventEmitter();
bus.setMaxListeners(100); // una por pestaña abierta

export function avisar(tema: Tema) {
  bus.emit("cambio", tema);
}

// Después de cada cambio que salió bien (POST, PATCH o DELETE con respuesta < 400) en esa ruta, avisa.
export function avisarAlCambiar(...temas: Tema[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET") {
      res.on("finish", () => {
        if (res.statusCode < 400) for (const t of temas) avisar(t);
      });
    }
    next();
  };
}

export const eventosRouter = Router();

eventosRouter.get("/", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  res.write("retry: 3000\n\n");
  const enviar = (tema: Tema) => res.write(`event: cambio\ndata: ${tema}\n\n`);
  // Un latido cada 25 s evita que la conexión quede muda y se corte.
  const latido = setInterval(() => res.write(": latido\n\n"), 25_000);
  bus.on("cambio", enviar);
  req.on("close", () => {
    clearInterval(latido);
    bus.off("cambio", enviar);
  });
});
