// Cliente tipado de la API. Los Decimal llegan como texto ("0.0064") para no perder precisión.

export type UnidadMedida = "GRAMO" | "MILILITRO" | "UNIDAD";
export type CategoriaInsumo = "MATERIA_PRIMA" | "EMPAQUE" | "GASTO_INDIRECTO";
export type TipoProducto = "VENTA" | "INTERMEDIO";

export interface Insumo {
  id: number;
  nombre: string;
  categoria: CategoriaInsumo;
  unidadBase: UnidadMedida;
  contenidoEnvase: string;
  precioEnvase: string;
  stockActual: string;
  stockMinimo: string;
  controlaStock: boolean; // false = «No llevar stock» (agua de la casa, limpieza)
  activo: boolean;
  costoUnitario: string;
}

export interface Producto {
  id: number;
  nombre: string;
  categoria: string;
  tipo: TipoProducto;
  rendimientoReceta: string;
  unidadRendimiento: UnidadMedida;
  precioVenta: string | null;
  activo: boolean; // sigue en el catálogo
  disponible: boolean; // sin uso desde D49: todo producto activo se vende
  costoTanda: string;
  costoUnitario: string;
  gananciaUnitaria: string | null;
  margenPorcentaje: string | null;
}

export interface LineaInsumo {
  insumoId: number;
  nombre: string;
  unidadBase: UnidadMedida;
  cantidad: string;
  costoUnitario: string;
  costo: string;
}

export interface LineaSubReceta {
  subProductoId: number;
  nombre: string;
  unidad: UnidadMedida;
  cantidad: string;
  costoUnitario: string;
  costo: string;
}

export interface CostoProducto {
  productoId: number;
  nombre: string;
  tipo: TipoProducto;
  rendimientoReceta: string;
  unidadRendimiento: UnidadMedida;
  costoTanda: string;
  costoUnitario: string;
  precioVenta: string | null;
  gananciaUnitaria: string | null;
  margenPorcentaje: string | null;
  insumos: LineaInsumo[];
  subRecetas: LineaSubReceta[];
}

export interface AlertaStock {
  insumoId: number;
  nombre: string;
  stockActual: string;
  stockMinimo: string;
  nivel: "SIN_STOCK" | "BAJO_MINIMO";
}

export interface Venta {
  id: number;
  productoId: number;
  producto: string;
  cantidad: string;
  precioUnitario: string;
  costoUnitario: string;
  totalVenta: string;
  costoTotal: string;
  gananciaBruta: string;
  estadoPago: "PAGADO" | "PENDIENTE";
  cliente: string | null;
  clienteId: string | null;
  clienteTipo: TipoCliente | null; // null = venta sin cliente registrado (minorista)
  sabores: string | null;
  pedidoId: string | null; // líneas de un mismo pedido de la Caja (D48); null = venta suelta anterior
  fechaPago: string | null;
  anulada: boolean;
  fechaAnulacion: string | null;
  motivoAnulacion: string | null;
  fecha: string;
}

export interface Pendientes {
  total: string;
  ventas: Venta[];
}

export interface VentaCreada {
  venta: Venta;
  clienteNuevo: boolean; // el nombre no existía: se guardó en Clientes
  consumo: { insumoId: number; nombre: string; cantidad: string; stockResultante: string }[];
  alertas: AlertaStock[];
}

// Pedido de la Caja con varios productos (D48): una venta por producto, mismo pedidoId.
export interface PedidoCreado {
  pedidoId: string;
  cliente: string;
  clienteNuevo: boolean;
  estadoPago: "PAGADO" | "PENDIENTE";
  fecha: string;
  ventas: Venta[];
  unidades: string;
  totalVenta: string;
  costoTotal: string;
  gananciaBruta: string;
  alertas: AlertaStock[];
}

export interface ResumenVentas {
  ventas: number;
  unidades: string;
  totalVenta: string;
  costoTotal: string;
  gananciaBruta: string;
}

export interface ListaVentas {
  resumen: ResumenVentas & { minoristas: ResumenVentas; mayoristas: ResumenVentas };
  ventas: Venta[];
}

// Los números se envían como texto para que la API los convierta a Decimal sin perder precisión.
export interface DatosInsumo {
  nombre: string;
  categoria: CategoriaInsumo;
  unidadBase: UnidadMedida;
  contenidoEnvase: string;
  precioEnvase: string;
  stockMinimo: string;
  controlaStock: boolean;
}

export interface DatosProducto {
  nombre: string;
  categoria: string;
  tipo: TipoProducto;
  rendimientoReceta: string;
  unidadRendimiento: UnidadMedida;
  precioVenta: string | null;
  activo: boolean;
}

export type Movimiento =
  | { tipo: "COMPRA"; cantidad?: string; envases?: string; precioEnvase?: string; nota?: string }
  | { tipo: "AJUSTE"; stockReal: string; nota: string };

