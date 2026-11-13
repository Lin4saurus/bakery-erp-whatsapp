import { Fragment, useState } from "react";
import {
  MdAdd,
  MdDeleteOutline,
  MdOutlineCheckCircle,
  MdOutlineDeliveryDining,
  MdOutlineEdit,
  MdOutlineReceiptLong,
  MdOutlineStorefront,
  MdOutlineUndo,
  MdWhatsapp,
} from "react-icons/md";
import { api, mensajeDeError, type Cliente, type MetodoPago, type Pedido, type Producto, type TipoEntrega } from "../api";
import { bs, cantidad, esNumeroValido, hoyISO, normalizarNumero } from "../formato";
import { precioParaCliente } from "../precios";
import {
  abrirArchivo,
  anterior,
  claseEstado,
  enlaceMapa,
  esAtrasado,
  fechaLarga,
  nombreDia,
  nombreEstado,
  nombreMetodo,
  paraPreparar,
  siguiente,
} from "../pedidos";
import { Aviso, Button, Campo, Cargando, Opciones, Panel, TipoClienteBadge, Ventana, useDatos } from "../ui";
import { useAlAvisar } from "../avisos";
import "./Pedidos.css";

type Vista = "proximos" | "historial";
type Mensaje = { tipo: "ok" | "error" | "alerta"; texto: string };

// Pedidos por entregar (D81): la agenda de la repostera. El cliente paga primero (D86): al registrar el pago
// se registra la venta y el pedido queda agendado; los que esperan pago van aparte, arriba.
export function Pedidos() {
  const [vista, setVista] = useState<Vista>("proximos");
  const proximos = useDatos(() => api.pedidos("proximos"));
  const historial = useDatos(() => api.pedidos("historial"));
  const productos = useDatos(() => api.productos({ tipo: "VENTA", activo: true }));
  const clientes = useDatos(() => api.clientes());
  const [editando, setEditando] = useState<Pedido | null>(null);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);

  // Después de un cambio propio (entregar, cancelar…) un pedido puede pasar de una pestaña a la otra: se recargan las dos.
  // Los clientes no cambian desde aquí (los pedidos se anotan en Caja, D98).
  const recargar = async () => {
    await Promise.all([proximos.recargar(), historial.recargar()]);
  };
  // Un pedido de WhatsApp o un pago confirmado aparecen solos (D88): solo se recarga la pestaña que se ve (R5);
  // la otra se pone al día al abrirla.
  useAlAvisar(() => void (vista === "proximos" ? proximos.recargar() : historial.recargar()), "pedidos");

  const hoy = hoyISO();
  const lista = proximos.datos ?? [];
  // Esperando pago arriba; después los atrasados y un grupo por día de entrega (solo los agendados).
  const grupos: { clave: string; titulo: string; detalle: string; atrasado: boolean; pedidos: Pedido[] }[] = [];
  const porPagar = lista.filter((p) => p.estado === "POR_PAGAR");
  if (porPagar.length > 0) {
    grupos.push({
      clave: "por-pagar",
      titulo: "Cotizaciones",
      detalle: "Todavía no pagan: se agendan cuando paguen (QR o efectivo)",
      atrasado: false,
      pedidos: porPagar,
    });
  }
  const agendados = lista.filter((p) => p.estado !== "POR_PAGAR");
  const atrasados = agendados.filter((p) => esAtrasado(p, hoy));
  if (atrasados.length > 0) {
    grupos.push({
      clave: "atrasados",
      titulo: "Atrasados",
      detalle: "Ya pasó su día de entrega",
      atrasado: true,
      pedidos: atrasados,
    });
  }
  for (const dia of [...new Set(agendados.filter((p) => !esAtrasado(p, hoy)).map((p) => p.fechaEntrega))]) {
    grupos.push({
      clave: dia,
      titulo: nombreDia(dia, hoy),
      detalle: fechaLarga(dia),
      atrasado: false,
      pedidos: agendados.filter((p) => p.fechaEntrega === dia),
    });
  }

  return (
    <div className="pedidos">
      <div className="cabecera-pantalla">
        <div>
          <h1>Pedidos</h1>
          <p>
            Lo que tienes que preparar y entregar, día por día. El cliente paga primero: con el pago se registra la venta y el
            pedido se agenda. Los pedidos nuevos se anotan en Caja.
          </p>
        </div>
      </div>

      {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}
      {proximos.error && <Aviso tipo="error">{proximos.error}</Aviso>}

      <div className="pedidos__pestanas" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={vista === "proximos"}
          className={`pedidos__pestana ${vista === "proximos" ? "pedidos__pestana--activa" : ""}`}
          onClick={() => {
            setVista("proximos");
            void proximos.recargar();
          }}
        >
          Por entregar <span className="pedidos__cuenta">{lista.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={vista === "historial"}
          className={`pedidos__pestana ${vista === "historial" ? "pedidos__pestana--activa" : ""}`}
          onClick={() => {
            setVista("historial");
            void historial.recargar();
          }}
        >
          Entregados y cancelados
        </button>
      </div>

      {vista === "proximos" &&
        (proximos.cargando && !proximos.datos ? (
          <Cargando />
        ) : grupos.length === 0 ? (
          <Panel titulo="Sin pedidos por entregar">
            <p className="vacio">
              No hay pedidos pendientes. Anota uno en Caja («Para entregar después») o espera los de WhatsApp.
            </p>
          </Panel>
        ) : (
          grupos.map((g) => (
            <DiaDePedidos
              key={g.clave}
              titulo={g.titulo}
              detalle={g.detalle}
              atrasado={g.atrasado}
              porPagar={g.clave === "por-pagar"}
              pedidos={g.pedidos}
              editar={(p) => setEditando(p)}
              alCambiar={async (m) => {
                setMensaje(m);
                await recargar();
              }}
            />
          ))
        ))}

      {vista === "historial" && <HistorialPedidos pedidos={historial.datos} cargando={historial.cargando} />}

      {editando && (
        <EditarPedido
          pedido={editando}
          productos={productos.datos ?? []}
          clientes={clientes.datos ?? []}
          cerrar={() => setEditando(null)}
          guardado={async (texto) => {
            setEditando(null);
            setMensaje({ tipo: "ok", texto });
            await recargar();
          }}
        />
      )}
    </div>
  );
}

