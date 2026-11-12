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
import { errorHandler, notFoundHandler } from "./errors";

// Frontend compilado (`npm run web:build`). En desarrollo lo sirve Vite.
const FRONTEND_DIST = path.resolve(__dirname, "../../frontend/dist");

export function createApp(): Express {
  const app = express();
  app.use(express.json());

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
  app.use("/api/pedidos", pedidosRouter);
  app.use("/api/atenciones", atencionesRouter);

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
