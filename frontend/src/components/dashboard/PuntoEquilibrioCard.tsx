import { useState } from "react";
import { MdOutlineEdit, MdOutlineFlag } from "react-icons/md";
import { mensajeDeError } from "../../api";
import { bs, cantidad, esNumeroValido, normalizarNumero } from "../../formato";
import type { PuntoDeEquilibrio } from "./indicadores";
import "./Indicadores.css";

const textoNivel = {
  lejos: "Todavía lejos de cubrir los gastos fijos",
  cerca: "Cerca: falta poco para cubrir los gastos fijos",
  superado: "Gastos fijos cubiertos: desde aquí todo es ganancia",
} as const;

// Cuántos productos hay que vender en el mes para no perder plata, y cuánto se lleva.
// Los gastos fijos los cambia la dueña aquí mismo (D103): alquiler, sueldo, internet… lo que paga cada mes.
export function PuntoEquilibrioCard({
  equilibrio,
  mes,
  guardarGastosFijos,
}: {
  equilibrio: PuntoDeEquilibrio;
  mes: string;
  guardarGastosFijos: (valor: string) => Promise<void>;
}) {
  const { meta, vendidos, avance, nivel } = equilibrio;
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valido = esNumeroValido(texto.trim()) && Number(normalizarNumero(texto.trim())) >= 0;
  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      await guardarGastosFijos(normalizarNumero(texto.trim()));
      setEditando(false);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  };
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
          Con los precios actuales cada venta deja {bs(equilibrio.margenPromedio)} en promedio: no alcanza para cubrir gastos
          fijos. Revisa los precios en Recetas y precios.
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
            <div
              className={`indicador__relleno indicador__relleno--${nivel}`}
              style={{ width: `${Math.min(avance, 1) * 100}%` }}
            />
          </div>
          <p className={`indicador__estado indicador__estado--${nivel}`}>{textoNivel[nivel]}</p>
        </>
      )}

      <dl className="inicio-card__lista">
        <div>
          <dt>Gastos fijos del mes</dt>
          <dd>
            {editando ? (
              <span className="indicador__editar">
                <input
                  aria-label="Gastos fijos del mes en Bs"
                  inputMode="decimal"
                  value={texto}
                  autoFocus
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && valido) void guardar();
                    if (e.key === "Escape") setEditando(false);
                  }}
                />
                <button
                  type="button"
                  className="boton boton-chico"
                  disabled={!valido || guardando}
                  onClick={() => void guardar()}
                >
                  Guardar
                </button>
                <button type="button" className="boton boton-chico" disabled={guardando} onClick={() => setEditando(false)}>
                  Cancelar
                </button>
              </span>
            ) : (
              <>
                {bs(equilibrio.gastosFijos)}{" "}
                <button
                  type="button"
                  className="indicador__lapiz"
                  title="Cambiar los gastos fijos del mes"
                  aria-label="Cambiar los gastos fijos del mes"
                  onClick={() => {
                    setTexto(String(equilibrio.gastosFijos));
                    setError(null);
                    setEditando(true);
                  }}
                >
                  <MdOutlineEdit aria-hidden />
                </button>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>Deja cada venta (promedio, {equilibrio.origenMargen})</dt>
          <dd>{bs(equilibrio.margenPromedio)}</dd>
        </div>
      </dl>
      {error && <p className="negativo indicador__error">{error}</p>}
    </section>
  );
}
