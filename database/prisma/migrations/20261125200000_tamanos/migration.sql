-- Tamaños (D118): grupo y tamaño en Producto. Los que ya se llaman «Producto · Tamaño» quedan agrupados.
ALTER TABLE "Producto" ADD COLUMN "grupo" TEXT;
ALTER TABLE "Producto" ADD COLUMN "tamano" TEXT;

UPDATE "Producto"
SET "grupo" = trim(substr("nombre", 1, instr("nombre", ' · ') - 1)),
    "tamano" = trim(substr("nombre", instr("nombre", ' · ') + 3))
WHERE "tipo" = 'VENTA' AND instr("nombre", ' · ') > 0;

CREATE INDEX "Producto_grupo_idx" ON "Producto"("grupo");