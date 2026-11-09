// Seed de la línea Queques con datos fijos de los Excel de Dulzura.
// Precios: Control_Dulzura_Costos_Ventas_Inventario.xlsx (D16). Recetas: Dulzura ondrive (1).xlsx.
// Fuente y decisiones: CONTEXT.md (§1 decisiones D1–D16, §2 precios, §3 recetas).
// Es idempotente: se puede ejecutar varias veces sin duplicar datos.

import {
  PrismaClient,
  Prisma,
  CategoriaInsumo,
  TipoProducto,
  TipoCliente,
  TipoMovimiento,
  UnidadMedida,
} from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { registrarMovimiento } from "../../backend/src/services/inventario";

const prisma = new PrismaClient();
const D = (valor: string | number): Prisma.Decimal => new Prisma.Decimal(valor);

// ---------- Insumos ----------
// Envase real de la hoja Ingredientes del Excel de control (D16); el comentario indica su fila.
// "excel anterior" = el insumo no figura en el Excel de control y conserva el envase equivalente (D1).

interface InsumoSeed {
  nombre: string;
  categoria: CategoriaInsumo;
  unidadBase: UnidadMedida;
  contenidoEnvase: string;
  precioEnvase: string;
  sinStock?: true; // «No llevar stock» (D40): siempre hay, no se cuenta
}

const { GRAMO, MILILITRO, UNIDAD } = UnidadMedida;
const { MATERIA_PRIMA, EMPAQUE, GASTO_INDIRECTO } = CategoriaInsumo;

