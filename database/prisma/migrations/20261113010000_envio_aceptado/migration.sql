-- D89: el cliente acepta el costo del envío (delivery) antes de recibir el QR.
ALTER TABLE "Pedido" ADD COLUMN "envioAceptadoEn" DATETIME;
