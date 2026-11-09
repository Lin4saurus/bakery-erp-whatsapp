-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'MINORISTA',
    "listaPreciosId" TEXT,
    "celular" TEXT,
    "email" TEXT,
    "direccion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Cliente_listaPreciosId_fkey" FOREIGN KEY ("listaPreciosId") REFERENCES "ListaPrecios" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ListaPrecios" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "descuento" DECIMAL NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PrecioProducto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listaId" TEXT NOT NULL,
    "productoId" INTEGER NOT NULL,
    "precio" DECIMAL NOT NULL,
    CONSTRAINT "PrecioProducto_listaId_fkey" FOREIGN KEY ("listaId") REFERENCES "ListaPrecios" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PrecioProducto_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "sabores" TEXT,
    "fechaPago" DATETIME,
    "anulada" BOOLEAN NOT NULL DEFAULT false,
    "fechaAnulacion" DATETIME,
    "motivoAnulacion" TEXT,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Venta_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Venta_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Venta" ("anulada", "cantidad", "cliente", "costoTotal", "costoUnitario", "estadoPago", "fecha", "fechaAnulacion", "fechaPago", "gananciaBruta", "id", "motivoAnulacion", "precioUnitario", "productoId", "totalVenta") SELECT "anulada", "cantidad", "cliente", "costoTotal", "costoUnitario", "estadoPago", "fecha", "fechaAnulacion", "fechaPago", "gananciaBruta", "id", "motivoAnulacion", "precioUnitario", "productoId", "totalVenta" FROM "Venta";
DROP TABLE "Venta";
ALTER TABLE "new_Venta" RENAME TO "Venta";
CREATE INDEX "Venta_fecha_idx" ON "Venta"("fecha");
CREATE INDEX "Venta_productoId_idx" ON "Venta"("productoId");
CREATE INDEX "Venta_estadoPago_idx" ON "Venta"("estadoPago");
CREATE INDEX "Venta_clienteId_idx" ON "Venta"("clienteId");
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
    "formaPago" TEXT,
    "cliente" TEXT,
    "clienteId" TEXT,
    "sabores" TEXT,
    CONSTRAINT "VentaHistorica_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "VentaHistorica_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_VentaHistorica" ("cantidad", "cliente", "comision", "costo", "fecha", "fechaEstimada", "fila", "formaPago", "hoja", "id", "productoId", "productoNombre", "productoOriginal", "utilidad", "valor") SELECT "cantidad", "cliente", "comision", "costo", "fecha", "fechaEstimada", "fila", "formaPago", "hoja", "id", "productoId", "productoNombre", "productoOriginal", "utilidad", "valor" FROM "VentaHistorica";
DROP TABLE "VentaHistorica";
ALTER TABLE "new_VentaHistorica" RENAME TO "VentaHistorica";
CREATE INDEX "VentaHistorica_fecha_idx" ON "VentaHistorica"("fecha");
CREATE INDEX "VentaHistorica_productoId_idx" ON "VentaHistorica"("productoId");
CREATE INDEX "VentaHistorica_clienteId_idx" ON "VentaHistorica"("clienteId");
CREATE UNIQUE INDEX "VentaHistorica_hoja_fila_key" ON "VentaHistorica"("hoja", "fila");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_nombre_key" ON "Cliente"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "ListaPrecios_nombre_key" ON "ListaPrecios"("nombre");

-- CreateIndex
CREATE INDEX "PrecioProducto_productoId_idx" ON "PrecioProducto"("productoId");

-- CreateIndex
CREATE UNIQUE INDEX "PrecioProducto_listaId_productoId_key" ON "PrecioProducto"("listaId", "productoId");
