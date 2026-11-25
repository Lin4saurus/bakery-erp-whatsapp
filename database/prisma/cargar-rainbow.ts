// Pastelería Rainbow (D115): borra todo lo de la repostera anterior y carga el catálogo saludable de Rainbow
// («CATÁLOGO SALUDABLE RAINBOW.pdf»: tortas, masitas, postres, panes y bocaditos, con sus tamaños y precios).
//
//   npx tsx database/prisma/cargar-rainbow.ts --confirmar
//
// Los PRECIOS DE VENTA son los del catálogo. Las RECETAS y los PRECIOS DE LOS INSUMOS son inventados (Rainbow no
// tiene recetario todavía): son un punto de partida razonable que la dueña corrige en Insumos y Recetas.
//
// Qué borra: ventas (Caja y anteriores), pedidos, atenciones, gastos, movimientos de stock, clientes, productos,
// recetas e insumos, y el gasto fijo mensual. Qué conserva: el PIN, la clave del agente y los números de prueba.
// Al final compacta la base (VACUUM) para que lo anterior no ocupe espacio.
import { CategoriaInsumo, Prisma, PrismaClient, TipoProducto, UnidadMedida } from "@prisma/client";

const prisma = new PrismaClient();
const D = (n: number | string) => new Prisma.Decimal(n);
const { GRAMO, MILILITRO, UNIDAD } = UnidadMedida;
const { MATERIA_PRIMA, EMPAQUE } = CategoriaInsumo;

// ---------- Insumos: [nombre, unidad, contenido del envase, Bs del envase] (precios inventados, La Paz 2026) ----------

type FilaInsumo = [string, UnidadMedida, number, number];

const MATERIAS: FilaInsumo[] = [
  ["Harina de quinua", GRAMO, 1000, 30],
  ["Harina de avena sin gluten", GRAMO, 1000, 35],
  ["Avena en hojuelas sin gluten", GRAMO, 1000, 28],
  ["Harina de almendra", GRAMO, 500, 60],
  ["Harina de arroz", GRAMO, 1000, 18],
  ["Harina de arroz integral", GRAMO, 1000, 22],
  ["Harina de garbanzo", GRAMO, 1000, 25],
  ["Harina de maíz", GRAMO, 1000, 12],
  ["Harina de lenteja", GRAMO, 1000, 22],
  ["Pito de cañahua", GRAMO, 500, 15],
  ["Almidón de yuca", GRAMO, 1000, 16],
  ["Maicena", GRAMO, 500, 9],
  ["Cocoa amarga", GRAMO, 250, 25],
  ["Chocolate semiamargo", GRAMO, 1000, 85],
  ["Chips de chocolate semiamargo", GRAMO, 500, 45],
  ["Estevia", GRAMO, 250, 40],
  ["Azúcar morena", GRAMO, 1000, 10],
  ["Chancaca", GRAMO, 500, 8],
  ["Huevo", UNIDAD, 30, 30],
  ["Leche light", MILILITRO, 1000, 9],
  ["Leche deslactosada", MILILITRO, 1000, 10],
  ["Leche condensada sin azúcar", GRAMO, 300, 45],
  ["Yogur griego", GRAMO, 1000, 35],
  ["Yogur probiótico", MILILITRO, 1000, 18],
  ["Queso crema", GRAMO, 1000, 60],
  ["Crema de leche", MILILITRO, 1000, 40],
  ["Queso", GRAMO, 1000, 45],
  ["Mantequilla de maní", GRAMO, 500, 30],
  ["Maní", GRAMO, 1000, 30],
  ["Zanahoria", GRAMO, 1000, 5],
  ["Camote", GRAMO, 1000, 6],
  ["Plátano", GRAMO, 1000, 8],
  ["Limón", GRAMO, 1000, 10],
  ["Naranja", GRAMO, 1000, 8],
  ["Frutilla", GRAMO, 1000, 20],
  ["Arándanos", GRAMO, 500, 35],
  ["Ciruela", GRAMO, 1000, 15],
  ["Manzana", GRAMO, 1000, 12],
  ["Tomate", GRAMO, 1000, 8],
  ["Canela molida", GRAMO, 100, 10],
  ["Café instantáneo", GRAMO, 100, 18],
  ["Linaza", GRAMO, 500, 8],
  ["Chía", GRAMO, 500, 15],
  ["Sésamo", GRAMO, 500, 12],
  ["Coco rallado", GRAMO, 500, 15],
  ["Polvo de hornear", GRAMO, 250, 8],
  ["Esencia de vainilla", MILILITRO, 500, 15],
  ["Gelatina sin sabor", GRAMO, 100, 20],
  ["Orégano", GRAMO, 50, 5],
  ["Sal", GRAMO, 1000, 3],
];

