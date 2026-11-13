# Auditoría de optimización — ERP Dulzura (2026-11-13)

**Alcance**
- Código real a la fecha: backend, frontend y esquema Prisma.
- Workflow n8n `U1O3WGzcmYgvuZIm` (58 nodos) y Postgres «ventas».
- Puertos de la PC.
- Base de datos real, solo lectura.

**Cómo se midió**
- `npm run typecheck` sin errores.
- 101/101 tests.
- `npm audit`.
- Tiempos de respuesta con `curl` contra el ERP encendido.
- Caja a 375 px en el navegador.

**Datos actuales**
- 39 productos (32 de venta y 7 rellenos), 19 ventas del ERP, 135 ventas históricas y 589 movimientos de inventario.
- Hoy todas las listas responden en menos de 40 ms. Por eso los hallazgos de rendimiento son de severidad media: preparan el ERP para cuando haya meses de datos, no arreglan una lentitud que ya exista.

Reglas respetadas:
- No se propone cambiar el stack ni reescribir nada.
- Ninguna solución introduce `any`.
- Los costos siguen en `Prisma.Decimal`.
- No se toca lógica acordada con la dueña (D1–D98).

---

## 1. 🔴 Rendimiento

### [RENDIMIENTO] R1 · Las listas de Pedidos y Atención leen de la base el comprobante en base64 de cada fila y luego lo descartan
Archivo: backend/src/routes/pedidos.ts (líneas 183–186, 302–318); backend/src/routes/atenciones.ts (líneas 63, 138–153)
Severidad: 🟡 Media
Problema: `include: conDetalle` trae **todos** los campos escalares, incluidos `Pedido.comprobante` y `Atencion.adjunto`. Cada uno puede pesar hasta 14 MB (`comprobante`, línea 84). Luego `plano` y `plana` los quitan en JavaScript, pero ya se leyeron de SQLite y se copiaron a memoria. El historial trae hasta 100 pedidos o 100 atenciones resueltas. Estas listas se piden en cada aviso en vivo (D88) y en cada pantalla.
Evidencia:
```ts
// pedidos.ts 311-316
await prisma.pedido.findMany({ where: { estado: { in: TERMINADOS } }, include: conDetalle, take: 100 });
// 183: const plano = ({ lineas, comprobante: archivo, ...pedido }) => ({ ...pedido, tieneComprobante: archivo !== null, … })
```
Solución propuesta: usar un `select` explícito sin el archivo. Para saber si hay archivo, leer solo ese dato aparte o guardar una columna booleana:
```ts
const sinArchivo = { comprobante: false } as const; // Prisma 6: omit
await prisma.pedido.findMany({ where, include: conDetalle, omit: sinArchivo });
// y para el indicador: columna `tieneComprobante Boolean @default(false)` que se marca al guardar el pago
```
Prisma 6.16 ya trae `omit` como función estable. El ahorro llega a cientos de MB cuando hay varios comprobantes en el historial.
Riesgo de cambiarlo: los campos `tieneComprobante` y `tieneAdjunto` que usa la pantalla. Requiere una migración (la columna booleana) y rellenar las filas existentes.
Esfuerzo estimado: Pequeño (<1h)

### [RENDIMIENTO] R2 · `GET /api/productos` calcula el costo con N+1 consultas y repite el de los rellenos compartidos
Archivo: backend/src/routes/productos.ts (líneas 50–65); backend/src/services/costeo.ts (líneas 54–99)
Severidad: 🟡 Media
Problema: por cada producto, `resumenConCosto` llama a `calcularCostoProducto`. Esa función hace un `findUnique` y otro por cada sub-receta, de forma recursiva. Con 39 productos son ~50 consultas, y un relleno usado por 5 productos se recalcula 5 veces. La pantalla de Caja, la de Pedidos y Recetas usan esta lista, y también **n8n en cada mensaje de WhatsApp** («Leer catálogo (ERP)»).
Evidencia:
```ts
res.json(await Promise.all(productos.map(resumenConCosto))); // 1 + N + sub-recetas consultas
const sub = await calcularCostoProducto(db, subProducto.id, [...ruta, productoId]); // sin memoria
```
Solución propuesta: un caché por petición que se pasa como parámetro, sin caché global (así nunca queda un precio viejo). Todo sigue en `Decimal`:
```ts
export async function calcularCostoProducto(db: Db, productoId: number, ruta: readonly number[] = [],
  memo: Map<number, Promise<CostoProducto>> = new Map()): Promise<CostoProducto> {
  if (ruta.includes(productoId)) throw new AppError(422, …);
  const listo = memo.get(productoId);
  if (listo) return listo;
  const calculo = calcularSinMemo(db, productoId, ruta, memo);
  memo.set(productoId, calculo);
  return calculo;
}
// productos.ts: const memo = new Map(); productos.map((p) => resumenConCosto(p, memo))
```
La detección de ciclos no cambia (`ruta`). Un paso más es cargar en una sola consulta todos los `ingredientes` y `subRecetas` y calcular en memoria.
Riesgo de cambiarlo: bajo. Los tests de costeo (D60, sub-recetas, ciclos) lo cubren.
Esfuerzo estimado: Pequeño (<1h)

### [RENDIMIENTO] R3 · Cada venta de la Caja lee todos los clientes para buscar uno por nombre
Archivo: backend/src/routes/ventas.ts (línea 115)
Severidad: 🟢 Baja
Problema: `resolverCliente` hace `tx.cliente.findMany()` sin filtro ni `select` (todas las columnas) y compara en memoria con `normalizarNombre`. Lo hace dentro de la transacción de cada venta. Hoy son ~60 clientes; crece con cada cliente nuevo de WhatsApp.
Evidencia: `((await tx.cliente.findMany()).find((c) => normalizarNombre(c.nombre) === normalizarNombre(clienteNombre ?? "")) ?? null)`
Solución propuesta: guardar una columna `nombreNormalizado String @unique`, que además impone D45 (sin nombres repetidos) en la base, y buscar con `findUnique`. Si se prefiere no migrar, al menos usar `select: { id: true, nombre: true, … }`.
Riesgo de cambiarlo: requiere migración y rellenar la columna. El 409 de nombre repetido pasaría a salir por P2002.
Esfuerzo estimado: Mediano (1–4h)

