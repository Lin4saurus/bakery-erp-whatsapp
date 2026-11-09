-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Insumo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT 'MATERIA_PRIMA',
    "unidadBase" TEXT NOT NULL,
    "contenidoEnvase" DECIMAL NOT NULL,
    "precioEnvase" DECIMAL NOT NULL,
    "stockActual" DECIMAL NOT NULL DEFAULT 0,
    "stockMinimo" DECIMAL NOT NULL DEFAULT 0,
    "controlaStock" BOOLEAN NOT NULL DEFAULT true,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Insumo" ("activo", "categoria", "contenidoEnvase", "createdAt", "id", "nombre", "precioEnvase", "stockActual", "stockMinimo", "unidadBase", "updatedAt") SELECT "activo", "categoria", "contenidoEnvase", "createdAt", "id", "nombre", "precioEnvase", "stockActual", "stockMinimo", "unidadBase", "updatedAt" FROM "Insumo";
DROP TABLE "Insumo";
ALTER TABLE "new_Insumo" RENAME TO "Insumo";
CREATE UNIQUE INDEX "Insumo_nombre_key" ON "Insumo"("nombre");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- D40: el agua de la casa y la limpieza no se cuentan (siguen costando en las recetas).
UPDATE "Insumo" SET "controlaStock" = false, "stockMinimo" = 0 WHERE "nombre" IN ('Agua', 'Limpieza y otros');
