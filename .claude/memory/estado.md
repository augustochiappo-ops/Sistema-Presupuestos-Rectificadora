# Estado del proyecto

## Fase actual
**Migración a versión web en curso.** La app de escritorio (PyQt6) está completa y funcional, se usa como referencia funcional 1:1. Se construyó una versión web completa en `webapp/` (backend Flask + frontend React/Vite) que replica todas las pantallas activas y ya fue probada localmente con los datos reales del negocio. Próximo paso: el usuario tiene que crear una cuenta gratuita en PythonAnywhere para el deploy (ver sección "Migración web" abajo).

## Completado
- [x] CLAUDE.md con visión completa del sistema, dominio, fuentes de datos y features
- [x] Stack tecnológico definido: Python + PyQt6 + pandas + reportlab + SQLite3
- [x] Repositorio git inicializado
- [x] .gitignore configurado
- [x] Excel de FACRA disponibles en `Excel/Facra/`
- [x] Skills de engineering y design configuradas para uso proactivo
- [x] Sistema de memoria local del proyecto creado
- [x] **Scaffold completo del proyecto** (commit `21024a0`)
  - `main.py` — punto de entrada
  - `requirements.txt` — PyQt6, pandas, xlrd, openpyxl, reportlab
  - `src/data/db.py` — SQLite: init, migración automática de columnas
  - `src/data/facra.py` — parser FACRA + consultas
  - `src/ui/styles.py` — design tokens centralizados
  - `src/ui/main_window.py` — ventana principal con sidebar
  - `src/ui/motores_widget.py` — listado de motores
  - `src/ui/actualizar_widget.py` — importación de Excel
  - `src/ui/presupuestos_widget.py` — placeholder con botón "Nuevo"
  - `src/ui/placeholder_widget.py` — placeholder genérico
- [x] **Listado de Motores funcionando:**
  - Filtro por marca (panel izquierdo)
  - Buscador en tiempo real con debounce
  - Tabla con columnas: Código, Motor, Marca, Cilindrada, Tipo, Cilindros, Diámetro cil., Lista Nº, Origen
  - Ordenamiento por clic en encabezado (toggle asc/desc), numérico correcto
  - Columnas redimensionables individualmente
  - Columna Motor se expande automáticamente para llenar el ancho disponible
  - Se carga solo una vez por sesión (flag `_cargado`)
- [x] **Actualizar Excel funcionando:**
  - Importación de nomenclador FACRA (491 motores)
  - Importación de lista orientadora FACRA (235 servicios)
  - Botones CRAC deshabilitados (para más adelante)
  - Importación en hilo separado (no bloquea la UI)
  - Señal `datos_actualizados` recarga el listado de motores automáticamente
- [x] **Parser de descripciones FACRA** extrae:
  - `marca` — primera palabra
  - `cilindros` — patrón `*NCIL*`
  - `tipo` — NAFTA / DIESEL / TURBO DIESEL
  - `cilindrada` — NNNNcc o N.NL
  - `diametro` — valor antes de `mm` al final de la descripción
- [x] **Base de datos SQLite** con tablas: motores, servicios, clientes, presupuestos, presupuesto_items
- [x] **Migración automática** de columnas nuevas (ALTER TABLE si no existen)

## Completado (continuación sesión 2026-05-29)
- [x] **Click en motor → Lista orientadora de mano de obra**
  - Clic en cualquier celda de una fila abre la lista orientadora correspondiente
  - Muestra el precio de la lista asignada al motor (columna Ln de servicios)
  - Botón "← Volver al listado" regresa al listado de motores
  - Widget refactorizado: MotoresWidget usa MotorSelectorWidget reutilizable
- [x] **Ctrl + rueda del ratón → zoom de fuente en todas las tablas**
  - `ZoomableTable(QTableWidget)` en `src/ui/widgets.py`
  - Ajusta font size de 8 a 24 px
  - Ajusta altura de filas proporcionalmente
- [x] **Flujo completo de Nuevo Presupuesto**
  - Paso 1: ingresar nombre del cliente
  - Paso 2: selector de motor (mismo look que Listado de Motores)
  - Paso 3: lista orientadora con checkboxes, total calculado en tiempo real
  - Finalizar: guarda en DB + genera PDF + lo abre automáticamente
  - Historial de presupuestos en tabla (doble clic → abre PDF)
- [x] **PDF profesional** con reportlab
  - Encabezado: Rectificaciones Chicappo
  - Tabla de servicios, total destacado, nota de validez 7 días
  - Guardado en carpeta `Presupuestos/` del proyecto
- [x] **Arquitectura refactorizada**
  - `src/ui/motor_selector_widget.py` — selector reutilizable con señal `motor_seleccionado`
  - `src/ui/widgets.py` — ZoomableTable
  - `src/utils/pdf_gen.py` — generación de PDF
  - `src/ui/styles.py` — `make_table_style(font_px)` para zoom dinámico

## Completado (continuación sesión 2026-05-29 — parte 2)
- [x] **Pestaña Clientes** — tabla con Nombre | Cant. presupuestos | Último presupuesto
  - Clic en cliente → lista de sus presupuestos → clic → abre detalle
- [x] **Autocompletado de cliente** en el wizard (lista de sugerencias filtrada por texto)
- [x] **Vista detalle de presupuesto** (desde historial y desde clientes, clic en fila)
  - Info bar: cliente, motor, fecha
  - Tabla de servicios con buscador (filtra por Nº o descripción)
  - Sección de notas (read-only en vista)
  - Historial de PDFs: último PDF + "Ver versiones anteriores"