const insumos: InsumoSeed[] = [
  { nombre: "Harina", categoria: MATERIA_PRIMA, unidadBase: GRAMO, contenidoEnvase: "50000", precioEnvase: "320" }, // ING001
  { nombre: "Azúcar", categoria: MATERIA_PRIMA, unidadBase: GRAMO, contenidoEnvase: "46000", precioEnvase: "280" }, // ING002
  { nombre: "Huevo", categoria: MATERIA_PRIMA, unidadBase: UNIDAD, contenidoEnvase: "300", precioEnvase: "200" }, // ING003
  { nombre: "Aceite", categoria: MATERIA_PRIMA, unidadBase: GRAMO, contenidoEnvase: "16500", precioEnvase: "265" }, // ING004 Aceite o margarina
  { nombre: "Leche", categoria: MATERIA_PRIMA, unidadBase: MILILITRO, contenidoEnvase: "1000", precioEnvase: "8" }, // ING005
  { nombre: "Esencia", categoria: MATERIA_PRIMA, unidadBase: MILILITRO, contenidoEnvase: "1000", precioEnvase: "60" }, // ING006 Esencia de vainilla
  { nombre: "Almendra", categoria: MATERIA_PRIMA, unidadBase: GRAMO, contenidoEnvase: "1000", precioEnvase: "90" }, // ING011 Nueces / almendras
  { nombre: "Etiqueta", categoria: EMPAQUE, unidadBase: UNIDAD, contenidoEnvase: "1", precioEnvase: "0.5" }, // ING012 Empaque/etiqueta
  { nombre: "Polvo de hornear", categoria: MATERIA_PRIMA, unidadBase: GRAMO, contenidoEnvase: "1000", precioEnvase: "32" }, // ING014
  { nombre: "Coco", categoria: MATERIA_PRIMA, unidadBase: GRAMO, contenidoEnvase: "1000", precioEnvase: "90" }, // ING016 Coco rayado
  { nombre: "Platillo", categoria: EMPAQUE, unidadBase: UNIDAD, contenidoEnvase: "1", precioEnvase: "0.35" }, // ING017 Platillos Obleas 18cm
  { nombre: "Maicena", categoria: MATERIA_PRIMA, unidadBase: GRAMO, contenidoEnvase: "1000", precioEnvase: "8" }, // ING019
  { nombre: "Leche en polvo", categoria: MATERIA_PRIMA, unidadBase: GRAMO, contenidoEnvase: "2000", precioEnvase: "120" }, // ING020
  { nombre: "Leche condensada", categoria: MATERIA_PRIMA, unidadBase: GRAMO, contenidoEnvase: "395", precioEnvase: "10" }, // ING021 (lata de 395)
  { nombre: "Mantequilla", categoria: MATERIA_PRIMA, unidadBase: GRAMO, contenidoEnvase: "1000", precioEnvase: "25" }, // excel anterior
  { nombre: "Agua", categoria: MATERIA_PRIMA, unidadBase: MILILITRO, contenidoEnvase: "600", precioEnvase: "1", sinStock: true }, // excel anterior; agua de la casa
  { nombre: "Yogurt", categoria: MATERIA_PRIMA, unidadBase: GRAMO, contenidoEnvase: "1000", precioEnvase: "20" }, // excel anterior
  { nombre: "Harina de quinoa", categoria: MATERIA_PRIMA, unidadBase: GRAMO, contenidoEnvase: "1000", precioEnvase: "15.5" }, // excel anterior
  { nombre: "Azúcar glas", categoria: MATERIA_PRIMA, unidadBase: GRAMO, contenidoEnvase: "1000", precioEnvase: "18" }, // excel anterior
  { nombre: "Frutilla", categoria: MATERIA_PRIMA, unidadBase: GRAMO, contenidoEnvase: "1000", precioEnvase: "15" }, // excel anterior
  { nombre: "Crema de leche", categoria: MATERIA_PRIMA, unidadBase: GRAMO, contenidoEnvase: "1000", precioEnvase: "12.5" }, // excel anterior
  { nombre: "Leche Nido", categoria: MATERIA_PRIMA, unidadBase: GRAMO, contenidoEnvase: "1000", precioEnvase: "200" }, // excel anterior
  { nombre: "Chantimix", categoria: MATERIA_PRIMA, unidadBase: GRAMO, contenidoEnvase: "1000", precioEnvase: "21" }, // excel anterior
  { nombre: "Envase queque", categoria: EMPAQUE, unidadBase: UNIDAD, contenidoEnvase: "1", precioEnvase: "0.5" }, // excel anterior
  { nombre: "Caja queque con relleno", categoria: EMPAQUE, unidadBase: UNIDAD, contenidoEnvase: "1", precioEnvase: "3" }, // excel anterior
  { nombre: "Limpieza y otros", categoria: GASTO_INDIRECTO, unidadBase: UNIDAD, contenidoEnvase: "1", precioEnvase: "1", sinStock: true }, // excel anterior
  // Fase 6 — Brownies (hoja "Cosoto Bronies"; envase equivalente al Bs/unidad del Excel, D1).
  { nombre: "Chocolate", categoria: MATERIA_PRIMA, unidadBase: GRAMO, contenidoEnvase: "1000", precioEnvase: "30" },
  { nombre: "Cocoa", categoria: MATERIA_PRIMA, unidadBase: GRAMO, contenidoEnvase: "500", precioEnvase: "25" },
  { nombre: "Chocolate blanco", categoria: MATERIA_PRIMA, unidadBase: GRAMO, contenidoEnvase: "1000", precioEnvase: "30" },
  { nombre: "Nutella", categoria: MATERIA_PRIMA, unidadBase: GRAMO, contenidoEnvase: "1000", precioEnvase: "57" }, // D18
  { nombre: "Topping Nido", categoria: MATERIA_PRIMA, unidadBase: GRAMO, contenidoEnvase: "1000", precioEnvase: "30" }, // D18
  { nombre: "Bolsa brownie", categoria: EMPAQUE, unidadBase: UNIDAD, contenidoEnvase: "16", precioEnvase: "4.8" },
  { nombre: "Caja brownie", categoria: EMPAQUE, unidadBase: UNIDAD, contenidoEnvase: "1", precioEnvase: "3" }, // D19
  { nombre: "Envase brownie personal", categoria: EMPAQUE, unidadBase: UNIDAD, contenidoEnvase: "1", precioEnvase: "1" }, // D19
  // Fase 6 — Flanes (hoja "Flanes"; envase equivalente al Bs/unidad del Excel, D1).
  { nombre: "Queso crema", categoria: MATERIA_PRIMA, unidadBase: GRAMO, contenidoEnvase: "1000", precioEnvase: "80" },
  { nombre: "Dulce de leche", categoria: MATERIA_PRIMA, unidadBase: GRAMO, contenidoEnvase: "1000", precioEnvase: "30" },
  { nombre: "Ron", categoria: MATERIA_PRIMA, unidadBase: MILILITRO, contenidoEnvase: "1000", precioEnvase: "50" },
  { nombre: "Envase flan", categoria: EMPAQUE, unidadBase: UNIDAD, contenidoEnvase: "10", precioEnvase: "12" },
  // Fase 7 — Tres leches, fresas y toppings (hoja "Costos"; envase equivalente al Bs/unidad del Excel, D1).
  { nombre: "Leche evaporada", categoria: MATERIA_PRIMA, unidadBase: GRAMO, contenidoEnvase: "1000", precioEnvase: "10" },
  { nombre: "Salsa de frutilla", categoria: MATERIA_PRIMA, unidadBase: GRAMO, contenidoEnvase: "1000", precioEnvase: "50" },
  { nombre: "Mousse de frutos rojos", categoria: MATERIA_PRIMA, unidadBase: GRAMO, contenidoEnvase: "1000", precioEnvase: "57" },
  { nombre: "Envase fresas", categoria: EMPAQUE, unidadBase: UNIDAD, contenidoEnvase: "1", precioEnvase: "2.3" },
  { nombre: "Envase tres leches personal", categoria: EMPAQUE, unidadBase: UNIDAD, contenidoEnvase: "1", precioEnvase: "1" },
  { nombre: "Envase tres leches", categoria: EMPAQUE, unidadBase: UNIDAD, contenidoEnvase: "1", precioEnvase: "2.8" },
  { nombre: "Envase tres leches familiar", categoria: EMPAQUE, unidadBase: UNIDAD, contenidoEnvase: "1", precioEnvase: "7" },
  { nombre: "Envase tres leches mega", categoria: EMPAQUE, unidadBase: UNIDAD, contenidoEnvase: "1", precioEnvase: "8" },
];

