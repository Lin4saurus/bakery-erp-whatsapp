import { Fragment, useMemo, useState, type FormEvent } from "react";
import { MdChevronLeft, MdChevronRight, MdDeleteOutline, MdOutlineEdit } from "react-icons/md";
import { api, mensajeDeError, type TipoCliente } from "../api";
import { BarChart, type Barra } from "../components/charts/BarChart";
import { bs, cantidad, esNumeroValido, fechaCorta, hora, hoyISO, nombreCorto, normalizarNumero } from "../formato";
import { Aviso, Button, Campo, Cargando, Panel, Tarjeta, TipoClienteBadge, useDatos } from "../ui";
import { tomarDia } from "../compraPendiente";
import "./Historial.css";

const TODOS = "";
const PRIMER_ANIO = 2020; // la repostería trabaja desde 2020 (las primeras ventas anotadas son de 2024)
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sá"];
const isoLocal = (fecha: Date): string => fecha.toLocaleDateString("sv-SE");

// Semanas (lunes a domingo) que tocan un mes: la 1 es la que tiene el día 1 (D82).
function semanasDelMes(anio: number, mes: number): Date[][] {
  const lunes = new Date(anio, mes, 1, 12);
  lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7)); // lunes anterior o igual al día 1
  const semanas: Date[][] = [];
  while (lunes.getFullYear() * 12 + lunes.getMonth() <= anio * 12 + mes) {
    semanas.push(
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(lunes);
        d.setDate(d.getDate() + i);
        return d;
      }),
    );
    lunes.setDate(lunes.getDate() + 7);
  }
  return semanas;
}

type FiltroTipo = "TODAS" | TipoCliente;

// Una venta, venga de la Caja o de los registros anteriores (Excel 2024, notas de venta 2026).
interface Fila {
  clave: string;
  id: number; // id de la venta (Caja) o del registro anterior
  clienteId: string | null;
  precioUnitario: number | null; // solo ventas de la Caja
  fecha: Date;
  fechaEstimada: boolean;
  producto: string;
  productoOriginal: string | null;
  cantidad: number;
  total: number;
  ganancia: number | null; // null = no se conoce el costo (notas de venta)
  cliente: string | null;
  tipo: TipoCliente | null; // null = sin cliente registrado (minorista)
  deCaja: boolean; // registrada en la Caja (con hora); las anteriores solo tienen el día
  anulada: boolean;
  pedidoId: string | null; // líneas de un mismo pedido de la Caja (D48): se muestran en una fila desplegable (D54)
  familia: string | null; // Queques, Brownies… (D55); null si el producto no está en el ERP
}

// Familias de un pedido, sin repetir y en orden alfabético: «Brownies, Queques».
const familiasDe = (filas: Fila[]) =>
  [...new Set(filas.map((f) => f.familia ?? "Otros"))].sort((a, b) => a.localeCompare(b, "es"));

// Un pedido cuenta una vez aunque lleve varios productos.
const contarPedidos = (filas: Fila[]) => new Set(filas.map((f) => f.pedidoId ?? f.clave)).size;

const esMayorista = (f: Fila) => f.tipo === "MAYORISTA";
const sumar = (filas: Fila[], valor: (f: Fila) => number) => filas.reduce((t, f) => t + valor(f), 0);

// Consulta (D67): «Desempeño» (tarjetas, ventas por mes y por producto) e «Historial de ventas» (la lista con
// filtros, editar y eliminar). Las dos usan los mismos datos: la Caja y lo anotado antes del sistema, por año.
type Vista = "desempeno" | "ventas";

export const Desempeno = () => <Historial vista="desempeno" />;

