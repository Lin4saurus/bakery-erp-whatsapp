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