import type { ButtonHTMLAttributes } from "react";
import "./Button.css";

type Variante = "primario" | "secundario" | "exito" | "peligro" | "texto";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamano?: "chico" | "normal" | "grande";
}

const clasesVariante: Record<Variante, string> = {
  primario: "boton boton-primario",
  secundario: "boton",
  exito: "boton boton-exito",
  peligro: "boton boton-peligro",
  texto: "boton boton-texto",
};

export function Button({ variante = "secundario", tamano = "normal", className, type = "button", ...props }: Props) {
  const clases = [clasesVariante[variante], tamano === "normal" ? "" : `boton-${tamano}`, className ?? ""]
    .filter(Boolean)
    .join(" ");
  return <button type={type} className={clases} {...props} />;
}
