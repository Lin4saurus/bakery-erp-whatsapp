import { useState } from "react";
import { MdOutlineFileDownload, MdOutlineUploadFile } from "react-icons/md";
import { api, mensajeDeError, ApiError, type VentaAnterior, type VentaAnteriorRevisada } from "../api";
import { bs, esNumeroValido, hoyISO, normalizarNumero } from "../formato";
import { Aviso, Button, Campo, Opciones, Ventana, useDatos } from "../ui";
import "./VentasAnteriores.css";

// Ventas de antes del ERP (D121): la dueña agrega lo que vendió antes de usar el ERP, una por una o con la plantilla
// de Excel. Salen en el Historial, Desempeño y las descargas; no tocan el stock ni la Caja.

interface Fila {
  fecha: string;
  producto: string;
  cantidad: string;
  total: string;
  cliente: string;
}

const filaVacia = (fecha = ""): Fila => ({ fecha, producto: "", cantidad: "1", total: "", cliente: "" });
const sinTildes = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/·/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export function VentasAnteriores({ cerrar, listo }: { cerrar: () => void; listo: (anio: number, mensaje: string) => Promise<void> }) {
  const [modo, setModo] = useState<"UNA" | "EXCEL">("UNA");
  return (
    <Ventana
      titulo="Agregar ventas anteriores"
      subtitulo="Lo que vendiste antes de usar el ERP. Sale en el Historial y en Desempeño; no cambia el stock ni la Caja."
      cerrar={cerrar}
      ancha
    >
      <div className="anteriores">
        <Opciones
          etiqueta="¿Cómo las quieres agregar?"
          valor={modo}
          alCambiar={setModo}
          opciones={[
            { valor: "UNA", texto: "Una por una" },
            { valor: "EXCEL", texto: "Desde Excel" },
          ]}
        />
        {modo === "UNA" ? <UnaPorUna listo={listo} /> : <DesdeExcel listo={listo} />}
      </div>
    </Ventana>
  );
}

// ---------- Una por una ----------

