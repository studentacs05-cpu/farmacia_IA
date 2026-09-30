# Guía paso a paso — Farmacia AI desde cero

Esta guía asume que no tienes nada configurado. No necesitas instalar Node, Python ni un servidor en tu computadora.

---

## 0. Qué vas a crear

La arquitectura es:

```text
Teléfono / PC / tablet
        ↓
GitHub Pages (interfaz pública, sin datos privados)
        ↓
Supabase Auth + Data API
        ↓
PostgreSQL con RLS
        ↓
Inventario / facturas / ventas / gastos
```

Las facturas subidas se guardan en un bucket privado de Supabase Storage. GitHub solo aloja el código de la interfaz.

---

## 1. Crea una cuenta y un proyecto en Supabase

1. Entra en https://supabase.com/
2. Crea una cuenta o inicia sesión.
3. Pulsa **New project**.
4. Elige una organización.
5. Pon un nombre, por ejemplo `farmacia-ai`.
6. Crea una contraseña fuerte para la base de datos y guárdala en un gestor de contraseñas.
7. Selecciona una región razonablemente cercana a la farmacia.
8. Crea el proyecto.

No copies la contraseña de la base de datos dentro del proyecto de GitHub.

---

## 2. Crea la base de datos

1. En Supabase abre **SQL Editor**.
2. Pulsa **New query**.
3. Abre el archivo `supabase/schema.sql` de este proyecto.
4. Copia TODO su contenido.
5. Pégalo en el SQL Editor.
6. Pulsa **Run**.
7. Debe terminar sin errores.

Este script crea:

- `pharmacies`
- `pharmacy_members`
- `products`
- `invoices`
- `stock_batches`
- `sales`
- `expenses`
- funciones seguras para ingreso de stock y ventas
- políticas Row Level Security
- bucket privado `invoices`

### Cómo comprobarlo

En **Table Editor** deberías ver las tablas anteriores.

En **Storage** deberías ver un bucket llamado `invoices` y debe aparecer como privado.

---

## 3. Configura autenticación

En Supabase abre **Authentication**.

Para una prueba familiar sencilla puedes usar email + contraseña.

### Opción A — más fácil para el demo

En la configuración de Email/Auth puedes desactivar temporalmente la confirmación obligatoria de correo. Así una cuenta nueva puede entrar inmediatamente.

### Opción B — recomendable cuando ya esté publicado

Mantén la confirmación de email activa. Una cuenta nueva tendrá que confirmar su dirección antes de entrar.

Más adelante, cuando tengas la URL de GitHub Pages, vuelve a Authentication → URL Configuration y añade esa URL como Site URL/Redirect URL si usas confirmaciones o recuperación de contraseña.

---

## 4. Obtén las credenciales públicas correctas

En tu proyecto de Supabase busca la sección de API / Connect / Project settings (el nombre exacto puede variar con la interfaz).

Necesitas solamente:

- **Project URL**
- **Publishable key**

En proyectos antiguos puede aparecer una clave llamada **anon**; cumple el mismo papel para el frontend.

### MUY IMPORTANTE

No uses en el navegador:

- `service_role`
- secret key
- contraseña de PostgreSQL
- claves privadas de Edge Functions

Las claves secretas pueden saltarse las políticas de seguridad.

---

## 5. Edita `config.js`

Abre `config.js`.

Encontrarás:

```js
window.FARMACIA_CONFIG = {
  SUPABASE_URL: 'PEGAR_AQUI_SUPABASE_URL',
  SUPABASE_PUBLISHABLE_KEY: 'PEGAR_AQUI_PUBLISHABLE_KEY',
  APP_NAME: 'Farmacia AI',
  CURRENCY: 'C$',
  DEFAULT_COVERAGE_DAYS: 14
};
```

Sustituye los dos primeros valores.

Ejemplo ficticio:

```js
window.FARMACIA_CONFIG = {
  SUPABASE_URL: 'https://abcdefgh.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_xxxxxxxxxxxxx',
  APP_NAME: 'Farmacia AI',
  CURRENCY: 'C$',
  DEFAULT_COVERAGE_DAYS: 14
};
```

Puedes cambiar `C$` por `$`, `€`, `MX$`, etc.

---

## 6. Prueba local opcional

Por seguridad del navegador, abrir `index.html` con doble clic puede limitar algunas funciones PWA. Puedes saltarte esta prueba y publicar directamente en GitHub Pages.

