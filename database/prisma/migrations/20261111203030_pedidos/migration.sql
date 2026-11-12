-- CreateTable
CREATE TABLE "Pedido" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "numero" INTEGER NOT NULL,
    "clienteId" TEXT NOT NULL,
    "fechaEntrega" TEXT NOT NULL,
    "horaEntrega" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "origen" TEXT NOT NULL DEFAULT 'MANUAL',
    "nota" TEXT,
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

-- CreateTable
CREATE TABLE "PedidoLinea" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pedidoId" TEXT NOT NULL,
    "productoId" INTEGER NOT NULL,
    "cantidad" DECIMAL NOT NULL,
    "precioUnitario" DECIMAL NOT NULL,
    CONSTRAINT "PedidoLinea_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PedidoLinea_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Pedido_numero_key" ON "Pedido"("numero");

-- CreateIndex
CREATE INDEX "Pedido_estado_fechaEntrega_idx" ON "Pedido"("estado", "fechaEntrega");

-- CreateIndex
CREATE INDEX "Pedido_clienteId_idx" ON "Pedido"("clienteId");

-- CreateIndex
CREATE INDEX "PedidoLinea_productoId_idx" ON "PedidoLinea"("productoId");

-- CreateIndex
CREATE UNIQUE INDEX "PedidoLinea_pedidoId_productoId_key" ON "PedidoLinea"("pedidoId", "productoId");
