// Enciende o apaga lo de WhatsApp en este ERP (D109): el menú «Atención» y el aviso de modo prueba.
//   npm run whatsapp              → muestra cómo está
//   npm run whatsapp -- encender  → cuando la repostera ya tenga el agente de WhatsApp
//   npm run whatsapp -- apagar
// Después de cambiarlo, recargar el ERP en el navegador.

import { prisma } from "./prisma";
import { guardarWhatsapp, whatsappEncendido } from "./routes/agente";

async function main(): Promise<void> {
  const orden = process.argv[2];
  if (orden === "encender" || orden === "apagar") await guardarWhatsapp(orden === "encender");
  else if (orden !== undefined) throw new Error(`No entiendo «${orden}»: usa «encender» o «apagar».`);
  console.log(`WhatsApp en el ERP: ${(await whatsappEncendido()) ? "encendido" : "apagado"}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
