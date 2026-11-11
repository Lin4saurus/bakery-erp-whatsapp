-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GastoOperativo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "descripcion" TEXT NOT NULL,
    "monto" DECIMAL NOT NULL,
    "categoria" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "insumoId" INTEGER,
    "cantidad" DECIMAL,
    "movimientoId" INTEGER,
    CONSTRAINT "GastoOperativo_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GastoOperativo_movimientoId_fkey" FOREIGN KEY ("movimientoId") REFERENCES "MovimientoInventario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_GastoOperativo" ("categoria", "createdAt", "descripcion", "fecha", "id", "monto") SELECT "categoria", "createdAt", "descripcion", "fecha", "id", "monto" FROM "GastoOperativo";
DROP TABLE "GastoOperativo";
ALTER TABLE "new_GastoOperativo" RENAME TO "GastoOperativo";
CREATE UNIQUE INDEX "GastoOperativo_movimientoId_key" ON "GastoOperativo"("movimientoId");
CREATE INDEX "GastoOperativo_fecha_idx" ON "GastoOperativo"("fecha");
CREATE INDEX "GastoOperativo_insumoId_idx" ON "GastoOperativo"("insumoId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
