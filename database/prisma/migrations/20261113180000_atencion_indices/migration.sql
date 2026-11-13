-- B1 (AUDITORIA.md): el chat se busca por los últimos 8 dígitos con igualdad e índice; índices para la verificación de pagos.
ALTER TABLE "Atencion" ADD COLUMN "celularClave" TEXT NOT NULL DEFAULT '';
UPDATE "Atencion" SET "celularClave" = substr("celular", -8);

-- DropIndex
DROP INDEX "Atencion_celular_estado_idx";

-- CreateIndex
CREATE INDEX "Atencion_celularClave_estado_idx" ON "Atencion"("celularClave", "estado");

-- CreateIndex
CREATE INDEX "Atencion_pedidoId_estado_idx" ON "Atencion"("pedidoId", "estado");

-- CreateIndex
CREATE INDEX "Atencion_referencia_idx" ON "Atencion"("referencia");
