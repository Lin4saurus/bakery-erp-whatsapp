# TECH.md — Stack y decisiones de arquitectura

## Stack
- Backend: Node.js 22 + TypeScript (strict) + Express 5 + Zod 3 (validación).
- ORM: Prisma 6.x (enums en SQLite requieren Prisma ≥ 6.2).
- BD: SQLite.
- Frontend: React 18 + Vite 6 + TypeScript strict, CSS propio por componente con variables (sin librería de UI ni Tailwind). Fuente IBM Plex Sans vía `@fontsource` (incluida en el build, no depende de internet). Íconos `react-icons/md` con contorno.
- Empaquetado: Electron (Fase 5+).

## Estructura
```
package.json      raíz: Prisma, tsx, TypeScript (el backend se sumará como workspace)
tsconfig.json     strict + noUncheckedIndexedAccess
.env              DATABASE_URL (copiar de .env.example)
/backend/src      app.ts, server.ts, prisma.ts, errors.ts, validacion.ts
  services/       costeo.ts (motor de costeo, detección de ciclos), inventario.ts (consumo y movimientos)
  routes/         insumos.ts (CRUD + stock), productos.ts (CRUD + recetas + costo), ventas.ts
/backend/test     api.test.ts (integración, BD propia test.db)
/frontend         index.html, vite.config.ts (proxy /api → :3001), tsconfig.json
  src/            main.tsx, App.tsx + App.css (pantallas por hash #inicio/#caja/#recetas/#insumos),
                  api.ts (cliente tipado), formato.ts, ui.tsx (reexporta componentes y useDatos)
  src/styles/     globals.css (tokens de color de ambos temas, tipografía, base)
  src/hooks/      useDatos.ts, useTema.ts
  src/components/ ui/ (Button, Card, StatCard, Field, Alert + .css; Badge.css, Table.css)
                  layout/ (Sidebar, Topbar + .css), charts/ (BarChart + .css)
  src/pantallas/  Inicio, Caja, Recetas, Insumos (.tsx + .css propio cuando hace falta)
/database/prisma  schema.prisma, migrations/, seed.ts, check-seed.ts, dulzura.db
```

## Decisiones
1. **SQLite también en desarrollo** (en vez de PostgreSQL). Prisma no permite cambiar `provider` por variable de entorno, así que mantener dos motores obligaría a duplicar el esquema y las migraciones. La cliente usará SQLite, así que desarrollar sobre lo mismo evita sorpresas. Revisable si aparece una necesidad real de Postgres.
2. **`Decimal` en todo monto y cantidad.** Prisma lo expone como `Prisma.Decimal` (decimal.js) y toda la aritmética de costos se hace con `Decimal`, nunca con `number`. Ojo: SQLite no tiene un tipo decimal real y guarda la columna como NUMERIC (≈15 dígitos significativos). Alcanza para Bs y gramos; el redondeo para mostrar se hace al final.
3. **El costo unitario del insumo no se almacena**: se deriva de `precioEnvase / contenidoEnvase` para que no se desincronice.
4. **La venta guarda una foto de costos** (`costoUnitario`, `costoTotal`, `gananciaBruta`). No hay canales ni comisiones: PedidosYa quedó fuera (CONTEXT.md D9). La foto existe para que la ganancia histórica no cambie cuando suben los insumos.
5. Receta modelada como `IngredienteReceta` (producto × insumo × cantidad por tanda), única por par.
6. **Sub-recetas**: los rellenos son `Producto` con `tipo = INTERMEDIO` (no se venden, `precioVenta` null) y rendimiento en gramos (`unidadRendimiento`). `ComponenteReceta` los une al producto padre. El motor de costeo e inventario los recorre de forma recursiva; hay que evitar ciclos (A usa B usa A) al crear recetas.
7. Borrado: `Producto` → cascada a su receta; `Insumo` usado en receta, sub-producto usado en otra receta y `Producto` con ventas → restringido.
8. **API**: Express 5 (los errores de handlers async llegan solos al `errorHandler`). Las respuestas devuelven los `Decimal` como **texto** (`"0.0064"`) para no perder precisión; el frontend redondea al mostrar. Errores: `{ error, detalles? }` con 400 (validación), 404, 409 (duplicado o en uso), 422 (regla de negocio, ej. ciclo) y 500.
9. **Tests**: `node:test` vía `tsx --test`, contra el servidor real en un puerto libre y una BD aparte (`test.db`), que se borra y recrea con `migrate deploy` + seed. Prisma bloquea `migrate reset` cuando lo ejecuta un agente de IA; por eso el test no lo usa.

10. **Ventas sin stock suficiente se registran igual** y la respuesta trae `alertas` (`SIN_STOCK` / `BAJO_MINIMO`). El stock puede quedar negativo, lo que muestra que falta cargar una compra. Bloquear la venta dejaría el sistema inusable mientras el inventario esté en 0.
11. **Todo cambio de stock pasa por `registrarMovimiento`** (`services/inventario.ts`): actualiza `stockActual` con `increment` y deja un `MovimientoInventario` con el stock resultante. Las ventas lo llaman dentro de su transacción, junto con la creación de la venta: o se guarda todo o nada.
12. `explotarInsumos` reparte el consumo de forma recursiva por sub-recetas (unidades / rendimiento × cantidad de cada insumo) y suma en un mapa los insumos repetidos. En un producto de venta (D60) los ingredientes usan vendido × `unidadesPorVenta` / rendimiento y los insumos `EMPAQUE` se descuentan uno por cada cosa vendida; el costo es ingredientes ÷ rendimiento × `unidadesPorVenta` + empaques.
13. **Frontend**: los cálculos de verdad los hace la API. El frontend solo convierte a `number` para mostrar y para la vista previa del costo mientras se edita una receta; al guardar, muestra lo que devuelve la API. Los números se aceptan con coma o punto («0,35») y se envían como texto con punto.
14. **Un solo proceso en producción**: si existe `frontend/dist`, Express lo sirve junto a `/api`. En desarrollo se usan dos procesos (`npm run dev` + `npm run web`) y el proxy de Vite.