### [RENDIMIENTO] R4 · `useDatos` no cancela respuestas viejas: una recarga lenta puede pisar una más nueva
Archivo: frontend/src/hooks/useDatos.ts (líneas 14–26)
Severidad: 🟡 Media
Problema: con los avisos en vivo (D88), Pedidos y Atención llaman a `recargar()` varias veces seguidas: un pago por WhatsApp avisa a `pedidos` y a `atenciones`, y al confirmar se avisa otra vez. Si la primera respuesta llega después de la segunda, la pantalla queda con datos viejos. Además se llama a `setEstado` aunque la pantalla ya se haya cerrado.
Evidencia:
```ts
const recargar = useCallback(async () => {
  setEstado((previo) => ({ ...previo, cargando: true }));
  const datos = await cargar();          // sin turno ni AbortController
  setEstado({ datos, error: null, cargando: false });
}, deps);
```
Solución propuesta: un contador de turnos y una marca de «montado»:
```ts
const turno = useRef(0);
const recargar = useCallback(async () => {
  const mio = ++turno.current;
  …const datos = await cargar();
  if (mio === turno.current) setEstado({ datos, error: null, cargando: false });
}, deps);
useEffect(() => () => { turno.current++; }, []);
```
Riesgo de cambiarlo: ninguno visible. Corrige parpadeos.
Esfuerzo estimado: Pequeño (<1h)

### [RENDIMIENTO] R5 · Un aviso en vivo hace que Pedidos pida 3 listas completas
Archivo: frontend/src/pantallas/Pedidos.tsx (líneas 56–60)
Severidad: 🟢 Baja
Problema: `useAlAvisar(() => void recargar(), "pedidos")` vuelve a pedir `proximos`, `historial` (100 pedidos) y `clientes` (todos, con precios), aunque la pestaña visible sea solo una. Cada comprobante que llega por WhatsApp dispara el aviso.
Evidencia: `await Promise.all([proximos.recargar(), historial.recargar(), clientes.recargar()]);`
Solución propuesta: recargar solo la pestaña visible (`vista`). `clientes` ya no hace falta aquí desde D98: solo lo usaba el formulario de *crear*, ahora inalcanzable (ver M3).
Riesgo de cambiarlo: el historial tendría que recargarse al cambiar de pestaña.
Esfuerzo estimado: Pequeño (<1h)

### Sin hallazgos (rendimiento)
- **SSE `/api/eventos`** (eventos.ts 31–46): limpia el `setInterval` y el listener en `close`. El latido de 25 s es razonable para conexiones locales. No hay fuga.
- **`VACUUM INTO`** (backup.ts 98): la base pesa 1,1 MB y el respaldo tarda milisegundos. No bloquea de forma perceptible.
- **Paginación de `/api/ventas` y `/api/historico`**: filtran por rango de fechas y el historial son 19 filas. Paginar hoy no aporta. Revisar si las ventas pasan de ~20 000.

---

## 2. 🟠 Seguridad y validación

### [SEGURIDAD] S1 · El filtro de comprobantes acepta SVG: un «comprobante» con código se ejecutaría dentro del ERP al abrirlo
Archivo: backend/src/routes/pedidos.ts (línea 85); frontend/src/pedidos.ts (líneas 36–48)
Severidad: 🔴 Crítica
Problema: la regex `image\/[a-z+.-]+` deja pasar `data:image/svg+xml`. Un SVG puede llevar `<script>`. El camino es este:
1. Un cliente manda por WhatsApp un archivo `.svg` como documento.
2. «Normalizar mensaje» lo trata como imagen y n8n lo reenvía como `comprobante`.
3. Queda guardado en `Atencion.adjunto`.
4. Cuando la dueña toca «Ver comprobante», `abrirArchivo` abre un `blob:` con ese tipo en una pestaña nueva.

Ese `blob:` tiene el **mismo origen que el ERP**, así que el script puede llamar a toda la API: borrar ventas, confirmar pagos, etc.
Evidencia:
```ts
.regex(/^data:(image\/[a-z+.-]+|application\/pdf);base64,/i, …)   // acepta image/svg+xml
const archivo = await (await fetch(dataUrl)).blob(); ventana.location.href = URL.createObjectURL(archivo);
```
Solución propuesta: lista blanca de tipos en el backend, y en el frontend forzar el tipo al abrir:
```ts
.regex(/^data:(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf);base64,/i, "…")
// pedidos.ts (frontend): si el blob.type no está en la lista, descargarlo en vez de abrirlo
const SEGUROS = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);
```
Riesgo de cambiarlo: un comprobante en un formato raro (heic) quedaría rechazado si no se incluye. El test D86 sigue pasando (usa png).
Esfuerzo estimado: Pequeño (<1h)

### [SEGURIDAD] S2 · El ERP, n8n, Evolution y Postgres escuchan en toda la red, y la API no pide clave
Archivo: backend/src/server.ts (línea 8); app.ts (sin autenticación); contenedores Docker
Severidad: 🟠 Alta
Problema: `listen(PUERTO)` abre el puerto en `0.0.0.0` y `::`. Lo comprobé con `netstat`: 3000, 5678, 8080 y 5432 están `LISTENING` en todas las interfaces. Cualquier equipo en el mismo WiFi del local podría:
- Usar `DELETE /api/ventas/:id`.
- Usar `POST /api/pedidos/pago-whatsapp`.
- Llamar al webhook `dulzura-envio` de n8n, que **manda un WhatsApp desde el número del negocio** con texto armado con lo que reciba (`nombre`, `lineas`).

