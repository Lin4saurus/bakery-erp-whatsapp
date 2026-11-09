# CONTEXT.md — Reglas de negocio y datos del Excel

Fuentes:
- **Recetas**: `Dulzura ondrive (1).xlsx`, hojas **Queques** y **Costos** (bloques de queques y rellenos).
- **Precios de insumos**: `Control_Dulzura_Costos_Ventas_Inventario.xlsx`, hoja **Ingredientes** (envases reales). Ver D16.
Alcance actual: **solo la línea Queques** (todas sus variantes). El resto del catálogo queda para después.

## 1. Decisiones tomadas con la dueña (2026-11-02)
| # | Tema | Decisión |
|---|------|----------|
| D1 | Envases | El Excel no trae precio/tamaño de envase. Se usa un **envase equivalente** que reproduce el costo por gramo (ej. Mantequilla 1000 g a 25 Bs). Se corrige luego con precios reales. |
| D2 | Platillos/etiqueta del queque base | Costo fijo por tanda, como en el Excel. |
| D3 | Harina | **0.0065 Bs/g** (Excel). |
| D4 | Variantes | Entran **todas** las variantes de queque. |
| D5 | Precio por insumo | Un solo precio por insumo. Si las recetas difieren, manda el **precio del queque base**. |
| D6 | Huevos | Por **unidad, 1 Bs c/u**. Queque base = 8 huevos (hoja Costos). |
| D7 | Rellenos | Son **sub-recetas** (`Producto` tipo `INTERMEDIO` + `ComponenteReceta`). Se toman de la hoja Costos; la hoja Queques tiene un error de fórmula (17,500 Bs). |
| D8 | Receta 24/09 | **Reemplaza** al queque base ("salían muy blandos"). El base se carga como histórico (`activo = false`). |
| D9 | PedidosYa | **Fuera del sistema.** La dueña ya no trabaja con esa app: sin precio PedidosYa, sin canal y sin comisión. |
| D10 | Etiqueta | 0.7 Bs/u (S1 confirmado). |
| D11 | Envases | Dos insumos: "Envase queque" 0.5 Bs/u y "Caja queque con relleno" 3 Bs/u (S2 confirmado). |
| D12 | Leche | "Leche en polvo" y "Leche Nido" son insumos distintos (S3 confirmado). |
| D13 | Relleno de Nido | Lleva 400 g de chantimix (2 × 200 g) (S4 confirmado). |
| D14 | Polvo de hornear | **50 g por receta (1.75 Bs)**. Reemplaza el 0.2 de las recetas 24/09 y con relleno; el molde grande (×3.2) usa 160 g. La quinoa conserva sus 5 g. |
| D15 | Esencia | **50 ml por receta**. Reemplaza el 0.2 de las recetas 24/09 y con relleno; el molde grande (×3.2) usa 160 ml. La quinoa conserva sus 10 ml. |
| D16 | Fuente de precios (2026-11-02) | **Precios de insumos = Excel de control** (envases reales); **recetas = Excel anterior**. Reemplaza los precios de D1, D3, D5, D6, D10 y los valores en Bs de D14/D15. Los insumos que no están en el Excel de control conservan el envase equivalente de D1. Los nombres del sistema no cambian; §2 indica la fila del Excel de control. |

### Fase 6 — Brownies, Flanes y ventas históricas (2026-11-05)
Fuente: `Dulzura ondrive (1).xlsx`, hojas «Cosoto Bronies», «Flanes» y «Semana 0–3». Se aplicaron las recomendaciones del análisis.