## Endpoints (Fase 2)
| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/salud` | Chequeo del servidor |
| GET | `/api/insumos` | Lista con `costoUnitario` |
| GET | `/api/insumos/:id` | Detalle + productos que lo usan |
| POST | `/api/insumos` | Crea (`nombre`, `unidadBase`, `contenidoEnvase`, `precioEnvase`, opcionales `categoria`, `stockActual`, `stockMinimo`, `activo`) |
| PATCH | `/api/insumos/:id` | Edita cualquier campo (ej. precio) |
| DELETE | `/api/insumos/:id` | Borra si no está en ninguna receta |
| GET | `/api/productos?tipo=&activo=` | Lista con costo, ganancia y margen |
| GET | `/api/productos/:id` | Detalle con costo |
| DELETE | `/api/productos/categorias/:categoria?tipo=` | (D64) borra todas las recetas de la categoría con la regla de D63; respaldo previo; 409 si un relleno se usa en otra categoría |
| DELETE | `/api/productos/:id` | (D63) sin ventas borra; con ventas deja `eliminado` y responde `{ borrado, conservaVentas }`. |
| POST / PATCH | `/api/productos[/:id]` | CRUD (`nombre`, `categoria`, `rendimientoReceta`, opcionales `tipo`, `unidadRendimiento`, `precioVenta`, `unidadesPorVenta`, `activo`) |
| GET | `/api/productos/:id/costo` | Costo explotado: líneas de insumos y sub-recetas |
| PUT | `/api/productos/:id/receta` | Reemplaza la receta: `{ ingredientes: [{insumoId, cantidad}], subRecetas?: [{subProductoId, cantidad}] }` |
| PUT | `/api/productos/:id/receta/insumos/:insumoId` | Agrega o cambia un insumo: `{ cantidad }` |
| DELETE | `/api/productos/:id/receta/insumos/:insumoId` | Quita un insumo |

## Endpoints (Fase 3)
| Método | Ruta | Qué hace |
|---|---|---|
| POST | `/api/insumos/:id/movimientos` | `{ tipo: "COMPRA", cantidad \| envases, precioEnvase?, nota? }` o `{ tipo: "AJUSTE", cantidad (±), nota }` |
| GET | `/api/insumos/:id/movimientos` | Últimos 200 movimientos del insumo |
| GET | `/api/insumos/alertas` | Insumos activos sin stock o bajo el mínimo |
| POST | `/api/ventas` | `{ productoId, cantidad, precioUnitario? }` → venta, consumo por insumo y alertas |
| GET | `/api/ventas?desde=AAAA-MM-DD&hasta=AAAA-MM-DD` | Ventas y resumen (cantidad, unidades, total, costo, ganancia) |
| GET | `/api/ventas/:id` | Venta con el consumo de insumos que generó |
| POST | `/api/ventas/:id/anular` | `{ motivo }`: devuelve el stock (movimientos ANULACION) y saca la venta de los totales (409 si ya estaba anulada) |

**Anulación**: no se borra nada. La venta queda con `anulada = true`, fecha y motivo, y cada insumo recibe un movimiento ANULACION igual y opuesto a su salida. Así el historial del inventario cuadra y se puede auditar. Los totales (`resumen`, dashboard) ignoran las anuladas.

`POST /api/ventas` acepta además `fecha` (AAAA-MM-DD, hoy o anterior) para cargar una venta olvidada: se guarda al mediodía de ese día; los movimientos de stock llevan la fecha de carga y una nota con el día de la venta.

| GET | `/api/backups` | Carpeta de respaldos y lista (más nuevo primero) |
|---|---|---|
| POST | `/api/backups` | Crea un respaldo; devuelve también los antiguos que se borraron |


## Ventas históricas (Fase 6, CONTEXT.md D24)
- `hoja` y `fila` solo sirven para importar sin duplicar: `GET /api/historico` no los devuelve (D41).
- Tabla `VentaHistorica`, separada de `Venta`: no descuenta inventario, no tiene foto de costo del ERP y no cuenta en la Caja ni en el dashboard. Guarda los valores tal como están en el Excel (valor, comisión, costo, utilidad, cliente; la forma de pago se quitó, D41), el nombre original y un `productoNombre` agrupado. `productoId` es opcional (se vincula solo si el producto existe en el ERP; `onDelete: SetNull`).
- Origen: `database/prisma/datos/ventas-historicas-2024.json`, extraído una sola vez del Excel con Python (openpyxl), para no sumar una librería de Excel a Node. Las filas descartadas quedan listadas en el mismo JSON.
- `npm run db:historico` importa con upsert por `hoja + fila` (idempotente). Un nombre del Excel sin agrupar en `importar-historico.ts` hace fallar la importación, para no perder ventas sin darse cuenta.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/historico?desde&hasta` | Ventas históricas con `resumen`, `semanas` (por lunes) y `productos` (por nombre agrupado, de mayor a menor valor) |

Pantalla: `pantallas/Historial.tsx` (`#historial`, sección «Consulta» del menú). Pide todo el histórico de una vez (son pocas filas) y filtra por semana y producto en el navegador.

## Insumos sin control de stock (D40)
- `Insumo.controlaStock = false`: `POST /api/ventas` los salta al descontar (sin movimiento ni alerta); `alertaDe` devuelve null; `POST /api/insumos/:id/movimientos` responde 422. El costeo no cambia.

