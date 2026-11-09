# PROGRESS.md — Bitácora

## 2026-11-02 — Inicio Fase 1
**Hecho**
- Analizado TASK.md y la hoja "Queques" del Excel (valores y fórmulas).
- Creada estructura: `backend/src`, `frontend`, `database/prisma`.
- `database/prisma/schema.prisma`: Insumo, Producto, IngredienteReceta, Venta + enums (UnidadMedida, CategoriaInsumo, CanalVenta). Validado con `prisma validate`.
- Creados TASK.md, status.md, CONTEXT.md, TECH.md, PROGRESS.md.
- Alcance acordado: solo Queques, datos fijos del Excel.

**Problemas conocidos**
- El Excel no trae precio/tamaño de envases, solo costo por gramo (ver CONTEXT.md §4).
- Inconsistencia platillos/etiqueta (0.5 unid = 2 Bs).

## 2026-11-02 — Dudas del Excel
**Hecho**
- Decisiones D1–D8 tomadas con la dueña (CONTEXT.md §1): alcance = todas las variantes de queque, la receta 24/09 reemplaza al base, un precio por insumo (el del base), huevos por unidad a 1 Bs, rellenos como sub-recetas.
- Revisada la hoja Costos: en la hoja Queques, "Queques con relleno" tiene un error de fórmula (Nido/Brigadeiro = 17,500 Bs); se usan los rellenos de la hoja Costos.
- Esquema: nuevo enum `TipoProducto`, campos `tipo` y `unidadRendimiento`, `precioVenta` opcional, modelo `ComponenteReceta`. Validado.
- Costos esperados por producto calculados (CONTEXT.md §4). Rellenos = Excel exacto (29.65 / 25.45 Bs).

## 2026-11-02 — Supuestos confirmados
**Hecho**
- S1–S4 confirmados (D10–D13). Polvo de hornear = 50 g por receta (D14).
- PedidosYa eliminado (D9): fuera `precioPedidosYa`, `CanalVenta`, `canal` y `comision`. Esquema validado.
- Costos recalculados: Queque 13.89 Bs/u, Molde grande 15.39, Quinoa 4.79, Con relleno 19.23.

- Esencia = 50 ml por receta, 1 Bs (D15). Costos recalculados: Queque 14.68 Bs/u, Molde grande 16.29, Quinoa 4.79, Con relleno 19.73.

**Problemas conocidos**
- El Queque molde grande **pierde 0.29 Bs/u** a 16 Bs de venta; el Queque (24/09) deja solo 1.32 Bs/u.
- Abierto y no bloqueante: S6 (coco).

## 2026-11-02 — Seed y cierre de Fase 1
**Hecho**
- `package.json` y `tsconfig.json` (strict) en la raíz, `.env` / `.env.example` y `.gitignore`.
- Migración `20261103034912_init` → `database/prisma/dulzura.db`.
- `seed.ts`: 26 insumos (envases equivalentes, D1), Relleno de Nido, Relleno de Brigadeiro, Queque, Queque molde grande, Queque de quinoa, Queque con relleno y Queque base (histórico, inactivo). Es idempotente.
- `check-seed.ts`: recalcula los costos desde la BD; los 7 productos coinciden con CONTEXT.md §4.
- Fase 1 marcada `[x]`.

**Problemas conocidos**
- `stockActual` y `stockMinimo` quedan en 0: el Excel no tiene inventario. Hay que cargarlo antes de la Fase 3, porque si no las ventas dejarían stock negativo.
- `npm audit`: 4 alertas altas que llegan por el CLI de Prisma; se arreglan con Prisma 7 (ver TECH.md).
- Molde grande con pérdida (−0.29 Bs/u) y S6 (coco) siguen abiertos.

**Próximos pasos**
1. Fase 2: API Express de Insumos y Productos, endpoint de recetas y función de costo unitario (puede reutilizar la lógica recursiva de `check-seed.ts`).