| # | Tema | Decisión |
|---|------|----------|
| D17 | Precios | Sigue D16: los insumos que ya existen conservan su precio del Excel de control (Mantequilla 0.025, Esencia 0.06, Huevo 0.667…). Por eso los costos del ERP **no son iguales** a los del Excel (masa de brownie 15.33 Bs en vez de 14.26). Los insumos nuevos usan el Bs/unidad del Excel con envase equivalente (D1). «Vainilla» = Esencia; «Frutillas» = Frutilla. |
| D18 | Toppings | Insumos nuevos **Nutella** (0.057 Bs/g) y **Topping Nido** (0.03 Bs/g). No es la «Leche Nido» (0.2 Bs/g) ni el Relleno de Nido. |
| D19 | Envases y producto individual | **Caja brownie** 3 Bs/u (packs) y **Envase brownie personal** 1 Bs/u. Se agrega **Brownie personal premium** (1 u, 10 Bs): la columna «BROWNIES Premium 9unid» de la derecha es en realidad un brownie individual. No se crea un personal clásico (no hay receta). |
| D20 | Modelo de brownies | **Brownies (masa)** es INTERMEDIO en gramos (rinde 743 g, huevos a 40 g). Cada brownie = 80 g (Excel: 743 / 80 = 9.2875). Los packs se venden **por caja** (rinde 1, precio por caja) y usan 80 g × N de masa. Cada pack lleva 1 etiqueta (0.5 Bs); el Excel pone 0.5 o 0.25 Bs según la columna. |
| D21 | Premium 9 | La fórmula del Excel está rota (suma celdas vacías → 0). Se usa la suma real de sus componentes. |
| D22 | Brownies 16 u | Receta propia (no usa la masa): masa × 2.45 + 16 bolsas + 16 etiquetas + 150 g chocolate blanco + limpieza 0.5; se venden sueltos a 5 Bs. Las etiquetas cuestan 0.5 c/u (Excel: 0.2). |
| D23 | Flanes | No hay un «Flan» solo en el Excel: los 59.39 Bs son del **Chocoflan** (flan + queque de chocolate). Se cargan Chocoflan y Quesillo venezolano. Cocoa a 0.05 (precio de Brownies; Flanes usa 0.06) y etiqueta a 0.5 (Flanes usa 0.25), por D5. El dulce de leche del Quesillo se calcula a 0.03 Bs/g (6 Bs), no los 8.70 escritos a mano en el Excel. |
| D24 | Ventas históricas | Opción **C**: tabla aparte `VentaHistorica` (no toca inventario, costos ni catálogo) con vínculo opcional a un producto del ERP. Semana 1 con fechas reales; Semana 2 = 05–11/02/2024 y Semana 3 = 12–18/02/2024 (fecha estimada por el día de la semana). Se descartan Semana 0, Semana 0 (2), la fila de 380 Bs sin producto (Semana 2) y la venta cancelada (Semana 3). Se guarda el nombre del cliente, **no** correo ni celular. El gráfico de 7 días no aplica (ventas de 2024): se mostrará un historial semanal aparte. |

### Fase 7 — Tres leches, fresas y toppings (2026-11-05)
Fuente: `Dulzura ondrive (1).xlsx`, hoja «Costos». Se aplicaron las recomendaciones del análisis.

| # | Tema | Decisión |
|---|------|----------|
| D25 | Toppings 3 leches | Se cargan como **preparaciones** (INTERMEDIO, en gramos; rinden lo que pesan sus ingredientes), no como productos de la Caja. El Excel les pone «C/Venta 25» y «Precio 5», que no cuadran, y ninguna receta de Tres leches los usa. |
| D26 | Tres leches personal | El Excel dice azúcar 1 y harina 3: se usa **30 g** de cada uno (un tercio de la de tamaño normal, que lleva 90 g). |
| D27 | Brownie en las fresas | 3 brownies = **240 g** de masa (80 g por brownie, D20). La hoja «Costos» divide la masa en 90 g por brownie. «RECETA BROWNIES» de esa hoja es la misma masa ya cargada. |
| D28 | «Crema» y «Leche» | «Crema» de las fresas = **Crema de leche**. «Leche» de los toppings = **Leche** (ml). |
| D29 | Frutilla y precios | Un solo precio por insumo (D5/D17): frutilla 0.015, chocolate 0.03, Nutella 0.057, condensada 0.0253 (el Excel usa varios precios en la misma hoja). La frutilla de los tres leches va en gramos (la personal lleva 1 g, decoración). |
| D30 | Precios de venta | Los «C/Venta» de la hoja (fresas 20/25/30, bañadas 25, tres leches 20/55/95/125). En 2024 a veces se cobró menos (ej. fresas 18). Las ventas históricas quedan vinculadas a estos productos (86 de 95). |

### Gastos operativos (2026-11-05)

| # | Tema | Decisión |
|---|------|----------|
| D31 | Limpieza | El insumo **«Limpieza y otros» se queda en las recetas** (costo estimado por tanda, ej. 0.5 Bs). Por eso, en la pantalla Gastos con categoría «Limpieza» la limpieza puede contarse dos veces: la utilidad neta queda algo más baja (conservadora). Los servicios básicos no se cargan (se comparten con la familia). |

### Productos de temporada (2026-11-05)

| # | Tema | Decisión |
|---|------|----------|
| D32 | A la venta / no disponible | Nuevo dato `Producto.disponible`, distinto de `activo`. **activo** = sigue en el catálogo (false = retirado, como el Queque base histórico, que no aparece en la Caja). **disponible** = la dueña lo está vendiendo ahora; se apaga cuando no lo prepara (cansancio, temporada) y se prende para una fecha especial, desde la misma Caja. Un producto no disponible no se puede vender (422). Al crear la columna todos quedaron disponibles; el seed no la toca. |

### Fase 8 — Clientes mayoristas (2026-11-05)