// ---------- Un día de entregas ----------

function DiaDePedidos({
  titulo,
  detalle,
  atrasado,
  porPagar,
  pedidos,
  editar,
  alCambiar,
}: {
  titulo: string;
  detalle: string;
  atrasado: boolean;
  porPagar: boolean;
  pedidos: Pedido[];
  editar: (p: Pedido) => void;
  alCambiar: (m: Mensaje) => Promise<void>;
}) {
  const preparar = paraPreparar(pedidos);
  const total = pedidos.reduce((t, p) => t + Number(p.total), 0);
  return (
    <section className={`pedidos__dia ${atrasado ? "pedidos__dia--atrasado" : ""} ${porPagar ? "pedidos__dia--por-pagar" : ""}`}>
      <header className="pedidos__dia-cabecera">
        <div>
          <h2>{titulo}</h2>
          <span className="secundario">{detalle}</span>
        </div>
        <span className="pedidos__dia-total">
          {pedidos.length} pedido(s) · {bs(total)}
        </span>
      </header>
      {preparar.length > 0 && (
        <p className="pedidos__preparar">
          <strong>Para preparar:</strong>{" "}
          {preparar.map((p, i) => (
            <Fragment key={p.producto}>
              {i > 0 && " · "}
              <span className="pedidos__preparar-item">
                {cantidad(p.unidades)} × {p.producto}
              </span>
            </Fragment>
          ))}
        </p>
      )}
      <div className="pedidos__tarjetas">
        {pedidos.map((p) => (
          <TarjetaPedido
            key={p.id}
            pedido={p}
            atrasado={atrasado || (porPagar && esAtrasado(p))}
            editar={() => editar(p)}
            alCambiar={alCambiar}
          />
        ))}
      </div>
    </section>
  );
}

