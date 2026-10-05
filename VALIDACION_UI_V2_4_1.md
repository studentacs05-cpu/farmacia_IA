# Validación local · UI V2.4.1

Se cargaron los archivos reales de V2.4.1 en Chromium con Playwright, utilizando una capa de datos ficticios. No se conectó a producción.

Comprobaciones:

- Ventas activa y navegación sincronizada al abrir.
- Actualización de datos y renovación de sesión conservan la sección actual.
- Al cerrar y volver a iniciar sesión, se entra a Ventas con cliente Anónimo.
- Venta anónima y con cliente, pausada/retomada, recibos, consultas, anulación y Excel.
- Ambos bloques de Ingresos pertenecen al mismo formulario y conservan validación, selección de producto, crédito, margen C$1 y creación de categoría/producto.
- Menú Más de Inventario: Editar/Eliminar accesibles, Escape/clic exterior y confirmación de eliminación.
- Ajuste de stock, pago a proveedores y búsqueda/historial de cliente conservados.
- Pantallas de 320, 390, 768 y 1440 píxeles; claro/oscuro; Normal/Grande; ausencia de desbordamiento horizontal en los módulos probados.
- Catálogo con nombres largos y precios de cuatro cifras: nombre/precio visibles y buscador situado bajo el encabezado al desplazarse.
- Capturas revisadas de Ventas, Ingresos e Inventario.
- Sintaxis JS, referencias HTML, IDs y contenido de ZIP verificados.

Los archivos de base de datos, las migraciones, el esquema, el exportador Excel y los assets del logo conservan los bytes de V2.4. No se necesita SQL para esta actualización.
