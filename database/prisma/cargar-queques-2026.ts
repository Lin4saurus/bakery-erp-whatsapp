// Carga de los queques reales (D46) desde «Control_Dulzura_Costos_Ventas_Inventario.xlsx»
// (hojas Ingredientes, Productos y Recetas). Se ejecuta una sola vez: `npx tsx database/prisma/cargar-queques-2026.ts`.
//
// Lo que hace, en una transacción:
//  1. Retira los queques anteriores: borra sus recetas y los saca de la Caja y de Recetas (activo = false).
//     Sus ventas, notas e historial se conservan con su nombre y su costo de entonces.
//  2. Pone a los insumos el precio y el envase del Excel (los que ya existían se actualizan; los demás se crean).
//  3. Crea los 11 queques del Excel con su receta, a Bs 16, y pasa a los sabores el precio acordado
//     que Mercado Primavera y Eliana tenían en «Queque».
//
// Decisiones del usuario (09-11-2026): conservar ventas; Bs 16 a todos; 0,1 y 0,15 de Oreo, almendra, coco
// y cacao son 10 g y 15 g (se cargaron primero como 100 g/150 g y se corrigieron el mismo día); actualizar los insumos existentes con el precio del Excel.
import { CategoriaInsumo, Prisma, PrismaClient, TipoProducto, UnidadMedida } from "@prisma/client";

const prisma = new PrismaClient();
const { GRAMO, MILILITRO, UNIDAD } = UnidadMedida;
const { MATERIA_PRIMA, EMPAQUE } = CategoriaInsumo;

const QUEQUES_ANTERIORES = ["Queque", "Queque molde grande", "Queque de quinoa", "Queque con relleno", "Queque base (histórico)"];

type Insumo = {
  clave: string; // nombre en la hoja Recetas
  nombre: string; // nombre en el ERP
  antes?: string; // nombre actual en el ERP, si ya existía con otro nombre
  unidad: UnidadMedida;
  categoria: CategoriaInsumo;
  envase: string;
  precio: string;
};

// Hoja Ingredientes (ING001–ING024).
const INSUMOS: Insumo[] = [
  { clave: "Harina", nombre: "Harina", unidad: GRAMO, categoria: MATERIA_PRIMA, envase: "50000", precio: "320" },
  { clave: "Azúcar", nombre: "Azúcar", unidad: GRAMO, categoria: MATERIA_PRIMA, envase: "46000", precio: "280" },
  { clave: "Huevos", nombre: "Huevo", unidad: UNIDAD, categoria: MATERIA_PRIMA, envase: "300", precio: "200" },
  { clave: "Aceite o margarina", nombre: "Aceite o margarina", unidad: GRAMO, categoria: MATERIA_PRIMA, envase: "16500", precio: "265" },
  { clave: "Leche", nombre: "Leche", unidad: MILILITRO, categoria: MATERIA_PRIMA, envase: "1000", precio: "8" },
  { clave: "Esencia de vainilla", nombre: "Esencia de vainilla", antes: "Esencia", unidad: MILILITRO, categoria: MATERIA_PRIMA, envase: "1000", precio: "60" },
  { clave: "Esencia de Naranja", nombre: "Esencia de naranja", antes: "Escencia Naranja", unidad: MILILITRO, categoria: MATERIA_PRIMA, envase: "1000", precio: "60" },
  { clave: "Esencia de Frutilla", nombre: "Esencia de frutilla", unidad: MILILITRO, categoria: MATERIA_PRIMA, envase: "1000", precio: "60" },
  { clave: "Esencia de Limon", nombre: "Esencia de limón", antes: "Escencia de Limon", unidad: MILILITRO, categoria: MATERIA_PRIMA, envase: "1000", precio: "60" },
  { clave: "Dulce de leche", nombre: "Dulce de leche", unidad: GRAMO, categoria: MATERIA_PRIMA, envase: "1000", precio: "60" },
  { clave: "Nueces / almendras", nombre: "Almendra", unidad: GRAMO, categoria: MATERIA_PRIMA, envase: "1000", precio: "90" },
  { clave: "Empaque/etiqueta", nombre: "Etiqueta", unidad: UNIDAD, categoria: EMPAQUE, envase: "1", precio: "0.5" },
  { clave: "Cacao/chocolate", nombre: "Cocoa", unidad: GRAMO, categoria: MATERIA_PRIMA, envase: "500", precio: "85" },
  { clave: "Polvo de hornear", nombre: "Polvo de hornear", unidad: GRAMO, categoria: MATERIA_PRIMA, envase: "1000", precio: "32" },
  // El Excel lo mide en metros (rollo de 1200 m); el ERP no tiene metros: 1 unidad = 1 metro.
  { clave: "Plastico Filp", nombre: "Plástico film (metro)", unidad: UNIDAD, categoria: EMPAQUE, envase: "1200", precio: "240" },
  { clave: "Coco rayado", nombre: "Coco", unidad: GRAMO, categoria: MATERIA_PRIMA, envase: "1000", precio: "90" },
  { clave: "Platillos Obleas 18cm", nombre: "Platillo", unidad: UNIDAD, categoria: EMPAQUE, envase: "1", precio: "0.35" },
  { clave: "Galletas Oreo", nombre: "Galletas Oreo", unidad: GRAMO, categoria: MATERIA_PRIMA, envase: "1000", precio: "90" },
  { clave: "Maicena", nombre: "Maicena", unidad: GRAMO, categoria: MATERIA_PRIMA, envase: "1000", precio: "8" },
  { clave: "Leche en Polvo", nombre: "Leche en polvo", unidad: GRAMO, categoria: MATERIA_PRIMA, envase: "2000", precio: "120" },
  { clave: "Leche condesada", nombre: "Leche condensada", unidad: GRAMO, categoria: MATERIA_PRIMA, envase: "395", precio: "10" },
  { clave: "Tortera Chica", nombre: "Tortera chica", unidad: UNIDAD, categoria: EMPAQUE, envase: "1", precio: "8" },
  { clave: "Tortera Grande", nombre: "Tortera grande", unidad: UNIDAD, categoria: EMPAQUE, envase: "1", precio: "10" },
  { clave: "Zanahoria", nombre: "Zanahoria", unidad: GRAMO, categoria: MATERIA_PRIMA, envase: "1000", precio: "30" },
];

