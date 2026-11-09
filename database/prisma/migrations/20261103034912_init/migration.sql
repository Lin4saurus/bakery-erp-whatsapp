-- CreateTable
CREATE TABLE "Insumo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT 'MATERIA_PRIMA',
    "unidadBase" TEXT NOT NULL,
    "contenidoEnvase" DECIMAL NOT NULL,
    "precioEnvase" DECIMAL NOT NULL,
    "stockActual" DECIMAL NOT NULL DEFAULT 0,
    "stockMinimo" DECIMAL NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Producto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'VENTA',
    "rendimientoReceta" DECIMAL NOT NULL,
    "unidadRendimiento" TEXT NOT NULL DEFAULT 'UNIDAD',
    "precioVenta" DECIMAL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "IngredienteReceta" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productoId" INTEGER NOT NULL,
    "insumoId" INTEGER NOT NULL,
    "cantidad" DECIMAL NOT NULL,
    CONSTRAINT "IngredienteReceta_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IngredienteReceta_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ComponenteReceta" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productoId" INTEGER NOT NULL,
    "subProductoId" INTEGER NOT NULL,
    "cantidad" DECIMAL NOT NULL,
    CONSTRAINT "ComponenteReceta_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ComponenteReceta_subProductoId_fkey" FOREIGN KEY ("subProductoId") REFERENCES "Producto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Venta" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productoId" INTEGER NOT NULL,
    "cantidad" DECIMAL NOT NULL,
    "precioUnitario" DECIMAL NOT NULL,
    "costoUnitario" DECIMAL NOT NULL,
    "totalVenta" DECIMAL NOT NULL,
    "costoTotal" DECIMAL NOT NULL,
    "gananciaBruta" DECIMAL NOT NULL,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Venta_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Insumo_nombre_key" ON "Insumo"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Producto_nombre_key" ON "Producto"("nombre");

-- CreateIndex
CREATE INDEX "IngredienteReceta_insumoId_idx" ON "IngredienteReceta"("insumoId");

-- CreateIndex
CREATE UNIQUE INDEX "IngredienteReceta_productoId_insumoId_key" ON "IngredienteReceta"("productoId", "insumoId");

-- CreateIndex
CREATE INDEX "ComponenteReceta_subProductoId_idx" ON "ComponenteReceta"("subProductoId");

-- CreateIndex
CREATE UNIQUE INDEX "ComponenteReceta_productoId_subProductoId_key" ON "ComponenteReceta"("productoId", "subProductoId");

-- CreateIndex
CREATE INDEX "Venta_fecha_idx" ON "Venta"("fecha");

-- CreateIndex
CREATE INDEX "Venta_productoId_idx" ON "Venta"("productoId");
