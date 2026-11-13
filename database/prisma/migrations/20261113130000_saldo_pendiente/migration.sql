-- D95: lo que falta pagar después de cada comprobante (pago parcial válido).
-- AlterTable
ALTER TABLE "Atencion" ADD COLUMN "saldoPendiente" DECIMAL;
