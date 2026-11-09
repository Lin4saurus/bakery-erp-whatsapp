import type { ErrorRequestHandler, RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

// Error de negocio con código HTTP y un mensaje pensado para la dueña.
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
};

const esJsonMalFormado = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "type" in error && error.type === "entity.parse.failed";

// Express 5 envía aquí también los errores de los handlers async.
export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Datos inválidos.",
      detalles: error.issues.map((issue) => ({ campo: issue.path.join("."), mensaje: issue.message })),
    });
    return;
  }
  if (esJsonMalFormado(error)) {
    res.status(400).json({ error: "El cuerpo de la petición no es un JSON válido." });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002":
        res.status(409).json({ error: "Ya existe un registro con ese nombre." });
        return;
      case "P2025":
        res.status(404).json({ error: "Registro no encontrado." });
        return;
      case "P2003":
        res.status(409).json({ error: "El registro está en uso por otros datos y no se puede modificar así." });
        return;
    }
  }
  console.error(error);
  res.status(500).json({ error: "Error interno del servidor." });
};
