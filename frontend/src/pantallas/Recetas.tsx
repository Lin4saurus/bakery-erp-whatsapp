import { useEffect, useState } from "react";
import { MdDeleteOutline } from "react-icons/md";
import {
  api,
  mensajeDeError,
  type CostoProducto,
  type DatosProducto,
  type Insumo,
  type Producto,
  type TipoProducto,
  type UnidadMedida,
} from "../api";
import { bs, cantidad, costoUnidad, esNumeroValido, nombreUnidad, normalizarNumero, porcentaje, unidadCorta } from "../formato";
import { Aviso, Campo, Cargando, Panel, Tarjeta, Ventana, useDatos } from "../ui";
import "./Recetas.css";

// Valor del selector de categoría que abre el campo para escribir una nueva (D63).
const NUEVA = "__nueva__";

export function Recetas() {
  const productos = useDatos(() => api.productos());
  const insumos = useDatos(api.insumos);
  const [seleccionadoId, setSeleccionadoId] = useState<number | null>(null);
  const [creando, setCreando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [borrandoCategoria, setBorrandoCategoria] = useState<string | null>(null); // D64

  // Al entrar, se abre el primer producto de venta.
  useEffect(() => {
    if (seleccionadoId === null && !creando && productos.datos?.[0]) {
      const primero = productos.datos.find((p) => p.tipo === "VENTA") ?? productos.datos[0];
      setSeleccionadoId(primero.id);
    }
  }, [productos.datos, seleccionadoId, creando]);

  const seleccionado = productos.datos?.find((p) => p.id === seleccionadoId) ?? null;
  // Recetas y precios es el recetario (D63): sin «Inactivos»; cada receta va en su familia.
  const aLaVenta = productos.datos?.filter((p) => p.tipo === "VENTA") ?? [];
  const grupos: { titulo: string; lista: Producto[] }[] = [
    { titulo: "Productos de venta", lista: aLaVenta },
    { titulo: "Rellenos y preparaciones", lista: productos.datos?.filter((p) => p.tipo === "INTERMEDIO") ?? [] },
  ];
  // Categorías que ya existen, para elegir al crear o editar (D63).
  const categoriasDe = (tipo: TipoProducto) =>
    [...new Set((productos.datos ?? []).filter((p) => p.tipo === tipo).map((p) => p.categoria))].sort((a, b) =>
      a.localeCompare(b, "es"),
    );
  // Productos de venta por familia, como en la Caja (D61): la familia con más productos primero y,
  // dentro, orden alfabético (los números como números: «4 u» antes que «9 u» y «16 u»).
  const familias = [...new Set(aLaVenta.map((p) => p.categoria))].sort(
    (a, b) =>
      aLaVenta.filter((p) => p.categoria === b).length - aLaVenta.filter((p) => p.categoria === a).length || a.localeCompare(b),
  );
  const deLaFamilia = (f: string) =>
    aLaVenta
      .filter((p) => p.categoria === f)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true, sensitivity: "base" }));
  // Familias abiertas; la del producto elegido se abre sola.
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (seleccionado?.tipo === "VENTA")
      setAbiertas((a) => (a.has(seleccionado.categoria) ? a : new Set(a).add(seleccionado.categoria)));
  }, [seleccionado?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const alternar = (f: string) =>
    setAbiertas((a) => {
      const nuevas = new Set(a);
      if (nuevas.has(f)) nuevas.delete(f);
      else nuevas.add(f);
      return nuevas;
    });

  const botonProducto = (p: Producto, rama?: "media" | "ultima") => {
    const pierde = p.gananciaUnitaria !== null && Number(p.gananciaUnitaria) < 0;
    return (
      <li key={p.id}>
        <button
          className={p.id === seleccionadoId ? "activo" : undefined}
          onClick={() => {
            setCreando(false);
            setSeleccionadoId(p.id);
            setAviso(null);
          }}
        >
          <span>
            {rama && (
              <span className="lista-rama" aria-hidden>
                {rama === "ultima" ? "└─ " : "├─ "}
              </span>
            )}
            {p.nombre}
          </span>
          {p.tipo === "VENTA" && (
            <span className={`etiqueta ${pierde ? "etiqueta-negativa" : "etiqueta-positiva"}`}>
              {porcentaje(p.margenPorcentaje)}
            </span>
          )}
        </button>
      </li>
    );
  };

  return (
    <>
      <div className="cabecera-pantalla">
        <div>
          <h1>Recetas y precios</h1>
          <p>Cantidades por tanda, rendimiento y precio de venta. El costo se calcula con los precios actuales.</p>
        </div>
        <button
          className="boton boton-primario"
          onClick={() => {
            setCreando(true);
            setSeleccionadoId(null);
            setAviso(null);
          }}
        >
          Nuevo producto
        </button>
      </div>

      {productos.error && <Aviso tipo="error">{productos.error}</Aviso>}
      {aviso && <Aviso tipo="ok">{aviso}</Aviso>}

      <div className="recetas">
        <Panel titulo="Productos">
          {productos.cargando && !productos.datos ? (
            <Cargando />
          ) : (
            <ul className="lista-productos">
              {grupos
                .filter((g) => g.lista.length > 0)
                .map((grupo) => (
                  <li key={grupo.titulo}>
                    <div className="lista-grupo">{grupo.titulo}</div>
                    <ul className="lista-productos" style={{ padding: 0 }}>
                      {grupo.lista === aLaVenta
                        ? familias.map((f) => {
                            const lista = deLaFamilia(f);
                            const abierta = abiertas.has(f);
                            return (
                              <li key={`f-${f}`}>
                                <div className="lista-familia__fila">
                                  <button className="lista-familia" aria-expanded={abierta} onClick={() => alternar(f)}>
                                    <span>
                                      <span className="lista-familia__flecha" aria-hidden>
                                        {abierta ? "▼" : "▶"}
                                      </span>{" "}
                                      {f}
                                    </span>
                                    <span className="secundario">{lista.length}</span>
                                  </button>
                                  <button
                                    className="lista-familia__borrar"
                                    title={`Borrar la categoría ${f}`}
                                    aria-label={`Borrar la categoría ${f}`}
                                    onClick={() => setBorrandoCategoria(f)}
                                  >
                                    <MdDeleteOutline aria-hidden />
                                  </button>
                                </div>
                                {abierta && (
                                  <ul className="lista-productos lista-productos--hijos">
                                    {lista.map((p, i) => botonProducto(p, i === lista.length - 1 ? "ultima" : "media"))}
                                  </ul>
                                )}
                              </li>
                            );
                          })
                        : grupo.lista.map((p) => botonProducto(p))}
                    </ul>
                  </li>
                ))}
            </ul>
          )}
        </Panel>

        <div>
          {creando && (
            <Panel titulo="Nuevo producto">
              <div className="panel-cuerpo">
                <FormularioProducto
                  textoBoton="Crear producto"
                  categoriasDe={categoriasDe}
                  guardar={async (datos) => {
                    const nuevo = await api.crearProducto(datos);
                    await productos.recargar();
                    setCreando(false);
                    setSeleccionadoId(nuevo.id);
                  }}
                  cancelar={() => setCreando(false)}
                />
              </div>
            </Panel>
          )}
          {borrandoCategoria && (
            <BorrarCategoria
              categoria={borrandoCategoria}
              recetas={deLaFamilia(borrandoCategoria)}
              cerrar={() => setBorrandoCategoria(null)}
              borrada={async (texto) => {
                if (seleccionado?.tipo === "VENTA" && seleccionado.categoria === borrandoCategoria) setSeleccionadoId(null);
                setBorrandoCategoria(null);
                await productos.recargar();
                setAviso(texto);
              }}
            />
          )}
          {seleccionado && insumos.datos && productos.datos && (
            <DetalleProducto
              key={seleccionado.id}
              producto={seleccionado}
              insumos={insumos.datos}
              intermedios={productos.datos.filter((p) => p.tipo === "INTERMEDIO" && p.id !== seleccionado.id)}
              categoriasDe={categoriasDe}
              alCambiar={productos.recargar}
              alBorrar={async (texto) => {
                setSeleccionadoId(null);
                await productos.recargar();
                setAviso(texto);
              }}
            />
          )}
        </div>
      </div>
    </>
  );
}

