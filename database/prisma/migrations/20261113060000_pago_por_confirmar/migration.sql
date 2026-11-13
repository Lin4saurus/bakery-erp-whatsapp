-- D91: el comprobante nunca confirma el pago solo; la dueña lo confirma desde Atención.
-- AlterTable
ALTER TABLE "Atencion" ADD COLUMN "montoReportado" DECIMAL;
ALTER TABLE "Atencion" ADD COLUMN "referencia" TEXT;