## Clientes y precios acordados (Fase 8, D42)
- Cada mayorista tiene su precio negociado por producto (`PrecioCliente`, único por cliente + producto). No hay listas de precios.
- `services/precios.ts` (`precioAcordado`): si el cliente tiene precio acordado para el producto, la venta cobra ese y rechaza otro escrito a mano (422). Sin precio acordado se cobra el precio escrito (regateo) o el precio de venta. El frontend repite la regla en `frontend/src/precios.ts` solo para mostrar; la API manda.
- `Venta.cliente` (texto) guarda el nombre; con cliente registrado se copia su nombre. La relación con `Cliente` se llama `clienteRegistrado`.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/clientes?tipo&activo` | Lista con sus precios acordados |
| GET/PATCH | `/api/clientes/:id` | Detalle / editar |
| POST | `/api/clientes` | Crear (409 si el nombre existe) |
| DELETE | `/api/clientes/:id` | Desactivar (no borra) |
| PUT | `/api/clientes/:id/precios/:productoId` | Fijar o cambiar el precio acordado `{ precio }` (solo mayoristas; 422 si es minorista) |
| DELETE | `/api/clientes/:id/precios/:productoId` | Quitar el precio acordado (vuelve al precio de venta) |
| GET | `/api/ventas/reporte-clientes?desde&hasta` | Por cliente: total, unidades, pedidos (un pedido de varias líneas cuenta uno) y último pedido (Caja + historial) |

## Corregir y eliminar ventas (D43)
| Método | Ruta | Qué hace |
|---|---|---|
| PATCH | `/api/ventas/:id` | Corrige `{ cantidad?, precioUnitario?, fecha? }`; ajusta stock por la diferencia; 409 si está anulada |
| DELETE | `/api/ventas/:id` | Devuelve el stock (si no estaba anulada) y borra la venta |
| PATCH | `/api/historico/:id` | Corrige `{ fecha?, cantidad?, valor? }` (el cliente no se cambia, D58); marca `editada` |
| DELETE | `/api/historico/:id` | Marca `eliminada` (no se ve ni suma; reimportar no la revive) |
| DELETE | `/api/historico/:id/pedido` | Marca `eliminada` todas las líneas (sabores) de la misma nota (D57) |

## Cliente obligatorio en la venta (D44)
- `POST /api/ventas`: `clienteId` **o** `clienteNombre` (400 en `clienteNombre` si faltan ambos) + `celular` cuando el cliente no tiene. Respuesta con `clienteNuevo: true` si se creó.
- Frontend: `components/ui/BuscadorCliente.tsx` (`buscarClientes`: empieza con → palabra que empieza con → contiene; sin tildes; teclado ↑ ↓ Enter Esc).
- Tests: el helper `api()` agrega «Mostrador» + celular a las ventas sin cliente (`__sinCliente: true` lo desactiva).

## Productos a la venta (D32)
- `Producto.activo` = en el catálogo y a la venta. `Producto.disponible` queda sin uso desde D49 (la Caja muestra todo lo activo y las ventas ya no lo exigen).

## Indicadores del Dashboard
- `components/dashboard/indicadores.ts`: función pura `puntoDeEquilibrio` (números para mostrar; los montos guardados los calcula la API con Decimal). La tarjeta solo dibuja el resultado.
- La tarjeta «Flujo de caja de hoy» se quitó a pedido (repetía la tarjeta Caja).

## Gastos operativos
- Tabla `GastoOperativo` (id uuid). Utilidad neta = ganancia bruta de las ventas no anuladas − gastos del período; la calcula el Dashboard con `GET /api/ventas` y `GET /api/gastos` del día y del mes.

| Método | Ruta | Qué hace |
|---|---|---|
| POST | `/api/gastos` | Crea un gasto (`descripcion`, `monto`, `categoria`, `fecha` opcional AAAA-MM-DD) |
| GET | `/api/gastos?desde&hasta` | Lista (más nuevo primero), `total` y `porCategoria` |
| DELETE | `/api/gastos/:id` | Borra un gasto (204; 404 si no existe) |

## Respaldos (Fase 5)
- `services/backup.ts`: `VACUUM INTO` a un temporal (copia consistente aunque la API esté escribiendo), luego `PRAGMA integrity_check` sobre la copia y gzip nivel 9 a `BACKUP_DIR/dulzura_AAAA-MM-DD_HH-MM-SS.db.gz`. Si hay dos en el mismo segundo se agrega `-2`, `-3`, … El orden se calcula a partir de la fecha y el número, no del nombre crudo.
- Variables: `BACKUP_DIR` (por defecto `./backups`, relativa a la raíz o absoluta), `BACKUP_KEEP` (por defecto 30), `BACKUP_AUTO=false` para desactivar el automático.
- **Google Drive**: instalar Google Drive para escritorio en la laptop y poner `BACKUP_DIR` en una carpeta de «Mi unidad» (ej. `G:/Mi unidad/Dulzura/respaldos`). Drive sube cada archivo; no hace falta la API de Google ni guardar credenciales en la app.
- **Restaurar**: cerrar la app, descomprimir el `.db.gz` (7-Zip, o el explorador de Windows 11) y reemplazar `database/prisma/dulzura.db` por el archivo descomprimido (renombrado a `dulzura.db`). Conviene guardar antes una copia del archivo que se reemplaza.

## Diseño
- **Referencia**: panel administrativo tipo Shreyu (menú lateral claro u oscuro, barra superior, tarjetas con ícono, tablas con cabecera gris), en versión sobria.
- **Temas**: `:root[data-theme="light"|"dark"]` en `globals.css`. Ningún componente usa colores fijos: todos salen de variables (`--color-bg`, `--color-surface`, `--color-text`, `--color-text-secondary`, `--color-border`, `--color-primary`, `--color-success`, `--color-error`, `--color-warning`…). Para agregar un color, se define en los dos temas.
- **Reglas** (guía de diseño del cliente): un solo acento (#8B6F47 claro / #C4A57A oscuro); bordes de 4–6 px; sombras mínimas (`0 1px 2px`); sin gradientes, glow, glassmorphism ni animaciones de hover (solo cambia el fondo); labels siempre arriba del input; H1 28 px / 600, cuerpo 14 px; espaciados múltiplos de 8 px.
- El verde (`--color-success`) se usa solo para el botón «Registrar venta rápida» (pedido en TASK.md §4b) y para los estados positivos.

## Convenciones
- Dominio en español (`Insumo`, `Receta`), técnico en inglés (`createInsumo`).
- Prohibido `any`. Errores con `try/catch` y mensajes claros.
- Variable de entorno: `DATABASE_URL="file:./dulzura.db"` (ruta relativa al schema → `database/prisma/dulzura.db`).

## Comandos
- `npm install` — dependencias.
- `npm run db:migrate` — aplica migraciones (`prisma migrate dev`).
- `npm run db:seed` — carga los Queques (idempotente).
- `npm run db:check` — compara los costos de la BD con CONTEXT.md §4.
- `npm run db:historico` — importa las ventas de 2024 del Excel (idempotente).
- `npm run db:reset` — borra la BD, re-migra y re-siembra.
- `npm run backup` — crea un respaldo comprimido en `BACKUP_DIR`.
- `npm run dev` — API en http://localhost:3001/api con recarga automática (`PORT` para cambiar el puerto).
- `npm start` — API sin recarga.
- `npm run web` — frontend en http://localhost:5173 (necesita `npm run dev` en paralelo; `API_PORT` si la API no está en 3001).
- `npm run web:build` — compila el frontend a `frontend/dist`; después `npm start` sirve todo en http://localhost:3001.
- `npm test` — tests de integración de la API.
- `npm run typecheck` — TypeScript strict de backend y frontend.

## Dependencias y seguridad
- Prisma fijado en 6.16.2. `npm audit` reporta 4 alertas altas en `deepmerge-ts` y `effect`, que llegan por `prisma` / `@prisma/config` (CLI). Solo se arreglan pasando a Prisma 7, que tiene cambios incompatibles. El riesgo es bajo para una app local sin acceso externo; evaluar la migración a Prisma 7 antes del empaquetado (Fase 5).

## Pedidos de varios productos (D48)

| Método | Ruta | Qué hace |
|---|---|---|
| POST | `/api/ventas/pedido` | `{ lineas: [{ productoId, cantidad, precioUnitario? }], clienteId \| clienteNombre, celular?, fecha? }` → `{ pedidoId, cliente, clienteNuevo, fecha, ventas, unidades, totalVenta, costoTotal, gananciaBruta, alertas }` |

- Cada línea es una `Venta` con `pedidoId` común; todo en una transacción. Producto repetido o lista vacía → 400; producto no disponible o precio distinto al acordado → 422 y no se guarda ninguna línea.
- Las rutas por venta (`/:id/anular`, `PATCH /:id`, `DELETE /:id`) siguen funcionando por línea.
- Frontend: `Caja.tsx` (familias = `Producto.categoria`; `nombreCorto` quita el nombre de la familia), `api.crearPedido`; `ultimaVenta.ts` guarda el `PedidoCreado` para Inicio.

## Compra de insumos en Gastos (D51)

- `POST /api/gastos` con `categoria: "INSUMOS"`: `{ insumoId, envases | cantidad, monto, descripcion?, actualizarPrecio? (true), fecha? }`. Crea el gasto y un `MovimientoInventario` COMPRA en una transacción; `GastoOperativo.movimientoId` los une.
- `DELETE /api/gastos/:id` de una compra: movimiento AJUSTE negativo por lo que había sumado.
- `GET /api/gastos`: `{ total, totalOperativo, porCategoria, gastos }` (gastos con `insumo: { nombre, unidadBase }`). La utilidad neta usa `totalOperativo`.


**Sin fiados (D74)**: toda venta se cobra al momento. No hay `estadoPago`, `fechaPago`, `/ventas/pendientes` ni rutas de cobro; un `fiado` enviado se ignora.

## Agente de WhatsApp en n8n (D78)
- n8n, Evolution API y Postgres corren en Docker (`D:\PROYECTOS\n8n-host`). n8n: http://localhost:5678 · Evolution: http://localhost:8080.
- Desde los contenedores el ERP está en `http://host.docker.internal:3000` (el servidor escucha en todas las interfaces). Si el ERP está apagado, el bot avisa al cliente que la repostera le responderá.
- Workflow `ERP Dulzura - Agente de pedidos (WhatsApp)`: Webhook `dulzura-pedidos` → Normalizar (solo chats privados, sin mensajes propios ni stickers; `@lid` usa `senderPn`) → descarta `message_id` repetidos → GET `/api/clientes` y `/api/productos?tipo=VENTA&activo=true` → AI Agent (Gemini + memoria Postgres por número, tabla `dulzura_chat_memoria`) con la herramienta `registrar_pedido` (POST `/api/ventas/pedido`; `clienteId` si el número es conocido, si no `clienteNombre`; `celular` siempre del número de WhatsApp) → responde con Evolution `sendText`.
- La herramienta solo devuelve al modelo `pedidoId, cliente, clienteNuevo, totalVenta, unidades, error` (sin costos ni ganancias).
- Pruebas sin tocar datos reales: copiar `dulzura.db` a `database/prisma/prueba-agente.db`, levantar la configuración `erp-prueba` (puerto 3002, `.claude/launch.json`) y apuntar temporalmente `registrar_pedido` a `:3002`. Borrar la copia al terminar.

