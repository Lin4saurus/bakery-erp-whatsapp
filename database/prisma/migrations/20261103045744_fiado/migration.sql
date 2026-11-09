-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Venta" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productoId" INTEGER NOT NULL,
    "cantidad" DECIMAL NOT NULL,
    "precioUnitario" DECIMAL NOT NULL,
    "costoUnitario" DECIMAL NOT NULL,
    "totalVenta" DECIMAL NOT NULL,
    "costoTotal" DECIMAL NOT NULL,
    "gananciaBruta" DECIMAL NOT NULL,
    "estadoPago" TEXT NOT NULL DEFAULT 'PAGADO',
    "cliente" TEXT,
    "fechaPago" DATETIME,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Venta_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Venta" ("cantidad", "costoTotal", "costoUnitario", "fecha", "gananciaBruta", "id", "precioUnitario", "productoId", "totalVenta") SELECT "cantidad", "costoTotal", "costoUnitario", "fecha", "gananciaBruta", "id", "precioUnitario", "productoId", "totalVenta" FROM "Venta";
DROP TABLE "Venta";
ALTER TABLE "new_Venta" RENAME TO "Venta";
CREATE INDEX "Venta_fecha_idx" ON "Venta"("fecha");
CREATE INDEX "Venta_productoId_idx" ON "Venta"("productoId");
CREATE INDEX "Venta_estadoPago_idx" ON "Venta"("estadoPago");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