- [x] **Modo edición del presupuesto**
  - Precios editables (QLineEdit por celda)
  - Fila en blanco al final para agregar servicios custom (aparece nueva cuando se llena)
  - Notas editables
  - Botón "Guardar cambios" / "Cancelar"
  - Confirmación si intenta salir con cambios sin guardar
- [x] **Reconstruir PDF** — genera v2, v3, etc. sin borrar los anteriores
- [x] **Buscador en lista orientadora** (desde motores y desde detalle de presupuesto)
- [x] **Checkboxes verdes** al tildar servicios en el wizard
- [x] **DB expandida**: tabla `presupuesto_pdfs`, columna `descripcion_custom` en items
  - Migración automática de `pdf_path` existente → `presupuesto_pdfs`
- [x] **PresupuestoDetalleWidget** en stack[5] (sin ítem de menú); volver sincroniza sidebar

## Completado (sesión 2026-06-04)
- [x] **Buscador en paso 3 del wizard** — QLineEdit encima de la tabla filtra en tiempo real por descripción o Nº de ítem. Al volver al paso 3, el buscador se resetea.
- [x] **Favoritos de servicios** — estrellita (☆/★) en col 0 de cada fila. Clic togglea en DB (`favoritos_servicios`). La estrella es ámbar (★) si es favorito, gris (☆) si no. Cambiar estrella durante el wizard no reorganiza la tabla (solo persiste para la próxima vez).
- [x] **Favoritos al inicio** — al poblar el paso 3, los servicios favoritos aparecen primero, luego un separador "─── Lista de la Cámara ───" y después el resto. El separador se oculta si el buscador filtra todos los favoritos.
- [x] **DB**: tabla `favoritos_servicios` + migración automática (CREATE IF NOT EXISTS) + `toggle_favorito_servicio()` + `get_favoritos_ids()`.

## Pendiente (app de escritorio)
- [ ] Módulo Editar Precios (factor de ajuste sobre lista FACRA)
- [ ] Botón "+" para crear motor manual si no está en FACRA
- [ ] CRUD de clientes (editar nombre, teléfono, notas)

## Pestaña Repuestos — CRAC (sesión 2026-07-29, solo app de escritorio)

Se agregó la pestaña **Repuestos** (ítem de menú al final del sidebar, `🔩 Repuestos`) para navegar el catálogo del proveedor de repuestos (nombre interno "CRAC" — ver `CRAC/CRAC.md` y `CRAC/INTEGRACION-PENDIENTE.md`, documentos autocontenidos con el formato de datos, el algoritmo de decodificación de prefijos y las decisiones de negocio pendientes). Todavía **no está integrada con motores ni presupuestos** — es solo la pantalla de navegación/búsqueda, a propósito (pedido explícito del usuario: "por ahora hagamos esta pestaña, después vemos cómo lo integramos").

- **`src/data/crac.py`** — módulo nuevo:
  - `importar_prefijos(path)` — lee `prefijos_crac.csv` (con encabezado, `;`, UTF-8) → tabla `crac_prefijos` (tipo, prefijo, nombre). La columna `activo` del CSV **no se usa** (decisión explícita del usuario: se muestran todas las categorías/marcas sin importar si siguen vigentes hoy).
  - `importar_precio_stock(path)` — lee `precio-stock.csv` (sin encabezado, `;`, comillas dobles, **Latin-1**, ~64.250 filas) → tabla `crac_repuestos`. Decodifica cada código contra los prefijos ya cargados (algoritmo longest-match de `CRAC.md` sección 3.2: 2 chars de categoría → si no, 1 char; después 2 chars de marca → si no, 1 char; el resto es opaco). Si el código no decodifica (~1.1%, ej. `"ALQUILER"`), se guarda igual sin categoría/marca. Precio con coma decimal (`473219,41` → `473219.41`); nunca se muestra `$0` como precio real (se muestra "—" en la UI cuando `precio == 0`).
  - Cada importación **reemplaza por completo** la tabla correspondiente (mismo patrón que FACRA).
  - **Validado contra los CSV reales**: 296 prefijos, 64.250 repuestos, 63.542 decodificados / 708 no estándar (coincide exacto con las cifras de `CRAC.md`), 565 filas con precio 0 y stock, 12.249 con precio 0 sin stock — mismos números documentados.
  - Orden de carga recomendado: prefijos primero, precio-stock después (si se invierte, los repuestos igual se guardan pero sin categoría/marca legibles hasta la próxima carga de precio-stock).
