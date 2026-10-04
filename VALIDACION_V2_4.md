# Verificación de Farmacia Heimar V2.4

Validación local con datos ficticios. No se conectó al Supabase real ni se publicó en GitHub Pages.

## Base de datos

Se ejecutó el esquema V2.3 real seguido de la migración V2.4, dos veces, en PostgreSQL mediante PGlite (WASM). Las estructuras de Auth/Storage se simularon para ejecutar las políticas; solo la generación de bytes del código de invitación se sustituyó en el entorno de pruebas, porque pgcrypto de Supabase no está disponible allí. La migración de entrega conserva la configuración real de extensiones.

Pasaron las comprobaciones de:

- Repetición de migración y conservación de ingresos históricos sin inventar su estado de pago.
- Recuperación de categorías existentes.
- Ventas con cliente y con Anónimo.
- Copias históricas de nombre/teléfono y nombre/categoría del producto.
- Consumo FEFO de dos lotes y restauración exacta al anular.
- Anulación repetida sin duplicar stock.
- Reintento de venta/ingreso con el mismo identificador sin duplicar la operación.
- Rechazo de producto eliminado, producto ajeno y cliente de otra farmacia.
- Crédito a 15 días, validación del total: C$1 permitido y C$1.01 rechazado.
- Registro de pago completo, repetición segura y ausencia de doble gasto operativo.
- Ajustes de entrada/salida, lotes afectados, nota de auditoría y rechazo si el stock cambió después del conteo.
- Totales de cliente excluyendo anuladas.
- Consultas RLS y operaciones sin acceso rechazadas entre farmacias.

## Interfaz

Se cargó el HTML y los JavaScript reales en Chromium con Playwright. El cliente Supabase y la capa de datos se simularon con información ficticia para probar el frontend sin tocar producción.

Pasaron los flujos de venta anónima/con cliente, venta pausada, cobro, recibo, consulta y anulación; búsqueda y selección centrada de productos; creación de categoría/producto con regreso al ingreso; crédito y margen de total; ajuste de stock; pago; búsqueda de cliente por teléfono normalizado e historial; filtros de facturas y descarga Excel.

Se comprobaron ventanas de 320, 390, 768 y 1440 píxeles, temas claro/oscuro y tamaños Normal/Grande, sin desbordamiento horizontal de la página en los módulos probados. Se revisaron capturas de Inicio en escritorio y de Ingresos en móvil. El selector se mantiene cerrado al seleccionar, evitando su reapertura por recuperación de foco. Al salir de la sesión se limpia la venta y el cliente de la memoria.

## Exportación y archivos

- Se descargó un `.xlsx` desde el navegador y se abrió con openpyxl: ambas hojas, filas, tipos numéricos y totales correctos.
- El XLSX almacena textos como texto, evitando que nombres/notas se interpreten como fórmulas.
- Se probó paginación con 1.251 filas y propagación de errores de consulta.
- Sintaxis de todos los JavaScript y service worker revisada con Node.
- IDs estáticos, referencias locales, assets del service worker y contenido de los ZIP revisados.
- `config.js` local conserva los mismos bytes del ZIP original y queda excluido de ambos paquetes.

## Comprobación pendiente en tus cuentas

Tras aplicar la migración y publicar archivos, verifica login real, relaciones de la API de Supabase, descarga Excel en tu teléfono, actualización del service worker y sincronización entre tus dispositivos. Las pruebas locales no reproducen la red, permisos y datos específicos de tu instalación. Sigue `ACTUALIZAR_A_V2_4.md`.
