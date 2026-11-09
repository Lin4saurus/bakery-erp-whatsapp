import { PrismaClient, Prisma } from "@prisma/client";

export const prisma = new PrismaClient();

// Cliente normal o el de una transacción: los servicios aceptan cualquiera de los dos.
export type Db = PrismaClient | Prisma.TransactionClient;
