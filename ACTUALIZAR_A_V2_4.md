# Actualizar Farmacia Heimar a V2.4

Esta actualización parte del proyecto V2.3 existente. Mantiene farmacia, usuarios, productos, SKU, ventas, lotes, proveedores, preferencias de apariencia e historial. Azul es el color principal, verde el informativo y coral el botón de cobro.

## Orden de actualización: Supabase → GitHub

1. Guarda una copia de tu repositorio actual y de tu `config.js` real.
2. Pide a los usuarios que terminen las capturas abiertas durante la actualización.
3. En tu proyecto de **Supabase → SQL Editor**, abre una consulta nueva, pega TODO el contenido de `supabase/migration_v2_4_heimar.sql` y ejecútalo. Debes tener V2.3 instalada. La migración usa una transacción y puede repetirse sin borrar información. Un resultado sin filas es normal para este tipo de script; comprueba que no hay errores.
4. Reemplaza en la raíz de tu repositorio GitHub los archivos del ZIP de actualización, respetando las carpetas `js/`, `assets/` y `supabase/`. Sube el contenido extraído, no la carpeta contenedora como una subcarpeta nueva.
5. Espera a que GitHub Pages termine de publicar. Cierra y vuelve a abrir la app en todos los dispositivos. Si ves la interfaz antigua, recarga la página; no borres los datos del sitio, porque allí se guardan preferencias y ventas pausadas.
6. Haz las comprobaciones indicadas abajo antes de continuar el uso habitual.

## Archivos de la actualización

- `index.html`
- `styles.css`
- `js/app.js`
- `js/db.js`
- `js/analytics.js`
- `js/product-icons.js`
- `js/excel.js` (nuevo)
- `sw.js`
- `manifest.webmanifest`
- `assets/heimar-logo.png` (nuevo)
- `assets/icon-192.png`
- `assets/icon-512.png`
- `supabase/migration_v2_4_heimar.sql` (nuevo)
- `ACTUALIZAR_A_V2_4.md`
- `VALIDACION_V2_4.md`
- `README.md`

**No reemplaces `config.js`.** Ninguno de los ZIP lo incluye. El ZIP completo incluye `config.example.js` solamente como ejemplo para instalaciones nuevas. La configuración real desplegada no fue leída ni modificada.

**No ejecutes `schema.sql` sobre tu farmacia existente.** Ese archivo del ZIP completo es para instalaciones nuevas. No hagas reset de Supabase, no elimines la farmacia y no vuelvas a ejecutar migraciones antiguas para actualizar desde V2.3.

## Qué incluye

- Inicio: ventas de hoy y siete días, además de los indicadores existentes.
- Clientes: nombre, teléfono, notas opcionales, fecha de registro, búsqueda y edición. Historial, total gastado, última compra y productos más comprados.
- Ventas: **Anónimo** por defecto, selección opcional, clientes recientes y creación sin salir del carrito. Las ventas pausadas conservan su cliente; al cobrar o vaciar, la siguiente venta vuelve a Anónimo.
- Facturas: historial de ventas con fechas desde/hasta, cliente, método y búsqueda por número o nota. Detalle con productos, cantidades, importe, cliente, fecha/hora, descuento y nota. Anulación con restauración de lotes originales.
- Excel: archivo `.xlsx` real con dos hojas: **Facturas** y **Productos**. Exporta el período y los filtros consultados. La hoja Facturas tiene una fila por factura, para evitar sumar repetidamente su total; la hoja Productos desglosa las líneas antes del descuento general.
- Ingresos: contado/crédito; plazos 7, 15, 30, 60 y 90 días desde la fecha de factura. Método de pago para contado. Verificación del total con tolerancia inclusiva de ±C$1, también en SQL. Con Otro y total vacío, se guarda el total calculado.
- Búsqueda de producto en Ingresos: ventana centrada y desplazable; busca nombre, SKU, categoría o presentación. Crear producto selecciona una línea vacía o agrega una línea si todas están ocupadas; conserva cantidad/costo capturados cuando usa la línea actual.
- Categorías: catálogo compartido entre dispositivos, selector y creación desde la ficha; se incluyen las categorías anteriores y nuevas en los filtros. Íconos de crema y óvulo.
- Caducidad: la consulta excluye productos inactivos, conservando lotes e históricos.
- Inventario: Ajustar stock muestra diferencia y registra entrada/salida con usuario, fecha, stock anterior/nuevo y lotes afectados. Nota inicial: “actualización de inventario”. Salidas por FEFO; las entradas mantienen el costo promedio y pueden registrar caducidad.
- Finanzas: pendientes, vencidas, por vencer en siete días y registro de pago completo con fecha, método y nota. Pendiente/pagada; sin pagos parciales. Un pago de mercancía no se registra otra vez como gasto operativo.
- Reportes: más/menos vendidos por categoría, incluyendo cero ventas de productos activos en el período de 30 días.
- PWA: marca e íconos Heimar, caché V2.4 y exclusión de respuestas de Supabase del caché de archivos.

