# status.md — Estado de milestones

Leyenda: `[x]` completado y verificado · `[>]` parcial, requiere seguimiento · `[ ]` no iniciado

## FASE 1: Fundación y Base de Datos — COMPLETADA
- [x] Estructura de carpetas (`/backend`, `/frontend`, `/database`).
  - Verificación: carpetas creadas en la raíz del proyecto.
- [x] Esquema Prisma (`database/prisma/schema.prisma`): `Insumo`, `Producto`, `IngredienteReceta`, `ComponenteReceta` (sub-recetas), `Venta`, con `Decimal` en montos y cantidades.
  - Verificación: `prisma validate` OK. `prisma migrate dev --name init` creó `migrations/20261103034912_init` y `database/prisma/dulzura.db`.
- [x] Dudas del Excel resueltas (D1–D15 en `CONTEXT.md` §1). PedidosYa eliminado del esquema.
  - Verificación: costos esperados recalculados (§4); los rellenos coinciden exactamente con el Excel (29.65 / 25.45 Bs). `prisma validate` OK y sin referencias a PedidosYa.
  - Queda un supuesto menor (S6 coco) que no bloquea el seed.
- [x] `database/prisma/seed.ts` con 26 insumos, 2 rellenos (sub-recetas) y 5 queques (4 activos + base histórico). Los precios salen del Excel de control y las recetas del Excel anterior (D16).
  - Re-verificación con D16: seed re-ejecutado sobre la misma BD; `db:check` OK con los 7 nuevos valores de CONTEXT.md §4. `typecheck` OK.
  - Verificación: `npm run db:seed` y luego `npm run db:check`, que recalcula el costo desde la BD. Los 7 productos coinciden con CONTEXT.md §4 (tolerancia 0.001 Bs). Corrí el seed 2 veces más: siguen siendo 26 insumos, 7 productos, 73 ingredientes y 2 sub-recetas, sin duplicados. `npm run typecheck` (strict) pasa sin errores.
- [x] `status.md` creado.

## FASE 2: CRUD y Lógica de Costeo — COMPLETADA
- [x] API de Insumos y Productos (Express 5, `backend/src/routes/`): listar, ver, crear, editar y borrar, con validación Zod y mensajes en español.
  - Verificación: tests de integración (`npm test`) para duplicados (409), datos inválidos (400 con el campo que falla), ids inexistentes (404) e ids inválidos (400). No deja borrar un insumo usado en recetas (409, dice en qué productos) ni un producto con ventas o usado como sub-receta.
- [x] Endpoints de receta: `PUT /api/productos/:id/receta` (reemplaza la receta completa, insumos + sub-recetas) y `PUT`/`DELETE /api/productos/:id/receta/insumos/:insumoId` (un insumo).
  - Verificación: tests de flujo completo (crear, recetar, cambiar cantidad, quitar, borrar), insumos repetidos o inexistentes (la receta original queda intacta), solo intermedios como sub-receta y detección de ciclos A→B→A (422).
- [x] Función de costo en tiempo real `calcularCostoProducto` (`backend/src/services/costeo.ts`), expuesta en `GET /api/productos/:id/costo` con detalle por insumo y sub-receta, ganancia y margen.
  - Verificación: los 7 productos coinciden con CONTEXT.md §4. Si se cambia el precio de la harina de 320 a 640 Bs, el costo del Queque sube exactamente 260 g × 0.0064 / rendimiento. Si se cambia la leche condensada, el cambio llega al Queque con relleno a través del relleno. `db:check` usa ahora el mismo motor. Servidor real probado sobre `dulzura.db` con curl. 14/14 tests OK y `typecheck` strict OK.

## FASE 3: Ventas y Descuento de Inventario — COMPLETADA
- [x] Endpoint `POST /api/ventas` (`productoId`, `cantidad`, `precioUnitario` opcional), más `GET /api/ventas` (totales y filtro por fechas) y `GET /api/ventas/:id` (con el consumo de insumos).
  - Verificación: tests. Usa el precio de lista o uno distinto. No vende intermedios ni inactivos (422), ni productos inexistentes (404) o cantidad 0 (400), y en esos casos no registra nada. Los totales del listado cuadran con la suma de las ventas; el filtro de fechas funciona.
- [x] Transacción Prisma: foto del costo, Venta con ganancia, descuento de cada insumo (incluidas sub-recetas) con su `MovimientoInventario`.
  - Verificación: tests. Vender 2 Queques baja la harina exactamente 260 × 2 / 1.2577 g. Vender un Queque con relleno baja la leche condensada según los dos rellenos (400 × (350/1240 + 350/1090.5) / 2). La venta conserva su costo aunque después suba la harina. Probado también con el servidor real sobre una copia de `dulzura.db` (migración aplicada).
- [x] Extra necesario para la fase: tabla `MovimientoInventario` (COMPRA, AJUSTE, VENTA), `POST /api/insumos/:id/movimientos` (compra por cantidad o por envases, con precio nuevo opcional; ajuste con motivo obligatorio), `GET /api/insumos/:id/movimientos` y `GET /api/insumos/alertas`.
  - Verificación: tests de compra (stock y nota), ajuste, validaciones y bloqueo del borrado de insumos con movimientos. 25/25 tests OK y `typecheck` OK.

## FASE 4: Frontend Básico y Dashboard — COMPLETADA
- [x] Pantallas de configuración (`frontend/src/pantallas/Insumos.tsx` y `Recetas.tsx`).
  - Insumos: buscar, crear, editar envase, precio y mínimo (con vista previa del costo por unidad), registrar compras (por envases o cantidad, con precio nuevo opcional) y ajustes.
  - Recetas: lista con margen por producto, editar nombre, rendimiento, precio y estado, editar la receta (cambiar cantidades, quitar, agregar insumos y rellenos), con vista previa del costo antes de guardar, y crear productos nuevos.
  - Verificación en el navegador sobre una copia de `dulzura.db`. Subir el Queque a 20 Bs cambió su margen de −8.2 % a 13.5 %. Bajar el coco de 50 g a 25 g dio una vista previa de ganancia de Bs 4.48 que coincidió con el servidor (costo/u Bs 15.52). Una compra de harina con precio «330,5» (coma decimal) dejó el stock en 50.000 g y el nuevo precio llegó al costo del molde grande (−3.32 → −3.37).
