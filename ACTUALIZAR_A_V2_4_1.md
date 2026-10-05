# Farmacia Heimar V2.4.1 · Ajustes de interfaz

Actualización sobre la V2.4 que ya está funcionando. Esta versión mejora la separación visual y abre Ventas por defecto.

## Cómo actualizar

1. Descarga y extrae `farmacia-heimar-v2-4-1-actualizacion.zip`.
2. Sube los archivos a la raíz de tu repositorio GitHub, respetando la carpeta `js/`.
3. Espera a que GitHub Pages termine de publicar, cierra la app y vuelve a abrirla. Verás Ventas como pantalla inicial.
4. Si aparece la interfaz anterior, recarga. El service worker tiene la versión `farmacia-heimar-v2-4-1-ui`.

**No requiere ejecutar SQL ni cambiar nada en Supabase** si ya tienes V2.4 instalada. Conserva tu `config.js` real: ninguno de los ZIP lo incluye.

## Archivos del ZIP de actualización

- `index.html`
- `styles.css`
- `js/app.js`
- `sw.js`
- `README.md`
- `ACTUALIZAR_A_V2_4_1.md`
- `VALIDACION_UI_V2_4_1.md`

El ZIP completo conserva el proyecto entero y las migraciones anteriores. Para actualizar desde V2.4 usa el ZIP de actualización; el esquema SQL completo sigue reservado a instalaciones nuevas.

## Cambios visibles

### Ventas

- Apertura automática al entrar, tanto con sesión guardada como después de iniciar sesión o crear/unirse a la farmacia.
- Nombre visible de la sección: Ventas. El botón inferior sigue siendo Vender.
- Catálogo dentro de un bloque azul, con encabezado **1 · Productos para vender** y cantidad de productos que coinciden con los filtros.
- Carrito dentro de un bloque distinto, con encabezado verde **2 · Venta actual**.
- Buscador, Pausadas/Historial y categorías agrupados con el catálogo.
- En móvil, el buscador permanece debajo de la barra superior mientras recorres el catálogo. Su posición se adapta a la altura real del encabezado, incluido el tamaño Grande.
- La barra Ver venta sigue llevando al carrito. Su desplazamiento usa la altura real del encabezado.
- Las tarjetas mantienen 3:4 como proporción preferida y crecen si un nombre/precio necesita más espacio.

### Ingresos

- **1 · Datos de la factura**: encabezado azul y bloque propio para proveedor, fecha, total y pago.
- **2 · Productos recibidos**: encabezado verde y bloque propio para líneas, cantidades, costos, vencimientos y comprobación del total.
- Se conservan selección centrada, creación de producto/categoría, crédito y validaciones de V2.4.

### Inventario

- Ver ficha y Ajustar stock siguen accesibles directamente.
- Editar y Eliminar están en **Más ⋯**, junto a cada producto, para compactar la tarjeta.
- El menú se cierra al tocar fuera o pulsar Escape. Eliminar sigue abriendo la confirmación existente.

### Claridad general

- Encabezado principal azul en móvil para diferenciar navegación y formularios.
- Jerarquía de títulos, bordes y fondos consistente en claro/oscuro.
- Venta del día resaltada en Inicio.
- Controles táctiles cómodos y conservación de Normal/Grande.

## Comprueba después de publicar

1. Cierra y abre: entra directamente a Ventas.
2. Ve a Inventario o Ingresos y pulsa Actualizar: debe conservar esa sección.
3. En Ventas, distingue el catálogo azul del carrito verde. Busca, añade producto, toca Ver venta y comprueba Pausar/Cobrar.
4. En Ingresos, comprueba ambos bloques y registra una captura habitual.
5. En Inventario, abre Más, Editar o Eliminar. Comprueba que Eliminar pide confirmación antes de actuar.
6. Revisa claro/oscuro y Normal/Grande en tu teléfono.

Esta entrega fue verificada localmente con datos ficticios. Los archivos están preparados para que los publiques en tu repositorio; no se publicaron automáticamente en tus cuentas.