const EMPAQUES: FilaInsumo[] = [
  ["Caja de torta chica", UNIDAD, 10, 25], // 2 a 4 personas
  ["Caja de torta mediana", UNIDAD, 10, 35], // 5 a 10 personas
  ["Caja de torta grande", UNIDAD, 10, 50], // 15 a 25 personas
  ["Caja de masitas", UNIDAD, 25, 30],
  ["Bolsa de celofán", UNIDAD, 100, 25],
  ["Pirotines", UNIDAD, 100, 12],
  ["Envase para salsa", UNIDAD, 50, 25],
  ["Etiqueta Rainbow", UNIDAD, 100, 30],
];

// ---------- Masas, rellenos y bases (INTERMEDIO, en gramos) ----------

type Receta = Record<string, number>; // insumo → cantidad en su unidad base

interface Mezcla {
  nombre: string;
  categoria: string;
  ingredientes: Receta;
}

const MEZCLAS: Mezcla[] = [
  // Masas de torta
  { nombre: "Masa de quinua y cocoa", categoria: "Masas", ingredientes: { "Harina de quinua": 300, "Cocoa amarga": 60, Huevo: 5, "Yogur griego": 200, "Azúcar morena": 120, Estevia: 10, "Polvo de hornear": 12, "Esencia de vainilla": 10, "Leche light": 150 } },
  { nombre: "Masa de quinua y zanahoria", categoria: "Masas", ingredientes: { "Harina de quinua": 280, Zanahoria: 300, Huevo: 5, "Canela molida": 8, "Azúcar morena": 100, Estevia: 8, "Polvo de hornear": 12, "Yogur griego": 150 } },
  { nombre: "Masa de avena y almendra", categoria: "Masas", ingredientes: { "Harina de avena sin gluten": 220, "Harina de almendra": 120, Huevo: 5, "Azúcar morena": 100, Estevia: 8, "Polvo de hornear": 10, "Leche light": 150, "Esencia de vainilla": 10 } },
  { nombre: "Bizcocho de garbanzo y cereales", categoria: "Masas", ingredientes: { "Harina de garbanzo": 100, "Harina de quinua": 80, "Harina de arroz": 80, "Almidón de yuca": 60, "Harina de maíz": 60, Huevo: 6, Estevia: 12, "Polvo de hornear": 12, "Esencia de vainilla": 10, "Leche light": 100 } },
  { nombre: "Masa de brownie de camote", categoria: "Masas", ingredientes: { Camote: 400, "Cocoa amarga": 70, "Harina de almendra": 80, Huevo: 4, "Azúcar morena": 120, Estevia: 8, "Chips de chocolate semiamargo": 100 } },
  { nombre: "Masa de brownie de quinua y arroz integral", categoria: "Masas", ingredientes: { "Harina de quinua": 120, "Harina de arroz integral": 120, "Cocoa amarga": 60, Chancaca: 180, "Leche deslactosada": 200, Huevo: 3, "Chocolate semiamargo": 100 } },
  // Rellenos y cremas
  { nombre: "Relleno de queso crema y yogur", categoria: "Rellenos y cremas", ingredientes: { "Queso crema": 400, "Yogur griego": 400, Estevia: 10, "Esencia de vainilla": 5 } },
  { nombre: "Crema pastelera de cocoa", categoria: "Rellenos y cremas", ingredientes: { "Leche light": 500, Maicena: 50, "Cocoa amarga": 40, Huevo: 3, Estevia: 12 } },
  { nombre: "Crema pastelera de maicena", categoria: "Rellenos y cremas", ingredientes: { "Leche light": 500, Maicena: 50, Huevo: 3, Estevia: 10, "Yogur griego": 100 } },
  { nombre: "Relleno de maní", categoria: "Rellenos y cremas", ingredientes: { "Mantequilla de maní": 300, Maní: 100 } },
  { nombre: "Yogur griego de cocoa", categoria: "Rellenos y cremas", ingredientes: { "Yogur griego": 500, "Cocoa amarga": 40, Maicena: 20, Estevia: 10 } },
  { nombre: "Crema de leche batida", categoria: "Rellenos y cremas", ingredientes: { "Crema de leche": 500, Estevia: 8 } },
  { nombre: "Crema de limón", categoria: "Rellenos y cremas", ingredientes: { "Leche light": 400, Maicena: 45, Limón: 120, Huevo: 3, "Yogur griego": 150, Estevia: 12 } },
  { nombre: "Baño tres leches", categoria: "Rellenos y cremas", ingredientes: { "Leche light": 500, "Leche condensada sin azúcar": 300, "Yogur griego": 150, Estevia: 5 } },
  { nombre: "Mermelada de arándanos", categoria: "Rellenos y cremas", ingredientes: { Arándanos: 500, Estevia: 10, Maicena: 15 } },
  { nombre: "Mermelada de frutilla", categoria: "Rellenos y cremas", ingredientes: { Frutilla: 500, Estevia: 10, Maicena: 15 } },
  { nombre: "Granola de semillas", categoria: "Rellenos y cremas", ingredientes: { "Avena en hojuelas sin gluten": 300, Sésamo: 50, Chía: 50, Linaza: 50, "Canela molida": 5, "Azúcar morena": 40 } },
  // Masitas
  { nombre: "Masa de avena para roles", categoria: "Masas", ingredientes: { "Harina de avena sin gluten": 500, "Almidón de yuca": 100, Huevo: 2, "Yogur griego": 150, "Polvo de hornear": 15, "Azúcar morena": 60, Estevia: 5, "Canela molida": 20 } },
  { nombre: "Masa de galleta choco chip", categoria: "Masas", ingredientes: { "Harina de almendra": 200, "Harina de avena sin gluten": 200, Huevo: 2, "Azúcar morena": 120, "Chips de chocolate semiamargo": 150, "Esencia de vainilla": 5 } },
  { nombre: "Masa de galleta brownie de plátano", categoria: "Masas", ingredientes: { Plátano: 300, "Harina de arroz": 120, "Almidón de yuca": 60, "Cocoa amarga": 50, "Chocolate semiamargo": 80, Estevia: 6 } },
  { nombre: "Masa de galleta de arroz y almendra", categoria: "Masas", ingredientes: { "Harina de almendra": 200, "Harina de arroz": 150, Huevo: 2, "Azúcar morena": 100, "Mantequilla de maní": 120, Maní: 60 } },
  { nombre: "Masa de muffin nutritivo", categoria: "Masas", ingredientes: { Linaza: 60, "Harina de arroz": 150, "Harina de almendra": 100, "Almidón de yuca": 80, Huevo: 4, "Yogur griego": 200, "Azúcar morena": 80, Estevia: 6, "Polvo de hornear": 10 } },
  { nombre: "Masa de galleta de lenteja", categoria: "Masas", ingredientes: { "Harina de lenteja": 250, "Cocoa amarga": 50, "Chips de chocolate semiamargo": 120, Huevo: 2, "Azúcar morena": 80, Estevia: 5 } },
  { nombre: "Masa de donitas de quinua", categoria: "Masas", ingredientes: { "Harina de quinua": 250, Zanahoria: 150, "Cocoa amarga": 25, Huevo: 3, "Azúcar morena": 80, "Polvo de hornear": 8 } },
  { nombre: "Masa de bocaditos de quinua", categoria: "Masas", ingredientes: { "Harina de quinua": 250, Zanahoria: 200, Huevo: 3, "Azúcar morena": 70, Estevia: 5 } },
  { nombre: "Masa de rosquitas de cañahua", categoria: "Masas", ingredientes: { "Pito de cañahua": 250, Plátano: 300, Huevo: 2, "Canela molida": 5, "Polvo de hornear": 8 } },
  { nombre: "Masa de arroz", categoria: "Masas", ingredientes: { "Harina de arroz": 400, "Almidón de yuca": 100, Huevo: 2, "Azúcar morena": 80, "Yogur griego": 60 } },
  // Postres
  { nombre: "Base de galleta de almendra y avena", categoria: "Bases", ingredientes: { "Harina de almendra": 150, "Avena en hojuelas sin gluten": 150, "Azúcar morena": 40, Huevo: 1 } },
  { nombre: "Mezcla de cheesecake", categoria: "Rellenos y cremas", ingredientes: { "Queso crema": 500, "Yogur griego": 400, "Gelatina sin sabor": 20, Estevia: 10 } },
  { nombre: "Mezcla de cheesecake probiótico", categoria: "Rellenos y cremas", ingredientes: { "Queso crema": 400, "Yogur probiótico": 500, "Gelatina sin sabor": 20, Ciruela: 60, Manzana: 60, Arándanos: 50, Linaza: 20 } },
  { nombre: "Mezcla de tarta vasca", categoria: "Rellenos y cremas", ingredientes: { "Queso crema": 500, "Yogur griego": 300, "Harina de avena sin gluten": 40, Huevo: 4, "Azúcar morena": 60 } },
  { nombre: "Gelatina de yogur", categoria: "Rellenos y cremas", ingredientes: { "Yogur griego": 700, "Gelatina sin sabor": 30, Estevia: 8, "Leche light": 300 } },
  { nombre: "Mezcla de budín de yogur y yuca", categoria: "Rellenos y cremas", ingredientes: { "Yogur griego": 600, "Almidón de yuca": 80, Huevo: 3, Estevia: 8, "Esencia de vainilla": 10 } },
  // Panes y bocaditos
  { nombre: "Masa de pan de avena y yuca", categoria: "Masas", ingredientes: { "Harina de avena sin gluten": 400, "Almidón de yuca": 300, Huevo: 2, Sal: 8, Estevia: 2, "Leche light": 150 } },
  { nombre: "Masa de pan de lenteja", categoria: "Masas", ingredientes: { "Harina de lenteja": 400, "Almidón de yuca": 100, Huevo: 2, Orégano: 5, Sal: 6, Estevia: 3, "Polvo de hornear": 10 } },
  { nombre: "Masa de pan de fibra", categoria: "Masas", ingredientes: { "Harina de avena sin gluten": 200, Linaza: 60, "Harina de arroz integral": 150, "Almidón de yuca": 100, Chía: 30, Huevo: 2, Estevia: 3, Sal: 5 } },
  { nombre: "Mezcla vegetariana de garbanzo y quinua", categoria: "Masas", ingredientes: { "Harina de garbanzo": 200, "Harina de quinua": 150, "Harina de arroz": 100, Huevo: 2, Orégano: 5, Sal: 6 } },
  { nombre: "Salsa de tomate casera", categoria: "Rellenos y cremas", ingredientes: { Tomate: 1000, Sal: 5, Orégano: 3 } },
];

