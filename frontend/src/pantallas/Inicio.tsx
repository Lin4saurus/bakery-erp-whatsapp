import { useState } from "react";
import {
  MdOutlineAddShoppingCart,
  MdOutlineCheckCircle,
  MdOutlineChevronRight,
  MdOutlineFactCheck,
  MdOutlineInsights,
  MdOutlinePayments,
  MdOutlineWarningAmber,
  MdRefresh,
} from "react-icons/md";
import { api, type Venta } from "../api";
import { BarChart, type Barra } from "../components/charts/BarChart";
import { PuntoEquilibrioCard } from "../components/dashboard/PuntoEquilibrioCard";
import { GASTOS_FIJOS_MENSUALES, puntoDeEquilibrio } from "../components/dashboard/indicadores";
import { bs, cantidad, diaLargo, hoyISO, hora, inicioDeMesISO, medida } from "../formato";
import { Aviso, Button, Cargando, Panel, useDatos } from "../ui";
import { prepararAjuste, prepararCompra, prepararDia } from "../compraPendiente";
import { tomarUltimaVenta } from "../ultimaVenta";
import "./Inicio.css";

const MAX_ALERTAS = 3;
const DIAS = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sá"];

const isoLocal = (fecha: Date): string => fecha.toLocaleDateString("sv-SE");

// Los últimos 7 días (hoy incluido), del más viejo a hoy.
const ultimosSieteDias = (): Date[] =>
  Array.from({ length: 7 }, (_, i) => {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - (6 - i));
    return fecha;
  });

// Últimos 7 días (hoy incluido) con las unidades vendidas en cada uno.
function tendenciaSemanal(ventas: Venta[]): Barra[] {
  const porDia = new Map<string, number>();
  for (const v of ventas) {
    const dia = isoLocal(new Date(v.fecha));
    porDia.set(dia, (porDia.get(dia) ?? 0) + Number(v.cantidad));
  }
  return ultimosSieteDias().map((fecha, i) => ({
    etiqueta: DIAS[fecha.getDay()] ?? "",
    valor: porDia.get(isoLocal(fecha)) ?? 0,
    destacada: i === 6,
  }));
}

