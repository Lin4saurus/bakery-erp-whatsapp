-- AlterTable
ALTER TABLE "Venta" ADD COLUMN "pedidoId" TEXT;

-- CreateIndex
CREATE INDEX "Venta_pedidoId_idx" ON "Venta"("pedidoId");