Que lo frene o no depende del firewall de Windows. En el `.exe` con Electron, el ERP debería escuchar solo en esta PC.
Evidencia: `TCP 0.0.0.0:3000 LISTENING` · `n8n 0.0.0.0:5678->5678/tcp` · `postgres 0.0.0.0:5432->5432/tcp`
Solución propuesta:
1. `createApp().listen(PUERTO, process.env.HOST ?? "127.0.0.1")`. Hay que probar que n8n en Docker llega por `host.docker.internal`; si no, usar `HOST=0.0.0.0` solo con el punto 2.
2. Una clave compartida para lo que llama n8n: `pago-whatsapp`, `POST /atenciones`, `POST /pedidos?origen=WHATSAPP`, `costo-envio`. Un middleware que compare `x-dulzura-clave` con `process.env.CLAVE_AGENTE`. En n8n, una credencial «Header Auth» igual a la de Evolution.
3. En Docker, publicar los puertos como `127.0.0.1:5678:5678` (y lo mismo con 8080 y 5432). Al webhook `dulzura-envio`, ponerle «Header Auth».
Riesgo de cambiarlo: si se olvida la clave en un nodo HTTP de n8n, el agente deja de registrar. Los tests tendrían que mandar la cabecera.
Esfuerzo estimado: Mediano (1–4h)

### [SEGURIDAD] S3 · `pago-whatsapp` calcula saldo y faltante con `number`, no con `Decimal`
Archivo: backend/src/routes/pedidos.ts (líneas 158, 339, 360–365, 463)
Severidad: 🟡 Media
Problema: la verificación anti-estafas (D94–D96) suma montos de comprobantes con `Number(...)` y redondea a mano (`Math.round(x * 100) / 100`). Esto rompe la regla 2 de TECH.md. Con montos de 2 decimales casi siempre da bien, pero sumar varios parciales (0,1 + 0,2…) puede dejar un faltante de Bs 0,01 fantasma. La tolerancia `+ 0.01` está para tapar eso.
Evidencia:
```ts
const yaPago = otros.reduce((t, a) => t + Number(a.montoReportado ?? 0), 0);
const saldo = total !== null ? Math.max(Math.round((total - yaPago) * 100) / 100, 0) : null;
```
Solución propuesta: `monto: decimalNoNegativo.nullable().optional()` en el esquema, y toda la cuenta con `Prisma.Decimal` (`add`, `sub`, `lt`, `gt`). Convertir a `number` solo en la respuesta para n8n.
Riesgo de cambiarlo: los tests D86–D96 lo cubren y hay que ajustar las comparaciones.
Esfuerzo estimado: Mediano (1–4h)

### [SEGURIDAD] S4 · Cuerpo JSON de 15 MB para toda la API, con una alerta alta de Zod
Archivo: backend/src/app.ts (línea 22); package.json (`zod 3.24.1`)
Severidad: 🟡 Media
Problema:
- `express.json({ limit: "15mb" })` se aplica a todas las rutas, aunque solo los comprobantes (`/pedidos/pago-whatsapp`, `/pedidos/:id/pago`) lo necesitan.
- `npm audit` marca a `zod` (dependencia directa, en uso) con «exhaust memory while validating oversized constrained collections». Un JSON grande con arreglos enormes, por ejemplo `lineas`, consume memoria antes de que `.max(40)` lo corte.

Evidencia: `app.use(express.json({ limit: "15mb" }));` · `zod <4.6.6 Severity: high`
Solución propuesta: `express.json({ limit: "100kb" })` global, y un `express.json({ limit: "15mb" })` montado solo en las dos rutas de comprobante. Esto mitiga la alerta de Zod sin tener que migrar a Zod 4 ahora.
Riesgo de cambiarlo: si otra ruta manda archivos, falla con 413. Hoy solo esas dos los mandan.
Esfuerzo estimado: Pequeño (<1h)

### [SEGURIDAD] S5 · `normalizarNombre` no unifica guiones ni puntos
Archivo: backend/src/validacion.ts (líneas 59–65)
Severidad: 🟢 Baja
Problema: «María-José» y «María José», o «Dra. Ana» y «Dra Ana», cuentan como clientes distintos. Esto rompe la intención de D45 (sin repetidos). Por otro lado, la ñ se pierde al normalizar (NFD): «Muñoz» y «Munoz» quedan iguales, que está bien.
Evidencia: `.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase()`
Solución propuesta: agregar `.replace(/[.\-_'’]/g, " ")` antes de unificar espacios.
Riesgo de cambiarlo: dos clientes que hoy existen por separado chocarían al editarse. Conviene revisar los duplicados con una consulta antes.
Esfuerzo estimado: Pequeño (<1h)

### Sin hallazgos (seguridad)
- **Validación Zod**: todos los `req.body` pasan por `.parse()`. Los `req.params` usan `parseId` o `idSchema`. La única lectura sin Zod es `req.query.confirmado === "no"` (pedidos.ts 682), y es una comparación exacta, así que es segura.
- **Inyección en notas, gastos y ubicaciones**: no hay `dangerouslySetInnerHTML` ni `innerHTML`. React escapa todo el texto. `enlaceMapa` solo deja pasar `http(s)://`; cualquier otra cosa va a una búsqueda de Maps con `encodeURIComponent`.
- **Base64 en memoria**: JavaScript lo libera solo cuando termina la petición. El costo real es que queda **guardado** en SQLite (ver B3).

---

## 3. 🟡 Mantenibilidad y deuda técnica

### [MANTENIBILIDAD] M1 · La verificación anti-estafas (≈220 líneas) vive dentro de la ruta
Archivo: backend/src/routes/pedidos.ts (líneas 326–549)
Severidad: 🟡 Media
Problema: `POST /pago-whatsapp` mezcla tres cosas:
- Las consultas.
- Las reglas D91–D96: fecha de hoy, destino, estado, edición, referencia, fraccionados, reemplazo de tarjeta.
- El texto para la dueña.

Es la lógica más delicada del sistema y solo se puede probar levantando el servidor. `pedidos.ts` llega a 896 líneas.
Evidencia: `pedidosRouter.post("/pago-whatsapp", async (req, res) => { … 220 líneas … })`
Solución propuesta: llevarla a `services/comprobantes.ts`:
- Una función **pura** `evaluarComprobante(leido, contexto) → { rechazos, revision, faltante, … }`, sin Prisma.
- Una función `redactarDescripcion(resultado)`.

