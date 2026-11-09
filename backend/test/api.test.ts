// Tests de integración de la API (Fase 2) contra una BD de prueba propia:
// database/prisma/test.db, recreada y sembrada en cada corrida.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Prisma } from "@prisma/client";

process.env.DATABASE_URL = "file:./test.db";
const CARPETA_RESPALDOS = mkdtempSync(path.join(os.tmpdir(), "dulzura-test-respaldos-"));
process.env.BACKUP_DIR = CARPETA_RESPALDOS;
process.env.BACKUP_KEEP = "2";

interface Insumo {
  id: number;
  nombre: string;
  precioEnvase: string;
  costoUnitario: string;
}
interface Producto {
  id: number;
  nombre: string;
  tipo: "VENTA" | "INTERMEDIO";
  costoTanda: string;
  costoUnitario: string;
  gananciaUnitaria: string | null;
}
interface Costo {
  costoTanda: string;
  costoUnitario: string;
  rendimientoReceta: string;
  gananciaUnitaria: string | null;
  insumos: { nombre: string; costo: string }[];
  subRecetas: { nombre: string; costo: string }[];
}
interface InsumoConStock extends Insumo {
  stockActual: string;
}
interface Movimiento {
  tipo: "COMPRA" | "AJUSTE" | "VENTA" | "ANULACION";
  cantidad: string;
  stockResultante: string;
  ventaId: number | null;
  nota: string | null;
}
interface Alerta {
  nombre: string;
  nivel: "SIN_STOCK" | "BAJO_MINIMO";
}
interface Venta {
  id: number;
  producto: string;
  cantidad: string;
  precioUnitario: string;
  costoUnitario: string;
  totalVenta: string;
  costoTotal: string;
  gananciaBruta: string;
}
interface VentaCreada {
  venta: Venta;
  consumo: { nombre: string; cantidad: string; stockResultante: string }[];
  alertas: Alerta[];
}
interface ListaVentas {
  resumen: { ventas: number; unidades: string; totalVenta: string; costoTotal: string; gananciaBruta: string };
  ventas: Venta[];
}
interface ErrorApi {
  error: string;
  detalles?: { campo: string; mensaje: string }[];
}
interface Respuesta<T> {
  status: number;
  body: T;
}

let server: Server;
let base = "";
let desconectar: () => Promise<void> = async () => {};
let costosEsperados: Record<string, string> = {};

// Toda venta lleva cliente con celular (D44). Para no repetirlo en cada test, una venta sin cliente se
// registra a «Mostrador»; con `cliente: "Nombre"` se usa (o crea) ese cliente. `__sinCliente` lo desactiva.
function conClientePorDefecto(ruta: string, metodo: string, cuerpo: unknown): unknown {
  if (metodo !== "POST" || ruta !== "/ventas" || typeof cuerpo !== "object" || cuerpo === null) return cuerpo;
  const { __sinCliente, cliente, ...resto } = cuerpo as Record<string, unknown>;
  if (__sinCliente) return resto;
  if ("clienteId" in resto || "clienteNombre" in resto) return { celular: "70000000", ...resto };
  return { celular: "70000000", ...resto, clienteNombre: typeof cliente === "string" ? cliente : "Mostrador" };
}

async function api<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<Respuesta<T>> {
  const enviado = conClientePorDefecto(ruta, metodo, cuerpo);
  const res = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: enviado === undefined ? undefined : JSON.stringify(enviado),
  });
  const texto = await res.text();
  return { status: res.status, body: (texto ? JSON.parse(texto) : null) as T };
}

const D = (valor: string | number): Prisma.Decimal => new Prisma.Decimal(valor);
const cerca = (actual: string, esperado: Prisma.Decimal | string, tolerancia = "0.001"): boolean =>
  D(actual).sub(esperado).abs().lte(tolerancia);

async function productoPorNombre(nombre: string): Promise<Producto> {
  const { body } = await api<Producto[]>("GET", "/productos");
  const producto = body.find((p) => p.nombre === nombre);
  assert.ok(producto, `No se encontró el producto ${nombre}`);
  return producto;
}

async function insumoPorNombre(nombre: string): Promise<Insumo> {
  const { body } = await api<Insumo[]>("GET", "/insumos");
  const insumo = body.find((i) => i.nombre === nombre);
  assert.ok(insumo, `No se encontró el insumo ${nombre}`);
  return insumo;
}