export interface Receta {
  ingredientes: { insumoId: number; cantidad: string }[];
  subRecetas: { subProductoId: number; cantidad: string }[];
}

export interface Respaldo {
  archivo: string;
  fecha: string;
  bytes: number;
}

export interface ListaRespaldos {
  carpeta: string;
  respaldos: Respaldo[];
}


// Ventas de 2024 importadas del Excel (solo consulta). Costo y utilidad son los del Excel.
export interface VentaHistorica {
  id: number;
  fecha: string;
  fechaEstimada: boolean;
  productoOriginal: string;
  productoNombre: string;
  productoId: number | null;
  cantidad: string;
  valor: string;
  comision: string;
  costo: string | null; // null en las notas de 2026: no se conoce
  utilidad: string | null;
  cliente: string | null;
  clienteId: string | null;
  clienteTipo: TipoCliente | null;
  sabores: string | null;
}

export interface TotalesHistoricos {
  ventas: number;
  unidades: string;
  valor: string;
  comision: string;
  costo: string;
  utilidad: string;
}

export interface Historico {
  resumen: TotalesHistoricos;
  semanas: (TotalesHistoricos & { semana: string })[]; // semana = lunes AAAA-MM-DD
  productos: (TotalesHistoricos & { producto: string; productoId: number | null })[];
  ventas: VentaHistorica[];
}

export type CategoriaGasto = "LIMPIEZA" | "EQUIPAMIENTO" | "USO_PERSONAL" | "OTROS";

export interface Gasto {
  id: string;
  fecha: string;
  descripcion: string;
  monto: string;
  categoria: CategoriaGasto;
}

export interface ListaGastos {
  total: string;
  porCategoria: Record<CategoriaGasto, string>;
  gastos: Gasto[];
}

export type TipoCliente = "MINORISTA" | "MAYORISTA";

export interface Cliente {
  id: string;
  nombre: string;
  tipo: TipoCliente;
  precios: PrecioAcordado[]; // precio negociado por producto (solo mayoristas)
  celular: string | null;
  email: string | null;
  direccion: string | null;
  activo: boolean;
}

export interface PrecioAcordado {
  productoId: number;
  precio: string;
  producto: { nombre: string; precioVenta: string | null };
}

export interface DatosCliente {
  nombre: string;
  tipo: TipoCliente;
  celular: string | null;
  email: string | null;
  direccion: string | null;
}

