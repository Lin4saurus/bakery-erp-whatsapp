import { Fragment, useState, type FormEvent } from "react";
import { api, mensajeDeError, type Cliente, type DatosCliente, type ReporteCliente, type TipoCliente } from "../api";
import { bs, cantidad, esNumeroValido, fechaCorta, normalizarNumero } from "../formato";
import { Aviso, BuscadorCliente, Button, Campo, Cargando, Panel, TipoClienteBadge, Ventana, buscarClientes, useDatos } from "../ui";
import "./Insumos.css"; // mismo panel de 3 columnas que «Editar datos» de Insumos
import "./Clientes.css";

type Filtro = "TODOS" | TipoCliente;
type Tabla = "buscar" | "lista";

const vacio: DatosCliente = { nombre: "", tipo: "MAYORISTA", celular: null, email: null, direccion: null };
const celularValido = (celular: string | null) => (celular ?? "").replace(/\D/g, "").length >= 7;
const nombreTipo: Record<TipoCliente, string> = { MAYORISTA: "Mayorista", MINORISTA: "Minorista" };

// Clientes: tabla con filtro Todos / Minoristas / Mayoristas y buscador con sugerencias (D44).
// Cada mayorista tiene el precio que negoció, producto por producto (D42).
export function Clientes() {
  const clientes = useDatos(() => api.clientes());
  const reporte = useDatos(() => api.reporteClientes());

  const [filtro, setFiltro] = useState<Filtro>("TODOS");
  const [busqueda, setBusqueda] = useState("");
  const [encontradoId, setEncontradoId] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState(false);
  // Fila que se está editando y en qué tabla (así el formulario sale una sola vez).
  const [editando, setEditando] = useState<{ id: string; tabla: Tabla } | null>(null);
  const [historialDe, setHistorialDe] = useState<Cliente | null>(null);
  const [preciosDeId, setPreciosDeId] = useState<string | null>(null);
  const preciosDe = clientes.datos?.find((c) => c.id === preciosDeId) ?? null; // siempre con los datos recién cargados
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visibles = clientes.datos?.filter((c) => filtro === "TODOS" || c.tipo === filtro) ?? [];
  const encontrado = clientes.datos?.find((c) => c.id === encontradoId) ?? null;
  const compras = (id: string) => reporte.datos?.find((r) => r.id === id);

  const recargar = async () => {
    await Promise.all([clientes.recargar(), reporte.recargar()]);
  };

  const terminarEdicion = async (texto: string) => {
    await recargar();
    setEditando(null);
    setNuevo(false);
    setMensaje(texto);
  };

  const fila = (c: Cliente, tabla: Tabla) => {
    const r = compras(c.id);
    const abierto = editando?.id === c.id && editando.tabla === tabla;
    return (
      <Fragment key={c.id}>
      <tr className={abierto ? "fila-abierta" : undefined}>
        {/* Solo el nombre: la dirección está en Editar y los precios acordados en «Precios». */}
        <td>{c.nombre}</td>
        <td>
          <TipoClienteBadge tipo={c.tipo} />
        </td>
        <td>{c.celular ?? "—"}</td>
        <td className="num">
          {r && r.ventas > 0 ? (
            <>
              {bs(r.totalVendido)}
              <div className="secundario clientes__detalle">{r.ventas} pedido(s)</div>
            </>
          ) : (
            "—"
          )}
        </td>
        <td>{r?.ultimoPedido ? fechaCorta(r.ultimoPedido) : "—"}</td>
        <td className="num clientes__acciones">
          <Button tamano="chico" variante="texto" onClick={() => setEditando(abierto ? null : { id: c.id, tabla })}>
            {abierto ? "Cerrar" : "Editar"}
          </Button>
          {c.tipo === "MAYORISTA" && (
            <Button tamano="chico" variante="texto" onClick={() => setPreciosDeId(preciosDeId === c.id ? null : c.id)}>
              {preciosDeId === c.id ? "Ocultar precios" : "Precios"}
            </Button>
          )}
          <Button tamano="chico" variante="texto" onClick={() => setHistorialDe(c)}>
            Historial
          </Button>
        </td>
      </tr>
      {abierto && (
        <tr className="fila-formulario">
          <td colSpan={6}>
            <FormularioCliente
              cliente={c}
              compras={r}
              clientes={clientes.datos ?? []}
              irA={() => undefined}
              cancelar={() => setEditando(null)}
              guardado={terminarEdicion}
            />
          </td>
        </tr>
      )}
      </Fragment>
    );
  };

  const tabla = (filas: Cliente[], origen: Tabla) => (
    <div className="tabla-envoltura">
      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Tipo</th>
            <th>Celular</th>
            <th className="num">Compras</th>
            <th>Último pedido</th>
            <th />
          </tr>
        </thead>
        <tbody>{filas.map((c) => fila(c, origen))}</tbody>
      </table>
    </div>
  );

  return (
    <>
      <div className="cabecera-pantalla">
        <div>
          <h1>Clientes</h1>
          <p>Tus clientes. Para encontrar uno rápido, escribe su nombre en «Buscar cliente».</p>
        </div>
        <Button variante="primario" onClick={() => setNuevo(!nuevo)}>
          {nuevo ? "Cancelar" : "Nuevo cliente"}
        </Button>
      </div>

      {mensaje && <Aviso tipo="ok">{mensaje}</Aviso>}
      {(error ?? clientes.error) && <Aviso tipo="error">{error ?? clientes.error}</Aviso>}

      {nuevo && (
        <Panel titulo="Nuevo cliente">
          <div className="panel-cuerpo">
            <FormularioCliente
              cliente={null}
              clientes={clientes.datos ?? []}
              irA={(c) => {
                // Ya existe: se abre su edición en la lista en lugar de duplicarlo.
                setNuevo(false);
                setFiltro("TODOS");
                setEditando({ id: c.id, tabla: "lista" });
              }}
              cancelar={() => setNuevo(false)}
              guardado={terminarEdicion}
            />
          </div>
        </Panel>
      )}

      <Panel titulo="Buscar cliente">
        <div className="panel-cuerpo clientes__buscar">
          <BuscadorCliente
            clientes={clientes.datos ?? []}
            texto={busqueda}
            alCambiarTexto={(t) => {
              setBusqueda(t);
              if (!t.trim()) setEncontradoId(null);
            }}
            alElegir={(c) => {
              setBusqueda(c.nombre);
              setEncontradoId(c.id);
            }}
            placeholder="Escribe un nombre: Marco, Eliana…"
          />
          {busqueda.trim() !== "" && !encontrado && buscarClientes(clientes.datos ?? [], busqueda).length === 0 && (
            <p className="secundario clientes__detalle">No hay ningún cliente con ese nombre.</p>
          )}
        </div>
        {encontrado && tabla([encontrado], "buscar")}
      </Panel>

      <Panel titulo={`${visibles.length} cliente(s)`}>
        <div className="clientes__filtros">
          <div className="clientes__segmentos" role="group" aria-label="Filtrar por tipo">
            {(["TODOS", "MINORISTA", "MAYORISTA"] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={`clientes__segmento ${filtro === f ? "clientes__segmento--activo" : ""}`}
                onClick={() => setFiltro(f)}
              >
                {f === "TODOS" ? "Todos" : f === "MINORISTA" ? "Minoristas" : "Mayoristas"}
              </button>
            ))}
          </div>
        </div>
        {clientes.cargando && !clientes.datos ? (
          <Cargando />
        ) : visibles.length === 0 ? (
          <p className="vacio">No hay clientes con este filtro.</p>
        ) : (
          tabla(visibles, "lista")
        )}
      </Panel>

      {preciosDe && <PreciosCliente cliente={preciosDe} alCambiar={recargar} cerrar={() => setPreciosDeId(null)} />}

      {historialDe && <HistorialCliente cliente={historialDe} cerrar={() => setHistorialDe(null)} />}
    </>
  );
}

