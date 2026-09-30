# Farmacia AI — demo funcional

Aplicación web ligera para una farmacia familiar. Funciona como sitio estático en **GitHub Pages** y usa **Supabase** para autenticación, base de datos y almacenamiento privado de facturas.

## Qué incluye

- Inicio de sesión con email y contraseña.
- Una farmacia compartida por varios usuarios mediante código de invitación.
- Inventario por producto.
- Lotes, costo unitario, costo promedio, proveedor y fecha de vencimiento.
- Registro de facturas e ingreso de inventario.
- OCR local opcional para imágenes de facturas con Tesseract.js.
- Revisión humana obligatoria antes de guardar una factura.
- Registro de ventas/salidas con descuento de lotes por FEFO.
- Alertas de stock mínimo y caducidad.
- Compras sugeridas usando ventas de 30 días + stock + días objetivo.
- Gastos y resumen financiero de 30 días.
- Reportes por producto/categoría.
- Exportación CSV compatible con Google Sheets.
- PWA instalable en teléfono/tablet/PC.
- Seguridad con Supabase Auth + Row Level Security.
- Datos ficticios opcionales para probar el sistema.

## Archivos importantes

- `index.html` — interfaz completa.
- `styles.css` — diseño responsive.
- `config.js` — URL y Publishable key de Supabase.
- `js/app.js` — lógica de la aplicación.
- `js/db.js` — acceso a Supabase.
- `js/analytics.js` — métricas, compras sugeridas y CSV.
- `js/invoice-ocr.js` — OCR de imágenes.
- `supabase/schema.sql` — base de datos, funciones y políticas RLS.
- `GUIA_CONFIGURACION.md` — instrucciones desde cero.
- `manifest.webmanifest` + `sw.js` — instalación tipo app/PWA.

## Inicio rápido

1. Crea un proyecto gratuito en Supabase.
2. Ejecuta `supabase/schema.sql` en el SQL Editor.
3. Copia Project URL y Publishable key a `config.js`.
4. Sube esta carpeta a un repositorio de GitHub.
5. Activa GitHub Pages desde `main` + `/(root)`.
6. Abre la URL publicada, crea la primera cuenta y la farmacia.
7. En Configuración puedes cargar datos demo para verificar que todo funciona.

Lee **`GUIA_CONFIGURACION.md`** antes de usar datos reales.

## Seguridad importante

- **Nunca** pongas una `service_role`, secret key, contraseña de base de datos ni API secret en `config.js`.
- La Publishable key (o `anon` key en proyectos antiguos) está pensada para cliente web **solo con RLS correctamente configurado**.
- El repositorio y el HTML no deben contener facturas, datos de clientes ni otros datos privados. Los datos reales se guardan en Supabase.
- El bucket `invoices` es privado.
- Este demo está pensado para inventario/operación del negocio, no para almacenar historiales clínicos ni datos de pacientes.

## Limitaciones del demo

- El OCR solo procesa imágenes; los PDF se pueden guardar, pero sus campos se introducen manualmente.
- El OCR no interpreta de forma fiable cada línea de cualquier factura; por eso el usuario confirma los productos antes de actualizar inventario.
- La sugerencia de compra es una fórmula operativa sencilla, no un modelo de predicción avanzado.
- No hay integración con WhatsApp ni con sitios web de proveedores en esta versión.
- Para uso comercial serio conviene añadir copias de seguridad, auditoría de cambios y pruebas periódicas de permisos.