export function Inicio() {
  const hoy = hoyISO();
  // Venta recién registrada en la Caja (solo se muestra al volver de ahí).
  const [ultima] = useState(tomarUltimaVenta);
  const haceSeis = (() => {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - 6);
    return isoLocal(fecha);
  })();

  const semana = useDatos(() => api.ventas(haceSeis, hoy), [haceSeis, hoy]);
  const alertas = useDatos(api.alertas);
  const productos = useDatos(() => api.productos({ tipo: "VENTA", activo: true }));
  const insumos = useDatos(api.insumos);
  const inicioMes = inicioDeMesISO();
  const ventasMes = useDatos(() => api.ventas(inicioMes, hoy), [inicioMes, hoy]);
  const gastosMes = useDatos(() => api.gastos(inicioMes, hoy), [inicioMes, hoy]);

  const recargarTodo = () => {
    void semana.recargar();
    void alertas.recargar();
    void productos.recargar();
    void insumos.recargar();
    void ventasMes.recargar();
    void gastosMes.recargar();
  };

  // Las anuladas no cuentan en ningún total ni en la tendencia.
  const ventasSemana = semana.datos?.ventas.filter((v) => !v.anulada) ?? [];
  const ventasHoy = ventasSemana.filter((v) => isoLocal(new Date(v.fecha)) === hoy);
  const sumar = (campo: "totalVenta" | "gananciaBruta" | "cantidad") =>
    ventasHoy.reduce((total, v) => total + Number(v[campo]), 0);
  const ventaDia = sumar("totalVenta");
  const gananciaDia = sumar("gananciaBruta");
  const unidadesDia = sumar("cantidad");

  // Utilidad neta = ganancia bruta − gastos operativos del período (pantalla Gastos).
  const gastosDia =
    gastosMes.datos?.gastos
      // La compra de insumos ya se descuenta como costo de producción al vender (D51).
      .filter((g) => g.categoria !== "INSUMOS" && isoLocal(new Date(g.fecha)) === hoy)
      .reduce((t, g) => t + Number(g.monto), 0) ?? 0;
  const netaDia = gananciaDia - gastosDia;
  const gananciaMes = Number(ventasMes.datos?.resumen.gananciaBruta ?? 0);
  const gastosDelMes = Number(gastosMes.datos?.totalOperativo ?? 0);
  const netaMes = gananciaMes - gastosDelMes;
  const tono = (valor: number) => (valor < 0 ? "negativo" : valor > 0 ? "positivo" : undefined);

  const equilibrio = puntoDeEquilibrio(ventasMes.datos?.ventas ?? [], productos.datos ?? [], GASTOS_FIJOS_MENSUALES);
  const nombreMes = new Date().toLocaleDateString("es-BO", { month: "long" });

  const barras = tendenciaSemanal(ventasSemana);
  const unidadesSemana = barras.reduce((t, b) => t + b.valor, 0);

  const stockDe = (insumoId: number, stock: string) => {
    const insumo = insumos.datos?.find((i) => i.id === insumoId);
    return insumo ? medida(stock, insumo.unidadBase) : cantidad(stock);
  };
  const enPerdida = productos.datos?.filter((p) => p.gananciaUnitaria !== null && Number(p.gananciaUnitaria) < 0) ?? [];

  return (
    // .inicio achica todo el Resumen un poco (cajas, textos y números), sin tocar las otras pantallas.
    <div className="inicio">
      <div className="cabecera-pantalla">
        <div>
          <h1>Resumen del día</h1>
          <p>Lo importante de hoy, de un vistazo.</p>
        </div>
        {/* El acceso a la Caja vive en la cabecera: siempre en el mismo lugar y sin ocupar una tarjeta. */}
        <div className="inicio__acciones">
          <Button onClick={recargarTodo}>
            <MdRefresh aria-hidden />
            Actualizar
          </Button>
          <Button
            variante="exito"
            onClick={() => {
              window.location.hash = "caja";
            }}
          >
            <MdOutlineAddShoppingCart aria-hidden />
            Registrar pedido
          </Button>
        </div>
      </div>

      {ultima && (
        <Aviso tipo="ok">
          Pedido registrado: {ultima.ventas.map((v) => `${cantidad(v.cantidad)} × ${v.producto}`).join(", ")} ={" "}
          {bs(ultima.totalVenta)} a {ultima.cliente} (costo de producción {bs(ultima.costoTotal)}, ganancia{" "}
          {bs(ultima.gananciaBruta)}).
          {isoLocal(new Date(ultima.fecha)) !== hoy && (
            <> Quedó como venta del {diaLargo(isoLocal(new Date(ultima.fecha)))}, así que no suma en «Caja de hoy».</>
          )}
        </Aviso>
      )}
      {ultima && ultima.alertas.length > 0 && (
        <Aviso tipo="alerta">
          <strong>Revisa el stock:</strong> {ultima.alertas.length} insumo(s) quedaron sin stock o bajo el mínimo (
          {ultima.alertas
            .slice(0, 6)
            .map((a) => a.nombre)
            .join(", ")}
          {ultima.alertas.length > 6 ? "…" : ""}). Carga las compras en Insumos.
        </Aviso>
      )}
      {semana.error && <Aviso tipo="error">{semana.error}</Aviso>}

      <div className="inicio__tarjetas">
        <section className="inicio-card">
          <header className="inicio-card__cabecera">
            <span className="inicio-card__titulo">Caja de hoy</span>
            <span className="inicio-card__icono" aria-hidden>
              <MdOutlinePayments />
            </span>
          </header>
          <div className="inicio-card__valor">{bs(ventaDia)}</div>
          <div className="inicio-card__subtitulo">
            Venta del día · {ventasHoy.length} venta(s), {cantidad(unidadesDia)} u
          </div>
          <dl className="inicio-card__lista">
            <div>
              <dt>Ganancia bruta</dt>
              <dd className={tono(gananciaDia)}>{bs(gananciaDia)}</dd>
            </div>
            <div>
              <dt>
                <a href="#gastos" className="inicio-card__enlace-dato">
                  Gastos del día
                </a>
              </dt>
              <dd>{gastosDia > 0 ? `− ${bs(gastosDia)}` : bs(0)}</dd>
            </div>
            <div className="inicio-card__neta">
              <dt>Utilidad neta</dt>
              <dd className={tono(netaDia)}>{bs(netaDia)}</dd>
            </div>
          </dl>
          <div className="inicio-card__mes">
            <span>Utilidad neta del mes</span>
            <strong className={tono(netaMes)}>{bs(netaMes)}</strong>
            <span className="inicio-card__mes-detalle">
              Ganancia {bs(gananciaMes)} − gastos {bs(gastosDelMes)}
            </span>
          </div>
        </section>

        <section className="inicio-card">
          <header className="inicio-card__cabecera">
            <span className="inicio-card__titulo">Alertas de stock</span>
            <span className="inicio-card__icono inicio-card__icono--alerta" aria-hidden>
              <MdOutlineWarningAmber />
            </span>
          </header>
          {alertas.cargando && !alertas.datos ? (
            <Cargando />
          ) : alertas.datos?.length === 0 ? (
            <p className="inicio-card__ok">
              <MdOutlineCheckCircle aria-hidden /> Todo el stock está sobre el mínimo.
            </p>
          ) : (
            <>
              <ul className="inicio-alertas">
                {alertas.datos?.slice(0, MAX_ALERTAS).map((a) => (
                  <li key={a.insumoId}>
                    <div className="inicio-alertas__dato">
                      <span className={`semaforo ${a.nivel === "SIN_STOCK" ? "" : "semaforo-amarillo"}`} aria-hidden />
                      <span className="inicio-alertas__nombre">{a.nombre}</span>
                      <span className="inicio-alertas__stock">{stockDe(a.insumoId, a.stockActual)}</span>
                    </div>
                    {/* Igual que en Insumos (D72): la compra va a Gastos; «Actualizar stock» corrige lo que hay. */}
                    <div className="inicio-alertas__acciones">
                      <button
                        type="button"
                        className="boton boton-chico"
                        title="Abre Gastos con este insumo: suma al stock y queda el gasto"
                        onClick={() => {
                          prepararCompra(a.insumoId);
                          window.location.hash = "gastos";
                        }}
                      >
                        <MdOutlineAddShoppingCart aria-hidden /> Registrar compra
                      </button>
                      <button
                        type="button"
                        className="boton boton-chico"
                        title="Escribe cuánto hay ahora (regalo, pérdida o conteo)"
                        onClick={() => {
                          prepararAjuste(a.insumoId);
                          window.location.hash = "insumos";
                        }}
                      >
                        <MdOutlineFactCheck aria-hidden /> Actualizar stock
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <a className="inicio-card__enlace" href="#insumos">
                Ver los {alertas.datos?.length ?? 0} insumos <MdOutlineChevronRight aria-hidden />
              </a>
            </>
          )}
        </section>

        <section className="inicio-card">
          <header className="inicio-card__cabecera">
            <span className="inicio-card__titulo">Últimos 7 días</span>
            <span className="inicio-card__icono" aria-hidden>
              <MdOutlineInsights />
            </span>
          </header>
          {/* Tocar un día abre Desempeño con ese día en «Por producto» (D72). */}
          <BarChart
            datos={barras}
            alto={120}
            descripcion={`Unidades vendidas por día: ${barras.map((b) => `${b.etiqueta} ${b.valor}`).join(", ")}`}
            alElegir={(i) => {
              const fecha = ultimosSieteDias()[i];
              if (!fecha) return;
              prepararDia(isoLocal(fecha));
              window.location.hash = "desempeno";
            }}
          />
          <div className="inicio-card__pie">{cantidad(unidadesSemana)} unidades vendidas en la semana</div>
        </section>
      </div>

      {enPerdida.length > 0 && (
        <Aviso tipo="alerta">
          <strong>{enPerdida.length} producto(s) se venden por debajo de su costo:</strong>{" "}
          {enPerdida.map((p) => `${p.nombre} (${bs(p.gananciaUnitaria)} por unidad)`).join(" · ")}. Revisa su precio en{" "}
          <a href="#recetas">Recetas y precios</a>.
        </Aviso>
      )}

      {/* Punto de equilibrio y Ventas de hoy, uno al lado del otro (D77). */}
      <div className="inicio__indicadores">
        <PuntoEquilibrioCard equilibrio={equilibrio} mes={nombreMes} />
        <Panel titulo="Ventas de hoy">
          {semana.cargando && !semana.datos ? (
            <Cargando />
          ) : ventasHoy.length === 0 ? (
            <p className="vacio">Todavía no hay ventas hoy.</p>
          ) : (
            <div className="tabla-envoltura">
              <table>
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Producto</th>
                    <th className="num">Total</th>
                    <th className="num">Ganancia</th>
                  </tr>
                </thead>
                <tbody>
                  {ventasHoy.map((v) => (
                    <tr key={v.id}>
                      <td className="hora secundario">{hora(v.fecha)}</td>
                      <td>
                        {cantidad(v.cantidad)} × {v.producto}
                      </td>
                      <td className="num">{bs(v.totalVenta)}</td>
                      <td className={`num ${Number(v.gananciaBruta) < 0 ? "negativo" : "positivo"}`}>{bs(v.gananciaBruta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