before(async () => {
  // Solo se recrea la BD de prueba; dulzura.db no se toca.
  rmSync(path.join(__dirname, "../../database/prisma/test.db"), { force: true });
  execSync("npx prisma migrate deploy", { stdio: "ignore", env: process.env });
  // Sin stock de prueba: los tests parten de stock 0.
  execSync("npx tsx database/prisma/seed.ts", { stdio: "ignore", env: { ...process.env, SEED_STOCK_PRUEBA: "false" } });
  execSync("npx tsx database/prisma/importar-historico.ts", { stdio: "ignore", env: process.env });
  const { createApp } = await import("../src/app");
  const { prisma } = await import("../src/prisma");
  ({ costosEsperados } = await import("../../database/prisma/check-seed"));
  desconectar = () => prisma.$disconnect();
  server = createApp().listen(0);
  await once(server, "listening");
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

after(async () => {
  server?.close();
  await desconectar();
  rmSync(CARPETA_RESPALDOS, { recursive: true, force: true });
});

describe("Motor de costeo", () => {
  test("el costo de cada producto coincide con CONTEXT.md §4", async () => {
    const { status, body } = await api<Producto[]>("GET", "/productos");
    assert.equal(status, 200);
    assert.equal(body.length, Object.keys(costosEsperados).length);
    for (const producto of body) {
      const esperado = costosEsperados[producto.nombre];
      assert.ok(esperado, `Falta valor esperado para ${producto.nombre}`);
      const calculado = producto.tipo === "INTERMEDIO" ? producto.costoTanda : producto.costoUnitario;
      assert.ok(cerca(calculado, esperado), `${producto.nombre}: ${calculado} ≠ ${esperado}`);
    }
  });

  test("el detalle de costo suma el costo de la tanda e incluye sub-recetas", async () => {
    const conRelleno = await productoPorNombre("Queque con relleno");
    const { status, body } = await api<Costo>("GET", `/productos/${conRelleno.id}/costo`);
    assert.equal(status, 200);
    assert.equal(body.insumos.length, 12);
    assert.deepEqual(body.subRecetas.map((s) => s.nombre).sort(), ["Relleno de Brigadeiro", "Relleno de Nido"]);
    const suma = [...body.insumos, ...body.subRecetas].reduce((total, l) => total.add(l.costo), D(0));
    assert.ok(cerca(body.costoTanda, suma, "0.000001"));
    assert.ok(cerca(body.costoUnitario, D(body.costoTanda).div(body.rendimientoReceta), "0.000001"));
  });

  test("cambiar el precio de un insumo recalcula el costo al instante", async () => {
    const queque = await productoPorNombre("Queque");
    const harina = await insumoPorNombre("Harina");
    const antes = await api<Costo>("GET", `/productos/${queque.id}/costo`);

    const cambio = await api<Insumo>("PATCH", `/insumos/${harina.id}`, { precioEnvase: "640" });
    assert.equal(cambio.status, 200);
    assert.ok(cerca(cambio.body.costoUnitario, "0.0128", "0.0000001"));

    // 260 g de harina por tanda: +260 × 0.0064 Bs por tanda.
    const despues = await api<Costo>("GET", `/productos/${queque.id}/costo`);
    const esperado = D(antes.body.costoUnitario).add(D(260).mul("0.0064").div(antes.body.rendimientoReceta));
    assert.ok(cerca(despues.body.costoUnitario, esperado, "0.000001"));

    await api("PATCH", `/insumos/${harina.id}`, { precioEnvase: harina.precioEnvase });
  });

  test("cambiar un insumo de un relleno cambia el costo del queque que lo usa", async () => {
    const conRelleno = await productoPorNombre("Queque con relleno");
    const condensada = await insumoPorNombre("Leche condensada");
    await api("PATCH", `/insumos/${condensada.id}`, { precioEnvase: "20" });
    const despues = await productoPorNombre("Queque con relleno");
    assert.ok(D(despues.costoUnitario).gt(conRelleno.costoUnitario));
    await api("PATCH", `/insumos/${condensada.id}`, { precioEnvase: condensada.precioEnvase });
  });
});

describe("API de insumos", () => {
  test("lista los 46 insumos con su costo unitario", async () => {
    const { status, body } = await api<Insumo[]>("GET", "/insumos");
    assert.equal(status, 200);
    assert.equal(body.length, 46); // Queques 26 + Brownies 8 + Flanes 4 + tres leches y fresas 8
    const harina = body.find((i) => i.nombre === "Harina");
    assert.ok(harina && cerca(harina.costoUnitario, "0.0064", "0.0000001"));
  });

  test("rechaza datos inválidos con mensajes claros", async () => {
    const { status, body } = await api<ErrorApi>("POST", "/insumos", {
      nombre: "Canela",
      unidadBase: "GRAMO",
      contenidoEnvase: 0,
      precioEnvase: "abc",
    });
    assert.equal(status, 400);
    const campos = body.detalles?.map((d) => d.campo).sort();
    assert.deepEqual(campos, ["contenidoEnvase", "precioEnvase"]);
  });

  test("no permite nombres duplicados", async () => {
    const { status } = await api<ErrorApi>("POST", "/insumos", {
      nombre: "Harina",
      unidadBase: "GRAMO",
      contenidoEnvase: 1000,
      precioEnvase: 10,
    });
    assert.equal(status, 409);
  });

  test("no borra un insumo usado en recetas", async () => {
    const harina = await insumoPorNombre("Harina");
    const { status, body } = await api<ErrorApi>("DELETE", `/insumos/${harina.id}`);
    assert.equal(status, 409);
    assert.match(body.error, /Queque/);
  });

  test("responde 404 con un id inexistente y 400 con un id inválido", async () => {
    assert.equal((await api("GET", "/insumos/99999")).status, 404);
    assert.equal((await api("GET", "/insumos/abc")).status, 400);
  });
});

describe("API de productos y recetas", () => {
  test("flujo completo: crear insumo y producto, recetar, costear y borrar", async () => {
    const canela = await api<Insumo>("POST", "/insumos", {
      nombre: "Canela",
      categoria: "MATERIA_PRIMA",
      unidadBase: "GRAMO",
      contenidoEnvase: "100",
      precioEnvase: "10",
    });
    assert.equal(canela.status, 201);
    const harina = await insumoPorNombre("Harina");

    const producto = await api<Producto>("POST", "/productos", {
      nombre: "Queque de canela",
      categoria: "Queques",
      rendimientoReceta: "2",
      precioVenta: "15",
    });
    assert.equal(producto.status, 201);
    assert.ok(cerca(producto.body.costoUnitario, "0"));

    // 500 g de harina (3.2 Bs) + 20 g de canela (2 Bs) = 5.2 Bs por tanda → 2.6 Bs por unidad.
    const receta = await api<Costo>("PUT", `/productos/${producto.body.id}/receta`, {
      ingredientes: [
        { insumoId: harina.id, cantidad: 500 },
        { insumoId: canela.body.id, cantidad: "20" },
      ],
    });
    assert.equal(receta.status, 200);
    assert.ok(cerca(receta.body.costoTanda, "5.2"));
    assert.ok(cerca(receta.body.costoUnitario, "2.6"));
    assert.ok(receta.body.gananciaUnitaria && cerca(receta.body.gananciaUnitaria, "12.4"));

    // Cambiar una cantidad y quitar un insumo.
    const masCanela = await api<Costo>("PUT", `/productos/${producto.body.id}/receta/insumos/${canela.body.id}`, {
      cantidad: 40,
    });
    assert.ok(cerca(masCanela.body.costoTanda, "7.2"));
    assert.equal((await api("DELETE", `/productos/${producto.body.id}/receta/insumos/${canela.body.id}`)).status, 204);
    const sinCanela = await api<Costo>("GET", `/productos/${producto.body.id}/costo`);
    assert.ok(cerca(sinCanela.body.costoTanda, "3.2"));

    assert.equal((await api("DELETE", `/productos/${producto.body.id}`)).status, 204);
    assert.equal((await api("DELETE", `/insumos/${canela.body.id}`)).status, 204);
  });

  test("rechaza recetas con insumos repetidos o inexistentes", async () => {
    const queque = await productoPorNombre("Queque");
    const harina = await insumoPorNombre("Harina");
    const repetido = await api<ErrorApi>("PUT", `/productos/${queque.id}/receta`, {
      ingredientes: [
        { insumoId: harina.id, cantidad: 1 },
        { insumoId: harina.id, cantidad: 2 },
      ],
    });
    assert.equal(repetido.status, 400);
    const inexistente = await api<ErrorApi>("PUT", `/productos/${queque.id}/receta`, {
      ingredientes: [{ insumoId: 99999, cantidad: 1 }],
    });
    assert.equal(inexistente.status, 404);
    // La receta original sigue intacta.
    const costo = await api<Costo>("GET", `/productos/${queque.id}/costo`);
    assert.equal(costo.body.insumos.length, 13);
  });

  test("solo acepta productos intermedios como sub-receta", async () => {
    const conRelleno = await productoPorNombre("Queque con relleno");
    const queque = await productoPorNombre("Queque");
    const { status, body } = await api<ErrorApi>("PUT", `/productos/${conRelleno.id}/receta`, {
      ingredientes: [],
      subRecetas: [{ subProductoId: queque.id, cantidad: 1 }],
    });
    assert.equal(status, 422);
    assert.match(body.error, /intermedio/);
  });

  test("detecta ciclos entre sub-recetas", async () => {
    const crear = (nombre: string) =>
      api<Producto>("POST", "/productos", {
        nombre,
        categoria: "Rellenos",
        tipo: "INTERMEDIO",
        rendimientoReceta: 100,
        unidadRendimiento: "GRAMO",
      });
    const a = (await crear("Relleno A")).body;
    const b = (await crear("Relleno B")).body;
    const aUsaB = await api("PUT", `/productos/${a.id}/receta`, {
      ingredientes: [],
      subRecetas: [{ subProductoId: b.id, cantidad: 10 }],
    });
    assert.equal(aUsaB.status, 200);
    const bUsaA = await api<ErrorApi>("PUT", `/productos/${b.id}/receta`, {
      ingredientes: [],
      subRecetas: [{ subProductoId: a.id, cantidad: 10 }],
    });
    assert.equal(bUsaA.status, 422);
    assert.match(bUsaA.body.error, /ciclo/);

    // B está en uso por A: no se puede borrar hasta quitarlo.
    assert.equal((await api("DELETE", `/productos/${b.id}`)).status, 409);
    assert.equal((await api("DELETE", `/productos/${a.id}`)).status, 204);
    assert.equal((await api("DELETE", `/productos/${b.id}`)).status, 204);
  });

  test("filtra productos por tipo", async () => {
    const { body } = await api<Producto[]>("GET", "/productos?tipo=INTERMEDIO");
    assert.deepEqual(body.map((p) => p.nombre).sort(), [
      "Brownies (masa)",
      "Relleno de Brigadeiro",
      "Relleno de Nido",
      "Topping tres leches",
      "Topping tres leches grande",
      "Topping tres leches mega",
      "Topping tres leches personal",
    ]);
  });
});

// ---------- Fase 3 ----------

const stockDe = async (nombre: string): Promise<Prisma.Decimal> => {
  const insumo = (await insumoPorNombre(nombre)) as InsumoConStock;
  return D(insumo.stockActual);
};

describe("Inventario de insumos", () => {
  test("una compra por envases suma stock, guarda el movimiento y puede actualizar el precio", async () => {
    const harina = await insumoPorNombre("Harina");
    const compra = await api<{ movimiento: Movimiento; insumo: InsumoConStock }>(
      "POST",
      `/insumos/${harina.id}/movimientos`,
      { tipo: "COMPRA", envases: 2 },
    );
    assert.equal(compra.status, 201);
    assert.ok(cerca(compra.body.insumo.stockActual, "100000"));
    assert.equal(compra.body.movimiento.nota, "2 envase(s)");

    const glas = await insumoPorNombre("Azúcar glas");
    const conPrecio = await api<{ insumo: InsumoConStock }>("POST", `/insumos/${glas.id}/movimientos`, {
      tipo: "COMPRA",
      cantidad: "500",
      precioEnvase: "20",
    });
    assert.ok(cerca(conPrecio.body.insumo.stockActual, "500"));
    assert.ok(cerca(conPrecio.body.insumo.precioEnvase, "20"));
    await api("PATCH", `/insumos/${glas.id}`, { precioEnvase: glas.precioEnvase });
  });

  test("un ajuste resta stock y exige el motivo", async () => {
    const harina = await insumoPorNombre("Harina");
    const sinNota = await api<ErrorApi>("POST", `/insumos/${harina.id}/movimientos`, { tipo: "AJUSTE", cantidad: -500 });
    assert.equal(sinNota.status, 400);
    const ajuste = await api<{ insumo: InsumoConStock }>("POST", `/insumos/${harina.id}/movimientos`, {
      tipo: "AJUSTE",
      cantidad: -500,
      nota: "Merma: bolsa húmeda",
    });
    assert.equal(ajuste.status, 201);
    assert.ok(cerca(ajuste.body.insumo.stockActual, "99500"));

    const { body } = await api<Movimiento[]>("GET", `/insumos/${harina.id}/movimientos`);
    assert.deepEqual(
      body.map((m) => m.tipo),
      ["AJUSTE", "COMPRA"],
    );
  });

  test("rechaza compras ambiguas o en cero", async () => {
    const harina = await insumoPorNombre("Harina");
    const ambas = await api<ErrorApi>("POST", `/insumos/${harina.id}/movimientos`, {
      tipo: "COMPRA",
      cantidad: 10,
      envases: 1,
    });
    assert.equal(ambas.status, 400);
    const cero = await api<ErrorApi>("POST", `/insumos/${harina.id}/movimientos`, { tipo: "AJUSTE", cantidad: 0, nota: "x" });
    assert.equal(cero.status, 400);
  });

  test("no borra un insumo con movimientos", async () => {
    const vainilla = await api<Insumo>("POST", "/insumos", {
      nombre: "Vainilla en vaina",
      unidadBase: "UNIDAD",
      contenidoEnvase: 10,
      precioEnvase: 50,
    });
    await api("POST", `/insumos/${vainilla.body.id}/movimientos`, { tipo: "COMPRA", envases: 1 });
    assert.equal((await api("DELETE", `/insumos/${vainilla.body.id}`)).status, 409);
  });
});

describe("Ventas", () => {
  test("vender descuenta los insumos de la receta y guarda costo y ganancia", async () => {
    const queque = await productoPorNombre("Queque");
    const harinaAntes = await stockDe("Harina");
    const { status, body } = await api<VentaCreada>("POST", "/ventas", { productoId: queque.id, cantidad: 2 });
    assert.equal(status, 201);

    const rendimiento = D("880.4").div(700);
    assert.ok(cerca(body.venta.precioUnitario, "16"));
    assert.ok(cerca(body.venta.totalVenta, "32"));
    assert.ok(cerca(body.venta.costoUnitario, costosEsperados["Queque"] ?? "0"));
    assert.ok(cerca(body.venta.gananciaBruta, D(32).sub(D(body.venta.costoUnitario).mul(2)), "0.000001"));
    // 13 insumos en la receta; Agua y «Limpieza y otros» no llevan stock (D40) y no se descuentan.
    assert.equal(body.consumo.length, 11);
    assert.ok(!body.consumo.some((l) => l.nombre === "Agua" || l.nombre === "Limpieza y otros"));

    // 260 g de harina por tanda × 2 / rendimiento.
    const harinaUsada = D(260).mul(2).div(rendimiento);
    assert.ok(cerca((await stockDe("Harina")).toString(), harinaAntes.sub(harinaUsada)));

    // Coco no tenía stock: la venta pasa igual y avisa.
    assert.ok(body.alertas.some((a) => a.nombre === "Coco" && a.nivel === "SIN_STOCK"));
  });

  test("las sub-recetas también descuentan sus insumos", async () => {
    const conRelleno = await productoPorNombre("Queque con relleno");
    const antes = await stockDe("Leche condensada");
    const { body } = await api<VentaCreada>("POST", "/ventas", { productoId: conRelleno.id, cantidad: 1 });
    // 350 g de cada relleno por tanda de 2 queques; cada relleno lleva 400 g de condensada.
    const usada = D(400)
      .mul(D(350).div(1240))
      .add(D(400).mul(D(350).div("1090.5")))
      .div(2);
    assert.ok(cerca((await stockDe("Leche condensada")).toString(), antes.sub(usada)));
    const linea = body.consumo.find((l) => l.nombre === "Leche condensada");
    assert.ok(linea && cerca(linea.cantidad, usada));
  });

  test("la venta conserva su costo aunque después suban los insumos", async () => {
    const queque = await productoPorNombre("Queque");
    const { body } = await api<VentaCreada>("POST", "/ventas", { productoId: queque.id, cantidad: 1 });
    const harina = await insumoPorNombre("Harina");
    await api("PATCH", `/insumos/${harina.id}`, { precioEnvase: "640" });
    const guardada = await api<Venta>("GET", `/ventas/${body.venta.id}`);
    assert.equal(guardada.body.costoUnitario, body.venta.costoUnitario);
    await api("PATCH", `/insumos/${harina.id}`, { precioEnvase: harina.precioEnvase });
  });

  test("acepta un precio distinto al de lista", async () => {
    const queque = await productoPorNombre("Queque");
    const { body } = await api<VentaCreada>("POST", "/ventas", { productoId: queque.id, cantidad: 1, precioUnitario: 18 });
    assert.ok(cerca(body.venta.totalVenta, "18"));
  });

  test("rechaza ventas inválidas sin registrar nada", async () => {
    const antes = (await api<ListaVentas>("GET", "/ventas")).body.resumen.ventas;
    const relleno = await productoPorNombre("Relleno de Nido");
    const base = await productoPorNombre("Queque base (histórico)");
    const queque = await productoPorNombre("Queque");

    assert.equal((await api("POST", "/ventas", { productoId: relleno.id, cantidad: 1 })).status, 422);
    assert.equal((await api("POST", "/ventas", { productoId: base.id, cantidad: 1 })).status, 422);
    assert.equal((await api("POST", "/ventas", { productoId: 99999, cantidad: 1 })).status, 404);
    assert.equal((await api("POST", "/ventas", { productoId: queque.id, cantidad: 0 })).status, 400);

    assert.equal((await api<ListaVentas>("GET", "/ventas")).body.resumen.ventas, antes);
  });

  test("lista las ventas con totales y filtra por fecha", async () => {
    const { body } = await api<ListaVentas>("GET", "/ventas");
    assert.equal(body.resumen.ventas, 4);
    const total = body.ventas.reduce((s, v) => s.add(v.totalVenta), D(0));
    const ganancia = body.ventas.reduce((s, v) => s.add(v.gananciaBruta), D(0));
    assert.ok(cerca(body.resumen.totalVenta, total, "0.000001"));
    assert.ok(cerca(body.resumen.gananciaBruta, ganancia, "0.000001"));

    const hoy = new Date().toLocaleDateString("sv-SE");
    assert.equal((await api<ListaVentas>("GET", `/ventas?desde=${hoy}&hasta=${hoy}`)).body.resumen.ventas, 4);
    assert.equal((await api<ListaVentas>("GET", "/ventas?desde=2000-01-01&hasta=2000-01-02")).body.resumen.ventas, 0);
    assert.equal((await api("GET", "/ventas?desde=ayer")).status, 400);
  });

  test("las alertas de stock listan los insumos sin stock", async () => {
    const { body } = await api<Alerta[]>("GET", "/insumos/alertas");
    assert.ok(body.some((a) => a.nombre === "Coco"));
    assert.ok(!body.some((a) => a.nombre === "Harina"));
  });
});

// ---------- Fiado ----------

interface VentaFiada extends Venta {
  estadoPago: "PAGADO" | "PENDIENTE";
  cliente: string | null;
  fechaPago: string | null;
}
interface Pendientes {
  total: string;
  ventas: VentaFiada[];
}

describe("Fiado", () => {
  test("una venta fiada exige cliente y queda pendiente", async () => {
    const quinoa = await productoPorNombre("Queque de quinoa");
    const sinCliente = await api<ErrorApi>("POST", "/ventas", { productoId: quinoa.id, cantidad: 1, fiado: true, __sinCliente: true });
    assert.equal(sinCliente.status, 400);
    assert.deepEqual(sinCliente.body.detalles?.map((d) => d.campo), ["clienteNombre"]);

    const { status, body } = await api<{ venta: VentaFiada }>("POST", "/ventas", {
      productoId: quinoa.id,
      cantidad: 2,
      fiado: true,
      cliente: "Doña Rosa",
    });
    assert.equal(status, 201);
    assert.equal(body.venta.estadoPago, "PENDIENTE");
    assert.equal(body.venta.cliente, "Doña Rosa");
  });

  test("las ventas normales quedan pagadas", async () => {
    const quinoa = await productoPorNombre("Queque de quinoa");
    const { body } = await api<{ venta: VentaFiada }>("POST", "/ventas", { productoId: quinoa.id, cantidad: 1 });
    assert.equal(body.venta.estadoPago, "PAGADO");
    assert.equal(body.venta.cliente, "Mostrador");
  });

  test("lista los pendientes con el total por cobrar y permite cobrarlos una sola vez", async () => {
    const pendientes = await api<Pendientes>("GET", "/ventas/pendientes");
    assert.equal(pendientes.body.ventas.length, 1);
    assert.ok(cerca(pendientes.body.total, "40"));
    const fiada = pendientes.body.ventas[0];
    assert.ok(fiada);

    const cobro = await api<VentaFiada>("POST", `/ventas/${fiada.id}/cobrar`);
    assert.equal(cobro.status, 200);
    assert.equal(cobro.body.estadoPago, "PAGADO");
    assert.ok(cobro.body.fechaPago);
    assert.equal((await api("POST", `/ventas/${fiada.id}/cobrar`)).status, 409);

    const despues = await api<Pendientes>("GET", "/ventas/pendientes");
    assert.equal(despues.body.ventas.length, 0);
    assert.ok(cerca(despues.body.total, "0"));
    assert.equal((await api("POST", "/ventas/99999/cobrar")).status, 404);
  });
});

// ---------- Respaldos (Fase 5) ----------

interface RespaldoApi {
  archivo: string;
  fecha: string;
  bytes: number;
  eliminados?: string[];
}

describe("Respaldos", () => {
  test("crea un .db.gz con fecha que contiene una base SQLite válida", async () => {
    const { status, body } = await api<RespaldoApi>("POST", "/backups");
    assert.equal(status, 201);
    assert.match(body.archivo, /^dulzura_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(-\d+)?\.db\.gz$/);
    const ruta = path.join(CARPETA_RESPALDOS, body.archivo);
    assert.ok(existsSync(ruta));
    const contenido = gunzipSync(readFileSync(ruta));
    assert.equal(contenido.subarray(0, 16).toString("latin1"), "SQLite format 3\u0000");
    assert.ok(contenido.includes(Buffer.from("Queque con relleno")));
  });

  test("conserva solo los últimos BACKUP_KEEP respaldos", async () => {
    await api("POST", "/backups");
    const tercero = await api<RespaldoApi>("POST", "/backups");
    assert.equal(tercero.body.eliminados?.length, 1);

    const { body } = await api<{ carpeta: string; respaldos: RespaldoApi[] }>("GET", "/backups");
    assert.equal(body.carpeta, CARPETA_RESPALDOS);
    assert.equal(body.respaldos.length, 2);
    assert.equal(body.respaldos[0]?.archivo, tercero.body.archivo);
  });

  test("resuelve la ruta de la base igual que Prisma", async () => {
    const { rutaBaseDeDatos } = await import("../src/services/backup");
    assert.equal(rutaBaseDeDatos("file:./dulzura.db"), path.resolve(__dirname, "../../database/prisma/dulzura.db"));
    assert.equal(rutaBaseDeDatos("file:C:/datos/x.db"), "C:/datos/x.db");
    assert.throws(() => rutaBaseDeDatos("postgresql://localhost/db"), /SQLite/);
  });
});

// ---------- Anular ventas ----------

interface VentaAnulable extends VentaFiada {
  anulada: boolean;
  motivoAnulacion: string | null;
}

describe("Anular ventas", () => {
  test("anular devuelve al stock exactamente lo que se descontó, incluidas las sub-recetas", async () => {
    const conRelleno = await productoPorNombre("Queque con relleno");
    const antes = { harina: await stockDe("Harina"), condensada: await stockDe("Leche condensada") };
    const resumenAntes = (await api<ListaVentas>("GET", "/ventas")).body.resumen;

    const { body: creada } = await api<VentaCreada>("POST", "/ventas", { productoId: conRelleno.id, cantidad: 2 });
    assert.ok(D((await stockDe("Leche condensada")).toString()).lt(antes.condensada));

    const anulacion = await api<{ venta: VentaAnulable; devuelto: { nombre: string }[] }>(
      "POST",
      `/ventas/${creada.venta.id}/anular`,
      { motivo: "Se marcó el producto equivocado" },
    );
    assert.equal(anulacion.status, 200);
    assert.equal(anulacion.body.venta.anulada, true);
    assert.equal(anulacion.body.venta.motivoAnulacion, "Se marcó el producto equivocado");
    assert.equal(anulacion.body.devuelto.length, creada.consumo.length);

    assert.ok(cerca((await stockDe("Harina")).toString(), antes.harina, "0.000001"));
    assert.ok(cerca((await stockDe("Leche condensada")).toString(), antes.condensada, "0.000001"));

    // Sale de los totales pero sigue en la lista, marcada.
    const despues = await api<{ resumen: ListaVentas["resumen"]; ventas: VentaAnulable[] }>("GET", "/ventas");
    assert.equal(despues.body.resumen.ventas, resumenAntes.ventas);
    assert.ok(cerca(despues.body.resumen.totalVenta, resumenAntes.totalVenta, "0.000001"));
    assert.equal(despues.body.ventas.find((v) => v.id === creada.venta.id)?.anulada, true);

    // El historial del insumo registra la devolución.
    const harina = await insumoPorNombre("Harina");
    const movimientos = await api<Movimiento[]>("GET", `/insumos/${harina.id}/movimientos`);
    assert.equal(movimientos.body[0]?.tipo, "ANULACION");
  });

  test("no se anula dos veces, exige motivo y responde 404 si no existe", async () => {
    const quinoa = await productoPorNombre("Queque de quinoa");
    const { body } = await api<VentaCreada>("POST", "/ventas", { productoId: quinoa.id, cantidad: 1 });
    assert.equal((await api("POST", `/ventas/${body.venta.id}/anular`, {})).status, 400);
    assert.equal((await api("POST", `/ventas/${body.venta.id}/anular`, { motivo: "Prueba" })).status, 200);
    assert.equal((await api("POST", `/ventas/${body.venta.id}/anular`, { motivo: "Otra vez" })).status, 409);
    assert.equal((await api("POST", "/ventas/99999/anular", { motivo: "x" })).status, 404);
  });

  test("un fiado anulado deja de estar por cobrar y no se puede cobrar", async () => {
    const quinoa = await productoPorNombre("Queque de quinoa");
    const { body } = await api<VentaCreada>("POST", "/ventas", {
      productoId: quinoa.id,
      cantidad: 1,
      fiado: true,
      cliente: "Cliente de prueba",
    });
    assert.equal((await api<Pendientes>("GET", "/ventas/pendientes")).body.ventas.length, 1);
    await api("POST", `/ventas/${body.venta.id}/anular`, { motivo: "No se llevó el queque" });
    const pendientes = await api<Pendientes>("GET", "/ventas/pendientes");
    assert.equal(pendientes.body.ventas.length, 0);
    assert.equal((await api("POST", `/ventas/${body.venta.id}/cobrar`)).status, 409);
  });
});

// ---------- Fase 6: Brownies ----------

describe("Brownies", () => {
  test("la masa rinde 743 g y cada pack usa 80 g por brownie", async () => {
    const masa = await productoPorNombre("Brownies (masa)");
    const clasico4 = await productoPorNombre("Brownies clásicos 4 u");
    const { body } = await api<Costo>("GET", `/productos/${clasico4.id}/costo`);
    const linea = body.subRecetas.find((l) => l.nombre === "Brownies (masa)");
    assert.ok(linea && cerca(linea.costo, D(masa.costoTanda).mul(320).div(743), "0.000001"));
    // Caja 3 Bs + etiqueta 0.5 Bs + limpieza 0.5 Bs.
    assert.ok(cerca(body.costoUnitario, D(linea.costo).add(4), "0.000001"));
  });

  test("el premium cuesta lo mismo que el clásico más los toppings", async () => {
    const pares: [string, string, number][] = [
      ["Brownies clásicos 4 u", "Brownies premium 4 u", 50],
      ["Brownies clásicos 9 u", "Brownies premium 9 u", 150],
    ];
    for (const [clasico, premium, gramos] of pares) {
      const c = await productoPorNombre(clasico);
      const p = await productoPorNombre(premium);
      // Nutella 0.057 Bs/g + Topping Nido 0.03 Bs/g.
      const toppings = D(gramos).mul("0.057").add(D(gramos).mul("0.03"));
      assert.ok(cerca(p.costoUnitario, D(c.costoUnitario).add(toppings), "0.000001"), premium);
    }
  });

  test("vender un pack descuenta la masa en gramos y una caja", async () => {
    const clasico9 = await productoPorNombre("Brownies clásicos 9 u");
    const chocolateAntes = await stockDe("Chocolate");
    const cajasAntes = await stockDe("Caja brownie");
    const { status } = await api<VentaCreada>("POST", "/ventas", { productoId: clasico9.id, cantidad: 2 });
    assert.equal(status, 201);
    // 2 cajas × 720 g de masa; la masa lleva 200 g de chocolate cada 743 g.
    const chocolate = D(200).mul(720).mul(2).div(743);
    assert.ok(cerca((await stockDe("Chocolate")).toString(), chocolateAntes.sub(chocolate)));
    assert.ok(cerca((await stockDe("Caja brownie")).toString(), cajasAntes.sub(2)));
  });

  test("los brownies sueltos de la tanda de 16 descuentan una bolsa cada uno", async () => {
    const sueltos = await productoPorNombre("Brownies 16 u");
    const bolsasAntes = await stockDe("Bolsa brownie");
    const { body } = await api<VentaCreada>("POST", "/ventas", { productoId: sueltos.id, cantidad: 3 });
    assert.ok(cerca(body.venta.totalVenta, "15"));
    assert.ok(cerca((await stockDe("Bolsa brownie")).toString(), bolsasAntes.sub(3)));
  });
});

// ---------- Fase 6: Flanes ----------

describe("Flanes", () => {
  test("una tanda de Chocoflan usa una lata de condensada y un envase por flan", async () => {
    const chocoflan = await productoPorNombre("Chocoflan");
    const condensadaAntes = await stockDe("Leche condensada");
    const envasesAntes = await stockDe("Envase flan");
    const { status, body } = await api<VentaCreada>("POST", "/ventas", { productoId: chocoflan.id, cantidad: 10 });
    assert.equal(status, 201);
    assert.ok(cerca(body.venta.totalVenta, "150"));
    assert.ok(cerca((await stockDe("Leche condensada")).toString(), condensadaAntes.sub(395)));
    assert.ok(cerca((await stockDe("Envase flan")).toString(), envasesAntes.sub(10)));
  });

  test("vender un Quesillo descuenta la parte proporcional de la tanda de 8", async () => {
    const quesillo = await productoPorNombre("Quesillo venezolano");
    const polvoAntes = await stockDe("Leche en polvo");
    const ronAntes = await stockDe("Ron");
    await api<VentaCreada>("POST", "/ventas", { productoId: quesillo.id, cantidad: 1 });
    assert.ok(cerca((await stockDe("Leche en polvo")).toString(), polvoAntes.sub(D(230).div(8))));
    assert.ok(cerca((await stockDe("Ron")).toString(), ronAntes.sub(D(10).div(8))));
  });
});

// ---------- Fase 6: Ventas históricas (D24) ----------

interface TotalesHistoricos {
  ventas: number;
  unidades: string;
  valor: string;
  utilidad: string;
}
interface Historico {
  resumen: TotalesHistoricos;
  semanas: (TotalesHistoricos & { semana: string })[];
  productos: (TotalesHistoricos & { producto: string; productoId: number | null })[];
  ventas: { fecha: string; productoOriginal: string; fechaEstimada: boolean }[];
}

const HISTORICO_2024 = "/historico?desde=2024-01-01&hasta=2024-12-31";

describe("Ventas históricas", () => {
  test("importa las Semanas 1–3 sin las filas descartadas", async () => {
    const { status, body } = await api<Historico>("GET", HISTORICO_2024);
    assert.equal(status, 200);
    assert.equal(body.resumen.ventas, 95);
    assert.ok(cerca(body.resumen.valor, "3680.45"));
    assert.deepEqual(
      body.semanas.map((s) => [s.semana, s.ventas, Number(s.valor)]),
      [
        ["2024-01-29", 35, 1311.5],
        ["2024-02-05", 28, 943.55], // sin la fila de 380 Bs sin producto
        ["2024-02-12", 32, 1425.4], // sin el pedido cancelado
      ],
    );
    // La semana 1 tiene fechas reales; la API no expone hoja ni fila (solo sirven para importar sin duplicar).
    assert.ok(body.ventas.filter((v) => v.fecha < "2024-02-05").every((v) => !v.fechaEstimada));
    assert.ok(body.ventas.every((v) => !("hoja" in v) && !("fila" in v) && !("formaPago" in v)));
  });

  test("agrupa los nombres mal escritos y vincula los productos del ERP", async () => {
    const { body } = await api<Historico>("GET", HISTORICO_2024);
    const porNombre = new Map(body.productos.map((p) => [p.producto, p]));
    // "Torta Tres Leches", "Totra Tres Leches" y "Tres leches".
    const tresLeches = await productoPorNombre("Tres leches");
    assert.equal(porNombre.get("Tres leches")?.ventas, 15);
    assert.equal(porNombre.get("Tres leches")?.productoId, tresLeches.id);
    const premium4 = await productoPorNombre("Brownies premium 4 u");
    assert.equal(porNombre.get("Brownies premium 4 u")?.productoId, premium4.id);
    // Sin receta en el ERP: Frutillita (7), Feliz cumpleaños (1) y Tres leches personal frutos rojos (1).
    const sinVincular = body.productos.filter((p) => p.productoId === null);
    assert.deepEqual(sinVincular.map((p) => p.producto).sort(), ["Feliz cumpleaños", "Frutillita", "Tres leches personal frutos rojos"]);
    assert.equal(sinVincular.reduce((n, p) => n + p.ventas, 0), 9);
  });

  test("filtra por fechas y reimportar no duplica", async () => {
    const semana2 = await api<Historico>("GET", "/historico?desde=2024-02-05&hasta=2024-02-11");
    assert.equal(semana2.body.resumen.ventas, 28);
    assert.equal((await api("GET", "/historico?desde=febrero")).status, 400);

    execSync("npx tsx database/prisma/importar-historico.ts", { stdio: "ignore", env: process.env });
    assert.equal((await api<Historico>("GET", HISTORICO_2024)).body.resumen.ventas, 95);
  });

  test("no cuentan como ventas del sistema", async () => {
    const { body } = await api<ListaVentas>("GET", "/ventas?desde=2024-01-01&hasta=2024-12-31");
    assert.equal(body.resumen.ventas, 0);
  });
});

// ---------- Fase 7: tres leches, fresas y toppings ----------

describe("Tres leches, fresas y toppings", () => {
  test("los toppings son preparaciones y no aparecen en la Caja", async () => {
    const { body } = await api<Producto[]>("GET", "/productos?tipo=VENTA&activo=true");
    assert.ok(!body.some((p) => p.nombre.startsWith("Topping")));
    const topping = await productoPorNombre("Topping tres leches");
    // Dulce de leche 400 × 0.03 + Nutella 50 × 0.057 + Leche 50 × 0.008.
    assert.ok(cerca(topping.costoTanda, "15.25", "0.000001"));
  });

  test("las fresas con brownie usan 3 brownies (240 g de masa)", async () => {
    const masa = await productoPorNombre("Brownies (masa)");
    const conBrownie = await productoPorNombre("Fresas con crema y brownie");
    const { body } = await api<Costo>("GET", `/productos/${conBrownie.id}/costo`);
    const linea = body.subRecetas.find((l) => l.nombre === "Brownies (masa)");
    assert.ok(linea && cerca(linea.costo, D(masa.costoTanda).mul(240).div(743), "0.000001"));
    const conNutella = await productoPorNombre("Fresas con crema, brownie y Nutella");
    assert.ok(cerca(conNutella.costoUnitario, D(conBrownie.costoUnitario).add(D(30).mul("0.057")), "0.000001"));
  });

  test("vender un Tres leches familiar descuenta sus leches y su envase", async () => {
    const familiar = await productoPorNombre("Tres leches familiar");
    const evaporadaAntes = await stockDe("Leche evaporada");
    const envasesAntes = await stockDe("Envase tres leches familiar");
    const { status, body } = await api<VentaCreada>("POST", "/ventas", { productoId: familiar.id, cantidad: 1 });
    assert.equal(status, 201);
    assert.ok(cerca(body.venta.totalVenta, "95"));
    assert.ok(cerca((await stockDe("Leche evaporada")).toString(), evaporadaAntes.sub(740)));
    assert.ok(cerca((await stockDe("Envase tres leches familiar")).toString(), envasesAntes.sub(1)));
  });
});

// ---------- Gastos operativos ----------

interface Gasto {
  id: string;
  fecha: string;
  descripcion: string;
  monto: string;
  categoria: "LIMPIEZA" | "EQUIPAMIENTO" | "USO_PERSONAL" | "OTROS";
}
interface ListaGastos {
  total: string;
  porCategoria: Record<Gasto["categoria"], string>;
  gastos: Gasto[];
}

describe("Gastos operativos", () => {
  test("crea gastos y los lista con totales por categoría y filtro de fechas", async () => {
    const hoy = new Date().toLocaleDateString("sv-SE");
    const esponja = await api<Gasto>("POST", "/gastos", { descripcion: "Esponja y jabón", monto: "12.50", categoria: "LIMPIEZA" });
    assert.equal(esponja.status, 201);
    assert.match(esponja.body.id, /^[0-9a-f-]{36}$/);
    assert.ok(cerca(esponja.body.monto, "12.5"));
    await api<Gasto>("POST", "/gastos", { descripcion: "Molde redondo", monto: 45, categoria: "EQUIPAMIENTO" });
    const viejo = await api<Gasto>("POST", "/gastos", { descripcion: "Toppers", monto: "30", categoria: "EQUIPAMIENTO", fecha: "2026-01-15" });
    assert.equal(viejo.status, 201);
    // D47: lo que la dueña gasta en sí misma con plata del negocio va aparte.
    const personal = await api<Gasto>("POST", "/gastos", { descripcion: "Almuerzo", monto: "20", categoria: "USO_PERSONAL", fecha: "2026-01-20" });
    assert.equal(personal.status, 201);

    const deHoy = await api<ListaGastos>("GET", `/gastos?desde=${hoy}&hasta=${hoy}`);
    assert.equal(deHoy.status, 200);
    assert.equal(deHoy.body.gastos.length, 2);
    assert.ok(cerca(deHoy.body.total, "57.5"));
    assert.ok(cerca(deHoy.body.porCategoria.LIMPIEZA, "12.5"));
    assert.ok(cerca(deHoy.body.porCategoria.EQUIPAMIENTO, "45"));
    assert.ok(cerca(deHoy.body.porCategoria.OTROS, "0"));
    assert.ok(cerca(deHoy.body.porCategoria.USO_PERSONAL, "0"));

    const enero = await api<ListaGastos>("GET", "/gastos?desde=2026-01-01&hasta=2026-01-31");
    assert.deepEqual(enero.body.gastos.map((g) => g.descripcion).sort(), ["Almuerzo", "Toppers"]);
    assert.ok(cerca(enero.body.porCategoria.USO_PERSONAL, "20"));
    assert.ok(cerca(enero.body.total, "50"));
    assert.equal((await api<ListaGastos>("GET", "/gastos")).body.gastos.length, 4);
  });

  test("rechaza gastos inválidos con mensajes claros", async () => {
    const casos: [unknown, string][] = [
      [{ descripcion: "", monto: 5, categoria: "OTROS" }, "descripcion"],
      [{ descripcion: "Bolsas", monto: 0, categoria: "OTROS" }, "monto"],
      [{ descripcion: "Bolsas", monto: "abc", categoria: "OTROS" }, "monto"],
      [{ descripcion: "Bolsas", monto: 5, categoria: "LUZ" }, "categoria"],
      [{ descripcion: "Bolsas", monto: 5, categoria: "OTROS", fecha: "ayer" }, "fecha"],
    ];
    for (const [cuerpo, campo] of casos) {
      const { status, body } = await api<ErrorApi>("POST", "/gastos", cuerpo);
      assert.equal(status, 400, JSON.stringify(cuerpo));
      assert.ok(body.detalles?.some((d) => d.campo === campo), `${campo}: ${JSON.stringify(body)}`);
    }
    assert.equal((await api("GET", "/gastos?desde=enero")).status, 400);
  });

  test("borra un gasto mal cargado una sola vez", async () => {
    const { body: gasto } = await api<Gasto>("POST", "/gastos", { descripcion: "Error de tipeo", monto: 999, categoria: "OTROS" });
    assert.equal((await api("DELETE", `/gastos/${gasto.id}`)).status, 204);
    assert.equal((await api("DELETE", `/gastos/${gasto.id}`)).status, 404);
    assert.equal((await api("DELETE", "/gastos/123")).status, 400);
    const { body } = await api<ListaGastos>("GET", "/gastos");
    assert.ok(!body.gastos.some((g) => g.id === gasto.id));
  });
});

// ---------- Disponibilidad (D49: ya no limita la venta) ----------

describe("Productos a la venta", () => {
  test("el campo disponible se guarda y filtra, pero no impide vender un producto activo", async () => {
    const banadas = await productoPorNombre("Frutillas bañadas en chocolate");
    const quitar = await api<Producto & { disponible: boolean }>("PATCH", `/productos/${banadas.id}`, { disponible: false });
    assert.equal(quitar.status, 200);
    assert.equal(quitar.body.disponible, false);

    const nombres = async (filtro: string) =>
      (await api<Producto[]>("GET", `/productos?tipo=VENTA&activo=true&${filtro}`)).body.map((p) => p.nombre);
    assert.ok(!(await nombres("disponible=true")).includes(banadas.nombre));
    assert.ok((await nombres("disponible=false")).includes(banadas.nombre));
    assert.equal((await api("GET", "/productos?disponible=talvez")).status, 400);

    assert.equal((await api("POST", "/ventas", { productoId: banadas.id, cantidad: 1 })).status, 201);
    await api("PATCH", `/productos/${banadas.id}`, { disponible: true });
  });
});

// ---------- Ventas de días anteriores ----------

describe("Venta con fecha de otro día", () => {
  test("se guarda en ese día, descuenta el stock y deja la nota en el movimiento", async () => {
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 2);
    const dia = ayer.toLocaleDateString("sv-SE");
    const quinoa = await productoPorNombre("Queque de quinoa");
    const harinaAntes = await stockDe("Harina de quinoa");

    const { status, body } = await api<VentaCreada>("POST", "/ventas", { productoId: quinoa.id, cantidad: 4, fecha: dia });
    assert.equal(status, 201);
    assert.equal(new Date(body.venta.fecha).toLocaleDateString("sv-SE"), dia);
    // La tanda rinde 4 y lleva 250 g de harina de quinoa.
    assert.ok(cerca((await stockDe("Harina de quinoa")).toString(), harinaAntes.sub(250)));

    const delDia = await api<ListaVentas>("GET", `/ventas?desde=${dia}&hasta=${dia}`);
    assert.ok(delDia.body.ventas.some((v) => v.id === body.venta.id));
    const insumo = await insumoPorNombre("Harina de quinoa");
    const { body: movimientos } = await api<Movimiento[]>("GET", `/insumos/${insumo.id}/movimientos`);
    assert.equal(movimientos[0]?.nota, `Venta del ${dia} cargada después`);
  });

  test("hoy se guarda con la hora actual y no se aceptan fechas futuras ni inválidas", async () => {
    const quinoa = await productoPorNombre("Queque de quinoa");
    const hoy = new Date().toLocaleDateString("sv-SE");
    const antes = Date.now();
    const deHoy = await api<VentaCreada>("POST", "/ventas", { productoId: quinoa.id, cantidad: 1, fecha: hoy });
    assert.equal(deHoy.status, 201);
    assert.ok(new Date(deHoy.body.venta.fecha).getTime() >= antes - 1000);

    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    for (const fecha of [manana.toLocaleDateString("sv-SE"), "2026-02-31", "ayer"]) {
      const { status, body } = await api<ErrorApi>("POST", "/ventas", { productoId: quinoa.id, cantidad: 1, fecha });
      assert.equal(status, 400, fecha);
      assert.ok(body.detalles?.some((d) => d.campo === "fecha"), fecha);
    }
  });
});

// ---------- Fase 8: clientes mayoristas y precios acordados (D42) ----------

interface Cliente {
  id: string;
  nombre: string;
  tipo: "MINORISTA" | "MAYORISTA";
  activo: boolean;
  precios: { productoId: number; precio: string; producto: { nombre: string } }[];
}
interface VentaConCliente extends Venta {
  cliente: string | null;
  clienteId: string | null;
  clienteTipo: "MINORISTA" | "MAYORISTA" | null;
  sabores: string | null;
}
interface ReporteCliente {
  id: string;
  nombre: string;
  totalVendido: string;
  ventas: number;
  ultimoPedido: string | null;
}

const clientePorNombre = async (nombre: string): Promise<Cliente> => {
  const { body } = await api<Cliente[]>("GET", "/clientes");
  const cliente = body.find((c) => c.nombre === nombre);
  assert.ok(cliente, `No se encontró el cliente ${nombre}`);
  return cliente;
};

describe("Clientes y precios acordados", () => {
  test("el seed crea los mayoristas con su precio acordado y el filtro por tipo funciona", async () => {
    const { status, body } = await api<Cliente[]>("GET", "/clientes?tipo=MAYORISTA");
    assert.equal(status, 200);
    assert.deepEqual(body.map((c) => c.nombre), ["Eliana", "Mercado Primavera"]);
    const primavera = body.find((c) => c.nombre === "Mercado Primavera");
    assert.deepEqual(primavera?.precios.map((p) => [p.producto.nombre, Number(p.precio)]), [["Queque", 12]]);
    const minoristas = await api<Cliente[]>("GET", "/clientes?tipo=MINORISTA");
    // Mostrador + los 56 minoristas del Excel 2024 («Venta esquina» no es un cliente) + los creados al vender.
    assert.ok(minoristas.body.length >= 57);
    assert.ok(minoristas.body.some((c) => c.nombre === "Mostrador"));
    assert.ok(minoristas.body.every((c) => c.precios.length === 0));
    assert.ok(minoristas.body.some((c) => c.nombre !== "Mostrador")); // los del Excel 2024 (datos/)
    assert.ok(!minoristas.body.some((c) => c.nombre === "Venta esquina"));
    assert.equal((await api("GET", "/clientes?tipo=VIP")).status, 400);
  });

  test("crea un cliente mayorista y rechaza duplicados y datos inválidos", async () => {
    const nuevo = await api<Cliente>("POST", "/clientes", { nombre: "Cafetería Sol", tipo: "MAYORISTA", celular: "70000000" });
    assert.equal(nuevo.status, 201);
    assert.deepEqual(nuevo.body.precios, []);
    assert.equal((await api("POST", "/clientes", { nombre: "Cafetería Sol" })).status, 409);
    // Mismo nombre y apellido aunque cambien mayúsculas, tildes o espacios: tampoco (D45).
    const repetido = await api<ErrorApi>("POST", "/clientes", { nombre: "  cafeteria   SOL ", celular: "70000000" });
    assert.equal(repetido.status, 409);
    assert.match(repetido.body.error, /Cafetería Sol/);
    // Con otro apellido sí es otro cliente.
    assert.equal((await api("POST", "/clientes", { nombre: "Cafetería Sol Norte", celular: "70000000" })).status, 201);
    const correo = await api<ErrorApi>("POST", "/clientes", { nombre: "Otra", email: "no-es-correo" });
    assert.equal(correo.status, 400);
    assert.ok(correo.body.detalles?.some((d) => d.campo === "email"));
  });

  test("la venta usa el precio acordado con cada mayorista; sin cliente, el precio de venta", async () => {
    const primavera = await clientePorNombre("Mercado Primavera");
    const queque = await productoPorNombre("Queque");
    const mayorista = await api<{ venta: VentaConCliente }>("POST", "/ventas", { productoId: queque.id, cantidad: 3, clienteId: primavera.id });
    assert.equal(mayorista.status, 201);
    assert.ok(cerca(mayorista.body.venta.precioUnitario, "12"));
    assert.ok(cerca(mayorista.body.venta.totalVenta, "36"));
    assert.equal(mayorista.body.venta.cliente, "Mercado Primavera");

    const minorista = await api<{ venta: VentaConCliente }>("POST", "/ventas", { productoId: queque.id, cantidad: 1 });
    assert.ok(cerca(minorista.body.venta.precioUnitario, "16"));

    const eliana = await clientePorNombre("Eliana");
    const deEliana = await api<{ venta: VentaConCliente }>("POST", "/ventas", { productoId: queque.id, cantidad: 2, clienteId: eliana.id });
    assert.ok(cerca(deEliana.body.venta.precioUnitario, "13"));

    // Con precio acordado, no se cambia a mano en la venta.
    const aMano = await api<ErrorApi>("POST", "/ventas", { productoId: queque.id, cantidad: 1, clienteId: primavera.id, precioUnitario: "10" });
    assert.equal(aMano.status, 422);
  });

  test("un mayorista con más de 5 unidades debe indicar los sabores", async () => {
    const primavera = await clientePorNombre("Mercado Primavera");
    const queque = await productoPorNombre("Queque");
    const sin = await api<ErrorApi>("POST", "/ventas", { productoId: queque.id, cantidad: 6, clienteId: primavera.id });
    assert.equal(sin.status, 400);
    assert.ok(sin.body.detalles?.some((d) => d.campo === "sabores"));
    const con = await api<{ venta: VentaConCliente }>("POST", "/ventas", {
      productoId: queque.id,
      cantidad: 6,
      clienteId: primavera.id,
      sabores: ["Coco", "Oreo"],
    });
    assert.equal(con.status, 201);
    assert.equal(con.body.venta.sabores, "Coco, Oreo");
    // 5 unidades no lo exigen.
    assert.equal((await api("POST", "/ventas", { productoId: queque.id, cantidad: 5, clienteId: primavera.id })).status, 201);
  });

  test("cada mayorista negocia su propio precio, se puede cambiar y quitar", async () => {
    const sol = await clientePorNombre("Cafetería Sol");
    const queque = await productoPorNombre("Queque");
    // Sin precio acordado: paga el precio de venta o el que se escriba (regateo).
    const regateo = await api<{ venta: VentaConCliente }>("POST", "/ventas", { productoId: queque.id, cantidad: 1, clienteId: sol.id, precioUnitario: "14" });
    assert.ok(cerca(regateo.body.venta.precioUnitario, "14"));

    const fijar = await api<Cliente>("PUT", `/clientes/${sol.id}/precios/${queque.id}`, { precio: "14.5" });
    assert.equal(fijar.status, 200);
    assert.ok(fijar.body.precios.some((p) => p.productoId === queque.id && cerca(p.precio, "14.5")));
    const venta = await api<{ venta: VentaConCliente }>("POST", "/ventas", { productoId: queque.id, cantidad: 1, clienteId: sol.id });
    assert.ok(cerca(venta.body.venta.precioUnitario, "14.5"));
    // El precio de otro mayorista no cambia.
    const primavera = await clientePorNombre("Mercado Primavera");
    assert.ok(primavera.precios.some((p) => p.productoId === queque.id && cerca(p.precio, "12")));

    const quitar = await api<Cliente>("DELETE", `/clientes/${sol.id}/precios/${queque.id}`);
    assert.deepEqual(quitar.body.precios, []);
    const otraVez = await api<{ venta: VentaConCliente }>("POST", "/ventas", { productoId: queque.id, cantidad: 1, clienteId: sol.id });
    assert.ok(cerca(otraVez.body.venta.precioUnitario, "16"));

    // Un minorista no tiene precio acordado; precio negativo o producto inexistente no se aceptan.
    const mostrador = await clientePorNombre("Mostrador");
    assert.equal((await api("PUT", `/clientes/${mostrador.id}/precios/${queque.id}`, { precio: "10" })).status, 422);
    assert.equal((await api("PUT", `/clientes/${sol.id}/precios/${queque.id}`, { precio: "-1" })).status, 400);
    assert.equal((await api("PUT", `/clientes/${sol.id}/precios/999999`, { precio: "10" })).status, 404);
  });

  test("los clientes no se desactivan ni se borran; renombrar a uno que ya existe se rechaza", async () => {
    const sol = await clientePorNombre("Cafetería Sol");
    assert.equal((await api("DELETE", `/clientes/${sol.id}`)).status, 404);
    const norte = await clientePorNombre("Cafetería Sol Norte");
    assert.equal((await api("PATCH", `/clientes/${norte.id}`, { nombre: "CAFETERIA SOL" })).status, 409);
    // Su propio nombre con otras mayúsculas sí se puede corregir.
    const corregido = await api<Cliente>("PATCH", `/clientes/${norte.id}`, { nombre: "Cafetería Sol norte" });
    assert.equal(corregido.status, 200);
    assert.equal(corregido.body.nombre, "Cafetería Sol norte");
  });

  test("el listado separa minoristas y mayoristas, y el reporte suma ventas e historial por cliente", async () => {
    const hoy = new Date().toLocaleDateString("sv-SE");
    const { body } = await api<ListaVentas & { resumen: { minoristas: { ventas: number }; mayoristas: { ventas: number; totalVenta: string } } }>(
      "GET",
      `/ventas?desde=${hoy}&hasta=${hoy}`,
    );
    const ventas = body.ventas as VentaConCliente[];
    const mayoristas = ventas.filter((v) => !v.anulada && v.clienteTipo === "MAYORISTA");
    assert.equal(body.resumen.mayoristas.ventas, mayoristas.length);
    assert.equal(body.resumen.minoristas.ventas + body.resumen.mayoristas.ventas, body.resumen.ventas);
    const totalMayoristas = mayoristas.reduce((t, v) => t.add(v.totalVenta), D(0));
    assert.ok(cerca(body.resumen.mayoristas.totalVenta, totalMayoristas));

    const reporte = await api<ReporteCliente[]>("GET", "/ventas/reporte-clientes?desde=2026-01-01");
    const primavera = reporte.body.find((c) => c.nombre === "Mercado Primavera");
    const deHoy = mayoristas.filter((v) => v.cliente === "Mercado Primavera").reduce((t, v) => t.add(v.totalVenta), D(0));
    // Notas de jun–jul 2026: 2508 Bs en 12 pedidos.
    assert.ok(primavera && cerca(primavera.totalVendido, D(2508).add(deHoy)));
    assert.ok(primavera && new Date(primavera.ultimoPedido ?? 0).toLocaleDateString("sv-SE") === hoy);
    assert.equal(reporte.body[0]?.nombre, "Mercado Primavera");
  });

  test("las notas mayoristas de 2026 quedan en el historial sin costo y sin tocar el stock", async () => {
    const { body } = await api<Historico & { ventas: { clienteTipo: string | null; sabores: string | null }[] }>(
      "GET",
      "/historico?desde=2026-06-01&hasta=2026-08-31",
    );
    assert.equal(body.resumen.ventas, 13);
    assert.ok(cerca(body.resumen.valor, "2586"));
    assert.ok(body.ventas.every((v) => v.clienteTipo === "MAYORISTA"));
    assert.ok(body.ventas.some((v) => v.sabores === "Coco, Almendra, Oreo, Vainilla"));
  });
});

describe("Insumos sin control de stock (D40)", () => {
  test("el agua y la limpieza vienen marcadas y no alertan", async () => {
    const agua = await insumoPorNombre("Agua");
    const limpieza = await insumoPorNombre("Limpieza y otros");
    assert.equal((agua as Insumo & { controlaStock: boolean }).controlaStock, false);
    assert.equal((limpieza as Insumo & { controlaStock: boolean }).controlaStock, false);
    assert.equal((await insumoPorNombre("Harina") as Insumo & { controlaStock: boolean }).controlaStock, true);
    const { body } = await api<{ nombre: string }[]>("GET", "/insumos/alertas");
    assert.ok(!body.some((a) => a.nombre === "Agua" || a.nombre === "Limpieza y otros"));
  });

  test("vender no toca su stock pero el costo los sigue contando", async () => {
    const queque = await productoPorNombre("Queque");
    const aguaAntes = await stockDe("Agua");
    const { body } = await api<VentaCreada>("POST", "/ventas", { productoId: queque.id, cantidad: 1 });
    assert.ok(cerca((await stockDe("Agua")).toString(), aguaAntes));
    assert.ok(cerca(body.venta.costoUnitario, costosEsperados["Queque"] ?? "0"));
    // Anular devuelve solo lo que se descontó: el agua sigue igual.
    await api("POST", `/ventas/${body.venta.id}/anular`, { motivo: "prueba D40" });
    assert.ok(cerca((await stockDe("Agua")).toString(), aguaAntes));
  });

  test("no acepta compras ni ajustes, y se puede volver a controlar", async () => {
    const agua = await insumoPorNombre("Agua");
    const compra = await api<ErrorApi>("POST", `/insumos/${agua.id}/movimientos`, { tipo: "COMPRA", envases: "1" });
    assert.equal(compra.status, 422);
    assert.match(compra.body.error, /No llevar stock/);
    const ajuste = await api("POST", `/insumos/${agua.id}/movimientos`, { tipo: "AJUSTE", cantidad: "-100", nota: "x" });
    assert.equal(ajuste.status, 422);

    const activar = await api<Insumo & { controlaStock: boolean }>("PATCH", `/insumos/${agua.id}`, { controlaStock: true });
    assert.equal(activar.status, 200);
    assert.equal(activar.body.controlaStock, true);
    assert.equal((await api("POST", `/insumos/${agua.id}/movimientos`, { tipo: "COMPRA", envases: "1" })).status, 201);
    await api("PATCH", `/insumos/${agua.id}`, { controlaStock: false });
  });
});

describe("Actualizar stock con el número contado", () => {
  test("deja el stock exacto aunque las ventas hayan descontado fracciones", async () => {
    const queque = await productoPorNombre("Queque");
    await api("POST", "/ventas", { productoId: queque.id, cantidad: 1 }); // descuenta una fracción de huevo
    const huevo = await insumoPorNombre("Huevo");
    assert.notEqual(huevo.stockActual, String(Math.round(Number(huevo.stockActual))));

    const { status, body } = await api<{ insumo: Insumo }>("POST", `/insumos/${huevo.id}/movimientos`, {
      tipo: "AJUSTE",
      stockReal: "120",
      nota: "Conteo físico",
    });
    assert.equal(status, 201);
    assert.equal(body.insumo.stockActual, "120");

    const igual = await api<ErrorApi>("POST", `/insumos/${huevo.id}/movimientos`, { tipo: "AJUSTE", stockReal: "120", nota: "x" });
    assert.equal(igual.status, 422);
    const ambos = await api("POST", `/insumos/${huevo.id}/movimientos`, { tipo: "AJUSTE", stockReal: "1", cantidad: "1", nota: "x" });
    assert.equal(ambos.status, 400);
  });
});

describe("Corregir y eliminar ventas desde el Historial (D43)", () => {
  test("corregir la cantidad ajusta el stock por la diferencia y recalcula los totales", async () => {
    const queque = await productoPorNombre("Queque");
    const harina0 = await stockDe("Harina");
    const { body } = await api<VentaCreada>("POST", "/ventas", { productoId: queque.id, cantidad: 2 });
    const usado2 = harina0.sub(await stockDe("Harina"));

    const corregida = await api<Venta>("PATCH", `/ventas/${body.venta.id}`, { cantidad: "3", precioUnitario: "15" });
    assert.equal(corregida.status, 200);
    assert.ok(cerca(corregida.body.totalVenta, "45"));
    assert.ok(cerca(corregida.body.costoUnitario, body.venta.costoUnitario)); // el costo es la foto del día
    assert.ok(cerca(corregida.body.costoTotal, D(body.venta.costoUnitario).mul(3)));
    // 3 unidades descuentan 1,5 veces lo de 2.
    assert.ok(cerca((await stockDe("Harina")).toString(), harina0.sub(usado2.mul(3).div(2))));

    // Volver a 1 devuelve lo que sobra; anular devuelve todo lo neto.
    await api("PATCH", `/ventas/${body.venta.id}`, { cantidad: "1" });
    assert.ok(cerca((await stockDe("Harina")).toString(), harina0.sub(usado2.div(2))));
    await api("POST", `/ventas/${body.venta.id}/anular`, { motivo: "prueba D43" });
    assert.ok(cerca((await stockDe("Harina")).toString(), harina0));
    assert.equal((await api("PATCH", `/ventas/${body.venta.id}`, { cantidad: "2" })).status, 409);
  });

  test("no deja corregir sin datos, a fecha futura ni con otro precio si hay acuerdo", async () => {
    const queque = await productoPorNombre("Queque");
    const { body } = await api<VentaCreada>("POST", "/ventas", { productoId: queque.id, cantidad: 1 });
    assert.equal((await api("PATCH", `/ventas/${body.venta.id}`, {})).status, 400);
    assert.equal((await api("PATCH", `/ventas/${body.venta.id}`, { fecha: "2999-01-01" })).status, 400);
    const ayer = new Date(Date.now() - 86_400_000).toLocaleDateString("sv-SE");
    const movida = await api<Venta & { fecha: string }>("PATCH", `/ventas/${body.venta.id}`, { fecha: ayer });
    assert.equal(new Date(movida.body.fecha).toLocaleDateString("sv-SE"), ayer);

    const primavera = await clientePorNombre("Mercado Primavera");
    const mayorista = await api<VentaCreada>("POST", "/ventas", { productoId: queque.id, cantidad: 2, clienteId: primavera.id });
    assert.equal((await api("PATCH", `/ventas/${mayorista.body.venta.id}`, { precioUnitario: "10" })).status, 422);
    const sinSabores = await api<ErrorApi>("PATCH", `/ventas/${mayorista.body.venta.id}`, { cantidad: "8" });
    assert.equal(sinSabores.status, 400);
    assert.equal((await api("PATCH", `/ventas/${mayorista.body.venta.id}`, { cantidad: "8", sabores: ["Coco"] })).status, 200);
  });

  test("eliminar una venta devuelve su stock y la saca del listado", async () => {
    const queque = await productoPorNombre("Queque");
    const harina0 = await stockDe("Harina");
    const { body } = await api<VentaCreada>("POST", "/ventas", { productoId: queque.id, cantidad: 2 });
    const borrar = await api("DELETE", `/ventas/${body.venta.id}`);
    assert.equal(borrar.status, 200);
    assert.ok(cerca((await stockDe("Harina")).toString(), harina0));
    assert.equal((await api("GET", `/ventas/${body.venta.id}`)).status, 404);
    assert.equal((await api("DELETE", `/ventas/${body.venta.id}`)).status, 404);
  });

  test("corrige y elimina ventas del historial, y reimportar no las pisa", async () => {
    type Fila = { id: number; fecha: string; cantidad: string; valor: string; cliente: string | null; sabores: string | null };
    const notas = await api<{ ventas: Fila[]; resumen: { ventas: number } }>("GET", "/historico?desde=2026-07-01&hasta=2026-07-31");
    const nota = notas.body.ventas.find((v) => Number(v.cantidad) === 10);
    assert.ok(nota);
    const eliana = await clientePorNombre("Eliana");

    const corregida = await api<Fila>("PATCH", `/historico/${nota.id}`, { cantidad: "9", valor: "108", clienteId: eliana.id, sabores: "Coco" });
    assert.equal(corregida.status, 200);
    assert.ok(cerca(corregida.body.valor, "108"));
    assert.equal(corregida.body.cliente, "Eliana");
    assert.ok(!("editada" in corregida.body));

    const otra = notas.body.ventas.find((v) => v.id !== nota.id);
    assert.ok(otra);
    assert.equal((await api("DELETE", `/historico/${otra.id}`)).status, 200);
    const despues = await api<{ ventas: Fila[]; resumen: { ventas: number } }>("GET", "/historico?desde=2026-07-01&hasta=2026-07-31");
    assert.equal(despues.body.resumen.ventas, notas.body.resumen.ventas - 1);
    assert.equal((await api("PATCH", `/historico/${otra.id}`, { valor: "1" })).status, 404);

    // Volver a importar no revive la eliminada ni deshace la corrección.
    execSync("npx tsx database/prisma/importar-historico.ts", { stdio: "ignore", env: process.env });
    const reimportado = await api<{ ventas: Fila[]; resumen: { ventas: number } }>("GET", "/historico?desde=2026-07-01&hasta=2026-07-31");
    assert.equal(reimportado.body.resumen.ventas, despues.body.resumen.ventas);
    assert.ok(reimportado.body.ventas.some((v) => v.id === nota.id && cerca(v.valor, "108")));

    // Restablece los datos para los tests que siguen.
    await api("PATCH", `/historico/${nota.id}`, { cantidad: "10", valor: "120" });
  });
});

describe("Toda venta lleva cliente con celular (D44)", () => {
  test("sin nombre no se vende; un nombre nuevo sin celular tampoco", async () => {
    const queque = await productoPorNombre("Queque");
    const sinNombre = await api<ErrorApi>("POST", "/ventas", { productoId: queque.id, cantidad: 1, __sinCliente: true });
    assert.equal(sinNombre.status, 400);
    assert.ok(sinNombre.body.detalles?.some((d) => d.campo === "clienteNombre"));
    const sinCelular = await api<ErrorApi>("POST", "/ventas", { productoId: queque.id, cantidad: 1, clienteNombre: "Marco Aurelio", __sinCliente: true });
    assert.equal(sinCelular.status, 400);
    assert.ok(sinCelular.body.detalles?.some((d) => d.campo === "celular"));
    const corto = await api<ErrorApi>("POST", "/ventas", {
      productoId: queque.id,
      cantidad: 1,
      clienteNombre: "Marco Aurelio",
      celular: "123",
      __sinCliente: true,
    });
    assert.equal(corto.status, 400);
  });

  test("un nombre nuevo crea el cliente; el mismo nombre (sin tildes ni mayúsculas) lo reutiliza", async () => {
    const queque = await productoPorNombre("Queque");
    const nueva = await api<{ venta: { cliente: string; clienteId: string }; clienteNuevo: boolean }>("POST", "/ventas", {
      productoId: queque.id,
      cantidad: 1,
      clienteNombre: "Marco  Aurelio",
      celular: "71234567",
    });
    assert.equal(nueva.status, 201);
    assert.equal(nueva.body.clienteNuevo, true);
    assert.equal(nueva.body.venta.cliente, "Marco Aurelio");
    const marco = await clientePorNombre("Marco Aurelio");
    assert.equal((marco as Cliente & { celular: string }).celular, "71234567");

    const otra = await api<{ venta: { clienteId: string }; clienteNuevo: boolean }>("POST", "/ventas", {
      productoId: queque.id,
      cantidad: 1,
      clienteNombre: "marco aurélio",
      __sinCliente: true,
    });
    assert.equal(otra.body.clienteNuevo, false);
    assert.equal(otra.body.venta.clienteId, marco.id);
  });

  test("a un cliente sin celular se le pide y se le guarda", async () => {
    const queque = await productoPorNombre("Queque");
    const sinCelular = await api<Cliente>("POST", "/clientes", { nombre: "Doña Petrona" });
    const falta = await api<ErrorApi>("POST", "/ventas", { productoId: queque.id, cantidad: 1, clienteId: sinCelular.body.id, __sinCliente: true });
    assert.equal(falta.status, 400);
    assert.ok(falta.body.detalles?.some((d) => d.campo === "celular"));
    const ok = await api("POST", "/ventas", { productoId: queque.id, cantidad: 1, clienteId: sinCelular.body.id, celular: "76543210" });
    assert.equal(ok.status, 201);
    const actualizada = await clientePorNombre("Doña Petrona");
    assert.equal((actualizada as Cliente & { celular: string }).celular, "76543210");
  });
});


// ---------- Pedidos de varios productos en la Caja (D48) ----------

interface PedidoCreado {
  pedidoId: string;
  cliente: string;
  clienteNuevo: boolean;
  estadoPago: "PAGADO" | "PENDIENTE";
  ventas: (VentaConCliente & { pedidoId: string | null; estadoPago: string })[];
  unidades: string;
  totalVenta: string;
  costoTotal: string;
  gananciaBruta: string;
  alertas: Alerta[];
}

describe("Pedidos de varios productos (D48)", () => {
  test("un pedido registra una venta por producto, con el mismo pedidoId y los totales sumados", async () => {
    const queque = await productoPorNombre("Queque");
    const quinoa = await productoPorNombre("Queque de quinoa");
    const pedido = await api<PedidoCreado>("POST", "/ventas/pedido", {
      clienteNombre: "Pedido Varios",
      celular: "70000001",
      lineas: [
        { productoId: queque.id, cantidad: 5 },
        { productoId: quinoa.id, cantidad: "2" },
      ],
    });
    assert.equal(pedido.status, 201);
    assert.equal(pedido.body.clienteNuevo, true);
    assert.equal(pedido.body.ventas.length, 2);
    assert.match(pedido.body.pedidoId, /^[0-9a-f-]{36}$/);
    assert.ok(pedido.body.ventas.every((v) => v.pedidoId === pedido.body.pedidoId && v.cliente === "Pedido Varios"));
    const suma = (campo: "totalVenta" | "costoTotal" | "gananciaBruta") =>
      pedido.body.ventas.reduce((t, v) => t.add(v[campo]), D(0));
    assert.ok(cerca(pedido.body.totalVenta, suma("totalVenta")));
    assert.ok(cerca(pedido.body.costoTotal, suma("costoTotal")));
    assert.ok(cerca(pedido.body.gananciaBruta, suma("gananciaBruta")));
    assert.ok(cerca(pedido.body.unidades, "7"));
    // Cada línea guarda el costo de producción del momento.
    assert.ok(cerca(pedido.body.ventas[0].costoUnitario, queque.costoUnitario));

    // En el reporte de clientes, un pedido de dos productos cuenta como un pedido.
    const reporte = await api<ReporteCliente[]>("GET", "/ventas/reporte-clientes");
    assert.equal(reporte.body.find((c) => c.nombre === "Pedido Varios")?.ventas, 1);
  });

  test("con un mayorista, cada línea toma su precio acordado; si una falla, no se guarda ninguna", async () => {
    const queque = await productoPorNombre("Queque");
    const quinoa = await productoPorNombre("Queque de quinoa");
    const primavera = await clientePorNombre("Mercado Primavera");
    const antes = (await api<ListaVentas>("GET", "/ventas")).body.ventas.length;

    // Sin sabores aunque sean más de 5: cada sabor ya es su propio producto.
    const ok = await api<PedidoCreado>("POST", "/ventas/pedido", {
      clienteId: primavera.id,
      celular: "70000002",
      lineas: [
        { productoId: queque.id, cantidad: 10 },
        { productoId: quinoa.id, cantidad: 1 },
      ],
    });
    assert.equal(ok.status, 201);
    assert.ok(cerca(ok.body.ventas[0].precioUnitario, "12"));

    const malPrecio = await api<ErrorApi>("POST", "/ventas/pedido", {
      clienteId: primavera.id,
      lineas: [
        { productoId: quinoa.id, cantidad: 1 },
        { productoId: queque.id, cantidad: 1, precioUnitario: "15" },
      ],
    });
    assert.equal(malPrecio.status, 422);
    assert.match(malPrecio.body.error, /acordado/);
    assert.equal((await api<ListaVentas>("GET", "/ventas")).body.ventas.length, antes + 2);
  });

  test("rechaza pedidos vacíos, productos repetidos y productos inactivos", async () => {
    const queque = await productoPorNombre("Queque");
    const historico = await productoPorNombre("Queque base (histórico)");
    const base = { clienteNombre: "Mostrador", celular: "70000000" };
    assert.equal((await api("POST", "/ventas/pedido", { ...base, lineas: [] })).status, 400);
    const repetido = await api<ErrorApi>("POST", "/ventas/pedido", {
      ...base,
      lineas: [
        { productoId: queque.id, cantidad: 1 },
        { productoId: queque.id, cantidad: 2 },
      ],
    });
    assert.equal(repetido.status, 400);
    assert.equal((await api("POST", "/ventas/pedido", { ...base, lineas: [{ productoId: queque.id, cantidad: 0 }] })).status, 400);
    assert.equal((await api("POST", "/ventas/pedido", { lineas: [{ productoId: queque.id, cantidad: 1 }] })).status, 400);

    const antes = (await api<ListaVentas>("GET", "/ventas")).body.ventas.length;
    const fuera = await api<ErrorApi>("POST", "/ventas/pedido", {
      ...base,
      lineas: [
        { productoId: queque.id, cantidad: 1 },
        { productoId: historico.id, cantidad: 1 },
      ],
    });
    assert.equal(fuera.status, 422);
    assert.equal((await api<ListaVentas>("GET", "/ventas")).body.ventas.length, antes);
  });

  test("un pedido fiado se cobra entero de una vez", async () => {
    const queque = await productoPorNombre("Queque");
    const quinoa = await productoPorNombre("Queque de quinoa");
    const fiado = await api<PedidoCreado>("POST", "/ventas/pedido", {
      clienteNombre: "Mostrador",
      celular: "70000000",
      fiado: true,
      lineas: [
        { productoId: queque.id, cantidad: 1 },
        { productoId: quinoa.id, cantidad: 1 },
      ],
    });
    assert.equal(fiado.status, 201);
    assert.equal(fiado.body.estadoPago, "PENDIENTE");
    const pendientes = await api<{ ventas: { pedidoId: string | null }[] }>("GET", "/ventas/pendientes");
    assert.equal(pendientes.body.ventas.filter((v) => v.pedidoId === fiado.body.pedidoId).length, 2);

    const cobro = await api<{ cobradas: number; total: string }>("POST", `/ventas/pedidos/${fiado.body.pedidoId}/cobrar`);
    assert.equal(cobro.status, 200);
    assert.equal(cobro.body.cobradas, 2);
    assert.ok(cerca(cobro.body.total, fiado.body.totalVenta));
    assert.equal((await api("POST", `/ventas/pedidos/${fiado.body.pedidoId}/cobrar`)).status, 409);
    assert.equal((await api("POST", "/ventas/pedidos/00000000-0000-4000-8000-000000000000/cobrar")).status, 404);
    assert.equal((await api("POST", "/ventas/pedidos/no-es-uuid/cobrar")).status, 400);
  });
});