- **`src/data/db.py`** — tablas nuevas `crac_prefijos` (PK tipo+prefijo) y `crac_repuestos` (codigo, aplicacion, precio, stock, cat_prefijo, marca_prefijo, resto) con índices en código/categoría/marca.
- **`src/ui/actualizar_widget.py`** — las dos cards de CRAC (antes deshabilitadas / placeholder) ahora funcionan: "Lista de Prefijos CRAC" y "Lista de Precios y Stock CRAC", con selector de archivo `.csv` (se generalizó `_CardExcel` con un parámetro `filtro_archivo`).
- **`src/ui/repuestos_widget.py`** — pantalla nueva:
  - Panel izquierdo con lista de categorías (mismo look que el panel de marcas de Motores).
  - Selector de marca (combo), filtro de código y filtro de descripción (buscan sobre `aplicacion` del CSV), con debounce de 280ms.
  - **Decisión de UX confirmada con el usuario**: con ~64.250 repuestos, la tabla arranca **vacía** con un mensaje pidiendo elegir un filtro — no carga todo de entrada. En cuanto se aplica cualquier filtro (categoría, marca, código o descripción) se dispara la búsqueda, con tope de 1000 filas mostradas y contador que avisa si hay más resultados que los mostrados.
  - Columnas: Código, Descripción (aplicación), Marca, Categoría, Precio (formato `$ 1.234,56`, "—" si es 0), Stock ("Sí"/"No" en verde/rojo).
  - `recargar()` se conecta a la señal `datos_actualizados` de Actualizar Excel, igual que motores y presupuestos.
- **`src/ui/main_window.py`** — "Repuestos" agregado al final del sidebar (índice 5). El widget de detalle de presupuesto (sin ítem de menú) pasó de índice 5 a **índice 6** en el stack.
- **`src/ui/styles.py`** — token nuevo `COMBO_INPUT` (estilo QSS para QComboBox, mismo criterio visual que `SEARCH_INPUT`).
- **Regla de confidencialidad respetada**: la palabra "CRAC" solo aparece en código interno, nombres de módulo/función, y en la pantalla interna "Actualizar Excel" (panel de administración, no la ve el cliente). La pestaña visible para el usuario del sistema se llama "Repuestos", sin mencionar el proveedor.
- **Probado de punta a punta headless** (PyQt6 con `QT_QPA_PLATFORM=offscreen`, hubo que instalar `libegl1`/`libgl1` en el entorno): importación real de los dos CSV, carga de categorías/marcas, filtro por código, filtro por categoría, estado vacío al limpiar filtros — todo verificado contra los datos reales del proveedor.

**Pendiente para una próxima sesión** — ~~todo esto~~ → **RESUELTO el 2026-07-29** (ver sección "Repuestos integrados a los presupuestos" más abajo y `CRAC/INTEGRACION-PENDIENTE.md` actualizado):
- ~~Asociar repuestos a motores~~ → sugerencias derivadas del historial de presupuestos del motor.
- ~~Combinar mano de obra + repuesto en la misma línea~~ → el dueño eligió sección "Repuestos" separada.
- ~~Advertencia si precio/stock cambia post-emisión~~ → implementada (precio/stock congelados + comparación al abrir el Detalle).
- ~~Repuesto sin stock~~ → se agrega igual, con aviso en pantalla (nunca en el PDF).
- ~~Esta pestaña no se portó a la versión web~~ → **se portó el mismo día** (ver sección siguiente), a pedido del usuario que usa la web como interfaz principal.

## Repuestos portado a la versión web (sesión 2026-07-29, misma tarde)

El usuario esperaba ver la pestaña en **chiapppo.pythonanywhere.com** (su interfaz principal), no en la app de escritorio. Se portó todo a `webapp/` con la misma lógica y decisiones (SQLite, tabla vacía hasta filtrar, columna `activo` ignorada):

- **`webapp/backend/app/crac.py`** — copia exacta de `src/data/crac.py` (mismo parser, mismo algoritmo de decodificación, sin cambios de lógica). Reutiliza `from .db import get_connection` como el resto de módulos portados (`facra.py`).
- **`webapp/backend/app/db.py`** — mismas tablas `crac_prefijos` y `crac_repuestos`.
- **`webapp/backend/app/routes/repuestos.py`** (nuevo blueprint `/api/repuestos`):
  - `GET /categorias`, `GET /marcas`
  - `GET /` con query params `categoria`, `marca`, `codigo`, `descripcion` → `{total, repuestos}` (si no hay ningún filtro, devuelve vacío sin tocar la DB — mismo criterio que el desktop)
  - `POST /importar-prefijos`, `POST /importar-precio-stock` — reciben el archivo por `multipart/form-data` (`request.files`), igual que los endpoints de FACRA en `routes/excel.py` (`_guardar_temporal` a un archivo temporal, se borra después de importar).
- **`webapp/frontend/src/screens/Repuestos/RepuestosScreen.jsx`** (nuevo): panel de categorías (mismo componente visual que el panel de marcas de `MotorSelector`, clase CSS `.motor-selector-grid` reutilizada), `<select>` de marca, dos `SearchInput` (código y descripción) con debounce de 280ms, `DataTable` con columnas Código/Descripción/Marca/Categoría/Precio/Stock. Precio nunca muestra `$0` (`render: v => v ? formatPrecioARS(v) : '—'`); Stock usa `StatusBadge` reutilizando los colores verde/rojo ya definidos para Vigente/Vencido.
- **`webapp/frontend/src/screens/Excel/ExcelScreen.jsx`** — las cards de CRAC (antes "Próximamente", deshabilitadas) ahora suben `.csv` de verdad a los endpoints nuevos (se generalizó `CardImport` con props `accept`/`extension`).
- **`webapp/frontend/src/layout/Sidebar.jsx`** y **`App.jsx`** — ítem "Repuestos" al final del menú, ruta `/repuestos`.
- **Probado end-to-end con Flask test client** (sin servidor real): login, import de los dos CSV reales (mismos resultados exactos que el desktop: 296 prefijos, 64.250 repuestos, 63.542 decodificados), filtro por código, endpoint sin filtro devuelve vacío, ruta protegida por `@login_required` devuelve 401 sin sesión, SPA fallback sirve `/repuestos` correctamente.
- **`npm run build`** corrido y el nuevo `static_build/` (incluye `assets/index-jibsO7Aj.js`, reemplaza al anterior) se versiona en git, siguiendo la convención ya establecida del proyecto (PythonAnywhere no tiene Node instalado).
- Después de mergear esto, falta correr el deploy remoto: `git pull` en el servidor + reload vía el webhook `POST /api/deploy` (ver sección "Deploy remoto automático" más arriba) para que el cambio llegue a producción.

