/*
  Warnings:

  - You are about to drop the column `sabores` on the `Venta` table. All the data in the column will be lost.
  - You are about to drop the column `sabores` on the `VentaHistorica` table. All the data in the column will be lost.

*/
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
    "clienteId" TEXT,
    "sabor" TEXT,
    "pedidoId" TEXT,
    "fechaPago" DATETIME,
    "anulada" BOOLEAN NOT NULL DEFAULT false,
    "fechaAnulacion" DATETIME,
    "motivoAnulacion" TEXT,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Venta_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Venta_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Venta" ("anulada", "cantidad", "cliente", "clienteId", "costoTotal", "costoUnitario", "estadoPago", "fecha", "fechaAnulacion", "fechaPago", "gananciaBruta", "id", "motivoAnulacion", "pedidoId", "precioUnitario", "productoId", "sabor", "totalVenta") SELECT "anulada", "cantidad", "cliente", "clienteId", "costoTotal", "costoUnitario", "estadoPago", "fecha", "fechaAnulacion", "fechaPago", "gananciaBruta", "id", "motivoAnulacion", "pedidoId", "precioUnitario", "productoId", "sabor", "totalVenta" FROM "Venta";
DROP TABLE "Venta";
ALTER TABLE "new_Venta" RENAME TO "Venta";
CREATE INDEX "Venta_fecha_idx" ON "Venta"("fecha");
CREATE INDEX "Venta_productoId_idx" ON "Venta"("productoId");
CREATE INDEX "Venta_estadoPago_idx" ON "Venta"("estadoPago");
CREATE INDEX "Venta_clienteId_idx" ON "Venta"("clienteId");
CREATE INDEX "Venta_pedidoId_idx" ON "Venta"("pedidoId");
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
    "linea" INTEGER NOT NULL DEFAULT 0,
    "editada" BOOLEAN NOT NULL DEFAULT false,
    "eliminada" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "VentaHistorica_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "VentaHistorica_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_VentaHistorica" ("cantidad", "cliente", "clienteId", "comision", "costo", "editada", "eliminada", "fecha", "fechaEstimada", "fila", "hoja", "id", "linea", "productoId", "productoNombre", "productoOriginal", "utilidad", "valor") SELECT "cantidad", "cliente", "clienteId", "comision", "costo", "editada", "eliminada", "fecha", "fechaEstimada", "fila", "hoja", "id", "linea", "productoId", "productoNombre", "productoOriginal", "utilidad", "valor" FROM "VentaHistorica";
DROP TABLE "VentaHistorica";
ALTER TABLE "new_VentaHistorica" RENAME TO "VentaHistorica";
CREATE INDEX "VentaHistorica_fecha_idx" ON "VentaHistorica"("fecha");
CREATE INDEX "VentaHistorica_productoId_idx" ON "VentaHistorica"("productoId");
CREATE INDEX "VentaHistorica_clienteId_idx" ON "VentaHistorica"("clienteId");
CREATE UNIQUE INDEX "VentaHistorica_hoja_fila_linea_key" ON "VentaHistorica"("hoja", "fila", "linea");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
