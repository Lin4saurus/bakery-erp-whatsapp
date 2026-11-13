-- D87: los insumos se descuentan al «Empezar a preparar», no al pagar.
ALTER TABLE "Pedido" ADD COLUMN "insumosDescontadosEn" DATETIME;

-- Los pedidos ya pagados (D86) descontaron sus insumos al pagar: quedan marcados para no descontar dos veces.
UPDATE "Pedido" SET "insumosDescontadosEn" = "pagadoEn" WHERE "ventaPedidoId" IS NOT NULL;