export function Historial({ vista = "ventas" }: { vista?: Vista }) {
  const caja = useDatos(() => api.ventas(`${PRIMER_ANIO}-01-01`, hoyISO()));
  const anteriores = useDatos(() => api.historico());

  const filas: Fila[] | null = useMemo(() => {
    if (!caja.datos || !anteriores.datos) return null;
    const deCaja: Fila[] = caja.datos.ventas.map((v) => ({
      clave: `c${v.id}`,
      id: v.id,
      clienteId: v.clienteId,
      precioUnitario: Number(v.precioUnitario),
      fecha: new Date(v.fecha),
      fechaEstimada: false,
      producto: v.producto,
      productoOriginal: null,
      cantidad: Number(v.cantidad),
      total: Number(v.totalVenta),
      ganancia: Number(v.gananciaBruta),
      cliente: v.cliente,
      tipo: v.clienteTipo,
      deCaja: true,
      anulada: v.anulada,
      pedidoId: v.pedidoId,
      familia: v.familia ?? null,
    }));
    const previas: Fila[] = anteriores.datos.ventas.map((v) => ({
      clave: `h${v.id}`,
      id: v.id,
      clienteId: v.clienteId,
      precioUnitario: null,
      fecha: new Date(v.fecha),
      fechaEstimada: v.fechaEstimada,
      producto: v.productoNombre,
      productoOriginal: v.productoOriginal !== v.productoNombre ? v.productoOriginal : null,
      cantidad: Number(v.cantidad),
      total: Number(v.valor),
      ganancia: v.utilidad === null ? null : Number(v.utilidad),
      cliente: v.cliente,
      tipo: v.clienteTipo,
      deCaja: false,
      anulada: false,
      pedidoId: v.pedidoId, // nota de varios sabores: una línea por sabor (D57)
      familia: v.familia,
    }));
    return [...deCaja, ...previas].sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  }, [caja.datos, anteriores.datos]);

  const anioActual = new Date().getFullYear();
  // Del más reciente al más viejo: el año que más se consulta queda arriba en la lista.
  const anios = Array.from({ length: anioActual - PRIMER_ANIO + 1 }, (_, i) => anioActual - i);
  const [anio, setAnio] = useState(anioActual);
  const error = caja.error ?? anteriores.error;

  return (
    <>
      <div className="cabecera-pantalla">
        <div>
          <h1>{vista === "desempeno" ? "Desempeño" : "Historial de ventas"}</h1>
          <p>
            {vista === "desempeno"
              ? "Cómo le fue a la pastelería cada año: lo vendido, la ganancia, los meses y los productos."
              : "Cada venta del año, con filtros. Junta lo vendido en la Caja con lo anotado antes del sistema."}
          </p>
        </div>
        {/* Dos clics: abrir la lista y elegir el año. */}
        <label className="historial__anio">
          <span className="secundario">Año</span>
          <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} aria-label="Año a consultar">
            {anios.map((a) => {
              const total = filas
                ? sumar(
                    filas.filter((f) => !f.anulada && f.fecha.getFullYear() === a),
                    (f) => f.total,
                  )
                : 0;
              return (
                <option key={a} value={a}>
                  {a} · {total > 0 ? bs(total) : "sin ventas"}
                </option>
              );
            })}
          </select>
        </label>
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {!filas ? (
        <Cargando />
      ) : (
        <ResumenAnio
          key={`${vista}-${anio}`}
          vista={vista}
          anio={anio}
          filas={filas.filter((f) => f.fecha.getFullYear() === anio)}
          todas={filas}
          alCambiar={async () => {
            await Promise.all([caja.recargar(), anteriores.recargar()]);
          }}
        />
      )}
    </>
  );
}

// ---------- Desempeño de un año ----------

