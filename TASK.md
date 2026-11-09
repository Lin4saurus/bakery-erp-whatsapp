# TASK.md: Proyecto ERP "Dulzura" - Repostería

## 1. ROL Y OBJETIVO
Eres un Ingeniero de Software Senior experto en Node.js, TypeScript, Prisma y React. Tu objetivo es desarrollar un ERP local (MVP) para una repostería en Bolivia llamada "Dulzura". El sistema debe resolver el dolor principal de la dueña: saber el costo exacto de cada producto, controlar el inventario de insumos (en gramos/unidades) y calcular la ganancia real por venta.

## 2. METODOLOGÍA DE TRABAJO (Estilo Outlier / Mailbox Ring)
Trabajaremos de forma estricta, iterativa y basada en hitos (milestones). Debes seguir estas reglas sin excepción:
1. **Archivos de Verdad Única**: Mantendremos 5 archivos principales en la raíz. Tú debes leerlos y actualizarlos:
   - `TASK.md`: Este archivo (contexto maestro).
   - `status.md`: El estado de los milestones. Usar `[x]` (completado y verificado), `[>]` (parcial, requiere seguimiento), `[ ]` (no iniciado).
   - `CONTEXT.md`: Reglas de negocio, datos del Excel y lógica de costeo.
   - `TECH.md`: Stack tecnológico, decisiones de arquitectura y guía de desarrollo.
   - `PROGRESS.md`: Bitácora de cambios, problemas conocidos y próximos pasos.
2. **Desarrollo por Fases**: No avanzarás a la Fase 2 hasta que la Fase 1 esté 100% completada, probada y marcada con `[x]` en `status.md`.
3. **Verificación Manual**: Cuando marques un hito como `[x]`, debes explicar brevemente cómo lo verificaste.
4. **Código Limpio**: TypeScript estricto (prohibido `any`), nombres de dominio en español (`Insumo`, `Receta`) y técnicos en inglés (`createInsumo`). Manejo de errores con `try/catch` y mensajes claros.

## 3. STACK TECNOLÓGICO ACORDADO
- **Backend**: Node.js + TypeScript + Express (o Fastify).
- **Base de Datos**: SQLite (local) vía **Prisma**. Ver decisión en `TECH.md`.
- **Frontend**: React + Vite con CSS propio por componente (sin Tailwind ni librerías de UI). Estética tipo panel administrativo (referencia: plantilla Shreyu), sobria, con modo claro/oscuro. Guía de diseño en `TECH.md` §Diseño.
- **Empaquetado Final**: instalador `.exe` (Electron o similar) con backup automático a Google Drive.

## 4. LÓGICA DE NEGOCIO (Extraída del Excel de Dulzura)
1. **Insumos**: se compran en envases y se consumen en unidad base. `Costo Unitario = Precio del Envase / Contenido del Envase`.
2. **Productos Terminados**: tienen un rendimiento por receta (ej. Queque rinde 4.75 unidades).
3. **Recetas (BOM)**: unen Productos con Insumos y cantidades.
4. **Motor de Costeo**: al registrar una venta → explotar receta, costo total / rendimiento = costo unitario real, descontar insumos, registrar venta, ingreso y ganancia bruta.

**Alcance actual (acordado):** líneas **Queques + Brownies + Flanes** (Fase 6) **+ Tres leches, Fresas y toppings** (Fase 7), con datos fijos de los Excel (ver `CONTEXT.md`), más las ventas históricas de 2024 como consulta (D24). Sin receta todavía: Frutillita, Feliz cumpleaños y Tres leches personal frutos rojos. Fase 8: clientes mayoristas con listas de precios.

## 4b. UX DEL DASHBOARD (lo que la dueña quiere ver al entrar)
Cuatro tarjetas arriba:
1. **Caja**: venta del día | ganancia neta del día | dinero pendiente por cobrar (fiado).
2. **Acción rápida**: botón grande y verde «Registrar venta rápida».
3. **Alertas**: máximo 3 insumos bajo el `stockMinimo` (semáforo rojo).
4. **Tendencia**: mini-gráfico de unidades vendidas en los últimos 7 días.

## 5. PLAN DE DESARROLLO (MILESTONES)
El estado vivo de cada hito está en `status.md`.

### FASE 1: Fundación y Base de Datos
- Estructura de carpetas (`/backend`, `/frontend`, `/database`).
- Esquema Prisma: `Insumo`, `Producto`, `IngredienteReceta`, `Venta`.
- `seed.ts` con datos reales del Excel (Queques).
- `status.md` con el progreso.

### FASE 2: CRUD y Lógica de Costeo
- API de Insumos y Productos.
- Endpoint para asignar insumos a un producto (receta).
- Función que, dado `productoId`, calcule su costo unitario en tiempo real.

### FASE 3: Registro de Ventas y Descuento de Inventario
- Endpoint `crearVenta` (`productoId`, `cantidad`).
- Transacción Prisma: crear Venta, descontar insumos, calcular y guardar ganancia.

### FASE 4: Frontend Básico y Dashboard
- Configuración de Insumos y Recetas.
- Caja (POS) simple.
- Dashboard: ventas del día, ganancia del día, alerta de stock bajo.

### FASE 5: Preparación para Entrega Local (Bonus MVP)
- Script que copie y comprima el `.db` con la fecha actual (backup para Google Drive).

### FASE 6: Expansión de catálogo
- Insumos nuevos (Chocolate, Cocoa, Queso crema, etc.).
- Brownies: masa (INTERMEDIO) y sus productos.
- Flanes: Chocoflan y Quesillo venezolano.
- Ventas históricas de 2024 en una tabla aparte (`VentaHistorica`) y un historial semanal para consultarlas.

### FASE 8: Clientes mayoristas y visualización diferenciada
- Modelos `Cliente`, `ListaPrecios`, `PrecioProducto`; `Venta.clienteId` y `sabores`.
- API de clientes, listas de precios, venta con precio de lista y sabores, reporte por cliente.
- Pantalla Clientes, cliente en la Caja, Historial con minoristas/mayoristas y notas 2026, tarjeta «Top clientes mayoristas».
