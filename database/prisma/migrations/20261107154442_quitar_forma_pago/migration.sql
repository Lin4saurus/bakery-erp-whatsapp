-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_VentaHistorica" (
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
    "costo" DECIMAL,
    "utilidad" DECIMAL,
    "cliente" TEXT,
    "clienteId" TEXT,
    "sabores" TEXT,
    CONSTRAINT "VentaHistorica_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "VentaHistorica_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_VentaHistorica" ("cantidad", "cliente", "clienteId", "comision", "costo", "fecha", "fechaEstimada", "fila", "hoja", "id", "productoId", "productoNombre", "productoOriginal", "sabores", "utilidad", "valor") SELECT "cantidad", "cliente", "clienteId", "comision", "costo", "fecha", "fechaEstimada", "fila", "hoja", "id", "productoId", "productoNombre", "productoOriginal", "sabores", "utilidad", "valor" FROM "VentaHistorica";
DROP TABLE "VentaHistorica";
ALTER TABLE "new_VentaHistorica" RENAME TO "VentaHistorica";
CREATE INDEX "VentaHistorica_fecha_idx" ON "VentaHistorica"("fecha");
CREATE INDEX "VentaHistorica_productoId_idx" ON "VentaHistorica"("productoId");
CREATE INDEX "VentaHistorica_clienteId_idx" ON "VentaHistorica"("clienteId");
CREATE UNIQUE INDEX "VentaHistorica_hoja_fila_key" ON "VentaHistorica"("hoja", "fila");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