## 2026-11-02 — Precios reales del Excel de control (D16)
**Hecho**
- Revisado `Control_Dulzura_Costos_Ventas_Inventario.xlsx`: hojas Ingredientes, Productos, Recetas, Ventas, Movimientos y Rotación. Encaja con el esquema (Insumo, Producto, IngredienteReceta, Venta).
- Decisión D16: precios de insumos del Excel de control y recetas del Excel anterior. 14 insumos tomaron el envase real; los otros 12 conservan el envase equivalente.
- Aceite pasa de ml a g (el Excel de control lo vende por gramo).
- Seed re-ejecutado (sin reset); `db:check` actualizado y OK.

**Problemas conocidos**
- Queque (24/09) −1.31 Bs/u y Molde grande −3.32 Bs/u: se venden a pérdida con los precios reales.
- Hallazgos del Excel de control para cuando se importe completo: precio de venta vacío en todos los productos; cantidades sospechosas (Oreo/almendra/coco 0.1 g, cacao 0.15 g); unidades mezcladas (plástico film en mtr/unid, leche y condensada en ml/g, esencias en g/ml).
- La hoja Ventas del Excel de control tiene cliente, descuento, canal y estado de pago, que `Venta` no tiene; la hoja Movimientos (entradas/salidas) no tiene tabla todavía. Evaluar en Fase 3.

## 2026-11-03 — Fase 2: API y motor de costeo
**Hecho**
- Express 5.1.0 + Zod 3.24.1. Backend en `backend/src` (app, server, errores, validación, servicio de costeo, rutas).
- Motor de costeo recursivo con sub-recetas y detección de ciclos. El costo se calcula al momento de pedirlo, así que cuando la dueña edita un precio el cambio se ve de inmediato.
- CRUD de insumos y productos; endpoints de receta (completa y por insumo); endpoint de costo detallado.
- Mensajes de validación en español.
- `check-seed.ts` reutiliza el motor de la API.
- 14 tests de integración pasan. Servidor real probado sobre `dulzura.db`.

**Problemas conocidos**
- Un bug encontrado por los tests y corregido: un decimal inválido ("abc") daba 500 en vez de 400.
- Sin CORS: el frontend (Fase 4) deberá usar el proxy de Vite hacia `/api`.
- `npm audit` sigue con las alertas del CLI de Prisma (ver TECH.md).

**Próximos pasos**
1. Fase 3: cargar stock inicial (hoy en 0) y crear `crearVenta` en una transacción (Venta + descuento de insumos, incluidas las sub-recetas, + ganancia). Evaluar `MovimientoInventario` para registrar compras y salidas, como la hoja Movimientos del Excel de control.

## 2026-11-03 — Fase 3: ventas e inventario
**Hecho**
- Migración `20261103040944_inventario`: enum `TipoMovimiento` y tabla `MovimientoInventario`.
- `services/inventario.ts`: `explotarInsumos` (recursivo con sub-recetas), `registrarMovimiento` y `alertaDe`.
- Stock: compras (por gramos o por envases, con actualización opcional del precio), ajustes con motivo, historial y alertas.
- Ventas: `POST /api/ventas` transaccional (foto del costo, ganancia, descuento de insumos con su movimiento), listado con resumen y filtro por fechas, y detalle con consumo.
- 25 tests de integración OK. Prueba con el servidor real sobre una copia de `dulzura.db`.

**Decisiones**
- Si falta stock, la venta se registra igual y devuelve alertas (TECH.md §10).

**Problemas conocidos**
- El stock de `dulzura.db` sigue en 0. La dueña debe cargar sus compras (`POST /api/insumos/:id/movimientos`) o un conteo inicial como AJUSTE.
- No hay anulación de ventas; un error de caja hoy solo se corrige con un AJUSTE manual. Conviene agregar «anular venta» (que devuelva el stock) junto con la pantalla de Caja en la Fase 4.

**Próximos pasos**
1. Fase 4: frontend React + Vite con las pantallas de Insumos/Recetas (editar precios y cantidades), Caja y Dashboard (ventas y ganancia del día, alertas de stock).

