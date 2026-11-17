import { useCallback, useEffect, useRef, useState } from "react";
import {
  MdOutlineDashboard,
  MdOutlineSupportAgent,
  MdOutlineEventNote,
  MdOutlineHistory,
  MdOutlineInsights,
  MdOutlineInventory2,
  MdOutlineMenuBook,
  MdOutlinePeopleAlt,
  MdOutlinePointOfSale,
  MdOutlineReceiptLong,
  MdOutlineSummarize,
} from "react-icons/md";
import { EstadoRespaldo } from "./components/layout/EstadoRespaldo";
import { VersionErp } from "./components/layout/Actualizacion";
import { Sidebar, type ItemMenu } from "./components/layout/Sidebar";
import { Topbar } from "./components/layout/Topbar";
import { Bloqueo, CambiarPin } from "./components/layout/Bloqueo";
import { useInactividad } from "./hooks/useInactividad";
import { useTema } from "./hooks/useTema";
import { Inicio } from "./pantallas/Inicio";
import { Caja } from "./pantallas/Caja";
import { Insumos } from "./pantallas/Insumos";
import { Recetas } from "./pantallas/Recetas";
import { Desempeno, Historial } from "./pantallas/Historial";
import { Gastos } from "./pantallas/Gastos";
import { Clientes } from "./pantallas/Clientes";
import { Pedidos } from "./pantallas/Pedidos";
import { Atenciones } from "./pantallas/Atenciones";
import { Reportes } from "./pantallas/Reportes";
import { EVENTO_BLOQUEADO, api } from "./api";
import { urgentes } from "./pedidos";
import { conectarAvisos } from "./avisos";
import "./App.css";

const pantallas = {
  inicio: Inicio,
  caja: Caja,
  pedidos: Pedidos,
  atencion: Atenciones,
  gastos: Gastos,
  clientes: Clientes,
  recetas: Recetas,
  insumos: Insumos,
  desempeno: Desempeno,
  historial: Historial,
  reportes: Reportes,
} as const;

type Pantalla = keyof typeof pantallas;

const menu: readonly ItemMenu<Pantalla>[] = [
  { clave: "inicio", titulo: "Inicio", icono: MdOutlineDashboard, seccion: "General" },
  { clave: "caja", titulo: "Caja", icono: MdOutlinePointOfSale, seccion: "General" },
  // Pedidos por entregar (D81): la insignia cuenta los atrasados y los de hoy.
  { clave: "pedidos", titulo: "Pedidos", icono: MdOutlineEventNote, seccion: "General" },
  // Atención humana (D85): chats de WhatsApp que el agente pasó a la dueña.
  { clave: "atencion", titulo: "Atención", icono: MdOutlineSupportAgent, seccion: "General" },
  { clave: "gastos", titulo: "Gastos", icono: MdOutlineReceiptLong, seccion: "General" },
  { clave: "clientes", titulo: "Clientes", icono: MdOutlinePeopleAlt, seccion: "General" },
  { clave: "recetas", titulo: "Recetas y precios", icono: MdOutlineMenuBook, seccion: "Configuración" },
  { clave: "insumos", titulo: "Insumos", icono: MdOutlineInventory2, seccion: "Configuración" },
  // Consulta (D67): los números del año y, aparte, la lista de ventas.
  { clave: "desempeno", titulo: "Desempeño", icono: MdOutlineInsights, seccion: "Consulta" },
  { clave: "historial", titulo: "Historial de ventas", icono: MdOutlineHistory, seccion: "Consulta" },
  // Reporte del periodo para el contador, en Excel o PDF (D106).
  { clave: "reportes", titulo: "Reportes", icono: MdOutlineSummarize, seccion: "Consulta" },
];

const esPantalla = (valor: string): valor is Pantalla => valor in pantallas;
// «#pedidos/<id>» abre Pedidos con ese pedido a la vista (D104): la pantalla es lo que va antes de la barra.
const desdeHash = (): Pantalla => {
  const hash = window.location.hash.slice(1).split("/")[0] ?? "";
  return esPantalla(hash) ? hash : "inicio";
};

type Puerta = "cargando" | "crear" | "entrar" | "adentro" | "sin-servidor";

