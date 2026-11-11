import { useEffect, useState } from "react";
import {
  MdOutlineDashboard,
  MdOutlineHistory,
  MdOutlineInsights,
  MdOutlineInventory2,
  MdOutlineMenuBook,
  MdOutlinePeopleAlt,
  MdOutlinePointOfSale,
  MdOutlineReceiptLong,
} from "react-icons/md";
import { EstadoRespaldo } from "./components/layout/EstadoRespaldo";
import { Sidebar, type ItemMenu } from "./components/layout/Sidebar";
import { Topbar } from "./components/layout/Topbar";
import { useTema } from "./hooks/useTema";
import { Inicio } from "./pantallas/Inicio";
import { Caja } from "./pantallas/Caja";
import { Insumos } from "./pantallas/Insumos";
import { Recetas } from "./pantallas/Recetas";
import { Desempeno, Historial } from "./pantallas/Historial";
import { Gastos } from "./pantallas/Gastos";
import { Clientes } from "./pantallas/Clientes";
import "./App.css";

const pantallas = {
  inicio: Inicio,
  caja: Caja,
  gastos: Gastos,
  clientes: Clientes,
  recetas: Recetas,
  insumos: Insumos,
  desempeno: Desempeno,
  historial: Historial,
} as const;

type Pantalla = keyof typeof pantallas;

const menu: readonly ItemMenu<Pantalla>[] = [
  { clave: "inicio", titulo: "Inicio", icono: MdOutlineDashboard, seccion: "General" },
  { clave: "caja", titulo: "Caja", icono: MdOutlinePointOfSale, seccion: "General" },
  { clave: "gastos", titulo: "Gastos", icono: MdOutlineReceiptLong, seccion: "General" },
  { clave: "clientes", titulo: "Clientes", icono: MdOutlinePeopleAlt, seccion: "General" },
  { clave: "recetas", titulo: "Recetas y precios", icono: MdOutlineMenuBook, seccion: "Configuración" },
  { clave: "insumos", titulo: "Insumos", icono: MdOutlineInventory2, seccion: "Configuración" },
  // Consulta (D67): los números del año y, aparte, la lista de ventas.
  { clave: "desempeno", titulo: "Desempeño", icono: MdOutlineInsights, seccion: "Consulta" },
  { clave: "historial", titulo: "Historial de ventas", icono: MdOutlineHistory, seccion: "Consulta" },
];

const esPantalla = (valor: string): valor is Pantalla => valor in pantallas;
const desdeHash = (): Pantalla => {
  const hash = window.location.hash.slice(1);
  return esPantalla(hash) ? hash : "inicio";
};

export function App() {
  const [actual, setActual] = useState<Pantalla>(desdeHash);
  const [menuAbierto, setMenuAbierto] = useState(false);
  // Menú de solo íconos (D62): se recuerda en este navegador.
  const [colapsado, setColapsado] = useState(() => {
    try {
      return localStorage.getItem("menuColapsado") === "1";
    } catch {
      return false;
    }
  });
  const alternarColapsado = () =>
    setColapsado((actual) => {
      try {
        localStorage.setItem("menuColapsado", actual ? "0" : "1");
      } catch {
        // sin almacenamiento: solo dura esta visita
      }
      return !actual;
    });
  const { tema, alternar } = useTema();

  // El hash permite volver con "atrás" y recargar sin perder la pantalla.
  useEffect(() => {
    const alCambiar = () => {
      setActual(desdeHash());
      setMenuAbierto(false);
      // Cada pantalla empieza arriba (ahí va la confirmación de la venta).
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", alCambiar);
    return () => window.removeEventListener("hashchange", alCambiar);
  }, []);

  const Componente = pantallas[actual];
  const titulo = menu.find((m) => m.clave === actual)?.titulo ?? "";

  return (
    <div className={`app ${colapsado ? "app--colapsado" : ""}`}>
      <Sidebar
        items={menu}
        actual={actual}
        abierto={menuAbierto}
        colapsado={colapsado}
        alternarColapsado={alternarColapsado}
        elegir={(clave) => {
          window.location.hash = clave;
        }}
        cerrar={() => setMenuAbierto(false)}
        pie={<EstadoRespaldo compacto={colapsado} />}
      />
      <div className="app__principal">
        <Topbar titulo={titulo} tema={tema} alternarTema={alternar} abrirMenu={() => setMenuAbierto(true)} />
        <main className="app__contenido">
          <Componente />
        </main>
      </div>
    </div>
  );
}