// ---------- Productos de venta ----------

interface Parte {
  mezclas?: Receta; // mezcla → gramos
  insumos?: Receta; // insumo → cantidad
}

interface ProductoRainbow {
  nombre: string;
  categoria: string;
  precio: number;
  receta: Parte;
  empaque: Receta;
}

const productos: ProductoRainbow[] = [];

const escalar = (parte: Parte, factor: number): Parte => {
  const por = (r?: Receta) => (r ? Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v * factor * 100) / 100])) : undefined);
  return { mezclas: por(parte.mezclas), insumos: por(parte.insumos) };
};

const cajaDeTorta = (personas: number) =>
  personas <= 4 ? "Caja de torta chica" : personas <= 10 ? "Caja de torta mediana" : "Caja de torta grande";

// Tortas y postres por personas: la receta es por persona y se escala al tamaño.
function porPersonas(nombre: string, categoria: string, precios: Record<number, number>, porPersona: Parte) {
  for (const [personas, precio] of Object.entries(precios).map(([p, b]) => [Number(p), b] as const)) {
    productos.push({
      nombre: `${nombre} · ${personas} personas`,
      categoria,
      precio,
      receta: escalar(porPersona, personas),
      empaque: { [cajaDeTorta(personas)]: 1, "Etiqueta Rainbow": 1 },
    });
  }
}

