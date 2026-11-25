import { MdMenu, MdOutlineDarkMode, MdOutlineEdit, MdOutlineLightMode, MdOutlineLock, MdOutlinePassword } from "react-icons/md";
import type { Tema } from "../../hooks/useTema";
import { EN_DEMO } from "../../demo";
import { inicialNegocio, useNombreNegocio } from "../../negocio";
import "./Topbar.css";

export function Topbar({
  titulo,
  tema,
  alternarTema,
  abrirMenu,
  bloquear,
  cambiarPin,
  editarNombre,
}: {
  titulo: string;
  tema: Tema;
  alternarTema: () => void;
  abrirMenu: () => void;
  bloquear: () => void;
  cambiarPin: () => void;
  editarNombre: () => void;
}) {
  const nombre = useNombreNegocio();
  const fecha = new Date().toLocaleDateString("es-BO", { weekday: "long", day: "numeric", month: "long" });
  const esOscuro = tema === "dark";
  return (
    <header className="topbar">
      <button className="topbar__boton topbar__menu" onClick={abrirMenu} aria-label="Abrir menú">
        <MdMenu />
      </button>
      <div className="topbar__titulo">
        <span className="topbar__ruta">
          {nombre} / {titulo}
        </span>
        <span className="topbar__pagina">{titulo}</span>
      </div>
      <div className="topbar__derecha">
        <span className="topbar__fecha">{fecha}</span>
        <button
          className="topbar__boton"
          onClick={alternarTema}
          aria-label={esOscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          title={esOscuro ? "Modo claro" : "Modo oscuro"}
        >
          {esOscuro ? <MdOutlineLightMode /> : <MdOutlineDarkMode />}
        </button>
        {/* PIN de la dueña (D105): cambiarlo, o bloquear el ERP al alejarse de la caja. La demo no tiene PIN (D114). */}
        {!EN_DEMO && (
          <>
            <button className="topbar__boton" onClick={cambiarPin} aria-label="Cambiar PIN" title="Cambiar PIN">
              <MdOutlinePassword />
            </button>
            <button className="topbar__boton" onClick={bloquear} aria-label="Bloquear el ERP" title="Bloquear (pide el PIN)">
              <MdOutlineLock />
            </button>
          </>
        )}
        {/* Nombre del negocio (D117): la dueña lo cambia tocándolo. */}
        <button
          type="button"
          className="topbar__perfil"
          onClick={editarNombre}
          disabled={EN_DEMO}
          title={EN_DEMO ? nombre : "Cambiar el nombre del negocio"}
          aria-label={`${nombre}. Cambiar el nombre del negocio`}
        >
          <span className="topbar__avatar" aria-hidden>
            {inicialNegocio(nombre)}
          </span>
          <span className="topbar__perfil-texto">
            <strong>{nombre}</strong>
            <span>{EN_DEMO ? "Administración" : "Cambiar nombre"}</span>
          </span>
          {!EN_DEMO && <MdOutlineEdit className="topbar__perfil-editar" aria-hidden />}
        </button>
      </div>
    </header>
  );
}