// La puerta del ERP (D105): sin PIN no se monta ninguna pantalla, ni se abren los avisos en vivo.
export function App() {
  const [puerta, setPuerta] = useState<Puerta>("cargando");
  const [minutos, setMinutos] = useState(60);
  const { tema, alternar } = useTema();

  // Versión del servidor con la que se cargó esta página (D112): si el ERP vuelve actualizado (las sesiones viven en
  // memoria, así que pide el PIN), se recarga la página para no mezclar pantallas viejas con el servidor nuevo.
  const versionCargada = useRef<string | null>(null);
  const revisar = useCallback(async () => {
    // Las dos consultas a la vez: al abrir el ERP no se espera una para pedir la otra.
    const [version, sesion] = await Promise.all([api.versionServidor(), api.sesion().catch(() => null)]);
    if (version && versionCargada.current && version !== versionCargada.current) {
      window.location.reload();
      return;
    }
    if (version) versionCargada.current = version;
    try {
      if (!sesion) throw new Error("sin servidor");
      setMinutos(sesion.minutosInactividad);
      setPuerta(sesion.activa ? "adentro" : sesion.pinCreado ? "entrar" : "crear");
    } catch {
      setPuerta("sin-servidor");
    }
  }, []);
  useEffect(() => {
    void revisar();
    const alBloquearse = () => void revisar();
    window.addEventListener(EVENTO_BLOQUEADO, alBloquearse);
    return () => window.removeEventListener(EVENTO_BLOQUEADO, alBloquearse);
  }, [revisar]);

  const bloquear = useCallback(() => {
    setPuerta("entrar");
    api.salir().catch(() => undefined);
  }, []);
  useInactividad(puerta === "adentro", minutos, bloquear);

  if (puerta === "adentro") return <Escritorio tema={tema} alternarTema={alternar} bloquear={bloquear} />;
  return <Bloqueo modo={puerta} listo={() => setPuerta("adentro")} reintentar={() => void revisar()} minutos={minutos} />;
}

function Escritorio({
  tema,
  alternarTema,
  bloquear,
}: {
  tema: ReturnType<typeof useTema>["tema"];
  alternarTema: () => void;
  bloquear: () => void;
}) {
  const [actual, setActual] = useState<Pantalla>(desdeHash);
  const [cambiandoPin, setCambiandoPin] = useState(false);
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
  // Recordatorio en el menú: pedidos atrasados y de hoy. Se revisa cada minuto y al cambiar de pantalla.
  // También los chats que esperan a la dueña (D85).
  const [porAtender, setPorAtender] = useState(0);
  const [chatsEsperando, setChatsEsperando] = useState(0);
  // Sin WhatsApp en este ERP (D109) no hay chats que atender: «Atención» no se muestra. Hasta saberlo, tampoco.
  const [whatsapp, setWhatsapp] = useState(false);
  useEffect(() => {
    api
      .configAgente()
      .then((c) => setWhatsapp(c.whatsapp))
      .catch(() => setWhatsapp(true));
  }, []);
  const conWhatsapp = useRef(whatsapp);
  conWhatsapp.current = whatsapp;
  // Apenas se sabe que hay WhatsApp, cuenta los chats (solo eso: avisar a todas las pantallas recargaba el Inicio).
  useEffect(() => {
    if (!whatsapp) {
      setChatsEsperando(0);
      return;
    }
    api
      .atenciones("PENDIENTE")
      .then((lista) => setChatsEsperando(new Set(lista.map((a) => a.celular.slice(-8))).size))
      .catch(() => undefined);
  }, [whatsapp]);
  useEffect(() => {
    const revisar = () => {
      api
        .pedidos("proximos")
        .then((lista) => setPorAtender(urgentes(lista).total))
        .catch(() => undefined);
      if (!conWhatsapp.current) return;
      api
        .atenciones("PENDIENTE")
        .then((lista) => setChatsEsperando(new Set(lista.map((a) => a.celular.slice(-8))).size))
        .catch(() => undefined);
    };
    revisar();
    // Avisos en vivo del servidor (D88): un chat nuevo en Atención o un pedido de WhatsApp se ven al instante.
    const desconectar = conectarAvisos();
    const reloj = window.setInterval(revisar, 60_000); // respaldo por si la conexión en vivo falla
    window.addEventListener("hashchange", revisar);
    window.addEventListener("dulzura:avisos", revisar); // aviso del servidor o una pantalla resolvió algo
    return () => {
      desconectar();
      window.clearInterval(reloj);
      window.removeEventListener("hashchange", revisar);
      window.removeEventListener("dulzura:avisos", revisar);
    };
  }, []);

  // La pestaña del navegador también avisa: «(2) Dulzura…» si hay chats esperando a la dueña.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = chatsEsperando > 0 ? `(${chatsEsperando}) ${base}` : base;
  }, [chatsEsperando]);

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
        items={whatsapp ? menu : menu.filter((m) => m.clave !== "atencion")}
        insignias={{ pedidos: porAtender, atencion: chatsEsperando }}
        actual={actual}
        abierto={menuAbierto}
        colapsado={colapsado}
        alternarColapsado={alternarColapsado}
        elegir={(clave) => {
          window.location.hash = clave;
        }}
        cerrar={() => setMenuAbierto(false)}
        pie={
          <>
            <EstadoRespaldo compacto={colapsado} />
            {!colapsado && <VersionErp />}
          </>
        }
      />
      <div className="app__principal">
        <Topbar
          titulo={titulo}
          tema={tema}
          alternarTema={alternarTema}
          abrirMenu={() => setMenuAbierto(true)}
          bloquear={bloquear}
          cambiarPin={() => setCambiandoPin(true)}
        />
        <main className="app__contenido">
          <Componente />
        </main>
      </div>
      {cambiandoPin && <CambiarPin cerrar={() => setCambiandoPin(false)} />}
    </div>
  );
}