## Repuestos integrados a los presupuestos (sesión 2026-07-29, rama `claude/revisar-codigo-master-vye67l`)

El wizard de presupuestos pasó de 3 a **4 pasos** (Cliente → Motor → Servicios → **Repuestos**) en **ambas** versiones (web y escritorio). Decisiones tomadas con el dueño en esta sesión (todas asentadas en `CRAC/INTEGRACION-PENDIENTE.md`, que quedó con un solo punto abierto: el mecanismo de carga diaria del CSV):

- Precio CRAC tal cual (es precio final, sin margen), con unitario editable por línea; cantidad editable; ítems manuales fuera de catálogo permitidos.
- El paso Repuestos siempre se muestra pero es opcional; **se permite un presupuesto de solo repuestos** (la validación del backend pasó de "al menos un servicio" a "al menos un ítem").
- PDF y Detalle: sección "Repuestos" separada (Código / Descripción / Cant. / P. unitario / Subtotal). La palabra "CRAC" sigue sin aparecer en nada que vea el cliente (verificado por grep).
- Sin stock: se agrega igual con aviso "Sin stock — sujeto a disponibilidad" (solo en pantalla).
- Aviso post-emisión: cada línea congela `repuesto_codigo` + `precio_unitario` + `stock_al_cotizar`; al abrir el Detalle se compara contra el catálogo vigente y se avisa por línea + banner ("Precio de lista cambió", "Ya no tiene stock", "Ya no está en la lista").
- Sugerencias por motor: el paso arranca con "Usados antes en este motor" (query derivada del historial `presupuesto_items` × `presupuestos.motor_id` — **sin tabla de asociación nueva**).

**Modelo de datos** (idéntico en `webapp/backend/app/db.py` y `src/data/db.py`, migración aditiva con el patrón `PRAGMA table_info`): `presupuesto_items` ganó `tipo` ('servicio'|'repuesto'), `repuesto_codigo` TEXT, `cantidad` REAL DEFAULT 1, `precio_unitario` REAL, `stock_al_cotizar` INTEGER. **Clave**: `precio_aplicado` sigue siendo el TOTAL de línea (cantidad × unitario, calculado siempre server-side), así `total = sum(precio_aplicado)` y todo el código viejo siguen funcionando. La referencia al catálogo es SIEMPRE por `codigo` (los ids de `crac_repuestos` no sobreviven al reimport diario del CSV).

**Backend web**: `_resolver_items` acepta ítems `{tipo:'repuesto', repuesto_codigo, descripcion, cantidad, precio_unitario}` (congela desc/stock del catálogo server-side; ítems inválidos ahora devuelven 400 con detalle en vez de descartarse en silencio); `GET /api/motores/:id/repuestos-sugeridos`; `crac.get_repuesto_por_codigo()`; `pdf_gen.generar_pdf(..., repuestos=None)` retrocompatible (omite la tabla de servicios si el presupuesto es de solo repuestos).

**Frontend web**: la selección de servicios y repuestos ahora vive en `WizardPresupuesto` (ir atrás/adelante no pierde nada; `PasoServicios` pasó a componente controlado con botón "Siguiente"); `PasoRepuestos.jsx` nuevo (sugeridos + picker compacto con selects de categoría/marca + búsqueda por código/descripción, click en fila agrega, código repetido suma cantidad, stepper de cantidad, unitario editable, alta manual, totales desglosados); `Detalle.jsx` con sección Repuestos, warnings y edición (cantidad/unitario, alta manual — el picker de catálogo completo quedó solo en el wizard, a propósito). Cambiar de motor a mitad del wizard resetea servicios (los precios son por lista) pero conserva repuestos.

**Escritorio**: página 5.ª en el `QStackedWidget` del wizard (los subtítulos pasaron a "de 4"), calcada de la web con los patrones de `repuestos_widget.py`; Detalle con separador "─── Repuestos ───" en vista, banner de warnings, y en edición la tabla pasa a 4 columnas (Cant. con QSpinBox solo para repuestos) + botón "＋ Repuesto".

**Probado**: suite funcional del backend (migración sobre DB vieja, resolución de ítems, congelados, detección de cambios tras tocar el catálogo, sugerencias, PDFs solo-repuestos/mixto/retrocompatible), integración Flask test client punta a punta (POST/GET/PUT/400s), `npm run build` + oxlint limpios, y UI Qt offscreen (wizard + detalle con edición). Presupuestos viejos se ven igual que antes (filas `tipo='servicio'`, `cantidad=1`).

## Migración web (sesión 2026-07-28)

Se construyó una versión web completa en `webapp/` (mismo repo, la app de escritorio en `main.py`/`src/`/`db/` queda intacta como backup). Decisiones tomadas con el usuario — ver `decisiones.md`.

