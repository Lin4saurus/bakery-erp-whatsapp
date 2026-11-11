import { useState, type FormEvent } from "react";
import { api, mensajeDeError, type CategoriaGasto, type Insumo } from "../api";
import {
  bs,
  esNumeroValido,
  fechaCorta,
  hoyISO,
  inicioDeMesISO,
  medida,
  nombreCategoriaGasto,
  normalizarNumero,
  unidadCorta,
} from "../formato";
import { Aviso, Button, Campo, Cargando, Panel, Tarjeta, useDatos } from "../ui";
import { tomarCompra } from "../compraPendiente";
import "./Gastos.css";

const categorias = Object.keys(nombreCategoriaGasto) as CategoriaGasto[];

const numeroPositivo = (texto: string) => esNumeroValido(texto) && Number(normalizarNumero(texto)) > 0;

// Todo lo que sale de la caja del negocio. La compra de insumos (D51) suma al stock y se ve aquí, pero
// no se resta otra vez para la utilidad neta: su costo ya se descuenta como costo de producción al vender.
// El resto (limpieza, moldes, uso personal…) sí se resta. Luz, gas y agua no se cargan: se comparten con la familia.
export function Gastos() {
  const desde = inicioDeMesISO();
  const hasta = hoyISO();
  const lista = useDatos(() => api.gastos(desde, hasta), [desde, hasta]);
  const insumos = useDatos(api.insumos);

  const [categoria, setCategoria] = useState<CategoriaGasto>("INSUMOS");
  const [descripcion, setDescripcion] = useState("");
  const [monto, setMonto] = useState("");
  // Compra de insumos: qué insumo y cuánto, en envases o en su unidad base.
  // Si se llegó desde «Registrar compra» en Insumos, empieza con ese insumo elegido.
  const [insumoId, setInsumoId] = useState(() => String(tomarCompra() ?? ""));
  const [porEnvases, setPorEnvases] = useState(true);
  const [envases, setEnvases] = useState("1");
  const [cantidadBase, setCantidadBase] = useState("");
  const [actualizarPrecio, setActualizarPrecio] = useState(true);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const esCompra = categoria === "INSUMOS";
  // Solo lo que se compra: fuera los «No llevar stock» (agua de la casa, «Limpieza y otros» por tanda).
  const activos = (insumos.datos ?? [])
    .filter((i) => i.activo && i.controlaStock)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const insumo: Insumo | undefined = activos.find((i) => String(i.id) === insumoId);
  const cuanto = porEnvases ? envases : cantidadBase;
  const valido = esCompra
    ? insumo !== undefined && numeroPositivo(cuanto) && numeroPositivo(monto)
    : descripcion.trim() !== "" && numeroPositivo(monto);
  const precioNuevo =
    esCompra && porEnvases && numeroPositivo(envases) && numeroPositivo(monto)
      ? Number(normalizarNumero(monto)) / Number(normalizarNumero(envases))
      : null;
  const entra =
    insumo && numeroPositivo(cuanto)
      ? medida(
          porEnvases ? Number(insumo.contenidoEnvase) * Number(normalizarNumero(envases)) : normalizarNumero(cantidadBase),
          insumo.unidadBase,
        )
      : null;
  const mes = new Date().toLocaleDateString("es-BO", { month: "long", year: "numeric" });

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (!valido) return;
    setGuardando(true);
    setError(null);
    setMensaje(null);
    try {
      const gasto = await api.crearGasto({
        descripcion: descripcion.trim(),
        monto: normalizarNumero(monto),
        categoria,
        ...(esCompra && insumo
          ? {
              insumoId: insumo.id,
              ...(porEnvases
                ? { envases: normalizarNumero(envases), actualizarPrecio }
                : { cantidad: normalizarNumero(cantidadBase) }),
            }
          : {}),
      });
      await Promise.all([lista.recargar(), esCompra ? insumos.recargar() : Promise.resolve()]);
      setMensaje(
        esCompra && insumo && entra
          ? `Compra guardada: ${gasto.descripcion} (${bs(gasto.monto)}). Entraron ${entra} de ${insumo.nombre} al stock.`
          : `Gasto guardado: ${gasto.descripcion} (${bs(gasto.monto)}).`,
      );
      setDescripcion("");
      setMonto("");
      setEnvases("1");
      setCantidadBase("");
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (id: string, eraCompra: boolean) => {
    setError(null);
    setMensaje(null);
    try {
      await api.borrarGasto(id);
      await Promise.all([lista.recargar(), eraCompra ? insumos.recargar() : Promise.resolve()]);
      setMensaje(eraCompra ? "Compra borrada: lo que había sumado al stock se descontó." : "Gasto borrado.");
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setConfirmando(null);
    }
  };

  return (
    <>
      <div className="cabecera-pantalla">
        <div>
          <h1>Gastos</h1>
          <p>Todo lo que sale de la caja: compra de insumos (suma al stock), limpieza, moldes, uso personal…</p>
        </div>
      </div>

      {mensaje && <Aviso tipo="ok">{mensaje}</Aviso>}
      {(error ?? lista.error) && <Aviso tipo="error">{error ?? lista.error}</Aviso>}

      <Panel titulo="Nuevo gasto">
        <form className="gastos__formulario" onSubmit={(e) => void guardar(e)}>
          <Campo etiqueta="Categoría">
            <select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaGasto)}>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {nombreCategoriaGasto[c]}
                </option>
              ))}
            </select>
          </Campo>

          {esCompra && (
            <>
              <Campo etiqueta="Insumo">
                <select value={insumoId} onChange={(e) => setInsumoId(e.target.value)}>
                  <option value="">Elige el insumo…</option>
                  {activos.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.nombre}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo
                etiqueta={porEnvases ? "Envases" : `Cantidad (${insumo ? unidadCorta[insumo.unidadBase] : "g, ml o u"})`}
                ayuda={insumo && porEnvases ? `1 envase = ${medida(insumo.contenidoEnvase, insumo.unidadBase)}` : undefined}
              >
                <div className="gastos__cuanto">
                  <input
                    inputMode="decimal"
                    value={cuanto}
                    onChange={(e) => (porEnvases ? setEnvases(e.target.value) : setCantidadBase(e.target.value))}
                  />
                  <button type="button" className="gastos__modo" onClick={() => setPorEnvases(!porEnvases)}>
                    {porEnvases ? "por cantidad" : "por envases"}
                  </button>
                </div>
              </Campo>
            </>
          )}

          <Campo etiqueta={esCompra ? "Pagaste (Bs)" : "Monto (Bs)"}>
            <input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0,00" />
          </Campo>
          <Campo etiqueta={esCompra ? "Descripción (opcional)" : "Descripción"}>
            <input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder={esCompra ? (insumo ? `${insumo.nombre} · …` : "Se arma sola") : "Ej. Esponja y lavavajillas"}
              maxLength={120}
            />
          </Campo>
          {/* Con una etiqueta vacía arriba, el botón queda a la altura de los campos aunque alguno tenga ayuda debajo. */}
          <div className="campo">
            <span className="campo-etiqueta" aria-hidden>
              &nbsp;
            </span>
            <Button type="submit" variante="primario" disabled={!valido || guardando} className="gastos__guardar">
              {guardando ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </form>

        {esCompra && (
          <div className="gastos__nota">
            {insumo && entra && (
              <p>
                Entran <strong>{entra}</strong> de {insumo.nombre} al stock (hoy hay{" "}
                {medida(insumo.stockActual, insumo.unidadBase)}).
              </p>
            )}
            {insumo && precioNuevo !== null && Math.abs(precioNuevo - Number(insumo.precioEnvase)) > 0.005 && (
              <label className="gastos__precio">
                <input type="checkbox" checked={actualizarPrecio} onChange={(e) => setActualizarPrecio(e.target.checked)} />
                <span>
                  Actualizar el precio del envase: {bs(insumo.precioEnvase)} → <strong>{bs(precioNuevo)}</strong> (cambia el costo
                  de las recetas que lo usan)
                </span>
              </label>
            )}
            <p className="secundario">
              Se ve en los gastos del mes, pero no se resta otra vez de la utilidad neta: el costo de los insumos ya se descuenta
              como costo de producción cuando vendes.
            </p>
          </div>
        )}
        {categoria === "LIMPIEZA" && (
          // D31: el insumo «Limpieza y otros» sigue en las recetas.
          <p className="secundario gastos__nota">
            Las recetas ya incluyen un costo de limpieza por tanda («Limpieza y otros», 0,50 Bs). Lo que cargues aquí se resta
            además de ese costo.
          </p>
        )}
        {categoria === "USO_PERSONAL" && (
          // D47: es plata del negocio que se usó para ti; se resta igual que cualquier gasto.
          <p className="secundario gastos__nota">
            Lo que gastaste en ti con plata del negocio. Se resta de la utilidad neta igual que los demás gastos y queda separado
            para que sepas cuánto fue.
          </p>
        )}
      </Panel>

      {lista.datos && (
        <div className="grilla-tarjetas">
          <Tarjeta
            titulo={`Total de ${mes}`}
            valor={bs(lista.datos.total)}
            detalle={`Se resta de la utilidad: ${bs(lista.datos.totalOperativo)}`}
          />
          {categorias.map((c) => (
            <Tarjeta key={c} titulo={nombreCategoriaGasto[c]} valor={bs(lista.datos?.porCategoria[c] ?? 0)} />
          ))}
        </div>
      )}

      <Panel titulo={`Gastos de ${mes}`}>
        {lista.cargando && !lista.datos ? (
          <Cargando />
        ) : lista.datos?.gastos.length === 0 ? (
          <p className="vacio">Todavía no hay gastos este mes.</p>
        ) : (
          <div className="tabla-envoltura">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Descripción</th>
                  <th>Categoría</th>
                  <th className="num">Monto</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lista.datos?.gastos.map((g) => (
                  <tr key={g.id}>
                    <td className="secundario">{fechaCorta(g.fecha)}</td>
                    <td>
                      {g.descripcion}
                      {g.insumo && g.cantidad && (
                        <span className="secundario"> · +{medida(g.cantidad, g.insumo.unidadBase)} al stock</span>
                      )}
                    </td>
                    <td>
                      <span className="etiqueta">{nombreCategoriaGasto[g.categoria]}</span>
                    </td>
                    <td className="num">{bs(g.monto)}</td>
                    <td className="num gastos__acciones">
                      {confirmando === g.id ? (
                        <>
                          <Button tamano="chico" variante="peligro" onClick={() => void borrar(g.id, g.categoria === "INSUMOS")}>
                            Sí, borrar
                          </Button>
                          <Button tamano="chico" variante="texto" onClick={() => setConfirmando(null)}>
                            No
                          </Button>
                        </>
                      ) : (
                        <Button tamano="chico" variante="texto" onClick={() => setConfirmando(g.id)}>
                          Borrar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