function FormularioCliente({
  cliente,
  compras,
  clientes,
  irA,
  cancelar,
  guardado,
}: {
  cliente: Cliente | null;
  compras?: ReporteCliente;
  clientes: Cliente[];
  irA: (cliente: Cliente) => void; // abrir uno que ya existe en lugar de duplicarlo
  cancelar: () => void;
  guardado: (mensaje: string) => Promise<void>;
}) {
  const inicial: DatosCliente = cliente
    ? { nombre: cliente.nombre, tipo: cliente.tipo, celular: cliente.celular, email: cliente.email, direccion: cliente.direccion }
    : vacio;
  const [datos, setDatos] = useState<DatosCliente>(inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cambiar = <K extends keyof DatosCliente>(campo: K, valor: DatosCliente[K]) => setDatos((d) => ({ ...d, [campo]: valor }));
  const texto = (valor: string) => valor.trim() || null;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      const listo = { ...datos, nombre: datos.nombre.trim() };
      if (cliente) await api.actualizarCliente(cliente.id, listo);
      else await api.crearCliente(listo);
      await guardado(cliente ? `«${listo.nombre}» actualizado.` : `«${listo.nombre}» agregado.`);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  };

  // Lo que cambia respecto de lo guardado (al crear un cliente no hay «antes»).
  const etiquetas: Record<keyof DatosCliente, string> = {
    nombre: "Nombre",
    tipo: "Tipo",
    celular: "Celular",
    email: "Correo",
    direccion: "Dirección",
  };
  const cambios = cliente
    ? (Object.keys(etiquetas) as (keyof DatosCliente)[]).filter((k) => (datos[k] ?? "").toString().trim() !== (inicial[k] ?? "").toString())
    : [];
  const cambiaTipo = cliente !== null && datos.tipo !== inicial.tipo;
  const celularMal = datos.celular !== null && !celularValido(datos.celular);
  const sePuedeGuardar =
    !guardando && datos.nombre.trim() !== "" && (cliente ? !celularMal && cambios.length > 0 : celularValido(datos.celular));

  return (
    <form onSubmit={(e) => void enviar(e)}>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="panel-insumo">
        <div className="panel-insumo__col">
          <Campo etiqueta="Nombre">
            {cliente ? (
              <input value={datos.nombre} onChange={(e) => cambiar("nombre", e.target.value)} maxLength={100} required autoFocus />
            ) : (
              <BuscadorCliente
                clientes={clientes}
                texto={datos.nombre}
                alCambiarTexto={(t) => cambiar("nombre", t)}
                alElegir={irA}
                placeholder="Escribe el nombre: si ya existe, aparece aquí"
                autoFocus
              />
            )}
          </Campo>
          <Campo etiqueta="Tipo" ayuda="Al mayorista se le anotan sus precios acordados.">
            <select value={datos.tipo} onChange={(e) => cambiar("tipo", e.target.value as TipoCliente)}>
              <option value="MAYORISTA">Mayorista</option>
              <option value="MINORISTA">Minorista</option>
            </select>
          </Campo>
        </div>

        <div className="panel-insumo__col">
          <Campo etiqueta={cliente ? "Celular" : "Celular (obligatorio)"} ayuda={celularMal ? "Debe tener al menos 7 dígitos." : undefined}>
            <input value={datos.celular ?? ""} onChange={(e) => cambiar("celular", texto(e.target.value))} inputMode="tel" placeholder="Ej. 71234567" />
          </Campo>
          <Campo etiqueta="Correo (opcional)">
            <input value={datos.email ?? ""} onChange={(e) => cambiar("email", texto(e.target.value))} type="email" />
          </Campo>
          <Campo etiqueta="Dirección (opcional)">
            <input value={datos.direccion ?? ""} onChange={(e) => cambiar("direccion", texto(e.target.value))} />
          </Campo>
        </div>

        <div className="panel-insumo__resumen">
          <div className="panel-insumo__cifras">
            {cambiaTipo && (
              <>
                <div>
                  <span className="secundario">Antes</span>
                  <strong>{nombreTipo[inicial.tipo]}</strong>
                </div>
                <span className="panel-insumo__flecha" aria-hidden>
                  →
                </span>
              </>
            )}
            <div>
              <span className="secundario">{cambiaTipo ? "Ahora" : cliente ? "Compras" : "Cliente nuevo"}</span>
              <strong>
                {cambiaTipo ? nombreTipo[datos.tipo] : cliente ? (compras && compras.ventas > 0 ? bs(compras.totalVendido) : "—") : nombreTipo[datos.tipo]}
              </strong>
            </div>
          </div>
          <div className="secundario">
            {cliente
              ? compras && compras.ventas > 0
                ? `${compras.ventas} pedido(s)${compras.ultimoPedido ? ` · último el ${fechaCorta(compras.ultimoPedido)}` : ""}`
                : "Todavía no tiene compras."
              : `${datos.nombre.trim() || "Escribe el nombre"}${datos.celular ? ` · ${datos.celular}` : ""}`}
          </div>
          {cliente && (
            <div className="panel-insumo__linea">
              {cambios.length === 0 ? (
                <span className="secundario">Sin cambios todavía.</span>
              ) : (
                <>
                  Cambia: <strong>{cambios.map((k) => etiquetas[k]).join(", ")}</strong>
                </>
              )}
            </div>
          )}
          {cambiaTipo && (
            <div className="panel-insumo__diferencia">
              {datos.tipo === "MAYORISTA"
                ? "Pasa a mayorista: le aparece el botón «Precios» para anotar lo que negoció."
                : "Pasa a minorista: deja de tener el botón «Precios»."}
            </div>
          )}
          <div className="fila-botones">
            <Button type="submit" variante="primario" disabled={!sePuedeGuardar}>
              {guardando ? "Guardando…" : cliente ? "Guardar cambios" : "Agregar cliente"}
            </Button>
            <Button onClick={cancelar}>Cancelar</Button>
          </div>
        </div>
      </div>
    </form>
  );
}

