import { useSyncExternalStore } from "react";

// Nombre del negocio (D117): lo elige la dueña («Cambiar nombre» en la barra de arriba). Se guarda en el ERP y se
// recuerda en este navegador para pintarlo al instante la próxima vez (index.html lo lee antes de cargar React).

const RECORDADO = "negocio-nombre";
const POR_DEFECTO = "Mi pastelería";

const leerRecordado = (): string => {
  try {
    return localStorage.getItem(RECORDADO) || POR_DEFECTO;
  } catch {
    return POR_DEFECTO;
  }
};

let nombre = leerRecordado();
const oyentes = new Set<() => void>();

export function fijarNombreNegocio(nuevo: string): void {
  nombre = nuevo;
  document.title = `${nuevo} · Costos y Ventas`;
  try {
    localStorage.setItem(RECORDADO, nuevo);
  } catch {
    // sin almacenamiento (ventana privada): igual se ve hasta recargar
  }
  for (const avisar of oyentes) avisar();
}

export async function cargarNombreNegocio(): Promise<void> {
  try {
    const respuesta = await fetch("/api/negocio");
    if (respuesta.ok) fijarNombreNegocio(((await respuesta.json()) as { nombre: string }).nombre);
  } catch {
    // sin servidor: queda el recordado
  }
}

export function useNombreNegocio(): string {
  return useSyncExternalStore(
    (avisar) => {
      oyentes.add(avisar);
      return () => oyentes.delete(avisar);
    },
    () => nombre,
  );
}

// Letra del logo: la primera del nombre, sin contar «Pastelería»: «Pastelería Rainbow» → R.
export function inicialNegocio(texto: string): string {
  const palabras = texto.trim().split(/\s+/);
  const propia = palabras.find((p) => !/^(pasteler[ií]a|reposter[ií]a|panader[ií]a|la|el|los|las|de|del)$/i.test(p)) ?? palabras[0] ?? "?";
  return propia.charAt(0).toUpperCase();
}
