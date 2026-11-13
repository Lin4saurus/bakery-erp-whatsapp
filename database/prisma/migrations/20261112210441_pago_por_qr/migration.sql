-- AlterTable
ALTER TABLE "Atencion" ADD COLUMN "adjunto" TEXT;

-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN "comprobante" TEXT;
ALTER TABLE "Pedido" ADD COLUMN "metodoPago" TEXT;
ALTER TABLE "Pedido" ADD COLUMN "montoPagado" DECIMAL;
ALTER TABLE "Pedido" ADD COLUMN "pagadoEn" DATETIME;
ALTER TABLE "Pedido" ADD COLUMN "pagoReferencia" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Pedido_pagoReferencia_key" ON "Pedido"("pagoReferencia");