- [x] Caja (`Caja.tsx`): botones por producto, cantidad con − / +, precio editable, total, costo y ganancia en vivo, aviso si se vende bajo el costo, alertas de stock después de vender y ventas del día.
  - Verificación: venta de 3 Queques de quinoa = Bs 60.00, ganancia Bs 47.95. Aparecieron las alertas de 12 insumos y la harina de quinoa bajó 187.5 g (3 × 250 / 4).
- [x] Dashboard (`Inicio.tsx`): ventas, ganancia, costo y unidades del día, aviso de productos que pierden plata, alertas de stock, ventas de hoy y rentabilidad por producto.
  - Verificación: después de la venta mostró Bs 60.00 / ganancia Bs 47.95 / 3 unidades y marcó el molde grande con pérdida. Sin errores en la consola. `typecheck` (backend + frontend) OK, `web:build` OK, 25/25 tests OK. Express sirve el build en el mismo puerto de la API.

## Rediseño visual (tipo Shreyu, claro/oscuro)
- [x] Layout de panel administrativo: menú lateral con secciones e íconos, barra superior con título, fecha, perfil y botón de tema. En móvil el menú se abre con un botón.
  - Verificación en el navegador a 1366×768 y 375×812, sobre una copia de `dulzura.db` con 3 ventas de prueba (la copia se borró).
- [x] Modo claro / oscuro solo visual: variables CSS por tema en `styles/globals.css`, elección guardada en `localStorage` y aplicada antes de pintar (sin parpadeo). Si no hay elección guardada, usa el tema del sistema.
  - Verificación: el clic en el botón cambia `data-theme` y el fondo (`rgb(246,246,246)` en claro). Las 4 pantallas se revisaron en los dos temas, sin errores en la consola.
