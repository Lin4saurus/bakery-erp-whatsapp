import { useCallback, useEffect, useRef, useState } from "react";
import { mensajeDeError } from "../api";

interface EstadoDatos<T> {
  datos: T | undefined;
  error: string | null;
  cargando: boolean;
}

// Carga datos de la API y expone `recargar` para refrescar después de guardar.
// Cada carga lleva un turno (R4, AUDITORIA.md): con los avisos en vivo pueden salir dos recargas seguidas, y si la más
// vieja contesta última ya no pisa a la nueva. Al cerrar la pantalla, ninguna respuesta pendiente toca el estado.
export function useDatos<T>(cargar: () => Promise<T>, deps: readonly unknown[] = []) {
  const [estado, setEstado] = useState<EstadoDatos<T>>({ datos: undefined, error: null, cargando: true });
  const turno = useRef(0);

  const recargar = useCallback(async () => {
    const mio = ++turno.current;
    setEstado((previo) => ({ ...previo, cargando: true }));
    try {
      const datos = await cargar();
      if (mio === turno.current) setEstado({ datos, error: null, cargando: false });
    } catch (error) {
      if (mio === turno.current) setEstado((previo) => ({ ...previo, error: mensajeDeError(error), cargando: false }));
    }
  }, deps);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  useEffect(
    () => () => {
      turno.current++; // pantalla cerrada: se descarta lo que llegue después
    },
    [],
  );

  return { ...estado, recargar };
}
