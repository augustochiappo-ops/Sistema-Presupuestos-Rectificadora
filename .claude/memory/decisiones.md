# Decisiones técnicas y de diseño

## Migración a versión web (2026-07-28)
**Decisión:** reescribir la app como web (backend Flask + frontend React/Vite), manteniendo la app de escritorio PyQt6 intacta como backup hasta validar la web en uso real.
**Por qué:** el usuario pidió poder acceder desde el navegador, incluso desde fuera del taller (internet), no solo en red local.
**Detalles acordados con el usuario:**
- Acceso desde internet (no solo LAN) → requiere hosting real, ya no es "100% local" en el sentido estricto del proyecto original.
- Un solo usuario, un dispositivo a la vez → sin necesidad de manejar concurrencia multiusuario.
- Login simple usuario/contraseña (una sola cuenta) porque va a estar expuesto a internet.
- Se migran los datos existentes (no arranca de cero).
- "Editar Precios" queda placeholder y CRAC deshabilitado, igual que en el escritorio — no se implementan ahora.
- Excepción explícita: en la web SÍ se permite agregar ítems custom durante la creación del presupuesto (en el wizard), a diferencia del escritorio donde solo se podía al editar. Fue un pedido explícito del usuario al revisar el plan.
- Sin pantalla de Dashboard (existe maquetada en el design system pero no se pidió para esta v1).
**Fecha:** 2026-07-28

## Hosting: PythonAnywhere free tier
**Decisión:** alojar la versión web en PythonAnywhere (plan gratuito), en vez de Render/Railway/Fly/Vercel.
**Por qué:** el usuario pidió priorizar que sea gratis. A diferencia de Render/Railway (free tier con "sleep" tras inactividad, cold starts de 30-60s) o Fly/Cloud Run (piden tarjeta, filesystem efímero), PythonAnywhere free no duerme el servidor, no pide tarjeta, y tiene 512MB de disco persistente en el mismo plan — clave porque la DB SQLite y los PDFs necesitan persistir entre reinicios sin depender de un servicio de storage aparte.
**Consecuencia:** el backend tiene que ser Flask (WSGI), no FastAPI (ASGI) — PythonAnywhere free solo soporta WSGI de forma oficial.
**Fecha:** 2026-07-28

## Precio editable en edición, pero no en creación
**Decisión:** al crear un presupuesto, el precio de los servicios de FACRA se recalcula siempre server-side (se ignora cualquier precio que mande el navegador). Al editar un presupuesto ya creado, el precio de cualquier ítem (incluso los de FACRA) queda libre para que el usuario lo ajuste a mano.
**Por qué:** así es como ya funciona la app de escritorio — el wizard de creación nunca permitió tocar el precio (checkbox nomás), pero la pantalla de edición sí (`precio_aplicado` se guarda tal cual lo manda la UI, sin validar contra el catálogo). Migrar ese comportamiento tal cual evita romper la capacidad real de dar descuentos/ajustes manuales al editar, y de paso cierra un vector de manipulación de precio en la creación (que en el escritorio no existía como riesgo por ser una app local de un solo proceso, pero sí importa en una API web expuesta a internet).
**Implementación:** `_resolver_items` (creación, recalcula contra `facra.get_servicios_para_lista`) vs `_resolver_items_edicion` (edición, confía en el precio recibido) en `webapp/backend/app/routes/presupuestos.py`.
**Fecha:** 2026-07-28

## Stack tecnológico
**Decisión:** Python + PyQt6 + pandas + reportlab + SQLite3  
**Por qué:** el sistema corre 100% local en Windows. PyQt6 permite UI de escritorio nativa. pandas es ideal para leer los Excel. SQLite no requiere instalación de servidor. reportlab genera PDFs programáticamente.  
**Fecha:** 2026-05-28

## Ejecución local
**Decisión:** app de escritorio, sin servidor web, sin dependencias cloud.  
**Por qué:** el usuario opera en un taller. No depende de internet. Los datos son locales y privados.  
**Fecha:** 2026-05-28

## Gestión de versiones de datos externos
**Decisión:** los Excel de FACRA se versionan en git. El Excel diario del proveedor NO se versiona.  
**Por qué:** los de FACRA son actualizaciones periódicas relevantes. El del proveedor es operativo y se reemplaza a diario.  
**Fecha:** 2026-05-28

## Arquitectura de UI: navegación por QStackedWidget
**Decisión:** ventana principal con sidebar lateral fijo + QStackedWidget para el contenido.  
**Por qué:** UX simple, sin ventanas flotantes, toda la navegación en un solo lugar. Cada sección es un widget independiente.  
**Fecha:** 2026-05-28