function TarjetaPedido({
  pedido,
  atrasado,
  editar,
  alCambiar,
}: {
  pedido: Pedido;
  atrasado: boolean;
  editar: () => void;
  alCambiar: (m: Mensaje) => Promise<void>;
}) {
  const [confirmar, setConfirmar] = useState<"pagar" | "anular" | "entregar" | "cancelar" | "borrar" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [metodo, setMetodo] = useState<MetodoPago>("QR");
  const [referencia, setReferencia] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paso = siguiente[pedido.estado];
  const atras = anterior[pedido.estado];

  const cambiar = async (estado: Pedido["estado"], motivoCancelacion?: string) => {
    setOcupado(true);
    setError(null);
    try {
      const { venta, ventaAnulada, alertas = [] } = await api.cambiarEstadoPedido(pedido.id, estado, motivoCancelacion);
      const avisoStock = alertas.length > 0 ? ` Revisa el stock: ${alertas.map((a) => a.nombre).join(", ")}.` : "";
      const enCocina = pedido.estado === "EN_PREPARACION" || pedido.estado === "LISTO";
      setConfirmar(null);
      if (estado === "ENTREGADO" && venta) {
        await alCambiar({
          tipo: venta.alertas.length > 0 ? "alerta" : "ok",
          texto:
            `Pedido ${pedido.numero} entregado: se registró la venta de ${bs(venta.totalVenta)} a ${venta.cliente} ` +
            `(ganancia ${bs(venta.gananciaBruta)}).` +
            (venta.alertas.length > 0 ? ` Revisa el stock: ${venta.alertas.map((a) => a.nombre).join(", ")}.` : ""),
        });
      } else if (estado === "CANCELADO") {
        await alCambiar({
          tipo: "ok",
          texto:
            `Pedido ${pedido.numero} de ${pedido.cliente.nombre} cancelado.` +
            (ventaAnulada
              ? ` Se anuló su venta de ${bs(pedido.total)}: devuélvele el dinero al cliente.` +
                (enCocina ? " Los insumos ya se habían usado y no vuelven al stock." : "")
              : ""),
        });
      } else if (estado === "PENDIENTE" && pedido.estado === "EN_PREPARACION") {
        await alCambiar({ tipo: "ok", texto: `Pedido ${pedido.numero} vuelve a «Agendado»: sus insumos volvieron al stock.` });
      } else if (pedido.estado === "PENDIENTE" && pedido.pagado) {
        // Empezar a preparar (D87): recién aquí bajan los insumos de la receta.
        await alCambiar({
          tipo: alertas.length > 0 ? "alerta" : "ok",
          texto: `Pedido ${pedido.numero}: ${nombreEstado[estado].toLowerCase()}. Se descontaron del stock los insumos de la receta.${avisoStock}`,
        });
      } else {
        await alCambiar({ tipo: "ok", texto: `Pedido ${pedido.numero}: ${nombreEstado[estado].toLowerCase()}.` });
      }
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setOcupado(false);
    }
  };

  // Registrar el pago (D86): se registra la venta y el pedido queda agendado; los insumos bajan al preparar (D87).
  const pagar = async () => {
    setOcupado(true);
    setError(null);
    try {
      const { venta } = await api.pagarPedido(pedido.id, { metodo, referencia: referencia.trim() || null });
      setConfirmar(null);
      await alCambiar({
        tipo: venta.alertas.length > 0 ? "alerta" : "ok",
        texto:
          `Pago del pedido ${pedido.numero} registrado (${nombreMetodo[metodo]}): venta de ${bs(venta.totalVenta)} a ` +
          `${venta.cliente}; queda agendado para ${nombreDia(pedido.fechaEntrega).toLowerCase()}.` +
          (venta.alertas.length > 0 ? ` Revisa el stock: ${venta.alertas.map((a) => a.nombre).join(", ")}.` : ""),
      });
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setOcupado(false);
    }
  };

  const anularPago = async () => {
    setOcupado(true);
    setError(null);
    try {
      await api.anularPago(pedido.id);
      setConfirmar(null);
      await alCambiar({
        tipo: "ok",
        texto: `Se anuló el pago del pedido ${pedido.numero}: se borró su venta y quedó por pagar.`,
      });
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setOcupado(false);
    }
  };

  const verComprobante = () => {
    setError(null);
    abrirArchivo(async () => (await api.comprobantePedido(pedido.id)).comprobante).catch((e) => setError(mensajeDeError(e)));
  };

  const borrar = async () => {
    setOcupado(true);
    try {
      await api.borrarPedidoEntrega(pedido.id);
      await alCambiar({ tipo: "ok", texto: `Se borró el pedido ${pedido.numero}.` });
    } catch (e) {
      setError(mensajeDeError(e));
      setOcupado(false);
    }
  };

  return (
    <article className={`pedido pedido--${pedido.estado.toLowerCase()} ${atrasado ? "pedido--atrasado" : ""}`}>
      <header className="pedido__cabecera">
        <span className="pedido__numero">N.º {pedido.numero}</span>
        <span className="pedido__hora">
          {atrasado ? `${nombreDia(pedido.fechaEntrega)} · ` : ""}
          {pedido.horaEntrega ?? "Sin hora"}
        </span>
        <span className={`etiqueta ${claseEstado[pedido.estado]}`}>{nombreEstado[pedido.estado]}</span>
      </header>

      <div className="pedido__cliente">
        <strong>{pedido.cliente.nombre}</strong> <TipoClienteBadge tipo={pedido.cliente.tipo} />
        {pedido.origen === "WHATSAPP" && (
          <span className="etiqueta pedido__whatsapp" title="Lo tomó el agente de WhatsApp">
            <MdWhatsapp aria-hidden /> WhatsApp
          </span>
        )}
        {pedido.esDemo && <span className="etiqueta etiqueta-neutra">Demo</span>}
        {pedido.cliente.celular && <div className="secundario">Cel. {pedido.cliente.celular}</div>}
      </div>

      <ul className="pedido__lineas">
        {pedido.lineas.map((l) => (
          <li key={l.id}>
            <span>
              {cantidad(l.cantidad)} × {l.producto}
            </span>
            <span className="num">{bs(l.subtotal)}</span>
          </li>
        ))}
      </ul>
      {pedido.nota && <p className="pedido__nota">«{pedido.nota}»</p>}
      <Entrega pedido={pedido} />
      <Pago pedido={pedido} verComprobante={verComprobante} />
      <div className="pedido__total">
        <span>Total</span>
        <strong>{bs(pedido.total)}</strong>
      </div>

      {error && <Aviso tipo="error">{error}</Aviso>}

      {confirmar === "pagar" && (
        <div className="pedido__confirmar">
          <p>
            ¿Registrar el pago de <strong>{bs(pedido.total)}</strong>? Se registra la venta y el pedido queda agendado. Los
            insumos se descuentan cuando empieces a prepararlo.
          </p>
          <Opciones
            etiqueta="Cómo pagó"
            mostrarEtiqueta={false}
            valor={metodo}
            alCambiar={setMetodo}
            opciones={(["QR", "EFECTIVO"] as const).map((m) => ({ valor: m, texto: nombreMetodo[m] }))}
          />
          {metodo === "QR" && (
            <Campo etiqueta="Nro. de operación (opcional)" ayuda="Evita que el mismo comprobante pague dos pedidos.">
              <input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Ej. 0012345678" />
            </Campo>
          )}
          <div className="fila-botones">
            <Button variante="exito" disabled={ocupado} onClick={() => void pagar()}>
              Sí, pagó
            </Button>
            <Button onClick={() => setConfirmar(null)}>Volver</Button>
          </div>
        </div>
      )}
      {confirmar === "anular" && (
        <div className="pedido__confirmar">
          <p>
            ¿Anular el pago? Se borra la venta de <strong>{bs(pedido.total)}</strong> y el pedido queda por pagar. Úsalo solo si
            se marcó por error.
          </p>
          <div className="fila-botones">
            <Button variante="peligro" disabled={ocupado} onClick={() => void anularPago()}>
              Sí, anular pago
            </Button>
            <Button onClick={() => setConfirmar(null)}>Volver</Button>
          </div>
        </div>
      )}
      {confirmar === "entregar" && (
        <div className="pedido__confirmar">
          {pedido.pagado ? (
            <p>¿Marcar el pedido {pedido.numero} como entregado? Ya está pagado.</p>
          ) : (
            <p>
              Este pedido no tiene pago registrado. ¿Entregar y cobrar <strong>{bs(pedido.total)}</strong>? Se registra la venta
              {pedido.insumosDescontadosEn ? "." : " y se descuentan sus insumos."}
            </p>
          )}
          <div className="fila-botones">
            <Button variante="exito" disabled={ocupado} onClick={() => void cambiar("ENTREGADO")}>
              Sí, entregado
            </Button>
            <Button onClick={() => setConfirmar(null)}>Volver</Button>
          </div>
        </div>
      )}
      {confirmar === "cancelar" && (
        <div className="pedido__confirmar">
          {pedido.pagado && (
            <p className="negativo">
              Ya está pagado: al cancelarlo se anula su venta de {bs(pedido.total)}. Devuélvele el dinero al cliente.
              {pedido.estado === "EN_PREPARACION" || pedido.estado === "LISTO"
                ? " Los insumos ya se usaron: no vuelven al stock."
                : ""}
            </p>
          )}
          <Campo etiqueta="¿Por qué se cancela? (opcional)">
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. el cliente ya no lo necesita" />
          </Campo>
          <div className="fila-botones">
            <Button variante="peligro" disabled={ocupado} onClick={() => void cambiar("CANCELADO", motivo.trim() || undefined)}>
              Sí, cancelar pedido
            </Button>
            <Button onClick={() => setConfirmar(null)}>Volver</Button>
          </div>
        </div>
      )}
      {confirmar === "borrar" && (
        <div className="pedido__confirmar">
          <p>¿Borrar el pedido {pedido.numero}? Úsalo solo si se anotó por error; si el cliente desiste, mejor cancélalo.</p>
          <div className="fila-botones">
            <Button variante="peligro" disabled={ocupado} onClick={() => void borrar()}>
              Sí, borrar
            </Button>
            <Button onClick={() => setConfirmar(null)}>Volver</Button>
          </div>
        </div>
      )}

      {confirmar === null && (
        <footer className="pedido__acciones">
          {pedido.estado === "POR_PAGAR" && (
            <Button variante="exito" disabled={ocupado} onClick={() => setConfirmar("pagar")}>
              <MdOutlineCheckCircle aria-hidden /> Registrar pago
            </Button>
          )}
          {paso && (
            <Button
              variante={paso.estado === "ENTREGADO" ? "exito" : "primario"}
              disabled={ocupado}
              onClick={() => (paso.estado === "ENTREGADO" ? setConfirmar("entregar") : void cambiar(paso.estado))}
            >
              {paso.accion}
            </Button>
          )}
          <div className="pedido__acciones-secundarias">
            {atras && (
              <Button
                tamano="chico"
                variante="texto"
                disabled={ocupado}
                title={`Volver a «${nombreEstado[atras]}»`}
                onClick={() => void cambiar(atras)}
              >
                <MdOutlineUndo aria-hidden /> Deshacer
              </Button>
            )}
            {pedido.pagado && pedido.estado === "PENDIENTE" && (
              <Button tamano="chico" variante="texto" title="Se marcó pagado por error" onClick={() => setConfirmar("anular")}>
                Anular pago
              </Button>
            )}
            <Button tamano="chico" variante="texto" onClick={editar}>
              <MdOutlineEdit aria-hidden /> Editar
            </Button>
            <Button tamano="chico" variante="texto" onClick={() => setConfirmar("cancelar")}>
              Cancelar
            </Button>
            {!pedido.pagado && (
              <Button tamano="chico" variante="texto" aria-label="Borrar pedido" onClick={() => setConfirmar("borrar")}>
                <MdDeleteOutline aria-hidden />
              </Button>
            )}
          </div>
        </footer>
      )}
    </article>
  );
}

