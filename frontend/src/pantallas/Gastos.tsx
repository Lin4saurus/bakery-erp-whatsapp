import { useState, type FormEvent } from "react";
import { api, mensajeDeError, type CategoriaGasto } from "../api";
import { bs, esNumeroValido, fechaCorta, hoyISO, inicioDeMesISO, nombreCategoriaGasto, normalizarNumero } from "../formato";
import { Aviso, Button, Campo, Cargando, Panel, Tarjeta, useDatos } from "../ui";
import "./Gastos.css";

const categorias = Object.keys(nombreCategoriaGasto) as CategoriaGasto[];

// Compras que no son insumos de receta (limpieza, moldes, toppers…). Se restan de la ganancia
// bruta para la utilidad neta. Luz, gas y agua no se cargan: se comparten con la familia.
export function Gastos() {
  const desde = inicioDeMesISO();
  const hasta = hoyISO();
  const lista = useDatos(() => api.gastos(desde, hasta), [desde, hasta]);

  const [descripcion, setDescripcion] = useState("");
  const [monto, setMonto] = useState("");
  const [categoria, setCategoria] = useState<CategoriaGasto>("LIMPIEZA");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const valido = descripcion.trim() !== "" && esNumeroValido(monto) && Number(normalizarNumero(monto)) > 0;
  const mes = new Date().toLocaleDateString("es-BO", { month: "long", year: "numeric" });

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (!valido) return;
    setGuardando(true);
    setError(null);
    setMensaje(null);
    try {
      const gasto = await api.crearGasto({ descripcion: descripcion.trim(), monto: normalizarNumero(monto), categoria });
      await lista.recargar();
      setMensaje(`Gasto guardado: ${gasto.descripcion} (${bs(gasto.monto)}).`);
      setDescripcion("");
      setMonto("");
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (id: string) => {
    setError(null);
    setMensaje(null);
    try {
      await api.borrarGasto(id);
      await lista.recargar();
      setMensaje("Gasto borrado.");
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setConfirmando(null);
    }
  };

  return (
    <>
      <div className="cabecera-pantalla">
        <div>
          <h1>Gastos</h1>
          <p>Compras que no son insumos de receta: limpieza, moldes, toppers… Se restan de la ganancia para la utilidad neta.</p>
        </div>
      </div>

      {mensaje && <Aviso tipo="ok">{mensaje}</Aviso>}
      {(error ?? lista.error) && <Aviso tipo="error">{error ?? lista.error}</Aviso>}

      <Panel titulo="Nuevo gasto">
        <form className="gastos__formulario" onSubmit={(e) => void guardar(e)}>
          <Campo etiqueta="Descripción">
            <input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej. Esponja y lavavajillas"
              maxLength={120}
            />
          </Campo>
          <Campo etiqueta="Monto (Bs)">
            <input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0,00" />
          </Campo>
          <Campo etiqueta="Categoría">
            <select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaGasto)}>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {nombreCategoriaGasto[c]}
                </option>
              ))}
            </select>
          </Campo>
          <Button type="submit" variante="primario" disabled={!valido || guardando} className="gastos__guardar">
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </form>
        {categoria === "LIMPIEZA" && (
          // D31: el insumo «Limpieza y otros» sigue en las recetas.
          <p className="secundario gastos__nota">
            Las recetas ya incluyen un costo de limpieza por tanda («Limpieza y otros», 0,50 Bs). Lo que cargues aquí se resta
            además de ese costo.
          </p>
        )}
        {categoria === "USO_PERSONAL" && (
          // D47: es plata del negocio que se usó para ti; se resta igual que cualquier gasto.
          <p className="secundario gastos__nota">
            Lo que gastaste en ti con plata del negocio. Se resta de la utilidad neta igual que los demás gastos y queda separado
            para que sepas cuánto fue.
          </p>
        )}
      </Panel>

      {lista.datos && (
        <div className="grilla-tarjetas">
          <Tarjeta titulo={`Total de ${mes}`} valor={bs(lista.datos.total)} detalle={`${lista.datos.gastos.length} gasto(s)`} />
          {categorias.map((c) => (
            <Tarjeta key={c} titulo={nombreCategoriaGasto[c]} valor={bs(lista.datos?.porCategoria[c] ?? 0)} />
          ))}
        </div>
      )}

      <Panel titulo={`Gastos de ${mes}`}>
        {lista.cargando && !lista.datos ? (
          <Cargando />
        ) : lista.datos?.gastos.length === 0 ? (
          <p className="vacio">Todavía no hay gastos este mes.</p>
        ) : (
          <div className="tabla-envoltura">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Descripción</th>
                  <th>Categoría</th>
                  <th className="num">Monto</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lista.datos?.gastos.map((g) => (
                  <tr key={g.id}>
                    <td className="secundario">{fechaCorta(g.fecha)}</td>
                    <td>{g.descripcion}</td>
                    <td>
                      <span className="etiqueta">{nombreCategoriaGasto[g.categoria]}</span>
                    </td>
                    <td className="num">{bs(g.monto)}</td>
                    <td className="num gastos__acciones">
                      {confirmando === g.id ? (
                        <>
                          <Button tamano="chico" variante="peligro" onClick={() => void borrar(g.id)}>
                            Sí, borrar
                          </Button>
                          <Button tamano="chico" variante="texto" onClick={() => setConfirmando(null)}>
                            No
                          </Button>
                        </>
                      ) : (
                        <Button tamano="chico" variante="texto" onClick={() => setConfirmando(g.id)}>
                          Borrar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