## Design tokens centralizados en styles.py
**Decisión:** todos los colores, tamaños de fuente y estilos QSS viven en `src/ui/styles.py`.  
**Por qué:** consistencia visual. Si cambia un color, se cambia en un solo lugar.  
**Paleta principal:** sidebar `#1a2744`, acento `#3b5090`, fondo contenido `#f5f6fa`.  
**Fecha:** 2026-05-28

## Columna Motor: expansión dinámica de ancho
**Decisión:** la columna Motor se ajusta automáticamente en `resizeEvent` y al redimensionar otras columnas, para que la tabla siempre ocupe el ancho completo del panel.  
**Por qué:** con `Stretch` el usuario no puede redimensionar la columna. Con `Interactive` + lógica manual, se logran ambas cosas.  
**Implementación:** `_ajustar_columna_motor()` calcula `viewport_width - suma_otras_columnas`.  
**Fecha:** 2026-05-28

## Ordenamiento numérico con _NumItem
**Decisión:** las columnas numéricas (Cilindros, Diámetro, Lista Nº) usan una subclase `_NumItem(QTableWidgetItem)` que sobreescribe `__lt__` para comparar por valor float.  
**Por qué:** `setSortingEnabled(True)` ordena como texto por defecto ("9" > "10"). Con `_NumItem` el orden es numérico correcto.  
**Fecha:** 2026-05-28

## Carga del listado de motores: una sola vez por sesión
**Decisión:** flag `_cargado` en `MotoresWidget` para cargar datos solo en el primer `showEvent`.  
**Por qué:** sin el flag, cada clic en "Listado de Motores" reconsultaba la BD y repoblaba la tabla (lag innecesario).  
**Excepción:** el método público `recargar()` fuerza una recarga (se llama tras importar un Excel nuevo).  
**Fecha:** 2026-05-28

## Importación de Excel en hilo separado (QThread)
**Decisión:** la importación de los Excel de FACRA corre en `_ImportThread(QThread)`.  
**Por qué:** pandas + xlrd pueden tardar varios segundos con archivos grandes. Sin hilo, la UI se congela.  
**Fecha:** 2026-05-28

## Migración automática de columnas SQLite
**Decisión:** `init_db()` verifica con `PRAGMA table_info` qué columnas existen y hace `ALTER TABLE` si faltan.  
**Por qué:** permite agregar columnas nuevas (ej: `diametro`) sin perder datos existentes ni obligar a borrar la BD.  
**Fecha:** 2026-05-28

## CRAC: deshabilitado por ahora
**Decisión:** los botones de importación CRAC existen en la UI pero están deshabilitados.  
**Por qué:** el usuario quiere arrancar solo con FACRA. CRAC se habilitará cuando se diseñe ese módulo.  
**Fecha:** 2026-05-28
**Actualización 2026-07-29:** se habilitó (ver decisiones más abajo). Este registro queda como historial.

## Pestaña Repuestos (CRAC): persistencia, carga inicial y prefijos inactivos
**Decisiones confirmadas con el usuario (vía preguntas explícitas antes de programar):**
1. **Persistencia:** `precio-stock.csv` y `prefijos_crac.csv` se importan a SQLite (tablas `crac_repuestos` y `crac_prefijos`), igual que FACRA — cada carga reemplaza todo lo anterior. Se descartó leer el CSV en vivo en cada apertura de la pestaña.
2. **Carga inicial de la tabla:** con ~64.250 repuestos, la pantalla arranca **vacía** con un mensaje pidiendo aplicar un filtro (categoría, marca, código o descripción) — no se listan los 64 mil de entrada. Al filtrar, se muestran hasta 1000 resultados con contador que avisa si hay más.
3. **Columna `activo` de `prefijos_crac.csv`:** el usuario pidió explícitamente **no usarla** — se muestran todas las categorías y marcas del CSV sin importar si siguen vigentes hoy o no. Es un dato distinto ("¿el proveedor sigue vendiendo esto?") que no aplica a esta pantalla.
**Por qué:** persistencia en SQLite mantiene consistencia arquitectónica con el resto del sistema y permite filtros rápidos por SQL en vez de parsear 64k filas de CSV en cada uso. El estado vacío inicial evita renderizar una tabla enorme sin sentido práctico (en el taller siempre se busca una pieza puntual). Ignorar `activo` fue un pedido directo del dueño del negocio, no una inferencia.
**Fecha:** 2026-07-29