La ruta queda con las consultas y la escritura. Así la regla de oro y los fraccionados se prueban con tests unitarios rápidos.
Riesgo de cambiarlo: es un refactor sin cambio de comportamiento. Los 12 tests de D86–D96 lo protegen.
Esfuerzo estimado: Mediano (1–4h)

### [MANTENIBILIDAD] M2 · `registrarPedidoVenta` y `pagarPedido` crecieron con banderas booleanas posicionales
Archivo: backend/src/routes/ventas.ts (líneas 298–303); backend/src/routes/pedidos.ts (líneas 230–236)
Severidad: 🟢 Baja
Problema: llamadas como `registrarPedidoVenta(tx, datos, exigirCelular, descontarStock)` o `registrarVentaDelPedido(tx, pedido, exigirCelular, yaEnCocina)` no se leen bien: `(tx, x, false, true)` no dice qué es cada booleano. Además, `registrarPedidoVenta` (lógica de negocio) está exportada desde una **ruta** y `pedidos.ts` la importa.
Evidencia: `export async function registrarPedidoVenta(tx, datos, exigirCelular = true, descontarStock = true)`
Solución propuesta: un objeto de opciones `{ exigirCelular, descontarStock }` y mover la función a `services/ventas.ts`.
Riesgo de cambiarlo: bajo, porque es un cambio de firma que revisa TypeScript.
Esfuerzo estimado: Pequeño (<1h)

### [MANTENIBILIDAD] M3 · Desde D98 la rama «crear» de `FormularioPedido` es código muerto
Archivo: frontend/src/pantallas/Pedidos.tsx (líneas 658–984; en especial 673–697, 744–760 y 944–973)
Severidad: 🟡 Media
Problema: el formulario ya solo se abre con un pedido existente (`setFormulario({ pedido: p })`). Quedaron sin uso:
- El buscador de cliente.
- `tipoNuevo`.
- `pagoNuevo` y el bloque «¿Ya pagó?».
- `crearPedidoEntrega`.

Son ~120 líneas, y la misma interfaz quedó duplicada en `Caja.tsx`.
Evidencia: `const [pagoNuevo, setPagoNuevo] = useState<MetodoPago | "NO">("QR");` y `{!pedido && ( … )}` nunca se muestran.
Solución propuesta: que `pedido` sea obligatorio (`pedido: Pedido`) y borrar las ramas `!pedido`. El componente pasa a ser `EditarPedido`.
Riesgo de cambiarlo: ninguno visible. TypeScript marca lo que sobre.
Esfuerzo estimado: Pequeño (<1h)

### [MANTENIBILIDAD] M4 · Dos recorridos de la receta que deben coincidir: costeo e inventario
Archivo: backend/src/services/costeo.ts (líneas 74–105); backend/src/services/inventario.ts (líneas 13–41)
Severidad: 🟢 Baja
Problema: la regla D60 (los empaques van por lo vendido; los ingredientes van × `unidadesPorVenta` ÷ rendimiento) está escrita dos veces. Hoy coinciden. Si una cambia sin la otra, el costo mostrado y el descuento de stock se separan sin que nada avise.
Evidencia: `esVenta && insumo.categoria === CategoriaInsumo.EMPAQUE` aparece en los dos archivos.
Solución propuesta: un `recorrerReceta(db, productoId, visitar)` común, o al menos un test que compare `costo = Σ consumo × costoUnitario` para cada producto del seed.
Riesgo de cambiarlo: bajo, si se hace con el test de equivalencia primero.
Esfuerzo estimado: Mediano (1–4h)

### [MANTENIBILIDAD] M5 · Archivos muy largos y CSS de botones-opción duplicado
Archivo: Pedidos.tsx (984), Historial.tsx (927), pedidos.ts (896), Recetas.tsx (871), Caja.tsx (648); Pedidos.css 336–356 y Caja.css 344–371
Severidad: 🟢 Baja
Problema: cinco archivos pasan las 600 líneas. Los botones segmentados («Recoge / Delivery», «¿Ya pagó?») tienen dos estilos casi iguales: `.pedido-form__opcion` y `.caja__tipo-opcion`.
Evidencia: `wc -l` de arriba. Las dos clases definen borde, fondo `--color-surface` y estado activo `--color-primary-soft`.
Solución propuesta:
- Un componente `<Opciones valor onChange opciones />` en `components/ui` con su CSS. Quedaría `role="radiogroup"` con flechas ← → (ver U3).
- Partir `Pedidos.tsx` en `TarjetaPedido.tsx`, `EditarPedido.tsx` e `HistorialPedidos.tsx`.

Riesgo de cambiarlo: solo visual. Conviene una revisión con capturas.
Esfuerzo estimado: Mediano (1–4h)

### [MANTENIBILIDAD] M6 · Restos sueltos: TODO, archivo de pruebas en la raíz y `Producto.disponible` sin uso
Archivo: frontend/src/components/dashboard/indicadores.ts (líneas 5–6); scratch_q.mts (raíz); schema.prisma (`disponible`)
Severidad: 🟢 Baja
Problema:
- Queda un `// TODO: Conectar con módulo de gastos fijos` (ver D3).
- `scratch_q.mts` es un script de consulta suelto en la raíz, sin seguimiento en git.
- TECH.md ya dice que `Producto.disponible` «queda sin uso desde D49», pero sigue en el esquema y en el filtro `GET /productos`.

Evidencia: `export const GASTOS_FIJOS_MENSUALES = 300; // Bs, valor de prueba`
Solución propuesta: borrar `scratch_q.mts`, resolver el TODO con D3 y quitar `disponible` en una migración cuando se toque el esquema.
Riesgo de cambiarlo: ninguno.
Esfuerzo estimado: Pequeño (<1h)

### Sin hallazgos (mantenibilidad)
- **`any`**: no hay ninguno en backend, frontend ni scripts.
- **Nombres**: `fechaEntrega` y `fecha` son los dos camelCase. `clienteRegistrado` (relación) frente a `cliente` (texto de la venta) está documentado en TECH.md (D42), así que no cambiarlo. `pedidoId` y `pedidoNumero` son cosas distintas a propósito (D94: la dueña no ve números de pedido).
- **Tests**: los 101 son de integración contra la API real y prueban comportamiento (respuestas, estados, saldos), no implementación.

