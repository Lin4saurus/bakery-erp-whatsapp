import { Fragment, useState } from "react";
import {
  MdAdd,
  MdDeleteOutline,
  MdOutlineDeliveryDining,
  MdOutlineEdit,
  MdOutlineStorefront,
  MdOutlineUndo,
  MdWhatsapp,
} from "react-icons/md";
import { api, mensajeDeError, type Cliente, type Pedido, type Producto, type TipoCliente, type TipoEntrega } from "../api";
import { bs, cantidad, esNumeroValido, hoyISO, normalizarNumero } from "../formato";
import { precioParaCliente } from "../precios";
import {
  anterior,
  claseEstado,
  enlaceMapa,
  esAtrasado,
  fechaLarga,
  nombreDia,
  nombreEstado,
  paraPreparar,
  siguiente,
} from "../pedidos";
import { Aviso, BuscadorCliente, Button, Campo, Cargando, Panel, TipoClienteBadge, Ventana, mismoNombre, useDatos } from "../ui";
import "./Pedidos.css";

type Vista = "proximos" | "historial";
type Mensaje = { tipo: "ok" | "error" | "alerta"; texto: string };

// Pedidos por entregar (D81): la agenda de la repostera. Un pedido no es venta hasta que se entrega.
export function Pedidos() {
  const [vista, setVista] = useState<Vista>("proximos");
  const proximos = useDatos(() => api.pedidos("proximos"));
  const historial = useDatos(() => api.pedidos("historial"));
  const productos = useDatos(() => api.productos({ tipo: "VENTA", activo: true }));
  const clientes = useDatos(() => api.clientes());
  const [formulario, setFormulario] = useState<{ pedido: Pedido | null } | null>(null);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);

  const recargar = async () => {
    await Promise.all([proximos.recargar(), historial.recargar(), clientes.recargar()]);
  };

  const hoy = hoyISO();
  const lista = proximos.datos ?? [];
  // Atrasados juntos arriba; después un grupo por día de entrega.
  const grupos: { clave: string; titulo: string; detalle: string; atrasado: boolean; pedidos: Pedido[] }[] = [];
  const atrasados = lista.filter((p) => esAtrasado(p, hoy));
  if (atrasados.length > 0) {
    grupos.push({
      clave: "atrasados",
      titulo: "Atrasados",
      detalle: "Ya pasó su día de entrega",
      atrasado: true,
      pedidos: atrasados,
    });
  }
  for (const dia of [...new Set(lista.filter((p) => !esAtrasado(p, hoy)).map((p) => p.fechaEntrega))]) {
    grupos.push({
      clave: dia,
      titulo: nombreDia(dia, hoy),
      detalle: fechaLarga(dia),
      atrasado: false,
      pedidos: lista.filter((p) => p.fechaEntrega === dia),
    });
  }

  return (
    <div className="pedidos">
      <div className="cabecera-pantalla">
        <div>
          <h1>Pedidos</h1>
          <p>Lo que tienes que preparar y entregar, día por día. Un pedido pasa a ser venta cuando lo entregas.</p>
        </div>
        <Button variante="exito" onClick={() => setFormulario({ pedido: null })}>
          <MdAdd aria-hidden /> Nuevo pedido
        </Button>
      </div>

      {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}
      {proximos.error && <Aviso tipo="error">{proximos.error}</Aviso>}

      <div className="pedidos__pestanas" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={vista === "proximos"}
          className={`pedidos__pestana ${vista === "proximos" ? "pedidos__pestana--activa" : ""}`}
          onClick={() => setVista("proximos")}
        >
          Por entregar <span className="pedidos__cuenta">{lista.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={vista === "historial"}
          className={`pedidos__pestana ${vista === "historial" ? "pedidos__pestana--activa" : ""}`}
          onClick={() => setVista("historial")}
        >
          Entregados y cancelados
        </button>
      </div>

      {vista === "proximos" &&
        (proximos.cargando && !proximos.datos ? (
          <Cargando />
        ) : grupos.length === 0 ? (
          <Panel titulo="Sin pedidos por entregar">
            <p className="vacio">No hay pedidos pendientes. Anota uno con «Nuevo pedido» o espera los de WhatsApp.</p>
          </Panel>
        ) : (
          grupos.map((g) => (
            <DiaDePedidos
              key={g.clave}
              titulo={g.titulo}
              detalle={g.detalle}
              atrasado={g.atrasado}
              pedidos={g.pedidos}
              editar={(p) => setFormulario({ pedido: p })}
              alCambiar={async (m) => {
                setMensaje(m);
                await recargar();
              }}
            />
          ))
        ))}

      {vista === "historial" && <HistorialPedidos pedidos={historial.datos} cargando={historial.cargando} />}

      {formulario && (
        <FormularioPedido
          pedido={formulario.pedido}
          productos={productos.datos ?? []}
          clientes={clientes.datos ?? []}
          cerrar={() => setFormulario(null)}
          guardado={async (texto) => {
            setFormulario(null);
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
  pedidos,
  editar,
  alCambiar,
}: {
  titulo: string;
  detalle: string;
  atrasado: boolean;
  pedidos: Pedido[];
  editar: (p: Pedido) => void;
  alCambiar: (m: Mensaje) => Promise<void>;
}) {
  const preparar = paraPreparar(pedidos);
  const total = pedidos.reduce((t, p) => t + Number(p.total), 0);
  return (
    <section className={`pedidos__dia ${atrasado ? "pedidos__dia--atrasado" : ""}`}>
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
          <TarjetaPedido key={p.id} pedido={p} atrasado={atrasado} editar={() => editar(p)} alCambiar={alCambiar} />
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
  const [confirmar, setConfirmar] = useState<"entregar" | "cancelar" | "borrar" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paso = siguiente[pedido.estado];
  const atras = anterior[pedido.estado];

  const cambiar = async (estado: Pedido["estado"], motivoCancelacion?: string) => {
    setOcupado(true);
    setError(null);
    try {
      const { venta } = await api.cambiarEstadoPedido(pedido.id, estado, motivoCancelacion);
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
        await alCambiar({ tipo: "ok", texto: `Pedido ${pedido.numero} de ${pedido.cliente.nombre} cancelado.` });
      } else {
        await alCambiar({ tipo: "ok", texto: `Pedido ${pedido.numero}: ${nombreEstado[estado].toLowerCase()}.` });
      }
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setOcupado(false);
    }
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
      <div className="pedido__total">
        <span>Total</span>
        <strong>{bs(pedido.total)}</strong>
      </div>

      {error && <Aviso tipo="error">{error}</Aviso>}

      {confirmar === "entregar" && (
        <div className="pedido__confirmar">
          <p>
            ¿Entregar y cobrar <strong>{bs(pedido.total)}</strong>? Se registra la venta y baja el stock.
          </p>
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
            <Button tamano="chico" variante="texto" onClick={editar}>
              <MdOutlineEdit aria-hidden /> Editar
            </Button>
            <Button tamano="chico" variante="texto" onClick={() => setConfirmar("cancelar")}>
              Cancelar
            </Button>
            <Button tamano="chico" variante="texto" aria-label="Borrar pedido" onClick={() => setConfirmar("borrar")}>
              <MdDeleteOutline aria-hidden />
            </Button>
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

// ---------- Anotar o editar un pedido ----------

type LineaForm = { clave: number; productoId: number | null; cantidad: string };

function FormularioPedido({
  pedido,
  productos,
  clientes,
  cerrar,
  guardado,
}: {
  pedido: Pedido | null;
  productos: Producto[];
  clientes: Cliente[];
  cerrar: () => void;
  guardado: (texto: string) => Promise<void>;
}) {
  const hoy = hoyISO();
  const [nombreCliente, setNombreCliente] = useState(pedido?.cliente.nombre ?? "");
  const [celular, setCelular] = useState(pedido?.cliente.celular ?? "");
  const [tipoNuevo, setTipoNuevo] = useState<TipoCliente>("MINORISTA");
  const [fecha, setFecha] = useState(pedido?.fechaEntrega ?? hoy);
  const [horaEntrega, setHoraEntrega] = useState(pedido?.horaEntrega ?? "");
  const [nota, setNota] = useState(pedido?.nota ?? "");
  const [entrega, setEntrega] = useState<TipoEntrega>(pedido?.entrega ?? "RECOJO");
  const [ubicacion, setUbicacion] = useState(pedido?.ubicacion ?? "");
  const [costoEnvio, setCostoEnvio] = useState(pedido?.costoEnvio ?? "");
  const [lineas, setLineas] = useState<LineaForm[]>(
    pedido
      ? pedido.lineas.map((l, i) => ({ clave: i, productoId: l.productoId, cantidad: l.cantidad }))
      : [{ clave: 0, productoId: null, cantidad: "1" }],
  );
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const clienteSel = pedido
    ? (clientes.find((c) => c.id === pedido.cliente.id) ?? null)
    : nombreCliente.trim()
      ? (clientes.find((c) => mismoNombre(c.nombre, nombreCliente)) ?? null)
      : null;
  const clienteNuevo = !pedido && clienteSel === null && nombreCliente.trim() !== "";
  const celularValido = celular.replace(/\D/g, "").length >= 7;

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
  const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(fecha) && (fecha >= hoy || fecha === pedido?.fechaEntrega);
  const envioValido = costoEnvio.trim() === "" || esNumeroValido(costoEnvio);
  const datosValidos =
    lineasValidas && fechaValida && envioValido && (pedido !== null || (nombreCliente.trim() !== "" && celularValido));

  const cambiarLinea = (clave: number, cambio: Partial<LineaForm>) =>
    setLineas((actuales) => actuales.map((l) => (l.clave === clave ? { ...l, ...cambio } : l)));

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    const datos = {
      lineas: lineas.map((l) => ({ productoId: l.productoId as number, cantidad: normalizarNumero(l.cantidad) })),
      fechaEntrega: fecha,
      horaEntrega: horaEntrega || null,
      nota: nota.trim() || null,
      entrega,
      ubicacion: entrega === "DELIVERY" ? ubicacion.trim() || null : null,
      costoEnvio: entrega === "DELIVERY" && costoEnvio.trim() !== "" ? normalizarNumero(costoEnvio) : null,
    };
    try {
      if (pedido) {
        await api.editarPedidoEntrega(pedido.id, datos);
        await guardado(`Pedido ${pedido.numero} actualizado.`);
      } else {
        const creado = await api.crearPedidoEntrega({
          ...datos,
          clienteId: clienteSel?.id,
          clienteNombre: clienteSel ? undefined : nombreCliente.trim(),
          clienteTipo: clienteSel ? undefined : tipoNuevo,
          celular: celular.trim(),
        });
        await guardado(
          `Pedido ${creado.numero} anotado para ${nombreDia(creado.fechaEntrega).toLowerCase()} (${bs(creado.total)}) a ${creado.cliente.nombre}` +
            (creado.clienteNuevo ? ", que quedó guardado en Clientes." : "."),
        );
      }
    } catch (e) {
      setError(mensajeDeError(e));
      setGuardando(false);
    }
  };

  return (
    <Ventana
      titulo={pedido ? `Editar pedido N.º ${pedido.numero}` : "Nuevo pedido"}
      subtitulo="No es venta todavía: se cobra y descuenta el stock al entregarlo."
      cerrar={cerrar}
    >
      <div className="pedido-form">
        <div className="pedido-form__fila">
          {pedido ? (
            <Campo etiqueta="Cliente">
              <input value={pedido.cliente.nombre} disabled />
            </Campo>
          ) : (
            <>
              <Campo etiqueta="Cliente">
                <BuscadorCliente
                  clientes={clientes}
                  texto={nombreCliente}
                  alCambiarTexto={setNombreCliente}
                  alElegir={(c) => {
                    setNombreCliente(c.nombre);
                    setCelular(c.celular ?? "");
                  }}
                  placeholder="Escribe el nombre"
                  autoFocus
                />
              </Campo>
              <Campo etiqueta="Celular">
                <input value={celular} onChange={(e) => setCelular(e.target.value)} inputMode="tel" placeholder="Ej. 71234567" />
              </Campo>
            </>
          )}
        </div>
        {!pedido && nombreCliente.trim() !== "" && !celularValido && (
          <p className="negativo pedido-form__detalle">
            Anota el celular (al menos 7 dígitos) para poder avisarle cuando esté listo.
          </p>
        )}
        {clienteSel && (
          <p className="secundario pedido-form__detalle">
            <TipoClienteBadge tipo={clienteSel.tipo} />{" "}
            {clienteSel.precios.length > 0 ? "Con precios acordados: ya se usan abajo." : "Precio de venta normal."}
          </p>
        )}
        {clienteNuevo && (
          <div className="pedido-form__detalle">
            <span className="etiqueta etiqueta-positiva">Cliente nuevo</span>{" "}
            <span className="secundario">Se guardará en Clientes como</span>{" "}
            <select value={tipoNuevo} onChange={(e) => setTipoNuevo(e.target.value as TipoCliente)}>
              <option value="MINORISTA">Minorista</option>
              <option value="MAYORISTA">Mayorista</option>
            </select>
          </div>
        )}

        <div className="pedido-form__fila">
          <Campo etiqueta="Día de entrega">
            <input type="date" value={fecha} min={hoy} onChange={(e) => setFecha(e.target.value)} />
          </Campo>
          <Campo etiqueta="Hora (opcional)">
            <input type="time" value={horaEntrega} onChange={(e) => setHoraEntrega(e.target.value)} />
          </Campo>
        </div>

        <div className="pedido-form__entrega" role="radiogroup" aria-label="Entrega">
          <span className="campo-etiqueta">Entrega</span>
          <div className="pedido-form__opciones">
            {(
              [
                ["RECOJO", "Recoge en el local", MdOutlineStorefront],
                ["DELIVERY", "Delivery", MdOutlineDeliveryDining],
              ] as const
            ).map(([valor, texto, Icono]) => (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={entrega === valor}
                className={`pedido-form__opcion ${entrega === valor ? "pedido-form__opcion--activa" : ""}`}
                onClick={() => setEntrega(valor)}
              >
                <Icono aria-hidden /> {texto}
              </button>
            ))}
          </div>
        </div>
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

        <div className="pedido-form__productos">
          <span className="campo-etiqueta">Productos</span>
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
        </div>

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
            {pedido ? "Guardar cambios" : "Anotar pedido"}
          </Button>
          <Button onClick={cerrar}>Cancelar</Button>
        </div>
      </div>
    </Ventana>
  );
}