## 2026-11-03 — Fase 4: frontend
**Hecho**
- React 18.3.1 + Vite 6.0.7. Cuatro pantallas: Inicio (dashboard), Caja, Recetas y precios, Insumos.
- La dueña puede editar desde la interfaz precios de envases, recetas, rendimientos y precios de venta, y cargar compras y ajustes de stock. Los costos se recalculan solos.
- Express sirve el build de producción en el mismo puerto (`npm run web:build` + `npm start`).
- Probado en el navegador sobre una copia de `dulzura.db` (venta, cambio de precio, edición de receta, compra con coma decimal). La copia se borró: `dulzura.db` sigue sin ventas.
- Corregido durante la prueba: «Guardado» aparecía antes de que se recargaran los costos; la hora se partía en dos líneas; la pantalla de Recetas quedaba apretada en ventanas angostas.

**Problemas conocidos**
- Los rendimientos con muchos decimales (ej. 1.2577142857142858) se muestran completos en los campos editables, para no perder precisión al guardar.
- No hay anulación de ventas desde la Caja (ver Fase 3).
- No hay pantalla de historial de ventas por fecha ni de movimientos de un insumo (la API ya lo permite).

**Próximos pasos**
1. Fase 5: script de backup del `.db` comprimido con la fecha (para Google Drive).
2. Recomendado antes de entregar: anular venta, historial de ventas y carga del stock inicial real.

## 2026-11-03 — Rediseño visual tipo Shreyu con modo claro/oscuro
**Hecho**
- Layout de panel administrativo: menú lateral con secciones, barra superior con botón de tema y menú en móvil.
- Tema claro/oscuro con variables CSS, guardado en el navegador y aplicado sin parpadeo.
- Guía de diseño del cliente aplicada: acento tierra único, bordes de 4–6 px, IBM Plex Sans local, íconos Material con contorno, sin gradientes. El CSS quedó separado por componente y por pantalla; se borró `styles.css`.
- Dashboard rehecho con las 4 tarjetas de TASK.md §4b (Caja, Acción rápida, Alertas top 3, Tendencia de 7 días).
- TASK.md actualizado: sección 4b (UX del dashboard) y frontend sin Tailwind.
- Verificado en el navegador en ambos temas, en escritorio y en móvil, sobre una copia de la BD.

**Corregido durante la prueba**
- El gráfico SVG se achicaba con su texto en tarjetas angostas; se rehízo con barras en HTML/CSS.
- La fecha salía como «3 De Noviembre»; ahora solo va en mayúscula la primera letra.

**Pendiente**
- La guía de diseño hablaba de pantallas de login y registro; el sistema no tiene, así que no se crearon.

## 2026-11-03 — Fiado (ventas por cobrar)
**Hecho**
- Migración `fiado`: `EstadoPago` (PAGADO / PENDIENTE), `cliente` y `fechaPago` en `Venta`. Las ventas existentes quedan como PAGADO.
- API: venta fiada con cliente obligatorio, lista de pendientes con total, cobrar (una sola vez).
- Caja: casilla «Fiado» con nombre del cliente, panel «Por cobrar» con botón Cobrar y etiqueta en las ventas de hoy.
- Inicio: «Por cobrar (fiado)» en la tarjeta Caja, con enlace a Caja.
- 28/28 tests. Probado en el navegador sobre una copia de la BD.

**Notas**
- Para regenerar el cliente Prisma hubo que detener el `npm run dev` del usuario (Windows bloquea el motor de Prisma mientras está en uso). Hay que volver a levantarlo.
- El cobro parcial (abonos) no está soportado: un fiado se cobra completo.

## 2026-11-03 — Fase 5: respaldos
**Hecho**
- Servicio de respaldo (VACUUM INTO + integrity_check + gzip con fecha + retención), script `npm run backup`, respaldo automático al iniciar y diario, endpoints `/api/backups` y botón «Respaldar ahora» con «Último respaldo: hace …» en el menú.
- Primer respaldo real en `backups/`; restauración verificada (descomprimido = original).
- 31/31 tests.

**Problemas conocidos**
- Error encontrado por los tests y corregido: con dos respaldos del mismo segundo, el orden por nombre ponía primero el más viejo y la retención borraba el equivocado.
- La subida a Google Drive depende de que Google Drive para escritorio esté instalado y de configurar `BACKUP_DIR`. No hay integración directa con la API de Drive.
- La restauración es manual (documentada en TECH.md).