---

## 4. 🟢 UX / UI

### [UX] U1 · «Llegó el pago» en Atención no pide confirmación, y desde D97 además escribe al cliente
Archivo: frontend/src/pantallas/Atenciones.tsx (líneas 152–179, 315–322)
Severidad: 🟠 Alta
Problema: un solo toque hace cuatro cosas: registra la venta, agenda el pedido, cierra la tarjeta y **manda un WhatsApp al cliente** («ya está agendado»). Un toque por error, por ejemplo en la tablet, no se deshace del todo: la venta se puede anular, pero el mensaje ya salió. En Pedidos el mismo paso sí pide confirmación (`setConfirmar("pagar")`, Pedidos.tsx 500).
Evidencia: `onClick={() => void confirmarPago(a)}`
Solución propuesta: el mismo patrón de Pedidos, en dos pasos: «Llegó el pago» → «¿Confirmas Bs 80? Se registra la venta y se le avisa al cliente» → [Sí, confirmar] [Cancelar].
Riesgo de cambiarlo: un toque más para la dueña.
Esfuerzo estimado: Pequeño (<1h)

### [UX] U2 · En el celular, el botón «Registrar» de la Caja queda debajo de toda la lista
Archivo: frontend/src/pantallas/Caja.css (línea 52, una columna bajo 1200 px); Caja.tsx 309–460
Severidad: 🟢 Baja
Problema: a 375 px no hay desbordamiento horizontal (`scrollWidth` 375), pero después de elegir sabores hay que bajar más allá de 11 sabores y del panel Cliente para ver el total y registrar.
Evidencia: captura a 375 px. Las familias y los sabores ocupan toda la primera pantalla.
Solución propuesta: bajo 1200 px, una barra fija abajo con «N productos · Bs X · Ir al pedido» que lleve al panel del pedido.
Riesgo de cambiarlo: solo visual.
Esfuerzo estimado: Pequeño (<1h)

### [UX] U3 · Los botones de opción tienen `role="radio"` pero no se manejan con flechas
Archivo: Caja.tsx (los cuatro grupos `caja__tipo-nuevo`), Pedidos.tsx 832–853 y 945–973
Severidad: 🟢 Baja
Problema: con `role="radiogroup"` y `role="radio"`, un lector de pantalla espera moverse con ← → y que solo la opción elegida reciba el foco con Tab. Hoy cada botón es una parada de Tab y las flechas no hacen nada. La Caja sí tiene teclado en los sabores (Enter y Espacio, `teclaFila`).
Evidencia: `<button type="button" role="radio" aria-checked={…}>` sin `tabIndex` ni `onKeyDown`.
Solución propuesta: el componente `<Opciones>` de M5, con `tabIndex={elegido ? 0 : -1}` y flechas.
Riesgo de cambiarlo: ninguno.
Esfuerzo estimado: Pequeño (<1h)

### [UX] U4 · Los errores de validación muestran rutas técnicas
Archivo: frontend/src/api.ts (líneas 413–419); backend/src/validacion.ts (líneas 5–17)
Severidad: 🟢 Baja
Problema: un error de Zod llega como «Datos inválidos. lineas.0.cantidad: Debe ser un número válido.», o como «Tipo inválido: se esperaba number». La dueña no sabe qué es `lineas.0`.
Evidencia: ``const detalle = error.detalles.map((d) => `${d.campo}: ${d.mensaje}`)``
Solución propuesta: un diccionario `campo → etiqueta` («lineas.N.cantidad» → «Cantidad del producto N+1») y, si no hay etiqueta, mostrar solo el mensaje.
Riesgo de cambiarlo: ninguno.
Esfuerzo estimado: Pequeño (<1h)

### Sin hallazgos (UX)
- **Estados de carga, error y vacío**: Pedidos, Atención, Caja e Inicio tienen `<Cargando />`, `<Aviso tipo="error">` y un panel vacío con texto.
- **Doble envío**: los botones de Pedidos y Atención se desactivan con `ocupado` mientras esperan.
- **Mensajes del servidor**: todos en español (`AppError`, 404 «Ruta no encontrada», 409 y 500 con texto).

---

## 5. 🔵 Agente de WhatsApp (n8n)

### [N8N] N1 · La memoria del chat no se borra nunca, y un cliente que vuelve recibe el contexto de su cotización vieja
Archivo: n8n «Memoria por cliente» (`dulzura_chat_memoria`, `contextWindowLength: 16`)
Severidad: 🟡 Media
Problema: la tabla crece con cada cliente y no hay limpieza (hoy 2 sesiones y 88 kB). Peor: un cliente que vuelve al mes recibe como contexto los últimos 16 mensajes de su pedido anterior. Eso incluye montos, fechas y comprobantes que ya no aplican, y puede confundir al agente. Este mes la memoria se borró a mano varias veces por ese motivo.
Evidencia: no hay ningún nodo ni tarea que borre de `dulzura_chat_memoria`. `Guardar mensaje` sí limpia `dulzura_mensajes_pendientes` (> 10 min).
Solución propuesta: agregar una fecha a la tabla y un workflow pequeño con «Schedule Trigger» (diario, 3:00) que borre las sesiones sin mensajes en 7 días:
```sql
ALTER TABLE dulzura_chat_memoria ADD COLUMN IF NOT EXISTS creado timestamptz NOT NULL DEFAULT now();
DELETE FROM dulzura_chat_memoria
WHERE session_id IN (SELECT session_id FROM dulzura_chat_memoria
                     GROUP BY session_id HAVING max(creado) < now() - interval '7 days');
```
El `DELETE` también podría ir en el CTE de «Guardar mensaje», como ya se hace con los pendientes.
Riesgo de cambiarlo: un cliente que retoma una cotización después de 7 días empieza de cero. Por D89, la cotización sigue en el ERP de todas formas.
Esfuerzo estimado: Pequeño (<1h)

### [N8N] N2 · Sin «Error Workflow»: si una ejecución falla, nadie se entera
Archivo: workflow `U1O3WGzcmYgvuZIm` → `settings` (`{executionOrder, availableInMCP, binaryMode}`, sin `errorWorkflow`)
Severidad: 🟡 Media
Problema: esta semana hubo dos fallas silenciosas:
- El ERP estaba apagado y el comprobante real no se registró.
- Gemini respondió 503 y el agente quedó mudo.

