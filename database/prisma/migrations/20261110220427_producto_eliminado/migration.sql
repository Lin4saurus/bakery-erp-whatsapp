-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Producto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'VENTA',
    "rendimientoReceta" DECIMAL NOT NULL,
    "unidadRendimiento" TEXT NOT NULL DEFAULT 'UNIDAD',
    "precioVenta" DECIMAL,
    "unidadesPorVenta" DECIMAL NOT NULL DEFAULT 1,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "disponible" BOOLEAN NOT NULL DEFAULT true,
    "eliminado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Producto" ("activo", "categoria", "createdAt", "disponible", "id", "nombre", "precioVenta", "rendimientoReceta", "tipo", "unidadRendimiento", "unidadesPorVenta", "updatedAt") SELECT "activo", "categoria", "createdAt", "disponible", "id", "nombre", "precioVenta", "rendimientoReceta", "tipo", "unidadRendimiento", "unidadesPorVenta", "updatedAt" FROM "Producto";
DROP TABLE "Producto";
ALTER TABLE "new_Producto" RENAME TO "Producto";
CREATE UNIQUE INDEX "Producto_nombre_key" ON "Producto"("nombre");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