// Compras del cliente en una ventana emergente: las de la Caja y las del historial (Excel y notas).
function HistorialCliente({ cliente, cerrar }: { cliente: Cliente; cerrar: () => void }) {
  const ventas = useDatos(api.ventasTodas);
  const historico = useDatos(() => api.historico());
  const filas = [
    ...(ventas.datos?.ventas ?? [])
      .filter((v) => v.clienteId === cliente.id && !v.anulada)
      .map((v) => ({ clave: `v${v.id}`, fecha: v.fecha, producto: v.producto, cantidad: v.cantidad, total: v.totalVenta, sabores: v.sabores })),
    ...(historico.datos?.ventas ?? [])
      .filter((v) => v.clienteId === cliente.id)
      .map((v) => ({ clave: `h${v.id}`, fecha: v.fecha, producto: v.productoNombre, cantidad: v.cantidad, total: v.valor, sabores: v.sabores })),
  ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  const total = filas.reduce((t, f) => t + Number(f.total), 0);

  const cargando = (ventas.cargando && !ventas.datos) || (historico.cargando && !historico.datos);

  return (
    <Ventana
      titulo={
        <>
          Historial de {cliente.nombre} <TipoClienteBadge tipo={cliente.tipo} />
        </>
      }
      subtitulo={cargando ? "Cargando…" : `${filas.length} pedido(s) · ${bs(total)} en total`}
      cerrar={cerrar}
    >
      {(ventas.cargando && !ventas.datos) || (historico.cargando && !historico.datos) ? (
        <Cargando />
      ) : filas.length === 0 ? (
        <p className="vacio">Todavía no tiene compras.</p>
      ) : (
        <div className="tabla-envoltura">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Producto</th>
                <th className="num">Cant.</th>
                <th className="num">Total</th>
                <th>Sabores</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.clave}>
                  <td className="secundario hora">{new Date(f.fecha).toLocaleDateString("es-BO", { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td>{f.producto}</td>
                  <td className="num">{cantidad(f.cantidad)}</td>
                  <td className="num">{bs(f.total)}</td>
                  <td className="secundario">{f.sabores ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Ventana>
  );
}

// Precios que negoció un mayorista: cada uno puede tener el suyo. Sin precio acordado, paga el precio de venta.
function PreciosCliente({
  cliente,
  alCambiar,
  cerrar,
}: {
  cliente: Cliente;
  alCambiar: () => Promise<void>;
  cerrar: () => void;
}) {
  const productos = useDatos(() => api.productos({ tipo: "VENTA", activo: true }));
  const [productoId, setProductoId] = useState("");
  const [precio, setPrecio] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const elegido = productos.datos?.find((p) => String(p.id) === productoId) ?? null;

  const elegirProducto = (id: string) => {
    setProductoId(id);
    setPrecio(cliente.precios.find((p) => String(p.productoId) === id)?.precio ?? "");
  };

  const ejecutar = async (accion: () => Promise<unknown>, texto: string) => {
    setGuardando(true);
    setAviso(null);
    try {
      await accion();
      await alCambiar();
      setAviso({ tipo: "ok", texto });
      setProductoId("");
      setPrecio("");
    } catch (err) {
      setAviso({ tipo: "error", texto: mensajeDeError(err) });
    } finally {
      setGuardando(false);
    }
  };

  const guardar = (e: FormEvent) => {
    e.preventDefault();
    if (!elegido || !esNumeroValido(precio)) return;
    void ejecutar(
      () => api.fijarPrecioCliente(cliente.id, elegido.id, normalizarNumero(precio)),
      `${cliente.nombre} paga «${elegido.nombre}» a ${bs(normalizarNumero(precio))}.`,
    );
  };

  return (
    <Panel
      titulo={`Precios de ${cliente.nombre}`}
      acciones={
        <Button tamano="chico" variante="texto" onClick={cerrar}>
          Cerrar
        </Button>
      }
    >
      <div className="panel-cuerpo">
        <p className="secundario clientes__detalle">
          Lo que negoció con la dueña. Los productos que no están aquí se le cobran a su precio de venta.
        </p>
        {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
        {cliente.precios.length > 0 && (
          <div className="tabla-envoltura">
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="num">Precio de venta</th>
                  <th className="num">Precio acordado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cliente.precios.map((p) => (
                  <tr key={p.productoId}>
                    <td>{p.producto.nombre}</td>
                    <td className="num secundario">{bs(p.producto.precioVenta)}</td>
                    <td className="num">
                      <strong>{bs(p.precio)}</strong>
                    </td>
                    <td className="num">
                      <Button
                        tamano="chico"
                        variante="texto"
                        disabled={guardando}
                        onClick={() =>
                          void ejecutar(
                            () => api.quitarPrecioCliente(cliente.id, p.productoId),
                            `«${p.producto.nombre}» vuelve al precio de venta para ${cliente.nombre}.`,
                          )
                        }
                      >
                        Quitar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form className="clientes__precio" onSubmit={guardar}>
          <Campo etiqueta="Producto">
            <select value={productoId} onChange={(e) => elegirProducto(e.target.value)}>
              <option value="">Elegir producto…</option>
              {productos.datos?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo
            etiqueta="Precio acordado (Bs)"
            ayuda={elegido ? `Precio de venta: ${bs(elegido.precioVenta)}` : undefined}
          >
            <input inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="0,00" />
          </Campo>
          <Button type="submit" variante="primario" disabled={guardando || !elegido || !esNumeroValido(precio)}>
            {guardando ? "Guardando…" : "Guardar precio"}
          </Button>
        </form>
      </div>
    </Panel>
  );
}