Las dos se encontraron porque la dueña probó con su número. Ya se agregaron reintentos, un modelo de respaldo y un aviso al cliente, pero nadie avisa a la **dueña**.
Evidencia: `print(w.get('settings'))` → sin `errorWorkflow`.
Solución propuesta: un workflow con «Error Trigger» que mande por Evolution un WhatsApp al número de la dueña (`configuracion_pago.whatsapp_vendedora`, hoy vacío): «El agente falló con <nodo>: <mensaje>». También se puede crear una Atención `OTRO` vía API.
Riesgo de cambiarlo: ninguno. Hay que cargar el número de la dueña.
Esfuerzo estimado: Pequeño (<1h)

### [N8N] N3 · Cada mensaje de WhatsApp lee todos los clientes y todo el catálogo con costeo
Archivo: n8n «Leer clientes (ERP)» y «Leer catálogo (ERP)»; «Preparar contexto»
Severidad: 🟢 Baja
Problema: por mensaje se descargan 16 kB de clientes (todos, con sus precios) y 15 kB de productos (con el N+1 de R2), solo para encontrar **un** cliente por celular.
Evidencia: `url: http://host.docker.internal:3000/api/clientes` y luego `clientes.find((c) => … ultimos8(c.celular) === ultimos8(msg.whatsapp))`.
Solución propuesta: `GET /api/clientes/por-celular/:celular` (con `claveCelular`) y dejar el catálogo en caché dentro de n8n (static data con TTL de 5 min), o resolverlo con R2.
Riesgo de cambiarlo: es un endpoint nuevo y hay que cambiar un nodo.
Esfuerzo estimado: Pequeño (<1h)

### [N8N] N4 · `SOLO_NUMEROS_DE_PRUEBA` está escrito dentro del código del nodo
Archivo: n8n «Normalizar mensaje» (`const SOLO_NUMEROS_DE_PRUEBA = ['61317418'];`)
Severidad: 🟢 Baja
Problema: está documentado en PROGRESS.md («Antes de producción, vaciar…»), pero para pasar a producción hay que editar código JavaScript en n8n. Si se olvida, el agente ignora a **todos** los clientes reales sin dar ningún error.
Evidencia: línea 13 del jsCode de «Normalizar mensaje».
Solución propuesta: moverlo a `configuracion_pago` (columna `numeros_prueba text[]`) o a una variable de n8n, y que el ERP muestre un aviso en Inicio mientras esté activo («Agente en modo prueba: solo atiende 61317418»).
Riesgo de cambiarlo: ninguno.
Esfuerzo estimado: Pequeño (<1h)

### Sin hallazgos (n8n)
- **Mensajes duplicados de Evolution**: «Descartar mensajes repetidos» (`removeItemsSeenInPreviousExecutions` por `message_id`, `historySize 5000`) ya lo resuelve.
- **Modelo**: `gemini-3.1-flash-lite` es el más barato de la familia y alcanza para la tarea. El respaldo `gemini-2.5-flash` solo actúa ante un 503. No hay motivo para cambiar.
- **Reintentos**: n8n solo ofrece una espera fija (3 × 5 s), no exponencial. Con el modelo de respaldo, eso alcanza.
- **Nodos redundantes**: no encontré ninguno que sobre. «¿Respuesta fija?» ahorra llamadas a la IA en saludos y menú.

---

## 6. 🟣 Base de datos (Prisma + SQLite)

### [BD] B1 · `Atencion` no tiene índice en `pedidoId` ni en `referencia`, que la verificación de pagos usa siempre
Archivo: database/prisma/schema.prisma (líneas 366–388); pedidos.ts 349–356 y 424–432
Severidad: 🟢 Baja
Problema:
- `pago-whatsapp` busca `where: { pedidoId, estado, motivo }` y `where: { referencia, estado, motivo }`. Ninguno de esos campos tiene índice, así que SQLite recorre la tabla entera.
- El índice `[celular, estado]` no sirve para `celular: { endsWith }` (un `LIKE '%…'`).

Hoy hay 2 filas. Con un año de chats, cada comprobante recorre miles.
Evidencia: `@@index([estado, createdAt])` y `@@index([celular, estado])`, nada más.
Solución propuesta: `@@index([pedidoId, estado])` y `@@index([referencia])`. Para el celular, guardar `claveCelular` (los últimos 8 dígitos) en su propia columna con índice y buscar por igualdad. Lo mismo en `Cliente.celular`.
Riesgo de cambiarlo: es una migración aditiva, sin riesgo.
Esfuerzo estimado: Pequeño (<1h)

### [BD] B2 · Hay pedidos de demostración mezclados con los reales, y sus ventas suman en Caja y Desempeño
Archivo: base `dulzura.db` (`Pedido.esDemo`); database/prisma/demo-pedidos.ts
Severidad: 🟠 Alta
Problema: 11 de los 13 pedidos son de demostración (`esDemo = 1`). Sus ventas (**13 ventas, Bs 834**) están en `Venta` y cuentan en la caja, la ganancia, el punto de equilibrio y Desempeño como si fueran reales.
Evidencia: `select count(*), sum(totalVenta) from Venta where pedidoId in (select ventaPedidoId from Pedido where esDemo=1)` → `13 | 834`
Solución propuesta: antes de entregar, correr `npm run demo:pedidos:borrar` (con respaldo previo). Si la demo sigue haciendo falta para la defensa, que las pantallas de totales excluyan las ventas de pedidos demo, o cargar la demo en una base aparte.
Riesgo de cambiarlo: borra datos de ejemplo que quizá se usen en la presentación.
Esfuerzo estimado: Pequeño (<1h)

