import { useState, type KeyboardEvent } from "react";
import { api, mensajeDeError, type Cliente, type Producto, type Venta } from "../api";
import { bs, cantidad, diaLargo, esNumeroValido, fechaCorta, hoyISO, normalizarNumero } from "../formato";
import { Aviso, BuscadorCliente, Button, Campo, Cargando, Panel, TipoClienteBadge, mismoNombre, useDatos } from "../ui";
import { precioParaCliente } from "../precios";
import { guardarUltimaVenta } from "../ultimaVenta";
import { VentasDeHoy } from "./VentasDeHoy";
import "./Caja.css";

// Caja por pedido (D48): primero la familia (Queques, Flanes…), después los sabores de esa familia
// en una lista corta y fija. Cada sabor tocado entra al pedido con borde dorado y su cantidad;
// tocarlo otra vez lo quita. Un pedido puede llevar productos de varias familias.
// Todo producto activo está en su familia (D49): ya no hay «No disponibles por ahora».

interface Linea {
  productoId: number;
  cantidad: string; // solo dígitos
  precio: string;
}

// «Queque Oreo» dentro de «Queques» se muestra «Oreo»: el ojo lee la palabra que cambia.
export function nombreCorto(nombre: string, familia: string): string {
  const texto = nombre.trim();
  for (const prefijo of [familia, familia.replace(/es$/i, ""), familia.replace(/s$/i, "")]) {
    if (prefijo && texto.toLowerCase().startsWith(`${prefijo.toLowerCase()} `)) {
      const resto = texto.slice(prefijo.length + 1).trim();
      return resto.charAt(0).toUpperCase() + resto.slice(1);
    }
  }
  return texto;
}

const soloDigitos = (texto: string) => texto.replace(/\D/g, "").slice(0, 4);

