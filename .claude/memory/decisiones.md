# Decisiones técnicas y de diseño

## Claude Code habilitado para deployar directo a producción (2026-07-30)
**Decisión:** el usuario agregó `chiapppo.pythonanywhere.com` a la whitelist de red del entorno de Claude Code en la nube. Antes esto daba 403 de policy en el proxy de egress (ver `estado.md`, sección "Nota operativa" — ahora marcada como superada); confirmado con un `curl -X POST https://chiapppo.pythonanywhere.com/api/deploy` que devolvió 401 de la propia app (no 403 del proxy), es decir el tráfico ya sale.
**Por qué:** hasta ahora, después de cada tanda de cambios, Claude solo podía entregarle al usuario el comando de deploy (`curl ... -H "X-Deploy-Secret: <secreto>"`) para que él lo corriera manualmente. Con la whitelist puesta, Claude puede correr el deploy directamente y cerrar el ciclo sin ese paso manual.
**Cómo queda el secreto:** el `DEPLOY_SECRET` no se guarda de sesión a sesión ni se versiona en el repo — el usuario se lo pasa a Claude **en cada sesión** en la que haga falta deployar. Si Claude no lo tiene en la sesión actual, lo pide antes de intentar el deploy; nunca lo inventa ni reusa uno de una sesión anterior.
**Fecha:** 2026-07-30

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

## Cantidad en mano de obra: mismo modelo de columnas que repuestos, botones aditivos
**Decisión:** en vez de agregar una tabla/columna nueva para "cantidad de servicio", se reusan las columnas `cantidad`/`precio_unitario` que `presupuesto_items` ya tenía (pensadas en su momento solo para repuestos) — servicios FACRA y custom ahora también las completan, y `precio_aplicado` sigue siendo siempre cantidad × unitario, calculado server-side.
**Por qué:** cero migración de esquema, y mantiene el invariante ya establecido de que `precio_aplicado` es siempre el total de línea — todo el código que ya suma `precio_aplicado` para sacar el total del presupuesto sigue funcionando sin tocarlo.
**Botones de cantidad — dos comportamientos distintos a propósito:** `SelectorCantidad` (repuestos, ya existía) fija la cantidad final al elegir una opción del popover ("de esto van 8"). El componente nuevo `ContadorServicio` (mano de obra) es aditivo: cada botón (1/4/6/8) SUMA a la cantidad actual, porque el pedido explícito fue poder tocar "8" dos veces para llegar a 16 sin escribirlo a mano. No se unificó en un solo componente porque son dos mentalidades de uso distintas y confundirlas sería un bug de UX, no una simplificación.
**Fecha:** 2026-07-29

## Normalización de nombre de cliente: Title Case en el backend, con corrección oportunista de nombres viejos
**Decisión:** `guardar_presupuesto()` normaliza el nombre a Title Case (`formato_nombre_titulo()`, capitalize por palabra, Unicode-aware para acentos/ñ) antes de buscar o crear el cliente. Si ya existía un cliente con el mismo nombre pero otra capitalización (match `COLLATE NOCASE`), se actualiza su nombre guardado al normalizado en vez de dejarlo como estaba.
**Por qué:** el usuario pidió explícitamente que no importe cómo se tipee el nombre (todo minúscula, todo mayúscula), siempre quede prolijo. Corregir oportunistamente nombres viejos evita que queden clientes "sucios" dando vueltas indefinidamente solo porque se crearon antes de este cambio.
**Fecha:** 2026-07-29

