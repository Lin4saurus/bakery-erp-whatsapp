import { Fragment, useMemo, useState, type FormEvent } from "react";
import { MdDeleteOutline, MdOutlineEdit } from "react-icons/md";
import { api, mensajeDeError, type Cliente, type TipoCliente } from "../api";
import { BarChart, type Barra } from "../components/charts/BarChart";
import { bs, cantidad, esNumeroValido, fechaCorta, hora, hoyISO, normalizarNumero } from "../formato";
import { Aviso, Button, Campo, Cargando, Panel, Tarjeta, TipoClienteBadge, useDatos } from "../ui";
import "./Historial.css";

const TODOS = "";
const PRIMER_ANIO = 2020; // la repostería trabaja desde 2020 (las primeras ventas anotadas son de 2024)
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

type FiltroTipo = "TODAS" | TipoCliente;

// Una venta, venga de la Caja o de los registros anteriores (Excel 2024, notas de venta 2026).
interface Fila {
  clave: string;
  id: number; // id de la venta (Caja) o del registro anterior
  clienteId: string | null;
  precioUnitario: number | null; // solo ventas de la Caja
  fecha: Date;
  fechaEstimada: boolean;
  producto: string;
  productoOriginal: string | null;
  cantidad: number;
  total: number;
  ganancia: number | null; // null = no se conoce el costo (notas de venta)
  cliente: string | null;
  tipo: TipoCliente | null; // null = sin cliente registrado (minorista)
  sabores: string | null;
  deCaja: boolean; // registrada en la Caja (con hora); las anteriores solo tienen el día
  anulada: boolean;
  fiado: boolean;
}

const esMayorista = (f: Fila) => f.tipo === "MAYORISTA";
const sumar = (filas: Fila[], valor: (f: Fila) => number) => filas.reduce((t, f) => t + valor(f), 0);

// Historial único: todas las ventas, por año. Las de la Caja y las anotadas antes del sistema se ven juntas.
export function Historial() {
  const caja = useDatos(() => api.ventas(`${PRIMER_ANIO}-01-01`, hoyISO()));
  const anteriores = useDatos(() => api.historico());

  const filas: Fila[] | null = useMemo(() => {
    if (!caja.datos || !anteriores.datos) return null;
    const deCaja: Fila[] = caja.datos.ventas.map((v) => ({
      clave: `c${v.id}`,
      id: v.id,
      clienteId: v.clienteId,
      precioUnitario: Number(v.precioUnitario),
      fecha: new Date(v.fecha),
      fechaEstimada: false,
      producto: v.producto,
      productoOriginal: null,
      cantidad: Number(v.cantidad),
      total: Number(v.totalVenta),
      ganancia: Number(v.gananciaBruta),
      cliente: v.cliente,
      tipo: v.clienteTipo,
      sabores: v.sabores,
      deCaja: true,
      anulada: v.anulada,
      fiado: v.estadoPago === "PENDIENTE",
    }));
    const previas: Fila[] = anteriores.datos.ventas.map((v) => ({
        clave: `h${v.id}`,
        id: v.id,
        clienteId: v.clienteId,
        precioUnitario: null,
        fecha: new Date(v.fecha),
        fechaEstimada: v.fechaEstimada,
        producto: v.productoNombre,
        productoOriginal: v.productoOriginal !== v.productoNombre ? v.productoOriginal : null,
        cantidad: Number(v.cantidad),
        total: Number(v.valor),
        ganancia: v.utilidad === null ? null : Number(v.utilidad),
        cliente: v.cliente,
        tipo: v.clienteTipo,
        sabores: v.sabores,
        deCaja: false,
        anulada: false,
        fiado: false,
      }));
    return [...deCaja, ...previas].sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  }, [caja.datos, anteriores.datos]);

  const anioActual = new Date().getFullYear();
  // Del más reciente al más viejo: el año que más se consulta queda arriba en la lista.
  const anios = Array.from({ length: anioActual - PRIMER_ANIO + 1 }, (_, i) => anioActual - i);
  const [anio, setAnio] = useState(anioActual);
  const error = caja.error ?? anteriores.error;

  return (
    <>
      <div className="cabecera-pantalla">
        <div>
          <h1>Historial de ventas</h1>
          <p>Cómo le fue a la repostería cada año. Junta lo vendido en la Caja con lo anotado antes del sistema.</p>
        </div>
        {/* Dos clics: abrir la lista y elegir el año. */}
        <label className="historial__anio">
          <span className="secundario">Año</span>
          <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} aria-label="Año a consultar">
            {anios.map((a) => {
              const total = filas ? sumar(filas.filter((f) => !f.anulada && f.fecha.getFullYear() === a), (f) => f.total) : 0;
              return (
                <option key={a} value={a}>
                  {a} · {total > 0 ? bs(total) : "sin ventas"}
                </option>
              );
            })}
          </select>
        </label>
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {!filas ? (
        <Cargando />
      ) : (
        <ResumenAnio
          key={anio}
          anio={anio}
          filas={filas.filter((f) => f.fecha.getFullYear() === anio)}
          alCambiar={async () => {
            await Promise.all([caja.recargar(), anteriores.recargar()]);
          }}
        />
      )}
    </>
  );
}