## Pedidos por entregar (D81)
| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/pedidos?vista=proximos\|historial` | Próximos: sin terminar, por fecha y hora. Historial: entregados y cancelados (últimos 100). |
| GET | `/api/pedidos/:id` | Un pedido con cliente y líneas. |
| POST | `/api/pedidos` | `{ lineas[{productoId,cantidad}], clienteId \| clienteNombre+celular, clienteTipo?, fechaEntrega AAAA-MM-DD (hoy o después), horaEntrega? HH:MM, nota?, origen? MANUAL\|WHATSAPP }`. Precio por línea: acordado o precio de venta. |
| PATCH | `/api/pedidos/:id` | Día, hora, nota o líneas, mientras no esté entregado ni cancelado (409). |
| POST | `/api/pedidos/:id/estado` | `{ estado, motivo? }`. Avanza (puede saltar pasos), vuelve uno atrás (si no, 422) o cancela. ENTREGADO llama a `registrarPedidoVenta` (la misma función de `POST /api/ventas/pedido`) y guarda `ventaPedidoId`. |
| DELETE | `/api/pedidos/:id` | Borra uno anotado por error; uno ENTREGADO responde 409 (ya es venta). |

- Las fechas de entrega se guardan como texto `AAAA-MM-DD` y `HH:MM` (hora local) para evitar corrimientos de zona horaria.
- Frontend: `pantallas/Pedidos.tsx`, ayudas compartidas en `src/pedidos.ts` (nombres de estado, siguiente paso, «Hoy/Mañana/Ayer», urgentes, para preparar). El menú revisa los pedidos cada minuto para la insignia.
- Datos demo: `database/prisma/demo-pedidos.ts` usa clientes y productos existentes y marca `esDemo`; al borrarlos, si alguno se entregó, borra su venta con `eliminarVenta` (devuelve el stock).
- Agente n8n: la herramienta `registrar_pedido` hace `POST /api/pedidos` con `origen: WHATSAPP`, `fecha_entrega`, `hora_entrega`, `entrega`, `ubicacion` y `nota` sacados de la conversación.

## Recojo/delivery y atención humana (D85)
- `Pedido.entrega` RECOJO|DELIVERY, `ubicacion` (enlace de Maps o dirección) y `costoEnvio` (Bs, lo paga el cliente; **no** suma a `total` ni a la venta). Se aceptan en `POST` y `PATCH /api/pedidos`.
- `POST /api/pedidos?confirmado=no` responde 409 sin escribir: n8n lo agrega cuando el último mensaje del cliente no es un «sí».

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/atenciones?estado=PENDIENTE\|RESUELTA\|TODAS` | Pendientes (las más viejas primero; sin las pausas «respondiste tú» vencidas) o resueltas (últimas 100). |
| GET | `/api/atenciones/pausa?celular=` | `{ pausado, motivos }`: si hay una pendiente para ese celular (compara los últimos 8 dígitos), el agente no contesta. |
| POST | `/api/atenciones` | `{ celular, nombre?, motivo COTIZAR_DELIVERY\|PEDIDO_PERSONALIZADO\|RECLAMO\|DUENA_RESPONDIO\|OTRO, descripcion, pedidoNumero? }`. Una pendiente del mismo motivo en ese chat se actualiza (200) en vez de repetirse (201). |
| POST | `/api/atenciones/:id/resolver` | Resuelve todas las pendientes de ese celular: el agente vuelve a atender el chat. |

- `DUENA_RESPONDIO` vence sola a las 6 h (`PAUSA_DUENA_HORAS`) sin que la dueña vuelva a escribir.
- Frontend: `pantallas/Atenciones.tsx` (clave de menú `atencion`); la insignia cuenta chats esperando y se refresca con el evento `dulzura:avisos`.
- n8n (después de descartar repetidos): mensaje de la dueña (`fromMe` con `source` android/ios/web) → `POST /api/atenciones` DUENA_RESPONDIO y se anota en la memoria como «(La repostera escribió) …»; lo que manda el bot por la API llega con `source: unknown` y se ignora. Cliente → `GET /pausa` → si no está en pausa, se guarda en `dulzura_mensajes_pendientes` (Postgres «ventas»), espera 12 s y solo la ejecución del último mensaje sigue con todos los textos juntos. Primer contacto corto → bienvenida fija; «menú» → lista con precios; ambos sin IA y guardados en la memoria. Ubicación compartida → `📍 Ubicación: https://maps.google.com/?q=lat,lng`. Herramienta `pedir_atencion` → `POST /api/atenciones`.
- Pruebas: además de `registrar_pedido`, apuntar a `:3002` `Leer clientes`, `Leer catálogo`, `pedir_atencion`, `Pausar chat` y `¿Chat en pausa?`.

## El cliente paga primero (D86)
- Estados: `POR_PAGAR` → (pago) `PENDIENTE` («Agendado») → `EN_PREPARACION` → `LISTO` → `ENTREGADO`. Sin pago, `/estado` responde 409; volver a «Por pagar» es `DELETE /:id/pago`.
- Pagar (`pagarPedido` en `routes/pedidos.ts`) usa `registrarPedidoVenta`: la venta queda con la fecha del pago. Entregar un pedido sin venta (anteriores a D86) la registra en ese momento como efectivo.
- `pagoReferencia` se guarda normalizada (`A-Z0-9`) y es única: un comprobante no paga dos pedidos.

| Método | Ruta | Qué hace |
|---|---|---|
| POST | `/api/pedidos/:id/pago` | `{ metodo QR\|EFECTIVO, monto?, referencia?, comprobante? (data URL) }`: venta, stock y agenda. 409 si ya está pagado o la referencia se usó. |
| DELETE | `/api/pedidos/:id/pago` | Borra la venta (`eliminarVenta`), devuelve el stock y vuelve a `POR_PAGAR`. |
| POST | `/api/pedidos/pago-whatsapp` | Lo que Gemini leyó del comprobante: `{ celular, esComprobante, monto, referencia, receptor, enviadoPor, fecha, banco, confianza, titular, comprobante }`. Busca el pedido por pagar del celular; si todo cuadra → `{ resultado: "pagado", pedido }`; si no → Atención `VERIFICAR_PAGO` (u `OTRO` si no es comprobante) con el adjunto y `{ resultado: "revision", motivos }`. |
| GET | `/api/pedidos/:id/comprobante` · `/api/atenciones/:id/adjunto` | El archivo como data URL (las listas solo traen `tieneComprobante` / `tieneAdjunto`). |

- `express.json` acepta hasta 15 MB (comprobantes en base64).
- n8n: imágenes y PDF (Evolution con «Webhook Base64») saltan la pausa y van a `¿Es PDF?` → Gemini (`image/analyze` o `document`) → `Datos del comprobante` → `Titular del QR` (`configuracion_pago.nombre_receptor`, Postgres «ventas») → `Registrar pago (ERP)` → respuesta corta y memoria. Después de cada respuesta del agente, `¿Mandar QR?` revisa `intermediateSteps` (o si el cliente escribió «qr») y envía `configuracion_pago.qr_base64` con `sendMedia`.
- Pruebas: además de lo de D85, apuntar `Registrar pago (ERP)` a `:3002`. Un PDF de texto sirve de comprobante de prueba.

## Insumos al preparar (D87)
- `registrarPedidoVenta(tx, datos, exigirCelular, descontarStock)`: con `descontarStock = false` crea las ventas sin movimientos. `descontarInsumosDePedido` / `devolverInsumosDePedido` (en `routes/ventas.ts`) crean los movimientos VENTA / ANULACION enlazados a cada venta del pedido, así `eliminarVenta` sigue cuadrando el stock. `eliminarVenta(tx, id, devolverStock)`.
- `Pedido.insumosDescontadosEn` evita descontar dos veces. `POST /api/pedidos/:id/estado` devuelve `alertas` de stock bajo al empezar a preparar.

## Avisos en vivo (D88)
- `routes/eventos.ts`: `GET /api/eventos` abre un stream SSE (latido cada 25 s, `retry: 3000`). `avisarAlCambiar(...temas)` se monta delante de `/api/pedidos` y `/api/atenciones`: tras cada POST/PATCH/DELETE con respuesta < 400 emite `cambio` con el tema.
- `frontend/src/avisos.ts`: `conectarAvisos()` (una `EventSource` en App; al reconectar avisa igual) dispara el evento de ventana `dulzura:avisos`; `useAlAvisar(fn, tema)` recarga cada pantalla.