Si ya tienes un servidor local de tu preferencia, sirve la carpeta como archivos estáticos y abre `index.html`.

---

## 7. Crea el repositorio en GitHub

1. Entra en https://github.com/
2. Pulsa **New repository**.
3. Pon un nombre, por ejemplo `farmacia-ai`.
4. Para GitHub Free, si quieres usar GitHub Pages sin pagar, usa un repositorio público.
5. Crea el repositorio.

### ¿Es peligroso que sea público?

El código de la web será público, pero **los datos no están dentro del repositorio**. Las tablas y facturas viven en Supabase y están protegidas por autenticación + RLS.

Aun así, revisa siempre que el repositorio NO contenga:

- facturas reales
- exportaciones CSV reales
- contraseñas
- service role key
- secretos
- datos de clientes/pacientes

La Publishable key sí puede estar en una aplicación web; la seguridad real depende de las políticas RLS.

---

## 8. Sube los archivos

Sube el contenido de la carpeta `farmacia-ai-demo` a la raíz del repositorio.

La raíz debe verse aproximadamente así:

```text
farmacia-ai/
├─ index.html
├─ styles.css
├─ config.js
├─ manifest.webmanifest
├─ sw.js
├─ .nojekyll
├─ README.md
├─ GUIA_CONFIGURACION.md
├─ assets/
│  └─ icon.svg
├─ js/
│  ├─ app.js
│  ├─ db.js
│  ├─ analytics.js
│  └─ invoice-ocr.js
└─ supabase/
   └─ schema.sql
```

Haz commit de los archivos.

---

## 9. Activa GitHub Pages

1. En el repositorio abre **Settings**.
2. En el menú lateral abre **Pages**.
3. En **Build and deployment / Source**, elige **Deploy from a branch**.
4. Selecciona la rama `main`.
5. Selecciona la carpeta `/(root)`.
6. Guarda.

GitHub mostrará la URL del sitio cuando el despliegue termine. Normalmente será parecida a:

```text
https://TU-USUARIO.github.io/farmacia-ai/
```

---

## 10. Ajusta URLs de Supabase

Cuando tengas la URL final de GitHub Pages:

1. Vuelve a Supabase.
2. Abre **Authentication → URL Configuration**.
3. Usa la URL de GitHub Pages como Site URL si esta app será tu sitio principal.
4. Añádela también a las Redirect URLs permitidas, por ejemplo:

```text
https://TU-USUARIO.github.io/farmacia-ai/**
```

Esto es especialmente importante para confirmación de email y recuperación de contraseña.

---

## 11. Crea el primer usuario y la farmacia

1. Abre la web publicada.
2. Pulsa **Crear cuenta**.
3. Introduce email y contraseña.
4. Si tienes confirmación de email activada, confirma el mensaje recibido.
5. Entra.
6. La aplicación mostrará **Conecta tu farmacia**.
7. Elige **Crear farmacia**.
8. Pon el nombre.

Ese usuario se convierte en `owner`.

---

## 12. Añade el segundo usuario

1. En el primer usuario abre **Configuración**.
2. Copia el **Código de invitación**.
3. Cierra sesión o abre la web en otro dispositivo.
4. Crea la segunda cuenta.
5. Cuando aparezca “Conecta tu farmacia”, elige **Unirme con código**.
6. Introduce el código.

Ambas cuentas verán los mismos datos.

No publiques el código de invitación.

---

## 13. Prueba todo con datos ficticios

Antes de registrar información real:

1. Ve a **Configuración**.
2. Pulsa **Cargar datos de demostración**.
3. El sistema creará cuatro productos, una factura, lotes, varias ventas y gastos.
4. Recorre todas las secciones.

La carga demo solo funciona si la farmacia no tiene productos.

---

## 14. Flujo normal de uso

### A. Crear productos

En **Inventario → + Producto** registra:

- nombre
- SKU/código
- categoría
- unidad
- stock mínimo
- días objetivo de cobertura
- proveedor preferido

No introduzcas stock inicial directamente en el producto. Haz el primer ingreso mediante una factura/ingreso para mantener el historial de costos y lotes.

### B. Ingresar una factura

En **Facturas / Ingresos**:

