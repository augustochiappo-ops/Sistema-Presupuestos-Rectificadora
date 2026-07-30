# Automatización de pedidos a CRAC (portal de socios) — investigación y plan

Este documento es sobre una cosa **distinta** de `CRAC.md`/`INTEGRACION-PENDIENTE.md` (que hablan de los CSV `precio-stock.csv`/`prefijos_crac.csv` que ya se importan a la app). Acá se documenta la investigación de una automatización nueva, todavía **no implementada**: un botón "Pedir repuestos" en el presupuesto que cargue automáticamente los repuestos del presupuesto en el sistema de pedidos online real de CRAC (`www.crac.com.ar`), sin llegar a confirmar/enviar el pedido.

**Estado: solo investigación y prueba de concepto (2026-07-30). No hay código de esto en el repo todavía.**

## ⚠️ Credenciales — regla no negociable

**Nunca** van a estar en este repo (es público) usuario/contraseña de CRAC, ni de ningún socio. Cuando haga falta implementar o probar esto, Claude tiene que **pedírselas al usuario en el momento**, nunca asumirlas, inventarlas ni reusar las de una sesión anterior sin confirmarlas de nuevo. Si algún día se implementa en producción, las credenciales viven como variables de entorno en el WSGI config de PythonAnywhere (mismo patrón que `APP_USERNAME`/`APP_PASSWORD_HASH`/`DEPLOY_SECRET`, ver `estado.md` sección "Deploy remoto automático"), nunca en git.

## Qué se probó (2026-07-30)

Con Playwright (Node) + el Chromium preinstalado del entorno de Claude Code, se hizo una prueba manual end-to-end contra el sitio real, a pedido del usuario, con sus credenciales reales tipeadas en el momento (no guardadas en ningún lado):

1. Login en `http://www.crac.com.ar/sistema/index.php` (usuario, contraseña, sucursal — el usuario usa sucursal Córdoba).
2. Navegación hasta "Pedido Actual" → "Agrega Producto" → búsqueda por código → carga de cantidad → click en "Agrega Productos al Pedido".
3. Se confirmó que el producto quedó en un pedido pendiente (sin enviar) con el total correcto.
4. El usuario borró el pedido de prueba desde el propio sitio de CRAC al terminar.

**Conclusión: el flujo funciona y es automatizable.** El problema no es la automatización en sí, sino **dónde correrla** (ver bloqueo de red más abajo).

## Mapa del sitio (estructura HTML/selectores, sin datos sensibles)

El sitio es viejo, basado en `<frameset>` (no SPA), sin API pública. Todo lo siguiente es responsabilidad de Playwright manejando frames (`page.frame({name: ...})`), no simple navegación de página.

### 1. Login — `index.php`
Formulario plano (no frames):
- Input usuario: `input[name="socio"]`
- Input contraseña: `input[name="contrasena"]`
- Select sucursal: `select[name="sucursal"]` (`value="1"` Córdoba, `"2"` Río IV, `"3"` Resistencia)
- Submit: `button[name="boton"]` (texto "Iniciar Sesión")
- Éxito → redirige a `principal.php`, un frameset con frames `menuFrame`, `cabecera`, `mainFrame`, `pie`.

### 2. Menú — frame `menuFrame` (`menu.html`)
Árbol de menú en JS (`treeMenuCode.js`/`menu.js`), no son links directos: hay que hacer click para expandir carpetas.
- "Pedidos" es una carpeta colapsada: `a[onclick*="treeMenuClick(2"]` (click expande, no navega).
- Una vez expandida, aparece "Pedido Actual": `a[onclick*="treeMenuClick(12"]` → carga `pedidos.php` en `mainFrame`.

### 3. Pedido actual/pendientes — frame `mainFrame`, `pedidos.php` / `pedido_actual.php?idpedido=N`
- Si **no hay** un pedido pendiente sin enviar: `pedido_actual.php?idpedido=0` crea uno nuevo (interno) automáticamente al entrar — **importante**: cada visita con `idpedido=0` genera un id interno nuevo, pero si no se le agrega ningún ítem, no queda como fila visible en la lista de pendientes (no genera basura visible mientras no se agregue nada).
- Si **ya hay** un pedido pendiente con al menos un ítem: `pedidos.php` muestra "Pedidos pendientes de enviar a CRAC" con una fila por pedido y botón `button[name="modifica"]` ("Continuar con el Pedido") que lleva a `pedido_actual.php?idpedido=<id>`.
- Dentro de `pedido_actual.php`, botones relevantes (todos `<button name="boton">` distinguibles solo por el texto/`onclick`):
  - **"Agrega Producto"** → `pedidos_productos_agrega2.php?idpedido=<id>&vuelta=primera` (el que hay que usar).
  - **"Envía a Sucursal"** → `pedidos_envia.php?idpedido=<id>` — **ESTE es el paso de confirmar/enviar el pedido real a CRAC. Nunca debe clickearse automáticamente.** Cualquier automatización de este flujo tiene que terminar después de "Agrega Producto" y parar ahí, dejando el pedido en estado pendiente para que una persona lo revise y lo envíe a mano (o se decida en el futuro, con el usuario delante, si alguna vez se automatiza también ese paso — hoy la instrucción explícita es que no).
  - Otros botones sin texto visible en el HTML (`pedidos_productos_agrega_retenes.php`, `pedidos_productos_agrega2x.php`) — no investigados, no se usan para este flujo.

