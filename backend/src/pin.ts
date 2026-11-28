// `npm run pin`: si la dueña olvidó su PIN, se borra. Al abrir el ERP pedirá crear uno nuevo (D105).
// Solo se puede hacer desde esta PC, con acceso a la carpeta del ERP.
//
// `npm run pin -- --crear` (D128, ERP en internet): pide un PIN de 6 números en la consola, sin mostrarlo, y lo
// guarda. Así el PIN queda puesto antes de abrir el ERP a internet y nadie puede adelantarse a crearlo.

import { createInterface } from "node:readline";
import { prisma } from "./prisma";
import { borrarPin, cerrarTodas, guardarPin } from "./services/sesion";

const PIN_EN_LINEA = /^\d{6}$/;

// Una sola interfaz para las dos preguntas: con dos, la primera se queda con lo que ya se escribió de la segunda.
async function crear(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const salida = rl as unknown as { _writeToOutput: (texto: string) => void };
  let oculto = false;
  salida._writeToOutput = (texto: string) => {
    if (!oculto) process.stdout.write(texto);
    else if (texto.includes("\n") || texto.includes("\r")) process.stdout.write("\n");
    else process.stdout.write("*".repeat(texto.length));
  };
  const lineas = rl[Symbol.asyncIterator]();
  const preguntar = async (pregunta: string): Promise<string> => {
    oculto = false;
    process.stdout.write(pregunta);
    oculto = true;
    const { value } = await lineas.next();
    return String(value ?? "").trim();
  };
  let pin: string;
  let otraVez: string;
  try {
    pin = await preguntar("PIN nuevo (6 números): ");
    otraVez = PIN_EN_LINEA.test(pin) ? await preguntar("Repítelo: ") : "";
  } finally {
    rl.close();
  }
  if (!PIN_EN_LINEA.test(pin)) throw new Error("El PIN tiene que ser de exactamente 6 números.");
  if (otraVez !== pin) throw new Error("Los dos PIN no coinciden.");
  await guardarPin(pin);
  cerrarTodas();
  console.log("PIN guardado. Si el ERP estaba abierto, reinícialo para cerrar las sesiones abiertas.");
}

async function borrar(): Promise<void> {
  const habia = await borrarPin();
  console.log(
    habia
      ? "PIN borrado. Abre el ERP (o recarga la página) y elige un PIN nuevo. Si el ERP estaba abierto, reinícialo."
      : "No había PIN guardado: al abrir el ERP te pedirá crear uno.",
  );
}

(process.argv.includes("--crear") ? crear() : borrar())
  .catch((error: unknown) => {
    console.error(`No se pudo: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