// ---------- Desempeño de un año ----------

function ResumenAnio({ anio, filas, alCambiar }: { anio: number; filas: Fila[]; alCambiar: () => Promise<void> }) {
  const fichas = useDatos(() => api.clientes());
  const [editando, setEditando] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [mes, setMes] = useState(TODOS);
  const [tipo, setTipo] = useState<FiltroTipo>("TODAS");
  const [cliente, setCliente] = useState(TODOS);
  const [producto, setProducto] = useState(TODOS);

  const vigentes = filas.filter((f) => !f.anulada);
  if (filas.length === 0) {
    return <Aviso tipo="alerta">No hay ventas registradas en {anio}.</Aviso>;
  }

  const total = sumar(vigentes, (f) => f.total);
  const mayoristas = vigentes.filter(esMayorista);
  const minoristas = vigentes.filter((f) => !esMayorista(f));
  const conGanancia = vigentes.filter((f) => f.ganancia !== null);
  const ganancia = sumar(conGanancia, (f) => f.ganancia ?? 0);
  const sinCosto = vigentes.length - conGanancia.length;

  const porMes = MESES.map((_, i) => sumar(vigentes.filter((f) => f.fecha.getMonth() === i), (f) => f.total));
  const mesesConVentas = porMes.filter((v) => v > 0).length;
  const barras: Barra[] = MESES.map((m, i) => ({ etiqueta: m, valor: Math.round(porMes[i] ?? 0), destacada: mes === String(i) }));

  const productos = [...new Set(vigentes.map((f) => f.producto))]
    .map((p) => {
      const delProducto = vigentes.filter((f) => f.producto === p);
      return { producto: p, ventas: delProducto.length, unidades: sumar(delProducto, (f) => f.cantidad), total: sumar(delProducto, (f) => f.total) };
    })
    .sort((a, b) => b.total - a.total);
  const clientes = [...new Set(filas.map((f) => f.cliente).filter((c): c is string => c !== null))].sort((a, b) => a.localeCompare(b));

  const filtradas = filas.filter(
    (f) =>
      (mes === TODOS || f.fecha.getMonth() === Number(mes)) &&
      (tipo === "TODAS" || (tipo === "MAYORISTA" ? esMayorista(f) : !esMayorista(f))) &&
      (cliente === TODOS || f.cliente === cliente) &&
      (producto === TODOS || f.producto === producto),
  );
  const totalFiltrado = sumar(
    filtradas.filter((f) => !f.anulada),
    (f) => f.total,
  );

  const eliminar = async (f: Fila) => {
    setMensaje(null);
    try {
      if (f.deCaja) await api.eliminarVenta(f.id);
      else await api.eliminarHistorico(f.id);
      await alCambiar();
      setBorrando(null);
      setMensaje({
        tipo: "ok",
        texto: `Se eliminó «${f.producto} × ${cantidad(f.cantidad)}»${f.deCaja && !f.anulada ? "; sus insumos volvieron al stock" : ""}.`,
      });
    } catch (e) {
      setMensaje({ tipo: "error", texto: mensajeDeError(e) });
    }
  };

  return (
    <>
      <div className="grilla-tarjetas">
        <Tarjeta
          titulo={`Vendido en ${anio}`}
          valor={bs(total)}
          detalle={`${vigentes.length} venta(s) · ${cantidad(sumar(vigentes, (f) => f.cantidad))} u`}
        />
        <Tarjeta titulo="Minoristas" valor={bs(sumar(minoristas, (f) => f.total))} detalle={`${minoristas.length} venta(s)`} />
        <Tarjeta titulo="Mayoristas" valor={bs(sumar(mayoristas, (f) => f.total))} detalle={`${mayoristas.length} venta(s)`} />
        <Tarjeta
          titulo="Ganancia bruta"
          valor={conGanancia.length > 0 ? bs(ganancia) : "—"}
          tono={conGanancia.length === 0 ? undefined : ganancia < 0 ? "negativo" : "positivo"}
          detalle={
            sinCosto > 0
              ? `Lo vendido menos el costo de los insumos. No incluye ${sinCosto} venta(s) sin costo conocido.`
              : "Lo vendido menos el costo de los insumos."
          }
        />
      </div>

      <div className="dos-columnas">
        <Panel titulo={`Ventas por mes · ${anio} (Bs)`}>
          <div className="historial__grafico">
            <BarChart
              datos={barras}
              alto={160}
              descripcion={`Bs vendidos por mes en ${anio}: ${barras.map((b) => `${b.etiqueta} ${b.valor}`).join(", ")}`}
            />
            <div className="historial__meses" aria-label="Filtrar por mes">
              {MESES.map((m, i) => (
                <button
                  key={m}
                  type="button"
                  disabled={(porMes[i] ?? 0) === 0}
                  className={`historial__mes ${mes === String(i) ? "historial__mes--activo" : ""}`}
                  onClick={() => setMes(mes === String(i) ? TODOS : String(i))}
                >
                  {m}
                </button>
              ))}
            </div>
            <p className="secundario historial__nota">Toca un mes para ver solo sus ventas abajo.</p>
          </div>
        </Panel>

        <Panel titulo="Por producto">
          <div className="tabla-envoltura">
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="num">Unidades</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((p) => (
                  <tr
                    key={p.producto}
                    className={`historial__fila-producto ${producto === p.producto ? "historial__fila-producto--activa" : ""}`}
                    onClick={() => setProducto(producto === p.producto ? TODOS : p.producto)}
                  >
                    <td>{p.producto}</td>
                    <td className="num">{cantidad(p.unidades)}</td>
                    <td className="num">{bs(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel titulo={`Ventas · ${filtradas.filter((f) => !f.anulada).length} · ${bs(totalFiltrado)}`}>
        {mensaje && (
          <div className="historial__mensaje">
            <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>
          </div>
        )}
        <div className="historial__filtros">
          <Campo etiqueta="Mes">
            <select value={mes} onChange={(e) => setMes(e.target.value)}>
              <option value={TODOS}>Todo el año</option>
              {MESES.map((m, i) => (
                <option key={m} value={String(i)} disabled={(porMes[i] ?? 0) === 0}>
                  {m}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Tipo">
            <select value={tipo} onChange={(e) => setTipo(e.target.value as FiltroTipo)}>
              <option value="TODAS">Todas las ventas</option>
              <option value="MINORISTA">Solo minoristas</option>
              <option value="MAYORISTA">Solo mayoristas</option>
            </select>
          </Campo>
          <Campo etiqueta="Cliente">
            <select value={cliente} onChange={(e) => setCliente(e.target.value)}>
              <option value={TODOS}>Todos</option>
              {clientes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Producto">
            <select value={producto} onChange={(e) => setProducto(e.target.value)}>
              <option value={TODOS}>Todos</option>
              {productos.map((p) => (
                <option key={p.producto} value={p.producto}>
                  {p.producto}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        {filtradas.length === 0 ? (
          <p className="vacio">No hay ventas con estos filtros.</p>
        ) : (
          <div className="tabla-envoltura">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Producto</th>
                  <th className="num">Cant.</th>
                  <th className="num">Total</th>
                  <th>Cliente</th>
                  <th>Tipo</th>
                  <th>Sabores</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtradas.map((f) => (
                  <Fragment key={f.clave}>
                  <tr className={f.anulada ? "historial__anulada" : undefined}>
                    <td className="secundario" title={f.fechaEstimada ? "Fecha aproximada" : undefined}>
                      {f.deCaja ? (
                        <>
                          {fechaCorta(f.fecha.toISOString())} {hora(f.fecha.toISOString())}
                        </>
                      ) : (
                        <>
                          {f.fechaEstimada ? "≈ " : ""}
                          {f.fecha.toLocaleDateString("es-BO", { day: "numeric", month: "short" })}
                        </>
                      )}
                    </td>
                    <td>
                      {f.producto}
                      {f.anulada && <span className="etiqueta etiqueta-negativa historial__erp">Anulada</span>}
                      {f.fiado && !f.anulada && <span className="etiqueta etiqueta-alerta historial__erp">Fiado</span>}
                      {f.productoOriginal && <div className="secundario historial__original">Anotado: {f.productoOriginal}</div>}
                    </td>
                    <td className="num">{cantidad(f.cantidad)}</td>
                    <td className="num">{bs(f.total)}</td>
                    <td>{f.cliente ?? <span className="secundario">—</span>}</td>
                    <td>
                      <TipoClienteBadge tipo={f.tipo} />
                    </td>
                    <td className="secundario">{f.sabores ?? "—"}</td>
                    <td className="num historial__acciones">
                      {!f.anulada && (
                        <Button
                          tamano="chico"
                          variante="texto"
                          onClick={() => {
                            setBorrando(null);
                            setEditando(editando === f.clave ? null : f.clave);
                          }}
                        >
                          <MdOutlineEdit aria-hidden /> Editar
                        </Button>
                      )}
                      <Button
                        tamano="chico"
                        variante="texto"
                        onClick={() => {
                          setEditando(null);
                          setBorrando(borrando === f.clave ? null : f.clave);
                        }}
                      >
                        <MdDeleteOutline aria-hidden /> Eliminar
                      </Button>
                    </td>
                  </tr>
                  {editando === f.clave && (
                    <tr className="fila-formulario">
                      <td colSpan={8}>
                        <EditorVenta
                          fila={f}
                          clientes={fichas.datos ?? []}
                          cancelar={() => setEditando(null)}
                          guardado={async (texto) => {
                            await alCambiar();
                            setEditando(null);
                            setMensaje({ tipo: "ok", texto });
                          }}
                        />
                      </td>
                    </tr>
                  )}
                  {borrando === f.clave && (
                    <tr className="fila-formulario">
                      <td colSpan={8}>
                        <div className="historial__confirmar">
                          <span>
                            ¿Eliminar <strong>{f.producto} × {cantidad(f.cantidad)}</strong> ({bs(f.total)}) del{" "}
                            {f.fecha.toLocaleDateString("es-BO", { day: "numeric", month: "long", year: "numeric" })}?{" "}
                            <span className="secundario">
                              {f.deCaja && !f.anulada
                                ? "Sus insumos vuelven al stock. No se puede deshacer."
                                : "Deja de contar en el historial. No se puede deshacer."}
                            </span>
                          </span>
                          <div className="fila-botones">
                            <Button variante="peligro" onClick={() => void eliminar(f)}>
                              Sí, eliminar
                            </Button>
                            <Button onClick={() => setBorrando(null)}>Cancelar</Button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

// Corrige una venta: cantidad, precio o total, día, cliente (solo las anteriores al sistema) y sabores.
// Solo se manda lo que cambió.
function EditorVenta({
  fila,
  clientes,
  cancelar,
  guardado,
}: {
  fila: Fila;
  clientes: Cliente[];
  cancelar: () => void;
  guardado: (mensaje: string) => Promise<void>;
}) {
  const diaOriginal = fila.fecha.toLocaleDateString("sv-SE");
  const [dia, setDia] = useState(diaOriginal);
  const [unidades, setUnidades] = useState(String(fila.cantidad));
  const [monto, setMonto] = useState(String(fila.deCaja ? fila.precioUnitario : fila.total)); // Caja: precio por unidad; anteriores: total
  const [clienteId, setClienteId] = useState(fila.clienteId ?? "");
  const [sabores, setSabores] = useState(fila.sabores ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numerosValidos = esNumeroValido(unidades) && Number(normalizarNumero(unidades)) > 0 && esNumeroValido(monto);
  const n = numerosValidos ? Number(normalizarNumero(unidades)) : 0;
  const m = numerosValidos ? Number(normalizarNumero(monto)) : 0;
  const total = fila.deCaja ? n * m : m;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!numerosValidos) return;
    setGuardando(true);
    setError(null);
    const cambioCantidad = n !== fila.cantidad ? normalizarNumero(unidades) : undefined;
    const cambioDia = dia !== diaOriginal ? dia : undefined;
    const saboresNuevos = sabores.trim();
    const cambioSabores = saboresNuevos !== (fila.sabores ?? "");
    try {
      if (fila.deCaja) {
        await api.editarVenta(fila.id, {
          cantidad: cambioCantidad,
          precioUnitario: m !== fila.precioUnitario ? normalizarNumero(monto) : undefined,
          fecha: cambioDia,
          sabores: cambioSabores ? (saboresNuevos ? saboresNuevos.split(",").map((x) => x.trim()).filter(Boolean) : null) : undefined,
        });
      } else {
        await api.editarHistorico(fila.id, {
          cantidad: cambioCantidad,
          valor: m !== fila.total ? normalizarNumero(monto) : undefined,
          fecha: cambioDia,
          clienteId: clienteId !== (fila.clienteId ?? "") ? clienteId || null : undefined,
          sabores: cambioSabores ? saboresNuevos || null : undefined,
        });
      }
      await guardado(`«${fila.producto}» corregido: ${cantidad(n)} u · ${bs(total)}.`);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form className="historial__editor" onSubmit={(e) => void enviar(e)}>
      {error && (
        <div className="historial__editor-error">
          <Aviso tipo="error">{error}</Aviso>
        </div>
      )}
      <Campo etiqueta="Día">
        <input type="date" value={dia} max={hoyISO()} onChange={(e) => setDia(e.target.value)} required />
      </Campo>
      <Campo etiqueta="Cantidad">
        <input inputMode="decimal" value={unidades} onChange={(e) => setUnidades(e.target.value)} autoFocus />
      </Campo>
      <Campo etiqueta={fila.deCaja ? "Precio por unidad (Bs)" : "Total (Bs)"} ayuda={fila.deCaja ? `Total: ${bs(total)}` : undefined}>
        <input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} />
      </Campo>
      {fila.deCaja ? (
        <Campo etiqueta="Cliente" ayuda="Se elige al vender en la Caja.">
          <input value={fila.cliente ?? "Sin cliente"} disabled />
        </Campo>
      ) : (
        <Campo etiqueta="Cliente">
          <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">{fila.clienteId === null && fila.cliente ? `${fila.cliente} (sin ficha)` : "Sin cliente"}</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </Campo>
      )}
      <Campo etiqueta="Sabores (opcional)" ayuda="Separados por comas">
        <input value={sabores} onChange={(e) => setSabores(e.target.value)} placeholder="Coco, Oreo…" />
      </Campo>
      {/* Etiqueta vacía: los botones quedan a la altura de los campos. */}
      <div className="campo">
        <span className="campo-etiqueta" aria-hidden>
          &nbsp;
        </span>
        <div className="fila-botones historial__editor-botones">
          <Button type="submit" variante="primario" disabled={guardando || !numerosValidos}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
          <Button onClick={cancelar}>Cancelar</Button>
        </div>
      </div>
      {fila.deCaja && n !== fila.cantidad && numerosValidos && (
        <p className="secundario historial__editor-nota">
          El stock se ajusta solo: {n > fila.cantidad ? "se descuentan" : "se devuelven"} los insumos de{" "}
          {cantidad(Math.abs(n - fila.cantidad))} u.
        </p>
      )}
    </form>
  );
}

