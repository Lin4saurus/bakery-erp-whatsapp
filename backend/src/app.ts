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
import { sesionRouter } from "./routes/sesion";
import { reportesRouter } from "./routes/reportes";
import { actualizacionRouter } from "./routes/actualizacion";
import { exportarRouter } from "./routes/exportar";
import { guardarNegocio, leerNegocio } from "./routes/negocio";
import { versionInstalada } from "./services/actualizacion";
import { exigirSesion } from "./services/sesion";
import { errorHandler, notFoundHandler } from "./errors";

// Frontend compilado (`npm run web:build`). En desarrollo lo sirve Vite.
const FRONTEND_DIST = path.resolve(__dirname, "../../frontend/dist");

// `exigirSesion: false` solo en las pruebas de la API que no son de la sesión.
export function createApp({ exigirSesion: conSesion = true }: { exigirSesion?: boolean } = {}): Express {
  const app = express();
  // Solo las dos rutas que reciben el comprobante de pago (foto o PDF en base64, D86) aceptan hasta 15 MB; el resto,
  // 100 kB. Un cuerpo enorme en cualquier otra ruta se corta antes de llegar a Zod (S4, AUDITORIA.md).
  app.use(["/api/pedidos/pago-whatsapp", "/api/pedidos/:id/pago"], express.json({ limit: "15mb" }));
  // La descarga del Historial manda la lista que se ve (D116): un año de ventas pesa más que 100 kB.
  app.use("/api/exportar/ventas", express.json({ limit: "5mb" }));
  app.use("/api/historico/importar", express.json({ limit: "8mb" })); // el Excel de ventas anteriores en base64 (D121)
  app.use(express.json({ limit: "100kb" }));

  // La versión sirve para saber que el ERP volvió a arrancar ya actualizado (D112).
  const version = versionInstalada();
  app.get("/api/salud", (_req, res) => {
    res.json({ ok: true, version });
  });
  // PIN de la dueña (D105): sin sesión solo se puede entrar; el agente de WhatsApp usa su propia clave.
  app.use("/api/sesion", sesionRouter);
  // El nombre del negocio (D117) se lee sin sesión: la pantalla del PIN lo muestra. Cambiarlo pide sesión.
  app.get("/api/negocio", leerNegocio);
  if (conSesion) app.use("/api", exigirSesion);
  app.put("/api/negocio", guardarNegocio);
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
  app.use("/api/reportes", reportesRouter);
  app.use("/api/actualizacion", actualizacionRouter);
  app.use("/api/exportar", exportarRouter);

  if (existsSync(FRONTEND_DIST)) {
    // index.html se revisa siempre, para que una versión nueva se vea al recargar;
    // los archivos de /assets llevan un hash en el nombre y sí se pueden guardar.
    const sinCache = { headers: { "Cache-Control": "no-cache" } };
    app.use(
      express.static(FRONTEND_DIST, {
        setHeaders: (res, ruta) => {
          if (ruta.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
          // Abrir más rápido (D115): Edge los guarda un año y no vuelve a preguntar por ellos en cada apertura;
          // así además reutiliza el JavaScript ya procesado. Una versión nueva trae otros nombres (otro hash).
          else if (/[\\/]assets[\\/]/.test(ruta)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
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