// Masitas, panes y bocaditos por paquete: la receta es por pieza y se escala a las piezas del paquete.
function porPaquetes(nombre: string, categoria: string, paquetes: { etiqueta: string; piezas: number; precio: number; porPieza: Parte; empaque: Receta }[]) {
  for (const p of paquetes) {
    productos.push({ nombre: `${nombre} · ${p.etiqueta}`, categoria, precio: p.precio, receta: escalar(p.porPieza, p.piezas), empaque: p.empaque });
  }
}

const caja = { "Caja de masitas": 1, "Etiqueta Rainbow": 1 };
const bolsa = { "Bolsa de celofán": 1, "Etiqueta Rainbow": 1 };
const suelta = {}; // por mayoreo, se arma el empaque según el evento

// Tortas nutritivas (catálogo pp. 4-9)
const todos = (a: number, b: number, c: number, d: number, e: number, f: number) => ({ 2: a, 4: b, 8: c, 10: d, 15: e, 25: f });
porPersonas("Torta snicker de quinua", "Tortas", todos(50, 70, 95, 150, 250, 350), { mezclas: { "Masa de quinua y cocoa": 70, "Relleno de maní": 15, "Crema pastelera de cocoa": 25 }, insumos: { "Chocolate semiamargo": 4 } });
porPersonas("Torta de quinua y zanahoria", "Tortas", todos(50, 75, 100, 155, 255, 355), { mezclas: { "Masa de quinua y zanahoria": 75, "Relleno de queso crema y yogur": 40 } });
porPersonas("Torta tiramisú de almendra y avena", "Tortas", todos(55, 80, 120, 180, 265, 385), { mezclas: { "Masa de avena y almendra": 70, "Relleno de queso crema y yogur": 40 }, insumos: { "Café instantáneo": 2, "Cocoa amarga": 2, "Avena en hojuelas sin gluten": 3 } });
porPersonas("Brownie de camote", "Tortas", { 4: 70, 8: 95, 10: 150, 15: 250, 25: 350 }, { mezclas: { "Masa de brownie de camote": 80, "Crema pastelera de cocoa": 20 }, insumos: { "Chips de chocolate semiamargo": 5 } });
porPersonas("Marquise de chocolate", "Tortas", { 4: 70, 8: 100, 10: 128, 15: 170 }, { mezclas: { "Bizcocho de garbanzo y cereales": 70, "Crema pastelera de cocoa": 25 }, insumos: { "Cocoa amarga": 3, "Yogur griego": 15, Frutilla: 15 } });
porPersonas("Tres leches nutritiva", "Tortas", todos(60, 75, 115, 160, 250, 370), { mezclas: { "Bizcocho de garbanzo y cereales": 70, "Baño tres leches": 50 }, insumos: { "Yogur griego": 15, Frutilla: 10 } });
porPersonas("Brownie de quinua y arroz integral", "Tortas", { 8: 65 }, { mezclas: { "Masa de brownie de quinua y arroz integral": 90, "Granola de semillas": 10 } });
porPersonas("Torta Matilda de quinua", "Tortas", todos(55, 75, 95, 150, 250, 355), { mezclas: { "Masa de quinua y cocoa": 70, "Yogur griego de cocoa": 40 } });
porPersonas("Torta de limón", "Tortas", todos(55, 75, 95, 150, 250, 355), { mezclas: { "Bizcocho de garbanzo y cereales": 70, "Crema de limón": 40 } });
porPersonas("Selva negra de quinua", "Tortas", todos(60, 80, 110, 160, 270, 380), { mezclas: { "Masa de quinua y cocoa": 70, "Crema de leche batida": 30, "Mermelada de arándanos": 15 } });

