// Limpia la copia de la base que va a la portátil de la repostera (D108–D110). La corre armar-paquete.ts con
// DATABASE_URL apuntando a la copia; nunca sobre la base de verdad.
//  - Clientes de prueba: los que tienen un celular de la lista de números de prueba del agente. Se van sus pedidos
//    (y la venta de cada uno, devolviendo el stock, como el borrado de demos), sus atenciones y el cliente.
//    La lista de números de prueba se queda: sirve cuando la repostera encienda WhatsApp.
//  - Sin PIN (crea el suyo) y con WhatsApp apagado (hasta que contrate la API y la IA).

import { prisma } from "../backend/src/prisma";
import { leerNumerosPrueba } from "../backend/src/routes/agente";
import { eliminarVenta } from "../backend/src/routes/ventas";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("dulzura-entrega")) throw new Error(`Esto solo se corre sobre la copia del paquete, no sobre ${url}.`);

  const claves = (await leerNumerosPrueba()).map((n) => n.slice(-8));
  const clientes = (await prisma.cliente.findMany({ where: { celular: { not: null } } })).filter((c) =>
    claves.includes((c.celular ?? "").replace(/\D/g, "").slice(-8)),
  );
  await prisma.$transaction(async (tx) => {
    for (const c of clientes) {
      const pedidos = await tx.pedido.findMany({ where: { clienteId: c.id } });
      for (const p of pedidos) {
        if (!p.ventaPedidoId) continue;
        const ventas = await tx.venta.findMany({ where: { pedidoId: p.ventaPedidoId }, select: { id: true } });
        for (const v of ventas) await eliminarVenta(tx, v.id);
      }
      await tx.pedido.deleteMany({ where: { clienteId: c.id } });
      // Ventas sueltas de la Caja a su nombre (sin pedido): también son de prueba.
      const sueltas = await tx.venta.findMany({ where: { clienteId: c.id }, select: { id: true } });
      for (const v of sueltas) await eliminarVenta(tx, v.id);
      await tx.cliente.delete({ where: { id: c.id } });
      console.log(`Cliente de prueba quitado: ${c.nombre} (${pedidos.length} pedido(s), ${sueltas.length} venta(s) suelta(s)).`);
    }
    const atenciones = await tx.atencion.deleteMany({ where: { celularClave: { in: claves } } });
    if (atenciones.count > 0) console.log(`Atenciones de números de prueba quitadas: ${atenciones.count}.`);

    await tx.configuracion.deleteMany({ where: { clave: "seguridad.pin" } });
    // El respaldo por correo lo configura ella en su portátil (D111): nada del Gmail de esta PC.
    await tx.configuracion.deleteMany({ where: { clave: { startsWith: "respaldo." } } });
    await tx.configuracion.upsert({
      where: { clave: "agente.whatsapp" },
      create: { clave: "agente.whatsapp", valor: "apagado" },
      update: { valor: "apagado" },
    });
  });

  const demo = await prisma.pedido.count({ where: { esDemo: true } });
  if (demo > 0) throw new Error(`Quedaron ${demo} pedido(s) de demostración en la copia.`);
  const r = await prisma.$queryRawUnsafe<{ integrity_check: string }[]>("PRAGMA integrity_check");
  if (r[0]?.integrity_check !== "ok") throw new Error("La copia de la base no pasó la revisión de integridad.");
  console.log("Copia limpia: sin PIN, sin demos, WhatsApp apagado, integridad ok.");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