## Cotización con delivery (D89)
| Método | Ruta | Qué hace |
|---|---|---|
| POST | `/api/atenciones/:id/costo-envio` | `{ costoEnvio }`: guarda el costo en el pedido (debe estar en cotización y con delivery), resuelve las atenciones del chat y llama a n8n (`N8N_WEBHOOK_ENVIO`, por defecto `http://localhost:5678/webhook/dulzura-envio`; vacío = desactivado). Responde `{ costoEnvio, enviado, error? }`. |
| POST | `/api/pedidos/cotizacion/aceptar-envio` | `{ celular }`: marca `envioAceptadoEn` en la cotización abierta (409 si la dueña no cotizó). Devuelve `total` (solo productos). |
| POST | `/api/pedidos/cotizacion/cancelar` | `{ celular, motivo? }`: cancela la cotización abierta (sin venta). |
- n8n: segundo disparador `Costo de envío (ERP)` (webhook `dulzura-envio`) → mensaje al cliente → memoria. `¿Mandar QR?` solo si `registrar_pedido` devolvió `entrega: RECOJO` o `aceptar_envio` devolvió `total`. El agente reintenta 3 veces si Gemini responde 503.

## Pago por confirmar y posible estafa (D91)
- `POST /api/pedidos/pago-whatsapp` nunca llama a `pagarPedido` (reemplaza la confirmación automática de D86). Acepta además `pareceEditado` y `sospecha`. Responde `resultado: "por_confirmar" | "revision"`.
  - Congruente → atención `VERIFICAR_PAGO` («Pago por confirmar»). Con incongruencias → `POSIBLE_ESTAFA`. Imagen que no es comprobante → `OTRO`.
  - La atención guarda `adjunto`, `montoReportado` y `referencia` (normalizada); «Llegó el pago» llama a `POST /api/pedidos/:id/pago` con esos datos y resuelve el chat.
  - Banderas: monto distinto, destinatario distinto al titular del QR, nro. ya usado en un pedido pagado o mandado por otro chat (o para otro pedido) en espera, fecha anterior al pedido, delivery sin envío aceptado, ilegible, sin cotización abierta y `pareceEditado`.

## Delivery: el resumen llega con el envío (D92)
- `POST /api/pedidos?confirmado=no` solo rechaza pedidos de recojo; un delivery se anota como cotización sin «sí».
- `POST /api/atenciones/:id/costo-envio` manda a n8n `{ celular, nombre, costoEnvio, lineas: [{ cantidad, producto, subtotal }], totalProductos, fechaEntrega, horaEntrega, ubicacion }`; el nodo «Mensaje del costo de envío» arma el resumen y pregunta «¿Confirmas tu pedido?».

## Comprobantes sin contenido y fecha del pago (D93)
- Si el webhook de Evolution trae una imagen o PDF sin `base64`, `Normalizar mensaje` marca `descargar: true` y n8n lo pide con `POST http://evolution-api:8080/chat/getBase64FromMediaMessage/{instancia}` (`{ message: { key: { id } } }`).
- `pago-whatsapp`: la fecha del comprobante (AAAA-MM-DD) debe estar entre el día de la cotización (zona America/La_Paz; hoy si no hay cotización) y hoy.

## Incongruencias en lista y saldo incompleto (D94)
- `Atencion.descripcion` de un comprobante: primer renglón de título, `!- ` incongruencia grave (monto incompleto), `- ` normal, último renglón con banco y quién pagó. La pantalla lo dibuja como lista.
- `pago-whatsapp` responde `resultado: "por_confirmar" | "incompleto" | "revision"` y `faltante`. `crearAtencion` acepta `unir: false` (tarjeta nueva) y `actualizarId`.
- n8n: `SOLO_NUMEROS_DE_PRUEBA` en «Normalizar mensaje» limita el agente a esos números (lista vacía = todos).

## Sprint 4 de la auditoría (D103)
| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/configuracion/gastos-fijos` | `{ gastosFijos }` (Bs 300 si nunca se cambió) |
| PUT | `/api/configuracion/gastos-fijos` | Guarda `{ gastosFijos }` (Decimal ≥ 0, hasta 1 000 000) |
- `components/ui/Opciones.tsx`: `<Opciones etiqueta valor opciones alCambiar ancho? mostrarEtiqueta? />`, `role=radiogroup`, Tab entra en la elegida y las flechas cambian.
- `services/backup.ts`: `elegirAConservar(respaldos, recientes, hoy)`; `BACKUP_KEEP` sigue siendo «los más recientes» (30).
- `api.ts` `mensajeDeError` traduce `detalles[].campo` con `NOMBRE_CAMPO`; `validacion.ts` da el tipo esperado en palabras.
- Ojo con `.refine()` después de `decimal…`: corre aun si el valor es inválido (pasó con gastos fijos; el tope va en la ruta).

## Sprint 3 de la auditoría (D102)
- `services/comprobantes.ts`: `evaluarComprobante(leido, contexto)` es pura (sin Prisma) y devuelve `resultado`, `valido`, `saldo`, `faltante` (Decimal), `rechazos` y `revision`; `redactarDescripcion` arma la tarjeta. La ruta `/pago-whatsapp` junta el contexto (total, ya pagado, parciales, envío sin aceptar, referencia repetida) y escribe. A n8n los montos van como número.
- `services/costeo.ts`: `calcularCostoProducto(db, id, ruta, memo)`; `precargarCosteo(db)` trae todas las recetas en una consulta. El caché vive una petición.
- `server.ts`: sin `HOST` escucha en `127.0.0.1` y `::1` (en Windows «localhost» prueba primero IPv6).
- `Atencion.celularClave` (últimos 8 dígitos) reemplaza los `endsWith` sobre `celular`.

## Sprint 2 de la auditoría (D101)
| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/agente/config` | `{ numerosPrueba: string[] }` (vacío = el agente atiende a todos) |
| PUT | `/api/agente/config` | Guarda `{ numerosPrueba }` (solo dígitos, 7–15, sin repetidos, máx. 20) |
| GET | `/api/clientes/por-celular/:celular` | `{ cliente }` con sus precios, por los últimos 8 dígitos; `{ cliente: null }` si no existe |
- Tabla `Configuracion(clave, valor JSON)`; clave `agente.numerosPrueba`.
- n8n: «Modo prueba (ERP)» (HTTP, `onError: continue`) → «Normalizar mensaje» (lee el cuerpo de «Mensaje de WhatsApp (Evolution)»; guarda la última lista en static data). `errorWorkflow` = «ERP Dulzura - Aviso de fallas del agente» (`n4Xt9hMkyM0j3ox2`).
- Postgres «ventas»: `dulzura_chat_memoria.creado timestamptz default now()` e índice `(session_id, creado)`.

## Ventas demo fuera de los totales (D100)
- `sinVentasDemo()` en `routes/ventas.ts`: `OR [pedidoId null, pedidoId notIn (Pedido.ventaPedidoId de los esDemo)]`, aplicado en `GET /api/ventas` y en las tres consultas de `reporte-clientes`. El OR con null evita que `NOT IN` descarte las ventas de Caja sin pedido.

## Sprint 1 de la auditoría (D99)
- `HOST` (por defecto `127.0.0.1`) en `server.ts`; `.env.example` lo documenta.
- `app.ts`: `express.json({ limit: "15mb" })` solo en `/api/pedidos/pago-whatsapp` y `/api/pedidos/:id/pago`; `100kb` en el resto. `errors.ts` responde 413 a `entity.too.large`.
- Comprobante: `^data:(image/(jpeg|jpg|png|webp|gif|heic|heif)|application/pdf);base64,`. `frontend/src/pedidos.ts` `abrirArchivo` abre solo tipos seguros; el resto se descarga como `application/octet-stream`.
- `erp-prueba` (launch.json) corre con `N8N_WEBHOOK_ENVIO=""`: las pruebas en la copia no le escriben a nadie.

## Los pedidos se anotan en Caja (D98)
- Caja con `modo` `AHORA` (`api.crearPedido`, venta inmediata) o `ENTREGA` (`api.crearPedidoEntrega` con `fechaEntrega`, `horaEntrega`, `entrega`, `ubicacion`, `costoEnvio`, `nota` y `pago` opcional). `lineasSchema` de pedidos acepta `precioUnitario` (acordado > anotado > precio de venta). `FormularioPedido` queda solo para editar.

