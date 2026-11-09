-- D42: cada mayorista negocia su propio precio. Las listas de precios se reemplazan por
-- un precio acordado por cliente y producto. Se copian los precios de cada cliente desde su lista.

-- CreateTable
CREATE TABLE "PrecioCliente" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clienteId" TEXT NOT NULL,
    "productoId" INTEGER NOT NULL,
    "precio" DECIMAL NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PrecioCliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PrecioCliente_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Copia: precio de la lista de cada cliente (Mercado Primavera: Queque 12; Eliana: Queque 13).
INSERT INTO "PrecioCliente" ("id", "clienteId", "productoId", "precio", "updatedAt")
SELECT
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-a' || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
    c."id", pp."productoId", pp."precio", CURRENT_TIMESTAMP
FROM "Cliente" c
JOIN "PrecioProducto" pp ON pp."listaId" = c."listaPreciosId";

-- DropIndex
DROP INDEX "ListaPrecios_nombre_key";
DROP INDEX "PrecioProducto_listaId_productoId_key";
DROP INDEX "PrecioProducto_productoId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PrecioProducto";
DROP TABLE "ListaPrecios";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Cliente" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'MINORISTA',
    "celular" TEXT,
    "email" TEXT,
    "direccion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Cliente" ("activo", "celular", "createdAt", "direccion", "email", "id", "nombre", "tipo", "updatedAt") SELECT "activo", "celular", "createdAt", "direccion", "email", "id", "nombre", "tipo", "updatedAt" FROM "Cliente";
DROP TABLE "Cliente";
ALTER TABLE "new_Cliente" RENAME TO "Cliente";
CREATE UNIQUE INDEX "Cliente_nombre_key" ON "Cliente"("nombre");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PrecioCliente_productoId_idx" ON "PrecioCliente"("productoId");
CREATE UNIQUE INDEX "PrecioCliente_clienteId_productoId_key" ON "PrecioCliente"("clienteId", "productoId");
