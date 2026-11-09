import type { ReactNode } from "react";
import { MdOutlineCheckCircle, MdOutlineErrorOutline, MdOutlineWarningAmber } from "react-icons/md";
import "./Alert.css";

const iconos = {
  error: MdOutlineErrorOutline,
  ok: MdOutlineCheckCircle,
  alerta: MdOutlineWarningAmber,
};

export function Aviso({ tipo, children }: { tipo: "error" | "ok" | "alerta"; children: ReactNode }) {
  const Icono = iconos[tipo];
  return (
    <div className={`aviso aviso-${tipo}`} role={tipo === "error" ? "alert" : "status"}>
      <Icono className="aviso-icono" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