## «Ya está agendado» al confirmar el pago (D97)
- `POST /api/pedidos/:id/pago` acepta `avisarCliente: boolean`; si el cliente tiene celular llama `avisarAlCliente` (atenciones.ts, antes `avisarCostoEnvio`) con `{ tipo: "pago_confirmado", celular, nombre, fechaEntrega, horaEntrega, entrega }` y devuelve `aviso: { enviado, error? } | null`. El costo de envío ahora manda `tipo: "costo_envio"`.

## Pago bueno tras uno rechazado y destino por cuenta (D96)
- `pago-whatsapp` acepta `cuentaDestino` (lo que lee Gemini como «A la cuenta») y `cuentaTitular` (`configuracion_pago.cuenta_receptor`, Postgres «ventas»). Destino válido si coincide el nombre o los últimos 8 dígitos de la cuenta.
- Un comprobante válido sin reenvío usa `actualizarId` sobre la tarjeta `POSIBLE_ESTAFA` pendiente más reciente de la cotización; las otras rechazadas pasan a `RESUELTA`.

## Filtro anti-estafas: fecha de hoy y cero confianza (D95)
- `pago-whatsapp` → `resultado: "por_confirmar" | "incompleto" | "rechazado" | "revision"`, más `faltante`, `monto`, `saldo` y `motivosCliente` (motivos en palabras del cliente).
- Rechazo: fecha ≠ hoy (America/La_Paz) o sin fecha, destinatario ≠ titular del QR, `estadoPago` pendiente/en proceso/rechazado/fallido, `pareceEditado`, nro. de operación ya usado o en espera en otro chat, tercer pago parcial. Revisión (no rechaza): sin cotización, ilegible, pagó de más, delivery sin aceptar.
- Saldo = total − `montoReportado` de las tarjetas pendientes de esa cotización; solo los válidos guardan `montoReportado` (cero confianza). `saldoPendiente` > 0 en un `VERIFICAR_PAGO` = pago parcial.

## PIN de la dueña (D105)

- `services/sesion.ts`: PIN con `scrypt` (sal de 16 bytes) en `Configuracion` «seguridad.pin»; sesiones en un `Map` en memoria (token aleatorio de 32 bytes) con vencimiento por inactividad de 60 min; intentos fallidos (5 → 60 s).
- `routes/sesion.ts` (sin sesión): `GET /api/sesion` → `{ pinCreado, activa, minutosInactividad }`; `POST /pin` (solo si no hay PIN), `POST /entrar`, `POST /salir`, `POST /actividad`, `PUT /pin` (`{ actual, nuevo }`, con sesión).
- `exigirSesion` se monta en `/api` después de `/api/salud` y `/api/sesion`. Sin sesión → 401 `{ sesion: "bloqueado" }`; el frontend lo escucha (`EVENTO_BLOQUEADO`) y muestra el PIN. `createApp({ exigirSesion: false })` solo en las pruebas de la API que no son de la sesión.
- Agente: cabecera `X-Clave-Agente` = «seguridad.claveAgente» (se crea sola). Rutas permitidas en `RUTAS_DEL_AGENTE`; si n8n necesita una ruta nueva, hay que agregarla ahí.
- Frontend: `App` es la puerta (no monta pantallas ni avisos en vivo sin sesión); `hooks/useInactividad.ts`; `components/layout/Bloqueo.tsx` (crear/entrar y `CambiarPin`).
- `npm run pin` (`backend/src/pin.ts`) borra el PIN.

## Reportes (D106)

- `services/reportes.ts`: `armarReporte(desde, hasta)` suma con `Prisma.Decimal` (sin anuladas ni demo; compra de insumos aparte) y `reporteEnExcel` arma el .xlsx con exceljs (las fechas van en hora local).
- `GET /api/reportes?desde&hasta` (JSON) y `GET /api/reportes/excel?desde&hasta` (archivo). Pantalla `pantallas/Reportes.tsx`; el PDF es la impresión del navegador con `@media print`.
- Dependencias nuevas: `exceljs` 4.4.0; `tsx` 4.23.15 (la 4.19.2 fallaba al cargar `generator-function`, dependencia lejana de exceljs). `npm audit`: exceljs trae `uuid` con un aviso moderado que no afecta cómo se usa aquí (solo escribe archivos).

## Instalación en la portátil (D108)

- Carpeta `instalacion/` (finales de línea CRLF por `.gitattributes`; los .bat y el .vbs sin tildes por la página de códigos de cmd/wscript).
- `instalar.bat`: exige Node ≥ 20; apaga el ERP si estaba prendido; `.env` desde `.env.example` si falta; `npm ci`; `prisma generate`; `npm run backup` si ya hay `dulzura.db`; `prisma migrate deploy`; `web:build`; `crear-accesos.ps1`; abre el ERP.
- `servidor.bat`: `PORT=3000`, `node node_modules/tsx/dist/cli.mjs backend/src/server.ts` con salida a `logs/erp.log` (pasa a `erp-anterior.log` sobre 5 MB). El puerto 3000 también está en `iniciar.vbs` y `detener.bat`.
- `iniciar.vbs`: si `/api/salud` no responde, lanza `servidor.bat` oculto y espera hasta 90 s; abre `msedge --app=http://localhost:3000` (o el navegador por defecto). Con `/servidor` no abre ventana (acceso de Inicio de Windows).
- `detener.bat`: `taskkill` del proceso que escucha en 127.0.0.1:3000.
- `instalacion/armar-paquete.ts` (`npm run paquete`): copia `git ls-files --cached --others --exclude-standard` sin `.claude/`; con datos, `VACUUM INTO` de `dulzura.db`, borra «seguridad.pin», avisa de pedidos demo y revisa integridad; zip con `tar -a` en `../dulzura-entrega`.
- Con datos, el paquete además borra los pedidos demo de la copia (corre `demo-pedidos.ts --borrar` con `DATABASE_URL` apuntando a la copia) y pone «agente.whatsapp» = `apagado` (D109).

## WhatsApp encendido o apagado (D109)

- `routes/agente.ts`: `whatsappEncendido()` / `guardarWhatsapp()`; `GET /api/agente/config` → `{ numerosPrueba, whatsapp }`. `backend/src/whatsapp.ts` = `npm run whatsapp [-- encender|apagar]`.
- Frontend: `App` pide la configuración al entrar; mientras no sepa, o si está apagado, el menú no muestra «Atención» y no consulta `/atenciones`. `ModoPruebaAgente` (Inicio) no se muestra con WhatsApp apagado.

## Instalador .exe (D110)

