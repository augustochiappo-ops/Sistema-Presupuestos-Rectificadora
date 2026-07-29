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

**Pendiente para una próxima sesión** (ver `CRAC/INTEGRACION-PENDIENTE.md` para el detalle completo de las decisiones de negocio abiertas):
- Asociar repuestos a motores (la idea final: al elegir un motor, sugerir/recordar los repuestos ya usados antes para ese motor).
- Combinar mano de obra + repuesto en la misma línea de un presupuesto.
- Qué pasa si el precio/stock de un repuesto cambia después de emitido el presupuesto (advertencia).
- Repuesto sin stock al momento de presupuestar: ¿se puede agregar igual con aviso, o se bloquea?
- Esta pestaña **no se portó a la versión web** (`webapp/`) — por ahora existe solo en la app de escritorio, igual que "Editar Precios".

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

## Próximo paso
Sistema en producción y funcionando, con deploy remoto automatizado. Ítems abiertos: borrar el presupuesto de prueba #7 (tarea de background ya creada), unificar las ramas main/master de git (tarea de background ya creada), y considerar si vale la pena migrar a un plan pago de PythonAnywhere si el uso crece (más CPU/disco). Como puede haber más de una sesión de Claude tocando este repo en paralelo (celular + escritorio), conviene chequear ramas remotas pendientes al empezar cada sesión.

## Para correr el programa
```
cd "C:\Users\Usuario\Documents\Sistema de Presupuestos"
pip install -r requirements.txt   # solo la primera vez
python main.py
```

## Archivos de datos disponibles
- `Excel/Facra/nomenclador_1779985703.xls` — nomenclador de motores FACRA
- `Excel/Facra/lista_orientadora_de_mano_de_obra_1779985697.xls` — precios de mano de obra FACRA
