import { useCallback, useEffect, useState } from "react";

export type Tema = "light" | "dark";

const CLAVE = "dulzura-tema";

// index.html ya aplica el tema guardado antes de pintar, para evitar un parpadeo.
const temaInicial = (): Tema => {
  const actual = document.documentElement.dataset.theme;
  if (actual === "light" || actual === "dark") return actual;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

export function useTema() {
  const [tema, setTema] = useState<Tema>(temaInicial);

  useEffect(() => {
    document.documentElement.dataset.theme = tema;
    try {
      localStorage.setItem(CLAVE, tema);
    } catch {
      // sin almacenamiento disponible: el tema dura solo esta sesión
    }
  }, [tema]);

  const alternar = useCallback(() => setTema((t) => (t === "light" ? "dark" : "light")), []);
  return { tema, alternar };
}
