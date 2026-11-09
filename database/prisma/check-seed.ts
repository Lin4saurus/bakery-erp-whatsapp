// Verificación del seed: calcula con el motor de costeo de la API el costo de cada producto
// y lo compara con los valores esperados de CONTEXT.md §4.

import { Prisma } from "@prisma/client";
import { prisma } from "../../backend/src/prisma";
import { calcularCostoProducto } from "../../backend/src/services/costeo";

const TOLERANCIA = new Prisma.Decimal("0.001");

// Costo esperado (Bs), CONTEXT.md §4: por tanda para los INTERMEDIO, por unidad para los de VENTA.
export const costosEsperados: Record<string, string> = {
  "Relleno de Nido": "32.4266",
  "Relleno de Brigadeiro": "28.2266",
  Queque: "17.3059",
  "Queque molde grande": "19.3229",
  "Queque de quinoa": "4.0173",
  "Queque con relleno": "20.6054",
  "Queque base (histórico)": "6.6981",
  // Fase 6 — Brownies (CONTEXT.md §4b)
  "Brownies (masa)": "15.3334",
  "Brownies clásicos 4 u": "10.6039",
  "Brownies premium 4 u": "14.9539",
  "Brownies clásicos 9 u": "18.8587",
  "Brownies premium 9 u": "31.9087",
  "Brownies 16 u": "3.3839",
  "Brownie personal premium": "4.7910",
  // Fase 6 — Flanes (CONTEXT.md §4)
  Chocoflan: "6.4286",
  "Quesillo venezolano": "7.2975",
  // Fase 7 — toppings (por tanda), fresas y tres leches (CONTEXT.md §4)
  "Topping tres leches personal": "10.2000",
  "Topping tres leches": "15.2500",
  "Topping tres leches grande": "27.2500",
  "Topping tres leches mega": "33.2500",
  "Fresas con crema": "9.1750",
  "Fresas con crema y brownie": "12.3779",
  "Fresas con crema, brownie y Nutella": "14.0879",
  "Frutillas bañadas en chocolate": "14.5500",
  "Tres leches personal": "8.3721",
  "Tres leches": "25.5024",
  "Tres leches familiar": "59.6344",
  "Tres leches mega": "69.0996",
};

async function main(): Promise<void> {
  const productos = await prisma.producto.findMany({ orderBy: { id: "asc" } });
  let fallas = 0;

  for (const producto of productos) {
    const costo = await calcularCostoProducto(prisma, producto.id);
    const esIntermedio = producto.tipo === "INTERMEDIO";
    const calculado = esIntermedio ? costo.costoTanda : costo.costoUnitario;
    const esperado = costosEsperados[producto.nombre];

    if (esperado === undefined) {
      console.log(`?  ${producto.nombre}: ${calculado.toFixed(4)} Bs (sin valor esperado)`);
      continue;
    }
    const ok = calculado.sub(esperado).abs().lte(TOLERANCIA);
    if (!ok) fallas++;
    const etiqueta = esIntermedio ? "tanda" : "unidad";
    const ganancia = costo.gananciaUnitaria ? `  ganancia ${costo.gananciaUnitaria.toFixed(4)}` : "";
    console.log(
      `${ok ? "OK" : "XX"} ${producto.nombre}: costo/${etiqueta} ${calculado.toFixed(4)} Bs (esperado ${esperado})${ganancia}`,
    );
  }

  if (fallas > 0) {
    throw new Error(`${fallas} producto(s) no coinciden con CONTEXT.md §4.`);
  }
  console.log("Todos los costos coinciden con CONTEXT.md §4.");
}

if (require.main === module) {
  main()
    .catch((error: unknown) => {
      const mensaje = error instanceof Error ? error.message : String(error);
      console.error(`Error en la verificación: ${mensaje}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