// Recojo o delivery (D85): el envío lo paga el cliente aparte, no suma al total del pedido.
function Entrega({ pedido }: { pedido: Pedido }) {
  if (pedido.entrega === "RECOJO") {
    return (
      <p className="pedido__entrega">
        <MdOutlineStorefront aria-hidden /> Recoge en el local
      </p>
    );
  }
  return (
    <p className="pedido__entrega pedido__entrega--delivery">
      <MdOutlineDeliveryDining aria-hidden /> Delivery
      {pedido.ubicacion ? (
        <a href={enlaceMapa(pedido.ubicacion)} target="_blank" rel="noreferrer">
          Ver en mapa
        </a>
      ) : (
        <span className="negativo">sin ubicación</span>
      )}
      <span className={pedido.costoEnvio === null ? "secundario" : undefined}>
        · Envío {pedido.costoEnvio === null ? "por cotizar" : bs(pedido.costoEnvio)}
      </span>
    </p>
  );
}

// Pago (D86): pagado con su método y comprobante, o lo que falta.
function Pago({ pedido, verComprobante }: { pedido: Pedido; verComprobante: () => void }) {
  if (pedido.pagado) {
    return (
      <p className="pedido__pago pedido__pago--hecho">
        <MdOutlineCheckCircle aria-hidden /> Pagado
        {pedido.metodoPago ? ` · ${nombreMetodo[pedido.metodoPago]}` : ""}
        {pedido.pagadoEn ? ` · ${nombreDia(pedido.pagadoEn.slice(0, 10)).toLowerCase()}` : ""}
        {pedido.tieneComprobante && (
          <button type="button" className="pedido__comprobante" onClick={verComprobante}>
            <MdOutlineReceiptLong aria-hidden /> Ver comprobante
          </button>
        )}
      </p>
    );
  }
  return (
    <p className="pedido__pago pedido__pago--falta">
      {pedido.estado !== "POR_PAGAR"
        ? "Sin pago registrado: se cobra al entregar."
        : pedido.entrega === "DELIVERY" && pedido.costoEnvio === null
          ? "Cotización: falta cotizar el envío (Atención)."
          : pedido.entrega === "DELIVERY" && !pedido.envioAceptadoEn
            ? "Cotización: esperando que acepte el costo del envío."
            : "Cotización: se agenda cuando pague."}
    </p>
  );
}