## Automatización de pedidos a CRAC: plan y upgrade de hosting (2026-07-30)
**Contexto:** el usuario quiere un botón "Pedir repuestos" en el presupuesto que cargue automáticamente los repuestos ya presupuestados en el sistema de pedidos online real de CRAC (`www.crac.com.ar`), sin llegar a enviarlo a sucursal (eso lo confirma una persona a mano). Se hizo una prueba de concepto con Playwright (detalle técnico completo, mapa de selectores y estado de la investigación en `CRAC/AUTOMATIZACION-PEDIDOS.md`) que funcionó de punta a punta: login, búsqueda por código, carga de cantidad, agregado al pedido pendiente, sin tocar el botón de envío.
**Decisión 1 — no usar un LLM/agente de IA para manejar el navegador:** se evaluó explícitamente la opción de que un modelo de IA (tipo "computer use") maneje la automatización en vez de un script Playwright fijo, y se descartó. El formulario de CRAC ya está completamente mapeado y es estable; meter un LLM en el medio agrega costo y latencia por cada pedido sin ningún beneficio (esa flexibilidad solo pagaría si el sitio cambiara de estructura seguido, que no es el caso). Además, ningún motor de IA resuelve el problema real, que es de red/hosting (ver decisión 2) — un LLM igual necesita correr en un cómputo con salida a internet real.
**Decisión 2 — pagar el upgrade de PythonAnywhere:** se confirmó (con `curl` corrido por el usuario en la consola Bash de PythonAnywhere) que el plan gratuito actual bloquea la salida a `crac.com.ar` (whitelist only, 403 del proxy squid — `crac.com.ar` no calificaría para esa whitelist porque piden API pública oficial). Investigado: desde enero de 2026 PythonAnywhere fusionó los planes Hacker ($5/mes) y Web Developer ($12/mes) en un plan único **Developer** ($10/mes), que incluye acceso ilimitado a internet. El usuario decidió pagar ese upgrade — es la vía más simple, evita tener que mantener un servidor externo aparte solo para esto. Pendiente confirmar la cuota de disco exacta de ese plan (el usuario hoy tiene 1GB en el free) antes de instalar Playwright+Chromium (~300-400MB) en producción.
**Por qué (upgrade sobre alternativa de servidor externo):** la alternativa (correr la automatización en una máquina/VPS aparte que le avise al backend cuando termina) es viable pero mucho más compleja de mantener para este caso — un solo pedido esporádico, no un volumen que justifique infraestructura extra. El upgrade de plan es un cambio de configuración, no de arquitectura.
**Fecha:** 2026-07-30

## Pestaña Repuestos (CRAC): persistencia, carga inicial y prefijos inactivos
**Decisiones confirmadas con el usuario (vía preguntas explícitas antes de programar):**
1. **Persistencia:** `precio-stock.csv` y `prefijos_crac.csv` se importan a SQLite (tablas `crac_repuestos` y `crac_prefijos`), igual que FACRA — cada carga reemplaza todo lo anterior. Se descartó leer el CSV en vivo en cada apertura de la pestaña.
2. **Carga inicial de la tabla:** con ~64.250 repuestos, la pantalla arranca **vacía** con un mensaje pidiendo aplicar un filtro (categoría, marca, código o descripción) — no se listan los 64 mil de entrada. Al filtrar, se muestran hasta 1000 resultados con contador que avisa si hay más.
3. **Columna `activo` de `prefijos_crac.csv`:** el usuario pidió explícitamente **no usarla** — se muestran todas las categorías y marcas del CSV sin importar si siguen vigentes hoy o no. Es un dato distinto ("¿el proveedor sigue vendiendo esto?") que no aplica a esta pantalla.
**Por qué:** persistencia en SQLite mantiene consistencia arquitectónica con el resto del sistema y permite filtros rápidos por SQL en vez de parsear 64k filas de CSV en cada uso. El estado vacío inicial evita renderizar una tabla enorme sin sentido práctico (en el taller siempre se busca una pieza puntual). Ignorar `activo` fue un pedido directo del dueño del negocio, no una inferencia.
**Fecha:** 2026-07-29