- `armar-paquete.ts`: copia los archivos de git → `web:build` y copia `frontend/dist` → `npm ci --omit=dev` en la carpeta del paquete → `prisma generate` con un `.env` de ejemplo presente (si no, el cliente no anota `schemaEnvPath` y no encuentra `DATABASE_URL`; se revisa y se borra ese `.env`) → copia `process.execPath` a `node/node.exe` → base (VACUUM INTO + `demo-pedidos.ts --borrar` + `limpiar-copia.ts`, ambos con `DATABASE_URL` de la copia) → zip con `tar -a` → .exe con `iexpress /N /Q` (SED generado; el zip va entero porque IExpress no guarda carpetas). La carpeta de salida no puede tener espacios.
- `instalar-exe.cmd` (adentro del .exe, corre con el cmd de 32 bits de IExpress: usa `Sysnative\tar.exe`): `detener.bat` si ya hay instalación, `tar -x` a `C:\` con `--exclude DulzuraERP/database/prisma/dulzura.db` si la base ya existe, luego `instalar.bat`.
- `instalar.bat` usa solo `node\node.exe`: respaldo (`backend/src/backup.ts`) si hay base, `prisma migrate deploy`, accesos y abrir. `servidor.bat`, `olvide-pin.bat` y `whatsapp.bat` usan `node\node.exe` y, en una copia de desarrollo, el `node` de la PC.
- Dependencias: en `dependencies` solo lo que corre el servidor (`@prisma/client`, `prisma`, `tsx`, `express`, `zod`, `exceljs`); React, iconos y fuentes están en `devDependencies` porque las pantallas van compiladas.

## Respaldo por correo (D111)

- `services/correoRespaldo.ts`: `configurarCorreo` (valida Gmail y 16 letras, `transporter.verify()` antes de guardar), `enviarRespaldo(respaldo)` (no lanza: devuelve `{ enviado }` o `{ enviado: false, error }` y anota «respaldo.ultimoEnvio» / «respaldo.errorEnvio»), `enviarSiCorresponde(ultimo, 20 h)`, `estadoCorreo`, `quitarCorreo`. Errores de Gmail traducidos (EAUTH → contraseña de aplicación; sin conexión → se reintenta).
- Rutas: `GET /api/backups` suma `correo: { correo, ultimoEnvio, error }`; `POST /api/backups` suma `correo: null | { enviado, error? }`; `PUT /api/backups/correo` `{ correo, contrasena }` (prueba, guarda, crea un respaldo y lo manda); `DELETE /api/backups/correo`.
- `backup.ts`: `prepararCopia` borra «respaldo.claveCorreo» de la copia temporal y hace `VACUUM` antes de la revisión de integridad y el gzip. Nombre del respaldo: sufijo = mayor existente del mismo segundo + 1.
- `server.ts`: el respaldo automático corre al arrancar y cada hora (antes cada 24 h); después manda por correo si corresponde.
- Frontend: `components/layout/EstadoRespaldo.tsx` (línea del correo en el pie) y `CorreoRespaldo.tsx` (ventana). Dependencia nueva: `nodemailer` 10.3.1 (trae sus tipos, sin dependencias).

## Actualización desde GitHub (D112)

- `services/actualizacion.ts`: `revisarActualizacion(forzar)` (Release `latest` de `Lin4saurus/bakery-erp-whatsapp` → asset `actualizacion.json`; caché 6 h), `instalarActualizacion()` (202; corre en segundo plano: `bajando` → `preparando` → `reiniciando` | `error`), `esInstalacion()` (`node/node.exe` y sin `.git`), `compararVersiones`. Descargas con `http`/`https` de Node siguiendo hasta 5 redirecciones (el `fetch` de Node podía tirar un error interno no atrapable). `DULZURA_ACTUALIZACIONES=<url>` cambia la fuente (pruebas).
- Rutas: `GET /api/actualizacion[?revisar=1]`, `GET /api/actualizacion/estado`, `POST /api/actualizacion/instalar`. `GET /api/salud` → `{ ok, version }`.
- `instalacion/aplicar-actualizacion.bat "<raíz>" "<nueva>" <pid>`: espera el proceso (PowerShell `WaitForExit`, 30 s y si no lo cierra), robocopy `/MIR` de backend, frontend, instalacion, node_modules y node (si vienen), `/E` de database sin `*.db*`, `/LEV:1` de la raíz sin `.env`; `prisma generate` y `migrate deploy` con `CHECKPOINT_DISABLE=1` (registro aparte en `logs/actualizacion-prisma.log`); `iniciar.vbs /servidor`; borra lo bajado.
- `server.ts`: al cerrar corta todas las conexiones (`closeAllConnections`) y sale a los 5 s si algo se cuelga.
- Frontend: `components/layout/Actualizacion.tsx` (`AvisoActualizacion` en el Inicio, `VersionErp` en el pie, ventana de avance). `App` recarga la página si el servidor vuelve con otra versión.
- Armado: `armar-paquete.ts` exporta `prepararCarpeta` (con o sin dependencias y datos; escribe `dependencias.json` con la huella), `comprimir`, `sha256`, `huellaDependencias`. `publicar.ts` usa esas piezas. Nombres con la versión: `DulzuraERP_Instalador_<v>.exe`.
- Publicar una versión: subir `version` en package.json → commit y push → `npm run publicar -- --notas "…"`.

## Velocidad al abrir (D113)

- `services/reportes.ts` importa exceljs con `await import("exceljs")` dentro de `reporteEnExcel` (es CommonJS: las clases quedan en `default`). `correoRespaldo.ts` hace lo mismo con nodemailer.
- `armar-paquete.ts` → `compilarServidor`: esbuild `buildSync` de cada `.ts` de `backend/src` a `backend/js` (cjs, sin juntar en un archivo, para conservar `__dirname`). `backend/js/` está en `.gitignore`.
- `frontend/src/api.ts`: `pedir` comparte las consultas GET iguales mientras están en camino (`enCamino`); POST/PUT/DELETE nunca.
- `App.tsx`: `revisar` pide `/api/salud` y `/api/sesion` en paralelo; al saber que hay WhatsApp cuenta los chats directo (antes disparaba «dulzura:avisos» y recargaba el Inicio).

## Abrir aún más rápido (D115, versión 1.0.2)

- `App.tsx`: solo `Inicio` va en el paquete inicial; las otras 10 pantallas son `lazy` (`cargadores`) y `precargarPantallas` las baja con `requestIdleCallback` apenas se muestra el escritorio, así que el menú no espera. JS inicial 329 kB → 216 kB, CSS 64 kB → 37 kB.
- `frontend/index.html`: pantalla de carga en línea (logo «D», colores del tema) dentro de `#root`; se pinta antes de que llegue el JavaScript y React la reemplaza.
- `app.ts`: `/assets/*` con `Cache-Control: public, max-age=31536000, immutable` (llevan hash); `index.html` sigue `no-cache`. Al reabrir, Edge no pide ningún archivo (27 de 27 desde su caché) y reutiliza el JavaScript ya compilado.
- Lo que queda es el arranque de Edge en frío: en la portátil se puede activar «Aumento de inicio» en edge://settings/system.

## Demo en Vercel (D114)

- `vercel.json`: instala con `npm ci`, construye con `npm run demo:armar`, publica `frontend/dist`; `/api/*` se reescribe a la función `api/index.ts` y lo demás a `index.html`. La función incluye `demo.db`, `package.json`, `backend/js/**` y el cliente de Prisma.
- `demo/armar-demo.ts`: `prisma generate` (solo en Vercel), `migrate deploy` + `seed.ts` + `cargar-queques-2026.ts` + `demo-pedidos.ts` + `demo/ajustar-base.ts` sobre `file:./demo.db`; luego `compilarServidor` (de `armar-paquete.ts`) y `vite build` con `VITE_DEMO=1`.
- `api/index.ts`: copia `demo.db` a `os.tmpdir()` si no está, fija `DATABASE_URL`, `DULZURA_DEMO=1`, `BACKUP_AUTO=false`, `BACKUP_DIR` temporal y `TZ=America/La_Paz`, y recién entonces hace `require("../backend/js/app.js")`.
- Backend con `DULZURA_DEMO=1`: `sesionActiva` y `anotarActividad` devuelven siempre true, `GET /api/sesion` dice `pinCreado: true`, `configurarCorreo` responde 400.
- Frontend: `src/demo.ts` exporta `EN_DEMO` (`import.meta.env.VITE_DEMO === "1"`): aviso `.aviso-demo`, sin botones de PIN, sin `conectarAvisos` ni `VersionErp`.

## Catálogo Rainbow (D115)

- `database/prisma/cargar-rainbow.ts --confirmar`: en una transacción borra (en orden de claves foráneas) atenciones, líneas de pedido, pedidos, precios de cliente, ventas históricas, gastos, movimientos, ventas, sub-recetas, ingredientes, productos, insumos, clientes y `finanzas.gastosFijosMensuales`; luego crea insumos (MATERIA_PRIMA y EMPAQUE), las mezclas INTERMEDIO en gramos (rendimiento = peso de la tanda, huevo ≈ 50 g, −8 %) y los productos de VENTA con rendimiento 1 (una torta o un paquete por tanda), sub-recetas en gramos e insumos sueltos + empaque. Termina con VACUUM.
- `porPersonas` escala la receta por persona al tamaño (caja chica ≤ 4, mediana ≤ 10, grande); `porPaquetes` escala la receta por pieza a las piezas del paquete.