export function Caja() {
  const hoy = hoyISO();
  const productos = useDatos(() => api.productos({ tipo: "VENTA", activo: true }));
  const ventasHoy = useDatos(() => api.ventas(hoy, hoy), [hoy]);
  const pendientes = useDatos(api.pendientes);
  const clientes = useDatos(() => api.clientes());

  const [familiaElegida, setFamiliaElegida] = useState<string | null>(null);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [fiado, setFiado] = useState(false);
  // Todo pedido lleva cliente: nombre (con sugerencias de los ya registrados) y celular (D44).
  const [nombreCliente, setNombreCliente] = useState("");
  const [celular, setCelular] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [fechaVenta, setFechaVenta] = useState(hoy);
  const esOtroDia = fechaVenta !== hoy;
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cobrando, setCobrando] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [errorCatalogo, setErrorCatalogo] = useState<string | null>(null);

  const clienteSel: Cliente | null =
    clientes.datos?.find((c) => c.id === clienteId) ??
    (nombreCliente.trim() ? (clientes.datos?.find((c) => mismoNombre(c.nombre, nombreCliente)) ?? null) : null);
  const clienteNuevo = clienteSel === null && nombreCliente.trim() !== "";
  const celularValido = celular.replace(/\D/g, "").length >= 7;
  const precioDe = (producto: Producto, cliente: Cliente | null = clienteSel) => precioParaCliente(cliente, producto);

  const aLaVenta = productos.datos ?? [];
  const porId = new Map((productos.datos ?? []).map((p) => [p.id, p]));

  // Familias: la que tiene más productos primero (hoy, Queques).
  const familias = [...new Set(aLaVenta.map((p) => p.categoria))].sort(
    (a, b) =>
      aLaVenta.filter((p) => p.categoria === b).length - aLaVenta.filter((p) => p.categoria === a).length || a.localeCompare(b),
  );
  const familia = familiaElegida && familias.includes(familiaElegida) ? familiaElegida : (familias[0] ?? null);
  // Orden alfabético; los números se comparan como números («4 u» antes que «9 u» y «16 u»).
  const ordenar = (lista: Producto[], f: string) =>
    [...lista].sort((a, b) =>
      nombreCorto(a.nombre, f).localeCompare(nombreCorto(b.nombre, f), "es", { numeric: true, sensitivity: "base" }),
    );
  const delaFamilia = (f: string) =>
    ordenar(
      aLaVenta.filter((p) => p.categoria === f),
      f,
    );
  const lineaDe = (id: number) => lineas.find((l) => l.productoId === id);
  const enPedido = (f: string) => lineas.filter((l) => porId.get(l.productoId)?.categoria === f).length;

  // ---------- pedido ----------
  const alternar = (p: Producto) => {
    setError(null);
    setLineas((actuales) =>
      actuales.some((l) => l.productoId === p.id)
        ? actuales.filter((l) => l.productoId !== p.id)
        : [
            ...actuales,
            {
              productoId: p.id,
              cantidad: "1",
              precio: precioDe(p).precio ?? "",
            },
          ],
    );
  };
  const cambiarLinea = (id: number, cambios: Partial<Linea>) =>
    setLineas((actuales) => actuales.map((l) => (l.productoId === id ? { ...l, ...cambios } : l)));
  const sumar = (id: number, delta: number) => {
    const linea = lineaDe(id);
    if (!linea) return;
    const nueva = (Number(linea.cantidad) || 0) + delta;
    if (nueva <= 0) setLineas((actuales) => actuales.filter((l) => l.productoId !== id));
    else cambiarLinea(id, { cantidad: String(nueva) });
  };
  // Al salir del campo con 0 o vacío, el producto sale del pedido.
  const alSalirCantidad = (id: number) => {
    const linea = lineaDe(id);
    if (linea && !(Number(linea.cantidad) > 0)) setLineas((actuales) => actuales.filter((l) => l.productoId !== id));
  };
  // Con otro cliente, los precios del pedido pasan a los suyos (acordados o de venta).
  const reprecio = (cliente: Cliente | null) =>
    setLineas((actuales) =>
      actuales.map((l) => {
        const p = porId.get(l.productoId);
        return p ? { ...l, precio: precioParaCliente(cliente, p).precio ?? l.precio } : l;
      }),
    );

  const elegirCliente = (elegido: Cliente) => {
    setClienteId(elegido.id);
    setNombreCliente(elegido.nombre);
    setCelular(elegido.celular ?? "");
    reprecio(elegido);
  };

  const escribirNombre = (texto: string) => {
    setNombreCliente(texto);
    if (clienteId && !mismoNombre(texto, clientes.datos?.find((c) => c.id === clienteId)?.nombre ?? "")) {
      setClienteId("");
      setCelular("");
      reprecio(null);
    }
  };

  const filas = lineas.flatMap((l) => {
    const producto = porId.get(l.productoId);
    if (!producto) return [];
    const n = Number(l.cantidad) || 0;
    const precio = esNumeroValido(l.precio) ? Number(normalizarNumero(l.precio)) : 0;
    return [
      {
        ...l,
        producto,
        n,
        total: n * precio,
        costo: n * Number(producto.costoUnitario),
        acordado: precioDe(producto).acordado,
      },
    ];
  });
  const total = filas.reduce((t, f) => t + f.total, 0);
  const costo = filas.reduce((t, f) => t + f.costo, 0);
  const ganancia = total - costo;
  const unidades = filas.reduce((t, f) => t + f.n, 0);

  const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(fechaVenta) && fechaVenta <= hoy;
  const lineasValidas = filas.length > 0 && filas.every((f) => f.n > 0 && esNumeroValido(f.precio));
  const datosValidos = lineasValidas && fechaValida && nombreCliente.trim() !== "" && celularValido;

  const registrar = async () => {
    if (!datosValidos) return;
    setGuardando(true);
    setError(null);
    setMensaje(null);
    try {
      const pedido = await api.crearPedido({
        lineas: filas.map((f) => ({
          productoId: f.productoId,
          cantidad: String(f.n),
          precioUnitario: f.acordado ? undefined : normalizarNumero(f.precio),
        })),
        fiado,
        clienteId: clienteSel?.id,
        clienteNombre: clienteSel ? undefined : nombreCliente.trim(),
        celular: celular.trim(),
        fecha: esOtroDia ? fechaVenta : undefined,
      });
      // El resultado se ve en Inicio, con los totales del día ya actualizados.
      guardarUltimaVenta(pedido);
      window.location.hash = "inicio";
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  };

  // ---------- fiados ----------
  // Un pedido fiado de varios productos se cobra entero, en una sola fila.
  const grupos = (() => {
    const mapa = new Map<string, Venta[]>();
    for (const v of pendientes.datos?.ventas ?? []) {
      const clave = v.pedidoId ?? `venta-${v.id}`;
      mapa.set(clave, [...(mapa.get(clave) ?? []), v]);
    }
    return [...mapa.entries()].map(([clave, ventas]) => ({
      clave,
      ventas,
      total: ventas.reduce((t, v) => t + Number(v.totalVenta), 0),
    }));
  })();

  const cobrar = async (clave: string, ventas: Venta[]) => {
    const primera = ventas[0];
    if (!primera) return;
    setCobrando(clave);
    setMensaje(null);
    setError(null);
    try {
      if (primera.pedidoId) await api.cobrarPedido(primera.pedidoId);
      else await api.cobrar(primera.id);
      setMensaje(`Cobrado: ${bs(ventas.reduce((t, v) => t + Number(v.totalVenta), 0))} de ${primera.cliente ?? "cliente"}.`);
      void pendientes.recargar();
      void ventasHoy.recargar();
    } catch (e) {
      setErrorCatalogo(mensajeDeError(e));
    } finally {
      setCobrando(null);
    }
  };

  const alAnular = (texto: string) => {
    setMensaje(texto);
    void ventasHoy.recargar();
    void pendientes.recargar();
  };

  const teclaFila = (e: KeyboardEvent, p: Producto) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      alternar(p);
    }
  };

  return (
    <>
      <div className="cabecera-pantalla">
        <div>
          <h1>Caja</h1>
        </div>
      </div>

      {mensaje && <Aviso tipo="ok">{mensaje}</Aviso>}
      {errorCatalogo && <Aviso tipo="error">{errorCatalogo}</Aviso>}
      {productos.error && <Aviso tipo="error">{productos.error}</Aviso>}

      <div className="caja">
        <div>
          {productos.cargando && !productos.datos ? (
            <Cargando />
          ) : (
            <>
              <section aria-label="Productos">
                {familias.length === 0 || !familia ? (
                  <p className="caja__zona-vacia">No hay productos activos. Actívalos en Recetas y precios.</p>
                ) : (
                  <div className="caja-pedido">
                    <div className="caja-pedido__cuerpo">
                      <nav className="caja-familias" aria-label="Familias">
                        {familias.map((f) => {
                          const cuantos = enPedido(f);
                          return (
                            <button
                              key={f}
                              className={`caja-familia ${f === familia ? "caja-familia--elegida" : ""}`}
                              aria-pressed={f === familia}
                              onClick={() => setFamiliaElegida(f)}
                            >
                              <span className="caja-familia__nombre">{f}</span>
                              <span className={`caja-familia__detalle ${cuantos ? "caja-familia__detalle--pedido" : ""}`}>
                                {cuantos ? `${cuantos} en el pedido` : `${delaFamilia(f).length} producto(s)`}
                              </span>
                            </button>
                          );
                        })}
                      </nav>

                      {/* Dos columnas que se leen de arriba abajo (A–L | M–Z): 11 sabores caben sin deslizar. */}
                      <div
                        className="caja-sabores"
                        role="list"
                        aria-label={`Productos de ${familia}`}
                        style={{
                          gridTemplateRows: `repeat(${Math.ceil(delaFamilia(familia).length / 2)}, auto)`,
                        }}
                      >
                        {delaFamilia(familia).map((p) => {
                          const linea = lineaDe(p.id);
                          const { precio } = precioDe(p);
                          return (
                            <div
                              key={p.id}
                              role="listitem"
                              tabIndex={0}
                              className={`caja-sabor ${linea ? "caja-sabor--elegido" : ""}`}
                              onClick={() => alternar(p)}
                              onKeyDown={(e) => teclaFila(e, p)}
                              aria-label={`${p.nombre}${linea ? `, ${linea.cantidad} en el pedido` : ""}`}
                            >
                              {/* Arriba: nombre y precio; abajo: costo y cantidad. */}
                              <span className="caja-sabor__nombre" title={p.nombre}>
                                {nombreCorto(p.nombre, familia)}
                              </span>
                              <span className="caja-sabor__precio">{bs(precio)}</span>
                              <span className="caja-sabor__costo">Costo producción {bs(p.costoUnitario)}</span>
                              {linea ? (
                                <span
                                  className="caja-sabor__contador"
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => e.stopPropagation()}
                                >
                                  <button
                                    className="boton"
                                    aria-label={`Restar uno de ${p.nombre}`}
                                    onClick={() => sumar(p.id, -1)}
                                  >
                                    −
                                  </button>
                                  <input
                                    inputMode="numeric"
                                    aria-label={`Cantidad de ${p.nombre}`}
                                    value={linea.cantidad}
                                    onChange={(e) =>
                                      cambiarLinea(p.id, {
                                        cantidad: soloDigitos(e.target.value),
                                      })
                                    }
                                    onBlur={() => alSalirCantidad(p.id)}
                                    onFocus={(e) => e.target.select()}
                                  />
                                  <button
                                    className="boton"
                                    aria-label={`Sumar uno de ${p.nombre}`}
                                    onClick={() => sumar(p.id, 1)}
                                  >
                                    +
                                  </button>
                                </span>
                              ) : (
                                <span className="caja-sabor__agregar" aria-hidden>
                                  +
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </>
          )}

          <div id="por-cobrar" className="caja__por-cobrar">
            <Panel titulo={`Por cobrar (fiado) · ${bs(pendientes.datos?.total ?? 0)}`}>
              {pendientes.error && <Aviso tipo="error">{pendientes.error}</Aviso>}
              {pendientes.cargando && !pendientes.datos ? (
                <Cargando />
              ) : grupos.length === 0 ? (
                <p className="vacio">No hay fiados pendientes.</p>
              ) : (
                <div className="tabla-envoltura">
                  <table>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Cliente</th>
                        <th>Detalle</th>
                        <th className="num">Monto</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {grupos.map(({ clave, ventas, total: monto }) => (
                        <tr key={clave}>
                          <td className="hora secundario">{fechaCorta(ventas[0]?.fecha ?? "")}</td>
                          <td>{ventas[0]?.cliente}</td>
                          <td>{ventas.map((v) => `${cantidad(v.cantidad)} × ${v.producto}`).join(", ")}</td>
                          <td className="num">{bs(monto)}</td>
                          <td className="num">
                            <Button tamano="chico" disabled={cobrando === clave} onClick={() => void cobrar(clave, ventas)}>
                              {cobrando === clave ? "Cobrando…" : "Cobrar"}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        </div>

        <div>
          <Panel titulo="Cliente">
            <div className="panel-cuerpo caja__cliente">
              <Campo etiqueta="Nombre de quien hace el pedido">
                <BuscadorCliente
                  clientes={clientes.datos ?? []}
                  texto={nombreCliente}
                  alCambiarTexto={escribirNombre}
                  alElegir={elegirCliente}
                  placeholder="Escribe el nombre: aparecen los clientes que ya compraron"
                />
              </Campo>
              <Campo etiqueta="Celular">
                <input
                  value={celular}
                  onChange={(e) => setCelular(e.target.value)}
                  inputMode="tel"
                  placeholder="Ej. 71234567"
                  aria-invalid={celular !== "" && !celularValido}
                />
              </Campo>
              {celular !== "" && !celularValido && (
                <p className="caja__cliente-detalle negativo">El celular debe tener al menos 7 dígitos.</p>
              )}
              {clienteSel ? (
                <p className="secundario caja__cliente-detalle">
                  <TipoClienteBadge tipo={clienteSel.tipo} />{" "}
                  {clienteSel.precios.length > 0
                    ? "Con precios acordados: ya se ven en los sabores."
                    : "Sin precio acordado: precio de venta."}
                </p>
              ) : clienteNuevo ? (
                <p className="secundario caja__cliente-detalle">
                  <span className="etiqueta etiqueta-positiva">Cliente nuevo</span> Se guardará en Clientes con su celular.
                </p>
              ) : (
                <p className="secundario caja__cliente-detalle">Sin nombre y celular no se puede registrar el pedido.</p>
              )}
            </div>
          </Panel>

          <Panel titulo={filas.length ? `Pedido · ${filas.length} producto(s)` : "Pedido"}>
            <div className="panel-cuerpo">
              {error && <Aviso tipo="error">{error}</Aviso>}
              {filas.length === 0 ? (
                <p className="secundario">Toca los sabores de la izquierda: cada uno entra al pedido.</p>
              ) : (
                <>
                  <ul className="caja-lineas">
                    {filas.map((f) => (
                      <li key={f.productoId} className="caja-linea">
                        <span className="caja-linea__nombre">
                          {cantidad(f.n)} × {f.producto.nombre}
                          <span className="caja-sabor__costo">Costo producción {bs(f.costo)}</span>
                        </span>
                        <label
                          className="caja-linea__precio"
                          title={f.acordado ? "Precio acordado con el cliente" : "Puedes cambiarlo para un descuento"}
                        >
                          <span className="secundario">Bs</span>
                          <input
                            inputMode="decimal"
                            value={f.precio}
                            readOnly={f.acordado}
                            aria-label={`Precio por unidad de ${f.producto.nombre}`}
                            onChange={(e) =>
                              cambiarLinea(f.productoId, {
                                precio: e.target.value,
                              })
                            }
                          />
                        </label>
                        <span className="caja-linea__total">{bs(f.total)}</span>
                        <button
                          className="caja-linea__quitar"
                          aria-label={`Quitar ${f.producto.nombre}`}
                          onClick={() => alternar(f.producto)}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                  {filas.some((f) => f.acordado) && (
                    <p className="secundario caja__cliente-detalle">Los precios acordados no se editan aquí.</p>
                  )}

                  <div className="caja__separador" />
                  <Campo
                    etiqueta="Fecha del pedido"
                    ayuda={esOtroDia && fechaValida ? undefined : "Cámbiala si olvidaste cargar un pedido de otro día."}
                  >
                    <div className="caja__fecha">
                      <input type="date" value={fechaVenta} max={hoy} onChange={(e) => setFechaVenta(e.target.value)} />
                      {esOtroDia && (
                        <Button tamano="chico" variante="texto" onClick={() => setFechaVenta(hoy)}>
                          Volver a hoy
                        </Button>
                      )}
                    </div>
                  </Campo>
                  {esOtroDia && fechaValida && (
                    <Aviso tipo="alerta">
                      Se cargará como pedido del <strong>{diaLargo(fechaVenta)}</strong>. No aparecerá en «Ventas de hoy».
                    </Aviso>
                  )}
                  {!fechaValida && <Aviso tipo="error">Elige una fecha de hoy o anterior.</Aviso>}
                  <div className="caja__separador" />
                  <label className="casilla">
                    <input type="checkbox" checked={fiado} onChange={(e) => setFiado(e.target.checked)} />
                    <span>
                      <strong>Fiado</strong>
                      <span className="secundario"> · se entrega ahora y se cobra después</span>
                    </span>
                  </label>

                  <div className="resumen-venta">
                    <span className="secundario">Unidades</span>
                    <span>{cantidad(unidades)}</span>
                    <span>{fiado ? "Total por cobrar" : "Total a cobrar"}</span>
                    <span className="total">{bs(total)}</span>
                  </div>
                  {ganancia < 0 && <Aviso tipo="alerta">Con estos precios se vende por debajo del costo.</Aviso>}
                  <button
                    className="boton boton-primario boton-grande"
                    disabled={!datosValidos || guardando}
                    onClick={() => void registrar()}
                  >
                    {guardando
                      ? "Registrando…"
                      : `${fiado ? "Registrar fiado" : "Registrar pedido"}${esOtroDia ? " de otro día" : ""} · ${bs(total)}`}
                  </button>
                  <div className="caja__quitar">
                    <Button variante="texto" tamano="chico" onClick={() => setLineas([])}>
                      Vaciar pedido
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Panel>

          <VentasDeHoy lista={ventasHoy.datos} alAnular={alAnular} />
        </div>
      </div>
    </>
  );
}