1. Escribe proveedor, número y fecha.
2. Opcionalmente sube la factura.
3. Si es imagen, puedes pulsar **Extraer texto de imagen**.
4. Revisa el texto OCR.
5. Añade las líneas reales de productos.
6. Para cada línea introduce cantidad, costo, lote y vencimiento.
7. Pulsa **Guardar factura e ingresar inventario**.

La operación guarda la factura y los lotes en una sola transacción de base de datos.

El producto queda actualizado con:

- stock actual
- costo promedio ponderado
- último costo
- último proveedor

### C. Registrar venta/salida

En **Inventario → Registrar venta**:

1. Selecciona producto.
2. Cantidad.
3. Precio unitario.
4. Fecha.

El sistema valida stock y descuenta los lotes por FEFO: primero los que vencen antes.

### D. Revisar caducidades

La sección **Caducidades** muestra lotes que todavía tienen unidades y los ordena por fecha de vencimiento.

### E. Compras sugeridas

La fórmula usa:

```text
ventas últimos 30 días
        ↓
venta diaria promedio
        ×
días objetivo de cobertura
        ↓
stock objetivo
        −
stock actual
        ↓
cantidad sugerida
```

También respeta el stock mínimo.

Es una ayuda para decidir, no una orden automática de compra.

### F. Finanzas

Registra gastos y el sistema calcula para los últimos 30 días:

- ingresos por ventas
- costo estimado de productos vendidos
- margen bruto
- gastos
- resultado estimado

### G. Exportar a Google Sheets

En **Reportes** pulsa:

- Exportar inventario CSV
- Exportar ventas CSV

Después abre Google Sheets → Archivo → Importar y selecciona el CSV.

Esto deja abierta una futura integración directa con Google Sheets sin hacerla necesaria para operar desde el primer día.

---

## 15. Instalar la web como si fuera una app

La aplicación incluye un `manifest.webmanifest` y service worker.

En Android/Chrome normalmente puedes abrir el menú del navegador y elegir una opción tipo **Instalar aplicación** o **Añadir a pantalla de inicio**.

En computadoras compatibles, Chrome/Edge también puede mostrar un icono de instalación.

La PWA no convierte Supabase en offline: para leer o modificar datos reales sigue haciendo falta conexión a Internet.

---

## 16. Seguridad que no debes cambiar

El archivo SQL activa Row Level Security en todas las tablas expuestas.

La idea es:

```text
usuario no autenticado
      ↓
NO puede leer datos

usuario autenticado A
      ↓
solo puede leer la farmacia de la que es miembro

usuario autenticado B de otra farmacia
      ↓
NO puede leer la farmacia A
```

Además, la aplicación escribe inventario y ventas mediante funciones de base de datos para mantener consistencia.

Nunca desactives RLS para “arreglar” un error de permisos.

---

## 17. Antes de usar datos reales

Haz esta lista:

- [ ] Dos usuarios pueden entrar desde dispositivos diferentes.
- [ ] Un usuario no autenticado no ve datos.
- [ ] El bucket `invoices` sigue privado.
- [ ] `config.js` contiene solo la Publishable/anon key, nunca service role.
- [ ] Una factura de prueba aumenta stock correctamente.
- [ ] Una venta reduce stock y el lote correcto.
- [ ] Caducidades muestra las fechas esperadas.
- [ ] Exportación CSV abre correctamente en Google Sheets.
- [ ] La moneda está configurada correctamente.
- [ ] Eliminaste cualquier dato demo antes de empezar producción, o creaste un proyecto Supabase limpio para producción.

Mi recomendación más limpia es usar un proyecto Supabase para pruebas y otro nuevo para datos reales cuando terminen de validar el flujo.

---

## 18. Qué desarrollaría en la versión 2

Una vez que tus padres usen esta versión unas semanas, las mejoras más valiosas probablemente sean:

1. Importación automática desde CSV/Excel del sistema que ya usen.
2. OCR/IA de facturas más estructurado, con propuesta automática de líneas.
3. Historial de precios por proveedor y comparación de costos.
4. Auditoría: quién modificó qué y cuándo.
5. Correcciones/devoluciones de inventario con trazabilidad.
6. Dashboard con periodos configurables.
7. Copias de seguridad automáticas/exportación programada.
8. Integración directa con Google Sheets si sigue siendo útil.

No empezaría por un chatbot. Primero conviene acumular datos limpios y hábitos de uso consistentes.