export interface ReporteCliente {
  id: string;
  nombre: string;
  tipo: TipoCliente;
  activo: boolean;
  totalVendido: string;
  unidades: string;
  ventas: number;
  ultimoPedido: string | null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly detalles: { campo: string; mensaje: string }[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface CuerpoError {
  error?: string;
  detalles?: { campo: string; mensaje: string }[];
}

async function pedir<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`/api${ruta}`, {
      method: metodo,
      headers: cuerpo === undefined ? undefined : { "Content-Type": "application/json" },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch {
    throw new ApiError("No se pudo conectar con el servidor. ¿Está encendida la API?", 0);
  }
  if (respuesta.status === 204) return undefined as T;
  const datos: unknown = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    const error = (datos ?? {}) as CuerpoError;
    throw new ApiError(error.error ?? `Error ${respuesta.status}`, respuesta.status, error.detalles ?? []);
  }
  return datos as T;
}

export const mensajeDeError = (error: unknown): string => {
  if (error instanceof ApiError) {
    const detalle = error.detalles.map((d) => `${d.campo}: ${d.mensaje}`).join(" · ");
    return detalle ? `${error.message} ${detalle}` : error.message;
  }
  return error instanceof Error ? error.message : String(error);
};

export const api = {
  insumos: () => pedir<Insumo[]>("GET", "/insumos"),
  crearInsumo: (datos: DatosInsumo) => pedir<Insumo>("POST", "/insumos", datos),
  actualizarInsumo: (id: number, datos: Partial<DatosInsumo>) => pedir<Insumo>("PATCH", `/insumos/${id}`, datos),
  registrarMovimiento: (id: number, movimiento: Movimiento) =>
    pedir<{ insumo: Insumo; alerta: AlertaStock | null }>("POST", `/insumos/${id}/movimientos`, movimiento),
  alertas: () => pedir<AlertaStock[]>("GET", "/insumos/alertas"),

  productos: (filtro: { tipo?: TipoProducto; activo?: boolean; disponible?: boolean } = {}) => {
    const params = new URLSearchParams();
    if (filtro.tipo) params.set("tipo", filtro.tipo);
    if (filtro.activo !== undefined) params.set("activo", String(filtro.activo));
    if (filtro.disponible !== undefined) params.set("disponible", String(filtro.disponible));
    const query = params.toString();
    return pedir<Producto[]>("GET", `/productos${query ? `?${query}` : ""}`);
  },
  crearProducto: (datos: DatosProducto) => pedir<Producto>("POST", "/productos", datos),
  actualizarProducto: (id: number, datos: Partial<DatosProducto>) => pedir<Producto>("PATCH", `/productos/${id}`, datos),
  costo: (id: number) => pedir<CostoProducto>("GET", `/productos/${id}/costo`),
  guardarReceta: (id: number, receta: Receta) => pedir<CostoProducto>("PUT", `/productos/${id}/receta`, receta),

  ventas: (desde: string, hasta: string) => pedir<ListaVentas>("GET", `/ventas?desde=${desde}&hasta=${hasta}`),
  crearVenta: (venta: {
    productoId: number;
    cantidad: string;
    precioUnitario?: string; // sin él se usa el precio acordado con el cliente o el precio de venta
    fiado: boolean;
    clienteId?: string; // cliente elegido; con precio acordado para el producto, se cobra ese
    clienteNombre?: string; // sin clienteId: se busca por nombre o se crea (minorista)
    celular?: string; // obligatorio para un cliente nuevo o uno que aún no tiene celular
    sabores?: string[];
    fecha?: string; // AAAA-MM-DD; para cargar una venta de un día anterior
  }) =>
    pedir<VentaCreada>("POST", "/ventas", venta),
  pendientes: () => pedir<Pendientes>("GET", "/ventas/pendientes"),
  cobrar: (id: number) => pedir<Venta>("POST", `/ventas/${id}/cobrar`),
  crearPedido: (pedido: {
    lineas: { productoId: number; cantidad: string; precioUnitario?: string }[];
    fiado: boolean;
    clienteId?: string;
    clienteNombre?: string;
    celular?: string;
    fecha?: string;
  }) => pedir<PedidoCreado>("POST", "/ventas/pedido", pedido),
  cobrarPedido: (pedidoId: string) =>
    pedir<{ pedidoId: string; cobradas: number; total: string; cliente: string | null }>("POST", `/ventas/pedidos/${pedidoId}/cobrar`),
  anular: (id: number, motivo: string) =>
    pedir<{ venta: Venta; devuelto: { nombre: string }[] }>("POST", `/ventas/${id}/anular`, { motivo }),

  // Correcciones desde el Historial (D43).
  editarVenta: (id: number, datos: { cantidad?: string; precioUnitario?: string; fecha?: string; sabores?: string[] | null }) =>
    pedir<Venta>("PATCH", `/ventas/${id}`, datos),
  eliminarVenta: (id: number) => pedir<{ eliminada: number }>("DELETE", `/ventas/${id}`),
  editarHistorico: (
    id: number,
    datos: { fecha?: string; cantidad?: string; valor?: string; clienteId?: string | null; sabores?: string | null },
  ) => pedir<VentaHistorica>("PATCH", `/historico/${id}`, datos),
  eliminarHistorico: (id: number) => pedir<{ eliminada: number }>("DELETE", `/historico/${id}`),
  historico: (desde?: string, hasta?: string) =>
    pedir<Historico>("GET", `/historico${desde && hasta ? `?desde=${desde}&hasta=${hasta}` : ""}`),

  gastos: (desde: string, hasta: string) => pedir<ListaGastos>("GET", `/gastos?desde=${desde}&hasta=${hasta}`),
  crearGasto: (gasto: { descripcion: string; monto: string; categoria: CategoriaGasto }) =>
    pedir<Gasto>("POST", "/gastos", gasto),
  borrarGasto: (id: string) => pedir<void>("DELETE", `/gastos/${id}`),

  clientes: (filtro: { tipo?: TipoCliente } = {}) => {
    const params = new URLSearchParams();
    if (filtro.tipo) params.set("tipo", filtro.tipo);
    const query = params.toString();
    return pedir<Cliente[]>("GET", `/clientes${query ? `?${query}` : ""}`);
  },
  crearCliente: (datos: DatosCliente) => pedir<Cliente>("POST", "/clientes", datos),
  actualizarCliente: (id: string, datos: Partial<DatosCliente>) =>
    pedir<Cliente>("PATCH", `/clientes/${id}`, datos),
  fijarPrecioCliente: (clienteId: string, productoId: number, precio: string) =>
    pedir<Cliente>("PUT", `/clientes/${clienteId}/precios/${productoId}`, { precio }),
  quitarPrecioCliente: (clienteId: string, productoId: number) =>
    pedir<Cliente>("DELETE", `/clientes/${clienteId}/precios/${productoId}`),
  reporteClientes: (desde?: string, hasta?: string) => {
    const params = new URLSearchParams();
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    const query = params.toString();
    return pedir<ReporteCliente[]>("GET", `/ventas/reporte-clientes${query ? `?${query}` : ""}`);
  },
  ventasTodas: () => pedir<ListaVentas>("GET", "/ventas"),

  respaldos: () => pedir<ListaRespaldos>("GET", "/backups"),
  respaldar: () => pedir<Respaldo & { eliminados: string[] }>("POST", "/backups"),
};
