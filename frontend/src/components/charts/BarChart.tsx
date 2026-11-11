import "./BarChart.css";

export interface Barra {
  etiqueta: string;
  valor: number;
  destacada?: boolean;
}

// Barras en HTML/CSS: se adaptan al ancho de la tarjeta sin achicar el texto.
// Con `alElegir`, cada columna (la barra y el espacio encima) se puede tocar (D69).
export function BarChart({
  datos,
  alto = 120,
  descripcion,
  alElegir,
}: {
  datos: Barra[];
  alto?: number;
  descripcion: string;
  alElegir?: (indice: number) => void;
}) {
  const maximo = Math.max(1, ...datos.map((d) => d.valor));
  return (
    <div className="bar-chart" role={alElegir ? undefined : "img"} aria-label={alElegir ? undefined : descripcion}>
      <div className="bar-chart__area" style={{ height: alto }}>
        {datos.map((d, i) => {
          const contenido = (
            <>
              {d.valor > 0 && (
                <span className="bar-chart__valor">{d.valor.toLocaleString("es-BO", { maximumFractionDigits: 1 })}</span>
              )}
              <div
                className={`bar-chart__barra ${d.destacada ? "bar-chart__barra--destacada" : ""}`}
                style={{ height: d.valor > 0 ? `max(3px, ${(d.valor / maximo) * 100}%)` : 0 }}
              />
            </>
          );
          return alElegir ? (
            <button
              key={d.etiqueta + i}
              type="button"
              className="bar-chart__columna bar-chart__columna--tocable"
              onClick={() => alElegir(i)}
              aria-pressed={d.destacada ?? false}
              aria-label={`${d.etiqueta}: ${d.valor.toLocaleString("es-BO")}`}
            >
              {contenido}
            </button>
          ) : (
            <div key={d.etiqueta + i} className="bar-chart__columna">
              {contenido}
            </div>
          );
        })}
      </div>
      <div className="bar-chart__etiquetas">
        {datos.map((d, i) => (
          <span key={d.etiqueta + i} className={d.destacada ? "bar-chart__etiqueta--destacada" : undefined}>
            {d.etiqueta}
          </span>
        ))}
      </div>
    </div>
  );
}