| # | Tema | Decisión |
|---|------|----------|
| D33 | Clientes y listas | Tablas `Cliente` (MINORISTA / MAYORISTA; no se borran, se desactivan), `ListaPrecios` (con descuento % para productos sin precio fijado) y `PrecioProducto`. Seed: listas «Minorista» (precio de venta), «Mayorista Primavera» (Queque 12 Bs) y «Eliana» (Queque 13 Bs); clientes Mercado Primavera y Eliana (mayoristas) y Mostrador (minorista). Sin celulares inventados. |
| D34 | Venta con cliente | El precio sale de la lista del cliente y no se edita a mano (422 si se envía otro). Mayorista con **más de 5 unidades** debe indicar sabores (Vainilla, Coco, Naranja, Oreo, Chocolate, Almendra); se guardan como texto en `Venta.sabores`. La regla aplica a cualquier producto, como se pidió. `Venta.cliente` (texto de los fiados) se mantiene y se llena con el nombre del cliente registrado; la relación se llama `clienteRegistrado` para no chocar con ese campo. |
| D35 | Notas mayoristas 2026 | Las notas de julio–agosto 2026 se cargan como **historial de consulta** (`VentaHistorica`, hoja «Notas 2026»), como las de 2024: no descuentan stock y no tienen costo ni utilidad (no se conocen los precios de insumos de esas fechas; `costo`/`utilidad` pasan a ser opcionales). Se registran aunque se haya vendido a pérdida: son ventas genuinas. Producto: «Queque». Las de 12 unidades a 18 Bs (02/08 y 04/08) se cargan como dicen las notas. |
| D36 | Tipo de una venta | Sin cliente o con cliente minorista = minorista; con cliente mayorista = mayorista. Ajustes técnicos al esquema pedido: `productoId Int` (los productos usan ids enteros), sin `@db.Decimal` (SQLite no lo admite) y sin `@@map` (convención del proyecto). |
| D37 | Minoristas del Excel | El seed crea como clientes MINORISTA (lista «Minorista») a los 56 nombres de la columna «Cliente» de las ventas 2024, leídos de `datos/ventas-historicas-2024.json`. «Venta esquina» se omite (es un lugar, no una persona). Los nombres quedan como en el Excel (con sus errores de tipeo); la dueña puede corregirlos en Clientes. `npm run db:historico` vincula esas 56 ventas a su cliente. |
| D38 | Notas mayoristas completas | La tabla que envió la dueña (`datos/notas-mayoristas-2026.csv`) reemplaza a las notas dictadas en la Fase 8: **13 notas, Bs 2.586** (Mercado Primavera 12 / Bs 2.508; Eliana 1 / Bs 78), del 23/06 al 03/08/2026. Corrige las dos notas de 12 queques a 18 Bs: son del **02/07 y 04/07** (no de agosto) y traen sus sabores; agrega 23/06 (21 × 12) y 27/07 (17 × 12). La hoja «AGOSTO» del Excel (promoción 3×50 / 2×35, sin año) no se importa. |
| D39 | Notas desde las fotos | Fuente final de las notas mayoristas: las **fotos de las notas de venta** (Nº 0053303–0053318). 13 notas, Bs 2.586 (Primavera 12 / Bs 2.508; Eliana 1 / Bs 78). La nota **Nº 0053316** (21 queques, Bs 252) es del **03/08/2026** según la foto y su numeración (la tabla CSV decía 23/06). En `VentaHistorica`, `fila` = Nº de la nota y el Historial lo muestra. El importador borra las filas de una hoja que ya no figuran en su archivo. |
| D40 | «No llevar stock» | `Insumo.controlaStock` (por defecto true). En false: la venta no lo descuenta (ni movimiento ni alerta), no acepta compras ni ajustes (422), no aparece en alertas y la pantalla muestra **∞ Sin control** y mínimo «—». **Su costo sigue entrando en las recetas.** Marcados: **Agua** (agua de la casa) y **Limpieza y otros** (costo fijo por tanda). Se marca o desmarca en Editar. El seed solo lo fija al crear el insumo. |
| D41 | Sin «Registro» ni forma de pago | El Historial no muestra de dónde viene cada venta (Caja / Excel / Nota Nº) ni cómo se pagó, y el historial de cada cliente no muestra «Origen». Se quitó `VentaHistorica.formaPago` (y el enum `FormaPago`) de la BD, el importador y los JSON de datos (migración `quitar_forma_pago`; los 95 valores de 2024 siguen en el Excel original). `hoja`/`fila` quedan en la BD porque la importación los usa para no duplicar, pero la API ya no los expone. Anula lo de D39 sobre mostrar el Nº de nota. |
| D42 | Precio por cliente, sin listas | Cada mayorista regatea su propio precio, así que no hay «lista estándar»: se quitaron `ListaPrecios` y `PrecioProducto` (y el desplegable «Lista de precios» de Clientes). Ahora `PrecioCliente` guarda el precio acordado con cada mayorista por producto; se edita en Clientes → «Precios». Migración `precios_por_cliente` copió los precios existentes (Primavera: Queque 12; Eliana: Queque 13). Los minoristas pagan el precio de venta. Sin precio acordado, en la Caja el precio se puede escribir (regateo). Reemplaza la parte de listas de D33/D34. |
| D43 | Corregir y eliminar ventas | Desde el Historial cada venta tiene **Editar** y **Eliminar**. **Caja:** se corrige cantidad, precio por unidad, día y sabores; si cambia la cantidad, el stock se ajusta por la diferencia (movimientos «Corrección venta N») y el costo por unidad se mantiene (foto del día). Eliminar devuelve al stock lo descontado (si no estaba anulada) y borra la venta; los movimientos quedan en la bitácora. Anular ahora devuelve lo neto (incluye correcciones). **Anteriores (Excel / notas):** se corrige día, cantidad, total, cliente y sabores (el costo del Excel se ajusta en proporción); eliminar las marca `eliminada` (no se ven ni suman). Las corregidas/eliminadas quedan marcadas y `db:historico` no las pisa ni las revive. Mismas reglas que al vender: precio acordado no se cambia, mayorista con > 5 u pide sabores, sin fechas futuras. |
| D44 | Toda venta con cliente | No hay venta sin cliente: `POST /api/ventas` exige `clienteId` o `clienteNombre`, y un celular (≥ 7 dígitos) si el cliente no lo tiene. Un nombre que no existe (comparado sin mayúsculas ni tildes) crea un cliente minorista con su celular; un celular nuevo actualiza la ficha. Desaparece el campo de texto del fiado. Pantallas: buscador con sugerencias mientras se escribe (Caja, «Buscar cliente» y «Nuevo cliente», que avisa si ya existe); la tabla de Clientes muestra solo mayoristas; el desplegable con todos los clientes se quitó. |
| D45 | Clientes sin «Desactivar» y sin nombres repetidos | A pedido del usuario se quitaron el botón Desactivar/Activar, la casilla «Mostrar desactivados» y `DELETE /api/clientes/:id`: un cliente que no vuelve a comprar sigue en la lista con su historial. (La columna `Cliente.activo` queda en la BD, siempre en true; ningún cliente estaba desactivado.) No puede haber dos clientes con el mismo nombre y apellido: al crear o renombrar, el nombre se compara sin mayúsculas, tildes ni espacios de más (`normalizarNombre` en `validacion.ts`) y responde 409 «Ya existe el cliente…; si es otra persona, agrega su apellido». Distinto apellido = distinto cliente. |
| D46 | Queques reales del Excel «Control_Dulzura_Costos_Ventas_Inventario» | Los queques anteriores (Queque, molde grande, quinoa, con relleno, base) quedaron retirados: sin receta, `activo = false`, fuera de la Caja; sus ventas y notas se conservan con su costo de entonces. Se crearon 11 queques del Excel (Vainilla, Oreo, Almendra, Coco, Chocolate, Naranja, Limón, Frutilla, Marmolado: rinden 1; Marliza Chavez: 5; Zanahoria: 2,5), a Bs 16 cada uno. Los insumos tomaron el envase y el precio del Excel (Azúcar 46 kg/Bs 280, Huevo 300/Bs 200, Cocoa 500 g/Bs 85, Dulce de leche Bs 60/kg…), lo que también cambia el costo de brownies, flanes y tres leches. Nuevos: Aceite o margarina (g), Galletas Oreo, Zanahoria, Esencia de frutilla, Plástico film (1 unidad = 1 metro), Tortera chica/grande. 0,1 y 0,15 de Oreo/almendra/coco/cacao se cargan como 10 g y 15 g (primero se probó 100 g/150 g: el Chocolate costaba Bs 31,28; el usuario lo corrigió). Los precios acordados de Primavera (12) y Eliana (13) pasaron a los 9 sabores. Script: `database/prisma/cargar-queques-2026.ts`. |
| D47 | Categoría de gasto «Uso personal» | Lo que la dueña gasta en sí misma con plata del negocio (`CategoriaGasto.USO_PERSONAL`). Como la plata sale de la caja del negocio, se resta de la utilidad neta igual que los demás gastos; va en su propia categoría (y su propia tarjeta en Gastos) para saber cuánto se retiró así. En SQLite el enum es texto: no requirió migración, solo `prisma generate`. |
| D48 | Caja por pedido: familia → sabores, varios productos por venta | La Caja muestra a la izquierda las familias (categoría del producto, la de más productos primero) y al centro solo los de la familia elegida, en orden alfabético y sin el nombre de la familia («Queque Oreo» → «Oreo»), con su costo de producción y su precio. Tocar un sabor lo agrega al pedido (borde dorado, − cantidad +, el campo solo acepta números); tocarlo otra vez o dejar 0 lo quita. El pedido junta productos de varias familias, muestra total, costo de producción y ganancia, y se registra con `POST /api/ventas/pedido`: una `Venta` por producto con el mismo `Venta.pedidoId` (uuid), en una sola transacción (si una línea falla, no se guarda nada). Cada línea toma el precio acordado del cliente o el de venta (editable si no hay acuerdo) y guarda su costo del momento. Ya no se piden sabores (cada sabor es su producto). Un fiado de varios productos se cobra entero (`POST /api/ventas/pedidos/:pedidoId/cobrar`) y en el reporte de clientes un pedido cuenta una vez. Las ventas anteriores quedan con `pedidoId = null` (venta suelta). `POST /api/ventas` sigue para un solo producto. |
| D49 | Sin «No disponibles» en la Caja | A pedido de la dueña, todo producto activo aparece en su familia (Queques, Brownies, Fresas, Tres leches, Flanes) y se puede vender: con familia → variantes ya no hace falta separar lo que se prepara hoy. Se quitaron la sección «No disponibles por ahora», el arrastre (`useArrastrar`) y `api.cambiarDisponible`; la API ya no rechaza ventas de productos con `disponible = false`. La columna `Producto.disponible` y su filtro `?disponible=` quedan en la API sin uso. Retirar un producto sigue siendo `activo = false` (Recetas y precios). |
| D50 | Las ventas de «Queque» genérico pasan a «Queque Vainilla» | A pedido de la dueña, lo vendido como «Queque» sin sabor es Queque Vainilla, en mayoristas y minoristas. Se cambiaron la venta de Caja del 03-nov (minorista; su costo se recalculó con el de Vainilla: 17,31 → 5,78 Bs/u) y las 13 notas mayoristas 2026 (203 u; siguen sin costo conocido y conservan su texto original y sus sabores anotados). `importar-historico.ts` agrupa «Queque» como «Queque Vainilla» (si no existe, como en la BD de prueba, usa «Queque»). Los otros queques retirados (molde grande, quinoa, con relleno) no cambian. Respaldo previo: `dulzura_2026-11-09_19-15-46.db.gz`. |