// Masitas nutritivas (pp. 10-16). Mini galleta 15 g, mediana 45 g; mini rol 30 g, rol mediano 70 g; muffin 70 g.
const miniRol: Parte = { mezclas: { "Masa de avena para roles": 30 } };
porPaquetes("Mini roles de canela", "Masitas", [
  { etiqueta: "paquete de 10", piezas: 10, precio: 42, porPieza: miniRol, empaque: caja },
  { etiqueta: "paquete de 12", piezas: 12, precio: 49, porPieza: miniRol, empaque: caja },
  { etiqueta: "unidad (mayoreo, desde 21)", piezas: 1, precio: 4, porPieza: miniRol, empaque: suelta },
]);
const galleta = (masa: string, gramos: number, extra?: Receta): Parte => ({ mezclas: { [masa]: gramos }, insumos: extra });
porPaquetes("Galletas choco chip", "Masitas", [
  { etiqueta: "paquete de 14 mini", piezas: 14, precio: 58, porPieza: galleta("Masa de galleta choco chip", 15), empaque: caja },
  { etiqueta: "paquete de 4 medianas", piezas: 4, precio: 40, porPieza: galleta("Masa de galleta choco chip", 45), empaque: caja },
  { etiqueta: "mini por unidad (mayoreo, desde 30)", piezas: 1, precio: 4, porPieza: galleta("Masa de galleta choco chip", 15), empaque: suelta },
]);
porPaquetes("Galletas brownie de plátano", "Masitas", [
  { etiqueta: "paquete de 12 mini", piezas: 12, precio: 50, porPieza: galleta("Masa de galleta brownie de plátano", 15), empaque: caja },
  { etiqueta: "paquete de 4 medianas", piezas: 4, precio: 38, porPieza: galleta("Masa de galleta brownie de plátano", 45), empaque: caja },
  { etiqueta: "mini por unidad (mayoreo, desde 30)", piezas: 1, precio: 4, porPieza: galleta("Masa de galleta brownie de plátano", 15), empaque: suelta },
]);
porPaquetes("Galletas de arroz y almendra", "Masitas", [
  { etiqueta: "paquete de 4 medianas", piezas: 4, precio: 45, porPieza: galleta("Masa de galleta de arroz y almendra", 45), empaque: caja },
  { etiqueta: "paquete de 6 medianas", piezas: 6, precio: 60, porPieza: galleta("Masa de galleta de arroz y almendra", 45), empaque: caja },
]);
porPaquetes("Galletas proteicas de lenteja", "Masitas", [
  { etiqueta: "paquete de 15 mini", piezas: 15, precio: 53, porPieza: galleta("Masa de galleta de lenteja", 15), empaque: caja },
  { etiqueta: "paquete de 5 medianas", piezas: 5, precio: 47, porPieza: galleta("Masa de galleta de lenteja", 45), empaque: caja },
  { etiqueta: "mini por unidad (mayoreo, desde 30)", piezas: 1, precio: 4, porPieza: galleta("Masa de galleta de lenteja", 15), empaque: suelta },
]);
const muffin = (sabor: Receta): Parte => ({ mezclas: { "Masa de muffin nutritivo": 70 }, insumos: { ...sabor, Pirotines: 1 } });
for (const [sabor, extra, p4, p6] of [
  ["limón", { Limón: 10, "Yogur griego": 10 }, 36, 54],
  ["arándanos", { Arándanos: 15, "Yogur griego": 10 }, 36, 54],
  ["plátano", { Plátano: 25, "Yogur griego": 10 }, 35, 53],
] as const) {
  porPaquetes(`Muffins nutritivos de ${sabor}`, "Masitas", [
    { etiqueta: "paquete de 4", piezas: 4, precio: p4, porPieza: muffin(extra), empaque: caja },
    { etiqueta: "paquete de 6", piezas: 6, precio: p6, porPieza: muffin(extra), empaque: caja },
  ]);
}
const rolMediano: Parte = { mezclas: { "Masa de avena para roles": 70 }, insumos: { "Yogur griego": 15, "Chips de chocolate semiamargo": 3, Frutilla: 5 } };
porPaquetes("Roles medianos con toppings", "Masitas", [
  { etiqueta: "paquete de 4", piezas: 4, precio: 36, porPieza: rolMediano, empaque: caja },
  { etiqueta: "paquete de 6", piezas: 6, precio: 54, porPieza: rolMediano, empaque: caja },
  { etiqueta: "unidad (mayoreo, desde 20)", piezas: 1, precio: 8, porPieza: rolMediano, empaque: suelta },
]);
porPaquetes("Donitas de quinua", "Masitas", [
  { etiqueta: "paquete de 12", piezas: 12, precio: 36, porPieza: { mezclas: { "Masa de donitas de quinua": 30 } }, empaque: caja },
  { etiqueta: "paquete de 12 bañadas en chocolate", piezas: 12, precio: 43, porPieza: { mezclas: { "Masa de donitas de quinua": 30 }, insumos: { "Chocolate semiamargo": 6 } }, empaque: caja },
]);
porPaquetes("Bocaditos dulces de quinua", "Masitas", [
  { etiqueta: "12 de quinua y zanahoria", piezas: 12, precio: 36, porPieza: { mezclas: { "Masa de bocaditos de quinua": 25 } }, empaque: caja },
  { etiqueta: "12 de quinua, chocolate y zanahoria", piezas: 12, precio: 40, porPieza: { mezclas: { "Masa de bocaditos de quinua": 25 }, insumos: { "Cocoa amarga": 2, "Chocolate semiamargo": 3 } }, empaque: caja },
]);
porPaquetes("Rosquitas de cañahua", "Masitas", [
  { etiqueta: "paquete de 12", piezas: 12, precio: 43, porPieza: { mezclas: { "Masa de rosquitas de cañahua": 35 } }, empaque: caja },
]);
const alfajor: Parte = { mezclas: { "Masa de arroz": 25, "Crema pastelera de cocoa": 10 }, insumos: { "Coco rallado": 2 } };
porPaquetes("Alfajores de arroz", "Masitas", [
  { etiqueta: "paquete de 12", piezas: 12, precio: 54, porPieza: alfajor, empaque: caja },
  { etiqueta: "paquete de 20", piezas: 20, precio: 94, porPieza: alfajor, empaque: caja },
]);
const tartaleta = (fruta: Receta): Parte => ({ mezclas: { "Masa de arroz": 45, "Crema pastelera de maicena": 50 }, insumos: { "Yogur griego": 10, ...fruta } });
porPaquetes("Tartaletas de arroz y yogur", "Masitas", [
  { etiqueta: "3 de limón", piezas: 3, precio: 45, porPieza: tartaleta({ Limón: 10 }), empaque: caja },
  { etiqueta: "3 de naranja", piezas: 3, precio: 46, porPieza: tartaleta({ Naranja: 15 }), empaque: caja },
  { etiqueta: "3 de frutilla", piezas: 3, precio: 48, porPieza: tartaleta({ Frutilla: 20 }), empaque: caja },
]);

