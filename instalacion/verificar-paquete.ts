// Prueba un paquete podado de punta a punta, como lo usa la portátil (D127):
//   npm run verificar-paquete -- --negocio rainbow
// Arma el paquete en ../dulzura-entrega/verificacion, regenera Prisma (como al actualizar), aplica las migraciones,
// arranca el servidor compilado con su propio Node y prueba las pantallas, los Excel/Word/PDF, la plantilla y el
// respaldo. Si algo de lo que se poda hacía falta, falla acá y no en la portátil. Al final borra la carpeta.
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { copyFileSync, rmSync } from "node:fs";
import path from "node:path";
import { elegirBase, paso, prepararCarpeta, SALIDA } from "./armar-paquete";
import { negocios } from "./negocio";

const PUERTO = 3011;

async function main() {
  const negocio = process.argv[process.argv.indexOf("--negocio") + 1] ?? "";
  if (!negocios().includes(negocio)) throw new Error(`Usa --negocio <${negocios().join(" | ")}>.`);
  elegirBase(negocio);
  const carpeta = path.join(SALIDA, "verificacion", "DulzuraERP");
  await prepararCarpeta(carpeta, { dependencias: true, datos: true });
  const node = path.join(carpeta, "node", "node.exe");
  const prisma = path.join(carpeta, "node_modules", "prisma", "build", "index.js");
  // Entorno limpio, como en la portátil: Prisma carga el .env de esta PC dentro de este proceso (DATABASE_URL,
  // BACKUP_DIR del negocio en uso) y los hijos lo heredarían, usando otra base que la del paquete.
  const limpio: NodeJS.ProcessEnv = { ...process.env, CHECKPOINT_DISABLE: "1" };
  delete limpio.DATABASE_URL;
  delete limpio.BACKUP_DIR;
  const correr = (args: string[]) => execFileSync(node, args, { cwd: carpeta, stdio: "inherit", env: limpio });

  try {
    paso("Como al actualizar: prisma generate y migrate deploy con el Node del paquete");
    copyFileSync(path.join(carpeta, ".env.example"), path.join(carpeta, ".env"));
    correr([prisma, "generate"]);
    correr([prisma, "migrate", "deploy"]);
    correr([path.join(carpeta, "backend", "js", "backup.js")]);

    paso("Servidor compilado");
    const servidor = spawn(node, [path.join(carpeta, "backend", "js", "server.js")], {
      cwd: carpeta,
      env: { ...limpio, PORT: String(PUERTO), DULZURA_DEMO: "1", BACKUP_AUTO: "false" },
      stdio: "inherit",
    });
    try {
      const base = `http://127.0.0.1:${PUERTO}/api`;
      for (let i = 0; i < 100; i++) {
        try {
          if ((await fetch(`${base}/salud`)).ok) break;
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
      }
      const hoy = new Date().toLocaleDateString("sv-SE");
      const fallas: string[] = [];
      const probar = async (nombre: string, ruta: string, opciones?: RequestInit, inicio?: string) => {
        const res = await fetch(base + ruta, opciones);
        const bytes = Buffer.from(await res.arrayBuffer());
        const ok = res.ok && (!inicio || bytes.subarray(0, inicio.length).toString() === inicio);
        console.log(`  ${ok ? "ok  " : "FALLA"} ${nombre} (${res.status}, ${bytes.length} bytes)`);
        if (!ok) fallas.push(nombre);
      };
      const json = (cuerpo: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
      await probar("salud", "/salud");
      await probar("productos con costo", "/productos");
      const productos = (await (await fetch(`${base}/productos`)).json()) as unknown[];
      console.log(`  ${productos.length} productos en la base del paquete`);
      if (productos.length === 0) fallas.push("la base del paquete está vacía");
      await probar("insumos", "/insumos");
      await probar("ventas del año", `/ventas?desde=${hoy.slice(0, 4)}-01-01&hasta=${hoy}`);
      await probar("totales por año", "/ventas/anios");
      await probar("historial anterior", "/historico");
      await probar("reporte", `/reportes?desde=${hoy.slice(0, 4)}-01-01&hasta=${hoy}`);
      await probar("reporte en Excel", `/reportes/excel?desde=${hoy.slice(0, 4)}-01-01&hasta=${hoy}`, undefined, "PK");
      const lista = { titulo: "Prueba", filtros: "", filas: [{ fecha: new Date().toISOString(), conHora: true, producto: "x", cliente: null, mayorista: false, cantidad: 1, total: 10, ganancia: 4, anulada: false }] };
      await probar("historial en Excel", "/exportar/ventas?formato=xlsx", json(lista), "PK");
      await probar("historial en Word", "/exportar/ventas?formato=docx", json(lista), "PK");
      await probar("historial en PDF", "/exportar/ventas?formato=pdf", json(lista), "%PDF");
      await probar("plantilla de ventas anteriores", "/historico/plantilla", undefined, "PK");
      await probar("respaldo", "/backups", { method: "POST" });
      if (fallas.length) throw new Error(`Falló: ${fallas.join(", ")}.`);
      console.log("\nEl paquete podado funciona.");
    } finally {
      servidor.kill();
      await once(servidor, "exit"); // si no, Windows no deja borrar la carpeta (EBUSY)
    }
  } finally {
    rmSync(path.join(SALIDA, "verificacion"), { recursive: true, force: true });
  }
}

main().catch((e: unknown) => {
  console.error("Verificación:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