**Backend** (`webapp/backend/`, Flask):
- `app/db.py`, `app/facra.py`, `app/pdf_gen.py` — portados de `src/data/` y `src/utils/` sin cambiar lógica de negocio (mismo esquema SQLite, mismo parser regex de motores, mismo PDF con reportlab).
- `app/helpers.py` — `formato_precio_ars()` centralizado (antes duplicado 5 veces en el código de escritorio).
- `app/auth.py` — login por sesión (usuario/password hasheado por env vars `APP_USERNAME`/`APP_PASSWORD_HASH`), sin OAuth/JWT (un solo usuario).
- `app/routes/{motores,servicios,excel,clientes,presupuestos}.py` — API REST completa.
- **Importante — paridad de precios**: al CREAR un presupuesto, el precio de los ítems de FACRA se recalcula server-side contra la lista vigente (no se confía en el precio que manda el navegador — protección agregada, no rompe nada porque en el wizard de escritorio el precio nunca era editable al crear). Al EDITAR un presupuesto, el precio de CUALQUIER ítem (incluidos los de FACRA) es libre — así funciona ya la app de escritorio (permite descuentos/ajustes manuales), y se respetó ese comportamiento en `_resolver_items_edicion` (ver `routes/presupuestos.py`).
- `app/static_frontend.py` — sirve el build de React con fallback de SPA. Probado: `vite build` + Flask sirviendo standalone en `http://127.0.0.1:5000` sin el dev server de Vite, funciona igual que en dev.

**Frontend** (`webapp/frontend/`, Vite + React + react-router-dom + lucide-react):
- Tokens y `styles.css` copiados tal cual desde `Rectificadora Design System/`.
- Componentes base (`Button`, `SearchInput`, `NavItem`, `PageHeader`, `DataTable`, `StatusBadge`) traducidos del design system a JSX compilado (sin el hack de Babel-en-browser del prototipo).
- Las 6 pantallas activas construidas: Login (nueva), Motores, Excel, Clientes, Presupuestos (historial + wizard de 3 pasos + detalle/edición), Precios (placeholder igual que en escritorio).
- **Cambio de UX pedido explícitamente por el usuario**: en el wizard de creación ahora SÍ se pueden agregar ítems custom (botón "+ agregar"), a diferencia de la app de escritorio donde eso solo era posible al editar un presupuesto ya creado.
- **Bug encontrado y corregido**: `window.open()` para abrir el PDF generado, llamado después de un `await`, puede ser bloqueado como popup por el navegador. Se corrigió abriendo una pestaña en blanco de forma síncrona dentro del handler de click y seteando `location.href` recién cuando llega la respuesta (en `WizardPresupuesto.jsx` y `Detalle.jsx`).
- `estadoPresupuesto()` en `utils/format.js` calcula Vigente/Vencido a partir de la fecha + 7 días (mismo criterio que la nota de validez del PDF) — es un dato calculado, no viene de la DB.

**Probado localmente**:
- Los 3 archivos Excel reales de FACRA (491 motores, 235 servicios — coincide con `CAMARA_RECTIFICADORES_FACRA.md`).
- Circuito completo de presupuestos por curl y por la UI real (login, wizard con ítem de catálogo + ítem custom, PDF generado y descargable, editar con override de precio, reconstruir PDF con historial de versiones).
- Se copiaron `db/presupuestos.db` y `Presupuestos/*.pdf` reales a `webapp/backend/data/` y se verificaron los 6 presupuestos / 2 clientes reales en todas las pantallas — coinciden exactamente con la app de escritorio.

**Deploy completado (2026-07-28) — EN PRODUCCIÓN:**
- URL: https://chiapppo.pythonanywhere.com — usuario `admin`, contraseña elegida por el usuario (hash guardado en el WSGI config del servidor, no en git).
- Cuenta PythonAnywhere del usuario: `chiapppo` (plan free).
- Repo GitHub: se pasó de privado a **público** (necesario para que PythonAnywhere pueda clonarlo sin token) — no tiene secretos, `.gitignore` excluye `data/`, `venv/`, `node_modules/`.
- **Importante**: el repo tiene dos ramas — `main` (default de GitHub, casi vacía, solo un README) y `master` (todo el código real). Quedó pendiente unificarlas (ver tarea de background "Unificar ramas main/master"); mientras tanto, clonar siempre con `git clone -b master ...`.
- Entorno del servidor: Python 3.10 en un virtualenv (`presupuestos-env`) — **Python 3.11 en ese servidor tiene el módulo `_posixsubprocess` roto**, no usar.
- El build de producción del frontend (`webapp/backend/app/static_build/`) se versiona en git a propósito, para no necesitar Node.js instalado en PythonAnywhere — hay que correr `npm run build` en `frontend/` y commitear de nuevo cada vez que se toque el frontend.
- **Bug real encontrado y corregido post-deploy**: la DB de escritorio guardaba `pdf_path` como ruta absoluta de Windows (`C:\Users\...\Presupuestos\...`), inválida en el servidor Linux → los PDFs devolvían 404. Se corrigió para guardar solo el nombre de archivo (la ruta completa se arma siempre contra `config.PDFS_DIR` del servidor actual) + migración automática en `init_db()` para las rutas viejas ya guardadas.
- Smoke test completo en producción: motores, marcas, servicios por motor, favoritos, clientes, presupuestos, detalle, PDFs (descarga real verificada), login/logout — todo correcto contra los datos reales del negocio.

