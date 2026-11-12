import type { ReactNode } from "react";
import type { IconType } from "react-icons";
import { MdChevronLeft, MdChevronRight } from "react-icons/md";
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
  colapsado,
  alternarColapsado,
  elegir,
  cerrar,
  pie,
  insignias = {},
}: {
  pie?: ReactNode;
  insignias?: Partial<Record<K, number>>; // número junto al ítem (ej. pedidos de hoy)
  colapsado: boolean; // solo íconos (D62); en pantallas chicas no aplica
  alternarColapsado: () => void;
  items: readonly ItemMenu<K>[];
  actual: K;
  abierto: boolean;
  elegir: (clave: K) => void;
  cerrar: () => void;
}) {
  const secciones = [...new Set(items.map((i) => i.seccion))];
  return (
    <>
      <aside className={`sidebar ${abierto ? "sidebar--abierto" : ""} ${colapsado ? "sidebar--colapsado" : ""}`}>
        {/* Toda la marca colapsa o expande el menú (D66); en pantallas chicas el menú se abre con ☰. */}
        <button
          type="button"
          className="sidebar__marca"
          onClick={() => {
            if (window.matchMedia("(min-width: 1001px)").matches) alternarColapsado();
          }}
          aria-label={colapsado ? "Mostrar el menú completo" : "Dejar solo los íconos"}
          title={colapsado ? "Mostrar el menú completo" : "Dejar solo los íconos"}
        >
          <span className="sidebar__logo" aria-hidden>
            D
          </span>
          {/* Dulzura Pastelería (D65): en dos líneas para que quepa en el menú de 200 px. */}
          <span className="sidebar__nombre">
            Dulzura
            <span className="sidebar__subnombre">Pastelería</span>
          </span>
          <span className="sidebar__colapsar" aria-hidden>
            {colapsado ? <MdChevronRight /> : <MdChevronLeft />}
          </span>
        </button>
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
                    aria-label={colapsado ? titulo : undefined}
                    title={colapsado ? titulo : undefined}
                    onClick={() => elegir(clave)}
                  >
                    <Icono className="sidebar__icono" aria-hidden />
                    <span className="sidebar__texto">{titulo}</span>
                    {(insignias[clave] ?? 0) > 0 && (
                      <span className="sidebar__insignia" aria-label={`${insignias[clave]} por atender`}>
                        {insignias[clave]}
                      </span>
                    )}
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