// ---------- Stock de prueba ----------
// FICTICIO: la dueña todavía no hizo el conteo real. Sirve para probar ventas y alertas.
// Se carga como AJUSTE por la diferencia (queda en la bitácora; las ventas previas se respetan).
// Se salta el insumo si ya tiene un mínimo o alguna COMPRA/AJUSTE (un conteo o compra real, o una
// carga anterior), así volver a correr el seed nunca pisa datos reales. Se desactiva con SEED_STOCK_PRUEBA=false.
// Polvo de hornear y Caja queque con relleno quedan bajo el mínimo, y Frutilla en 0, a propósito:
// así el dashboard muestra alertas amarillas y roja.
const NOTA_STOCK_PRUEBA = "Stock inicial de prueba (ficticio, reemplazar con el conteo real)";

const stockPrueba: Record<string, { actual: string; minimo: string }> = {
  Harina: { actual: "25000", minimo: "5000" },
  Azúcar: { actual: "15000", minimo: "3000" },
  Huevo: { actual: "120", minimo: "30" },
  Aceite: { actual: "8000", minimo: "2000" },
  Leche: { actual: "6000", minimo: "1500" },
  Esencia: { actual: "200", minimo: "50" },
  Almendra: { actual: "1500", minimo: "300" },
  Etiqueta: { actual: "150", minimo: "50" },
  "Polvo de hornear": { actual: "80", minimo: "250" }, // bajo el mínimo
  Coco: { actual: "1200", minimo: "300" },
  Platillo: { actual: "60", minimo: "20" },
  Maicena: { actual: "2000", minimo: "500" },
  "Leche en polvo": { actual: "2000", minimo: "500" },
  "Leche condensada": { actual: "2370", minimo: "790" }, // 6 latas, mínimo 2
  Mantequilla: { actual: "3000", minimo: "750" },
  Yogurt: { actual: "2000", minimo: "500" },
  "Harina de quinoa": { actual: "3000", minimo: "1000" },
  "Azúcar glas": { actual: "1500", minimo: "300" },
  Frutilla: { actual: "0", minimo: "500" }, // sin stock
  "Crema de leche": { actual: "2000", minimo: "500" },
  "Leche Nido": { actual: "1200", minimo: "400" },
  Chantimix: { actual: "1000", minimo: "250" },
  "Envase queque": { actual: "100", minimo: "30" },
  "Caja queque con relleno": { actual: "8", minimo: "20" }, // bajo el mínimo
  Chocolate: { actual: "2000", minimo: "500" },
  Cocoa: { actual: "500", minimo: "100" },
  "Chocolate blanco": { actual: "1000", minimo: "200" },
  Nutella: { actual: "1000", minimo: "250" },
  "Topping Nido": { actual: "1000", minimo: "250" },
  "Bolsa brownie": { actual: "48", minimo: "16" },
  "Caja brownie": { actual: "20", minimo: "5" },
  "Envase brownie personal": { actual: "30", minimo: "10" },
  "Queso crema": { actual: "1000", minimo: "250" },
  "Dulce de leche": { actual: "1000", minimo: "200" },
  Ron: { actual: "500", minimo: "100" },
  "Envase flan": { actual: "30", minimo: "10" },
  "Leche evaporada": { actual: "3000", minimo: "800" },
  "Salsa de frutilla": { actual: "500", minimo: "100" },
  "Mousse de frutos rojos": { actual: "500", minimo: "100" },
  "Envase fresas": { actual: "40", minimo: "10" },
  "Envase tres leches personal": { actual: "30", minimo: "10" },
  "Envase tres leches": { actual: "20", minimo: "5" },
  "Envase tres leches familiar": { actual: "10", minimo: "3" },
  "Envase tres leches mega": { actual: "10", minimo: "3" },
};

// ---------- Productos y recetas ----------

type Cantidades = Record<string, Prisma.Decimal>;

interface ProductoSeed {
  nombre: string;
  categoria: string;
  tipo: TipoProducto;
  rendimientoReceta: Prisma.Decimal;
  unidadRendimiento: UnidadMedida;
  precioVenta: Prisma.Decimal | null;
  activo: boolean;
  ingredientes: Cantidades; // nombre de insumo -> cantidad por tanda
  subRecetas: Cantidades; // nombre de producto INTERMEDIO -> cantidad por tanda
}

// Receta 24/09 (D8). Los huevos suman 3 de la masa + 1 del glaseado.
const masaQueque2409: Cantidades = {
  Aceite: D(140),
  Azúcar: D(180),
  Agua: D(140),
  Esencia: D(50), // D15
  "Polvo de hornear": D(50), // D14
  Harina: D(260),
  "Leche en polvo": D(20),
  Coco: D(50), // S6
  "Azúcar glas": D(100),
  Huevo: D(4),
};

const FACTOR_MOLDE_GRANDE = D("3.2");
const rendimientoQueque2409 = D("880.4").div(700);
const rendimientoMoldeGrande = D("2817.28").div(800);