function ResumenAnio({
  vista,
  anio,
  filas,
  todas,
  alCambiar,
}: {
  vista: Vista;
  anio: number;
  filas: Fila[];
  todas: Fila[]; // todos los años: la semana puede cruzar el año
  alCambiar: () => Promise<void>;
}) {
  const hoy = hoyISO();
  // Selección de Desempeño (D82): un mes (muestra sus ventas en la tabla) y, dentro, un día.
  // Al entrar quedan elegidos el mes y el día de hoy (D84), o el día tocado en el Inicio (D72) con su mes.
  const [desdeInicio] = useState(() => (vista === "desempeno" ? tomarDia() : null));
  // En años anteriores, la misma fecha de ese año (11 nov 2024); el 29 feb pasa al 28 si el año no es bisiesto.
  const [diaSel, setDiaSel] = useState<string | null>(() => {
    if (desdeInicio) return desdeInicio;
    const ahora = new Date();
    if (anio === ahora.getFullYear()) return hoy;
    const ultimoDelMes = new Date(anio, ahora.getMonth() + 1, 0).getDate();
    return isoLocal(new Date(anio, ahora.getMonth(), Math.min(ahora.getDate(), ultimoDelMes)));
  });
  const [mesSel, setMesSel] = useState<number | null>(() =>
    diaSel && diaSel.startsWith(String(anio)) ? new Date(`${diaSel}T12:00:00`).getMonth() : null,
  );
  const [semanaSel, setSemanaSel] = useState<number | null>(null); // null = la del día elegido (o la 1)
  const [editando, setEditando] = useState<string | null>(null);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set()); // pedidos desplegados
  const [borrando, setBorrando] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [mes, setMes] = useState(TODOS);
  const [tipo, setTipo] = useState<FiltroTipo>("TODAS");
  const [cliente, setCliente] = useState(TODOS);
  const [producto, setProducto] = useState(TODOS);

  const vigentes = filas.filter((f) => !f.anulada);
  if (filas.length === 0) {
    return <Aviso tipo="alerta">No hay ventas registradas en {anio}.</Aviso>;
  }

  // Las tarjetas son del año; «Por producto» sigue al día o mes que se toque en los gráficos (D68).
  const total = sumar(vigentes, (f) => f.total);
  const mayoristas = vigentes.filter(esMayorista);
  const minoristas = vigentes.filter((f) => !esMayorista(f));
  const conGanancia = vigentes.filter((f) => f.ganancia !== null);
  const ganancia = sumar(conGanancia, (f) => f.ganancia ?? 0);
  const sinCosto = contarPedidos(vigentes.filter((f) => f.ganancia === null)); // pedidos, no líneas de sabor (D57)

  const deTodas = todas.filter((f) => !f.anulada);
  const porMesTotal = MESES.map((_, i) =>
    sumar(
      vigentes.filter((f) => f.fecha.getMonth() === i),
      (f) => f.total,
    ),
  );
  const ultimoMesConVentas = porMesTotal.reduce((ultimo, v, i) => (v > 0 ? i : ultimo), 0);
  // La semana se mueve dentro del mes elegido; sin mes, el del día elegido, el actual o el último con ventas.
  const mesVista =
    mesSel ??
    (diaSel && diaSel.startsWith(String(anio))
      ? new Date(`${diaSel}T12:00:00`).getMonth()
      : anio === new Date().getFullYear()
        ? new Date().getMonth()
        : ultimoMesConVentas);
  const semanas = semanasDelMes(anio, mesVista);
  const semanaDelDia = diaSel ? semanas.findIndex((d) => d.some((f) => isoLocal(f) === diaSel)) : -1;
  const indiceSemana = Math.min(semanas.length - 1, semanaSel ?? (semanaDelDia >= 0 ? semanaDelDia : 0));
  const semana = (semanas[indiceSemana] ?? []).map((fecha) => {
    const dia = isoLocal(fecha);
    return {
      dia,
      fecha,
      delMes: fecha.getMonth() === mesVista,
      valor: sumar(
        deTodas.filter((f) => isoLocal(f.fecha) === dia),
        (f) => f.cantidad,
      ),
    };
  });
  const barrasSemana: Barra[] = semana.map((d) => ({
    etiqueta: `${DIAS[d.fecha.getDay()] ?? ""} ${d.fecha.getDate()}`,
    valor: d.valor,
    destacada: diaSel === d.dia,
    apagada: !d.delMes,
  }));
  const unidadesSemana = semana.filter((d) => d.delMes).reduce((t, d) => t + d.valor, 0);
  const primerDia = semana[0]?.fecha;
  const ultimoDia = semana[6]?.fecha;
  const conAnio = primerDia && ultimoDia && primerDia.getFullYear() !== ultimoDia.getFullYear();
  const rangoSemana =
    primerDia && ultimoDia
      ? `${primerDia.getDate()} ${MESES[primerDia.getMonth()]}${conAnio ? ` ${primerDia.getFullYear()}` : ""} – ` +
        `${ultimoDia.getDate()} ${MESES[ultimoDia.getMonth()]} ${ultimoDia.getFullYear()}`
      : "";

  const seleccionadas = diaSel
    ? deTodas.filter((f) => isoLocal(f.fecha) === diaSel)
    : mesSel !== null
      ? vigentes.filter((f) => f.fecha.getMonth() === mesSel)
      : vigentes;
  const nombreSeleccion = diaSel
    ? diaSel === hoy
      ? "hoy"
      : new Date(`${diaSel}T12:00:00`).toLocaleDateString("es-BO", {
          weekday: "long",
          day: "numeric",
          month: "short",
          year: "numeric",
        })
    : mesSel !== null
      ? `${MESES[mesSel]} ${anio}`
      : String(anio);
  // Tocar un día lo elige junto con su mes; tocarlo otra vez vuelve al mes.
  const elegirDia = (dia: string) => {
    if (diaSel === dia) {
      setDiaSel(null);
      return;
    }
    setDiaSel(dia);
    setMesSel(new Date(`${dia}T12:00:00`).getMonth());
  };
  // Tocar un mes muestra su semana 1 y sus ventas; tocarlo otra vez lo quita (y el día).
  const elegirMes = (m: number) => {
    setDiaSel(null);
    setSemanaSel(mesSel === m ? null : 0); // sin mes vuelve a la semana de hoy
    setMesSel(mesSel === m ? null : m);
  };

  const porMes = MESES.map((_, i) =>
    sumar(
      vigentes.filter((f) => f.fecha.getMonth() === i),
      (f) => f.total,
    ),
  );
  const barras: Barra[] = MESES.map((m, i) => ({
    etiqueta: m,
    valor: Math.round(porMes[i] ?? 0),
    destacada: vista === "desempeno" ? mesSel === i : mes === String(i),
  }));

  const productos = [...new Set(seleccionadas.map((f) => f.producto))]
    .map((p) => {
      const delProducto = seleccionadas.filter((f) => f.producto === p);
      return {
        producto: p,
        ventas: delProducto.length,
        unidades: sumar(delProducto, (f) => f.cantidad),
        total: sumar(delProducto, (f) => f.total),
      };
    })
    .sort((a, b) => b.total - a.total);
  const clientes = [...new Set(filas.map((f) => f.cliente).filter((c): c is string => c !== null))].sort((a, b) =>
    a.localeCompare(b),
  );

  const filtradas = filas.filter(
    (f) =>
      (mes === TODOS || f.fecha.getMonth() === Number(mes)) &&
      (tipo === "TODAS" || (tipo === "MAYORISTA" ? esMayorista(f) : !esMayorista(f))) &&
      (cliente === TODOS || f.cliente === cliente) &&
      (producto === TODOS || f.producto === producto),
  );
  const totalFiltrado = sumar(
    filtradas.filter((f) => !f.anulada),
    (f) => f.total,
  );

  // Las líneas de un mismo pedido van juntas, en el orden en que aparecen (D54).
  const agrupar = (lista: Fila[]) => {
    const grupos: { clave: string; pedidoId: string | null; filas: Fila[] }[] = [];
    const porPedido = new Map<string, (typeof grupos)[number]>();
    for (const f of lista) {
      if (!f.pedidoId) {
        grupos.push({ clave: f.clave, pedidoId: null, filas: [f] });
        continue;
      }
      let grupo = porPedido.get(f.pedidoId);
      if (!grupo) {
        grupo = { clave: `p${f.pedidoId}`, pedidoId: f.pedidoId, filas: [] };
        porPedido.set(f.pedidoId, grupo);
        grupos.push(grupo);
      }
      grupo.filas.push(f);
    }
    return grupos;
  };

  // Desempeño muestra la tabla del historial solo con un mes elegido: el mes o, si hay, su día (D82). Anuladas incluidas.
  const ventasSeleccion =
    mesSel === null
      ? []
      : diaSel
        ? filas.filter((f) => isoLocal(f.fecha) === diaSel)
        : filas.filter((f) => f.fecha.getMonth() === mesSel);
  const nombreTabla = diaSel ? nombreSeleccion : mesSel !== null ? `${MESES[mesSel]} ${anio}` : "";

  const alternarPedido = (clave: string) =>
    setAbiertos((actuales) => {
      const nuevos = new Set(actuales);
      if (nuevos.has(clave)) nuevos.delete(clave);
      else nuevos.add(clave);
      return nuevos;
    });

  const eliminarPedido = async (pedidoId: string, lineas: Fila[]) => {
    setMensaje(null);
    const deCaja = lineas[0]?.deCaja ?? true;
    try {
      // Los de la Caja devuelven sus insumos; las notas anteriores al sistema no tocaron el stock.
      if (deCaja) await api.eliminarPedido(pedidoId);
      else await api.eliminarPedidoHistorico((lineas[0] as Fila).id);
      await alCambiar();
      setBorrando(null);
      setMensaje({
        tipo: "ok",
        texto: `Se eliminó el pedido de ${lineas[0]?.cliente ?? "cliente"} (${lineas.length} productos)${deCaja ? "; sus insumos volvieron al stock" : ""}.`,
      });
    } catch (e) {
      setMensaje({ tipo: "error", texto: mensajeDeError(e) });
    }
  };

  const eliminar = async (f: Fila) => {
    setMensaje(null);
    try {
      if (f.deCaja) await api.eliminarVenta(f.id);
      else await api.eliminarHistorico(f.id);
      await alCambiar();
      setBorrando(null);
      setMensaje({
        tipo: "ok",
        texto: `Se eliminó «${f.producto} × ${cantidad(f.cantidad)}»${f.deCaja && !f.anulada ? "; sus insumos volvieron al stock" : ""}.`,
      });
    } catch (e) {
      setMensaje({ tipo: "error", texto: mensajeDeError(e) });
    }
  };

  // Una venta: sola, o una línea dentro de un pedido desplegado («media» / «ultima» dibuja la rama).
  const filaVenta = (f: Fila, dentro: false | "media" | "ultima") => (
    <Fragment key={f.clave}>
      <tr className={`${f.anulada ? "historial__anulada" : ""} ${dentro ? "historial__linea" : ""}`}>
        <td className="secundario" title={f.fechaEstimada ? "Fecha aproximada" : undefined}>
          {dentro ? null : f.deCaja ? (
            <>
              {fechaCorta(f.fecha.toISOString())} {hora(f.fecha.toISOString())}
            </>
          ) : (
            <>
              {f.fechaEstimada ? "≈ " : ""}
              {f.fecha.toLocaleDateString("es-BO", { day: "numeric", month: "short" })}
            </>
          )}
        </td>
        <td>
          {dentro && (
            <span className="historial__rama" aria-hidden>
              {dentro === "ultima" ? "└─ " : "├─ "}
            </span>
          )}
          {/* Dentro de un pedido ya se ve la familia arriba: «Queque Oreo» → «Oreo». */}
          {dentro && f.familia ? nombreCorto(f.producto, f.familia) : f.producto}
          {f.anulada && <span className="etiqueta etiqueta-negativa historial__erp">Anulada</span>}
          {/* Dentro de un pedido de sabores, «Anotado: Queque» se repetiría en cada línea. */}
          {f.productoOriginal && !dentro && <div className="secundario historial__original">Anotado: {f.productoOriginal}</div>}
        </td>
        <td className="num">{cantidad(f.cantidad)}</td>
        <td className="num">{bs(f.total)}</td>
        {/* Dentro de un pedido, cliente y tipo ya están en la fila del pedido. */}
        <td>{dentro ? null : (f.cliente ?? <span className="secundario">—</span>)}</td>
        <td>{dentro ? null : <TipoClienteBadge tipo={f.tipo} />}</td>
        <td className="num historial__acciones">
          {!f.anulada && (
            <Button
              tamano="chico"
              variante="texto"
              onClick={() => {
                setBorrando(null);
                setEditando(editando === f.clave ? null : f.clave);
              }}
            >
              <MdOutlineEdit aria-hidden /> Editar
            </Button>
          )}
          <Button
            tamano="chico"
            variante="texto"
            onClick={() => {
              setEditando(null);
              setBorrando(borrando === f.clave ? null : f.clave);
            }}
          >
            <MdDeleteOutline aria-hidden /> Eliminar
          </Button>
        </td>
      </tr>
      {editando === f.clave && (
        <tr className={`fila-formulario ${dentro ? "historial__linea-form" : ""}`}>
          <td colSpan={7}>
            <EditorVenta
              fila={f}
              cancelar={() => setEditando(null)}
              guardado={async (texto) => {
                await alCambiar();
                setEditando(null);
                setMensaje({ tipo: "ok", texto });
              }}
            />
          </td>
        </tr>
      )}
      {borrando === f.clave && (
        <tr className={`fila-formulario ${dentro ? "historial__linea-form" : ""}`}>
          <td colSpan={7}>
            <div className="historial__confirmar">
              <span>
                ¿Eliminar{" "}
                <strong>
                  {f.producto} × {cantidad(f.cantidad)}
                </strong>{" "}
                ({bs(f.total)}) del {f.fecha.toLocaleDateString("es-BO", { day: "numeric", month: "long", year: "numeric" })}?{" "}
                <span className="secundario">
                  {f.deCaja && !f.anulada
                    ? "Sus insumos vuelven al stock. No se puede deshacer."
                    : "Deja de contar en el historial. No se puede deshacer."}
                </span>
              </span>
              <div className="fila-botones">
                <Button variante="peligro" onClick={() => void eliminar(f)}>
                  Sí, eliminar
                </Button>
                <Button onClick={() => setBorrando(null)}>Cancelar</Button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );

  const tablaVentas = (lista: Fila[], vacio: string) =>
    lista.length === 0 ? (
      <p className="vacio">{vacio}</p>
    ) : (
      <div className="tabla-envoltura">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Producto</th>
              <th className="num">Cant.</th>
              <th className="num">Total</th>
              <th>Cliente</th>
              <th>Tipo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {agrupar(lista).map((g) => {
              const unico = g.filas.length === 1 ? g.filas[0] : null;
              if (unico) return filaVenta(unico, false);
              const primera = g.filas[0] as Fila;
              const vivas = g.filas.filter((f) => !f.anulada);
              const abierto = abiertos.has(g.clave);
              return (
                <Fragment key={g.clave}>
                  {/* Toda la fila despliega el pedido, menos la celda de Eliminar (D71). */}
                  <tr
                    className={`historial__pedido historial__pedido--tocable ${vivas.length === 0 ? "historial__anulada" : ""}`}
                    onClick={() => alternarPedido(g.clave)}
                  >
                    <td className="secundario">
                      {/* Las notas anteriores al sistema solo tienen el día. */}
                      {primera.deCaja
                        ? `${fechaCorta(primera.fecha.toISOString())} ${hora(primera.fecha.toISOString())}`
                        : primera.fecha.toLocaleDateString("es-BO", { day: "numeric", month: "short" })}
                    </td>
                    <td>
                      <button type="button" className="historial__desplegar" aria-expanded={abierto}>
                        <span aria-hidden>{abierto ? "▼" : "▶"}</span> {familiasDe(g.filas).join(", ")}
                      </button>
                    </td>
                    <td className="num">{cantidad(sumar(vivas, (f) => f.cantidad))}</td>
                    <td className="num">{bs(sumar(vivas, (f) => f.total))}</td>
                    <td>{primera.cliente ?? <span className="secundario">—</span>}</td>
                    <td>
                      <TipoClienteBadge tipo={primera.tipo} />
                    </td>
                    <td className="num historial__acciones" onClick={(e) => e.stopPropagation()}>
                      {/* Mismo nombre que en una venta suelta (D70); la confirmación dice que es el pedido entero. */}
                      <Button
                        tamano="chico"
                        variante="texto"
                        aria-label="Eliminar el pedido completo"
                        onClick={() => {
                          setEditando(null);
                          setBorrando(borrando === g.clave ? null : g.clave);
                        }}
                      >
                        <MdDeleteOutline aria-hidden /> Eliminar
                      </Button>
                    </td>
                  </tr>
                  {borrando === g.clave && (
                    <tr className="fila-formulario">
                      <td colSpan={7}>
                        <div className="historial__confirmar">
                          <span>
                            ¿Eliminar el pedido de <strong>{primera.cliente ?? "cliente"}</strong> ({g.filas.length} productos,{" "}
                            {bs(sumar(vivas, (f) => f.total))})?{" "}
                            <span className="secundario">Sus insumos vuelven al stock. No se puede deshacer.</span>
                          </span>
                          <div className="fila-botones">
                            <Button variante="peligro" onClick={() => void eliminarPedido(g.pedidoId as string, g.filas)}>
                              Sí, eliminar
                            </Button>
                            <Button onClick={() => setBorrando(null)}>Cancelar</Button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {abierto &&
                    familiasDe(g.filas).map((fam) => {
                      // Por familia (A–Z) y dentro, los productos en orden alfabético (D55).
                      const lineas = g.filas
                        .filter((f) => (f.familia ?? "Otros") === fam)
                        .sort((a, b) =>
                          nombreCorto(a.producto, fam).localeCompare(nombreCorto(b.producto, fam), "es", { numeric: true }),
                        );
                      return (
                        <Fragment key={`${g.clave}-${fam}`}>
                          <tr className="historial__familia">
                            <td />
                            <td colSpan={6}>
                              <span className="historial__familia-nombre">{fam}</span>
                            </td>
                          </tr>
                          {lineas.map((f, i) => filaVenta(f, i === lineas.length - 1 ? "ultima" : "media"))}
                        </Fragment>
                      );
                    })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );

  const productosDelAnio = [...new Set(vigentes.map((f) => f.producto))].sort((a, b) => a.localeCompare(b, "es"));

  return (
    <>
      {vista === "desempeno" && (
        <div className="desempeno">
          <div className="grilla-tarjetas">
            <Tarjeta
              titulo={`Vendido en ${anio}`}
              valor={bs(total)}
              detalle={`${contarPedidos(vigentes)} venta(s) · ${cantidad(sumar(vigentes, (f) => f.cantidad))} u`}
            />
            <Tarjeta
              titulo="Minoristas"
              valor={bs(sumar(minoristas, (f) => f.total))}
              detalle={`${contarPedidos(minoristas)} venta(s)`}
            />
            <Tarjeta
              titulo="Mayoristas"
              valor={bs(sumar(mayoristas, (f) => f.total))}
              detalle={`${contarPedidos(mayoristas)} venta(s)`}
            />
            <Tarjeta
              titulo="Ganancia bruta"
              valor={conGanancia.length > 0 ? bs(ganancia) : "—"}
              tono={conGanancia.length === 0 ? undefined : ganancia < 0 ? "negativo" : "positivo"}
              detalle={
                sinCosto > 0 ? `Sin contar ${sinCosto} venta(s) sin costo conocido.` : "Lo vendido menos el costo de los insumos."
              }
            />
          </div>

          <div className={`dos-columnas ${mesSel !== null ? "historial__con-tabla" : ""}`}>
            <div className="historial__graficos">
              <Panel titulo={`Ventas de la semana · ${MESES[mesVista]} ${anio} (unidades)`}>
                <div className="historial__grafico historial__grafico--semana">
                  <BarChart
                    datos={barrasSemana}
                    alto={100}
                    alElegir={(i) => {
                      const d = semana[i];
                      if (d?.delMes) elegirDia(d.dia);
                    }}
                    descripcion={`Unidades vendidas del ${rangoSemana}: ${barrasSemana.map((b) => `${b.etiqueta} ${b.valor}`).join(", ")}`}
                  />
                  {/* Flechas para pasar entre las semanas del mes (D82). */}
                  <div className="historial__semanas">
                    <button
                      type="button"
                      className="historial__flecha"
                      onClick={() => setSemanaSel(indiceSemana - 1)}
                      disabled={indiceSemana === 0}
                      aria-label="Semana anterior"
                    >
                      <MdChevronLeft aria-hidden />
                    </button>
                    <div className="historial__semana-texto">
                      <strong>
                        Semana {indiceSemana + 1} de {semanas.length}
                      </strong>
                      <span>{rangoSemana}</span>
                    </div>
                    <button
                      type="button"
                      className="historial__flecha"
                      onClick={() => setSemanaSel(indiceSemana + 1)}
                      disabled={indiceSemana >= semanas.length - 1}
                      aria-label="Semana siguiente"
                    >
                      <MdChevronRight aria-hidden />
                    </button>
                  </div>
                  <p className="secundario historial__nota">
                    {cantidad(unidadesSemana)} unidades vendidas esta semana en {MESES[mesVista]}.
                  </p>
                </div>
              </Panel>
              <Panel titulo={`Ventas por mes · ${anio} (Bs)`}>
                <div className="historial__grafico">
                  <BarChart
                    datos={barras}
                    alto={130}
                    alElegir={(i) => {
                      if ((porMes[i] ?? 0) > 0) elegirMes(i);
                    }}
                    descripcion={`Bs vendidos por mes en ${anio}: ${barras.map((b) => `${b.etiqueta} ${b.valor}`).join(", ")}`}
                  />
                  <div className="historial__meses" aria-label="Filtrar por mes">
                    {MESES.map((m, i) => (
                      <button
                        key={m}
                        type="button"
                        disabled={(porMes[i] ?? 0) === 0}
                        className={`historial__mes ${mesSel === i ? "historial__mes--activo" : ""}`}
                        onClick={() => elegirMes(i)}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  <p className="secundario historial__nota">
                    Toca un mes para ver sus ventas abajo y luego un día de la semana para ver solo ese día. Tócalo otra vez para
                    quitarlo.
                  </p>
                </div>
              </Panel>
            </div>

            {/* Con un mes elegido, la tabla de ventas ocupa el lugar de «Por producto» (D83). */}
            {mesSel !== null ? (
              <Panel titulo="Historial de ventas">
                {mensaje && (
                  <div className="historial__mensaje">
                    <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>
                  </div>
                )}
                {tablaVentas(
                  ventasSeleccion,
                  diaSel === hoy ? "Sin ventas hoy" : `Sin ventas ${diaSel ? `el ${nombreTabla}` : `en ${nombreTabla}`}`,
                )}
              </Panel>
            ) : (
              <Panel titulo={`Por producto · ${nombreSeleccion}`}>
                <div className="tabla-envoltura">
                  {/* Como «Ventas de hoy»: «3 × Queque Coco» y su total (D73). */}
                  <table className="historial__por-producto">
                    <tbody>
                      {productos.map((p) => (
                        <tr key={p.producto}>
                          <td>
                            {cantidad(p.unidades)} × {p.producto}
                          </td>
                          <td className="num">{bs(p.total)}</td>
                        </tr>
                      ))}
                      {productos.length === 0 && (
                        <tr>
                          <td colSpan={2} className="secundario">
                            Sin ventas {nombreSeleccion === "hoy" ? "hoy" : `el ${nombreSeleccion}`}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}
          </div>
        </div>
      )}

      {vista === "ventas" && (
        <Panel titulo={`Ventas · ${contarPedidos(filtradas.filter((f) => !f.anulada))} · ${bs(totalFiltrado)}`}>
          {mensaje && (
            <div className="historial__mensaje">
              <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>
            </div>
          )}
          <div className="historial__filtros">
            <Campo etiqueta="Mes">
              <select value={mes} onChange={(e) => setMes(e.target.value)}>
                <option value={TODOS}>Todo el año</option>
                {MESES.map((m, i) => (
                  <option key={m} value={String(i)} disabled={(porMes[i] ?? 0) === 0}>
                    {m}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Tipo">
              <select value={tipo} onChange={(e) => setTipo(e.target.value as FiltroTipo)}>
                <option value="TODAS">Todas las ventas</option>
                <option value="MINORISTA">Solo minoristas</option>
                <option value="MAYORISTA">Solo mayoristas</option>
              </select>
            </Campo>
            <Campo etiqueta="Cliente">
              <select value={cliente} onChange={(e) => setCliente(e.target.value)}>
                <option value={TODOS}>Todos</option>
                {clientes.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Producto">
              <select value={producto} onChange={(e) => setProducto(e.target.value)}>
                <option value={TODOS}>Todos</option>
                {productosDelAnio.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          {tablaVentas(filtradas, "No hay ventas con estos filtros.")}
        </Panel>
      )}
    </>
  );
}

// Corrige una venta: día, cantidad y precio o total. Solo se manda lo que cambió.
// El cliente no se cambia (D58): si se anotó al cliente equivocado, se elimina y se registra de nuevo.
function EditorVenta({
  fila,
  cancelar,
  guardado,
}: {
  fila: Fila;
  cancelar: () => void;
  guardado: (mensaje: string) => Promise<void>;
}) {
  const diaOriginal = fila.fecha.toLocaleDateString("sv-SE");
  const [dia, setDia] = useState(diaOriginal);
  const [unidades, setUnidades] = useState(String(fila.cantidad));
  const [monto, setMonto] = useState(String(fila.deCaja ? fila.precioUnitario : fila.total)); // Caja: precio por unidad; anteriores: total
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numerosValidos = esNumeroValido(unidades) && Number(normalizarNumero(unidades)) > 0 && esNumeroValido(monto);
  const n = numerosValidos ? Number(normalizarNumero(unidades)) : 0;
  const m = numerosValidos ? Number(normalizarNumero(monto)) : 0;
  const total = fila.deCaja ? n * m : m;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!numerosValidos) return;
    setGuardando(true);
    setError(null);
    const cambioCantidad = n !== fila.cantidad ? normalizarNumero(unidades) : undefined;
    const cambioDia = dia !== diaOriginal ? dia : undefined;
    try {
      if (fila.deCaja) {
        await api.editarVenta(fila.id, {
          cantidad: cambioCantidad,
          precioUnitario: m !== fila.precioUnitario ? normalizarNumero(monto) : undefined,
          fecha: cambioDia,
        });
      } else {
        await api.editarHistorico(fila.id, {
          cantidad: cambioCantidad,
          valor: m !== fila.total ? normalizarNumero(monto) : undefined,
          fecha: cambioDia,
        });
      }
      await guardado(`«${fila.producto}» corregido: ${cantidad(n)} u · ${bs(total)}.`);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form className="historial__editor" onSubmit={(e) => void enviar(e)}>
      {error && (
        <div className="historial__editor-error">
          <Aviso tipo="error">{error}</Aviso>
        </div>
      )}
      <Campo etiqueta="Día">
        <input type="date" value={dia} max={hoyISO()} onChange={(e) => setDia(e.target.value)} required />
      </Campo>
      <Campo etiqueta="Cantidad">
        <input inputMode="decimal" value={unidades} onChange={(e) => setUnidades(e.target.value)} autoFocus />
      </Campo>
      <Campo
        etiqueta={fila.deCaja ? "Precio por unidad (Bs)" : "Total (Bs)"}
        ayuda={fila.deCaja ? `Total: ${bs(total)}` : undefined}
      >
        <input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} />
      </Campo>
      {/* Etiqueta vacía: los botones quedan a la altura de los campos. */}
      <div className="campo">
        <span className="campo-etiqueta" aria-hidden>
          &nbsp;
        </span>
        <div className="fila-botones historial__editor-botones">
          <Button type="submit" variante="primario" disabled={guardando || !numerosValidos}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
          <Button onClick={cancelar}>Cancelar</Button>
        </div>
      </div>
      {fila.deCaja && n !== fila.cantidad && numerosValidos && (
        <p className="secundario historial__editor-nota">
          El stock se ajusta solo: {n > fila.cantidad ? "se descuentan" : "se devuelven"} los insumos de{" "}
          {cantidad(Math.abs(n - fila.cantidad))} u.
        </p>
      )}
    </form>
  );
}
