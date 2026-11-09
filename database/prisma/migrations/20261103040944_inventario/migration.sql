-- CreateTable
CREATE TABLE "MovimientoInventario" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "insumoId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "cantidad" DECIMAL NOT NULL,
    "stockResultante" DECIMAL NOT NULL,
    "ventaId" INTEGER,
    "nota" TEXT,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MovimientoInventario_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MovimientoInventario_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MovimientoInventario_insumoId_fecha_idx" ON "MovimientoInventario"("insumoId", "fecha");

-- CreateIndex
CREATE INDEX "MovimientoInventario_ventaId_idx" ON "MovimientoInventario"("ventaId");