// ---------- Borrar una categoría (D64) ----------

// Muestra qué recetas se pierden y pide escribir el nombre de la categoría para confirmar.
function BorrarCategoria({
  categoria,
  recetas,
  cerrar,
  borrada,
}: {
  categoria: string;
  recetas: Producto[];
  cerrar: () => void;
  borrada: (mensaje: string) => Promise<void>;
}) {
  const [escrito, setEscrito] = useState("");
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const coincide = escrito.trim().toLocaleLowerCase("es") === categoria.toLocaleLowerCase("es");

  const borrar = async () => {
    setBorrando(true);
    setError(null);
    try {
      const r = await api.borrarCategoria(categoria, "VENTA");
      await borrada(
        `Se borró la categoría «${r.categoria}» con ${r.borradas.length} receta(s).` +
          (r.conservanVentas.length > 0 ? ` Las ventas de ${r.conservanVentas.join(", ")} siguen en el Historial.` : "") +
          ` Respaldo previo: ${r.respaldo}.`,
      );
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setBorrando(false);
    }
  };

  return (
    <Ventana titulo={`Borrar la categoría ${categoria}`} subtitulo="No se puede deshacer desde la pantalla" cerrar={cerrar}>
      <div className="panel-cuerpo recetas__borrar-categoria">
        {error && <Aviso tipo="error">{error}</Aviso>}
        <p>
          Se borrarán estas <strong>{recetas.length} recetas</strong> de {categoria}:
        </p>
        <ul>
          {recetas.map((p) => (
            <li key={p.id}>{p.nombre}</li>
          ))}
        </ul>
        <p className="secundario">
          Las ventas que ya tienes de estos productos se quedan en el Historial. Antes de borrar se hace un respaldo automático.
        </p>
        <Campo etiqueta={`Para confirmar, escribe «${categoria}»`}>
          <input value={escrito} onChange={(e) => setEscrito(e.target.value)} placeholder={categoria} autoFocus />
        </Campo>
        <div className="fila-botones">
          <button className="boton boton-peligro" disabled={!coincide || borrando} onClick={() => void borrar()}>
            {borrando ? "Borrando…" : `Borrar ${categoria}`}
          </button>
          <button className="boton" onClick={cerrar}>
            Cancelar
          </button>
        </div>
      </div>
    </Ventana>
  );
}