// Brownies (D20): la receta base es un INTERMEDIO medido en gramos; cada brownie pesa 80 g
// (Excel: 743 g / 80 = 9.2875 brownies por tanda). Los packs se venden por caja (rinde 1).
const GRAMOS_POR_BROWNIE = 80;
const brownies = (unidades: number): Prisma.Decimal => D(GRAMOS_POR_BROWNIE * unidades);
const masaBrownie: Cantidades = {
  Chocolate: D(200),
  Mantequilla: D(110),
  Huevo: D(3),
  Azúcar: D(200),
  Harina: D(65),
  Cocoa: D(25),
  Esencia: D(20), // "Vainilla" en el Excel
};
const FACTOR_BROWNIES_16 = D("2.45"); // Excel H20

const escalar = (receta: Cantidades, factor: Prisma.Decimal): Cantidades =>
  Object.fromEntries(Object.entries(receta).map(([nombre, cantidad]) => [nombre, cantidad.mul(factor)]));

const productos: ProductoSeed[] = [
  {
    nombre: "Relleno de Nido",
    categoria: "Rellenos",
    tipo: TipoProducto.INTERMEDIO,
    rendimientoReceta: D(1240),
    unidadRendimiento: GRAMO,
    precioVenta: null,
    activo: true,
    ingredientes: {
      "Leche condensada": D(400),
      "Crema de leche": D(400),
      "Leche Nido": D(40),
      Leche: D(50),
      Chantimix: D(400), // D13
      "Limpieza y otros": D("0.5"),
    },
    subRecetas: {},
  },
  {
    nombre: "Relleno de Brigadeiro",
    categoria: "Rellenos",
    tipo: TipoProducto.INTERMEDIO,
    rendimientoReceta: D("1090.5"),
    unidadRendimiento: GRAMO,
    precioVenta: null,
    activo: true,
    ingredientes: {
      "Leche condensada": D(400),
      "Crema de leche": D(400),
      "Leche Nido": D(40),
      Leche: D(50),
      Chantimix: D(200),
      "Limpieza y otros": D("0.5"),
    },
    subRecetas: {},
  },
  {
    nombre: "Queque",
    categoria: "Queques",
    tipo: TipoProducto.VENTA,
    rendimientoReceta: rendimientoQueque2409,
    unidadRendimiento: UNIDAD,
    precioVenta: D(16),
    activo: true,
    ingredientes: {
      ...masaQueque2409,
      "Envase queque": rendimientoQueque2409,
      Etiqueta: rendimientoQueque2409,
      "Limpieza y otros": D("0.5"),
    },
    subRecetas: {},
  },
  {
    nombre: "Queque molde grande",
    categoria: "Queques",
    tipo: TipoProducto.VENTA,
    rendimientoReceta: rendimientoMoldeGrande,
    unidadRendimiento: UNIDAD,
    precioVenta: D(16),
    activo: true,
    ingredientes: {
      ...escalar(masaQueque2409, FACTOR_MOLDE_GRANDE),
      "Envase queque": rendimientoMoldeGrande,
      Etiqueta: rendimientoMoldeGrande,
      "Limpieza y otros": D("0.5"),
    },
    subRecetas: {},
  },
  {
    nombre: "Queque de quinoa",
    categoria: "Queques",
    tipo: TipoProducto.VENTA,
    rendimientoReceta: D(4),
    unidadRendimiento: UNIDAD,
    precioVenta: D(20),
    activo: true,
    ingredientes: {
      Mantequilla: D(100),
      Aceite: D(60),
      Yogurt: D(160),
      Azúcar: D(180),
      Huevo: D(4),
      Esencia: D(10),
      "Polvo de hornear": D(5),
      "Harina de quinoa": D(250),
      Agua: D(50),
      Platillo: D("0.5"),
      Etiqueta: D("0.5"),
      "Limpieza y otros": D("0.5"),
    },
    subRecetas: {},
  },
  {
    nombre: "Queque con relleno",
    categoria: "Queques",
    tipo: TipoProducto.VENTA,
    rendimientoReceta: D(2),
    unidadRendimiento: UNIDAD,
    precioVenta: D(45),
    activo: true,
    ingredientes: {
      Aceite: D(160),
      Azúcar: D(180),
      Huevo: D(4),
      Esencia: D(50), // D15
      "Polvo de hornear": D(50), // D14
      Harina: D(250),
      "Leche en polvo": D(20),
      Agua: D(160),
      Frutilla: D(100),
      "Caja queque con relleno": D(2),
      Etiqueta: D(2),
      "Limpieza y otros": D("0.5"),
    },
    subRecetas: {
      "Relleno de Nido": D(350),
      "Relleno de Brigadeiro": D(350),
    },
  },
  {
    // Histórico (D8): reemplazado por la receta 24/09.
    nombre: "Queque base (histórico)",
    categoria: "Queques",
    tipo: TipoProducto.VENTA,
    rendimientoReceta: D(3090).div(650),
    unidadRendimiento: UNIDAD,
    precioVenta: D(12),
    activo: false,
    ingredientes: {
      Mantequilla: D(150),
      Azúcar: D(750),
      Huevo: D(8), // D6
      Esencia: D(50),
      "Polvo de hornear": D(50),
      Harina: D(1120),
      Almendra: D(50),
      Agua: D(600),
      Platillo: D("0.5"),
      Etiqueta: D("0.5"),
      "Limpieza y otros": D("0.5"),
    },
    subRecetas: {},
  },
  // ---------- Fase 6: Brownies (hoja "Cosoto Bronies") ----------
  {
    nombre: "Brownies (masa)",
    categoria: "Brownies",
    tipo: TipoProducto.INTERMEDIO,
    rendimientoReceta: D(743), // incluye los huevos a 40 g c/u (Excel F18)
    unidadRendimiento: GRAMO,
    precioVenta: null,
    activo: true,
    ingredientes: { ...masaBrownie, "Limpieza y otros": D("0.5") },
    subRecetas: {},
  },
  {
    nombre: "Brownies clásicos 4 u",
    categoria: "Brownies",
    tipo: TipoProducto.VENTA,
    rendimientoReceta: D(1),
    unidadRendimiento: UNIDAD,
    precioVenta: D(30),
    activo: true,
    ingredientes: { "Caja brownie": D(1), Etiqueta: D(1), "Limpieza y otros": D("0.5") },
    subRecetas: { "Brownies (masa)": brownies(4) },
  },
  {
    nombre: "Brownies premium 4 u",
    categoria: "Brownies",
    tipo: TipoProducto.VENTA,
    rendimientoReceta: D(1),
    unidadRendimiento: UNIDAD,
    precioVenta: D(38),
    activo: true,
    ingredientes: {
      Nutella: D(50),
      "Topping Nido": D(50),
      "Caja brownie": D(1),
      Etiqueta: D(1),
      "Limpieza y otros": D("0.5"),
    },
    subRecetas: { "Brownies (masa)": brownies(4) },
  },
  {
    nombre: "Brownies clásicos 9 u",
    categoria: "Brownies",
    tipo: TipoProducto.VENTA,
    rendimientoReceta: D(1),
    unidadRendimiento: UNIDAD,
    precioVenta: D(55),
    activo: true,
    ingredientes: { "Caja brownie": D(1), Etiqueta: D(1), "Limpieza y otros": D("0.5") },
    subRecetas: { "Brownies (masa)": brownies(9) },
  },
  {
    // El Excel muestra costo 0 por una fórmula rota (D21); aquí se suman sus componentes.
    nombre: "Brownies premium 9 u",
    categoria: "Brownies",
    tipo: TipoProducto.VENTA,
    rendimientoReceta: D(1),
    unidadRendimiento: UNIDAD,
    precioVenta: D(70),
    activo: true,
    ingredientes: {
      Nutella: D(150),
      "Topping Nido": D(150),
      "Caja brownie": D(1),
      Etiqueta: D(1),
      "Limpieza y otros": D("0.5"),
    },
    subRecetas: { "Brownies (masa)": brownies(9) },
  },
  {
    // Receta propia: la masa × 2.45 más empaque individual; se venden sueltos a 5 Bs.
    nombre: "Brownies 16 u",
    categoria: "Brownies",
    tipo: TipoProducto.VENTA,
    rendimientoReceta: D(16),
    unidadRendimiento: UNIDAD,
    precioVenta: D(5),
    activo: true,
    ingredientes: {
      ...escalar(masaBrownie, FACTOR_BROWNIES_16),
      "Bolsa brownie": D(16),
      Etiqueta: D(16),
      "Chocolate blanco": D(150),
      "Limpieza y otros": D("0.5"),
    },
    subRecetas: {},
  },
  {
    // Columna "BROWNIES Premium 9unid" de la derecha: en realidad es 1 brownie a 10 Bs (D19).
    nombre: "Brownie personal premium",
    categoria: "Brownies",
    tipo: TipoProducto.VENTA,
    rendimientoReceta: D(1),
    unidadRendimiento: UNIDAD,
    precioVenta: D(10),
    activo: true,
    ingredientes: {
      Nutella: D(20),
      "Envase brownie personal": D(1),
      Etiqueta: D(1),
      "Limpieza y otros": D("0.5"),
    },
    subRecetas: { "Brownies (masa)": brownies(1) },
  },
  // ---------- Fase 6: Flanes (hoja "Flanes", D23) ----------
  {
    // Flan + queque de chocolate en el mismo molde. Las cantidades repetidas se suman.
    nombre: "Chocoflan",
    categoria: "Flanes",
    tipo: TipoProducto.VENTA,
    rendimientoReceta: D(10),
    unidadRendimiento: UNIDAD,
    precioVenta: D(15),
    activo: true,
    ingredientes: {
      Huevo: D(11), // 6 flan + 5 queque
      Azúcar: D(400), // 250 flan + 150 queque
      "Leche condensada": D(395), // 1 lata
      Leche: D(600),
      Esencia: D(20), // "Vainilla": 10 flan + 10 queque
      "Queso crema": D(100),
      Harina: D(120),
      Cocoa: D(30),
      Mantequilla: D(150),
      "Dulce de leche": D(200),
      Frutilla: D(100),
      "Envase flan": D(10),
      Etiqueta: D(10),
    },
    subRecetas: {},
  },
  {
    nombre: "Quesillo venezolano",
    categoria: "Flanes",
    tipo: TipoProducto.VENTA,
    rendimientoReceta: D(8),
    unidadRendimiento: UNIDAD,
    precioVenta: D(15),
    activo: true,
    ingredientes: {
      Huevo: D(10),
      Azúcar: D(150),
      "Leche condensada": D(395), // 1 lata
      Leche: D(600),
      Esencia: D(10), // "Vainilla"
      "Leche en polvo": D(230),
      Ron: D(10),
      "Dulce de leche": D(200),
      Frutilla: D(100),
      "Envase flan": D(8),
      Etiqueta: D(8),
    },
    subRecetas: {},
  },
  // ---------- Fase 7: toppings, fresas y tres leches (hoja "Costos", D25–D30) ----------
  // Toppings: preparaciones en gramos (D25); rinden lo que pesan sus ingredientes.
  {
    nombre: "Topping tres leches personal",
    categoria: "Toppings",
    tipo: TipoProducto.INTERMEDIO,
    rendimientoReceta: D(250),
    unidadRendimiento: GRAMO,
    precioVenta: null,
    activo: true,
    ingredientes: { "Dulce de leche": D(100), "Mousse de frutos rojos": D(100), Chocolate: D(50) },
    subRecetas: {},
  },
  {
    nombre: "Topping tres leches",
    categoria: "Toppings",
    tipo: TipoProducto.INTERMEDIO,
    rendimientoReceta: D(500),
    unidadRendimiento: GRAMO,
    precioVenta: null,
    activo: true,
    ingredientes: { "Dulce de leche": D(400), Nutella: D(50), Leche: D(50) },
    subRecetas: {},
  },
  {
    nombre: "Topping tres leches grande",
    categoria: "Toppings",
    tipo: TipoProducto.INTERMEDIO,
    rendimientoReceta: D(900),
    unidadRendimiento: GRAMO,
    precioVenta: null,
    activo: true,
    ingredientes: { "Dulce de leche": D(800), Nutella: D(50), Leche: D(50) },
    subRecetas: {},
  },
  {
    nombre: "Topping tres leches mega",
    categoria: "Toppings",
    tipo: TipoProducto.INTERMEDIO,
    rendimientoReceta: D(1100),
    unidadRendimiento: GRAMO,
    precioVenta: null,
    activo: true,
    ingredientes: { "Dulce de leche": D(1000), Nutella: D(50), Leche: D(50) },
    subRecetas: {},
  },
  // Fresas: "Crema" = Crema de leche (D28); 3 brownies = 240 g de masa (D27).
  {
    nombre: "Fresas con crema",
    categoria: "Fresas",
    tipo: TipoProducto.VENTA,
    rendimientoReceta: D(1),
    unidadRendimiento: UNIDAD,
    precioVenta: D(20),
    activo: true,
    ingredientes: {
      Frutilla: D(150),
      "Salsa de frutilla": D(20),
      "Crema de leche": D(250),
      "Envase fresas": D(1),
      Etiqueta: D(1),
    },
    subRecetas: {},
  },
  {
    nombre: "Fresas con crema y brownie",
    categoria: "Fresas",
    tipo: TipoProducto.VENTA,
    rendimientoReceta: D(1),
    unidadRendimiento: UNIDAD,
    precioVenta: D(25),
    activo: true,
    ingredientes: { Frutilla: D(100), "Crema de leche": D(250), "Envase fresas": D(1), Etiqueta: D(1) },
    subRecetas: { "Brownies (masa)": brownies(3) },
  },
  {
    nombre: "Fresas con crema, brownie y Nutella",
    categoria: "Fresas",
    tipo: TipoProducto.VENTA,
    rendimientoReceta: D(1),
    unidadRendimiento: UNIDAD,
    precioVenta: D(30),
    activo: true,
    ingredientes: { Frutilla: D(100), Nutella: D(30), "Crema de leche": D(250), "Envase fresas": D(1), Etiqueta: D(1) },
    subRecetas: { "Brownies (masa)": brownies(3) },
  },
  {
    nombre: "Frutillas bañadas en chocolate",
    categoria: "Fresas",
    tipo: TipoProducto.VENTA,
    rendimientoReceta: D(1),
    unidadRendimiento: UNIDAD,
    precioVenta: D(25),
    activo: true,
    ingredientes: { Frutilla: D(300), Chocolate: D(200), "Crema de leche": D(100), "Envase fresas": D(1), Etiqueta: D(1) },
    subRecetas: {},
  },
  // Tres leches: la leche condensada en gramos (lata de 395 g); frutilla de decoración en gramos (D29).
  {
    // El Excel dice azúcar 1 y harina 3: se usa un tercio de la de tamaño normal (D26).
    nombre: "Tres leches personal",
    categoria: "Tres leches",
    tipo: TipoProducto.VENTA,
    rendimientoReceta: D(1),
    unidadRendimiento: UNIDAD,
    precioVenta: D(20),
    activo: true,
    ingredientes: {
      Huevo: D(1),
      Azúcar: D(30),
      Harina: D(30),
      Chantimix: D(150),
      Leche: D(50),
      "Leche condensada": D(50),
      "Leche evaporada": D(50),
      Frutilla: D(1),
      "Envase tres leches personal": D(1),
      Etiqueta: D(1),
      "Limpieza y otros": D("0.5"),
    },
    subRecetas: {},
  },
  {
    nombre: "Tres leches",
    categoria: "Tres leches",
    tipo: TipoProducto.VENTA,
    rendimientoReceta: D(1),
    unidadRendimiento: UNIDAD,
    precioVenta: D(55),
    activo: true,
    ingredientes: {
      Huevo: D(3),
      Azúcar: D(90),
      Harina: D(90),
      Chantimix: D(300),
      Leche: D(280),
      "Leche condensada": D(280),
      "Leche evaporada": D(280),
      Frutilla: D(10),
      "Envase tres leches": D(1),
      Etiqueta: D(1),
      "Limpieza y otros": D("0.5"),
    },
    subRecetas: {},
  },
  {
    nombre: "Tres leches familiar",
    categoria: "Tres leches",
    tipo: TipoProducto.VENTA,
    rendimientoReceta: D(1),
    unidadRendimiento: UNIDAD,
    precioVenta: D(95),
    activo: true,
    ingredientes: {
      Huevo: D(8),
      Azúcar: D(240),
      Harina: D(240),
      Chantimix: D(500),
      Leche: D(740),
      "Leche condensada": D(740),
      "Leche evaporada": D(740),
      Frutilla: D(50),
      "Envase tres leches familiar": D(1),
      Etiqueta: D(1),
      "Limpieza y otros": D("0.5"),
    },
    subRecetas: {},
  },
  {
    nombre: "Tres leches mega",
    categoria: "Tres leches",
    tipo: TipoProducto.VENTA,
    rendimientoReceta: D(1),
    unidadRendimiento: UNIDAD,
    precioVenta: D(125),
    activo: true,
    ingredientes: {
      Huevo: D(10),
      Azúcar: D(300),
      Harina: D(300),
      Chantimix: D(700),
      Leche: D(780),
      "Leche condensada": D(780),
      "Leche evaporada": D(780),
      Frutilla: D(80),
      "Envase tres leches mega": D(1),
      Etiqueta: D(1),
      "Limpieza y otros": D("0.5"),
    },
    subRecetas: {},
  },
];