## Copia de seguridad: qué incluye, cómo se detecta "ya cargada", y restauración full-replace con safety net
**Decisión:** el backup exportable/restaurable (pestaña Actualizar Excel) empaqueta la base de datos SQLite completa (motores, servicios, clientes, presupuestos, catálogo CRAC) + todos los PDFs generados, en un `.zip` con `manifest.json` (fecha, hash SHA-256 de la DB y de cada PDF, conteos por tabla). NO incluye los Excel de FACRA ni el CSV de CRAC (son insumos reimportables desde las tarjetas ya existentes de la misma pantalla, no estado propio).
**Restauración = reemplazo completo de la DB** (no merge/fusión): al confirmar, se pisa `presupuestos.db` entero con el del backup (los PDFs solo se agregan/actualizan los que difieren, nunca se borran los que no están en el backup). Antes de pisar la DB actual, se genera automáticamente un backup de seguridad del estado vigente (`data/pre_restore_backups/`) para poder deshacer si fue un error — se investigó en internet que esto ("snapshot antes de restaurar") es práctica estándar de recuperación ante desastres.
**Por qué full-replace y no merge:** un merge fila-por-fila entre dos bases de datos con las mismas tablas (motores, clientes, presupuestos con IDs autoincrementales) es un problema mucho más complejo (conflictos de ID, relaciones rotas) que no se justifica para un caso de uso que es "restaurar tras perder datos o migrar de servidor", no "sincronizar dos bases en paralelo". Reemplazo total es el comportamiento esperado y estándar de un backup/restore.
**Bug real encontrado y corregido en esta sesión:** comparar el hash del archivo `.db` crudo (leído directo del disco) contra el hash generado por `sqlite3.Connection.backup()` (la Online Backup API, usada para el snapshot seguro) daba **siempre "distinta"**, aunque no hubiera ningún cambio real — confirmado con una prueba directa: mismo contenido lógico, hash distinto entre archivo crudo y copia vía `backup()` (difiere el layout interno de páginas/freelist, no el contenido). `backup()` sí es determinístico entre llamadas sucesivas sin cambios (se probó 3 veces seguidas, mismo hash). Fix: comparar siempre hash-contra-hash calculados con el mismo método (`_snapshot_db_bytes()` + sha256), nunca mezclar con una lectura cruda del archivo.
**Fecha:** 2026-07-31

## Sesión de 8 horas con vencimiento absoluto (no por inactividad)
**Decisión:** la sesión de la webapp vence **8 horas después del login**, sin renovarse con el uso (`SESSION_REFRESH_EACH_REQUEST = False` + chequeo server-side de `session["login_ts"]` en `_sesion_activa()`). Configurable con la variable de entorno `SESSION_HORAS`.
**Por qué absoluto y no por inactividad:** el pedido del usuario fue "que todos los días tenga que poner la contraseña, así no me la olvido". Con un vencimiento deslizante (el default de Flask, que refresca la cookie en cada request) alguien que usa el sistema todos los días nunca volvería a ver la pantalla de login — se conseguiría exactamente lo contrario de lo pedido. El vencimiento absoluto garantiza que cada jornada arranque tecleando la contraseña.
**Por qué se chequea también en el servidor y no solo con la expiración de la cookie:** el navegador podría conservar la cookie (o el reloj del cliente estar mal); comparar `login_ts` contra `time.time()` en cada request protegido hace que el corte sea del lado del servidor. Efecto colateral buscado: las cookies emitidas antes de este cambio no tienen `login_ts` y se tratan como vencidas, así que el cambio fuerza un login nuevo al deployar.
**Fecha:** 2026-07-31

## Grupos de repuestos: cotizar el más caro por SUBTOTAL, y una sola cantidad por opción
**Decisión:** una línea de repuesto puede ser un **grupo** de piezas intercambiables (marcas y medidas). Se cotiza la de **mayor subtotal** (precio × cantidad), no la de mayor precio de lista, y las demás quedan guardadas para el pedido.
**Por qué por subtotal:** las marcas vienen en envases distintos. Ejemplo del dueño: un juego de 8 cojinetes a $1.000 vs. blísters de 2 a $400 — para el mismo motor hacen falta 4 blísters, o sea $1.600. Por precio de lista ganaría el juego (mal); por subtotal gana el blíster (bien).
**El multiplicador descartado:** el primer diseño tenía, además de la cantidad, un campo "×N" por opción para normalizar envases. El dueño lo probó mentalmente contra el caso de los retenes de válvula (blíster de 4 vs. de 8 en un motor de 16 válvulas) y vio que con dos números **la cantidad quedaba sin usarse**: siempre había que poner 1 y jugar con el multiplicador. Se eliminó. Quedó **un solo número por opción: la cantidad**, que se hereda del grupo al agregar y se ajusta por opción cuando el envase difiere.
**Las dos compensaciones** (para que el error de envases no pase desapercibido, ya que no hay dato de "piezas por envase" en el catálogo — se verificó que la descripción del proveedor no lo trae de forma confiable): (a) la ficha del motor **recuerda la cantidad de cada código**, así la cuenta se hace una sola vez por código y motor; (b) chip **"¿cantidad correcta?"** cuando el subtotal de una opción queda por debajo de la mitad de la mediana de su grupo — que es exactamente la firma de un blíster chico sin corregir.
**Fecha:** 2026-08-10