// Postres nutritivos (pp. 17-19)
porPersonas("Cheesecake de arándanos", "Postres", { 4: 68, 8: 115, 15: 260 }, { mezclas: { "Base de galleta de almendra y avena": 25, "Mezcla de cheesecake": 70, "Mermelada de arándanos": 15 } });
porPersonas("Cheesecake de frutilla", "Postres", { 4: 60, 8: 108, 15: 255 }, { mezclas: { "Base de galleta de almendra y avena": 25, "Mezcla de cheesecake": 70, "Mermelada de frutilla": 15 } });
porPersonas("Cheesecake probiótico", "Postres", { 4: 70, 8: 115, 15: 270 }, { mezclas: { "Masa de arroz": 25, "Mezcla de cheesecake probiótico": 80 }, insumos: { "Avena en hojuelas sin gluten": 3 } });
porPersonas("Tarta vasca", "Postres", { 3: 60, 5: 80 }, { mezclas: { "Mezcla de tarta vasca": 110, "Mermelada de arándanos": 15 } });
porPersonas("Gelatina de arándanos con yogur", "Postres", { 10: 80 }, { mezclas: { "Gelatina de yogur": 90 }, insumos: { Arándanos: 15 } });
porPersonas("Gelatina de frutilla con yogur", "Postres", { 10: 80 }, { mezclas: { "Gelatina de yogur": 90 }, insumos: { Frutilla: 15 } });
productos.push({
  nombre: "Budín de yogur y yuca · 8 porciones",
  categoria: "Postres",
  precio: 55,
  receta: { mezclas: { "Mezcla de budín de yogur y yuca": 720, "Granola de semillas": 40 } },
  empaque: { "Caja de torta mediana": 1, "Etiqueta Rainbow": 1 },
});

