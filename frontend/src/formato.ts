import type { CategoriaGasto, CategoriaInsumo, TipoCliente, UnidadMedida } from "./api";

// Solo para mostrar: los cálculos los hace la API con Decimal.
const numero = (valor: string | number, maxDecimales: number, minDecimales = 0): string =>
  Number(valor).toLocaleString("es-BO", { minimumFractionDigits: minDecimales, maximumFractionDigits: maxDecimales });

export const bs = (valor: string | number | null | undefined): string =>
  valor === null || valor === undefined ? "—" : `Bs ${numero(valor, 2, 2)}`;

export const cantidad = (valor: string | number, maxDecimales = 2): string => numero(valor, maxDecimales);

export const porcentaje = (valor: string | null): string => (valor === null ? "—" : `${numero(valor, 1, 1)} %`);

// Costos por gramo son muy chicos: se muestran con más decimales.
export const costoUnidad = (valor: string): string => `Bs ${numero(valor, 5, 2)}`;

export const unidadCorta: Record<UnidadMedida, string> = { GRAMO: "g", MILILITRO: "ml", UNIDAD: "u" };

// Cantidad con su unidad, legible: desde 1000 g se muestra en kg y desde 1000 ml en L
// (50000 g → «50 kg»; «50.000 g» se confundía con 50 g). Solo para mostrar: todo se guarda en g/ml.
export const medida = (valor: string | number, unidad: UnidadMedida): string => {
  const n = Number(valor);
  if (unidad === "GRAMO" && Math.abs(n) >= 1000) return `${numero(n / 1000, 2)} kg`;
  if (unidad === "MILILITRO" && Math.abs(n) >= 1000) return `${numero(n / 1000, 2)} L`;
  return `${numero(n, 2)} ${unidadCorta[unidad]}`;
};

export const nombreUnidad: Record<UnidadMedida, string> = {
  GRAMO: "Gramos (g)",
  MILILITRO: "Mililitros (ml)",
  UNIDAD: "Unidades",
};

export const nombreCategoria: Record<CategoriaInsumo, string> = {
  MATERIA_PRIMA: "Materia prima",
  EMPAQUE: "Empaque",
  GASTO_INDIRECTO: "Gasto indirecto",
};

export const nombreCategoriaGasto: Record<CategoriaGasto, string> = {
  LIMPIEZA: "Limpieza",
  EQUIPAMIENTO: "Equipamiento",
  USO_PERSONAL: "Uso personal",
  OTROS: "Otros",
};

export const nombreTipoCliente: Record<TipoCliente, string> = { MINORISTA: "Minorista", MAYORISTA: "Mayorista" };

export const hoyISO = (): string => new Date().toLocaleDateString("sv-SE");

// Primer día del mes actual (AAAA-MM-DD, hora local).
export const inicioDeMesISO = (): string => {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth(), 1).toLocaleDateString("sv-SE");
};

export const hora = (fechaISO: string): string =>
  new Date(fechaISO).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" });

// "2026-11-03" → "martes 3 de noviembre" (un día sin hora, en hora local).
export const diaLargo = (dia: string): string =>
  new Date(`${dia}T12:00:00`).toLocaleDateString("es-BO", { weekday: "long", day: "numeric", month: "long" });

export const fechaCorta = (fechaISO: string): string =>
  new Date(fechaISO).toLocaleDateString("es-BO", { day: "2-digit", month: "short" });

// En Bolivia se escribe "0,35": se acepta coma o punto y se envía con punto.
export const normalizarNumero = (texto: string): string => texto.trim().replace(",", ".");

export const esNumeroValido = (texto: string): boolean => {
  const normal = normalizarNumero(texto);
  return normal !== "" && Number.isFinite(Number(normal));
};
