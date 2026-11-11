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
    "cliente" TEXT,
    "clienteId" TEXT,
    "sabor" TEXT,
    "pedidoId" TEXT,
    "anulada" BOOLEAN NOT NULL DEFAULT false,
    "fechaAnulacion" DATETIME,
    "motivoAnulacion" TEXT,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Venta_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Venta_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Venta" ("anulada", "cantidad", "cliente", "clienteId", "costoTotal", "costoUnitario", "fecha", "fechaAnulacion", "gananciaBruta", "id", "motivoAnulacion", "pedidoId", "precioUnitario", "productoId", "sabor", "totalVenta") SELECT "anulada", "cantidad", "cliente", "clienteId", "costoTotal", "costoUnitario", "fecha", "fechaAnulacion", "gananciaBruta", "id", "motivoAnulacion", "pedidoId", "precioUnitario", "productoId", "sabor", "totalVenta" FROM "Venta";
DROP TABLE "Venta";
ALTER TABLE "new_Venta" RENAME TO "Venta";
CREATE INDEX "Venta_fecha_idx" ON "Venta"("fecha");
CREATE INDEX "Venta_productoId_idx" ON "Venta"("productoId");
CREATE INDEX "Venta_clienteId_idx" ON "Venta"("clienteId");
CREATE INDEX "Venta_pedidoId_idx" ON "Venta"("pedidoId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