- [x] Guía de diseño aplicada: bordes de 4–6 px, un solo acento (#8B6F47 tierra), éxito y error sobrios, IBM Plex Sans local (@fontsource, funciona sin internet), íconos Material con contorno (react-icons/md), sin gradientes ni animaciones, grilla de 8 px y un CSS por componente.
- [x] Dashboard según TASK.md §4b: Caja (venta del día, ganancia neta, por cobrar), Acción rápida (botón verde), Alertas (top 3 con semáforo) y Tendencia (barras de 7 días).
- [x] Fiado (ventas por cobrar): migración `20261103045744_fiado` (`EstadoPago`, `cliente`, `fechaPago` en `Venta`); `POST /api/ventas` con `fiado` + `cliente` (obligatorio si es fiado); `GET /api/ventas/pendientes` (lista y total); `POST /api/ventas/:id/cobrar`.
  - Caja: casilla «Fiado» que pide el nombre del cliente, panel «Por cobrar» con botón Cobrar y etiqueta «Fiado» en las ventas de hoy. Inicio: «Por cobrar (fiado)» en la tarjeta Caja.
  - Verificación: 3 tests nuevos (cliente obligatorio, estado PENDIENTE/PAGADO, total por cobrar, cobro único con 409 si se repite, 404). 28/28 OK. En el navegador, sobre una copia de la BD: fiado de Bs 45 a «Doña Rosa» → tarjeta Caja «Por cobrar Bs 45,00 · 1» → Cobrar → Bs 0,00. Sin errores en la consola.
- Verificación general: `typecheck` (backend + frontend) OK, `web:build` OK, 25/25 tests OK, `db:check` OK.

## Anular ventas
- [x] Migración `anular_venta`: `anulada`, `fechaAnulacion`, `motivoAnulacion` en `Venta` y `TipoMovimiento.ANULACION`. `POST /api/ventas/:id/anular { motivo }` en una transacción: devuelve cada salida de la venta como movimiento ANULACION y marca la venta. Las anuladas siguen en el listado pero no suman en el resumen, en pendientes ni en el dashboard, y no se pueden cobrar.
  - Caja: botón «Anular» en cada venta de hoy, con motivo obligatorio; la venta queda tachada con la etiqueta «Anulada».
  - Verificación: 3 tests nuevos (stock de harina y leche condensada vuelve exacto, con sub-recetas incluidas; el resumen vuelve al valor anterior; historial con ANULACION; doble anulación 409; motivo 400; fiado anulado fuera de pendientes y sin cobro). 34/34 OK. En el navegador, sobre una copia de la BD: al anular 2 Queques con relleno, la leche condensada volvió de −241.28 a 0, se devolvieron 17 insumos, el total del día bajó a Bs 16 y el dashboard dejó de contar la venta. Sin errores en la consola.

## Venta rápida vuelve a Inicio
- [x] Al registrar una venta o un fiado en la Caja, la app pasa a Inicio con la confirmación, las alertas de stock y los totales ya actualizados. Al cambiar de pantalla se vuelve arriba. `index.html` se sirve con `Cache-Control: no-cache`.
  - Verificación en el navegador sobre una copia de la BD (borrada después): venta de 1 Queque de quinoa → `#inicio` con scroll 0, aviso «Venta registrada: 1 × Queque de quinoa = Bs 20,00 (ganancia Bs 15,98)», aviso de 12 insumos bajo el mínimo y la tarjeta Caja de hoy actualizada. Cabeceras: `/`, `/index.html` y `/caja` con `no-cache`; `/assets/*.js` sin cambios. `typecheck` OK, 34/34 tests OK.

## Carga de stock inicial (ficticio, para pruebas)
- [x] `seed.ts` asigna `stockActual` y `stockMinimo` de prueba a los 26 insumos (AJUSTE por la diferencia, con nota «ficticio»). Polvo de hornear y Caja queque con relleno quedan bajo el mínimo y Frutilla en 0. No pisa insumos con mínimo o COMPRA/AJUSTE previos. `SEED_STOCK_PRUEBA=false` lo desactiva (lo usan los tests).
  - Verificación sobre `dulzura.db` (respaldo previo `dulzura_2026-11-03_16-35-40.db.gz`): `db:seed` cargó los 26 insumos (9 en la primera corrida, más 17 al ajustar la regla para respetar las 3 ventas previas); una segunda corrida cargó 0 (idempotente). `db:check` OK (costos sin cambios). Pantalla Insumos: los 26 con stock y mínimo. Dashboard: tarjeta de alertas con 3 insumos, Frutilla con semáforo rojo (`rgb(239,91,107)`) y Polvo de hornear y Caja queque con relleno en amarillo. `typecheck` OK, 34/34 tests OK.

## FASE 5: Entrega Local — COMPLETADA
- [x] Respaldo comprimido del `.db` con la fecha (`backend/src/services/backup.ts`): copia consistente con `VACUUM INTO` (sirve aunque la app esté abierta), `PRAGMA integrity_check` de la copia, gzip y nombre `dulzura_AAAA-MM-DD_HH-MM-SS.db.gz`. Conserva los últimos `BACKUP_KEEP` (30). Si `BACKUP_DIR` apunta a la carpeta de Google Drive para escritorio, Drive los sube solo.
  - Formas de usarlo: `npm run backup`, respaldo automático al iniciar la API (si el último tiene más de 20 h) y una vez al día, botón «Respaldar ahora» en el menú, `GET`/`POST /api/backups`.
  - Verificación: `npm run backup` sobre `dulzura.db` creó `backups/dulzura_2026-11-03_01-05-38.db.gz` (6.1 KB). Al descomprimirlo, las 7 tablas tienen los mismos conteos, `integrity_check = ok` y el mismo precio de la harina que el original. 3 tests nuevos (archivo válido con cabecera «SQLite format 3», retención con BACKUP_KEEP=2, ruta de la BD); 31/31 OK. Con el servidor real (copia de la BD y carpeta temporal): respaldo automático al arrancar, el botón creó un segundo respaldo, y al reiniciar no se duplicó. Los tests encontraron un error de orden con dos respaldos del mismo segundo, ya corregido.

## FASE 6: Expansión de catálogo — COMPLETADA
Decisiones D17–D24 en `CONTEXT.md` §1.
- [x] Agregar insumos nuevos de Brownies: Chocolate, Cocoa, Chocolate blanco, Nutella, Topping Nido, Bolsa brownie, Caja brownie, Envase brownie personal.
  - Verificación: el seed crea 34 insumos (26 + 8) y el test «lista los 34 insumos» pasa. Los de Flanes (Queso crema, Dulce de leche, Ron, Envase flan) van con los Flanes.
- [x] Crear receta base «Brownies (masa)» (INTERMEDIO, 743 g).
  - Verificación: costo 15.3334 Bs, igual al cálculo a mano (CONTEXT.md §4). Test: el pack de 4 usa exactamente 320/743 de la masa.
- [x] Crear los productos de Brownies: clásicos 4 u, premium 4 u, clásicos 9 u, premium 9 u, 16 u y personal premium (D19).
  - Verificación: `db:check` con los 6 valores de CONTEXT.md §4. Tests: el premium cuesta lo mismo que el clásico más los toppings (50 g / 150 g); vender 2 cajas de 9 descuenta 200 × 720 × 2 / 743 g de chocolate y 2 cajas; vender 3 sueltos descuenta 3 bolsas. 38/38 tests OK (34 anteriores + 4 nuevos).
- [x] Crear los insumos de Flanes (Queso crema, Dulce de leche, Ron, Envase flan) y los productos Chocoflan y Quesillo venezolano (D23).
  - Verificación: costos 6.4286 y 7.2975 Bs por unidad, iguales al cálculo a mano (CONTEXT.md §4). Tests: vender 10 Chocoflanes descuenta exactamente 1 lata de condensada (395 g) y 10 envases; vender 1 Quesillo descuenta 230/8 g de leche en polvo y 10/8 ml de ron. 40/40 tests OK. Base real (respaldo previo `dulzura_2026-11-05_11-46-44.db.gz`): 38 insumos y 16 productos, y los dos flanes aparecen en la Caja.
- [x] Ejecutar `npm run db:check` para verificar costos.
  - Verificación: sobre `dulzura.db`, los 16 productos (Queques, Brownies y Flanes) coinciden con CONTEXT.md §4.
- [x] Importar ventas históricas (opción C, D24): migración `venta_historica`, JSON extraído del Excel, `npm run db:historico` y `GET /api/historico`.
  - Verificación: 95 ventas, Bs 3680.45. Semana 1: 35 / 1311.50 (29/01–04/02/2024, fechas reales); Semana 2: 28 / 943.55 (sin la fila de 380 Bs); Semana 3: 32 / 1425.40 (sin el pedido cancelado). 12 ventas vinculadas a productos de Brownies. Reimportar no duplica (95). Las 3 ventas del sistema y los totales de la Caja no cambian. 4 tests nuevos, 44/44 OK. En la base real (respaldo previo `dulzura_2026-11-05_11-49-43.db.gz`), consultado por la API con el servidor corriendo.
- [x] Pantalla «Historial 2024» (menú → Consulta), en lugar del gráfico de 7 días (D24): tarjetas (vendido, promedio por semana, utilidad y comisión según el Excel), barras de Bs por semana, tabla por producto (con etiqueta «En el ERP» si está vinculado) y detalle con filtros de semana y producto. Las fechas aproximadas llevan «≈».
  - Verificación en el navegador sobre la base real (solo lectura): Bs 3.680,45 · 95 ventas · 104 u; barras 1.311,5 / 943,6 / 1.425,4. Al hacer clic en «Tres leches» el detalle mostró 15 ventas / Bs 852; al filtrar la semana del 12/02, 4 ventas / Bs 227 (55 + 55 + 58,5 + 58,5). 5 productos con «En el ERP». A 375 px no hay scroll horizontal; sin errores en la consola. `typecheck` y `web:build` OK.

## FASE 7: Tres leches, fresas y toppings — COMPLETADA
Decisiones D25–D30 en `CONTEXT.md` §1. Fuente: hoja «Costos» de `Dulzura ondrive (1).xlsx`.
- [x] 8 insumos nuevos: Leche evaporada, Salsa de frutilla, Mousse de frutos rojos y 5 envases (fresas, tres leches personal, normal, familiar, mega).
- [x] 4 toppings como preparaciones (INTERMEDIO en gramos): personal, normal, grande y mega.
- [x] 8 productos de venta: Fresas con crema, Fresas con crema y brownie, Fresas con crema, brownie y Nutella, Frutillas bañadas en chocolate, Tres leches personal, Tres leches, Tres leches familiar y Tres leches mega.
  - Verificación: `db:check` con los 12 valores de CONTEXT.md §4, calculados a mano. 3 tests nuevos (los toppings no aparecen en la Caja y cuestan 15.25; las fresas con brownie usan 240/743 de la masa y la versión con Nutella suma 30 × 0.057; vender un familiar descuenta 740 g de evaporada y 1 envase) y 3 tests ajustados por los datos nuevos (46 insumos, 7 intermedios, ventas históricas vinculadas). 47/47 OK.
- [x] Ventas históricas vinculadas a los productos nuevos: 86 de 95. Sin vincular: Frutillita (7), Feliz cumpleaños (1) y Tres leches personal frutos rojos (1).
  - Verificación sobre la base real (respaldo previo `dulzura_2026-11-05_12-17-10.db.gz`): 46 insumos y 28 productos; los 8 nuevos aparecen en la Caja (20 productos) y ningún topping; el Historial marca 13 productos «En el ERP».

## Gastos operativos y utilidad neta — COMPLETADO
- [x] Modelo `GastoOperativo` (id uuid, fecha, descripción, monto `Decimal`, categoría `LIMPIEZA | EQUIPAMIENTO | OTROS`). Migración `gastos_operativos`.
- [x] API: `POST /api/gastos` (fecha opcional AAAA-MM-DD para cargar una compra de otro día), `GET /api/gastos?desde&hasta` (lista, total y total por categoría), `DELETE /api/gastos/:id`.
  - Verificación: 3 tests nuevos (crear y listar con totales por categoría y filtro de fechas; rechazar descripción vacía, monto 0 o «abc», categoría «LUZ» y fecha inválida con 400 y el campo que falla; borrar 204, repetir 404, id inválido 400). 50/50 OK.
- [x] Pantalla «Gastos» (menú General): formulario Descripción / Monto / Categoría / Guardar, tarjetas del mes (total y por categoría) y tabla del mes con «Borrar» en dos pasos («Sí, borrar» / «No»).
- [x] Dashboard: la tarjeta «Caja de hoy» muestra Ganancia bruta, Gastos del día, **Utilidad neta** del día y, al pie, la **Utilidad neta del mes** (ganancia bruta del mes − gastos del mes). La línea que antes decía «Ganancia neta» era la ganancia bruta: se renombró.
  - Verificación en el navegador sobre una copia de la BD (borrada después): gastos «Esponja y lavavajillas» 12,50 (escrito con coma) y «Molde redondo 20 cm» 45 → total del mes Bs 57,50. Venta de 1 Brownies clásicos 4 u (ganancia 19,40) → Utilidad neta del día −38,10 y del mes −30,07 (27,43 − 57,50). Al borrar el molde: día 6,90 y mes 14,93. A 375 px sin scroll horizontal; sin errores en la consola. `typecheck` y `web:build` OK. Migración aplicada a `dulzura.db` (respaldo previo `dulzura_2026-11-05_16-33-42.db.gz`).
- [x] Aviso en Gastos al elegir la categoría «Limpieza»: las recetas ya incluyen «Limpieza y otros» (D31).
  - Verificación en el navegador (solo lectura): el aviso aparece con «Limpieza», desaparece con «Equipamiento» y vuelve al elegir «Limpieza». `typecheck` y `web:build` OK.

## Dashboard: flujo de caja y punto de equilibrio — COMPLETADO
Sin cambios en la base de datos. Código en `frontend/src/components/dashboard/` (`indicadores.ts`, `FlujoCajaCard.tsx`, `PuntoEquilibrioCard.tsx`, `Indicadores.css`), en una segunda fila de tarjetas en Inicio.
- [x] **Flujo de caja de hoy**: cobrado al vender (ventas de hoy pagadas en el momento) + cobros de fiados de hoy − gastos pagados hoy = dinero que debería haber en caja. Muestra el fiado de hoy con su % de lo vendido y el aviso «Ojo: mucho dinero en fiado hoy» si supera el 20 %.
- [x] **Punto de equilibrio mensual**: gastos fijos / margen de contribución promedio (de las ventas del mes; si no hay, del catálogo). Barra roja (< 75 %), amarilla (75–99 %) o verde (≥ 100 %). Gastos fijos = 300 Bs de prueba (`// TODO: Conectar con módulo de gastos fijos`).
  - Verificación en el navegador sobre una copia de la BD (borrada después): venta de 30 + fiado de 30 + gasto de 12,50 → flujo Bs 17,50, fiado 50 % con aviso; equilibrio: margen 7,22 (43,34 / 6), meta 42, 6 vendidos (14 %, rojo). Al cobrar el fiado: «Cobros de fiados 30», flujo 317,50 tras vender 9 packs más y sin aviso. 16 de 21 (76 %): amarillo; 25 de 19 (132 %): verde con «Gastos fijos cubiertos». La venta anulada no se contó. A 375 px una columna y sin scroll horizontal; en tema claro usa los colores del tema. `typecheck` y `web:build` OK.
- [x] Se quitó la tarjeta «Flujo de caja de hoy» a pedido de la dueña (repetía «caja» con la tarjeta de arriba). El punto de equilibrio queda solo, a todo el ancho. Se borraron `FlujoCajaCard.tsx` y la función `flujoDeCaja`.
  - Verificación: Inicio muestra Caja de hoy, Acción rápida, Alertas, Últimos 7 días y Punto de equilibrio; sin errores en la consola. `typecheck` y `web:build` OK.

## Caja: productos a la venta y no disponibles — COMPLETADO
- [x] Migración `producto_disponible` (`Producto.disponible`, por defecto true; D32). API: `disponible` en `PATCH /api/productos/:id` y filtro `?disponible=true|false`; `POST /api/ventas` rechaza un producto no disponible (422 «no está a la venta»).
- [x] Caja dividida: arriba «A la venta · N» (los botones de siempre); abajo «No disponibles por ahora · N», lista con «Poner a la venta». Para sacar uno de la venta: elegirlo y tocar «Quitar «…» de la venta» debajo del botón Registrar.
  - Verificación: 1 test nuevo (sacar de la venta, filtros, venta rechazada sin registrar nada, volver a poner y vender). 51/51 OK. En el navegador sobre una copia de la BD (borrada después): quitar «Fresas con crema» la pasó abajo (A la venta 19 · No disponibles 1) con el aviso correspondiente; con las 4 de fresas abajo, «Poner a la venta» en «Frutillas bañadas» la devolvió arriba (17 · 3). `typecheck` y `web:build` OK. Migración aplicada a `dulzura.db` (respaldo previo `dulzura_2026-11-05_17-10-55.db.gz`): todos los productos siguen a la venta hasta que la dueña los quite.
- [x] Arrastrar y soltar: «No disponibles por ahora» usa las mismas tarjetas (en gris, borde punteado). Arrastrar una tarjeta a la otra sección cambia su estado; la sección de destino se resalta. Se quitó la lista anterior. Sin mouse (pantallas táctiles) siguen las alternativas: «Poner a la venta» en cada tarjeta de abajo y «Quitar … de la venta» al elegir un producto de arriba.
  - Verificación en el navegador sobre una copia de la BD (borrada después), enviando los eventos de arrastre del navegador: bajar «Fresas con crema y brownie» (19 · 1) y «Fresas con crema» (18 · 2), y subir otra vez la primera (19 · 1), con la sección de destino resaltada y el aviso de cada cambio. `typecheck` y `web:build` OK. El arrastre simulado con el mouse de la herramienta de prueba no dispara el arrastre nativo, por eso se probó con eventos.
- [x] Arrastre rehecho (la dueña no pudo mover «Tres leches familiar» y tenía que desplazarse para llegar abajo): `hooks/useArrastrar.ts` con eventos de puntero (mouse) en lugar del drag and drop nativo. Al empezar a arrastrar aparece una **franja fija** abajo («Suelta aquí para pasarlo a No disponibles») o arriba («Suelta aquí para ponerlo A la venta»), y el nombre del producto sigue al puntero; también se puede soltar sobre la sección. Escape cancela. Un clic sin mover sigue eligiendo el producto.
- [x] Error visible: si no se puede guardar el cambio (ej. servidor apagado), el aviso aparece arriba de la Caja. Antes solo se veía dentro del panel de venta, y sin producto elegido no se mostraba nada.
  - Verificación en el navegador sobre una copia de la BD (borrada después), con arrastres reales del mouse: «Brownie personal premium» (primera tarjeta) a la franja de abajo sin desplazar la página (19 · 1) y de vuelta a la franja de arriba (20 · 0); clic simple elige el producto; Escape quita la franja; con el servidor apagado aparece «No se pudo cambiar «Brownies 16 u»: No se pudo conectar con el servidor…». `typecheck` y `web:build` OK.
  - Causa probable del fallo de la dueña: el servidor no estaba corriendo (se detuvo para aplicar la migración) y el error no se mostraba.

## Caja: registrar ventas de días anteriores — COMPLETADO
- [x] `POST /api/ventas` acepta `fecha` (AAAA-MM-DD) opcional: hoy = hora actual; un día anterior se guarda al mediodía (hora local). Rechaza días futuros o inexistentes (400 en `fecha`). Los movimientos de inventario quedan con la fecha en que se cargó la venta y la nota «Venta del AAAA-MM-DD cargada después». El costo es el de hoy (foto al cargar).
- [x] Caja: campo «Fecha de la venta» (por defecto hoy, máximo hoy) con «Volver a hoy»; si es otro día, aviso «Se cargará como venta del …» y el botón dice «Registrar venta de otro día». La fecha elegida se mantiene al cambiar de producto. Inicio confirma «Quedó como venta del …, así que no suma en Caja de hoy».
  - Verificación: 2 tests nuevos (venta de hace 2 días: fecha, stock y nota del movimiento; hoy con hora actual; mañana, 2026-02-31 y «ayer» → 400). 53/53 OK. En el navegador sobre una copia de la BD (borrada después): venta de Queque de quinoa con fecha 03/11 → aparece entre las ventas del 3/11 y «Caja de hoy» sigue en Bs 0,00. `typecheck` y `web:build` OK.

## FASE 8: Clientes mayoristas y visualización diferenciada — COMPLETADA
Decisiones D33–D36 en `CONTEXT.md`. Respaldo previo a la migración: `dulzura_2026-11-05_18-14-31.db.gz`.
- [x] Base de datos: migración `clientes_mayoristas` (`Cliente`, `ListaPrecios`, `PrecioProducto`, `TipoCliente`; `Venta.clienteId` y `sabores`; `VentaHistorica.clienteId`, `sabores` y costo/utilidad opcionales). Seed de 3 listas y 3 clientes (no pisa cambios de la dueña).
- [x] API: `/api/clientes` (listar con filtro por tipo/activo, detalle, crear, editar, desactivar), `/api/listas-precios` (listar activas, detalle, crear, editar, fijar precio de un producto), `POST /api/ventas` con `clienteId` y `sabores`, `GET /api/ventas` con `resumen.minoristas`/`mayoristas` y cliente en cada venta, `GET /api/ventas/reporte-clientes` (total, ventas y último pedido; suma Caja + historial).
- [x] Notas mayoristas 2026 importadas como historial (`datos/notas-mayoristas-2026.json`, `npm run db:historico`): 11 ventas, Bs 2.130 (Mercado Primavera 10 / Bs 2.052; Eliana 1 / Bs 78). Sin stock ni costo.
- [x] Pantallas: **Clientes** (filtros Todos/Minoristas/Mayoristas, desactivados, alta y edición, historial por cliente, listas de precios editables); **Caja** (selector «Venta rápida (sin cliente)» / clientes por tipo, etiqueta Mayorista, precio de la lista en tarjetas y campo bloqueado, sabores obligatorios con > 5 unidades, cliente y precio en el resumen); **Historial** (pestañas Ventas del sistema / Notas 2026 / Excel 2024; columnas Cliente, Tipo y Sabores; filtros por tipo y cliente; resumen minoristas / mayoristas / total); **Inicio** (tarjeta «Top clientes mayoristas» con ⚠ si no compra hace 5 días o más).
  - Verificación: 8 tests nuevos de API (seed y filtro por tipo; alta con lista, duplicado 409, correo inválido, lista inexistente; precio 12 / 16 / 13 según cliente y 422 con precio a mano; 6 unidades sin sabores → 400 en `sabores`, con sabores OK, 5 sin sabores OK; precio fijado 40 y descuento 25 %; desactivar; resumen minoristas/mayoristas y reporte con historial; notas 2026 en el historial). 61/61 OK. Tests de 2024 acotados a 2024.
  - En el navegador sobre una copia de la BD (borrada después): Clientes muestra Mercado Primavera (Bs 2.052, 10 pedidos) y Eliana (Bs 78); en la Caja, con Mercado Primavera el Queque aparece a Bs 12 con etiqueta Mayorista y precio bloqueado; con 6 unidades sin sabores aparece el error y el botón queda desactivado; con Coco y Oreo se registra (Bs 72). Historial: la venta con etiqueta azul y «Coco, Oreo»; resumen Minoristas Bs 68 (3) · Mayoristas Bs 72 (1) · Total Bs 140; Notas 2026: Bs 2.130, 11 ventas, utilidad «—». Inicio: Top clientes con Mercado Primavera Bs 72 y Eliana con ⚠ (94 días). `typecheck` y `web:build` OK.

## Clientes minoristas del Excel 2024 — COMPLETADO
Decisión D37. Respaldo previo: `dulzura_2026-11-05_20-12-18.db.gz`.
- [x] Seed: 56 minoristas tomados de la columna «Cliente» de las ventas 2024 (sin «Venta esquina»), con lista «Minorista». Historial re-vinculado: las 56 ventas 2024 con nombre quedan con su cliente.
- [x] Verificación: test del seed ajustado (57 minoristas con Mostrador); 61/61 OK; `typecheck` OK. En la BD real: 57 minoristas y 56 ventas 2024 con tipo Minorista.

## Historial mayorista completo — COMPLETADO
Decisión D38. Respaldo previo: `dulzura_2026-11-05_21-14-09.db.gz`.
- [x] `notas-mayoristas-2026.json` regenerado desde la tabla de la dueña (CSV guardado en `datos/`): 13 notas, Bs 2.586. Fechas corregidas (02/07 y 04/07) y 2 notas nuevas (23/06, 27/07).
- [x] Tests ajustados (13 notas, 2.586; Primavera 2.508); 61/61 OK. BD real: historial con 108 ventas (95 de 2024 + 13 de 2026).

## Notas mayoristas desde las fotos — COMPLETADO
Decisión D39. Respaldo previo: `dulzura_2026-11-05_21-35-27.db.gz`.
- [x] 14 fotos transcritas (la del 29/07 vino repetida): 13 notas con Nº, fecha, cliente, cantidad, total y sabores. Nota 0053316 al 03/08/2026.
- [x] Historial «Notas 2026» muestra el Nº de cada nota. Importador sincroniza (borra filas viejas de la hoja).
- [x] 61/61 tests, typecheck y build OK; BD real con 108 ventas históricas; verificado en el navegador.


## Clientes: sin columna «Lista de precios» — COMPLETADO
- [x] La tabla de Clientes ya no muestra la lista de precios (repetía el tipo o el nombre del cliente). La lista se sigue asignando en Editar y se administra en «Listas de precios». Verificado en el navegador.

## Insumos en kg y L — COMPLETADO
- [x] Desde 1000 g se muestra en kg y desde 1000 ml en L (envase, stock, mínimo, compra y alertas de Inicio): «50.000 g» se leía como 50 g. Solo visual (`medida` en `formato.ts`); todo se guarda y se escribe en g/ml. Verificado en el navegador.

## Ajuste de stock por conteo — COMPLETADO
- [x] El botón Ajuste ahora pide el **stock real** (viene escrito el actual); el ERP calcula la diferencia y la guarda como movimiento AJUSTE. Muestra «Se suman / Se restan X». Motivo opcional (por defecto «Conteo físico»). La API no cambió. Verificado en el navegador sin guardar.

## Equivalencia destacada en formularios — COMPLETADO
- [x] `Campo` acepta `equivalencia`: se muestra «= 8 L» grande (20 px, negrita, fondo suave) bajo el campo. Usado en Insumos: contenido del envase, stock mínimo, compra (envases o cantidad) y stock real del ajuste.

## Panel de ajuste a todo el ancho — COMPLETADO
- [x] El ajuste usa 3 columnas: stock real (con equivalencia), motivo con atajos (Conteo físico, Se venció, Se derramó / se cayó, Tanda arruinada) y un resumen «Stock actual → Stock nuevo» con la diferencia en rojo/verde y los botones. En pantallas angostas pasa a una columna. Estilos en `pantallas/Insumos.css`. Verificado a 1536 px sin guardar.

## Editar y Compra con el panel de 3 columnas — COMPLETADO
- [x] Mismo diseño que Ajuste (`.panel-insumo` en `pantallas/Insumos.css`). **Editar / Nuevo insumo:** nombre·categoría·unidad | envase·precio·mínimo | resumen con costo por unidad (antes → nuevo), envase y aviso de recálculo. **Compra:** cómo y cuánto | precio nuevo·nota | resumen stock actual → después, «Entran X», costo de la compra y cambio de precio. Verificado a 1536 px sin guardar.

## Insumos sin control de stock (∞) — COMPLETADO
Decisión D40. Respaldo previo a la migración: `dulzura_2026-11-06_11-09-38.db.gz`.
- [x] Migración `insumo_controla_stock` (campo `controlaStock`; marca Agua y Limpieza y otros, mínimo 0).
- [x] API: la venta no descuenta ni alerta esos insumos; compra/ajuste → 422; `controlaStock` editable por PATCH; alertas lo ignoran.
- [x] Pantalla Insumos: «∞ Sin control», mínimo «—», sin botones Compra/Ajuste; casillero «No llevar stock ∞» en Editar/Nuevo (oculta el mínimo).
- [x] Tests: venta de Queque con 11 insumos descontados (antes 13) + 3 tests nuevos. 64/64 OK. Verificado en el navegador sobre la BD real (sin guardar cambios).


## Botones de Insumos renombrados — COMPLETADO
- [x] Editar → «Editar datos», Compra → «Sumar stock», Ajuste → «Actualizar stock» (elegidos por el usuario), con ícono y descripción al pasar el mouse; en una sola línea. El botón del panel de compra dice «Sumar al stock».

## Stock sin restos de redondeo — COMPLETADO
- [x] Causa: SQLite guarda los decimales con precisión limitada y el stock de prueba dejó Huevo en 120.00000000000001 y Esencia en 200.00000000000003.
- [x] `registrarMovimiento` calcula el stock con Decimal y lo guarda redondeado a 6 decimales (`DECIMALES_STOCK`). «Actualizar stock» manda `stockReal` y el servidor fija ese número exacto (422 si es igual al actual). El campo arranca con el stock redondeado a 2 decimales.
- [x] BD real corregida con un ajuste «Corrección de redondeo» (respaldo previo `dulzura_2026-11-07_06-52-33.db.gz`): Huevo 120, Esencia 200. 65/65 tests.

## Historial único por año — COMPLETADO
- [x] Se quitaron las pestañas «Ventas del sistema / Notas 2026 / Excel 2024». Ahora hay una franja deslizable de años (2024, 2025, 2026, con el total de cada uno y flechas) y, para el año elegido, todo junto: Caja + Excel + notas de venta. Tarjetas (vendido, minoristas, mayoristas, ganancia conocida), ventas por mes (tocar un mes filtra), por producto y la tabla con columna «Registro» (Caja / Excel / Nota Nº). Sin cambios en la API. Verificado a 1536 px: 2024 Bs 3.680,45 (95 ventas), 2026 Bs 2.654 (16 ventas).
- [x] Ajuste: la franja de años se reemplazó por un **selector compacto en la cabecera** (dos clics: abrir y elegir), de 2026 a 2020 (la repostería trabaja desde 2020), con el total de cada año en la lista.

## Sin columna «Registro» — COMPLETADO
Decisión D41. Respaldo previo a la migración: `dulzura_2026-11-07_15-44-01.db.gz`.
- [x] Frontend: sin columna «Registro» en Historial ni «Origen» en el historial del cliente; sin tipo `FormaPago` ni `hoja`/`fila` en `VentaHistorica`.
- [x] Backend: migración `quitar_forma_pago` (columna y enum), importador y JSON sin forma de pago; `GET /api/historico` no devuelve `hoja`/`fila`.
- [x] 65/65 tests (el de historial verifica que no se exponen esos campos), typecheck y build OK.

## Un solo botón de stock — COMPLETADO
- [x] Se quitó «Sumar stock»: «Actualizar stock» suma y resta (se escribe cuánto hay ahora). El campo de motivo se llama «Caso especial de reducción de stock (opcional)» y solo se activa cuando el stock baja; atajos: Se venció, Se derramó / se cayó, Tanda arruinada, **Consumo propio**. Sin caso especial se guarda «Conteo físico» (baja) o «Reposición de stock» (sube). El precio se cambia en «Editar datos». La API sigue aceptando COMPRA (movimientos viejos y tests). 65/65 tests; verificado en el navegador sin guardar.

## Precios acordados por cliente (sin listas) — COMPLETADO
Decisión D42. Respaldo previo a la migración: `dulzura_2026-11-07_20-46-29.db.gz`.
- [x] BD: migración `precios_por_cliente` (tabla `PrecioCliente`; se borran `ListaPrecios`, `PrecioProducto` y `Cliente.listaPreciosId`), con los precios de Primavera (12) y Eliana (13) copiados.
- [x] API: `PUT/DELETE /api/clientes/:id/precios/:productoId`; los clientes traen `precios`; la venta usa el precio acordado (422 si se escribe otro) y, sin acuerdo, acepta el precio escrito. Se quitó `/api/listas-precios`.
- [x] Pantallas: Clientes sin desplegable ni sección de listas; botón «Precios» en cada mayorista (fijar, cambiar, quitar) y el precio acordado bajo su nombre. Caja: «Precio acordado: Queque Bs 12,00» y precio bloqueado solo si hay acuerdo.
- [x] Tests reescritos (precio propio por mayorista, cambiar/quitar, regateo, minorista 422); 65/65. Verificado en el navegador sin registrar ventas.

## Corregir y eliminar ventas desde el Historial — COMPLETADO
Decisión D43. Respaldo previo a la migración: `dulzura_2026-11-07_22-51-31.db.gz`.
- [x] Migración `historial_correcciones` (`VentaHistorica.editada` y `eliminada`); el importador no pisa ni revive lo corregido.
- [x] API: `PATCH/DELETE /api/ventas/:id` (stock ajustado por diferencia / devuelto) y `PATCH/DELETE /api/historico/:id`; anular devuelve lo neto; el reporte por cliente ignora lo eliminado.
- [x] Historial: botones «Editar» (formulario en la fila: día, cantidad, precio o total, cliente, sabores) y «Eliminar» (confirmación en la fila). Las anuladas solo se pueden eliminar.
- [x] 4 tests nuevos (stock por diferencia y anulación neta; validaciones; eliminar devuelve stock; historial corregido/eliminado sobrevive a reimportar). 69/69. Verificado en el navegador sin guardar cambios.

## Toda venta con nombre y celular; búsqueda de clientes — COMPLETADO
Decisión D44. Sin migración (el celular ya existía en `Cliente`).
- [x] API: la venta exige cliente (elegido o por nombre) y celular; crea el cliente si es nuevo y guarda el celular si faltaba.
- [x] Buscador con sugerencias tipo Google (`BuscadorCliente`), con la parte coincidente resaltada y celular/tipo en cada sugerencia.
- [x] Caja: «Nombre de quien hace el pedido» + «Celular» obligatorios; «Cliente nuevo» si no existe; sin desplegable de clientes ni «Venta rápida (sin cliente)»; el resumen muestra cliente y celular.
- [x] Clientes: «Buscar cliente» (muestra la ficha encontrada), tabla solo con mayoristas; «Nuevo cliente» sugiere los existentes para no duplicar y pide celular.
- [x] 3 tests nuevos + tests ajustados; 72/72. Verificado en el navegador sin registrar ventas.

## Encabezados de tablas fijos — COMPLETADO
- [x] En pantallas anchas (> 1000 px) el encabezado de todas las tablas queda pegado bajo la barra superior al deslizar (Insumos, Historial, Clientes, Recetas, Inicio…). .panel usa `overflow: clip` y `.tabla-envoltura` no tiene scroll propio en escritorio; en celular se mantiene el scroll horizontal. Verificado en Insumos e Historial.
- [x] Ajuste D44: a pedido del usuario volvió el filtro **Todos / Minoristas / Mayoristas** en la tabla de Clientes (por defecto Todos), junto con «Buscar cliente». La Caja sigue sin desplegable de clientes.

## Editar cliente con el panel de Insumos — COMPLETADO
- [x] «Editar» en Clientes se abre debajo de la fila (igual que «Editar datos» en Insumos), en 3 columnas: Nombre/Tipo · Celular/Correo/Dirección · resumen con compras, pedidos, qué cambia, «Minorista → Mayorista» con aviso, y los botones. «Guardar cambios» se activa solo si hay cambios. «Nuevo cliente» usa el mismo panel arriba; si el nombre ya existe, abre la edición de ese cliente en la lista.- [x] «Historial» del cliente se abre en una ventana emergente (componente `Ventana`): título con el nombre y el tipo, pedidos y total; la lista se desliza dentro con el encabezado fijo; se cierra con la X, con Esc o tocando fuera. Ya no hay que bajar hasta el final de la página.

## Clientes sin «Desactivar» y sin nombres repetidos (D45) — COMPLETADO
- [x] Quitados el botón Desactivar/Activar, la casilla «Mostrar desactivados», `DELETE /api/clientes/:id`, el filtro `?activo=` y el bloqueo de venta a desactivados. No había clientes desactivados (respaldo previo hecho).
- [x] Crear o renombrar un cliente con el mismo nombre y apellido (sin importar mayúsculas, tildes ni espacios) → 409 con el nombre existente. Otro apellido sí se acepta.
- [x] Tests: el de «desactivar» se reemplazó por «no se desactivan; renombrar a uno existente se rechaza», y se amplió el de duplicados. 72/72. Verificado en el navegador.

## Queques reales del Excel (D46) — COMPLETADO
- [x] Respaldo `dulzura_2026-11-09_10-43-45.db.gz` antes de la carga.
- [x] Queques anteriores retirados (sin receta, fuera de la Caja); 4 ventas de Caja y 13 notas conservadas.
- [x] 24 insumos con precio del Excel (7 nuevos); 11 queques nuevos a Bs 16. Costos verificados contra el Excel: Vainilla/Naranja/Limón/Frutilla 5,78; Zanahoria 9,07; Marliza Chavez 6,99.
- [x] Cantidades corregidas a 10 g (Oreo, Almendra, Coco, Marmolado) y 15 g (cacao del Chocolate): Oreo/Almendra/Coco 6,68; Marmolado 7,48; Chocolate 8,33. Respaldo previo `dulzura_2026-11-09_10-45-16.db.gz`.
- [ ] `seed.ts` todavía crea los queques anteriores: un `db:reset` los traería de vuelta.
- [ ] Caja: los sabores de mayorista (Vainilla, Coco…) se piensan para el «Queque» genérico; ahora cada sabor es un producto.

## Recetas: sin tarjeta «Costo de la tanda» — COMPLETADO
- [x] Quitada la tarjeta; el dato «La receta rinde N» pasó a la tarjeta «Costo por unidad». Verificado en el navegador.

## Gasto «Uso personal» (D47) — COMPLETADO
- [x] Respaldo `dulzura_2026-11-09_13-49-48.db.gz`. Nueva categoría `USO_PERSONAL` en el enum, el tipo del frontend y los nombres; nota en el formulario al elegirla.
- [x] Test de gastos ampliado (total y porCategoria con uso personal). 72/72. Verificado en el navegador sin guardar gastos.

## Clientes: solo el nombre en la lista — COMPLETADO
- [x] A pedido del usuario, la fila del cliente ya no muestra la dirección ni los precios acordados del mayorista (siguen en Editar y en «Precios»). Quitado `.clientes__acordado`. Verificado en el navegador.

## Caja por pedido: familia → sabores, varios productos (D48) — COMPLETADO
- [x] Respaldo `dulzura_2026-11-09_15-20-06.db.gz`. Migración `pedidos_varias_lineas`: `Venta.pedidoId` (texto, índice). Las ventas existentes no cambian.
- [x] API: `POST /api/ventas/pedido` (varias líneas, todo o nada, precio acordado por línea, sin sabores) y `POST /api/ventas/pedidos/:pedidoId/cobrar`. `reporte-clientes` cuenta pedidos, no líneas. `POST /api/ventas` refactorizado con las mismas funciones (`resolverCliente`, `productoVendible`, `registrarLinea`).
- [x] Caja nueva: familias, lista de sabores con costo de producción y precio, selección con borde, − / cantidad (solo números) / +, pedido con total, costo y ganancia; fiados agrupados por pedido; no disponibles como lista compacta (arrastrar o «Poner a la venta»). Inicio confirma el pedido completo. Se quitó `SABORES` de `formato.ts`.
- [x] Tests: 4 nuevos de pedidos (76/76). Verificado en el navegador sin registrar pedidos.
- [ ] Historial y «Ventas de hoy» siguen mostrando una fila por producto (cada línea se puede anular o corregir por separado).

## Caja: sabores en dos columnas — COMPLETADO
- [x] Los sabores de la familia se muestran en dos columnas que se leen de arriba abajo (A–L | M–Z): 11 queques caben sin deslizar. Cada sabor: nombre y precio arriba, costo de producción y cantidad abajo. Si el área es angosta, las familias pasan arriba en fila (container query); en celular, una sola columna. Verificado a 1400 y 1920 px.

## Caja: familia → variantes también en Brownies, Tres leches, Flanes y Fresas — COMPLETADO
- [x] Orden alfabético con números como números (4 u, 9 u, 16 u). «No disponibles» agrupado por familia con el nombre corto («Clásicos 4 u», «Familiar»). Verificado en el navegador.
- [ ] Pendiente con la dueña: la variante «Tres leches» se muestra igual que su familia (¿qué tamaño es?) y «Brownies 16 u» tiene precio Bs 5.

## Caja sin «No disponibles» (D49) — COMPLETADO
- [x] Todas las familias muestran todos sus productos activos (Queques 11, Brownies 6, Fresas 4, Tres leches 4, Flanes 2). Quitados la sección «No disponibles», el arrastre (`hooks/useArrastrar.ts` borrado) y `api.cambiarDisponible`.
- [x] API: `productoVendible` ya no exige `disponible`. Tests ajustados (el de disponibilidad ahora comprueba que se puede vender; el de pedidos usa un producto inactivo). 76/76. Verificado en el navegador.

## Recetas y precios: datos del producto alineados y más compactos — COMPLETADO
- [x] Los campos (Nombre, Categoría, Rinde, Precio, Estado) quedan en una fila alineada arriba, con inputs más bajos; etiqueta «Rinde (unidades)» y opción «Activo · en Caja» más cortas. Tarjetas de costo/precio/ganancia más bajas. Verificado midiendo en el navegador (1600 px).

## Inicio: tarjetas alineadas y más compactas — COMPLETADO
- [x] Tarjetas sin alto mínimo de 220 px, con menos relleno, número de 24 px, íconos y botón más chicos y menos espacio entre filas. «Acción rápida» habla del pedido y el botón dice «Registrar pedido». En `.dos-columnas` los paneles lado a lado ya no se desplazan hacia abajo (la regla `.panel + .panel` de la Caja): «Rentabilidad por producto» y «Ventas de hoy» empiezan a la misma altura. Verificado en el navegador (1600 px).

## Caja: resumen del pedido solo con unidades y total — COMPLETADO
- [x] Quitada la frase de ayuda bajo «Caja» y las filas «Costo de producción» y «Ganancia» del resumen del pedido (queda el aviso si se vende por debajo del costo). Verificado en el navegador.

## Historial: «Queque» → «Queque Vainilla» (D50) — COMPLETADO
- [x] Respaldo `dulzura_2026-11-09_19-15-46.db.gz`. 1 venta de Caja (03-nov, costo recalculado a 5,78) y 13 notas mayoristas 2026 pasan a Queque Vainilla. En Historial: Queque Vainilla 204 u, Bs 2.602; ganancia bruta 2026 de Bs 121,75 a Bs 133,27.
- [x] `importar-historico.ts` ya agrupa «Queque» como «Queque Vainilla». Tests 76/76.
