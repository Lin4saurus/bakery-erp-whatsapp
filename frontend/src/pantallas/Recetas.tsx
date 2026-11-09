import { useEffect, useState } from "react";
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
import { Aviso, Campo, Cargando, Panel, Tarjeta, useDatos } from "../ui";
import "./Recetas.css";

export function Recetas() {
  const productos = useDatos(() => api.productos());
  const insumos = useDatos(api.insumos);
  const [seleccionadoId, setSeleccionadoId] = useState<number | null>(null);
  const [creando, setCreando] = useState(false);

  // Al entrar, se abre el primer producto de venta.
  useEffect(() => {
    if (seleccionadoId === null && !creando && productos.datos?.[0]) {
      const primero = productos.datos.find((p) => p.tipo === "VENTA" && p.activo) ?? productos.datos[0];
      setSeleccionadoId(primero.id);
    }
  }, [productos.datos, seleccionadoId, creando]);

  const seleccionado = productos.datos?.find((p) => p.id === seleccionadoId) ?? null;
  const grupos: { titulo: string; lista: Producto[] }[] = [
    { titulo: "Productos de venta", lista: productos.datos?.filter((p) => p.tipo === "VENTA" && p.activo) ?? [] },
    { titulo: "Rellenos y preparaciones", lista: productos.datos?.filter((p) => p.tipo === "INTERMEDIO") ?? [] },
    { titulo: "Inactivos", lista: productos.datos?.filter((p) => p.tipo === "VENTA" && !p.activo) ?? [] },
  ];

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
          }}
        >
          Nuevo producto
        </button>
      </div>

      {productos.error && <Aviso tipo="error">{productos.error}</Aviso>}

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
                      {grupo.lista.map((p) => {
                        const pierde = p.gananciaUnitaria !== null && Number(p.gananciaUnitaria) < 0;
                        return (
                          <li key={p.id}>
                            <button
                              className={p.id === seleccionadoId ? "activo" : undefined}
                              onClick={() => {
                                setCreando(false);
                                setSeleccionadoId(p.id);
                              }}
                            >
                              <span>{p.nombre}</span>
                              {p.tipo === "VENTA" && (
                                <span className={`etiqueta ${pierde ? "etiqueta-negativa" : "etiqueta-positiva"}`}>
                                  {porcentaje(p.margenPorcentaje)}
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
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
          {seleccionado && insumos.datos && productos.datos && (
            <DetalleProducto
              key={seleccionado.id}
              producto={seleccionado}
              insumos={insumos.datos}
              intermedios={productos.datos.filter((p) => p.tipo === "INTERMEDIO" && p.id !== seleccionado.id)}
              alCambiar={productos.recargar}
            />
          )}
        </div>
      </div>
    </>
  );
}

// ---------- Datos del producto ----------

function FormularioProducto({
  producto,
  textoBoton,
  guardar,
  cancelar,
}: {
  producto?: Producto;
  textoBoton: string;
  guardar: (datos: DatosProducto) => Promise<void>;
  cancelar?: () => void;
}) {
  const [datos, setDatos] = useState({
    nombre: producto?.nombre ?? "",
    categoria: producto?.categoria ?? "Queques",
    tipo: producto?.tipo ?? ("VENTA" as TipoProducto),
    rendimientoReceta: producto?.rendimientoReceta ?? "",
    unidadRendimiento: producto?.unidadRendimiento ?? ("UNIDAD" as UnidadMedida),
    precioVenta: producto?.precioVenta ?? "",
    activo: producto?.activo ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const cambiar = <K extends keyof typeof datos>(campo: K, valor: (typeof datos)[K]) => {
    setGuardado(false);
    setDatos((previo) => ({ ...previo, [campo]: valor }));
  };
  const esVenta = datos.tipo === "VENTA";

  const enviar = async () => {
    setGuardando(true);
    setError(null);
    try {
      await guardar({
        ...datos,
        rendimientoReceta: normalizarNumero(datos.rendimientoReceta),
        precioVenta: esVenta && datos.precioVenta.trim() ? normalizarNumero(datos.precioVenta) : null,
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
          <input value={datos.categoria} onChange={(e) => cambiar("categoria", e.target.value)} />
        </Campo>
        {!producto && (
          <Campo etiqueta="Tipo">
            <select
              value={datos.tipo}
              onChange={(e) => {
                const tipo = e.target.value as TipoProducto;
                cambiar("tipo", tipo);
                cambiar("unidadRendimiento", tipo === "VENTA" ? "UNIDAD" : "GRAMO");
              }}
            >
              <option value="VENTA">Producto de venta</option>
              <option value="INTERMEDIO">Relleno / preparación</option>
            </select>
          </Campo>
        )}
        <Campo
          etiqueta={`Rinde (${esVenta ? "unidades" : unidadCorta[datos.unidadRendimiento]})`}
          ayuda={esVenta ? "Cuántos salen de una receta" : "Peso o volumen que sale"}
        >
          <input inputMode="decimal" value={datos.rendimientoReceta} onChange={(e) => cambiar("rendimientoReceta", e.target.value)} />
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
          <Campo etiqueta="Precio de venta (Bs)">
            <input inputMode="decimal" value={datos.precioVenta} onChange={(e) => cambiar("precioVenta", e.target.value)} />
          </Campo>
        )}
        {producto && esVenta && (
          <Campo etiqueta="Estado">
            <select value={datos.activo ? "si" : "no"} onChange={(e) => cambiar("activo", e.target.value === "si")}>
              <option value="si">Activo · en Caja</option>
              <option value="no">Inactivo</option>
            </select>
          </Campo>
        )}
      </div>
      <div className="fila-botones" style={{ marginTop: 14 }}>
        <button
          className="boton boton-primario"
          disabled={guardando || !esNumeroValido(datos.rendimientoReceta)}
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
}

const desdeCosto = (costo: CostoProducto) => ({
  ingredientes: costo.insumos.map((l) => ({
    id: l.insumoId,
    nombre: l.nombre,
    unidad: l.unidadBase,
    cantidad: l.cantidad,
    costoUnitario: l.costoUnitario,
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
  alCambiar,
}: {
  producto: Producto;
  insumos: Insumo[];
  intermedios: Producto[];
  alCambiar: () => Promise<void>;
}) {
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
      { id: insumo.id, nombre: insumo.nombre, unidad: insumo.unidadBase, cantidad: "", costoUnitario: insumo.costoUnitario },
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
      setMensaje(`Receta guardada. Costo por unidad: ${bs(resultado.costoUnitario)}.`);
      void alCambiar();
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  };

  // Vista previa del costo con lo que se está editando (la API recalcula al guardar).
  const lineas = [...ingredientes, ...subRecetas];
  const costoTanda = lineas.reduce((total, l) => total + (costoLinea(l) ?? 0), 0);
  const costoUnitario = costoTanda / Number(producto.rendimientoReceta);
  const precio = producto.precioVenta === null ? null : Number(producto.precioVenta);
  const ganancia = precio === null ? null : precio - costoUnitario;
  const esVenta = producto.tipo === "VENTA";
  const u = esVenta ? "unidad" : unidadCorta[producto.unidadRendimiento];
  const disponibles = insumos.filter((i) => !ingredientes.some((l) => l.id === i.id));
  const subDisponibles = intermedios.filter((p) => !subRecetas.some((l) => l.id === p.id));
  const todasValidas = lineas.every((l) => esNumeroValido(l.cantidad) && Number(normalizarNumero(l.cantidad)) > 0);

  return (
    <>
      <Panel titulo={producto.nombre}>
        <div className="panel-cuerpo">
          <FormularioProducto
            producto={producto}
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
          valor={esVenta ? bs(costoUnitario) : costoUnidad(String(costoUnitario))}
          detalle={`La receta rinde ${cantidad(producto.rendimientoReceta, 4)} ${esVenta ? "u" : u}`}
        />
        {esVenta && <Tarjeta titulo="Precio de venta" valor={bs(precio)} />}
        {esVenta && (
          <Tarjeta
            titulo="Ganancia por unidad"
            valor={bs(ganancia)}
            detalle={precio ? `Margen ${porcentaje(String(((ganancia ?? 0) / precio) * 100))}` : undefined}
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
                  {ingredientes.map((l) => (
                    <FilaReceta key={`i${l.id}`} linea={l} cambiar={(v) => editarCantidad("ing", l.id, v)} quitar={() => quitar("ing", l.id)} />
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
              <Campo etiqueta="Agregar ingrediente">
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
        <input className="chico" inputMode="decimal" value={linea.cantidad} onChange={(e) => cambiar(e.target.value)} />{" "}
        {u}
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