## Datos anteriores

Las facturas de proveedor anteriores quedan con **condición de pago sin registro**. No se inventan deudas ni pagos. Puedes consultarlas en Finanzas → Todas. La nueva clasificación se aplica a los ingresos que registres con V2.4.

Las ventas anteriores sin cliente son Anónimo. Las ventas anteriores al POS V2 se muestran en Facturas como “Venta anterior”, con método “Sin registro”. Pueden consultarse y exportarse, pero no se habilita una anulación que no tenga asignaciones originales de lotes.

Las ventas nuevas guardan copias del nombre del cliente y del producto al cobrar, para que editar sus fichas no reescriba el comprobante histórico. Los números `H-…` son identificadores internos únicos; no sustituyen una numeración fiscal.

Los indicadores de clientes abarcan toda su historia de ventas completadas. El historial del cliente muestra sus últimas 30 compras y sus productos más comprados, calculados sobre toda esa historia. Inicio/Finanzas/Reportes conservan ventanas operativas de 30 días; Facturas permite otros períodos sin el antiguo límite de 120 ventas.

## Comprobaciones después de instalar

1. Inicia sesión con tus cuentas existentes y comprueba tu farmacia y productos.
2. Confirma azul principal, verde informativo, logo, tema oscuro y tamaño Grande. En móvil entra a Clientes y Facturas desde Más.
3. Crea un cliente. Vende con Anónimo y luego con ese cliente. Revisa sus detalles e historial. Pausa y retoma una venta con cliente; verifica que al cobrar la siguiente queda Anónimo.
4. Consulta Facturas por fechas, cliente y método. Descarga Excel y revisa ambas hojas. El total del listado excluye anuladas; en Excel estas conservan su estado para que puedas filtrarlas.
5. En una venta de prueba, anula desde Facturas; confirma que el stock se restaura una sola vez. No anules ventas reales para probar.
6. Registra una compra de prueba a crédito. Verifica vencimiento y saldo en Finanzas; registra el pago y comprueba que aparezca pagada con fecha/método.
7. Prueba una diferencia de C$1: permite guardar. Más de C$1: bloquea sin registrar compra ni modificar stock.
8. Crea categoría y producto desde Ingresos. Confirma selección automática y SKU siguiente. Verifica búsqueda de producto en móvil.
9. Haz un ajuste justificado de stock y consulta el registro. Si otro dispositivo cambió el stock, actualiza y cuenta de nuevo antes de ajustar.
10. Elimina lógicamente un producto de prueba con caducidad y comprueba que desaparece de Caducidades, manteniendo su historial.

Las pruebas de desarrollo fueron locales. Esta entrega no ejecutó SQL en tu Supabase ni publicó cambios en tu GitHub Pages. La guía describe cómo aplicarlos en tus cuentas.

## Si aparece un error

- Guarda el texto exacto o una captura. Si menciona `record_pos_sale_v2_4`, `customers`, `customer_summary` o `product_categories`, revisa que ejecutaste la migración V2.4 en el mismo proyecto que usa tu `config.js`.
- Si el SQL falla, la transacción no aplica parcialmente los cambios. Corrige el error indicado y ejecuta el archivo completo; no elimines datos.
- Si necesitas volver temporalmente al frontend V2.3, restaura los archivos de tu copia del repositorio sin borrar las tablas/columnas nuevas. Evita registrar crédito/clientes mientras usas la interfaz antigua; no muestra esas funciones.