// Base común de los queques de sabor (hoja Recetas), para 1 queque.
const BASE: [string, string][] = [
  ["Harina", "224"],
  ["Azúcar", "150"],
  ["Aceite o margarina", "30"],
  ["Huevos", "1.8"],
  ["Polvo de hornear", "12"],
  ["Platillos Obleas 18cm", "1"],
  ["Plastico Filp", "0.8"],
  ["Empaque/etiqueta", "1"],
];
const conVainilla: [string, string][] = [...BASE, ["Esencia de vainilla", "6"]];

type Queque = { nombre: string; rendimiento: string; receta: [string, string][]; sabor: boolean };

const QUEQUES: Queque[] = [
  { nombre: "Queque Vainilla", rendimiento: "1", sabor: true, receta: conVainilla },
  { nombre: "Queque Oreo", rendimiento: "1", sabor: true, receta: [...conVainilla, ["Galletas Oreo", "10"]] },
  { nombre: "Queque Almendra", rendimiento: "1", sabor: true, receta: [...conVainilla, ["Nueces / almendras", "10"]] },
  { nombre: "Queque Coco", rendimiento: "1", sabor: true, receta: [...conVainilla, ["Coco rayado", "10"]] },
  { nombre: "Queque Chocolate", rendimiento: "1", sabor: true, receta: [...conVainilla, ["Cacao/chocolate", "15"]] },
  { nombre: "Queque Naranja", rendimiento: "1", sabor: true, receta: [...BASE, ["Esencia de Naranja", "6"]] },
  { nombre: "Queque Limón", rendimiento: "1", sabor: true, receta: [...BASE, ["Esencia de Limon", "6"]] },
  { nombre: "Queque Frutilla", rendimiento: "1", sabor: true, receta: [...BASE, ["Esencia de Frutilla", "6"]] },
  { nombre: "Queque Marmolado", rendimiento: "1", sabor: true, receta: [...conVainilla, ["Cacao/chocolate", "10"]] },
  {
    nombre: "Queques Marliza Chavez",
    rendimiento: "5",
    sabor: false,
    receta: [
      ["Harina", "1000"],
      ["Azúcar", "750"],
      ["Aceite o margarina", "380"],
      ["Huevos", "8"],
      ["Esencia de vainilla", "50"],
      ["Polvo de hornear", "50"],
      // Empaques por queque vendido, no por tanda (D60).
      ["Platillos Obleas 18cm", "1"],
      ["Plastico Filp", "1"],
      ["Empaque/etiqueta", "1"],
      ["Leche en Polvo", "40"],
      ["Maicena", "40"],
    ],
  },
  {
    nombre: "Queque Zanahoria",
    rendimiento: "2.5",
    sabor: false,
    receta: [
      ["Harina", "400"],
      ["Zanahoria", "300"],
      ["Aceite o margarina", "180"],
      ["Azúcar", "300"],
      ["Huevos", "4"],
      ["Polvo de hornear", "12"],
      ["Esencia de vainilla", "12"],
      // Empaques por queque vendido, no por tanda (D60).
      ["Platillos Obleas 18cm", "1"],
      ["Plastico Filp", "1"],
      ["Empaque/etiqueta", "1"],
    ],
  },
];

