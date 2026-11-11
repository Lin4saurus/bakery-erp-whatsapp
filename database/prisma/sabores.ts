// Un pedido con varios sabores se guarda como una línea por sabor, con su cantidad (D57).
// Lo usan el importador del historial y la conversión única de los registros con «sabores» en texto.

import { Prisma } from "@prisma/client";

export interface PorSabor {
  sabor: string;
  cantidad: number;
}

// Sin tildes ni mayúsculas: «Limon» y «Limón» son el mismo sabor.
export const normalizar = (texto: string): string =>
  texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();

// «2 Coco, 1 Oreo» o «Coco, Oreo» → cantidades por sabor que suman `total`.
// Los sabores sin número se reparten parejo y lo que sobra va a los primeros: 22 en 4 → 6, 6, 5, 5.
// Devuelve null si no se puede repartir (total con decimales, números que no cuadran, sabores sin unidad).
export function repartirSabores(texto: string, total: number): PorSabor[] | null {
  if (!Number.isInteger(total) || total <= 0) return null;
  const partes = texto
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const m = /^(\d+)\s*(?:x\s+)?(.+)$/i.exec(p);
      return m ? { sabor: (m[2] as string).trim(), cantidad: Number(m[1]) as number | null } : { sabor: p, cantidad: null as number | null };
    });
  if (partes.length === 0) return null;

  const fijas = partes.reduce((t, p) => t + (p.cantidad ?? 0), 0);
  const sinNumero = partes.filter((p) => p.cantidad === null);
  const resto = total - fijas;
  if (resto < 0 || (sinNumero.length === 0 && resto !== 0) || (sinNumero.length > 0 && resto < sinNumero.length)) return null;
  const base = sinNumero.length ? Math.floor(resto / sinNumero.length) : 0;
  let extra = sinNumero.length ? resto % sinNumero.length : 0;

  const porSabor = new Map<string, PorSabor>();
  for (const p of partes) {
    let cantidad = p.cantidad;
    if (cantidad === null) {
      cantidad = base + (extra > 0 ? 1 : 0);
      if (extra > 0) extra--;
    }
    const clave = normalizar(p.sabor);
    const previo = porSabor.get(clave);
    if (previo) previo.cantidad += cantidad;
    else porSabor.set(clave, { sabor: p.sabor, cantidad });
  }
  return [...porSabor.values()].filter((p) => p.cantidad > 0);
}

// Producto de la familia cuyo nombre termina en el sabor: Queques + «Coco» → «Queque Coco».
export function productoDelSabor<P extends { nombre: string; categoria: string | null }>(
  productos: P[],
  familia: string | null,
  sabor: string,
): P | null {
  const buscado = ` ${normalizar(sabor)}`;
  return productos.find((p) => p.categoria === familia && normalizar(p.nombre).endsWith(buscado)) ?? null;
}

// Reparte un monto en proporción a las cantidades, a 2 decimales; la última parte se lleva el redondeo.
export function repartirMonto(monto: Prisma.Decimal, cantidades: number[]): Prisma.Decimal[] {
  const total = cantidades.reduce((t, c) => t + c, 0);
  const partes = cantidades.map((c) => monto.mul(c).div(total).toDecimalPlaces(2));
  const suma = partes.slice(0, -1).reduce((t, p) => t.add(p), new Prisma.Decimal(0));
  partes[partes.length - 1] = monto.sub(suma);
  return partes;
}