## Descargas del Historial (D116)

- `services/exportarVentas.ts`: `ventasEnExcel`, `ventasEnWord`, `ventasEnPdf` y `totales`. Hora de Bolivia, 24 h. `routes/exportar.ts` valida con Zod (hasta 20 000 filas); `app.ts` monta `express.json({ limit: "5mb" })` solo para esa ruta.
- `docx` 9.5.0 y `pdfkit` 0.17.1 (exactas) con `await import`. Ojo: no importar tipos de `docx` con `import type` (choca la versión CJS con la ESM del import dinámico).
- `Historial.tsx` → `DescargarVentas`: arma `ListaParaDescargar` con `filtradas` y un texto de los filtros, y baja el blob.

## Nombre del negocio (D117)

- `services/negocio.ts`: `CLAVE_NOMBRE = "negocio.nombre"`, `nombreDelNegocio()` (por defecto «Mi pastelería»). `routes/negocio.ts`: `leerNegocio` (montado antes de `exigirSesion`) y `guardarNegocio` (después). Lo usan `reportes.ts` (Excel) y `correoRespaldo.ts`.
- `frontend/src/negocio.ts`: almacén con `useSyncExternalStore` (`useNombreNegocio`, `fijarNombreNegocio`, `cargarNombreNegocio`, `inicialNegocio`); recuerda el nombre en `localStorage["negocio-nombre"]`, que `index.html` lee para la pantalla de carga y el título.
- `Ventana` acepta `angosta` (440 px); `.ventana__cuerpo > .bloqueo__form` lleva padding.

## Tamaños (D118)

- Schema: `Producto.grupo String?`, `Producto.tamano String?`, `@@index([grupo])`. La migración llena los dos partiendo «grupo · tamaño» en los productos de venta.
- `routes/productos.ts`: `armarNombre(nombre, grupo, tamano)` arma «grupo · tamaño» (sin tamaño, grupo y tamaño en null; «·» no se acepta adentro). `PATCH` con otro grupo o categoría lo aplica a los hermanos (mismo `grupo`). `POST /:id/tamanos` {tamano, precioVenta, factor, tamanoActual?}: copia el producto; ingredientes y sub-recetas × factor (4 decimales), EMPAQUE tal cual; si el original no tenía tamaño, pide `tamanoActual` y lo renombra.
- `frontend/src/tamanos.ts`: `agruparTamanos`, `ordenarTamanos` (por el primer número del tamaño), `factorEntre`. Caja: `agregarTamano` (el primer tamaño que no está en el pedido) y `cambiarTamano` (cambia `productoId` y el precio). Recetas: `gruposAbiertos`, `TamanosDelProducto`.
- Caja (D119): `lineasDe(g)`, `unidadesDe(g)`, `masUno(g)` (suma a la última línea del producto o `agregarTamano`) y `menosUno(g)`; una sola forma de tarjeta para productos con y sin tamaños. `.app__contenido:has(> .caja)` quita el máximo de 1400 px.

## Ventas de antes del ERP (D121)

- `services/ventasAnteriores.ts`: `revisarFilas` (valida fecha ≤ hoy, producto, cantidad > 0, total ≥ 0; une el producto por nombre sin tildes ni «·» y estima el costo con `calcularCostoProducto`), `guardarFilas` (createMany en `VentaHistorica`, `fila` = máximo de la hoja + 1, cliente unido por `normalizarNombre`), `plantillaExcel`, `leerExcel` (busca la fila de títulos con «Fecha» y «Producto»; fechas Date o dd/mm/aaaa; números «1.234,50»).
- `routes/historico.ts`: `GET /plantilla`, `POST /anotar` {ventas} (todo o nada; 400 con `detalles` «fila N»), `POST /importar[?probar=1]` {nombre, archivo base64} (8 MB en `app.ts`). `AppError` acepta `detalles`.
- Frontend: `pantallas/VentasAnteriores.tsx` (`UnaPorUna`, `DesdeExcel`); `Ventana` acepta `ancha` (1180 px).
- Compras (D122): `registrarCompra` con `actualizarPrecio` (por defecto true en `POST /api/gastos`) recalcula `precioEnvase`: envases → monto / envases; cantidad → monto / cantidad × contenidoEnvase. Gastos.tsx muestra la casilla en los dos modos.

## Varias reposteras (D126)

- `instalacion/negocio.ts`: `CARPETA_NEGOCIOS`, `baseDelNegocio(id)`, `negocios()`, `nombreEnLaBase(id)`; el CLI reescribe `DATABASE_URL="file:./datos/negocios/<id>/dulzura.db"` y `BACKUP_DIR="backups/<id>"` en `.env`.
- `instalacion/armar-paquete.ts`: `--negocio <id>` obligatorio salvo `--sin-datos`; `BASE` pasa a ser la base de ese negocio; el sufijo del .exe/.zip es `<versión>_<Negocio>`.
- `frontend/src/tamanos.ts` → `ordenarTamanos`: por número; si falta, por precio.

## Optimización (D127)

- `GET /api/ventas/anios` → `[{ anio, total }]` (Caja + anteriores, sin anuladas ni demos). `GET /api/ventas` y `GET /api/historico` aceptan `clienteId`. `GET /api/reportes` omite `ventas` (solo el Excel la usa).
- `Historial.tsx`: pide `${anio-1}-12-25` a `${anio+1}-01-07`; cada respuesta lleva su `anio` para no mostrar la del año anterior mientras carga.
- `instalacion/armar-paquete.ts` → `podarPaquete` (listas `CARPETAS_QUE_SOBRAN`, `ARCHIVOS_QUE_SOBRAN`, `*.map`, archivos de Prisma `*.{cockroachdb,postgresql,mysql,sqlserver}.*`); `instalar.bat` comprueba `backend/js/server.js` y el CLI de Prisma en vez de tsx.
- `instalacion/verificar-paquete.ts`: los hijos corren con un entorno sin `DATABASE_URL`/`BACKUP_DIR` (Prisma carga el `.env` de la PC en el proceso que lo importa).
- `backend/src/services/excel.ts` → `nuevoLibro()`. `frontend/src/api.ts` → `llamar`, `errorDe`, `pedirArchivo`, `guardarArchivo`.

## Servidor en internet (D128, D129)

- Oracle Cloud, `ssh erp-rainbow` (llave en `~/.ssh/ssh-key-2026-11-27.key`). Un ERP por negocio: `systemctl status erp@rainbow erp@dulzura`, registros `journalctl -u erp@dulzura`.
- Código común en `/opt/erp/app` (sin `.env`); cada negocio en `/etc/erp/<negocio>.env`: `DATABASE_URL`, `BACKUP_DIR`, `PORT` (rainbow 3001 → `/opt/erp/datos`, dulzura 3002 → `/opt/erp/dulzura/datos`), `HOST=127.0.0.1`, `ERP_EN_LINEA=1`. El servicio aplica las migraciones al arrancar.
- Actualizar: subir los archivos de `git ls-files` a `/opt/erp/app`, `npm ci`, `npm run web:build` (como usuario `erp`, `HOME=/opt/erp`) y `sudo systemctl restart 'erp@*'`.
- Caddy (`/etc/caddy/Caddyfile`) hace el https de `rainbow.` y `dulzura.164-152-199-105.sslip.io`; puertos 80/443 abiertos en iptables y en la security list de `red-erp`.
- PIN: `ssh -t erp-rainbow sudo erp-pin <negocio>`.
- Negocio nuevo: su `.env` con otro puerto y carpeta, su base, `systemctl enable --now erp@<negocio>` y un bloque más en el Caddyfile.