## Las alternativas van en tabla aparte, no como filas del presupuesto
**Decisión:** las opciones no cotizadas de un grupo viven en `presupuesto_item_opciones`, no en `presupuesto_items`. La cotizada se escribe en las dos (con `elegida=1`), desde la misma estructura calculada en `_resolver_grupo`.
**Por qué:** hay cuatro lugares que asumen que toda fila `tipo='repuesto'` de `presupuesto_items` fue efectivamente cotizada — el total (`sum(precio_aplicado)`) al crear y al editar, el agrupado del PDF, y el filtro por repuesto de `buscar_presupuestos`. Meter las alternativas ahí obligaba a agregar un guard en cada uno y a acordarse de él en todo lo que se escriba en el futuro. Con la tabla aparte, nada del código existente se entera y no hay forma de que una alternativa infle un total. El costo (la cotizada duplicada en dos tablas) se controla escribiéndolas juntas desde un solo lugar.
**Fecha:** 2026-08-10

## La ficha del motor reemplaza a las sugerencias derivadas del historial
**Decisión:** la asociación motor→repuestos pasa a ser explícita (`motor_repuesto_grupos` + `motor_repuesto_opciones`), editable desde "Listado de Motores", y se actualiza sola al confirmar un presupuesto. Se eliminaron `get_repuestos_sugeridos_motor` y el mecanismo de "ocultar repuesto sugerido".
**Por qué:** las sugerencias se deducían de haber cotizado algo alguna vez, así que un motor nuevo no sugería nada y un error de carga quedaba sugerido para siempre (de ahí que hiciera falta "ocultar"). Con una lista que el taller edita a mano, ocultar sobra: se saca y listo. La ficha es **viva** — precio, stock, marca y medida se resuelven contra el catálogo de hoy en cada consulta; lo único que persiste de cada opción es la cantidad, que sí es una decisión del taller. El dueño confirmó que todos los presupuestos existentes eran de prueba, así que no había historial que preservar.
**Fecha:** 2026-08-10

## Detección de medidas: decodificar primero, no mirar el último token
**Decisión:** un código tiene medida solo si, **después de decodificarlo** con el algoritmo de prefijos de `CRAC.md`, el `resto` tiene dos o más tokens y el último matchea `STD|\d{1,4}([.,]\d+)?`.
**Por qué:** la regla ingenua ("el último token del código es la medida si parece número") produce **13.458 falsos positivos** sobre 64.250 filas — códigos como `ACAM 3066`, donde `3066` es el número de parte. La diferencia recién aparece al decodificar: en un código con medida el resto son dos tokens (parte + medida), en `ACAM 3066` es uno solo. Verificado contra el CSV real: 26.039 códigos con medida, familia `CAAC02740` completa (STD/010/020/030/040/050/060), `ACAM 3066` descartado.
**Qué queda afuera a propósito:** los sufijos `S60` y `60/`. No son medidas: son productos distintos, con otra aplicación y otro precio ($274.164 vs $236.191 en la misma familia). Agregarlos al grupo inflaría la cotización con algo que no es lo que se necesita.
**Fecha:** 2026-08-10

## El PDF de repuestos pierde la columna de cantidad
**Decisión:** la tabla de repuestos del PDF quedó en una sola columna con la categoría.
**Por qué:** con grupos, la cantidad de una línea es la cantidad de **envases** de la marca que ganó. Ese número no le dice nada al cliente (no sabe cuántas piezas trae cada envase) y además cambiaría según qué marca termine siendo la más cara — el mismo trabajo cotizado dos veces podría decir "2" o "4". La mano de obra sí conserva su cantidad, que ahí sí significa algo ("Reunir cilindros ×4").
**Fecha:** 2026-08-10
