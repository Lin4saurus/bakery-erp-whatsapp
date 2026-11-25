import { prisma } from "../prisma";

// Nombre del negocio (D117): lo elige la dueña desde el ERP y sale en el menú, la pantalla del PIN, los reportes,
// las descargas y el correo de respaldo.

export const CLAVE_NOMBRE = "negocio.nombre";
export const NOMBRE_POR_DEFECTO = "Mi pastelería";

export async function nombreDelNegocio(): Promise<string> {
  const fila = await prisma.configuracion.findUnique({ where: { clave: CLAVE_NOMBRE } });
  return fila?.valor || NOMBRE_POR_DEFECTO;
}
