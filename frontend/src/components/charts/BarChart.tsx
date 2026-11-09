import "./BarChart.css";

export interface Barra {
  etiqueta: string;
  valor: number;
  destacada?: boolean;
}

// Barras en HTML/CSS: se adaptan al ancho de la tarjeta sin achicar el texto.
export function BarChart({ datos, alto = 120, descripcion }: { datos: Barra[]; alto?: number; descripcion: string }) {
  const maximo = Math.max(1, ...datos.map((d) => d.valor));
  return (
    <div className="bar-chart" role="img" aria-label={descripcion}>
      <div className="bar-chart__area" style={{ height: alto }}>
        {datos.map((d, i) => (
          <div key={d.etiqueta + i} className="bar-chart__columna">
            {d.valor > 0 && (
              <span className="bar-chart__valor">{d.valor.toLocaleString("es-BO", { maximumFractionDigits: 1 })}</span>
            )}
            <div
              className={`bar-chart__barra ${d.destacada ? "bar-chart__barra--destacada" : ""}`}
              style={{ height: d.valor > 0 ? `max(3px, ${(d.valor / maximo) * 100}%)` : 0 }}
            />
          </div>
        ))}
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
