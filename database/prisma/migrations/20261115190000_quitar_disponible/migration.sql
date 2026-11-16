-- D104: Producto.disponible no se usa desde D49 (todo producto activo se vende).
ALTER TABLE "Producto" DROP COLUMN "disponible";