// Panes nutritivos (pp. 20-21)
const arepa: Parte = { mezclas: { "Masa de pan de avena y yuca": 60 } };
porPaquetes("Arepas de yuca y avena", "Panes", [
  { etiqueta: "bolsa de 9", piezas: 9, precio: 26, porPieza: arepa, empaque: bolsa },
  { etiqueta: "bolsa de 12", piezas: 12, precio: 36, porPieza: arepa, empaque: bolsa },
]);
porPaquetes("Pan de lenteja", "Panes", [
  { etiqueta: "bolsa de 5 grandes", piezas: 5, precio: 38, porPieza: { mezclas: { "Masa de pan de lenteja": 100 } }, empaque: bolsa },
  { etiqueta: "bolsa de 12 minis", piezas: 12, precio: 38, porPieza: { mezclas: { "Masa de pan de lenteja": 40 } }, empaque: bolsa },
]);
productos.push({
  nombre: "Pan de fibra · barra de 22 cm",
  categoria: "Panes",
  precio: 55,
  receta: { mezclas: { "Masa de pan de fibra": 550, "Granola de semillas": 30 } },
  empaque: bolsa,
});

// Bocaditos nutritivos (p. 22)
porPaquetes("Albóndigas vegetarianas", "Bocaditos", [
  { etiqueta: "12 con salsa", piezas: 12, precio: 30, porPieza: { mezclas: { "Mezcla vegetariana de garbanzo y quinua": 25, "Salsa de tomate casera": 12 } }, empaque: { "Caja de masitas": 1, "Envase para salsa": 1, "Etiqueta Rainbow": 1 } },
  { etiqueta: "22 con salsa", piezas: 22, precio: 54, porPieza: { mezclas: { "Mezcla vegetariana de garbanzo y quinua": 25, "Salsa de tomate casera": 12 } }, empaque: { "Caja de masitas": 1, "Envase para salsa": 1, "Etiqueta Rainbow": 1 } },
]);
porPaquetes("Mini hamburguesas vegetarianas", "Bocaditos", [
  { etiqueta: "docena", piezas: 12, precio: 50, porPieza: { mezclas: { "Masa de pan de avena y yuca": 40, "Mezcla vegetariana de garbanzo y quinua": 30 }, insumos: { Queso: 10 } }, empaque: caja },
]);

// ---------- Carga ----------

// Lo que rinde una tanda: suma de lo que pesa (huevo ≈ 50 g) menos un 8 % que se pierde al hornear o cocinar.
const PESO_HUEVO = 50;
const rendimiento = (r: Receta) =>
  Math.round(Object.entries(r).reduce((t, [insumo, cantidad]) => t + (insumo === "Huevo" ? cantidad * PESO_HUEVO : cantidad), 0) * 0.92);

