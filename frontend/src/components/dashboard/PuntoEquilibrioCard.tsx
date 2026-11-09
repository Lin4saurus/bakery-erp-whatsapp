import { MdOutlineFlag } from "react-icons/md";
import { bs, cantidad } from "../../formato";
import type { PuntoDeEquilibrio } from "./indicadores";
import "./Indicadores.css";

const textoNivel = {
  lejos: "Todavía lejos de cubrir los gastos fijos",
  cerca: "Cerca: falta poco para cubrir los gastos fijos",
  superado: "Gastos fijos cubiertos: desde aquí todo es ganancia",
} as const;

// Cuántos productos hay que vender en el mes para no perder plata, y cuánto se lleva.
export function PuntoEquilibrioCard({ equilibrio, mes }: { equilibrio: PuntoDeEquilibrio; mes: string }) {
  const { meta, vendidos, avance, nivel } = equilibrio;
  return (
    <section className="inicio-card">
      <header className="inicio-card__cabecera">
        <span className="inicio-card__titulo">Punto de equilibrio · {mes}</span>
        <span className="inicio-card__icono" aria-hidden>
          <MdOutlineFlag />
        </span>
      </header>

      {meta === null ? (
        <p className="indicador__aviso">
          Con los precios actuales cada venta deja {bs(equilibrio.margenPromedio)} en promedio: no alcanza para cubrir
          gastos fijos. Revisa los precios en Recetas y precios.
        </p>
      ) : (
        <>
          <div className="inicio-card__valor">
            {cantidad(vendidos)} <span className="indicador__de">de {cantidad(meta)}</span>
          </div>
          <div className="inicio-card__subtitulo">
            Meta mensual: {cantidad(meta)} productos. Llevas {cantidad(vendidos)} vendidos ({Math.round(avance * 100)} %).
          </div>
          <div
            className="indicador__barra"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={meta}
            aria-valuenow={vendidos}
            aria-label="Avance hacia el punto de equilibrio"
          >
            <div className={`indicador__relleno indicador__relleno--${nivel}`} style={{ width: `${Math.min(avance, 1) * 100}%` }} />
          </div>
          <p className={`indicador__estado indicador__estado--${nivel}`}>{textoNivel[nivel]}</p>
        </>
      )}

      <dl className="inicio-card__lista">
        <div>
          <dt>Gastos fijos del mes</dt>
          <dd>{bs(equilibrio.gastosFijos)}</dd>
        </div>
        <div>
          <dt>Deja cada venta (promedio, {equilibrio.origenMargen})</dt>
          <dd>{bs(equilibrio.margenPromedio)}</dd>
        </div>
      </dl>
    </section>
  );
}
