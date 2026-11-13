import { existsSync } from "node:fs";
import path from "node:path";
import express, { type Express } from "express";
import { insumosRouter } from "./routes/insumos";
import { productosRouter } from "./routes/productos";
import { ventasRouter } from "./routes/ventas";
import { backupsRouter } from "./routes/backups";
import { historicoRouter } from "./routes/historico";
import { gastosRouter } from "./routes/gastos";
import { clientesRouter } from "./routes/clientes";
import { pedidosRouter } from "./routes/pedidos";
import { atencionesRouter } from "./routes/atenciones";
import { avisarAlCambiar, eventosRouter } from "./routes/eventos";
import { agenteRouter } from "./routes/agente";
import { configuracionRouter } from "./routes/configuracion";
import { errorHandler, notFoundHandler } from "./errors";

// Frontend compilado (`npm run web:build`). En desarrollo lo sirve Vite.
const FRONTEND_DIST = path.resolve(__dirname, "../../frontend/dist");

export function createApp(): Express {
  const app = express();
  // Solo las dos rutas que reciben el comprobante de pago (foto o PDF en base64, D86) aceptan hasta 15 MB; el resto,
  // 100 kB. Un cuerpo enorme en cualquier otra ruta se corta antes de llegar a Zod (S4, AUDITORIA.md).
  app.use(["/api/pedidos/pago-whatsapp", "/api/pedidos/:id/pago"], express.json({ limit: "15mb" }));
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/salud", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/api/insumos", insumosRouter);
  app.use("/api/productos", productosRouter);
  app.use("/api/ventas", ventasRouter);
  app.use("/api/backups", backupsRouter);
  app.use("/api/historico", historicoRouter);
  app.use("/api/gastos", gastosRouter);
  app.use("/api/clientes", clientesRouter);
  // Pedidos y Atención avisan a las páginas abiertas cuando cambian (D88); un pago por WhatsApp puede crear
  // una atención, y resolver una puede venir de confirmar un pago: se avisan las dos.
  app.use("/api/pedidos", avisarAlCambiar("pedidos", "atenciones"), pedidosRouter);
  app.use("/api/atenciones", avisarAlCambiar("atenciones", "pedidos"), atencionesRouter);
  app.use("/api/eventos", eventosRouter);
  app.use("/api/agente", agenteRouter);
  app.use("/api/configuracion", configuracionRouter);

  if (existsSync(FRONTEND_DIST)) {
    // index.html se revisa siempre, para que una versión nueva se vea al recargar;
    // los archivos de /assets llevan un hash en el nombre y sí se pueden guardar.
    const sinCache = { headers: { "Cache-Control": "no-cache" } };
    app.use(
      express.static(FRONTEND_DIST, {
        setHeaders: (res, ruta) => {
          if (ruta.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
        },
      }),
    );
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api")) return next();
      res.sendFile(path.join(FRONTEND_DIST, "index.html"), sinCache);
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
