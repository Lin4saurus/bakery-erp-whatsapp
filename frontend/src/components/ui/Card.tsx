import type { ReactNode } from "react";
import "./Card.css";

export function Panel({ titulo, acciones, children }: { titulo: ReactNode; acciones?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      <header className="panel-cabecera">
        <h3>{titulo}</h3>
        {acciones && <div className="panel-acciones">{acciones}</div>}
      </header>
      {children}
    </section>
  );
}