### 4. Buscar y agregar producto — frame `mainFrame`, `pedidos_productos_agrega2.php?idpedido=<id>`
Formulario de búsqueda (`form[name="buscador"]`):
- `select[name="brubro"]` (rubro/categoría, "TODOS" por defecto)
- `input[name="bmarca"]` (marca, requiere el picker JS `validamarca()` — no investigado en detalle, no hizo falta)
- `input[name="busca1"]` (descripción libre)
- `input[name="bcodigo"]` (código exacto — el que usamos)
- Submit: `button[name="boton"]` con texto "Buscar" (mismo `name="boton"` que otros botones de la página — hay que filtrar por texto, no alcanza con el selector de atributo)

Al buscar, la misma página devuelve además un `form[name="agregaitemped"]` (acción `pedidos_productos_agrega3.php?idpedido=<id>`) con una fila por resultado:
- Código y descripción en `input[type="hidden"]` (no editables, ya vienen resueltos del catálogo del proveedor)
- Precio en `input[type="hidden"][name="itemped[].[precio]"]`
- **Cantidad** — el único campo que hay que completar: `input[name="itemped[].[cantiped]"]` (vacío por defecto, texto libre)
- Semáforo de disponibilidad por sucursal (CBA/RIV/RES) con imágenes `luz_verde`/`luz_amarilla`/`luz_roja` — verde = disponible, amarillo = a consultar, rojo = no disponible. Vale la pena mostrarle esto al usuario en la UI del presupuesto antes de pedir, no solo agregar a ciegas.
- Submit: `form[name="agregaitemped"] button[name="boton"]` (aparece dos veces en la página, arriba y abajo de la tabla — cualquiera de las dos sirve, con `.first()` alcanza). Este submit es el que efectivamente agrega el ítem al pedido (persiste server-side); no hace falta ningún otro paso para que quede cargado.

### Notas de robustez
- El sitio devuelve **503 intermitentes** (error del propio backend de CRAC, "upstream connect error... Connection refused" — confirmado con `curl -v`, no es problema de nuestra red). Cualquier automatización necesita reintentos con backoff, no asumir que un 503/timeout significa que el sitio está caído para siempre.
- Todos los formularios reusan `name="boton"` para botones distintos en la misma página — Playwright necesita filtrar por texto visible (`hasText`) o por el `onclick`/acción del formulario padre, nunca por el atributo `name` solo.

## El bloqueo real: red, no lógica

La automatización en sí funciona (probada de punta a punta). El obstáculo es **dónde correrla**:

- El entorno de Claude Code en la nube (donde se hizo la prueba) sí tiene salida a `crac.com.ar`, pero es un entorno de desarrollo efímero, no production.
- **PythonAnywhere (plan gratuito, donde vive la producción real) bloquea la salida a cualquier sitio fuera de su whitelist** — confirmado corriendo `curl -v http://www.crac.com.ar/sistema/index.php` desde la consola Bash de PythonAnywhere: devuelve `403 ERR_ACCESS_DENIED` del proxy squid de PythonAnywhere, con el mensaje "Access to arbitrary websites is not available from free accounts". `crac.com.ar` no calificaría para el whitelist de PythonAnywhere (piden que el sitio tenga API pública oficial, y CRAC es un sistema interno de socios).

**Decisión tomada con el usuario (2026-07-30): pagar el upgrade de PythonAnywhere a un plan pago.** Ver `decisiones.md` para el detalle y el porqué.

## Próximos pasos (para cuando se retome)

1. Usuario paga el upgrade de PythonAnywhere (plan Developer, ver `decisiones.md`).
2. Confirmar cuota de disco real de ese plan (el usuario hoy tiene 1GB en el plan free) — Playwright + Chromium pesan ~300-400MB, debería entrar pero conviene chequear con `df -h ~` antes de instalar nada en producción.
3. Instalar Playwright + Chromium en el virtualenv de producción (`pip install playwright && playwright install chromium` — confirmar que el modo headless no necesita librerías del sistema que falten en PythonAnywhere, ej. las que hicieron falta para PyQt6 offscreen en su momento).
4. Diseñar el endpoint backend: recibe un `presupuesto_id`, junta los repuestos ya cargados en ese presupuesto (código + cantidad, que ya existen como campos de `presupuesto_items`), corre la automatización, y devuelve qué se pudo agregar y qué no (por ejemplo si un código ya no existe en el catálogo de CRAC, o el sitio estaba caído).
5. Credenciales de CRAC como variable de entorno en el servidor (pedirlas al usuario en el momento de implementar, nunca antes — ver regla de arriba).
6. El botón nunca debe llegar a "Envía a Sucursal" — el pedido queda pendiente en CRAC para que una persona lo revise y lo mande a mano.
7. Diseñar qué pasa si el sitio de CRAC está caído (503) cuando se aprieta el botón — reintentos, y un mensaje claro al usuario en vez de fallar en silencio.
