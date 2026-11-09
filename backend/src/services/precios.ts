import { Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient;

// Precio acordado con un cliente para un producto (D42). Cada mayorista negocia el suyo;
// sin precio acordado se cobra el precio de venta (o el que se escriba en la Caja).
export async function precioAcordado(db: Db, clienteId: string, productoId: number): Promise<Prisma.Decimal | null> {
  const acordado = await db.precioCliente.findUnique({ where: { clienteId_productoId: { clienteId, productoId } } });
  return acordado?.precio ?? null;
}
