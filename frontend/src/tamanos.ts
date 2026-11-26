import type { Producto } from "./api";

// Tamaños (D118): los productos que comparten `grupo` son tamaños de uno solo («Torta Matilda de quinua» en 2, 4,
// 8, 10, 15 y 25 personas). La Caja muestra un botón por producto y el tamaño se elige en el pedido; Recetas los
// muestra juntos. Cada tamaño sigue siendo un producto con su precio, su receta y su costo.

export interface ConTamanos {
  clave: string;
  nombre: string; // el grupo, o el nombre si no tiene tamaños
  tamanos: Producto[]; // ordenados de menor a mayor; uno solo si no tiene tamaños
}

// Primer número del tamaño: «15 personas» → 15, «paquete de 12» → 12. Sin número: null.
export const numeroDelTamano = (tamano: string | null): number | null => {
  const m = /(\d+(?:[.,]\d+)?)/.exec(tamano ?? "");
  return m ? Number((m[1] as string).replace(",", ".")) : null;
};

// De menor a mayor: por el número del tamaño («2 personas» < «15 personas»); si no tienen número («personal»,
// «familiar», «mega»), por precio, que en una pastelería sigue al tamaño.
export const ordenarTamanos = (lista: Producto[]): Producto[] =>
  [...lista].sort((a, b) => {
    const na = numeroDelTamano(a.tamano);
    const nb = numeroDelTamano(b.tamano);
    if (na !== null && nb !== null && na !== nb) return na - nb;
    const pa = Number(a.precioVenta ?? 0);
    const pb = Number(b.precioVenta ?? 0);
    if ((na === null || nb === null) && pa !== pb) return pa - pb;
    return (a.tamano ?? a.nombre).localeCompare(b.tamano ?? b.nombre, "es", { numeric: true, sensitivity: "base" });
  });

// Agrupa conservando el orden en que aparece el primero de cada grupo.
export function agruparTamanos(lista: Producto[]): ConTamanos[] {
  const grupos: ConTamanos[] = [];
  const porClave = new Map<string, ConTamanos>();
  for (const p of lista) {
    const clave = p.grupo ? `g:${p.categoria}:${p.grupo}` : `p:${p.id}`;
    let g = porClave.get(clave);
    if (!g) {
      g = { clave, nombre: p.grupo ?? p.nombre, tamanos: [] };
      porClave.set(clave, g);
      grupos.push(g);
    }
    g.tamanos.push(p);
  }
  for (const g of grupos) g.tamanos = ordenarTamanos(g.tamanos);
  return grupos;
}

// Cuánto se multiplica la receta para pasar de un tamaño a otro: de «8 personas» a «15 personas» → 1,875.
export function factorEntre(desde: string | null, hasta: string): number | null {
  const a = numeroDelTamano(desde);
  const b = numeroDelTamano(hasta);
  return a && b ? Math.round((b / a) * 10000) / 10000 : null;
}