## 2. Precios de insumos (Bs por unidad base)
Origen: hoja Ingredientes del Excel de control (D16). Si el insumo no figura ahí, se usa el envase equivalente del Excel anterior (D1).

| Insumo (sistema) | Unidad | Envase | Bs/unidad | Origen |
|---|---|---|---:|---|
| Harina | g | 50000 g · 320 Bs | 0.0064 | ING001 |
| Azúcar | g | 46000 g · 280 Bs | 0.006087 | ING002 |
| Huevo | unid | 300 u · 200 Bs | 0.6667 | ING003 |
| Aceite | **g** | 16500 g · 265 Bs | 0.01606 | ING004 "Aceite o margarina" |
| Leche | ml | 1000 ml · 8 Bs | 0.008 | ING005 |
| Esencia | ml | 1000 ml · 60 Bs | 0.06 | ING006 "Esencia de vainilla" |
| Almendra | g | 1000 g · 90 Bs | 0.09 | ING011 "Nueces / almendras" |
| Etiqueta | unid | 1 u · 0.5 Bs | 0.5 | ING012 "Empaque/etiqueta" |
| Polvo de hornear | g | 1000 g · 32 Bs | 0.032 | ING014 |
| Coco | g | 1000 g · 90 Bs | 0.09 | ING016 "Coco rayado" |
| Platillo | unid | 1 u · 0.35 Bs | 0.35 | ING017 "Platillos Obleas 18cm" |
| Maicena | g | 1000 g · 8 Bs | 0.008 | ING019 |
| Leche en polvo | g | 2000 g · 120 Bs | 0.06 | ING020 |
| Leche condensada | g | 395 g · 10 Bs | 0.02532 | ING021 (lata de 395) |
| Mantequilla | g | 1000 g · 25 Bs | 0.025 | Excel anterior |
| Agua | ml | 600 ml · 1 Bs | 0.00167 | Excel anterior |
| Yogurt | g | 1000 g · 20 Bs | 0.02 | Excel anterior |
| Harina de quinoa | g | 1000 g · 15.5 Bs | 0.0155 | Excel anterior |
| Azúcar glas | g | 1000 g · 18 Bs | 0.018 | Excel anterior |
| Frutilla | g | 1000 g · 15 Bs | 0.015 | Excel anterior |
| Crema de leche | g | 1000 g · 12.5 Bs | 0.0125 | Excel anterior |
| Leche Nido | g | 1000 g · 200 Bs | 0.2 | Excel anterior (D12) |
| Chantimix | g | 1000 g · 21 Bs | 0.021 | Excel anterior |
| Envase queque | unid | 1 u · 0.5 Bs | 0.5 | Excel anterior (D11) |
| Caja queque con relleno | unid | 1 u · 3 Bs | 3 | Excel anterior (D11) |
| Limpieza y otros | unid | 1 u · 1 Bs | 1 | Excel anterior |
| Chocolate | g | 1000 g · 30 Bs | 0.03 | Brownies (D17) |
| Cocoa | g | 500 g · 25 Bs | 0.05 | Brownies (D17) |
| Chocolate blanco | g | 1000 g · 30 Bs | 0.03 | Brownies (D17) |
| Nutella | g | 1000 g · 57 Bs | 0.057 | Brownies (D18) |
| Topping Nido | g | 1000 g · 30 Bs | 0.03 | Brownies (D18) |
| Bolsa brownie | unid | 16 u · 4.8 Bs | 0.3 | Brownies |
| Caja brownie | unid | 1 u · 3 Bs | 3 | Brownies (D19) |
| Envase brownie personal | unid | 1 u · 1 Bs | 1 | Brownies (D19) |
| Queso crema | g | 1000 g · 80 Bs | 0.08 | Flanes (D17) |
| Dulce de leche | g | 1000 g · 30 Bs | 0.03 | Flanes (D17) |
| Ron | ml | 1000 ml · 50 Bs | 0.05 | Flanes (D17) |
| Envase flan | unid | 10 u · 12 Bs | 1.2 | Flanes (D17) |
| Leche evaporada | g | 1000 g · 10 Bs | 0.01 | Tres leches (D29) |
| Salsa de frutilla | g | 1000 g · 50 Bs | 0.05 | Fresas |
| Mousse de frutos rojos | g | 1000 g · 57 Bs | 0.057 | Topping personal |
| Envase fresas | unid | 1 u · 2.3 Bs | 2.3 | Fresas |
| Envase tres leches personal | unid | 1 u · 1 Bs | 1 | Tres leches |
| Envase tres leches | unid | 1 u · 2.8 Bs | 2.8 | Tres leches |
| Envase tres leches familiar | unid | 1 u · 7 Bs | 7 | Tres leches |
| Envase tres leches mega | unid | 1 u · 8 Bs | 8 | Tres leches |

