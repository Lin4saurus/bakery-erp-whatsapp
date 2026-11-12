-- CreateTable
CREATE TABLE "Atencion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "celular" TEXT NOT NULL,
    "nombre" TEXT,
    "clienteId" TEXT,
    "pedidoId" TEXT,
    "motivo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "resueltaEn" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Atencion_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Atencion_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Pedido" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "numero" INTEGER NOT NULL,
    "clienteId" TEXT NOT NULL,
    "fechaEntrega" TEXT NOT NULL,
    "horaEntrega" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "origen" TEXT NOT NULL DEFAULT 'MANUAL',
    "nota" TEXT,
    "entrega" TEXT NOT NULL DEFAULT 'RECOJO',
    "ubicacion" TEXT,
    "costoEnvio" DECIMAL,
    "total" DECIMAL NOT NULL,
    "esDemo" BOOLEAN NOT NULL DEFAULT false,
    "ventaPedidoId" TEXT,
    "entregadoEn" DATETIME,
    "canceladoEn" DATETIME,
    "motivoCancelacion" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Pedido_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Pedido" ("canceladoEn", "clienteId", "createdAt", "entregadoEn", "esDemo", "estado", "fechaEntrega", "horaEntrega", "id", "motivoCancelacion", "nota", "numero", "origen", "total", "updatedAt", "ventaPedidoId") SELECT "canceladoEn", "clienteId", "createdAt", "entregadoEn", "esDemo", "estado", "fechaEntrega", "horaEntrega", "id", "motivoCancelacion", "nota", "numero", "origen", "total", "updatedAt", "ventaPedidoId" FROM "Pedido";
DROP TABLE "Pedido";
ALTER TABLE "new_Pedido" RENAME TO "Pedido";
CREATE UNIQUE INDEX "Pedido_numero_key" ON "Pedido"("numero");
CREATE INDEX "Pedido_estado_fechaEntrega_idx" ON "Pedido"("estado", "fechaEntrega");
CREATE INDEX "Pedido_clienteId_idx" ON "Pedido"("clienteId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Atencion_estado_createdAt_idx" ON "Atencion"("estado", "createdAt");

-- CreateIndex
CREATE INDEX "Atencion_celular_estado_idx" ON "Atencion"("celular", "estado");
