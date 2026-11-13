import { Fragment, useEffect, useRef, useState } from "react";
import { MdOutlineAddShoppingCart, MdOutlineEdit, MdOutlineFactCheck } from "react-icons/md";
import { prepararCompra, tomarAjuste } from "../compraPendiente";
import {
  api,
  mensajeDeError,
  type CategoriaInsumo,
  type DatosInsumo,
  type Insumo,
  type Movimiento,
  type UnidadMedida,
} from "../api";
import {
  bs,
  costoUnidad,
  esNumeroValido,
  nombreCategoria,
  nombreUnidad,
  normalizarNumero,
  medida,
  unidadCorta,
} from "../formato";
import { Aviso, Campo, Cargando, Panel, useDatos } from "../ui";
import "./Insumos.css";

// Casos especiales en que el stock baja sin una venta.
const MOTIVOS_REDUCCION = ["Se venció", "Se derramó / se cayó", "Tanda arruinada", "Consumo propio"];

type Modo = "editar" | "stock";

const insumoVacio: DatosInsumo = {
  nombre: "",
  categoria: "MATERIA_PRIMA",
  unidadBase: "GRAMO",
  contenidoEnvase: "",
  precioEnvase: "",
  stockMinimo: "0",
  controlaStock: true,
};

export function Insumos() {
  const insumos = useDatos(api.insumos);
  const [busqueda, setBusqueda] = useState("");
  // Desde las alertas del Inicio llega un insumo para actualizar su stock (D72).
  const [abierto, setAbierto] = useState<{ id: number; modo: Modo } | null>(() => {
    const id = tomarAjuste();
    return id === null ? null : { id, modo: "stock" };
  });
  const [creando, setCreando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  // Si llegó desde el Inicio, una vez cargada la lista se lleva el formulario a la vista.
  const llegoDelInicio = useRef(abierto !== null);
  useEffect(() => {
    if (!llegoDelInicio.current || !insumos.datos) return;
    llegoDelInicio.current = false;
    document.querySelector(".insumos__formulario-abierto")?.scrollIntoView({ block: "center" });
  }, [insumos.datos]);

  const terminar = (texto: string) => {
    setAbierto(null);
    setCreando(false);
    setMensaje(texto);
    void insumos.recargar();
  };

  const abrir = (id: number, modo: Modo) => {
    setMensaje(null);
    setAbierto(abierto?.id === id && abierto.modo === modo ? null : { id, modo });
  };

  const filtro = busqueda.trim().toLowerCase();
  const visibles = insumos.datos?.filter((i) => i.nombre.toLowerCase().includes(filtro)) ?? [];

  return (
    <>
      <div className="cabecera-pantalla">
        <div>
          <h1>Insumos</h1>
          <p>Precios de compra y stock. Si cambias un precio, el costo de todas las recetas se recalcula solo.</p>
        </div>
        <button className="boton boton-primario" onClick={() => setCreando(!creando)}>
          {creando ? "Cancelar" : "Nuevo insumo"}
        </button>
      </div>

      {mensaje && <Aviso tipo="ok">{mensaje}</Aviso>}
      {insumos.error && <Aviso tipo="error">{insumos.error}</Aviso>}

      {creando && (
        <Panel titulo="Nuevo insumo">
          <div className="panel-cuerpo">
            <FormularioInsumo
              inicial={insumoVacio}
              textoBoton="Crear insumo"
              guardar={async (datos) => {
                await api.crearInsumo(datos);
                terminar(`Insumo "${datos.nombre}" creado.`);
              }}
              cancelar={() => setCreando(false)}
            />
          </div>
        </Panel>
      )}

      <Panel
        titulo={`${visibles.length} insumo(s)`}
        acciones={
          <input placeholder="Buscar insumo…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        }
      >
        {insumos.cargando && !insumos.datos ? (
          <Cargando />
        ) : (
          <div className="tabla-envoltura">
            <table>
              <thead>
                <tr>
                  <th>Insumo</th>
                  <th>Envase</th>
                  <th className="num">Costo por unidad</th>
                  <th className="num">Stock</th>
                  <th className="num">Mínimo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibles.map((insumo) => {
                  const u = unidadCorta[insumo.unidadBase];
                  const stock = Number(insumo.stockActual);
                  const estaAbierto = abierto?.id === insumo.id;
                  return (
                    <Fragment key={insumo.id}>
                      <tr className={estaAbierto ? "fila-abierta" : undefined}>
                        <td>
                          {insumo.nombre}
                          <div className="secundario">{nombreCategoria[insumo.categoria]}</div>
                        </td>
                        <td>
                          {medida(insumo.contenidoEnvase, insumo.unidadBase)} · {bs(insumo.precioEnvase)}
                        </td>
                        <td className="num">
                          {costoUnidad(insumo.costoUnitario)} / {u}
                        </td>
                        {insumo.controlaStock ? (
                          <>
                            <td className={`num ${stock <= 0 ? "negativo" : ""}`}>
                              {medida(insumo.stockActual, insumo.unidadBase)}
                            </td>
                            <td className="num">{medida(insumo.stockMinimo, insumo.unidadBase)}</td>
                          </>
                        ) : (
                          <>
                            <td className="num" title="No se lleva stock: siempre hay">
                              <span className="insumo__infinito">∞</span>
                              <div className="secundario">Sin control</div>
                            </td>
                            <td className="num secundario">—</td>
                          </>
                        )}
                        <td>
                          <div className="fila-botones insumo__acciones">
                            {/* Las compras se cargan en Gastos (suman al stock y quedan como gasto, D51);
                                «Actualizar stock» corrige lo contado (mermas, diferencias). */}
                            <button
                              className="boton boton-chico"
                              title="Nombre, envase, precio y stock mínimo"
                              onClick={() => abrir(insumo.id, "editar")}
                            >
                              <MdOutlineEdit aria-hidden /> Editar datos
                            </button>
                            {insumo.activo && insumo.controlaStock && (
                              <button
                                className="boton boton-chico"
                                title="Abre Gastos con este insumo: suma al stock y queda el gasto"
                                onClick={() => {
                                  prepararCompra(insumo.id);
                                  window.location.hash = "gastos";
                                }}
                              >
                                <MdOutlineAddShoppingCart aria-hidden /> Registrar compra
                              </button>
                            )}
                            {insumo.controlaStock && (
                              <button
                                className="boton boton-chico"
                                title="Escribe cuánto hay ahora si el conteo no coincide o algo se perdió"
                                onClick={() => abrir(insumo.id, "stock")}
                              >
                                <MdOutlineFactCheck aria-hidden /> Actualizar stock
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {estaAbierto && abierto && (
                        <tr className="fila-formulario insumos__formulario-abierto">
                          <td colSpan={6}>
                            {abierto.modo === "editar" ? (
                              <FormularioInsumo
                                inicial={{
                                  nombre: insumo.nombre,
                                  categoria: insumo.categoria,
                                  unidadBase: insumo.unidadBase,
                                  contenidoEnvase: insumo.contenidoEnvase,
                                  precioEnvase: insumo.precioEnvase,
                                  stockMinimo: insumo.stockMinimo,
                                  controlaStock: insumo.controlaStock,
                                }}
                                textoBoton="Guardar cambios"
                                guardar={async (datos) => {
                                  await api.actualizarInsumo(insumo.id, datos);
                                  terminar(`"${datos.nombre}" actualizado. Los costos de las recetas ya usan el precio nuevo.`);
                                }}
                                cancelar={() => setAbierto(null)}
                              />
                            ) : (
                              <FormularioStock
                                insumo={insumo}
                                listo={(texto) => terminar(texto)}
                                cancelar={() => setAbierto(null)}
                              />
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

function FormularioInsumo({
  inicial,
  textoBoton,
  guardar,
  cancelar,
}: {
  inicial: DatosInsumo;
  textoBoton: string;
  guardar: (datos: DatosInsumo) => Promise<void>;
  cancelar: () => void;
}) {
  const [datos, setDatos] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const cambiar = <K extends keyof DatosInsumo>(campo: K, valor: DatosInsumo[K]) =>
    setDatos((previo) => ({ ...previo, [campo]: valor }));

  const u = unidadCorta[datos.unidadBase];
  const costo =
    esNumeroValido(datos.precioEnvase) && esNumeroValido(datos.contenidoEnvase) && Number(normalizarNumero(datos.contenidoEnvase)) > 0
      ? Number(normalizarNumero(datos.precioEnvase)) / Number(normalizarNumero(datos.contenidoEnvase))
      : null;

  const enviar = async () => {
    setGuardando(true);
    setError(null);
    try {
      await guardar({
        ...datos,
        contenidoEnvase: normalizarNumero(datos.contenidoEnvase),
        precioEnvase: normalizarNumero(datos.precioEnvase),
        stockMinimo: datos.controlaStock ? normalizarNumero(datos.stockMinimo) : "0",
      });
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  };

  // Lo que cambia respecto de lo guardado (al crear un insumo no hay «antes»).
  const costoAntes =
    Number(inicial.contenidoEnvase) > 0 ? Number(inicial.precioEnvase) / Number(inicial.contenidoEnvase) : null;
  const cambiaCosto = costoAntes !== null && costo !== null && Math.abs(costo - costoAntes) > 1e-9;
  const contenidoValido = esNumeroValido(datos.contenidoEnvase) && Number(normalizarNumero(datos.contenidoEnvase)) > 0;

  return (
    <>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="panel-insumo">
        <div className="panel-insumo__col">
          <Campo etiqueta="Nombre">
            <input value={datos.nombre} onChange={(e) => cambiar("nombre", e.target.value)} autoFocus />
          </Campo>
          <Campo
            etiqueta="Categoría"
            ayuda={
              datos.categoria === "EMPAQUE"
                ? "Caja, etiqueta, envase: va uno por paquete vendido, sin importar cuántas unidades lleve."
                : datos.categoria === "GASTO_INDIRECTO"
                  ? "Es un gasto (se carga en Gastos); no va en las recetas ni sube el costo."
                  : "Se usa en las recetas según la cantidad que rinde."
            }
          >
            <select value={datos.categoria} onChange={(e) => cambiar("categoria", e.target.value as CategoriaInsumo)}>
              {Object.entries(nombreCategoria).map(([valor, texto]) => (
                <option key={valor} value={valor}>
                  {texto}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Se mide en" ayuda="Las recetas usan esta misma unidad.">
            <select value={datos.unidadBase} onChange={(e) => cambiar("unidadBase", e.target.value as UnidadMedida)}>
              {Object.entries(nombreUnidad).map(([valor, texto]) => (
                <option key={valor} value={valor}>
                  {texto}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        <div className="panel-insumo__col">
          <Campo
            etiqueta={`Contenido del envase (en ${u})`}
            equivalencia={esNumeroValido(datos.contenidoEnvase) ? medida(normalizarNumero(datos.contenidoEnvase), datos.unidadBase) : null}
            ayuda="Ej. bolsa de harina de 50 kg: 50000"
          >
            <input inputMode="decimal" value={datos.contenidoEnvase} onChange={(e) => cambiar("contenidoEnvase", e.target.value)} />
          </Campo>
          <Campo etiqueta="Precio del envase (Bs)">
            <input inputMode="decimal" value={datos.precioEnvase} onChange={(e) => cambiar("precioEnvase", e.target.value)} />
          </Campo>
          <label className="casilla">
            <input type="checkbox" checked={!datos.controlaStock} onChange={(e) => cambiar("controlaStock", !e.target.checked)} />
            <span>
              <strong>No llevar stock ∞</strong>
              <span className="secundario"> · siempre hay (ej. agua de la casa). No se descuenta ni avisa; sí cuenta en el costo.</span>
            </span>
          </label>
          {datos.controlaStock && (
            <Campo
              etiqueta={`Stock mínimo (en ${u})`}
              equivalencia={esNumeroValido(datos.stockMinimo) ? medida(normalizarNumero(datos.stockMinimo), datos.unidadBase) : null}
              ayuda="Debajo de esto aparece la alerta"
            >
              <input inputMode="decimal" value={datos.stockMinimo} onChange={(e) => cambiar("stockMinimo", e.target.value)} />
            </Campo>
          )}
        </div>

        <div className="panel-insumo__resumen">
          <div className="panel-insumo__cifras">
            {cambiaCosto && (
              <>
                <div>
                  <span className="secundario">Costo antes</span>
                  <strong>{costoUnidad(String(costoAntes))}</strong>
                </div>
                <span className="panel-insumo__flecha" aria-hidden>
                  →
                </span>
              </>
            )}
            <div>
              <span className="secundario">{cambiaCosto ? "Costo nuevo" : "Costo por unidad"}</span>
              <strong>{costo === null ? "—" : costoUnidad(String(costo))}</strong>
            </div>
          </div>
          <div className="secundario">
            {costo === null ? "Completa el contenido y el precio del envase." : `por ${u} de ${datos.nombre.trim() || "insumo"}`}
          </div>
          {contenidoValido && esNumeroValido(datos.precioEnvase) && (
            <div className="panel-insumo__linea">
              Envase: <strong>{medida(normalizarNumero(datos.contenidoEnvase), datos.unidadBase)}</strong> ·{" "}
              <strong>{bs(normalizarNumero(datos.precioEnvase))}</strong>
            </div>
          )}
          {cambiaCosto && (
            <div
              className={`panel-insumo__diferencia ${
                (costo ?? 0) > (costoAntes ?? 0) ? "panel-insumo__diferencia--resta" : "panel-insumo__diferencia--suma"
              }`}
            >
              {(costo ?? 0) > (costoAntes ?? 0) ? "Sube el costo" : "Baja el costo"}: las recetas que lo usan se recalculan.
            </div>
          )}
          <div className="fila-botones">
            <button className="boton boton-primario" disabled={guardando} onClick={() => void enviar()}>
              {guardando ? "Guardando…" : textoBoton}
            </button>
            <button className="boton" onClick={cancelar}>
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// Actualizar stock: se escribe cuánto hay ahora; el ERP calcula si sube (compra) o baja (merma).
function FormularioStock({
  insumo,
  listo,
  cancelar,
}: {
  insumo: Insumo;
  listo: (mensaje: string) => void;
  cancelar: () => void;
}) {
  const u = unidadCorta[insumo.unidadBase];
  // Redondeado a 2 decimales para que se lea como un número normal (120, no 120.00000000000001).
  const [valor, setValor] = useState(String(Math.round(Number(insumo.stockActual) * 100) / 100));
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const stockReal = esNumeroValido(valor) ? Number(normalizarNumero(valor)) : null;
  const valido = stockReal !== null && stockReal >= 0;
  const diferencia = stockReal === null ? 0 : Math.round((stockReal - Number(insumo.stockActual)) * 1e6) / 1e6;
  const reduce = valido && diferencia < 0;
  const puedeGuardar = valido && diferencia !== 0;

  const enviar = async () => {
    setGuardando(true);
    setError(null);
    // Sin caso especial: si sube es una reposición; si baja, un conteo.
    const motivo = (reduce ? nota.trim() : "") || (diferencia > 0 ? "Reposición de stock" : "Conteo físico");
    const movimiento: Movimiento = { tipo: "AJUSTE", stockReal: normalizarNumero(valor), nota: motivo };
    try {
      const { insumo: actualizado } = await api.registrarMovimiento(insumo.id, movimiento);
      listo(`${insumo.nombre}: stock actualizado a ${medida(actualizado.stockActual, insumo.unidadBase)}.`);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="panel-insumo">
        <Campo
          etiqueta={`Stock que hay ahora (en ${u})`}
          equivalencia={valido ? medida(stockReal, insumo.unidadBase) : null}
          ayuda={
            valido
              ? "Para corregir lo contado o una merma. Las compras cárgalas con «Registrar compra»: así quedan en Gastos."
              : "Escribe cuánto hay (0 o más)."
          }
        >
          <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus />
        </Campo>

        <div className="panel-insumo__col">
          <Campo
            etiqueta="Caso especial de reducción de stock (opcional)"
            ayuda={
              reduce
                ? "Si no es un caso especial, se guarda como «Conteo físico»."
                : "Solo hace falta cuando el stock baja."
            }
          >
            <input
              value={reduce ? nota : ""}
              onChange={(e) => setNota(e.target.value)}
              placeholder={reduce ? "Escribe o elige uno…" : "—"}
              disabled={!reduce}
            />
          </Campo>
          <div className="panel-insumo__motivos">
            {MOTIVOS_REDUCCION.map((m) => (
              <button
                key={m}
                type="button"
                disabled={!reduce}
                className={`panel-insumo__chip ${reduce && nota === m ? "panel-insumo__chip--elegido" : ""}`}
                onClick={() => setNota(nota === m ? "" : m)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="panel-insumo__resumen">
          <div className="panel-insumo__cifras">
            <div>
              <span className="secundario">Stock actual</span>
              <strong>{medida(insumo.stockActual, insumo.unidadBase)}</strong>
            </div>
            <span className="panel-insumo__flecha" aria-hidden>
              →
            </span>
            <div>
              <span className="secundario">Stock nuevo</span>
              <strong>{valido ? medida(stockReal, insumo.unidadBase) : "—"}</strong>
            </div>
          </div>
          <div
            className={`panel-insumo__diferencia ${
              !valido || diferencia === 0 ? "" : diferencia > 0 ? "panel-insumo__diferencia--suma" : "panel-insumo__diferencia--resta"
            }`}
          >
            {!valido
              ? "Escribe cuánto hay"
              : diferencia === 0
                ? "Sin cambios: escribe otro número"
                : `${diferencia > 0 ? "Se suman" : "Se restan"} ${medida(Math.abs(diferencia), insumo.unidadBase)}`}
          </div>
          <div className="fila-botones">
            <button className="boton boton-primario" disabled={guardando || !puedeGuardar} onClick={() => void enviar()}>
              {guardando ? "Guardando…" : "Guardar stock"}
            </button>
            <button className="boton" onClick={cancelar}>
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