// ---------- Carga ----------

const buscarId = <T>(mapa: Map<string, T>, nombre: string, tipo: string): T => {
  const id = mapa.get(nombre);
  if (id === undefined) {
    throw new Error(`${tipo} "${nombre}" no existe. Revisa los nombres en seed.ts.`);
  }
  return id;
};

async function seedInsumos(tx: Prisma.TransactionClient): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  for (const insumo of insumos) {
    const datos = {
      categoria: insumo.categoria,
      unidadBase: insumo.unidadBase,
      contenidoEnvase: D(insumo.contenidoEnvase),
      precioEnvase: D(insumo.precioEnvase),
    };
    const { id } = await tx.insumo.upsert({
      where: { nombre: insumo.nombre },
      create: { nombre: insumo.nombre, ...datos, controlaStock: !insumo.sinStock },
      update: datos, // no pisa stockActual, stockMinimo ni controlaStock (los decide la dueña)
    });
    ids.set(insumo.nombre, id);
  }
  return ids;
}

async function seedStockPrueba(tx: Prisma.TransactionClient, insumoIds: Map<string, number>): Promise<number> {
  let cargados = 0;
  for (const [nombre, stock] of Object.entries(stockPrueba)) {
    const insumoId = buscarId(insumoIds, nombre, "Insumo");
    const insumo = await tx.insumo.findUniqueOrThrow({ where: { id: insumoId } });
    const conteosOCompras = await tx.movimientoInventario.count({
      where: { insumoId, tipo: { in: [TipoMovimiento.AJUSTE, TipoMovimiento.COMPRA] } },
    });
    if (!insumo.stockMinimo.isZero() || conteosOCompras > 0) continue;
    await tx.insumo.update({ where: { id: insumoId }, data: { stockMinimo: D(stock.minimo) } });
    const diferencia = D(stock.actual).minus(insumo.stockActual);
    if (!diferencia.isZero()) {
      await registrarMovimiento(tx, { insumoId, tipo: TipoMovimiento.AJUSTE, cantidad: diferencia, nota: NOTA_STOCK_PRUEBA });
    }
    cargados++;
  }
  return cargados;
}