// ---------- Datos del producto ----------

function FormularioProducto({
  producto,
  textoBoton,
  categoriasDe,
  guardar,
  cancelar,
}: {
  producto?: Producto;
  textoBoton: string;
  categoriasDe: (tipo: TipoProducto) => string[];
  guardar: (datos: DatosProducto) => Promise<void>;
  cancelar?: () => void;
}) {
  const [datos, setDatos] = useState({
    nombre: producto?.nombre ?? "",
    categoria: producto?.categoria ?? categoriasDe(producto?.tipo ?? "VENTA")[0] ?? "",
    tipo: producto?.tipo ?? ("VENTA" as TipoProducto),
    rendimientoReceta: producto?.rendimientoReceta ?? "",
    unidadRendimiento: producto?.unidadRendimiento ?? ("UNIDAD" as UnidadMedida),
    precioVenta: producto?.precioVenta ?? "",
    unidadesPorVenta: producto?.unidadesPorVenta ?? "1",
    activo: producto?.activo ?? true, // sin selector (D59): al guardar se conserva el estado actual
  });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const cambiar = <K extends keyof typeof datos>(campo: K, valor: (typeof datos)[K]) => {
    setGuardado(false);
    setDatos((previo) => ({ ...previo, [campo]: valor }));
  };
  const esVenta = datos.tipo === "VENTA";
  const categorias = categoriasDe(datos.tipo);
  const [nuevaCategoria, setNuevaCategoria] = useState(false);

  const enviar = async () => {
    setGuardando(true);
    setError(null);
    try {
      await guardar({
        ...datos,
        rendimientoReceta: normalizarNumero(datos.rendimientoReceta),
        precioVenta: esVenta && datos.precioVenta.trim() ? normalizarNumero(datos.precioVenta) : null,
        unidadesPorVenta: esVenta ? normalizarNumero(datos.unidadesPorVenta) : "1",
      });
      setGuardado(true);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="formulario recetas__datos">
        <Campo etiqueta="Nombre">
          <input value={datos.nombre} onChange={(e) => cambiar("nombre", e.target.value)} />
        </Campo>
        <Campo etiqueta="Categoría">
          {/* Las que ya existen (D63); «Nueva categoría…» deja escribir otra. */}
          {nuevaCategoria ? (
            <input
              value={datos.categoria}
              onChange={(e) => cambiar("categoria", e.target.value)}
              placeholder="Nombre de la categoría"
              autoFocus
            />
          ) : (
            <select
              value={datos.categoria}
              onChange={(e) => {
                if (e.target.value === NUEVA) {
                  setNuevaCategoria(true);
                  cambiar("categoria", "");
                } else cambiar("categoria", e.target.value);
              }}
            >
              {categorias.length === 0 && <option value="">Elegir…</option>}
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value={NUEVA}>+ Nueva categoría…</option>
            </select>
          )}
        </Campo>
        {!producto && (
          <Campo etiqueta="Tipo">
            <select
              value={datos.tipo}
              onChange={(e) => {
                const tipo = e.target.value as TipoProducto;
                cambiar("tipo", tipo);
                cambiar("unidadRendimiento", tipo === "VENTA" ? "UNIDAD" : "GRAMO");
                if (!nuevaCategoria) cambiar("categoria", categoriasDe(tipo)[0] ?? "");
              }}
            >
              <option value="VENTA">Producto de venta</option>
              <option value="INTERMEDIO">Relleno / preparación</option>
            </select>
          </Campo>
        )}
        <Campo
          etiqueta={`Rinde (${esVenta ? "unidades" : unidadCorta[datos.unidadRendimiento]})`}
          ayuda={esVenta ? "Unidades que salen con estos ingredientes" : "Peso o volumen que sale"}
        >
          <input
            inputMode="decimal"
            value={datos.rendimientoReceta}
            onChange={(e) => cambiar("rendimientoReceta", e.target.value)}
          />
        </Campo>
        {!esVenta && (
          <Campo etiqueta="Se mide en">
            <select
              value={datos.unidadRendimiento}
              onChange={(e) => cambiar("unidadRendimiento", e.target.value as UnidadMedida)}
            >
              {Object.entries(nombreUnidad).map(([valor, texto]) => (
                <option key={valor} value={valor}>
                  {texto}
                </option>
              ))}
            </select>
          </Campo>
        )}
        {esVenta && (
          <Campo etiqueta="Unidades por paquete" ayuda="4 en un pack de 4; 1 si se vende suelto">
            <input
              inputMode="decimal"
              value={datos.unidadesPorVenta}
              onChange={(e) => cambiar("unidadesPorVenta", e.target.value)}
            />
          </Campo>
        )}
        {esVenta && (
          <Campo
            etiqueta="Precio de venta (Bs)"
            ayuda={Number(normalizarNumero(datos.unidadesPorVenta)) > 1 ? "Del paquete entero" : undefined}
          >
            <input inputMode="decimal" value={datos.precioVenta} onChange={(e) => cambiar("precioVenta", e.target.value)} />
          </Campo>
        )}
      </div>
      <div className="fila-botones" style={{ marginTop: 14 }}>
        <button
          className="boton boton-primario"
          disabled={
            guardando ||
            !datos.categoria.trim() ||
            !esNumeroValido(datos.rendimientoReceta) ||
            (esVenta && !(esNumeroValido(datos.unidadesPorVenta) && Number(normalizarNumero(datos.unidadesPorVenta)) > 0))
          }
          onClick={() => void enviar()}
        >
          {guardando ? "Guardando…" : textoBoton}
        </button>
        {cancelar && (
          <button className="boton" onClick={cancelar}>
            Cancelar
          </button>
        )}
        {guardado && producto && <span className="positivo">Guardado ✓</span>}
      </div>
    </>
  );
}

// ---------- Receta ----------

interface LineaBorrador {
  id: number; // insumoId o subProductoId
  nombre: string;
  unidad: UnidadMedida;
  cantidad: string;
  costoUnitario: string;
  empaque?: boolean; // caja, etiqueta, envase: por lo que se vende, no por tanda (D60)
}

const desdeCosto = (costo: CostoProducto) => ({
  ingredientes: costo.insumos.map((l) => ({
    id: l.insumoId,
    nombre: l.nombre,
    unidad: l.unidadBase,
    cantidad: l.cantidad,
    costoUnitario: l.costoUnitario,
    empaque: l.esEmpaque,
  })),
  subRecetas: costo.subRecetas.map((l) => ({
    id: l.subProductoId,
    nombre: l.nombre,
    unidad: l.unidad,
    cantidad: l.cantidad,
    costoUnitario: l.costoUnitario,
  })),
});

const costoLinea = (linea: LineaBorrador): number | null =>
  esNumeroValido(linea.cantidad) ? Number(normalizarNumero(linea.cantidad)) * Number(linea.costoUnitario) : null;

function DetalleProducto({
  producto,
  insumos,
  intermedios,
  categoriasDe,
  alCambiar,
  alBorrar,
}: {
  producto: Producto;
  insumos: Insumo[];
  intermedios: Producto[];
  categoriasDe: (tipo: TipoProducto) => string[];
  alCambiar: () => Promise<void>;
  alBorrar: (mensaje: string) => Promise<void>;
}) {
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const borrar = async () => {
    setBorrando(true);
    setError(null);
    try {
      const { conservaVentas } = await api.borrarProducto(producto.id);
      await alBorrar(
        `Se borró la receta de «${producto.nombre}».${conservaVentas ? " Sus ventas anteriores siguen en el Historial." : ""}`,
      );
    } catch (e) {
      setError(mensajeDeError(e));
      setConfirmarBorrado(false);
    } finally {
      setBorrando(false);
    }
  };
  const costo = useDatos(() => api.costo(producto.id), [producto.id]);
  const [ingredientes, setIngredientes] = useState<LineaBorrador[]>([]);
  const [subRecetas, setSubRecetas] = useState<LineaBorrador[]>([]);
  const [cambiado, setCambiado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [nuevoInsumo, setNuevoInsumo] = useState("");
  const [nuevaSub, setNuevaSub] = useState("");

  useEffect(() => {
    if (costo.datos) {
      const borrador = desdeCosto(costo.datos);
      setIngredientes(borrador.ingredientes);
      setSubRecetas(borrador.subRecetas);
      setCambiado(false);
    }
  }, [costo.datos]);

  const marcar = () => {
    setCambiado(true);
    setMensaje(null);
  };

  const editarCantidad = (lista: "ing" | "sub", id: number, valor: string) => {
    const actualizar = (l: LineaBorrador[]) => l.map((x) => (x.id === id ? { ...x, cantidad: valor } : x));
    if (lista === "ing") setIngredientes(actualizar);
    else setSubRecetas(actualizar);
    marcar();
  };

  const quitar = (lista: "ing" | "sub", id: number) => {
    if (lista === "ing") setIngredientes((l) => l.filter((x) => x.id !== id));
    else setSubRecetas((l) => l.filter((x) => x.id !== id));
    marcar();
  };

  const agregarInsumo = () => {
    const insumo = insumos.find((i) => i.id === Number(nuevoInsumo));
    if (!insumo) return;
    setIngredientes((l) => [
      ...l,
      {
        id: insumo.id,
        nombre: insumo.nombre,
        unidad: insumo.unidadBase,
        cantidad: "",
        costoUnitario: insumo.costoUnitario,
        empaque: producto.tipo === "VENTA" && insumo.categoria === "EMPAQUE",
      },
    ]);
    setNuevoInsumo("");
    marcar();
  };

  const agregarSub = () => {
    const sub = intermedios.find((p) => p.id === Number(nuevaSub));
    if (!sub) return;
    setSubRecetas((l) => [
      ...l,
      { id: sub.id, nombre: sub.nombre, unidad: sub.unidadRendimiento, cantidad: "", costoUnitario: sub.costoUnitario },
    ]);
    setNuevaSub("");
    marcar();
  };

  const guardarReceta = async () => {
    setGuardando(true);
    setError(null);
    try {
      const resultado = await api.guardarReceta(producto.id, {
        ingredientes: ingredientes.map((l) => ({ insumoId: l.id, cantidad: normalizarNumero(l.cantidad) })),
        subRecetas: subRecetas.map((l) => ({ subProductoId: l.id, cantidad: normalizarNumero(l.cantidad) })),
      });
      const borrador = desdeCosto(resultado);
      setIngredientes(borrador.ingredientes);
      setSubRecetas(borrador.subRecetas);
      setCambiado(false);
      setMensaje(
        `Receta guardada. Costo ${Number(resultado.unidadesPorVenta) > 1 ? "del paquete" : "por unidad"}: ${bs(resultado.costoUnitario)}.`,
      );
      void alCambiar();
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  };

  // Vista previa del costo con lo que se está editando (la API recalcula al guardar). D60: los ingredientes se
  // dividen por el rinde; los empaques van enteros por lo que se vende (1 caja y 1 etiqueta por pack).
  const lineas = [...ingredientes, ...subRecetas];
  const sumar = (l: LineaBorrador[]) => l.reduce((total, x) => total + (costoLinea(x) ?? 0), 0);
  const deTanda = [...ingredientes.filter((l) => !l.empaque), ...subRecetas];
  const empaques = ingredientes.filter((l) => l.empaque);
  const esVenta = producto.tipo === "VENTA";
  const porPaquete = esVenta ? Number(producto.unidadesPorVenta) || 1 : 1;
  const esPack = porPaquete > 1;
  const costoEmpaque = sumar(empaques);
  const costoUnitario = (sumar(deTanda) / Number(producto.rendimientoReceta)) * porPaquete + costoEmpaque; // de lo vendido
  const precio = producto.precioVenta === null ? null : Number(producto.precioVenta);
  const ganancia = precio === null ? null : precio - costoUnitario;
  const u = esVenta ? "unidad" : unidadCorta[producto.unidadRendimiento];
  // «Limpieza y otros» es un gasto: no va en las recetas (D60).
  const disponibles = insumos.filter((i) => i.categoria !== "GASTO_INDIRECTO" && !ingredientes.some((l) => l.id === i.id));
  const subDisponibles = intermedios.filter((p) => !subRecetas.some((l) => l.id === p.id));
  const todasValidas = lineas.every((l) => esNumeroValido(l.cantidad) && Number(normalizarNumero(l.cantidad)) > 0);

  return (
    <>
      <Panel
        titulo={producto.nombre}
        acciones={
          !confirmarBorrado && (
            <button className="boton boton-chico boton-peligro" onClick={() => setConfirmarBorrado(true)}>
              Borrar receta
            </button>
          )
        }
      >
        <div className="panel-cuerpo">
          {confirmarBorrado && (
            <div className="recetas__borrar">
              <span>
                ¿Borrar la receta de <strong>{producto.nombre}</strong>? No se puede deshacer. Si tiene ventas, siguen en el
                Historial.
              </span>
              <div className="fila-botones">
                <button className="boton boton-peligro" disabled={borrando} onClick={() => void borrar()}>
                  {borrando ? "Borrando…" : "Sí, borrar"}
                </button>
                <button className="boton" onClick={() => setConfirmarBorrado(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
          <FormularioProducto
            producto={producto}
            categoriasDe={categoriasDe}
            textoBoton="Guardar datos"
            guardar={async (datos) => {
              await api.actualizarProducto(producto.id, datos);
              await alCambiar(); // "Guardado" aparece cuando los costos ya están actualizados
            }}
          />
        </div>
      </Panel>

      <div className="grilla-tarjetas recetas__tarjetas">
        <Tarjeta
          titulo={`Costo por ${u}`}
          valor={esVenta ? bs(costoUnitario / porPaquete) : costoUnidad(String(costoUnitario))}
          detalle={
            esPack
              ? `Paquete de ${cantidad(porPaquete)}: ${bs(costoUnitario)} con ${bs(costoEmpaque)} de empaque`
              : esVenta && costoEmpaque > 0
                ? `Incluye ${bs(costoEmpaque)} de empaque`
                : `La receta rinde ${cantidad(producto.rendimientoReceta, 4)} ${esVenta ? "u" : u}`
          }
        />
        {esVenta && (
          <Tarjeta
            titulo="Precio de venta"
            valor={bs(precio)}
            detalle={
              esPack && precio !== null ? `Paquete de ${cantidad(porPaquete)} · ${bs(precio / porPaquete)} c/u` : undefined
            }
          />
        )}
        {esVenta && (
          <Tarjeta
            titulo="Ganancia por unidad"
            valor={bs(ganancia === null ? null : ganancia / porPaquete)}
            detalle={precio ? `Margen ${porcentaje(String(((ganancia ?? 0) / precio) * 100))}` : undefined}
            tono={ganancia === null ? undefined : ganancia < 0 ? "negativo" : "positivo"}
          />
        )}
        {esVenta && esPack && (
          <Tarjeta
            titulo="Ganancia total del pack"
            valor={bs(ganancia)}
            detalle={`Por vender el paquete de ${cantidad(porPaquete)}`}
            tono={ganancia === null ? undefined : ganancia < 0 ? "negativo" : "positivo"}
          />
        )}
      </div>

      {costo.error && <Aviso tipo="error">{costo.error}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}
      {mensaje && <Aviso tipo="ok">{mensaje}</Aviso>}
      {cambiado && <Aviso tipo="alerta">Hay cambios sin guardar en la receta. Los costos de arriba ya los incluyen.</Aviso>}

      <Panel
        titulo="Receta (una tanda)"
        acciones={
          <button
            className="boton boton-primario"
            disabled={!cambiado || guardando || !todasValidas}
            onClick={() => void guardarReceta()}
          >
            {guardando ? "Guardando…" : "Guardar receta"}
          </button>
        }
      >
        {costo.cargando && !costo.datos ? (
          <Cargando />
        ) : (
          <>
            <div className="tabla-envoltura">
              <table>
                <thead>
                  <tr>
                    <th>Ingrediente</th>
                    <th className="num">Cantidad</th>
                    <th className="num">Costo por unidad</th>
                    <th className="num">Costo</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {esVenta && lineas.length > 0 && (
                    <tr className="recetas__grupo">
                      <td colSpan={5}>Ingredientes · para {cantidad(producto.rendimientoReceta, 4)} u</td>
                    </tr>
                  )}
                  {ingredientes
                    .filter((l) => !l.empaque)
                    .map((l) => (
                      <FilaReceta
                        key={`i${l.id}`}
                        linea={l}
                        cambiar={(v) => editarCantidad("ing", l.id, v)}
                        quitar={() => quitar("ing", l.id)}
                      />
                    ))}
                  {subRecetas.map((l) => (
                    <FilaReceta
                      key={`s${l.id}`}
                      linea={l}
                      etiqueta="Relleno"
                      cambiar={(v) => editarCantidad("sub", l.id, v)}
                      quitar={() => quitar("sub", l.id)}
                    />
                  ))}
                  {empaques.length > 0 && (
                    <tr className="recetas__grupo">
                      <td colSpan={5}>Empaques · {esPack ? "por paquete vendido" : "por unidad vendida"}</td>
                    </tr>
                  )}
                  {empaques.map((l) => (
                    <FilaReceta
                      key={`e${l.id}`}
                      linea={l}
                      cambiar={(v) => editarCantidad("ing", l.id, v)}
                      quitar={() => quitar("ing", l.id)}
                    />
                  ))}
                  {lineas.length === 0 && (
                    <tr>
                      <td colSpan={5} className="secundario">
                        La receta está vacía. Agrega ingredientes abajo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="pie-tabla">
              <Campo etiqueta="Agregar ingrediente o empaque">
                <select value={nuevoInsumo} onChange={(e) => setNuevoInsumo(e.target.value)}>
                  <option value="">Elegir insumo…</option>
                  {disponibles.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.nombre} ({unidadCorta[i.unidadBase]})
                    </option>
                  ))}
                </select>
              </Campo>
              <button className="boton" disabled={!nuevoInsumo} onClick={agregarInsumo}>
                Agregar
              </button>
              {subDisponibles.length > 0 && (
                <>
                  <Campo etiqueta="Agregar relleno">
                    <select value={nuevaSub} onChange={(e) => setNuevaSub(e.target.value)}>
                      <option value="">Elegir relleno…</option>
                      {subDisponibles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre} ({unidadCorta[p.unidadRendimiento]})
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <button className="boton" disabled={!nuevaSub} onClick={agregarSub}>
                    Agregar
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </Panel>
    </>
  );
}

function FilaReceta({
  linea,
  etiqueta,
  cambiar,
  quitar,
}: {
  linea: LineaBorrador;
  etiqueta?: string;
  cambiar: (valor: string) => void;
  quitar: () => void;
}) {
  const u = unidadCorta[linea.unidad];
  const costo = costoLinea(linea);
  return (
    <tr>
      <td>
        {linea.nombre} {etiqueta && <span className="etiqueta etiqueta-neutra">{etiqueta}</span>}
      </td>
      <td className="num">
        <input className="chico" inputMode="decimal" value={linea.cantidad} onChange={(e) => cambiar(e.target.value)} /> {u}
      </td>
      <td className="num secundario">
        {costoUnidad(linea.costoUnitario)} / {u}
      </td>
      <td className="num">{costo === null ? "—" : bs(costo)}</td>
      <td>
        <button className="boton boton-chico boton-peligro" onClick={quitar} aria-label={`Quitar ${linea.nombre}`}>
          Quitar
        </button>
      </td>
    </tr>
  );
}