## 3. Recetas (una tanda)

**Relleno de Nido** (INTERMEDIO, rinde 1240 g): condensada 400, crema 400, leche Nido 40, leche 50, chantimix 400 (D13), limpieza 0.5 → **32.43 Bs** (0.02615 Bs/g). Con los precios anteriores daba 29.65 Bs, igual al Excel.

**Relleno de Brigadeiro** (INTERMEDIO, rinde 1090.5 g): condensada 400, crema 400, leche Nido 40, leche 50, chantimix 200, limpieza 0.5 → **28.23 Bs** (0.02588 Bs/g). Con los precios anteriores daba 25.45 Bs, igual al Excel.

**Queque** (receta 24/09, rinde 880.4/700 = 1.2577 u, venta 16 Bs): aceite 140, azúcar 180, agua 140, esencia 50 (D15), polvo 50 (D14), harina 260, leche en polvo 20, coco 50, azúcar glas 100, huevos 4 (3 masa + 1 glaseado), envase 1.2577, etiqueta 1.2577, limpieza 0.5.

**Queque molde grande** ("por medidas" = receta 24/09 × 3.2, rinde 2817.28/800 = 3.5216 u, venta 16 Bs): ingredientes ×3.2 (huevos 12.8, esencia 160, polvo 160), envase 3.5216, etiqueta 3.5216, limpieza 0.5.

