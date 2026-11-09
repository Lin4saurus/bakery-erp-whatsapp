import "./components/ui/Badge.css";
import "./components/ui/Table.css";

export { useDatos } from "./hooks/useDatos";
export { Aviso } from "./components/ui/Alert";
export { Button } from "./components/ui/Button";
export { Panel } from "./components/ui/Card";
export { Campo } from "./components/ui/Field";
export { Tarjeta } from "./components/ui/StatCard";
export { TipoClienteBadge } from "./components/ui/TipoClienteBadge";
export { BuscadorCliente, buscarClientes, mismoNombre } from "./components/ui/BuscadorCliente";
export { Ventana } from "./components/ui/Ventana";

export const Cargando = () => <p className="vacio">Cargando…</p>;
