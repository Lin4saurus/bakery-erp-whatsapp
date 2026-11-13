// Pedidos de demostración (D81) para mostrar la agenda de Pedidos: atrasados, hoy, mañana y la semana.
// Usa clientes y productos que ya existen; no crea clientes. Todos quedan con esDemo = true.
//   npm run demo:pedidos          → borra los demo anteriores y crea los de hoy en adelante
//   npm run demo:pedidos:borrar   → solo los borra (los pagados: borra también su venta y devuelve el stock)
// El cliente paga primero (D86): los demo quedan pagados (con su venta y descuento de stock, como en la app),
// salvo los marcados `porPagar`, que muestran el grupo «Esperando pago».
import { EstadoPedido, MetodoPago, OrigenPedido, Prisma } from "@prisma/client";
import { prisma } from "../../backend/src/prisma";
import { eliminarVenta } from "../../backend/src/routes/ventas";
import { pagarPedidoPorId } from "../../backend/src/routes/pedidos";

type Demo = {
  dias: number; // desde hoy (−1 = ayer)
  hora?: string;
  cliente: string;
  origen?: OrigenPedido;
  estado?: EstadoPedido;
  nota?: string;
  motivo?: string;
  porPagar?: boolean; // todavía no pagó (D86)
  lineas: [string, number][];
};

const DEMOS: Demo[] = [
  {
    dias: -1,
    hora: "16:00",
    cliente: "Carol Aguilera",
    nota: "Con dedicatoria «Feliz cumple Sofía»",
    lineas: [["Tres leches familiar", 1]],
  },
  {
    dias: 0,
    hora: "10:00",
    cliente: "Mercado Primavera",
    estado: EstadoPedido.EN_PREPARACION,
    lineas: [
      ["Queque Vainilla", 6],
      ["Queque Chocolate", 4],
      ["Queque Coco", 2],
    ],
  },
  {
    dias: 0,
    hora: "15:30",
    cliente: "Daniela Vargas",
    origen: OrigenPedido.WHATSAPP,
    estado: EstadoPedido.LISTO,
    lineas: [
      ["Brownie personal premium", 2],
      ["Chocoflan", 1],
    ],
  },
  { dias: 0, hora: "18:00", cliente: "Nicol Flores", nota: "Pasa a recoger", lineas: [["Brownies premium 9 u", 1]] },
  {
    dias: 1,
    hora: "09:00",
    cliente: "Eliana",
    lineas: [
      ["Queque Naranja", 5],
      ["Queque Limón", 5],
    ],
  },
  {
    dias: 1,
    hora: "17:00",
    cliente: "Teresa Subirana",
    origen: OrigenPedido.WHATSAPP,
    porPagar: true,
    lineas: [["Fresas con crema y brownie", 2]],
  },
  { dias: 2, hora: "11:00", cliente: "Paola Andrea Lozada", nota: "Sin frutilla encima", lineas: [["Tres leches", 1]] },
  {
    dias: 3,
    hora: "10:00",
    cliente: "Mercado Primavera",
    lineas: [
      ["Queque Vainilla", 10],
      ["Queque Oreo", 5],
    ],
  },
  {
    dias: 3,
    hora: "16:00",
    cliente: "Yesica Serrate",
    origen: OrigenPedido.WHATSAPP,
    porPagar: true,
    lineas: [["Frutillas bañadas en chocolate", 4]],
  },
  { dias: 6, cliente: "Cinthya Ballejos", nota: "Para 30 personas, entrega a domicilio", lineas: [["Tres leches mega", 1]] },
  {
    dias: -1,
    hora: "12:00",
    cliente: "Joel Blanco Clemente",
    estado: EstadoPedido.CANCELADO,
    motivo: "El cliente ya no lo necesita",
    lineas: [["Chocoflan", 1]],
  },
];

const diaDesdeHoy = (dias: number) => {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return fecha.toLocaleDateString("sv-SE");
};

async function borrarDemos(): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const demos = await tx.pedido.findMany({ where: { esDemo: true } });
    for (const p of demos) {
      if (p.ventaPedidoId) {
        const ventas = await tx.venta.findMany({ where: { pedidoId: p.ventaPedidoId }, select: { id: true } });
        for (const v of ventas) await eliminarVenta(tx, v.id);
      }
    }
    await tx.pedido.deleteMany({ where: { esDemo: true } });
    return demos.length;
  });
}

async function crearDemos(): Promise<number> {
  const clientes = await prisma.cliente.findMany();
  const productos = await prisma.producto.findMany({ where: { eliminado: false } });
  let numero = ((await prisma.pedido.aggregate({ _max: { numero: true } }))._max.numero ?? 0) + 1;
  let creados = 0;
  for (const d of DEMOS) {
    const cliente = clientes.find((c) => c.nombre === d.cliente);
    if (!cliente) {
      console.warn(`Se omite un pedido: no existe el cliente «${d.cliente}».`);
      continue;
    }
    const lineas = [];
    for (const [nombre, cantidad] of d.lineas) {
      const producto = productos.find((p) => p.nombre === nombre);
      if (!producto || producto.precioVenta === null) {
        console.warn(`Se omite «${nombre}»: no existe o no tiene precio.`);
        continue;
      }
      const acordado = await prisma.precioCliente.findUnique({
        where: { clienteId_productoId: { clienteId: cliente.id, productoId: producto.id } },
      });
      lineas.push({
        productoId: producto.id,
        cantidad: new Prisma.Decimal(cantidad),
        precioUnitario: acordado?.precio ?? producto.precioVenta,
      });
    }
    if (lineas.length === 0) continue;
    const pagado = !d.porPagar && d.estado !== EstadoPedido.CANCELADO;
    const estado = d.estado ?? (pagado ? EstadoPedido.PENDIENTE : EstadoPedido.POR_PAGAR);
    const pedido = await prisma.pedido.create({
      data: {
        numero: numero++,
        clienteId: cliente.id,
        fechaEntrega: diaDesdeHoy(d.dias),
        horaEntrega: d.hora ?? null,
        estado,
        origen: d.origen ?? OrigenPedido.MANUAL,
        nota: d.nota ?? null,
        total: lineas.reduce((t, l) => t.add(l.precioUnitario.mul(l.cantidad)), new Prisma.Decimal(0)),
        esDemo: true,
        canceladoEn: estado === EstadoPedido.CANCELADO ? new Date() : null,
        motivoCancelacion: d.motivo ?? null,
        lineas: { create: lineas },
      },
    });
    if (pagado) {
      await prisma.$transaction((tx) =>
        pagarPedidoPorId(
          tx,
          pedido.id,
          {
            metodo: pedido.origen === OrigenPedido.WHATSAPP ? MetodoPago.QR : MetodoPago.EFECTIVO,
          },
          { exigirCelular: false },
        ),
      );
    }
    creados++;
  }
  return creados;
}

async function main() {
  const soloBorrar = process.argv.includes("--borrar");
  const borrados = await borrarDemos();
  console.log(`Pedidos demo borrados: ${borrados}.`);
  if (!soloBorrar) console.log(`Pedidos demo creados: ${await crearDemos()}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
