import { MdOutlineStorefront, MdOutlineWarningAmber } from "react-icons/md";
import type { ReporteCliente } from "../../api";
import { bs } from "../../formato";
import "./Indicadores.css";

const MAX_CLIENTES = 5;
export const DIAS_SIN_COMPRAR = 5; // un mayorista que compra cada 3–4 días ya se atrasó

const diasDesde = (fechaISO: string): number => Math.floor((Date.now() - new Date(fechaISO).getTime()) / 86_400_000);

// Mayoristas activos que más compraron en el mes, con su último pedido (de siempre).
export function TopClientesCard({ reporte, mes }: { reporte: ReporteCliente[]; mes: string }) {
  const mayoristas = reporte
    .filter((c) => c.tipo === "MAYORISTA" && c.activo)
    .sort((a, b) => Number(b.totalVendido) - Number(a.totalVendido) || a.nombre.localeCompare(b.nombre))
    .slice(0, MAX_CLIENTES);

  return (
    <section className="inicio-card">
      <header className="inicio-card__cabecera">
        <span className="inicio-card__titulo">Top clientes mayoristas · {mes}</span>
        <span className="inicio-card__icono" aria-hidden>
          <MdOutlineStorefront />
        </span>
      </header>
      {mayoristas.length === 0 ? (
        <p className="secundario">
          Todavía no hay clientes mayoristas. Agrégalos en <a href="#clientes">Clientes</a>.
        </p>
      ) : (
        <ul className="indicador__clientes">
          {mayoristas.map((c) => {
            const dias = c.ultimoPedido ? diasDesde(c.ultimoPedido) : null;
            const atrasado = dias === null || dias >= DIAS_SIN_COMPRAR;
            return (
              <li key={c.id}>
                <span className="indicador__cliente-nombre">{c.nombre}</span>
                <span className="indicador__cliente-total">
                  {Number(c.totalVendido) > 0 ? bs(c.totalVendido) : <span className="secundario">Sin compras este mes</span>}
                </span>
                <span
                  className={`indicador__cliente-ultimo ${atrasado ? "indicador__cliente-ultimo--atrasado" : ""}`}
                  title={atrasado ? `No compra hace ${DIAS_SIN_COMPRAR} días o más` : undefined}
                >
                  {atrasado && <MdOutlineWarningAmber aria-label="Atrasado" />}
                  {c.ultimoPedido
                    ? `Último: ${new Date(c.ultimoPedido).toLocaleDateString("es-BO", { day: "numeric", month: "short" })} (hace ${dias} d)`
                    : "Nunca compró"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <a className="inicio-card__enlace" href="#clientes">
        Ver clientes
      </a>
    </section>
  );
}
