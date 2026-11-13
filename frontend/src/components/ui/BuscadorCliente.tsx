import { useId, useState, type KeyboardEvent } from "react";
import type { Cliente } from "../../api";
import { TipoClienteBadge } from "./TipoClienteBadge";
import "./BuscadorCliente.css";

// Sin tildes ni mayúsculas, con un solo espacio: «Marco  Aurélio» → «marco aurelio».
const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.\-_'’]/g, " ") // puntos y guiones cuentan como espacio (D45, S5): «María-José» = «Maria José»
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

// Sugerencias como en un buscador: primero los que empiezan con lo escrito, después los que tienen
// una palabra que empieza así, y al final los que lo contienen en cualquier parte.
export function buscarClientes(clientes: Cliente[], texto: string, maximo = 6): Cliente[] {
  const q = normalizar(texto);
  if (!q) return [];
  const puntaje = (c: Cliente): number => {
    const n = normalizar(c.nombre);
    if (n.startsWith(q)) return 0;
    if (q.split(" ").every((parte) => n.split(" ").some((palabra) => palabra.startsWith(parte)))) return 1;
    if (n.includes(q)) return 2;
    return -1;
  };
  return clientes
    .map((c) => ({ c, p: puntaje(c) }))
    .filter((x) => x.p >= 0)
    .sort((a, b) => a.p - b.p || Number(b.c.tipo === "MAYORISTA") - Number(a.c.tipo === "MAYORISTA") || a.c.nombre.localeCompare(b.c.nombre))
    .slice(0, maximo)
    .map((x) => x.c);
}

export const mismoNombre = (a: string, b: string) => normalizar(a) === normalizar(b);

// Resalta en negrita la parte del nombre que coincide con lo escrito.
function Resaltado({ nombre, texto }: { nombre: string; texto: string }) {
  const q = normalizar(texto);
  const letras = [...nombre].map((l) => normalizar(l) || " ");
  const plano = letras.join("");
  const inicio = q ? plano.indexOf(q) : -1;
  if (inicio < 0) return <>{nombre}</>;
  const chars = [...nombre];
  return (
    <>
      {chars.slice(0, inicio).join("")}
      <strong>{chars.slice(inicio, inicio + q.length).join("")}</strong>
      {chars.slice(inicio + q.length).join("")}
    </>
  );
}

// Campo de nombre con sugerencias mientras se escribe; un clic (o Enter) elige al cliente.
export function BuscadorCliente({
  clientes,
  texto,
  alCambiarTexto,
  alElegir,
  placeholder = "Escribe el nombre…",
  autoFocus = false,
}: {
  clientes: Cliente[];
  texto: string;
  alCambiarTexto: (texto: string) => void;
  alElegir: (cliente: Cliente) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const idLista = useId();
  const [abierto, setAbierto] = useState(false);
  const [marcado, setMarcado] = useState(0);
  const sugerencias = buscarClientes(clientes, texto).filter((c) => !mismoNombre(c.nombre, texto));
  const visible = abierto && sugerencias.length > 0;

  const elegir = (c: Cliente) => {
    alElegir(c);
    setAbierto(false);
  };

  const teclas = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!visible) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMarcado((m) => (m + 1) % sugerencias.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMarcado((m) => (m - 1 + sugerencias.length) % sugerencias.length);
    } else if (e.key === "Enter") {
      const c = sugerencias[marcado];
      if (c) {
        e.preventDefault();
        elegir(c);
      }
    } else if (e.key === "Escape") {
      setAbierto(false);
    }
  };

  return (
    <div className="buscador">
      <input
        value={texto}
        onChange={(e) => {
          alCambiarTexto(e.target.value);
          setAbierto(true);
          setMarcado(0);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setAbierto(false)}
        onKeyDown={teclas}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-expanded={visible}
        aria-controls={idLista}
        aria-autocomplete="list"
      />
      {visible && (
        <ul className="buscador__lista" id={idLista} role="listbox">
          {sugerencias.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === marcado}
              className={`buscador__opcion ${i === marcado ? "buscador__opcion--marcada" : ""}`}
              // mousedown en vez de click: elige antes de que el campo pierda el foco
              onMouseDown={(e) => {
                e.preventDefault();
                elegir(c);
              }}
              onMouseEnter={() => setMarcado(i)}
            >
              <span className="buscador__nombre">
                <Resaltado nombre={c.nombre} texto={texto} />
              </span>
              <span className="buscador__detalle">
                {c.celular ?? "sin celular"} <TipoClienteBadge tipo={c.tipo} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