### [BD] B3 · Los comprobantes se guardan como base64 dentro de SQLite
Archivo: schema.prisma (`Pedido.comprobante`, `Atencion.adjunto`)
Severidad: 🟢 Baja
Problema: cada comprobante ocupa ~1,33 veces su tamaño dentro de la base. Hoy el respaldo comprimido pasó de 67 kB a 375 kB solo por los PDF de prueba. Con un año de pagos por QR, la base y **cada respaldo diario** se agrandan, y eso también se sube a Drive.
Evidencia: los respaldos `11-03-03.db.gz` (67 kB, sin adjuntos) y `10-55-44.db.gz` (375 kB, con 2 PDF).
Solución propuesta: guardar los archivos en `datos/comprobantes/<id>.<ext>` y en la base solo la ruta (la carpeta va al respaldo como .zip aparte). Como paso intermedio: al resolver una Atención, quitarle el `adjunto` si el pedido ya guardó su `comprobante` (hoy queda duplicado en las dos tablas).
Riesgo de cambiarlo: cambia cómo se sirven y se respaldan los archivos. El paso intermedio es de riesgo bajo.
Esfuerzo estimado: Grande (>4h) · paso intermedio: Pequeño

### Sin hallazgos (BD)
- **Los índices pedidos en la consigna ya existen**: `Venta.fecha`, `Venta.clienteId`, `Venta.pedidoId`, `Pedido(estado, fechaEntrega)` y `MovimientoInventario(insumoId, fecha)`.
- **`onDelete`**: correcto según el dominio. Receta → `Cascade`; insumo o sub-receta en uso → `Restrict`; cliente de una venta → `SetNull`; pedido → `Restrict` hacia el cliente.
- **Enums huérfanos**: los valores guardados de `estado`, `motivo`, `categoria`, `tipo` y `metodoPago` están todos en el esquema.
- **`VentaHistorica.hoja/fila`**: no quitarlos. Forman la clave `@@unique([hoja, fila, linea])` que hace idempotente la importación (D41); la API ya no los devuelve.
- **Consolidar migraciones (27)**: no recomendado. La base de la dueña ya las tiene aplicadas, y aplanarlas obliga a un `migrate resolve` manual.

---

## 7. ⚪ Dominio

### [DOMINIO] D1 · La retención de respaldos por cantidad se come la historia cuando hay respaldos manuales
Archivo: backend/src/services/backup.ts (líneas 36–39, 110–115)
Severidad: 🟡 Media
Problema: se guardan los 30 **más recientes**, sin importar el día. Antes de cada migración o limpieza se corre `npm run backup` (hoy fueron 6), y el automático se suma una vez al día. En una semana de trabajo intenso, los 30 respaldos cubren solo esos días y se pierde el de hace un mes. Hoy ya se borró uno antiguo por esto.
Evidencia: `for (const viejo of todos.slice(respaldosAConservar())) await rm(viejo.ruta …)` · salida «Se borraron 1 respaldo(s) antiguo(s)».
Solución propuesta: retención escalonada. Los 10 más recientes, más el último de cada día de los últimos 30 días, más el último de cada mes de los últimos 12 meses:
```ts
const conservar = new Set([...todos.slice(0, 10), ...ultimoPor(todos, (r) => dia(r), 30), ...ultimoPor(todos, (r) => mes(r), 12)]);
```
Riesgo de cambiarlo: se guardan un poco más de archivos (~50). El test de backups tiene que cubrir la nueva regla.
Esfuerzo estimado: Pequeño (<1h)

### [DOMINIO] D2 · Prisma 6 tiene 4 alertas altas en `npm audit`
Archivo: package.json (`prisma 6.16.2`, `@prisma/client 6.16.2`)
Severidad: 🟢 Baja (antes del `.exe`: 🟡 Media)
Problema: las alertas (`deepmerge-ts`, `effect` y `@prisma/config`) llegan por el **CLI** de Prisma, que corre en la PC de desarrollo y no dentro del servidor. La solución que propone npm es `prisma@7.10.1`, un cambio mayor: nuevo `prisma.config.ts`, adaptadores de motor y cambios en el cliente generado.
Evidencia: `prisma high True ['@prisma/config'] → prisma@7.10.1`
Solución propuesta: **no migrar ahora** (ya es tarde para la defensa). Antes del `.exe`, migrar en una rama, con los 101 tests como red y probando el empaquetado con el nuevo motor. Mientras tanto, el CLI no se usa en producción.
Riesgo de cambiarlo: alto, porque cambia el motor de consultas y el empaquetado con Electron.
Esfuerzo estimado: Grande (>4h)

### [DOMINIO] D3 · Gastos fijos de Bs 300 escritos en el código del punto de equilibrio
Archivo: frontend/src/components/dashboard/indicadores.ts (líneas 5–6); Inicio.tsx (línea 98)
Severidad: 🟢 Baja
Problema: D77 muestra el punto de equilibrio con un valor de prueba. Los gastos reales del módulo Gastos no lo alimentan: las categorías son variables (limpieza, equipamiento) y CONTEXT dice que los servicios no se cargan (se comparten con la familia).
Evidencia: `export const GASTOS_FIJOS_MENSUALES = 300; // Bs, valor de prueba`
Solución propuesta: no inventar la regla. Hacer el número **configurable por la dueña**: un campo «Gastos fijos del mes» en Inicio que se guarde en una tabla `Configuracion(clave, valor)`, con 300 por defecto. Cómo se calcula sigue siendo decisión de ella.
Riesgo de cambiarlo: ninguno, porque el valor inicial es el mismo.
Esfuerzo estimado: Pequeño (<1h)

### Sin hallazgos (dominio)
- **Ciclos y anidación**: `calcularCostoProducto` y `explotarInsumos` son recursivos sin límite de niveles y cortan con `ruta.includes`. `verificarSinCiclos` lo impide al guardar. 3 o más niveles funcionan igual que 2.
- **`explotarInsumos` con tandas y empaques (D60)**: coincide con el costeo (empaques × lo vendido en productos de venta; en rellenos se escalan por tanda). La única recomendación es el test de equivalencia de M4.

---