**Próximos pasos sugeridos**
1. Instalador `.exe` con Electron (objetivo final de TASK.md §3), con `BACKUP_DIR` configurable.
2. Anular venta (devolver el stock) y cargar el stock inicial real.
3. Evaluar Prisma 7 por las alertas de `npm audit` antes de empaquetar.

## 2026-11-03 — Anular ventas
**Hecho**
- Migración `anular_venta`. Endpoint `POST /api/ventas/:id/anular` (transaccional, motivo obligatorio). Devuelve al stock exactamente lo descontado, incluidas las sub-recetas.
- Caja: botón Anular con motivo; las anuladas se ven tachadas. Dashboard, resumen y fiados excluyen las anuladas.
- 34/34 tests; probado en el navegador sobre una copia de la BD.

**Notas**
- Las ventas anuladas no se borran (quedan para auditoría).
- Solo se pueden anular desde la Caja las ventas del día. Para días anteriores existe el endpoint, pero falta una pantalla de historial de ventas.

**Próximos pasos sugeridos**
1. Instalador `.exe` con Electron.
2. Cargar el stock inicial real.
3. Pantalla de historial de ventas por fecha.

## 2026-11-03 — Venta rápida vuelve a Inicio
**Hecho**
- Al registrar una venta (o un fiado) en la Caja, la app vuelve sola a Inicio, que muestra la confirmación, las alertas de stock de esa venta y los totales del día ya actualizados (`frontend/src/ultimaVenta.ts` pasa la venta entre pantallas una sola vez).
- Al cambiar de pantalla, la página vuelve arriba.
- Express manda `index.html` con `Cache-Control: no-cache`, para que después de una actualización el navegador no siga mostrando la versión vieja.

**Notas**
- Cobrar y anular siguen quedándose en la Caja: son acciones sobre la lista de esa pantalla.

## 2026-11-03 — Carga de stock inicial (ficticio)
**Hecho**
- `seed.ts` carga stock y mínimo de prueba en los 26 insumos (`stockPrueba`), con valores de repostería: Harina 25 000 / 5 000 g, Huevo 120 / 30 u, Esencia 200 / 50 ml, etc. Costos y recetas sin cambios (`db:check` OK).
- A propósito quedan con alerta: Polvo de hornear (80 g, mínimo 250) y Caja queque con relleno (8 u, mínimo 20) bajo el mínimo, y Frutilla en 0 (mínimo 500).
- El stock se carga como AJUSTE por la diferencia, con la nota «Stock inicial de prueba (ficticio, reemplazar con el conteo real)», así queda en la bitácora.
- Se salta el insumo si ya tiene un mínimo o alguna COMPRA/AJUSTE, así volver a correr el seed no pisa un conteo real. Se desactiva con `SEED_STOCK_PRUEBA=false`; los tests lo usan para partir de stock 0.
- Antes de correrlo sobre `dulzura.db`: respaldo `backups/dulzura_2026-11-03_16-35-40.db.gz`.

**Notas**
- La BD real tenía 3 ventas de prueba del 2026-11-03 (07:57, hora local) que habían dejado 17 insumos en negativo. Las ventas se conservan; el AJUSTE lleva el stock al valor de prueba.
- No existe «Esencia de limón»; se usó Esencia (vainilla) con el ejemplo de 200 / 50 ml.
- Cuando la dueña haga el conteo real, se carga con Ajuste en Insumos, sobre estos valores.

## 2026-11-05 — Fase 6 (parte 1): Brownies
**Hecho**
- Análisis del Excel `Dulzura ondrive (1).xlsx` (hojas Brownies, Flanes, Semanas 0–3) y decisiones D17–D24 en CONTEXT.md.
- Seed: 8 insumos nuevos y 7 productos de Brownies (la masa como INTERMEDIO en gramos y 6 productos de venta), con stock de prueba para los insumos nuevos.
- `db:check` con los 7 valores nuevos. 4 tests nuevos (38/38). Se actualizaron 2 tests existentes por el cambio de datos (34 insumos; la masa aparece entre los intermedios).
- Corrido sobre `dulzura.db` (respaldo previo `dulzura_2026-11-05_11-43-15.db.gz`). Los 6 productos aparecen en la Caja y en Recetas con su margen.