## Deploy remoto automático (2026-07-28)

A pedido del usuario (quiere poder pedir cambios desde el celular sin depender de una compu), se armó un webhook de deploy: **`POST https://chiapppo.pythonanywhere.com/api/deploy`** con header `X-Deploy-Secret: <secreto>` hace `git pull` en el servidor + reload de la web app vía la API oficial de PythonAnywhere — todo en una sola llamada, sin tocar la consola ni el dashboard.

- Código: `webapp/backend/app/routes/deploy.py`. El reload se dispara en un hilo aparte con delay (`threading.Timer`) para no cortar la respuesta HTTP del propio request que lo dispara (si no, a veces devuelve 502 aunque el reinicio haya funcionado bien).
- Credenciales (**NO están en git**, viven en dos lugares):
  1. `webapp/backend/.deploy_secrets` (local, gitignored) — para que Claude las cargue con `source` en futuras sesiones y llame al webhook directamente.
  2. El WSGI config file de PythonAnywhere (`/var/www/chiapppo_pythonanywhere_com_wsgi.py`, no versionado) — tiene las mismas 4 variables (`PA_USERNAME`, `PA_DOMAIN`, `PA_API_TOKEN`, `DEPLOY_SECRET`) más las que ya tenía (`APP_USERNAME`, `APP_PASSWORD_HASH`, `SECRET_KEY`, `DATA_DIR`, `SESSION_COOKIE_SECURE`).
- Confirmado con GitHub que `github.com`/`api.github.com`/`*.githubusercontent.com` están en la whitelist de internet del plan free de PythonAnywhere, así que el `git pull` desde dentro de la app funciona sin problema.
- **Flujo de trabajo actual para cambios futuros**: Claude edita código → prueba en local → si toca el frontend, corre `npm run build` y commitea `static_build/` de nuevo → `git push` → `source webapp/backend/.deploy_secrets && curl -X POST https://chiapppo.pythonanywhere.com/api/deploy -H "X-Deploy-Secret: $DEPLOY_SECRET"`. Cero pasos manuales para el usuario.

## Confirmado: hay más de una sesión de Claude trabajando en este proyecto (2026-07-28)

El usuario usa **la app de Claude Code desde el celular** además de esta sesión de escritorio, y ambas trabajan sobre el mismo repo de GitHub. La sesión mobile corre en un entorno separado (no esta PC) y empuja su trabajo a ramas propias tipo `claude/<nombre>-<hash>` en vez de a `master` directamente — hay que revisar `git branch -a` / `git ls-remote --heads origin` al empezar una sesión para ver si hay ramas de otra sesión esperando ser mergeadas.

**Bug real encontrado por la sesión mobile y corregido (2026-07-28):** el `.gitignore` de la raíz tenía `Presupuestos/` (sin `/` inicial) para ignorar los PDFs de la app de escritorio, pero eso también ignoraba silenciosamente `webapp/frontend/src/screens/Presupuestos/` en cualquier profundidad del árbol — 5 archivos (Historial, Detalle, y todo el Wizard) **nunca estuvieron en git**, aunque sí estaban desplegados (el build ya compilado sí los tenía, porque se generó localmente con los archivos reales presentes en disco). Corregido a `/Presupuestos/` (ancla a la raíz) y se agregaron los archivos faltantes. Lección: cualquier regla de `.gitignore` pensada para una carpeta específica del proyecto raíz debe llevar `/` inicial si no se quiere que aplique a subcarpetas con el mismo nombre en cualquier parte del árbol (ej. `webapp/frontend/src/screens/Presupuestos/`).

**Mejoras mobile ya mergeadas** (rama `claude/mobile-system-optimization-8cz2nw`, mergeada a `master`): sidebar tipo drawer con botón hamburguesa en pantallas angostas (`webapp/frontend/src/layout/Shell.jsx`, `Sidebar.jsx`, nuevo `styles/layout.css` con breakpoint `@media (max-width: 860px)`), anchos fluidos en vez de fijos en Login/ConfirmDialog/SearchInput, grillas de Excel con `auto-fit` para no romperse en pantallas chicas, rail de marcas horizontal-scroll en el selector de motores para mobile.

**Pendiente:** quedó un presupuesto de prueba (id=7, "cliente 2", Fiat Fire, $461.460,09) en la base de datos real de producción, generado sin querer por la sesión mobile al probar el wizard contra el sitio real. El usuario confirmó que hay que borrarlo pero no tenía la consola de PythonAnywhere a mano — instrucciones exactas guardadas en una tarea de background ("Borrar presupuesto de prueba #0007 en producción").

## Limpieza de repositorio (sesión 2026-07-29, tarde)