async function seedProductos(tx: Prisma.TransactionClient, insumoIds: Map<string, number>): Promise<void> {
  const productoIds = new Map<string, number>();

  // Los INTERMEDIOS van primero en el arreglo, así ya existen cuando otro producto los usa.
  for (const producto of productos) {
    const datos = {
      categoria: producto.categoria,
      tipo: producto.tipo,
      rendimientoReceta: producto.rendimientoReceta,
      unidadRendimiento: producto.unidadRendimiento,
      precioVenta: producto.precioVenta,
      activo: producto.activo,
    };
    const { id } = await tx.producto.upsert({
      where: { nombre: producto.nombre },
      create: { nombre: producto.nombre, ...datos },
      update: datos,
    });
    productoIds.set(producto.nombre, id);

    // La receta se reemplaza completa para que el seed refleje siempre CONTEXT.md.
    await tx.ingredienteReceta.deleteMany({ where: { productoId: id } });
    await tx.componenteReceta.deleteMany({ where: { productoId: id } });

    await tx.ingredienteReceta.createMany({
      data: Object.entries(producto.ingredientes).map(([nombre, cantidad]) => ({
        productoId: id,
        insumoId: buscarId(insumoIds, nombre, "Insumo"),
        cantidad,
      })),
    });

    const subRecetas = Object.entries(producto.subRecetas);
    if (subRecetas.length > 0) {
      await tx.componenteReceta.createMany({
        data: subRecetas.map(([nombre, cantidad]) => ({
          productoId: id,
          subProductoId: buscarId(productoIds, nombre, "Sub-receta"),
          cantidad,
        })),
      });
    }
  }
}

