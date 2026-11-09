import { Fragment, useState } from "react";
import { api, mensajeDeError, type ListaVentas } from "../api";
import { bs, cantidad, hora } from "../formato";
import { Aviso, Button, Panel } from "../ui";

// Ventas del día en la Caja, con la opción de anular una venta por error (devuelve el stock).
export function VentasDeHoy({
  lista,
  alAnular,
}: {
  lista: ListaVentas | undefined;
  alAnular: (mensaje: string) => void;
}) {
  const [anulandoId, setAnulandoId] = useState<number | null>(null);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abrir = (id: number) => {
    setAnulandoId(anulandoId === id ? null : id);
    setMotivo("");
    setError(null);
  };

  const confirmar = async (id: number) => {
    setGuardando(true);
    setError(null);
    try {
      const { venta, devuelto } = await api.anular(id, motivo.trim());
      setAnulandoId(null);
      alAnular(
        `Venta anulada: ${cantidad(venta.cantidad)} × ${venta.producto} (${bs(venta.totalVenta)}). ` +
          `Se devolvieron ${devuelto.length} insumo(s) al stock.`,
      );
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Panel titulo={`Ventas de hoy · ${bs(lista?.resumen.totalVenta ?? 0)}`}>
      {lista?.ventas.length === 0 ? (
        <p className="vacio">Todavía no hay ventas hoy.</p>
      ) : (
        <div className="tabla-envoltura">
          <table>
            <tbody>
              {lista?.ventas.slice(0, 12).map((v) => (
                <Fragment key={v.id}>
                  <tr className={v.anulada ? "venta-anulada" : undefined}>
                    <td className="secundario hora">{hora(v.fecha)}</td>
                    <td>
                      <span className="venta-anulada__texto">
                        {cantidad(v.cantidad)} × {v.producto}
                      </span>{" "}
                      {v.anulada ? (
                        <span className="etiqueta etiqueta-neutra" title={v.motivoAnulacion ?? undefined}>
                          Anulada
                        </span>
                      ) : (
                        v.estadoPago === "PENDIENTE" && <span className="etiqueta etiqueta-alerta">Fiado</span>
                      )}
                    </td>
                    <td className="num">
                      <span className="venta-anulada__texto">{bs(v.totalVenta)}</span>
                    </td>
                    <td className="num">
                      {!v.anulada && (
                        <Button variante="texto" tamano="chico" onClick={() => abrir(v.id)}>
                          {anulandoId === v.id ? "Cerrar" : "Anular"}
                        </Button>
                      )}
                    </td>
                  </tr>
                  {anulandoId === v.id && (
                    <tr className="fila-formulario">
                      <td colSpan={4}>
                        {error && <Aviso tipo="error">{error}</Aviso>}
                        <div className="anular-venta">
                          <label className="campo anular-venta__campo">
                            <span className="campo-etiqueta">¿Por qué se anula?</span>
                            <input
                              value={motivo}
                              onChange={(e) => setMotivo(e.target.value)}
                              placeholder="Ej. se marcó el producto equivocado"
                              autoFocus
                            />
                          </label>
                          <Button
                            variante="peligro"
                            disabled={!motivo.trim() || guardando}
                            onClick={() => void confirmar(v.id)}
                          >
                            {guardando ? "Anulando…" : "Anular venta"}
                          </Button>
                        </div>
                        <p className="secundario anular-venta__nota">
                          El stock usado vuelve al inventario y la venta deja de contar en los totales.
                        </p>
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
  );
}
