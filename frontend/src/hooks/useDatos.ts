import { useCallback, useEffect, useState } from "react";
import { mensajeDeError } from "../api";

interface EstadoDatos<T> {
  datos: T | undefined;
  error: string | null;
  cargando: boolean;
}

// Carga datos de la API y expone `recargar` para refrescar después de guardar.
export function useDatos<T>(cargar: () => Promise<T>, deps: readonly unknown[] = []) {
  const [estado, setEstado] = useState<EstadoDatos<T>>({ datos: undefined, error: null, cargando: true });

  const recargar = useCallback(async () => {
    setEstado((previo) => ({ ...previo, cargando: true }));
    try {
      const datos = await cargar();
      setEstado({ datos, error: null, cargando: false });
    } catch (error) {
      setEstado((previo) => ({ ...previo, error: mensajeDeError(error), cargando: false }));
    }
  }, deps);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return { ...estado, recargar };
}