// ---------- Entregados y cancelados ----------

function HistorialPedidos({ pedidos, cargando }: { pedidos: Pedido[] | undefined; cargando: boolean }) {
  if (cargando && !pedidos) return <Cargando />;
  const lista = pedidos ?? [];
  return (
    <Panel titulo={`Últimos ${lista.length} pedidos terminados`}>
      {lista.length === 0 ? (
        <p className="vacio">Todavía no hay pedidos entregados ni cancelados.</p>
      ) : (
        <div className="tabla-envoltura">
          <table>
            <thead>
              <tr>
                <th>N.º</th>
                <th>Entrega</th>
                <th>Cliente</th>
                <th>Productos</th>
                <th className="num">Total</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id} className={p.estado === "CANCELADO" ? "pedidos__cancelado" : undefined}>
                  <td className="secundario">{p.numero}</td>
                  <td className="secundario">
                    {nombreDia(p.fechaEntrega)}
                    {p.horaEntrega ? ` ${p.horaEntrega}` : ""}
                    {p.entrega === "DELIVERY" && " · Delivery"}
                  </td>
                  <td>
                    {p.cliente.nombre}
                    {p.origen === "WHATSAPP" && <MdWhatsapp className="pedidos__icono-wa" aria-label="WhatsApp" />}
                  </td>
                  <td>{p.lineas.map((l) => `${cantidad(l.cantidad)} × ${l.producto}`).join(", ")}</td>
                  <td className="num">{bs(p.total)}</td>
                  <td>
                    <span className={`etiqueta ${claseEstado[p.estado]}`}>{nombreEstado[p.estado]}</span>
                    {p.motivoCancelacion && <div className="secundario">{p.motivoCancelacion}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

// ---------- Editar un pedido ----------
// Los pedidos nuevos se anotan en Caja (D98); aquí solo se corrigen día, hora, entrega, productos y nota (M3).

type LineaForm = { clave: number; productoId: number | null; cantidad: string };

function EditarPedido({
  pedido,
  productos,
  clientes,
  cerrar,
  guardado,
}: {
  pedido: Pedido;
  productos: Producto[];
  clientes: Cliente[];
  cerrar: () => void;
  guardado: (texto: string) => Promise<void>;
}) {
  const hoy = hoyISO();
  const [fecha, setFecha] = useState(pedido.fechaEntrega);
  const [horaEntrega, setHoraEntrega] = useState(pedido.horaEntrega ?? "");
  const [nota, setNota] = useState(pedido.nota ?? "");
  const [entrega, setEntrega] = useState<TipoEntrega>(pedido.entrega);
  const [ubicacion, setUbicacion] = useState(pedido.ubicacion ?? "");
  const [costoEnvio, setCostoEnvio] = useState(pedido.costoEnvio ?? "");
  const productosBloqueados = pedido.pagado;
  const [lineas, setLineas] = useState<LineaForm[]>(
    pedido.lineas.map((l, i) => ({ clave: i, productoId: l.productoId, cantidad: l.cantidad })),
  );
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const clienteSel = clientes.find((c) => c.id === pedido.cliente.id) ?? null;
  const productoDe = (id: number | null) => productos.find((p) => p.id === id) ?? null;
  const precioDe = (id: number | null) => {
    const producto = productoDe(id);
    return producto ? Number(precioParaCliente(clienteSel, producto).precio ?? 0) : 0;
  };
  const familias = [...new Set(productos.map((p) => p.categoria ?? "Otros"))].sort((a, b) => a.localeCompare(b, "es"));
  const total = lineas.reduce(
    (t, l) => t + (esNumeroValido(l.cantidad) ? precioDe(l.productoId) * Number(normalizarNumero(l.cantidad)) : 0),
    0,
  );

  const ids = lineas.map((l) => l.productoId).filter((id): id is number => id !== null);
  const repetido = new Set(ids).size !== ids.length;
  const lineasValidas =
    lineas.length > 0 &&
    lineas.every((l) => l.productoId !== null && esNumeroValido(l.cantidad) && Number(normalizarNumero(l.cantidad)) > 0) &&
    !repetido;
  const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(fecha) && (fecha >= hoy || fecha === pedido.fechaEntrega);
  const envioValido = costoEnvio.trim() === "" || esNumeroValido(costoEnvio);
  const datosValidos = lineasValidas && fechaValida && envioValido;

  const cambiarLinea = (clave: number, cambio: Partial<LineaForm>) =>
    setLineas((actuales) => actuales.map((l) => (l.clave === clave ? { ...l, ...cambio } : l)));

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      await api.editarPedidoEntrega(pedido.id, {
        // Los productos de un pedido pagado no se cambian: ya es venta (D86).
        ...(productosBloqueados
          ? {}
          : { lineas: lineas.map((l) => ({ productoId: l.productoId as number, cantidad: normalizarNumero(l.cantidad) })) }),
        fechaEntrega: fecha,
        horaEntrega: horaEntrega || null,
        nota: nota.trim() || null,
        entrega,
        ubicacion: entrega === "DELIVERY" ? ubicacion.trim() || null : null,
        costoEnvio: entrega === "DELIVERY" && costoEnvio.trim() !== "" ? normalizarNumero(costoEnvio) : null,
      });
      await guardado(`Pedido ${pedido.numero} actualizado.`);
    } catch (e) {
      setError(mensajeDeError(e));
      setGuardando(false);
    }
  };

  return (
    <Ventana
      titulo={`Editar pedido N.º ${pedido.numero}`}
      subtitulo="El cliente paga primero: con el pago se registra la venta y el pedido se agenda; los insumos bajan al empezar a prepararlo."
      cerrar={cerrar}
    >
      <div className="pedido-form">
        <div className="pedido-form__fila">
          <Campo etiqueta="Cliente">
            <input value={pedido.cliente.nombre} disabled />
          </Campo>
        </div>
        {clienteSel && (
          <p className="secundario pedido-form__detalle">
            <TipoClienteBadge tipo={clienteSel.tipo} />{" "}
            {clienteSel.precios.length > 0 ? "Con precios acordados: ya se usan abajo." : "Precio de venta normal."}
          </p>
        )}

        <div className="pedido-form__fila">
          <Campo etiqueta="Día de entrega">
            <input type="date" value={fecha} min={hoy} onChange={(e) => setFecha(e.target.value)} />
          </Campo>
          <Campo etiqueta="Hora (opcional)">
            <input type="time" value={horaEntrega} onChange={(e) => setHoraEntrega(e.target.value)} />
          </Campo>
        </div>

        <Opciones
          etiqueta="Entrega"
          valor={entrega}
          alCambiar={setEntrega}
          opciones={[
            { valor: "RECOJO", texto: "Recoge en el local", icono: MdOutlineStorefront },
            { valor: "DELIVERY", texto: "Delivery", icono: MdOutlineDeliveryDining },
          ]}
        />
        {entrega === "DELIVERY" && (
          <div className="pedido-form__fila">
            <Campo etiqueta="Ubicación (Google Maps o dirección)">
              <input value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="https://maps.app.goo.gl/…" />
            </Campo>
            <Campo etiqueta="Costo del envío (Bs, opcional)" ayuda="Lo paga el cliente aparte; no suma al total.">
              <input
                value={costoEnvio}
                onChange={(e) => setCostoEnvio(e.target.value)}
                inputMode="decimal"
                placeholder="Por cotizar"
                aria-invalid={!envioValido}
              />
            </Campo>
          </div>
        )}

        <fieldset className="pedido-form__productos" disabled={productosBloqueados}>
          <span className="campo-etiqueta">Productos</span>
          {productosBloqueados && (
            <p className="secundario pedido-form__detalle">Ya está pagado: para cambiar los productos, primero anula el pago.</p>
          )}
          {lineas.map((l) => (
            <div key={l.clave} className="pedido-form__linea">
              <select
                value={l.productoId ?? ""}
                onChange={(e) => cambiarLinea(l.clave, { productoId: e.target.value ? Number(e.target.value) : null })}
                aria-label="Producto"
              >
                <option value="">Elige un producto…</option>
                {familias.map((f) => (
                  <optgroup key={f} label={f}>
                    {productos
                      .filter((p) => (p.categoria ?? "Otros") === f)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre} — {bs(precioParaCliente(clienteSel, p).precio)}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              <input
                className="pedido-form__cantidad"
                value={l.cantidad}
                onChange={(e) => cambiarLinea(l.clave, { cantidad: e.target.value })}
                inputMode="decimal"
                aria-label="Cantidad"
              />
              <span className="num pedido-form__subtotal">
                {esNumeroValido(l.cantidad) ? bs(precioDe(l.productoId) * Number(normalizarNumero(l.cantidad))) : "—"}
              </span>
              <Button
                tamano="chico"
                variante="texto"
                aria-label="Quitar producto"
                disabled={lineas.length === 1}
                onClick={() => setLineas((actuales) => actuales.filter((x) => x.clave !== l.clave))}
              >
                <MdDeleteOutline aria-hidden />
              </Button>
            </div>
          ))}
          {repetido && <p className="negativo pedido-form__detalle">Un producto aparece dos veces: suma las cantidades.</p>}
          <Button
            tamano="chico"
            variante="texto"
            onClick={() =>
              setLineas((actuales) => [
                ...actuales,
                { clave: Math.max(...actuales.map((x) => x.clave)) + 1, productoId: null, cantidad: "1" },
              ])
            }
          >
            <MdAdd aria-hidden /> Agregar producto
          </Button>
        </fieldset>

        <Campo etiqueta="Nota (opcional)">
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={2}
            placeholder="Ej. con dedicatoria «Feliz cumple Ana», sin nueces…"
          />
        </Campo>

        <div className="pedido-form__total">
          <span>Total</span>
          <strong>{bs(total)}</strong>
        </div>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="fila-botones">
          <Button variante="primario" disabled={!datosValidos || guardando} onClick={() => void guardar()}>
            Guardar cambios
          </Button>
          <Button onClick={cerrar}>Cancelar</Button>
        </div>
      </div>
    </Ventana>
  );
}
