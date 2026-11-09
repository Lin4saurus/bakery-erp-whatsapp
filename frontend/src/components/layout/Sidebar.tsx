import type { ReactNode } from "react";
import type { IconType } from "react-icons";
import "./Sidebar.css";

export interface ItemMenu<K extends string> {
  clave: K;
  titulo: string;
  icono: IconType;
  seccion: string;
}

export function Sidebar<K extends string>({
  items,
  actual,
  abierto,
  elegir,
  cerrar,
  pie,
}: {
  pie?: ReactNode;
  items: readonly ItemMenu<K>[];
  actual: K;
  abierto: boolean;
  elegir: (clave: K) => void;
  cerrar: () => void;
}) {
  const secciones = [...new Set(items.map((i) => i.seccion))];
  return (
    <>
      <aside className={`sidebar ${abierto ? "sidebar--abierto" : ""}`}>
        <div className="sidebar__marca">
          <span className="sidebar__logo" aria-hidden>
            D
          </span>
          <span className="sidebar__nombre">Dulzura</span>
        </div>
        <nav className="sidebar__nav" aria-label="Menú principal">
          {secciones.map((seccion) => (
            <div key={seccion} className="sidebar__seccion">
              <div className="sidebar__titulo-seccion">{seccion}</div>
              {items
                .filter((i) => i.seccion === seccion)
                .map(({ clave, titulo, icono: Icono }) => (
                  <button
                    key={clave}
                    className={`sidebar__item ${clave === actual ? "sidebar__item--activo" : ""}`}
                    aria-current={clave === actual ? "page" : undefined}
                    onClick={() => elegir(clave)}
                  >
                    <Icono className="sidebar__icono" aria-hidden />
                    {titulo}
                  </button>
                ))}
            </div>
          ))}
        </nav>
        <div className="sidebar__pie">{pie ?? "Repostería · Bolivia"}</div>
      </aside>
      {abierto && <div className="sidebar__fondo" onClick={cerrar} aria-hidden />}
    </>
  );
}