**Queque de quinoa** (rinde 4 u, venta 20 Bs): mantequilla 100, aceite 60, yogurt 160, azúcar 180, huevos 4, esencia 10, polvo 5, harina de quinoa 250, agua 50, platillo 0.5, etiqueta 0.5, limpieza 0.5.

**Queque con relleno** (rinde 2 u, venta 45 Bs): aceite 160, azúcar 180, huevos 4, esencia 50 (D15), polvo 50 (D14), harina 250, leche en polvo 20, agua 160, frutilla 100, caja 2, etiqueta 2, limpieza 0.5 + **sub-recetas** Relleno de Nido 350 g y Relleno de Brigadeiro 350 g.

**Queque base** (histórico, `activo = false`, rinde 3090/650 = 4.7538 u, venta 12 Bs): mantequilla 150, azúcar 750, huevos 8, esencia 50, polvo 50, harina 1120, almendra 50, agua 600, platillo 0.5, etiqueta 0.5, limpieza 0.5.

### Brownies (Fase 6, D20)
**Brownies (masa)** (INTERMEDIO, rinde 743 g): chocolate 200, mantequilla 110, huevos 3, azúcar 200, harina 65, cocoa 25, esencia 20, limpieza 0.5 → **15.33 Bs** (Excel: 14.26).

