-- CreateTable
CREATE TABLE "VentaHistorica" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "hoja" TEXT NOT NULL,
    "fila" INTEGER NOT NULL,
    "fecha" DATETIME NOT NULL,
    "fechaEstimada" BOOLEAN NOT NULL DEFAULT false,
    "productoOriginal" TEXT NOT NULL,
    "productoNombre" TEXT NOT NULL,
    "productoId" INTEGER,
    "cantidad" DECIMAL NOT NULL,
    "valor" DECIMAL NOT NULL,
    "comision" DECIMAL NOT NULL DEFAULT 0,
    "costo" DECIMAL NOT NULL,
    "utilidad" DECIMAL NOT NULL,
    "formaPago" TEXT,
    "cliente" TEXT,
    CONSTRAINT "VentaHistorica_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "VentaHistorica_fecha_idx" ON "VentaHistorica"("fecha");

-- CreateIndex
CREATE INDEX "VentaHistorica_productoId_idx" ON "VentaHistorica"("productoId");

-- CreateIndex
CREATE UNIQUE INDEX "VentaHistorica_hoja_fila_key" ON "VentaHistorica"("hoja", "fila");