function UnaPorUna({ listo }: { listo: (anio: number, mensaje: string) => Promise<void> }) {
  const productos = useDatos(() => api.productos({ tipo: "VENTA" }));
  const clientes = useDatos(() => api.clientes());
  const [filas, setFilas] = useState<Fila[]>([filaVacia()]);
  const [error, setError] = useState<string | null>(null);
  const [malas, setMalas] = useState<Map<number, string>>(new Map());
  const [guardando, setGuardando] = useState(false);
  const hoy = hoyISO();

  const porNombre = new Map((productos.datos ?? []).map((p) => [sinTildes(p.nombre), p]));
  const productoDe = (f: Fila) => porNombre.get(sinTildes(f.producto)) ?? null;
  // Sin total escrito, se propone el precio de hoy × cantidad.
  const sugerido = (f: Fila) => {
    const p = productoDe(f);
    const n = Number(normalizarNumero(f.cantidad));
    return p?.precioVenta && n > 0 ? Number(p.precioVenta) * n : null;
  };
  const totalDe = (f: Fila) => (f.total.trim() ? Number(normalizarNumero(f.total)) : sugerido(f));

  const cambiar = (i: number, cambios: Partial<Fila>) => {
    setFilas((actuales) => actuales.map((f, j) => (j === i ? { ...f, ...cambios } : f)));
    setMalas(new Map());
  };
  const usadas = filas.filter((f) => f.producto.trim() || f.total.trim());
  const listas =
    usadas.length > 0 &&
    usadas.every(
      (f) =>
        /^\d{4}-\d{2}-\d{2}$/.test(f.fecha) &&
        f.fecha <= hoy &&
        esNumeroValido(f.cantidad) &&
        Number(normalizarNumero(f.cantidad)) > 0 &&
        (f.total.trim() ? esNumeroValido(f.total) : sugerido(f) !== null),
    );

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    setMalas(new Map());
    const ventas: VentaAnterior[] = usadas.map((f) => ({
      fecha: f.fecha,
      producto: f.producto.trim(),
      cantidad: Number(normalizarNumero(f.cantidad)),
      total: totalDe(f) ?? 0,
      cliente: f.cliente.trim() || null,
    }));
    try {
      const r = await api.anotarVentasAnteriores(ventas);
      const anio = Math.max(...ventas.map((v) => Number(v.fecha.slice(0, 4))));
      await listo(
        anio,
        `Se agregaron ${r.guardadas} venta(s) anterior(es).` +
          (r.sinReceta ? ` ${r.sinReceta} no está(n) en Recetas y precios: se guardaron sin ganancia.` : ""),
      );
    } catch (e) {
      setError(mensajeDeError(e));
      if (e instanceof ApiError) {
        // «fila 2» → la fila 2 de las que se mandaron.
        const marcas = new Map<number, string>();
        for (const d of e.detalles) {
          const n = Number(/fila (\d+)/.exec(d.campo)?.[1]);
          if (n) marcas.set(filas.indexOf(usadas[n - 1] as Fila), d.mensaje);
        }
        setMalas(marcas);
      }
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <p className="secundario anteriores__ayuda">
        Escribe el producto como está en Recetas y precios (aparece en la lista al escribir) y la ganancia se calcula con su receta. Si
        ya no lo vendes, escríbelo igual: se guarda sin ganancia.
      </p>
      <datalist id="anteriores-productos">
        {(productos.datos ?? []).map((p) => (
          <option key={p.id} value={p.nombre} />
        ))}
      </datalist>
      <datalist id="anteriores-clientes">
        {(clientes.datos ?? []).map((c) => (
          <option key={c.id} value={c.nombre} />
        ))}
      </datalist>
      <div className="tabla-envoltura">
        <table className="anteriores__tabla">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Producto</th>
              <th className="num">Cantidad</th>
              <th className="num">Total (Bs)</th>
              <th>Cliente (opcional)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => {
              const p = productoDe(f);
              const s = sugerido(f);
              return (
                <tr key={i} className={malas.has(i) ? "anteriores__mala" : undefined}>
                  <td>
                    <input type="date" value={f.fecha} max={hoy} aria-label={`Fecha de la fila ${i + 1}`} onChange={(e) => cambiar(i, { fecha: e.target.value })} />
                  </td>
                  <td>
                    <input
                      list="anteriores-productos"
                      value={f.producto}
                      placeholder="Ej.: Torta de limón · 8 personas"
                      aria-label={`Producto de la fila ${i + 1}`}
                      onChange={(e) => cambiar(i, { producto: e.target.value })}
                    />
                    <div className="anteriores__detalle">
                      {malas.get(i) ? (
                        <span className="negativo">{malas.get(i)}</span>
                      ) : f.producto.trim() === "" ? null : p ? (
                        <span className="positivo">En el catálogo</span>
                      ) : (
                        <span className="secundario">No está en el catálogo: sin ganancia</span>
                      )}
                    </div>
                  </td>
                  <td className="num">
                    <input
                      inputMode="numeric"
                      className="anteriores__numero"
                      value={f.cantidad}
                      aria-label={`Cantidad de la fila ${i + 1}`}
                      onChange={(e) => cambiar(i, { cantidad: e.target.value })}
                    />
                  </td>
                  <td className="num">
                    <input
                      inputMode="decimal"
                      className="anteriores__numero"
                      value={f.total}
                      placeholder={s !== null ? String(s) : ""}
                      title={s !== null ? `Si lo dejas vacío: ${bs(s)} (precio de hoy)` : undefined}
                      aria-label={`Total de la fila ${i + 1}`}
                      onChange={(e) => cambiar(i, { total: e.target.value })}
                    />
                  </td>
                  <td>
                    <input list="anteriores-clientes" value={f.cliente} aria-label={`Cliente de la fila ${i + 1}`} onChange={(e) => cambiar(i, { cliente: e.target.value })} />
                  </td>
                  <td>
                    {filas.length > 1 && (
                      <button className="caja-linea__quitar" aria-label={`Quitar la fila ${i + 1}`} onClick={() => setFilas((a) => a.filter((_, j) => j !== i))}>
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="anteriores__pie">
        {/* La fila nueva repite la fecha de la última: en un mismo día suele haber varias ventas. */}
        <Button onClick={() => setFilas((a) => [...a, filaVacia(a.at(-1)?.fecha ?? "")])}>+ Otra venta</Button>
        <span className="secundario">
          {usadas.length} venta(s) · {bs(usadas.reduce((t, f) => t + (totalDe(f) ?? 0), 0))}
        </span>
        <Button variante="primario" disabled={!listas || guardando} onClick={() => void guardar()}>
          {guardando ? "Guardando…" : `Guardar ${usadas.length || ""} venta(s)`}
        </Button>
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
    </>
  );
}

// ---------- Desde Excel ----------

const leerBase64 = (archivo: File) =>
  new Promise<string>((resolver, fallar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(String(lector.result).split(",")[1] ?? "");
    lector.onerror = () => fallar(new Error("No se pudo leer el archivo."));
    lector.readAsDataURL(archivo);
  });

function DesdeExcel({ listo }: { listo: (anio: number, mensaje: string) => Promise<void> }) {
  const [archivo, setArchivo] = useState<{ nombre: string; base64: string } | null>(null);
  const [filas, setFilas] = useState<VentaAnteriorRevisada[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<"plantilla" | "revisando" | "importando" | null>(null);

  const bajarPlantilla = async () => {
    setTrabajando("plantilla");
    setError(null);
    try {
      const respuesta = await fetch("/api/historico/plantilla");
      if (!respuesta.ok) throw new Error("No se pudo bajar la plantilla.");
      const url = URL.createObjectURL(await respuesta.blob());
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = "plantilla_ventas_anteriores.xlsx";
      enlace.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setTrabajando(null);
    }
  };

  const elegir = async (elegido: File | undefined) => {
    setFilas(null);
    setError(null);
    if (!elegido) return;
    setTrabajando("revisando");
    try {
      const base64 = await leerBase64(elegido);
      setArchivo({ nombre: elegido.name, base64 });
      setFilas((await api.revisarExcelAnterior(elegido.name, base64)).filas);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setTrabajando(null);
    }
  };

  const buenas = filas?.filter((f) => !f.error) ?? [];
  const conError = filas?.filter((f) => f.error) ?? [];
  const sinReceta = buenas.filter((f) => f.productoId === null).length;

  const importar = async () => {
    if (!archivo) return;
    setTrabajando("importando");
    setError(null);
    try {
      const r = await api.importarExcelAnterior(archivo.nombre, archivo.base64);
      const anio = Math.max(...buenas.map((f) => Number(f.fecha.slice(0, 4))));
      await listo(
        anio,
        `Se importaron ${r.guardadas} venta(s) anterior(es) de «${archivo.nombre}».` +
          (r.saltadas ? ` Se saltaron ${r.saltadas} fila(s) con error.` : "") +
          (r.sinReceta ? ` ${r.sinReceta} no está(n) en Recetas y precios: se guardaron sin ganancia.` : ""),
      );
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setTrabajando(null);
    }
  };

  return (
    <>
      <ol className="anteriores__pasos">
        <li>
          Baja la plantilla y llénala: una fila por venta con <strong>Fecha, Producto, Tamaño, Cantidad, Total (Bs)</strong> y, si quieres,
          el Cliente. La hoja «Productos» trae tu catálogo para copiar los nombres.{" "}
          <Button tamano="chico" onClick={() => void bajarPlantilla()} disabled={trabajando !== null}>
            <MdOutlineFileDownload aria-hidden /> {trabajando === "plantilla" ? "Preparando…" : "Bajar plantilla"}
          </Button>
        </li>
        <li>
          Súbela aquí. Primero se revisa: nada se guarda hasta que toques «Importar».{" "}
          <label className="boton boton-chico anteriores__subir">
            <MdOutlineUploadFile aria-hidden /> {trabajando === "revisando" ? "Revisando…" : archivo ? "Elegir otro archivo" : "Elegir el Excel"}
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                void elegir(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </li>
      </ol>

      {error && <Aviso tipo="error">{error}</Aviso>}

      {filas && (
        <>
          <p className="anteriores__resumen">
            <strong>{archivo?.nombre}</strong>: {buenas.length} venta(s) listas por {bs(buenas.reduce((t, f) => t + f.total, 0))}
            {conError.length > 0 && <span className="negativo"> · {conError.length} fila(s) con error (no se importan)</span>}
            {sinReceta > 0 && <span className="secundario"> · {sinReceta} sin receta (sin ganancia)</span>}
          </p>
          <div className="tabla-envoltura anteriores__vista">
            <table>
              <thead>
                <tr>
                  <th>Fila</th>
                  <th>Fecha</th>
                  <th>Producto</th>
                  <th className="num">Cantidad</th>
                  <th className="num">Total</th>
                  <th>Cliente</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.numero} className={f.error ? "anteriores__mala" : undefined}>
                    <td className="secundario">{f.numero}</td>
                    <td>{f.fecha}</td>
                    <td>{f.productoNombre}</td>
                    <td className="num">{Number.isFinite(f.cantidad) ? f.cantidad : "—"}</td>
                    <td className="num">{Number.isFinite(f.total) ? bs(f.total) : "—"}</td>
                    <td>{f.cliente ?? <span className="secundario">—</span>}</td>
                    <td>
                      {f.error ? (
                        <span className="negativo">{f.error}</span>
                      ) : f.productoId ? (
                        <span className="positivo">Lista</span>
                      ) : (
                        <span className="secundario">Lista, sin receta</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="anteriores__pie">
            <span />
            <Button variante="primario" disabled={buenas.length === 0 || trabajando !== null} onClick={() => void importar()}>
              {trabajando === "importando" ? "Importando…" : `Importar ${buenas.length} venta(s)`}
            </Button>
          </div>
        </>
      )}
    </>
  );
}