// ---------- Fase 8: listas de precios y clientes (notas de venta 2026, D33) ----------
// Solo se crean: si la dueña cambia un precio o un dato del cliente, el seed no lo pisa.
// Cada mayorista tiene su precio negociado por producto (D42); los minoristas pagan el precio de venta.
const clientes: { nombre: string; tipo: TipoCliente; precios?: Record<string, string>; direccion?: string }[] = [
  { nombre: "Mercado Primavera", tipo: TipoCliente.MAYORISTA, precios: { Queque: "12" }, direccion: "Mercado Primavera" },
  { nombre: "Eliana", tipo: TipoCliente.MAYORISTA, precios: { Queque: "13" } },
  { nombre: "Mostrador", tipo: TipoCliente.MINORISTA },
];

// Clientes minoristas del Excel 2024: los nombres de la columna «Cliente» de las ventas históricas (D37).
// «Venta esquina» no es una persona sino dónde se vendió, así que no se crea como cliente.
const NO_SON_CLIENTES = new Set(["Venta esquina"]);
function minoristasDelExcel(): string[] {
  const archivo = path.join(__dirname, "datos", "ventas-historicas-2024.json");
  // La carpeta datos/ no está en el repositorio (nombres reales): sin ella no se crean minoristas.
  if (!existsSync(archivo)) return [];
  const { ventas } = JSON.parse(readFileSync(archivo, "utf-8")) as { ventas: { cliente: string | null }[] };
  const nombres = ventas.map((v) => v.cliente?.trim() ?? "").filter((n) => n !== "" && !NO_SON_CLIENTES.has(n));
  return [...new Set(nombres)];
}

