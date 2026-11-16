import { useState } from "react";
import { MdOutlineFileDownload, MdOutlinePrint } from "react-icons/md";
import { api, mensajeDeError, type Reporte } from "../api";
import { bs, cantidad, hoyISO } from "../formato";
import { Aviso, Button, Campo, Cargando, Panel, Tarjeta, useDatos } from "../ui";
import "./Reportes.css";

// Reporte para el contador (D106): ventas, ganancia por producto, ventas por día y gastos de un periodo.
// «Descargar Excel» baja el .xlsx con todas las ventas una por una; «Imprimir o PDF» abre la impresión del
// navegador, donde se elige «Guardar como PDF». Al imprimir se ocultan el menú y los botones.

const mesDe = (corrimiento: number): { desde: string; hasta: string } => {
  const hoy = new Date();
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth() + corrimiento, 1);
  const fin = new Date(hoy.getFullYear(), hoy.getMonth() + corrimiento + 1, 0);
  return { desde: inicio.toLocaleDateString("sv-SE"), hasta: fin.toLocaleDateString("sv-SE") };
};

const fechaCorta = (dia: string) => dia.split("-").reverse().join("/");

export function Reportes() {
  const [periodo, setPeriodo] = useState(() => {
    const mes = mesDe(0);
    return { desde: mes.desde, hasta: hoyISO() < mes.hasta ? hoyISO() : mes.hasta };
  });
  const valido = periodo.desde !== "" && periodo.hasta !== "" && periodo.desde <= periodo.hasta;
  const reporte = useDatos(
    () => (valido ? api.reporte(periodo.desde, periodo.hasta) : Promise.resolve(undefined)),
    [periodo.desde, periodo.hasta, valido],
  );
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const descargar = async () => {
    setBajando(true);
    setError(null);
    try {
      const archivo = await api.reporteExcel(periodo.desde, periodo.hasta);
      const url = URL.createObjectURL(archivo);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = `dulzura_reporte_${periodo.desde}_al_${periodo.hasta}.xlsx`;
      enlace.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setBajando(false);
    }
  };

  const r = reporte.datos;
  return (
    <div className="reportes">
      <div className="cabecera-pantalla">
        <div>
          <h1>Reportes</h1>
          <p>Ventas, ganancia y gastos de un periodo, para el contador o para revisar el mes.</p>
        </div>
        <div className="reportes__acciones no-imprimir">
          <Button onClick={() => void descargar()} disabled={!r || bajando}>
            <MdOutlineFileDownload aria-hidden /> {bajando ? "Preparando…" : "Descargar Excel"}
          </Button>
          <Button variante="primario" onClick={() => window.print()} disabled={!r}>
            <MdOutlinePrint aria-hidden /> Imprimir o PDF
          </Button>
        </div>
      </div>

      <div className="reportes__periodo no-imprimir">
        <Button tamano="chico" onClick={() => setPeriodo(mesDe(0))}>
          Este mes
        </Button>
        <Button tamano="chico" onClick={() => setPeriodo(mesDe(-1))}>
          Mes pasado
        </Button>
        <Campo etiqueta="Desde">
          <input type="date" value={periodo.desde} onChange={(e) => setPeriodo((p) => ({ ...p, desde: e.target.value }))} />
        </Campo>
        <Campo etiqueta="Hasta">
          <input type="date" value={periodo.hasta} onChange={(e) => setPeriodo((p) => ({ ...p, hasta: e.target.value }))} />
        </Campo>
      </div>
      {!valido && <Aviso tipo="alerta">Elige un periodo: la fecha «Desde» va antes que «Hasta».</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}
      {reporte.error && <Aviso tipo="error">{reporte.error}</Aviso>}

      {valido && reporte.cargando && !r && <Cargando />}
      {r && (
        <>
          <p className="reportes__titulo-impreso">
            <strong>Dulzura Pastelería</strong> · Reporte del {fechaCorta(r.desde)} al {fechaCorta(r.hasta)}
          </p>
          <div className="grilla-tarjetas">
            <Tarjeta titulo="Ventas" valor={bs(r.resumen.ventas)} detalle={`${r.resumen.pedidos} pedido(s) cobrados`} />
            <Tarjeta titulo="Costo de producción" valor={bs(r.resumen.costoProduccion)} detalle="Insumos de las recetas" />
            <Tarjeta titulo="Ganancia bruta" valor={bs(r.resumen.gananciaBruta)} tono="positivo" />
            <Tarjeta
              titulo="Gastos operativos"
              valor={bs(r.resumen.gastosOperativos)}
              detalle="Sin la compra de insumos"
            />
            <Tarjeta
              titulo="Utilidad"
              valor={bs(r.resumen.utilidad)}
              tono={Number(r.resumen.utilidad) < 0 ? "negativo" : "positivo"}
              detalle="Ganancia bruta − gastos operativos"
            />
          </div>
          <p className="secundario reportes__nota">
            La compra de insumos del periodo ({bs(r.resumen.compraInsumos)}) entra al stock y no se resta otra vez: su costo
            ya está en el costo de producción de lo vendido.
            {r.resumen.anuladas > 0 &&
              ` No cuentan ${r.resumen.anuladas} venta(s) anulada(s) por ${bs(r.resumen.totalAnulado)}.`}
          </p>

          <Panel titulo="Ganancia por producto">
            {r.porProducto.length === 0 ? (
              <p className="vacio">No hubo ventas en este periodo.</p>
            ) : (
              <div className="tabla-envoltura">
                <table>
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th className="num">Cantidad</th>
                      <th className="num">Ventas</th>
                      <th className="num">Costo</th>
                      <th className="num">Ganancia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.porProducto.map((p) => (
                      <tr key={p.producto}>
                        <td>{p.producto}</td>
                        <td className="num">{cantidad(p.cantidad)}</td>
                        <td className="num">{bs(p.total)}</td>
                        <td className="num secundario">{bs(p.costo)}</td>
                        <td className={`num ${Number(p.ganancia) < 0 ? "negativo" : "positivo"}`}>{bs(p.ganancia)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>Total</th>
                      <th />
                      <th className="num">{bs(r.resumen.ventas)}</th>
                      <th className="num">{bs(r.resumen.costoProduccion)}</th>
                      <th className="num">{bs(r.resumen.gananciaBruta)}</th>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Panel>

          <div className="reportes__columnas">
            <Panel titulo="Ventas por día">
              {r.porDia.length === 0 ? (
                <p className="vacio">Sin ventas.</p>
              ) : (
                <div className="tabla-envoltura">
                  <table>
                    <thead>
                      <tr>
                        <th>Día</th>
                        <th className="num">Ventas</th>
                        <th className="num">Ganancia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.porDia.map((d) => (
                        <tr key={d.dia}>
                          <td>{fechaCorta(d.dia)}</td>
                          <td className="num">{bs(d.ventas)}</td>
                          <td className="num">{bs(d.ganancia)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel titulo="Gastos">
              {r.gastos.length === 0 ? (
                <p className="vacio">Sin gastos en este periodo.</p>
              ) : (
                <div className="tabla-envoltura">
                  <table>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Detalle</th>
                        <th className="num">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.gastos.map((g, i) => (
                        <tr key={i}>
                          <td>{fechaCorta(new Date(g.fecha).toLocaleDateString("sv-SE"))}</td>
                          <td>
                            {g.descripcion} <span className="secundario">· {g.categoria}</span>
                          </td>
                          <td className="num">{bs(g.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      {r.gastosPorCategoria.map((c) => (
                        <tr key={c.categoria}>
                          <th colSpan={2}>{c.categoria}</th>
                          <th className="num">{bs(c.monto)}</th>
                        </tr>
                      ))}
                    </tfoot>
                  </table>
                </div>
              )}
            </Panel>
          </div>
          <p className="secundario reportes__nota no-imprimir">
            El Excel trae además cada venta una por una (fecha, cliente, producto, precio, costo y ganancia).
          </p>
        </>
      )}
    </div>
  );
}
