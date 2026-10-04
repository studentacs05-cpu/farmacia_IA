# Farmacia Heimar · V2.4

PWA estática para una farmacia familiar. HTML, CSS y JavaScript vanilla; Supabase Auth/PostgreSQL con RLS y GitHub Pages. No requiere Node para operar.

Clientes opcionales con Anónimo por defecto, facturas y Excel por período, compras a crédito y pagos, ajustes auditados, caducidad de productos activos, reportes por categoría, branding Heimar azul/verde/coral. Conserva POS, FEFO, anulación de lotes originales, SKU automático, proveedores, ventas pausadas, oscuro y Normal/Grande.

## Actualizar desde V2.3

Lee `ACTUALIZAR_A_V2_4.md`: primero la nueva migración SQL y después los archivos de GitHub. Conserva tu `config.js` real. No ejecutes el esquema completo sobre la farmacia existente.

## Instalación nueva

1. Crea un proyecto Supabase y ejecuta `supabase/schema.sql`, que incluye V2.4.
2. Copia `config.example.js` como `config.js` y completa URL y clave pública de Supabase. Nunca uses una clave secreta/service_role en frontend.
3. Sube el contenido a la raíz del repositorio y activa GitHub Pages.
4. Configura la URL en Supabase Auth. Crea la primera cuenta/farmacia y usa su código para unir otras cuentas.

Los ZIP no incluyen `config.js` para evitar reemplazar la configuración desplegada. Los datos reales permanecen en tu Supabase.

El campo de dosis/indicaciones continúa siendo manual. La app no genera dosis ni recomendaciones clínicas. Las facturas y números son comprobantes internos de operación.

Consulta `VALIDACION_V2_4.md` para las verificaciones realizadas y sus límites.