async function seedClientes(tx: Prisma.TransactionClient): Promise<void> {
  const productosPorNombre = new Map((await tx.producto.findMany()).map((p) => [p.nombre, p.id]));
  const minoristas = minoristasDelExcel()
    .filter((nombre) => !clientes.some((c) => c.nombre === nombre))
    .map((nombre) => ({ nombre, tipo: TipoCliente.MINORISTA, precios: undefined, direccion: undefined }));
  for (const cliente of [...clientes, ...minoristas]) {
    const { id } = await tx.cliente.upsert({
      where: { nombre: cliente.nombre },
      create: { nombre: cliente.nombre, tipo: cliente.tipo, direccion: cliente.direccion },
      update: {},
    });
    // No pisa un precio que la dueña ya haya cambiado.
    for (const [producto, precio] of Object.entries(cliente.precios ?? {})) {
      const productoId = buscarId(productosPorNombre, producto, "Producto");
      await tx.precioCliente.upsert({
        where: { clienteId_productoId: { clienteId: id, productoId } },
        create: { clienteId: id, productoId, precio: D(precio) },
        update: {},
      });
    }
  }
}

async function main(): Promise<void> {
  const conStockPrueba = process.env.SEED_STOCK_PRUEBA !== "false";
  const stockCargado = await prisma.$transaction(async (tx) => {
    const insumoIds = await seedInsumos(tx);
    await seedProductos(tx, insumoIds);
    await seedClientes(tx);
    return conStockPrueba ? seedStockPrueba(tx, insumoIds) : 0;
  });
  const [totalInsumos, totalProductos] = await Promise.all([prisma.insumo.count(), prisma.producto.count()]);
  console.log(`Seed completado: ${totalInsumos} insumos, ${totalProductos} productos.`);
  if (conStockPrueba) console.log(`Stock de prueba cargado en ${stockCargado} insumo(s) (se saltan los que ya tienen stock cargado).`);
}

main()
  .catch((error: unknown) => {
    const mensaje = error instanceof Error ? error.message : String(error);
    console.error(`Error en el seed: ${mensaje}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