**Notas**
- Los costos del ERP son algo más altos que los del Excel porque los insumos usan los precios del Excel de control (D17). Ej.: masa 15.33 vs 14.26 Bs.
- El Excel no está en la raíz del proyecto; se leyó desde `C:\Users\User\Downloads\dulzura\`.
- Los tests de Brownies van al final del archivo porque venden y gastan stock que usan los tests anteriores.

**Próximos pasos**
1. Flanes: insumos (Queso crema, Dulce de leche, Ron, Envase flan), Chocoflan y Quesillo venezolano. Esperando confirmación.
2. Tabla `VentaHistorica` e importación (D24).
3. Historial semanal.

## 2026-11-05 — Fase 6 (parte 2): Flanes
**Hecho**
- Seed: 4 insumos nuevos (Queso crema, Dulce de leche, Ron, Envase flan), Chocoflan (10 u) y Quesillo venezolano (8 u), a 15 Bs c/u.
- `db:check` con los 2 valores nuevos y 2 tests nuevos (40/40). Base real actualizada (respaldo previo `dulzura_2026-11-05_11-46-44.db.gz`); los dos aparecen en la Caja.

**Notas**
- Con los precios del ERP los flanes cuestan más que en el Excel: Chocoflan 6.43 vs 5.94 Bs/u; Quesillo 7.30 vs 6.04 Bs/u. Siguen ganando (8.57 y 7.70 Bs/u). La mayor diferencia del Quesillo es la leche en polvo (0.06 vs 0.02 Bs/g).
- No hay un «Flan» solo (D23).

**Próximos pasos**
1. Tabla `VentaHistorica` e importación de las Semanas 1–3 (D24). Esperando confirmación.
2. Historial semanal.

## 2026-11-05 — Fase 6 (parte 3): Ventas históricas
**Hecho**
- Migración `venta_historica` (tabla aparte, `FormaPago`), `database/prisma/datos/ventas-historicas-2024.json` (95 ventas y 2 descartes), `importar-historico.ts` (`npm run db:historico`) y `GET /api/historico` con totales por semana y por producto.
- 4 tests nuevos (44/44). Importado en la base real (respaldo previo `dulzura_2026-11-05_11-49-43.db.gz`).

**Notas**
- Los nombres del Excel se agrupan (ej. «Torta Tres Leches», «Totra Tres Leches» y «Tres leches» → «Tres leches»). «Premium Nutella, Brow» se agrupó con «Nutella, brownie y fresas» (supuesto). Las 7 variantes de Brownies se vinculan a sus productos del ERP (12 ventas).
- «Costo» y «utilidad» se guardan tal como están en el Excel; en algunas filas no son consistentes (a veces el costo es por unidad y a veces por fila).
- En Semana 3, la fila 21 (Mega) tiene un nombre en la columna de notas, al lado del pedido cancelado; no se tomó como cliente.
- El JSON guarda nombres de clientes (sin correos ni celulares).

**Próximos pasos**
1. Pantalla «Historial» con el gráfico por semana y la tabla por producto. Esperando confirmación.

## 2026-11-05 — Fase 6 (parte 4): Pantalla Historial — FASE 6 COMPLETA
**Hecho**
- `pantallas/Historial.tsx` + `Historial.css`, entrada «Historial 2024» en el menú (sección Consulta), `api.historico()` con sus tipos.
- Verificado en el navegador sobre la base real (solo lectura), en escritorio y a 375 px.

**Notas**
- Al publicar un build nuevo, una pestaña ya abierta sigue con el JavaScript anterior hasta que se recarga la página; cambiar de pantalla no basta.

**Próximos pasos sugeridos**
1. Instalador `.exe` (TASK.md §3).
2. Recetas de los productos que más se vendían en 2024 (Tres leches, Fresas con crema) para poder venderlos desde la Caja.
3. Cargar el stock real cuando la dueña haga el conteo.

## 2026-11-05 — Fase 7: Tres leches, fresas y toppings
**Hecho**
- Seed: 8 insumos, 4 toppings (preparaciones) y 8 productos de venta de la hoja «Costos». `db:check` con 12 valores nuevos; 47/47 tests.
- `importar-historico.ts`: los nombres de 2024 apuntan a los productos nuevos; 86 de 95 ventas vinculadas.
- Aplicado en la base real (respaldo previo `dulzura_2026-11-05_12-17-10.db.gz`).

**Notas**
- Con los precios del ERP, el Tres leches cuesta 25.50 (Excel: 21.34), sobre todo por la condensada (0.0253 vs 0.01 Bs/g). Todos dejan ganancia a precio de lista.
- Los toppings no están en ninguna receta: si se venden con el Tres leches, hay que agregarlos como sub-receta o crear el producto combinado.
- «RECETA BROWNIES» de la hoja «Costos» es la masa ya cargada (D27).

**Próximos pasos sugeridos**
1. Confirmar con la dueña cómo se usan los toppings y los precios de venta actuales.
2. Recetas de Frutillita, Feliz cumpleaños y Tres leches personal frutos rojos (la hoja tiene esta última incompleta).
3. Instalador `.exe` (TASK.md §3).

## 2026-11-05 — Gastos operativos y utilidad neta
**Hecho**
- Modelo `GastoOperativo` + migración, `routes/gastos.ts` (crear, listar con totales, borrar), pantalla `Gastos.tsx` y utilidad neta del día y del mes en la tarjeta Caja del Dashboard. 3 tests nuevos (50/50).

**Notas**
- Doble conteo posible: las recetas ya incluyen el insumo «Limpieza y otros» (0.5 Bs por tanda), que es un costo estimado de limpieza. Si la dueña carga también las esponjas y el lavavajillas como gasto, la limpieza se cuenta dos veces. Hay que elegir uno de los dos (o bajar ese insumo a 0).
- Un gasto se resta el día en que se carga (no se reparte en el tiempo): un molde de Bs 45 deja la utilidad neta de ese día en negativo. Por eso el Dashboard muestra también el mes.
- El id es uuid (pedido explícito); el resto de las tablas usa enteros.
- No hay edición: un gasto mal cargado se borra y se vuelve a cargar.

**Decisión (D31):** «Limpieza y otros» se queda en las recetas. La limpieza que se cargue como gasto se resta además de ese costo estimado.

**Próximos pasos sugeridos**
1. Instalador `.exe` (TASK.md §3).

## 2026-11-05 — Dashboard: flujo de caja y punto de equilibrio
**Hecho**
- Dos tarjetas nuevas en Inicio (segunda fila), con cálculos en `components/dashboard/indicadores.ts`. Usan los datos que Inicio ya cargaba (ventas y gastos del mes, productos): sin llamadas nuevas a la API ni cambios en la BD.

**Notas**
- Gastos fijos = 300 Bs de prueba (TODO en el código). No se usan los gastos operativos del mes porque a principio de mes casi no hay y la meta daría casi cero.
- La meta se cuenta en productos vendidos (un pack de brownies y un tres leches mega cuentan 1 cada uno); el margen promedio sale de lo que realmente se vendió.
- Un fiado de un mes anterior cobrado hoy no aparece en «Cobros de fiados» (se leen las ventas del mes).
- Con los datos reales de noviembre el margen promedio es 2,01 Bs (Queque y molde grande se venden bajo el costo), así que la meta da 150 productos.

**Próximos pasos sugeridos**
1. Definir con la dueña los gastos fijos reales del mes.
2. Instalador `.exe` (TASK.md §3).

## 2026-11-05 — Se quita la tarjeta de flujo de caja
- A pedido: dos tarjetas con «caja» en Inicio cansaban la vista. Se quitó «Flujo de caja de hoy» (y con ella el aviso de fiado > 20 %); el punto de equilibrio queda a todo el ancho.

## 2026-11-05 — Caja: productos a la venta y no disponibles
**Hecho**
- `Producto.disponible` (D32), filtro y bloqueo de venta en la API, y la Caja dividida en «A la venta» y «No disponibles por ahora». 51/51 tests.

**Notas**
- Se eligió un dato nuevo en vez de reutilizar `activo`: si no, el Queque base (histórico) aparecería en «No disponibles» como si se pudiera volver a vender.
- En la base real todos los productos quedaron a la venta: la dueña quita los que no está preparando (ej. las fresas).

## 2026-11-05 — Caja: arrastrar entre «A la venta» y «No disponibles»
- Las dos secciones usan las mismas tarjetas y se cambia el estado arrastrando (HTML5 drag and drop).
- Nota: el arrastre nativo no funciona con el dedo en pantallas táctiles; por eso quedan «Poner a la venta» en las tarjetas de abajo y «Quitar … de la venta» al elegir un producto de arriba.

## 2026-11-05 — Caja: arrastre con franja fija
- El arrastre nativo (HTML5) se reemplazó por `hooks/useArrastrar.ts` (eventos de puntero, solo mouse) con una franja fija para soltar, así no hay que desplazarse. Los errores al cambiar la disponibilidad se muestran arriba de la Caja.
- Al cambiar el esquema, el servidor que bloquea a Prisma se detiene: hay que volver a iniciarlo (`npm run dev`) y recargar la página.

## 2026-11-05 — Ventas de días anteriores
- Fecha opcional en `POST /api/ventas` y campo «Fecha de la venta» en la Caja (no se permiten fechas futuras). 53/53 tests.
- Notas: la venta toma el **costo de hoy**, no el del día de la venta (no se guardan precios históricos de insumos). El stock se descuenta al cargarla. Si se carga una venta de un mes ya cerrado, cambia la utilidad de ese mes.

## 2026-11-06 — Insumos de la casa, formularios de Insumos
- «No llevar stock ∞» para Agua y Limpieza y otros (D40): no se cuentan pero siguen costando.
- Insumos: cantidades en kg/L, ajuste escribiendo el stock real, paneles de Editar/Compra/Ajuste a todo el ancho con resumen.
- Clientes: sin columna de lista de precios; mayoristas primero.

## 2026-11-05 — Notas mayoristas desde las fotos
- Las 13 notas se cargaron desde las fotos de las notas de venta, con su Nº (D39). Única diferencia con la tabla CSV: la nota Nº 0053316 es del 03/08/2026, no del 23/06.

## 2026-11-05 — Historial mayorista completo
- Cargadas las 13 notas mayoristas de la tabla de la dueña (Bs 2.586, 23/06–03/08/2026); corrige las fechas de las notas de 12 × 18 Bs (julio, no agosto) y agrega 2 notas (D38).
- Pendiente de decidir: la hoja «AGOSTO» del Excel (30 ventas de la promoción 3×50 / 2×35, sin año) no se cargó.

## 2026-11-05 — Minoristas del Excel 2024
- 56 clientes minoristas creados desde el Excel 2024 y vinculados a sus ventas del historial (D37). «Venta esquina» no se creó. Algunos nombres traen errores de tipeo del Excel; se corrigen en Clientes → Editar.

## 2026-11-05 — Fase 8: clientes mayoristas
**Hecho**
- Clientes, listas de precios, venta con cliente (precio de lista bloqueado, sabores), reporte por cliente, notas 2026 como historial, pantalla Clientes, cliente en la Caja, Historial con tres vistas y tarjeta de top mayoristas. 61/61 tests.

**Notas**
- **Vender queque a 12 Bs da pérdida con los costos actuales** (Queque 24/09 = 17,31 Bs/u): 6 queques a Mercado Primavera dejan −31,84 Bs. Hay que revisar con la dueña qué receta usan esos queques o el precio.
- Las notas del 02/08 y 04/08 (12 queques a 18 Bs) quedaron como dicen las notas, aunque 18 es más que el precio minorista.
- Desde D46/D48 cada sabor es un producto con su costo, y la Caja registra pedidos de varios sabores a la vez; el campo `sabores` queda solo para ventas anteriores.
- El historial de un cliente junta lo de la Caja y lo del historial (notas 2026).

**Próximos pasos sugeridos**
1. Revisar con la dueña el costo/precio del queque mayorista.
2. Gráfico semanal minoristas vs. mayoristas (Tarea 5.4, «reportes futuros»).
3. Instalador `.exe`.

## Plan anterior (cumplido)
1. `package.json` del backend con Prisma + TypeScript.
2. `seed.ts` con insumos, rellenos y 5 queques.
3. Primera migración y verificación contra la tabla §4.