async function borrarLoAnterior(tx: Prisma.TransactionClient) {
  // En orden: primero lo que apunta a otras tablas.
  const borrados = {
    atenciones: (await tx.atencion.deleteMany()).count,
    lineasDePedido: (await tx.pedidoLinea.deleteMany()).count,
    pedidos: (await tx.pedido.deleteMany()).count,
    preciosDeCliente: (await tx.precioCliente.deleteMany()).count,
    ventasAnteriores: (await tx.ventaHistorica.deleteMany()).count,
    gastos: (await tx.gastoOperativo.deleteMany()).count,
    movimientosDeStock: (await tx.movimientoInventario.deleteMany()).count,
    ventas: (await tx.venta.deleteMany()).count,
    subRecetas: (await tx.componenteReceta.deleteMany()).count,
    ingredientes: (await tx.ingredienteReceta.deleteMany()).count,
    productos: (await tx.producto.deleteMany()).count,
    insumos: (await tx.insumo.deleteMany()).count,
    clientes: (await tx.cliente.deleteMany()).count,
    ajustes: (await tx.configuracion.deleteMany({ where: { clave: { in: ["finanzas.gastosFijosMensuales"] } } })).count,
  };
  console.log("Borrado lo de la repostera anterior:", borrados);
}

async function cargarRainbow(tx: Prisma.TransactionClient) {
  const insumos = new Map<string, number>();
  for (const [lista, categoria] of [
    [MATERIAS, MATERIA_PRIMA],
    [EMPAQUES, EMPAQUE],
  ] as const) {
    for (const [nombre, unidadBase, contenido, precio] of lista) {
      const { id } = await tx.insumo.create({
        data: { nombre, categoria, unidadBase, contenidoEnvase: D(contenido), precioEnvase: D(precio) },
      });
      insumos.set(nombre, id);
    }
  }
  const idInsumo = (nombre: string) => {
    const id = insumos.get(nombre);
    if (id === undefined) throw new Error(`Falta el insumo «${nombre}».`);
    return id;
  };
  const ingredientes = (r: Receta) =>
    Object.entries(r)
      .filter(([, cantidad]) => cantidad > 0)
      .map(([nombre, cantidad]) => ({ insumoId: idInsumo(nombre), cantidad: D(cantidad) }));

  const mezclas = new Map<string, number>();
  for (const m of MEZCLAS) {
    const { id } = await tx.producto.create({
      data: {
        nombre: m.nombre,
        categoria: m.categoria,
        tipo: TipoProducto.INTERMEDIO,
        rendimientoReceta: D(rendimiento(m.ingredientes)),
        unidadRendimiento: GRAMO,
        precioVenta: null,
        ingredientes: { create: ingredientes(m.ingredientes) },
      },
    });
    mezclas.set(m.nombre, id);
  }

  for (const p of productos) {
    const juntos: Receta = { ...p.receta.insumos };
    for (const [nombre, cantidad] of Object.entries(p.empaque)) juntos[nombre] = (juntos[nombre] ?? 0) + cantidad;
    await tx.producto.create({
      data: {
        nombre: p.nombre,
        categoria: p.categoria,
        tipo: TipoProducto.VENTA,
        // Tamaños (D118): «Torta de limón · 8 personas» → grupo «Torta de limón», tamaño «8 personas».
        ...(p.nombre.includes(" · ")
          ? { grupo: p.nombre.split(" · ")[0], tamano: p.nombre.split(" · ").slice(1).join(" · ") }
          : {}),
        rendimientoReceta: D(1), // una tanda = lo que se vende (una torta, un paquete)
        unidadRendimiento: UNIDAD,
        precioVenta: D(p.precio),
        ingredientes: { create: ingredientes(juntos) },
        subRecetas: {
          create: Object.entries(p.receta.mezclas ?? {}).map(([nombre, gramos]) => {
            const id = mezclas.get(nombre);
            if (id === undefined) throw new Error(`Falta la mezcla «${nombre}».`);
            return { subProductoId: id, cantidad: D(gramos) };
          }),
        },
      },
    });
  }
  const porCategoria = productos.reduce<Record<string, number>>((t, p) => ({ ...t, [p.categoria]: (t[p.categoria] ?? 0) + 1 }), {});
  console.log(`Rainbow cargado: ${insumos.size} insumos, ${mezclas.size} masas/rellenos, ${productos.length} productos`, porCategoria);
}

async function main() {
  if (!process.argv.includes("--confirmar")) {
    console.log("Esto BORRA todas las ventas, pedidos, clientes, recetas e insumos. Corre con --confirmar (y haz `npm run backup` antes).");
    return;
  }
  await prisma.$transaction(
    async (tx) => {
      await borrarLoAnterior(tx);
      await cargarRainbow(tx);
      // Nombre del negocio (D117): la dueña lo puede cambiar desde el ERP.
      await tx.configuracion.upsert({
        where: { clave: "negocio.nombre" },
        create: { clave: "negocio.nombre", valor: "Pastelería Rainbow" },
        update: { valor: "Pastelería Rainbow" },
      });
    },
    { timeout: 120_000 },
  );
  await prisma.$executeRawUnsafe("VACUUM");
  console.log("Base compactada.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