async function main() {
  await prisma.$transaction(
    async (tx) => {
      // 1. Queques anteriores: sin receta y fuera de la Caja; sus ventas quedan.
      const anteriores = await tx.producto.findMany({ where: { nombre: { in: QUEQUES_ANTERIORES } } });
      const idsAnteriores = anteriores.map((p) => p.id);
      const acordados = await tx.precioCliente.findMany({ where: { productoId: { in: idsAnteriores } } });
      await tx.ingredienteReceta.deleteMany({ where: { productoId: { in: idsAnteriores } } });
      await tx.componenteReceta.deleteMany({ where: { productoId: { in: idsAnteriores } } });
      await tx.precioCliente.deleteMany({ where: { productoId: { in: idsAnteriores } } });
      await tx.producto.updateMany({ where: { id: { in: idsAnteriores } }, data: { activo: false, disponible: false } });
      console.log(`Retirados: ${anteriores.map((p) => p.nombre).join(", ")}`);

      // 2. Insumos con el precio del Excel.
      const idInsumo = new Map<string, number>();
      for (const i of INSUMOS) {
        const actual =
          (await tx.insumo.findUnique({ where: { nombre: i.nombre } })) ??
          (i.antes ? await tx.insumo.findUnique({ where: { nombre: i.antes } }) : null);
        const datos = {
          nombre: i.nombre,
          unidadBase: i.unidad,
          categoria: i.categoria,
          contenidoEnvase: new Prisma.Decimal(i.envase),
          precioEnvase: new Prisma.Decimal(i.precio),
          activo: true,
        };
        if (actual) {
          if (actual.unidadBase !== i.unidad) throw new Error(`${i.nombre}: el ERP lo mide en ${actual.unidadBase} y el Excel en ${i.unidad}.`);
          await tx.insumo.update({ where: { id: actual.id }, data: datos });
          console.log(`Insumo actualizado: ${actual.nombre}${actual.nombre !== i.nombre ? ` → ${i.nombre}` : ""}  ${actual.contenidoEnvase}/${actual.precioEnvase} → ${i.envase}/${i.precio}`);
          idInsumo.set(i.clave, actual.id);
        } else {
          const nuevo = await tx.insumo.create({ data: datos });
          console.log(`Insumo nuevo: ${i.nombre}  ${i.envase}/${i.precio}`);
          idInsumo.set(i.clave, nuevo.id);
        }
      }

      // 3. Queques del Excel.
      for (const q of QUEQUES) {
        if (await tx.producto.findUnique({ where: { nombre: q.nombre } })) throw new Error(`Ya existe "${q.nombre}".`);
        const producto = await tx.producto.create({
          data: {
            nombre: q.nombre,
            categoria: "Queques",
            tipo: TipoProducto.VENTA,
            rendimientoReceta: new Prisma.Decimal(q.rendimiento),
            unidadRendimiento: UNIDAD,
            precioVenta: new Prisma.Decimal("16"),
            activo: true,
            disponible: true,
            ingredientes: {
              create: q.receta.map(([clave, cantidad]) => {
                const insumoId = idInsumo.get(clave);
                if (!insumoId) throw new Error(`${q.nombre}: no encuentro el insumo "${clave}".`);
                return { insumoId, cantidad: new Prisma.Decimal(cantidad) };
              }),
            },
          },
        });
        if (q.sabor) {
          for (const a of acordados) {
            await tx.precioCliente.create({ data: { clienteId: a.clienteId, productoId: producto.id, precio: a.precio } });
          }
        }
        console.log(`Queque creado: ${q.nombre} (${q.receta.length} ingredientes)`);
      }
    },
    { timeout: 60_000 },
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