**Packs** (rinde 1 caja): masa 80 g × N + caja brownie 1 + etiqueta 1 + limpieza 0.5.
- Brownies clásicos 4 u (30 Bs): 320 g. Brownies clásicos 9 u (55 Bs): 720 g.
- Brownies premium 4 u (38 Bs): 320 g + Nutella 50 + Topping Nido 50. Brownies premium 9 u (70 Bs): 720 g + Nutella 150 + Topping Nido 150.

**Brownies 16 u** (rinde 16, 5 Bs c/u, D22): chocolate 490, mantequilla 269.5, huevos 7.35, azúcar 490, harina 159.25, cocoa 61.25, esencia 49, bolsa 16, etiqueta 16, chocolate blanco 150, limpieza 0.5.

**Brownie personal premium** (rinde 1, 10 Bs): masa 80 g + Nutella 20 + envase personal 1 + etiqueta 1 + limpieza 0.5.

### Flanes (Fase 6, D23)
**Chocoflan** (rinde 10 u, 15 Bs c/u). Flan: huevos 6, azúcar 250, leche condensada 1 lata (395 g), leche 600, esencia 10, queso crema 100. Queque de chocolate: huevos 5, esencia 10, harina 120, azúcar 150, cocoa 30, mantequilla 150, dulce de leche 200, frutilla 100. Más envase flan 10 y etiqueta 10 → **64.29 Bs** (Excel: 59.39).

**Quesillo venezolano** (rinde 8 u, 15 Bs c/u): huevos 10, azúcar 150, leche condensada 1 lata (395 g), leche 600, esencia 10, leche en polvo 230, ron 10, dulce de leche 200, frutilla 100, envase flan 8, etiqueta 8 → **58.38 Bs** (Excel: 48.35). La diferencia sale casi toda de la leche en polvo: 0.06 Bs/g en el Excel de control contra 0.02 en este Excel (+9.20 Bs).

### Toppings, fresas y tres leches (Fase 7, D25–D30)
**Toppings** (INTERMEDIO, en gramos):
- Topping tres leches personal (250 g): dulce de leche 100, mousse de frutos rojos 100, chocolate 50.
- Topping tres leches (500 g): dulce de leche 400, Nutella 50, leche 50. Grande (900 g): dulce de leche 800. Mega (1100 g): dulce de leche 1000 (mismos Nutella y leche).

**Fresas** (rinde 1, envase fresas 1 y etiqueta 1):
- Fresas con crema (20 Bs): frutilla 150, salsa de frutilla 20, crema de leche 250.
- Fresas con crema y brownie (25 Bs): frutilla 100, crema de leche 250, masa de brownie 240 g. Con Nutella (30 Bs): + Nutella 30.
- Frutillas bañadas en chocolate (25 Bs): frutilla 300, chocolate 200, crema de leche 100.

**Tres leches** (rinde 1, etiqueta 1, limpieza 0.5 y su envase):

| | Huevos | Azúcar | Harina | Chantimix | Leche / condensada / evaporada | Frutilla | Envase | Venta |
|---|---:|---:|---:|---:|---:|---:|---|---:|
| Personal | 1 | 30 | 30 | 150 | 50 c/u | 1 | personal (1 Bs) | 20 |
| Tres leches | 3 | 90 | 90 | 300 | 280 c/u | 10 | tres leches (2.8 Bs) | 55 |
| Familiar | 8 | 240 | 240 | 500 | 740 c/u | 50 | familiar (7 Bs) | 95 |
| Mega | 10 | 300 | 300 | 700 | 780 c/u | 80 | mega (8 Bs) | 125 |

## 4. Valores esperados (para verificar el motor de costeo en Fase 2)
Calculados con los precios de §2 (D16). `npm run db:check` los compara contra la BD.