# Estado
- **Sprint 1 (D99):** hechos S1, U1, S4 y S2 en el ERP. B2 resuelto con D100 (la demo se queda para la defensa y no suma). S2 en Docker hecho: n8n, Evolution y Postgres solo en 127.0.0.1. **Sprint 1 completo.**
- **Sprint 2 (D101):** hechos N1, N2, N3 y N4. **Sprint 2 completo.**
- **Sprint 4 (D103):** hechos M3, M5, U3, M2 (parcial: opciones con nombre, sin mover de archivo), M4, D1, D3, U2, U4, S5 y M6 (falta quitar `Producto.disponible`). **Las 4 etapas están completas.** Quedan fuera del plan, a propósito: D2 (Prisma 7, antes del .exe) y B3 (archivos fuera de la base).
- **Sprint 3 (D102):** hechos R1, R2, R4, R5, B1, S3 y M1. **Sprint 3 completo.** De paso: el ERP escucha también en `::1`, porque por «localhost» perdía ~200 ms por pedido desde S2.

# TOP 10 — cambios a hacer ya
Orden: severidad × impacto ÷ esfuerzo.

| # | Hallazgo | Severidad | Esfuerzo | Por qué primero |
|---|---|---|---|---|
| 1 | **S1** Bloquear SVG en comprobantes y forzar el tipo al abrir | 🔴 | <1h | Un archivo de un desconocido puede tomar control del ERP |
| 2 | **U1** Confirmación antes de «Llegó el pago» | 🟠 | <1h | Un toque por error registra la venta y manda un WhatsApp |
| 3 | **B2** Sacar las ventas demo de los totales (o borrarlas) | 🟠 | <1h | Bs 834 falsos en Caja y Desempeño |
| 4 | **S2** ERP en `127.0.0.1` + clave para n8n + puertos Docker locales | 🟠 | 1–4h | API sin clave y webhook que manda WhatsApp, abiertos a la red |
| 5 | **N2** Error Workflow que avise a la dueña | 🟡 | <1h | Las fallas del agente hoy son silenciosas |
| 6 | **R1** No leer comprobantes en las listas (`omit`) | 🟡 | <1h | Evita leer MB por cada aviso en vivo |
| 7 | **S4** Límite de 15 MB solo en las rutas de comprobante | 🟡 | <1h | Mitiga la alerta de Zod sin migrar |
| 8 | **D1** Retención de respaldos escalonada | 🟡 | <1h | No perder los respaldos de hace un mes |
| 9 | **N1** Limpiar la memoria de chats inactivos (7 días) | 🟡 | <1h | Contexto viejo que confunde al agente |
| 10 | **R2** Caché del costeo por petición | 🟡 | <1h | Baja ~50 consultas a ~10 en cada mensaje de WhatsApp |

# Plan en 4 sprints (1 semana cada uno)
La idea es que la dueña note pocos cambios a la vez. Solo el sprint 1 cambia algo que ella ve.

**Sprint 1 — Seguridad y datos limpios** (lo que ve la dueña: un paso más al confirmar un pago)
- S1, U1, B2 y S4.
- S2: primero el `HOST` y los puertos de Docker; la clave del agente al final de la semana, con prueba de punta a punta por WhatsApp.

**Sprint 2 — El agente no falla en silencio** (sin cambios en pantalla)
- N2 (Error Workflow) y N1 (limpieza de la memoria).
- N4 (modo prueba configurable, con aviso en Inicio).
- N3 (endpoint por celular).

**Sprint 3 — Rendimiento y precisión** (sin cambios visibles)
- R1 (`omit`), R2 (memo del costeo), R4 (turnos en `useDatos`) y R5.
- B1 (índices en Atencion y `claveCelular`).
- S3 (pago-whatsapp con `Decimal`) junto con M1 (llevarlo a `services/comprobantes.ts`).

**Sprint 4 — Orden y deuda** (cambios visuales menores)
- M3 (borrar la rama «crear» del formulario) y M5 (componente `<Opciones>` + U3 flechas).
- M2 y M4 (test de equivalencia costeo/inventario).
- D1 (retención), D3 (gastos fijos configurables) y U2 (barra del pedido en el celular).
- U4 (errores legibles), S5 y M6.
- Rama aparte, sin apuro: D2 (Prisma 7) antes del `.exe`. B3 (archivos fuera de la base) cuando haya volumen real.

# Tests que conviene agregar
1. **S1**: `pago-whatsapp` con `comprobante: "data:image/svg+xml;base64,…"` → 400. Con `image/jpeg` y `application/pdf` → aceptado.
2. **S2**: sin la cabecera `x-dulzura-clave`, `POST /pedidos/pago-whatsapp` → 401. Con la clave → 200. Las rutas de la pantalla (sin clave) siguen funcionando.
3. **S4**: un cuerpo de 200 kB en `POST /api/ventas` → 413. Uno de 2 MB en `pago-whatsapp` → aceptado.
4. **S3**: tres parciales de 0,10 + 0,20 + … que suman el total exacto → `por_confirmar`, sin faltante de 0,01.
5. **M1**: tests unitarios de `evaluarComprobante` (sin servidor):
   - Fecha de ayer, de mañana y sin fecha.
   - Destino por nombre, por cuenta, por ninguno.
   - Estado «Pendiente».
   - Tercer parcial.
   - Reemplazo de la tarjeta de estafa.
6. **R1**: `GET /pedidos?vista=historial` y `GET /atenciones?estado=RESUELTA` no traen `comprobante` ni `adjunto`, pero sí `tieneComprobante` y `tieneAdjunto`.
7. **R2 / M4**: para cada producto del seed, `costoUnitario` de `/costo` = Σ (consumo de `explotarInsumos` × costo unitario del insumo), con `Decimal` y tolerancia 0. El N+1 se puede contar con `prisma.$on("query")`.
8. **D1**: respaldos falsos con fechas de 40 días → quedan los 10 últimos, uno por día de los últimos 30 y uno por mes.
9. **U1** (frontend, si se agrega Vitest): el primer clic en «Llegó el pago» no llama a `pagarPedido`; el segundo sí, con `avisarCliente: true`.
10. **B1**: un test de rendimiento suave con 5 000 atenciones sembradas. `pago-whatsapp` responde en menos de 200 ms.
11. **B2**: si se elige excluir las ventas demo de los totales, `GET /api/ventas` del día no suma ventas de pedidos `esDemo`.
