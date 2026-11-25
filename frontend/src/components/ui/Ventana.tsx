import { useEffect, type ReactNode } from "react";
import { MdClose } from "react-icons/md";
import { createPortal } from "react-dom";
import "./Ventana.css";

// Ventana emergente: se cierra con la X, con Esc o tocando fuera. La página de atrás no se desliza.
export function Ventana({
  titulo,
  subtitulo,
  cerrar,
  angosta = false,
  ancha = false,
  mediana = false,
  children,
}: {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  cerrar: () => void;
  angosta?: boolean; // formularios cortos (PIN, nombre del negocio): 440 px en vez de 860 px
  ancha?: boolean; // tablas para llenar (ventas anteriores, D121): hasta 1180 px
  mediana?: boolean; // formularios con instrucciones (respaldo por correo): 620 px
  children: ReactNode;
}) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
    };
    const desliceAntes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", alTeclear);
    return () => {
      document.body.style.overflow = desliceAntes;
      window.removeEventListener("keydown", alTeclear);
    };
  }, [cerrar]);

  // Se dibuja en <body> para quedar encima de todo, aunque la pantalla tenga zoom o su propio apilamiento.
  return createPortal(
    <div className="ventana-fondo" onMouseDown={(e) => e.target === e.currentTarget && cerrar()}>
      <div className={`ventana ${angosta ? "ventana--angosta" : ""} ${ancha ? "ventana--ancha" : ""} ${mediana ? "ventana--mediana" : ""}`} role="dialog" aria-modal="true">
        <div className="ventana__cabecera">
          <div>
            <h2 className="ventana__titulo">{titulo}</h2>
            {subtitulo && <div className="secundario ventana__subtitulo">{subtitulo}</div>}
          </div>
          <button type="button" className="ventana__cerrar" onClick={cerrar} aria-label="Cerrar" title="Cerrar (Esc)" autoFocus>
            <MdClose aria-hidden />
          </button>
        </div>
        <div className="ventana__cuerpo">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