| Producto | Costo tanda (Bs) | Rendimiento | Costo/u (Bs) | Venta (Bs) | Utilidad/u (Bs) |
|---|---:|---:|---:|---:|---:|
| Relleno de Nido | 32.4266 | 1240 g | — | — | — |
| Relleno de Brigadeiro | 28.2266 | 1090.5 g | — | — | — |
| Queque (24/09) | 21.766 | 1.2577 | 17.3059 | 16 | **−1.3059** |
| Queque molde grande | 68.048 | 3.5216 | 19.3229 | 16 | **−3.3229** |
| Queque de quinoa | 16.069 | 4 | 4.0173 | 20 | 15.9827 |
| Queque con relleno | 41.211 | 2 | 20.6054 | 45 | 24.3946 |
| Queque base (hist.) | 31.842 | 4.7538 | 6.6981 | 12 | 5.3019 |
| Brownies (masa) | 15.3334 | 743 g | — | — | — |
| Brownies clásicos 4 u | 10.6039 | 1 | 10.6039 | 30 | 19.3961 |
| Brownies premium 4 u | 14.9539 | 1 | 14.9539 | 38 | 23.0461 |
| Brownies clásicos 9 u | 18.8587 | 1 | 18.8587 | 55 | 36.1413 |
| Brownies premium 9 u | 31.9087 | 1 | 31.9087 | 70 | 38.0913 |
| Brownies 16 u | 54.1418 | 16 | 3.3839 | 5 | 1.6161 |
| Brownie personal premium | 4.7910 | 1 | 4.7910 | 10 | 5.2090 |
| Chocoflan | 64.2861 | 10 | 6.4286 | 15 | 8.5714 |
| Quesillo venezolano | 58.3797 | 8 | 7.2975 | 15 | 7.7025 |
| Topping tres leches personal | 10.2000 | 250 g | — | — | — |
| Topping tres leches | 15.2500 | 500 g | — | — | — |
| Topping tres leches grande | 27.2500 | 900 g | — | — | — |
| Topping tres leches mega | 33.2500 | 1100 g | — | — | — |
| Fresas con crema | 9.1750 | 1 | 9.1750 | 20 | 10.8250 |
| Fresas con crema y brownie | 12.3779 | 1 | 12.3779 | 25 | 12.6221 |
| Fresas con crema, brownie y Nutella | 14.0879 | 1 | 14.0879 | 30 | 15.9121 |
| Frutillas bañadas en chocolate | 14.5500 | 1 | 14.5500 | 25 | 10.4500 |
| Tres leches personal | 8.3721 | 1 | 8.3721 | 20 | 11.6279 |
| Tres leches | 25.5024 | 1 | 25.5024 | 55 | 29.4976 |
| Tres leches familiar | 59.6344 | 1 | 59.6344 | 95 | 35.3656 |
| Tres leches mega | 69.0996 | 1 | 69.0996 | 125 | 55.9004 |

Fase 7 verificada a mano. Ej. Tres leches = huevos 2 + azúcar 0.5478 + harina 0.576 + chantimix 6.3 + leche 2.24 + condensada 7.0886 + evaporada 2.8 + frutilla 0.15 + envase 2.8 + etiqueta 0.5 + limpieza 0.5 = 25.5024.

Brownies y Flanes verificados a mano (Chocoflan: huevos 7.3333 + azúcar 2.4348 + condensada 10 + leche 4.8 + esencia 1.2 + queso crema 8 + harina 0.768 + cocoa 1.5 + mantequilla 3.75 + dulce de leche 6 + frutilla 1.5 + envases 12 + etiquetas 5 = 64.2861). Masa = 6 + 2.75 + 2 + 1.2174 + 0.416 + 1.25 + 1.2 + 0.5 = 15.3334; pack de 4 = 15.3334 × 320/743 + 3 + 0.5 + 0.5 = 10.6039.

⚠ Con los precios reales, **Queque (24/09) y Queque molde grande se venden a pérdida** a 16 Bs. Lo que más pesa en una tanda de Queque 24/09 (21.77 Bs): coco 50 g = 4.50 Bs, esencia 50 ml = 3.00 Bs, huevos 4 = 2.67 Bs, aceite 140 g = 2.25 Bs. Hay que revisar el precio de venta o la receta con la dueña.

## 5. Reglas de costeo del sistema
- `costoUnitarioInsumo = precioEnvase / contenidoEnvase`.
- `costoReceta = Σ(cantidad × costoUnitarioInsumo) + Σ(cantidadSub / rendimientoSub × costoRecetaSub)`.
- `costoUnitarioProducto = costoReceta / rendimientoReceta`.
- Venta: `gananciaBruta = totalVenta − costoTotal`. Los costos se guardan como foto.
- Inventario: vender N unidades descuenta `cantidad × N / rendimientoReceta` de cada insumo, y de forma recursiva los insumos de cada sub-receta.

## 6. Supuestos abiertos
S1–S4 pasaron a decisiones (D10–D13). S5 quedó resuelto (D14 polvo, D15 esencia). S7 se descarta (D9).
- **S6 Coco/Almendra/cocoa** se carga como Coco a 0.03 Bs/g; la Almendra del base vale 0.1 Bs/g.