- **Ramas `main`/`master` unificadas**: `main` estaba parada en un "Initial commit" con solo un README (historia sin ancestro común con `master`). Se mergeó `master` → `main` con `--allow-unrelated-histories` y se pusheó. Ahora ambas ramas tienen el mismo contenido.
- **Ramas remotas obsoletas borradas** (todas ya contenidas en `master`, sin cambios propios): `claude/delete-budget-button-rxdu3j`, `claude/repuestos-tab-presupuestos-ykgkn8`, `claude/mobile-system-optimization-8cz2nw`, `claude/parts-search-categories-brands-bq6y9c`, `claude/repo-analysis-organization-0a7sp0`. La rama `claude/revisar-codigo-master-vye67l` (repuestos en presupuestos, ya integrada a `master` sin cambios propios) también quedó borrada — el clasificador de permisos bloqueó el comando en esta sesión, el usuario la borró a mano. **Resultado final: solo quedan `main` y `master` en el remoto, con contenido idéntico.**
- **Importante — producción tira de `master`, no de `main`**: confirmado por otra sesión en paralelo (rama `claude/repo-analysis-organization-0a7sp0`, descartada por quedar superada por esta limpieza) que el `git pull` en el servidor de PythonAnywhere apunta a `master`. Si en algún momento se quiere migrar producción a `main`, hay que reconfigurar el clon del servidor (`git checkout main` o re-clonar) antes de considerar borrar `master`. Por ahora ambas ramas tienen el mismo contenido, así que no es urgente.
- **Nota sobre trabajo en paralelo**: mientras se hacía esta limpieza, otra sesión de Claude (probablemente el celular) analizó el mismo repo casi al mismo tiempo y llegó a las mismas conclusiones (ver rama descartada arriba) — confirma que conviene seguir chequeando `git branch -a` / `git ls-remote --heads origin` al empezar cada sesión para detectar trabajo simultáneo antes de que choque.
- **`Rectificadora Design System/` → `.claude/skills/rectificadora-design/`**: la carpeta nunca había estado en git (riesgo de pérdida) y tenía un `SKILL.md` válido que no se reconocía como skill porque no vivía en `.claude/skills/`. Se movió ahí y se versionó en git — ahora es un skill invocable real, protegido.
- **`.claude/settings.local.json` sacado de git**: es config local de permisos específica de esta máquina (no tiene sentido compartirla entre PC/celular). Se agregó a `.gitignore` y se sacó del tracking (`git rm --cached`, el archivo sigue en disco).

## Mejoras al armado de presupuestos (sesión 2026-07-29, rama `claude/budget-changes-plan-n04hcl`)

**Solo versión web** (decisión explícita del usuario: la app de escritorio queda como está).

- **Categorías favoritas + buscador dentro del presupuesto**: el rail de categorías de la pestaña Repuestos (favoritas arriba, estrella, buscador) se extrajo a `components/CategoriasPanel.jsx` y el bloque completo de búsqueda a `components/RepuestoPicker.jsx`. Ahora lo usan la pestaña Repuestos, el paso 4 del wizard y **también la edición del detalle** (antes ahí solo se podían cargar repuestos a mano). `hooks/useCategorias.js` cachea la lista de categorías en una sola promesa compartida.
- **Botón "+" con cantidades 1 / 4 / 8 / 16** (`SelectorCantidad` en `RepuestoPicker.jsx`): despliega un popover — renderizado en un portal, porque las tablas viven dentro de contenedores con `overflow` y si no queda recortado — y la cantidad elegida es la **final** (pisa, no suma). El click en la fila sigue sumando de a uno.
- **Columnas arrastrables** en `components/DataTable.jsx` vía prop `reorderKey`: drag&drop de los `<th>`, orden persistido en `localStorage` (`tabla-orden:<key>`), línea de inserción al arrastrar y link "↺ orden original". Tolera cambios de columnas (ignora keys que ya no existen, agrega las nuevas al final) y se desactiva sola si una tabla tiene keys repetidas. Activada en motores, servicios del motor, clientes, presupuestos, repuestos y las tablas del detalle. En el celular no se puede arrastrar (es gesto de mouse), pero el orden guardado desde la compu se respeta. Ojo: la columna "Estado" del historial pasó de `key:'fecha'` a `key:'estado'` — las keys tienen que ser únicas.
- **PDF**: la sección de repuestos pasó a **Repuesto (categoría) | Cant. | P. unitario | Subtotal**; ya no salen ni el código ni la descripción del proveedor. Las líneas se **agrupan por categoría** (suma de cantidades y subtotales); si dentro de una categoría los unitarios difieren, el unitario va "—" y solo cierra el subtotal.
- **Categoría congelada**: columna nueva `categoria` en `presupuesto_items` (migración aditiva), la congela `_resolver_repuesto` desde el catálogo (o la que cargue el usuario en un repuesto fuera de catálogo, con `CategoriaField` + datalist). Presupuestos viejos sin categoría la resuelven por código contra el catálogo vigente al generar el PDF, y si no hay nada usan la descripción. El Detalle reenvía `categoria` al editar para no perderla.
- **Botón "Compartir PDF"** en el detalle (Volver · Compartir PDF · Editar · Eliminar): usa `navigator.share({files})`, así que en el celular manda el PDF real a WhatsApp. El blob se prefetchea al abrir el detalle a propósito — `navigator.share()` exige gesto del usuario y si el `fetch` se hace dentro del click, iOS lo rechaza. Sin Web Share, descarga el PDF y avisa. **Importante**: no existe forma de que una web deje un archivo PDF en el portapapeles de Windows (solo texto o imagen), por eso no se hizo "copiar y pegar" — se le explicó al usuario y eligió compartir.
- **Probado**: suite de backend con los datos reales del repo (491 motores, 235 servicios, 296 prefijos, 64.250 repuestos) verificando el agrupado, el texto extraído del PDF (sin códigos ni descripciones del proveedor), presupuesto de solo repuestos y edición sin perder categorías; migración sobre una DB con el esquema viejo; y UI real con Playwright/Chromium (favoritas, drag de columnas + persistencia + reset, popover 1/4/8/16, `navigator.share` recibiendo el File correcto, fallback de descarga, picker en la edición). `npm run build` + oxlint limpios y `static_build/` commiteado.

## Contador de mano de obra + cantidades de repuestos + nombre de cliente (sesión 2026-07-29, rama `master` directo)

Solo versión web (`webapp/`), a pedido explícito del usuario. Cambios:

- **Cantidad en mano de obra (servicios)**: el paso Servicios del wizard (y la edición del detalle) pasó de checkbox a un contador de cantidad — así "Reunir cilindros" puede cargarse ×4 en un motor de 4 cilindros y el precio se multiplica. Componente nuevo `webapp/frontend/src/components/ContadorServicio.jsx`: input editable a mano + 4 botones atajo (1/4/6/8) que **suman** a la cantidad actual (tocar "8" dos veces deja 16) — a propósito distinto de `SelectorCantidad` (repuestos), que fija la cantidad final. `PasoServicios.jsx` cambió su modelo de `value.ids` (array) a `value.cantidades` (`{servicioId: cantidad}`); ítems custom también tienen cantidad ahora (el precio que tipea el usuario se trata como unitario). Backend (`_resolver_items`/`_resolver_items_edicion` en `routes/presupuestos.py`) ahora acepta `cantidad` para servicios FACRA y custom, reusando las columnas `cantidad`/`precio_unitario` que ya existían en `presupuesto_items` (sin migración de esquema — antes solo las usaban los repuestos). El PDF (`pdf_gen.py`) imprime "×N" junto a la descripción cuando la cantidad es distinta de 1.
- **Repuestos**: `RepuestoPicker.jsx` — cantidades rápidas pasaron de `[1,4,8,16]` a `[1,4,6,8,12,16]`; se sacó la columna "Categoría" del buscador (ya se ve en el rail de categorías al lado) y la columna de cantidad pasó a ser la primera (antes de "Código"); se agregó un botón "−" junto al "+" (resta 1, tanto en la tabla de resultados como en "Usados antes en este motor"). En `PasoRepuestos.jsx` (sección "Repuestos agregados") y en `Detalle.jsx` (fila de edición de repuesto) el grupo de cantidad también pasó a ser lo primero de la fila. Estos cambios de columnas/orden son **solo en pantallas de armado/edición** — la tabla de solo lectura de un presupuesto ya guardado no se tocó (sigue con Categoría en su lugar de siempre), salvo que se le agregó una columna "Cant." a la tabla de servicios de esa misma vista de solo lectura, para paridad visual con la de repuestos.
- **Color de fila alternada**: `--surface-stripe` en `webapp/frontend/src/styles/tokens/colors.css` pasó de `#faf8f3` (casi blanco) a `#f0e9d8` (beige más marcado), más contraste contra `--surface-card` blanco.
- **Nombre de cliente — Title Case**: nueva `formato_nombre_titulo()` en `webapp/backend/app/helpers.py`, aplicada en `db.guardar_presupuesto()` antes de buscar/crear el cliente — "juan garcia" o "JUAN GARCIA" quedan como "Juan Garcia". Si ya existía un cliente con otra capitalización (match por `COLLATE NOCASE`), se corrige el nombre guardado (`UPDATE` oportunista) en vez de dejarlo como estaba. Frontend (`PasoCliente.jsx`) aplica el mismo formateo al confirmar, solo como feedback visual — el backend es la fuente de verdad.
- **Probado**: `npm run build` + oxlint limpios; verificación end-to-end en Python puro (venv aislado, sin tocar la DB real) de `_resolver_items`/`_resolver_items_edicion` con cantidad, no-duplicación de cliente por capitalización, y un PDF real generado y leído con `pypdf` confirmando el texto "Reunir cilindros ×4" con el precio ya multiplicado.
- **Pendiente**: correr `npm run build` quedó hecho y commiteado (`static_build/` actualizado), pero falta el deploy remoto (`POST /api/deploy`) para que estos cambios lleguen a producción — igual que el resto de items pendientes de deploy más abajo.

## Próximo paso
Sistema en producción y funcionando, con deploy remoto automatizado. Repositorio limpio (solo ramas `main`/`master`, iguales). Ítems abiertos: correr el deploy remoto (`POST /api/deploy`) para que los cambios de esta sesión (contador de mano de obra, cantidades de repuestos, nombre de cliente) y los de repuestos-en-presupuestos lleguen a producción, borrar el presupuesto de prueba #7 (tarea de background ya creada), definir el mecanismo de carga diaria del CSV de CRAC (único punto abierto de `INTEGRACION-PENDIENTE.md` — una vez resuelto, sacar `CRAC/precio-stock.csv` de git como ya se hizo con `Excel/Proveedor/`, para no inflar el historial con cada actualización), y considerar si vale la pena migrar a un plan pago de PythonAnywhere si el uso crece (más CPU/disco). Como puede haber más de una sesión de Claude tocando este repo en paralelo (celular + escritorio), conviene chequear ramas remotas pendientes al empezar cada sesión.

## Para correr el programa
```
cd "C:\Users\Usuario\Documents\Sistema de Presupuestos"
pip install -r requirements.txt   # solo la primera vez
python main.py
```

## Archivos de datos disponibles
- `Excel/Facra/nomenclador_1779985703.xls` — nomenclador de motores FACRA
- `Excel/Facra/lista_orientadora_de_mano_de_obra_1779985697.xls` — precios de mano de obra FACRA
