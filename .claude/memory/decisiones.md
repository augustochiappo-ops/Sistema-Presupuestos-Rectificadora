# Decisiones técnicas y de diseño

## Precios propios de mano de obra: una capa sobre la lista de la Cámara (2026-08-30)
**Decisión:** la pantalla "Editar Precios" se implementó como una **capa
superpuesta** (`precios_mano_obra`, clave `(servicio_id, lista_num)`) que se
aplica al leer, en `facra.get_servicios_para_lista()`. La lista de FACRA
(`servicios.l1..l13`) **no se toca nunca**.
**Por qué así:** FACRA se reimporta cada una o dos semanas y pisaría cualquier
cosa que escribiéramos en sus columnas. La capa aparte sobrevive a la
reimportación, y permite mostrar los dos números a la vez —el de la Cámara y el
del taller— que es lo que deja explicar de dónde sale un precio.
**Por qué el enganche va ahí y no en cada consumidor:** `get_servicios_para_lista`
es el **único** lugar del backend donde se lee un precio de mano de obra. Sus
tres llamadores (`routes/motores.py:38`, y `_resolver_items` y la recotización en
`routes/presupuestos.py`) quedan cubiertos sin tocarlos, y no hay forma de que
mañana alguien agregue una pantalla que se saltee la capa. Si se hubiera
parcheado consumidor por consumidor, el sistema terminaría cotizando con dos
precios distintos según de dónde vengas.
**Alcance:** solo mano de obra, por pedido explícito del dueño. Los repuestos
siguen igual (precio del proveedor, editable dentro del presupuesto, sin
persistir): el CSV del proveedor se reemplaza entero a diario y necesita otro
diseño (un precio fijo se pudre y puede quedar por debajo del costo; ahí iría un
margen por categoría). Queda como pendiente si el dueño lo pide.

## Por qué el precio propio se guarda por (servicio, lista) y se propaga por proporción (2026-08-30)
**Decisión:** un precio propio se guarda **por lista**. Al editarlo, la pantalla
**ofrece** llevarlo a las trece manteniendo la curva de FACRA de ese servicio
(`precio_n = precio × l_n / l_k`), con los trece montos a la vista antes de
confirmar. No es automático.
**Por qué por lista:** un servicio no tiene un precio, tiene trece (una por lista
de la Cámara, elegida por `motores.lista_num` según el tamaño del motor). Cobrar
el planeado de tapa $X en un motor chico no dice nada de lo que se cobra en uno
grande.
**Por qué la proporción del ítem y no un factor global:** se midió sobre los
datos reales y **cada servicio escala distinto** entre listas — el ratio l8/l1 va
de 1,0 a 4,2 según el trabajo. No existe una escala única. Respetar la curva del
propio servicio conserva la lógica de tamaño de motor que la Cámara ya pensó.
**Casos borde:** si la lista de referencia no tiene precio en FACRA no hay ratio
posible; esas listas quedan sin tocar y la vista previa las muestra con "—". El
sistema no inventa un número (hay 5 de 235 servicios sin las trece cargadas).
**Por qué con vista previa y no directo:** un click cambia lo que se cobra en 491
motores. Tiene que poder mirarse la columna y decir "sí, es eso".

## Los dos porcentajes sobre mano de obra, y cuál gana (2026-08-30)
Conviven **dos** porcentajes sobre la misma mano de obra, y confundirlos cotiza
mal. Quedaron con nombres distintos en pantalla, a propósito:
- **"Aumento general sobre la lista de la Cámara"** (`app_meta.ajuste_mano_obra_pct`,
  pantalla Editar Precios): persistente, parte de la tarifa. **No pisa un precio
  propio** — es el atajo para todo lo que el dueño no tarifó a mano. Si lo pisara,
  mover el % le cambiaría en silencio justo los precios que decidió fijar.
- **"Ajuste de este presupuesto"** (`presupuestos.ajuste_pct`, wizard): la palanca
  de UNA cotización ("a este cliente −10%"). **Sí se aplica sobre un precio
  propio**, porque un precio propio *es la lista del taller*: si no lo alcanzara,
  un descuento dejaría afuera justo los renglones que el dueño tarifó.
El wizard avisa *"tu lista ya tiene +25%"* al lado de su campo cuando el general
está puesto: sumar 25 sobre un 25 ya aplicado y cotizar 56% más caro sin querer
era el error más fácil de cometer acá.
**Lo que NO cambió:** un precio pisado a mano **dentro** de un presupuesto sigue
sin recibir el ajuste (regla del 2026-08-18, `_resolver_items`). La regla completa
queda simétrica y explicable: precio de lista (de la Cámara o propio) → recibe el
ajuste del presupuesto; número escrito a mano en ese presupuesto → no.

## Guardar un precio es siempre explícito, nunca automático (2026-08-30)
**Decisión:** editar un precio en el wizard **no** lo guarda como tarifa. Hay dos
vías explícitas: el botón ⤓ de cada línea (paso Servicios) y el resumen tildable
del paso de Revisión, que lista las líneas con su precio viejo y el nuevo.
**Por qué:** un descuento puntual a un cliente y una decisión de tarifa son cosas
distintas. Si cada edición inline se guardara sola, el precio especial de hoy
sería el precio de la casa mañana, sin que nadie se entere.
**Por qué el resumen lista los montos y no es un tilde ciego:** la diferencia
entre las dos cosas está justo en esos números; hay que poder verlos para decidir.
**Detalle de implementación:** el resumen **sube las líneas exactas** a guardar
(no un booleano) y el wizard las manda tal cual. Si el wizard volviera a filtrar
por su cuenta podría guardar algo distinto de lo que el dueño vio listado. Un
`useEffect` las mantiene al día si se vuelve atrás a corregir un precio después
de tildar. Y no se ofrece guardar un precio que ya es la tarifa vigente: sería
una escritura que no cambia nada y un renglón de historial vacío de contenido.
**Se guarda al confirmar**, con `origen='presupuesto'` y el `presupuesto_id`, así
"Mis precios" puede decir de qué presupuesto salió cada uno y enlazarlo. Si ese
guardado falla no se avisa con banner: el presupuesto ya se emitió bien y es lo
que importa.

## "Mis precios" es lo que hace segura toda la feature (2026-08-30)
**Decisión:** el segundo apartado de la pantalla lista **todo** lo tarifado, con
el precio de la Cámara de hoy al lado, la fecha, de dónde salió (esta pantalla o
un presupuesto, enlazado) y su ↺. Más una tabla de historial
(`precios_mano_obra_historial`) con un renglón por cambio.
**Por qué:** un precio se puede guardar al pasar, desde el wizard — y eso es
justamente lo cómodo. Sin una vista que junte esos cambios, serían cambios
invisibles: dentro de seis meses nadie podría decir por qué un trabajo cuesta lo
que cuesta. Es la contraparte necesaria de la comodidad.
**El flag `desfasado`:** compara `precio_facra_al_fijar` contra el de hoy y marca
lo que se fijó cuando la Cámara cobraba otra cosa. Es lo que hay que repasar cada
vez que llega lista nueva. El precio propio **no cambia solo**: solo se avisa.

## Reimportar FACRA no puede llevarse puesto un precio del taller (2026-08-30)
**Decisión:** `importar_lista_orientadora` ya no borra un servicio que salió de la
lista si tiene precio propio (antes solo miraba si algún presupuesto lo usaba).
**Por qué:** `precios_mano_obra` cuelga de `servicio_id` con `ON DELETE CASCADE` y
las FK están activas desde el 2026-08-29. Sin ese chequeo, un servicio que la
Cámara saca de la lista se llevaba el precio del dueño, en silencio y en medio de
una importación de rutina.
**Bug encontrado al hacerlo:** dentro de `importar_lista_orientadora` hay una
variable local `precios` (los trece precios de la fila) que **tapaba al módulo**
`app/precios.py`. El `AttributeError` quedaba tragado por el `try/except` de la
función, que devolvía "Error al importar" y **hacía fallar la importación
entera**. Por eso `facra.py` importa las funciones por nombre
(`from .precios import aplicar_precios_propios, tiene_precio_propio`) y no el
módulo. Lo cazó el check del caso negativo ("sin precio propio, el servicio
huérfano se borra como siempre"), no el positivo: el positivo pasaba por el
motivo equivocado, porque el servicio sobrevivía gracias a que la importación
fallaba y hacía rollback.

## Reimportar FACRA reconcilia por identidad y preserva el `id`, no borra y recrea (2026-08-29)
**Decisión:** `importar_nomenclador` e `importar_lista_orientadora` (`facra.py`)
ya **no** hacen `DELETE FROM … ` + reinsert. Ahora reconcilian: la fila que ya
existe se **actualiza en su lugar (mismo `id`)** y solo las nuevas se insertan.
Identidad = **texto del motor** (motores) y **`(item_num, descripcion)`**
(servicios). Una fila que sale de la lista se borra solo si nada la referencia;
con presupuesto, ficha o papelera se conserva. Se activó además
**`PRAGMA foreign_keys = ON`** en `db.get_connection()`.
**Por qué:** el presupuesto guarda `motor_id`/`servicio_id` por `id`, y la ficha
de repuestos guarda `motor_id`. Con el borrado-y-recreado, los `id` cambiaban
por AUTOINCREMENT en cada reimport, y como la pantalla "Actualizar Excel" invita
a reimportar FACRA seguido (la Cámara actualiza cada 1–2 semanas), el primer
refresco habría dejado los presupuestos guardados sin nombre de motor y sin
descripción de mano de obra, y las fichas huérfanas. La plata grabada
sobrevivía, pero las etiquetas y los vínculos se rompían (y en la edición los
renglones sin descripción se descartaban, recalculando el total de menos).
**Por qué la identidad no es el `indice`/`item_num`:** en el nomenclador hay 4
índices repetidos (motores distintos que comparten índice) y en la lista 1
`item_num` repetido con dos descripciones — así que esas columnas solas
colapsarían filas legítimas. El texto del motor es único (491/491) y el par
`(item_num, descripcion)` también (235/235).
**Por qué `foreign_keys = ON`:** venía apagado (default de SQLite), así que los
`ON DELETE CASCADE` del esquema nunca se ejecutaban. Es red de seguridad: si un
borrado mal hecho intentara sacar una fila referenciada, ahora salta el error en
vez de dejar filas colgadas en silencio. No revalida datos viejos (solo enforcea
operaciones nuevas), así que encender no rompe una base con orfandades previas.
**Fecha:** 2026-08-29

## Borrar un cliente se bloquea si tiene presupuestos, no se borra en cascada (2026-08-11)
**Decisión:** `DELETE /api/clientes/<id>` devuelve **409** si el cliente aparece en algún presupuesto —como principal **o como contraparte**— e informa cuántos son. Solo se borra el cliente que no aparece en ninguno.
**Por qué:** un presupuesto es plata cotizada y su PDF ya puede estar en manos del cliente; que se borre de rebote por limpiar una ficha de cliente sería un daño mucho mayor que el que se quería reparar. El camino queda explícito: primero se borran los presupuestos (uno por uno, con su propia confirmación) y recién ahí el cliente. La contraparte cuenta porque, si se borrara, el presupuesto perdería el nombre del mecánico que trajo el trabajo.
**En pantalla:** el tacho del listado ya viene deshabilitado cuando `total_presupuestos > 0` (ese dato ya lo traía la lista), así el bloqueo se ve antes de tocar nada; el 409 igual existe porque el servidor es la fuente de verdad.
**Fecha:** 2026-08-11

## Los códigos del pedido se copian de a uno, y las marcas no se persisten
**Decisión:** el botón "Copiar códigos" abre un pop-up con un renglón por código y su propio botón de copiar, en vez de mandar todo junto al portapapeles. Los que se van copiando quedan marcados, pero **esas marcas viven solo mientras la ventana esté abierta**.
**Por qué:** el flujo real es copiar un código, salir a la web del proveedor, pegarlo y volver — copiar los siete juntos no servía para eso. Las marcas son para no perder el hilo en esa ida y vuelta; persistirlas obligaría a inventar un estado ("pedido") que hoy no existe y que se desincronizaría con la realidad apenas se arme el pedido dos veces.
**Fecha:** 2026-08-11

## Los repuestos del motor arrancan agrupados y cerrados
**Decisión:** en el paso Repuestos (wizard y edición), la ficha del motor se muestra separada por categoría, con cada grupo **cerrado** y una flechita para abrirlo. Excepción: si hay un solo grupo, arranca abierto.
**Por qué:** con varias categorías cargadas la lista plana mezclaba cojinetes de biela con los de bancada y no se entendía qué era qué. Cerrados, la pantalla se lee como un índice ("qué lleva este motor") y se abre solo lo que se va a tocar. Con un solo grupo la flechita sería un click sin ganancia.
**Dónde se implementó:** dentro de `components/RepuestoPicker.jsx`, que ya compartían el wizard y la edición del detalle — así las dos pantallas cambian juntas sin tocar ninguna de las dos.
**Fecha:** 2026-08-11

## Revalidar un presupuesto: solo repuestos, la mano de obra se avisa (2026-08-11)
**Decisión:** el botón "Actualizar a precios de hoy" recotiza **solo los repuestos** contra el catálogo del proveedor. Si la lista de mano de obra de FACRA también cambió, el resumen lo muestra aparte con su diferencia, pero no la aplica.
**Por qué:** el precio del proveedor es un dato externo que cambia solo, todos los días — actualizarlo es mecánico. El precio de mano de obra es una **decisión comercial del taller**: la lista de la Cámara es orientativa y el dueño ya tiene el ajuste % para trasladarla como quiera. Aplicarla sola le cambiaría el criterio de precio sin pedirle permiso. El aviso existe igual porque, si no, el dueño no se enteraría de que la lista se movió.
**Siempre previsualiza:** el resumen (diferencia por grupo, cambio de opción cotizada, avisos de stock, total viejo → total nuevo) se muestra en un pop-up y no se guarda nada hasta confirmar. Es plata.
**Fecha:** 2026-08-11

## Revalidar mueve la fecha del presupuesto a hoy
**Decisión:** al aplicar la revalidación, `presupuestos.fecha` pasa a hoy.
**Por qué:** los precios pasaron a ser los de hoy, así que la validez de una semana tiene que volver a contar desde hoy. Además el PDF **siempre** imprime la fecha del día (`pdf_gen`, `_fmt_fecha(None)`): si no se moviera la fecha, la app diría "Vencido" sobre un papel fechado hoy. `aprobado_en` no se toca.
**Fecha:** 2026-08-11

## Fuera de catálogo y sin stock al revalidar: se mantiene la regla, solo se avisa
**Decisión:** dentro de un grupo sigue ganando la opción de mayor subtotal aunque no tenga stock (misma regla de siempre, con la misma `_elegir_opcion`). Un código que ya no está en el catálogo **conserva su precio cotizado** y se marca; no se elimina la línea.
**Por qué:** preferir una opción con stock cambiaría la semántica del precio y podría bajar el total, dejando corto al taller si el día de la compra la barata tampoco está — que es justo lo que la regla del más caro viene a cubrir. Y borrar una línea porque el proveedor dio de baja un código perdería en silencio algo que el motor igual necesita.
**Detalle de implementación:** `_resolver_repuesto` solo lee el precio del catálogo cuando le llega `precio_unitario` en `None`, y un código ausente del catálogo con precio `None` se descarta como inválido. Por eso el payload de revalidación decide **por línea**: código vigente → precio de hoy; código caído → precio congelado. La detección de "ya no está" es `stock_actual is None` (la columna `stock` es NOT NULL en el catálogo).
**Fecha:** 2026-08-11

## Duplicar: por el wizard, a precios de hoy, sin las notas
**Decisión:** "Duplicar" no crea nada: abre el wizard de Nuevo Presupuesto cargado con el motor, los servicios, los grupos de repuestos y el ajuste % del original, salteando el selector de motor. Se elige el cliente ahí y recién al confirmar se crea. Arrastra el ajuste % pero **no** las notas.
**Por qué:** el caso real es "el mismo motor para otro cliente" o "el cliente que vuelve": lo que cambia es el cliente, y casi siempre hay algo para retocar. Una copia directa obligaría a entrar a editarla. El ajuste % es una política de precio que se repite; las notas son de ese trabajo puntual (y el wizard no tiene campo de notas).
**Precios de hoy sin código nuevo:** los repuestos se copian con `precio_actual`/`stock_actual` (`lineaDeOpcion(..., preciosDeHoy)`) y la mano de obra la recalcula sola el `POST /presupuestos`, que ya recotiza los servicios de FACRA contra la lista vigente aplicando el ajuste %.
**Fecha:** 2026-08-11

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

## Borrar de la ficha del motor: dos niveles y papelera, en vez de preguntar cada vez
**Decisión:** hay **dos tachos** y ninguno pregunta: uno saca una opción suelta y otro saca toda la **familia de medidas** (el mismo repuesto y marca en sus distintas medidas: STD, 025, 050…). La **categoría entera** (ej. "Cojinetes biela", que adentro tiene todas las marcas) sí pide confirmación. Lo borrado no desaparece: cae en una **papelera por motor** (`motor_repuestos_papelera`) que se ve desde la pantalla del motor con "Repuestos eliminados (N)" y se restaura por fila o entera.
**Por qué dos tachos y no un cartel "¿este o todos?":** el dueño planteó el problema al revés de como estaba implementado — al cargar una medida entran las cuatro hermanas, pero para sacarlas había que borrar una por una. La primera propuesta fue un diálogo que preguntara el alcance, y se descartó: suma un click a **cada** borrado para resolver una decisión que el usuario ya tiene tomada antes de tocar el botón. Dos botones separados hacen que el caso frecuente y el raro cuesten un click cada uno.
**Por qué la categoría sí pregunta:** al presentarle la idea, el dueño preguntó explícitamente a qué "grupo" se refería y aclaró: *"yo no quiero eliminar cojinetes de biela con un solo clic"*. La familia de medidas se vuelve a armar con un click (cargás una y entran todas); una categoría con varias marcas, no.
**Por qué la papelera y no un `confirm`:** el pedido textual fue poder "verificar que esté el repuesto que eliminé por error". Un cartel de confirmación protege del click accidental pero no del error de criterio, que se descubre días después. La papelera cubre las dos cosas, y por eso mismo permite sacar los carteles del resto.
**Dónde se llena:** en `db.guardar_ficha_motor`, comparando la ficha antes y después. Es el **único** camino por el que cambia una ficha (la pantalla del motor, el paso Repuestos del presupuesto, copiar de otro motor y la fusión al confirmar pasan todos por ahí), así que no hay forma de que un borrado se escape sin registrarse. El mismo lugar saca de la papelera lo que vuelve a entrar: si está en la ficha, no está eliminado.
**Alcance del tacho dentro del presupuesto:** saca el repuesto de la ficha del motor **y** del presupuesto que se está armando (es la intención al tocarlo: "esto no va"). Los presupuestos ya emitidos nunca se tocan: guardan su propia copia congelada.
**Fecha:** 2026-08-12

## La familia de medidas es un nivel propio, distinto del grupo
**Decisión:** entre la categoría (el grupo que se cotiza) y la opción suelta hay un nivel intermedio: la **familia**, identificada por `base_codigo` del catálogo del proveedor. Se expone en la API de repuestos, de la ficha y de los grupos de un presupuesto, y las pantallas la dibujan como un renglón agrupador con su propio tacho.
**Por qué:** el sistema ya trataba a las medidas como un conjunto al agregarlas (elegís una y entran todas), pero al mostrarlas y al borrarlas las trataba como opciones sueltas. Esa asimetría es la que hacía que sacarlas fuera de a una. Además, una categoría con tres marcas × siete medidas son 21 filas indistinguibles; agrupadas se leen como tres bloques.
**No se persiste en el presupuesto:** `base_codigo` es dato del catálogo, no del presupuesto. En `get_grupos_presupuesto` se resuelve contra el catálogo de hoy con el mismo patrón que `precio_actual`/`stock_actual`, así un presupuesto viejo agrupa igual sin migrar nada.
**Fecha:** 2026-08-12

## La nota de "más caro / más barato" no repite lo que ya dice el chip
**Decisión:** en la columna "Cotiza" del pop-up de repuestos, debajo del chip va "El más caro del grupo" o "El más barato — $X menos". No aparece si todas las opciones valen lo mismo, y la de "más caro" se omite en la fila que ya lleva el chip "El más caro".
**Por qué:** el pedido era ver de un vistazo los dos extremos del grupo. Pero la fila que cotiza ya dice "El más caro", así que la nota ahí sería la misma frase dos veces; solo aporta cuando el dueño pisó la elección a mano y el chip pasa a decir "Elegido a mano". Y con precios iguales —el caso normal de una familia de medidas de la misma marca— no hay extremos que marcar: la nota sería ruido.
**Qué marca "el más barato":** la de menor subtotal **con stock**, que es la misma base con la que se calcula el "Ahorro potencial" del encabezado, para que los dos números coincidan. Si ninguna tiene stock, igual se marca la más barata (su fila ya muestra el chip "Sin stock"): la pregunta que contesta la nota es cuál conviene pedir, no cuál hay hoy.
**Fecha:** 2026-08-12

## Un script contra producción que encuentra datos reales aborta, no sigue
**Decisión:** cualquier script de verificación que escriba en producción tiene que (a) elegir el objetivo **buscando** uno vacío en vez de agarrar el primero de la lista, y (b) **cortar la ejecución** —`raise`/`SystemExit`, no un `check` que imprime FALLA y sigue— si encuentra datos cargados. La "limpieza" del final solo puede borrar lo que el propio script creó, nunca vaciar una tabla entera.
**Por qué:** el 2026-08-12 un script de verificación borró la ficha de repuestos real del motor 622 en producción. Encadenó tres errores que por separado no habrían hecho daño: dio por sentado que producción estaba vacía porque así lo decía `estado.md` (dato de tres días antes, ya falso porque el dueño empezó a usar el sistema), agarró `motores[0]` en lugar de buscar un motor libre, y —lo peor— **su propio check "el motor arranca sin ficha" falló y el script siguió igual**, porque `check()` solo anota el fallo y continúa. La "limpieza" final rematró: vació la ficha y después la papelera, que era justo la copia de recuperación.
**Se recuperó** desde los grupos congelados del presupuesto #34 (la ficha nace de `fusionar_ficha_motor` al confirmar, así que el presupuesto es una copia fiel: mismos códigos, mismas cantidades, mismas opciones cotizando). Eso funcionó **de casualidad**: si la ficha se hubiera editado a mano después de ese presupuesto, o si el presupuesto se hubiera borrado, no había de dónde sacarla.
**Lo que sí estuvo bien:** las suites de `tests/` exigen `DATA_DIR` y abortan sin él, precisamente para no correr contra la base real. El agujero estaba en los scripts ad-hoc de verificación post-deploy, que no tenían esa protección. La verificación contra producción sirve y hay que seguir haciéndola — pero de solo lectura donde se pueda, y sobre un objetivo vacío verificado cuando haya que escribir.
**Fecha:** 2026-08-12

## "Deshacer" en la esquina inferior izquierda, para todo borrado
**Decisión:** cualquier borrado del sistema muestra un cartel abajo a la izquierda con el botón **Deshacer**, que dura 8 segundos. Hay **dos mecanismos** detrás del mismo cartel (`context/UndoContext.jsx`):
- `avisarBorrado({ mensaje, onDeshacer })` — el borrado ya se hizo y **se puede revertir**: líneas del presupuesto que se está armando o editando, ítems manuales de mano de obra, y lo que sale de la ficha de un motor (deshacer vuelve a guardar la ficha como estaba, que además saca esos códigos de la papelera).
- `borrarConDeshacer({ mensaje, clave, ejecutar })` — el borrado **no se puede revertir** (un presupuesto con sus PDFs, un cliente, vaciar la papelera del motor, "Borrar datos de prueba"). Entonces **no se ejecuta todavía**: la pantalla esconde lo borrado mirando `estaPendiente(clave)` y el `DELETE` sale recién cuando el cartel se apaga. "Deshacer" lo cancela sin haber tocado el servidor.
**Por qué diferir en vez de restaurar:** un presupuesto borrado se lleva sus PDFs y su numeración; un cliente no se puede recrear (la API no tiene alta de clientes, nacen al presupuestar). Restaurar de verdad exigiría un borrado lógico en la base — mucho más caro que esperar unos segundos antes de mandar el `DELETE`.
**El modo de falla es el seguro:** si la app se cierra dentro de esos segundos, el borrado nunca sale. Se pierde el borrado, nunca el dato.
**Filtrado por clave y no por estado local:** las listas (historial de presupuestos, clientes) esconden lo pendiente con `estaPendiente`, así que aunque la pantalla se vuelva a pedir al servidor durante esos segundos, lo borrado no reaparece; y si el `DELETE` falla, la fila vuelve sola.
**Lo que quedó con confirmación previa además del cartel:** el presupuesto, el cliente y "Borrar datos de prueba" siguen preguntando antes (son irreversibles y masivos); los borrados de repuestos no preguntan nada — el cartel reemplazó al cartel de confirmación, que era el trámite que más molestaba.
**Fecha:** 2026-08-12

## La familia de medidas es la unidad que se ordena (bug de los aros)
**Decisión:** en el pop-up "Ver repuestos" las opciones se agrupan **primero** por familia y recién después se ordenan las familias entre sí por precio (`familiasOrdenadas` en `utils/grupos.js`). Antes se ordenaban las opciones sueltas por subtotal y se agrupaba después.
**Por qué:** con el orden viejo, un código **sin familia** (una marca que el proveedor trae en una sola medida) caía, según su precio, justo debajo de las medidas de otro código y quedaba dibujado dentro de ese bloque: parecía una medida más de esa familia. Y como el orden depende de cuál opción cotiza, el código "saltaba" de bloque cada vez que se tocaba "Usar este" — que fue exactamente como lo reportó el dueño: *"hay un código que no se clasifica bien dentro de un grupo… se va poniendo en otros grupos"*. Caso real: en "Aros" del FIAT Fire conviven `A AK459050` (2 medidas), `A AK476050` (2 medidas) y `A AK450050RSTD`, que no tiene familia.
**Refuerzo visual:** las filas de una familia llevan una **línea roja vertical** a la izquierda (token `--familia-linea`), tanto en el pop-up como en "Repuestos de este motor". Lo pidió el dueño dibujándolo a mano sobre una captura. Lo que queda fuera de la línea es otro repuesto, aunque esté pegado.
**Para la suite:** cada fila lleva `data-familia`; `familiaSinPartir()` en `tests/ui_grupos.mjs` verifica que las filas de una misma familia queden siempre contiguas.
**Fecha:** 2026-08-12

## Las notas de la columna "Cotiza" dicen solo "El más caro" y "El más barato"
**Decisión:** reemplaza a la decisión del 2026-08-12 más arriba ("La nota de 'más caro / más barato' no repite lo que ya dice el chip"): la nota dice **"El más caro"** y **"El más barato"**, sin "del grupo" y sin el "— $X menos".
**Por qué:** pedido explícito del dueño. El ahorro en pesos ya está dos veces en la misma pantalla (encabezado del grupo y del pop-up), y en una columna angosta la frase larga se partía en tres renglones. Sigue en pie el resto de la decisión anterior: con precios iguales no aparece ninguna nota, y la de "más caro" se omite en la fila que ya lleva el chip.
**Fecha:** 2026-08-12

## Los códigos del proveedor van en monoespaciada
**Decisión:** componente `CodigoRepuesto` — el código (`A AK459050 STD`) se muestra en monoespaciada, con fondo suave y borde, en su **propia columna** dentro del pop-up y como chip en la ficha del motor.
**Por qué:** el dueño pidió que el código fuera más legible. En la tipografía de la app el 0 y la O son casi iguales, y el código estaba como línea gris chica debajo de la descripción, donde se leía como un dato secundario cuando en realidad es lo que se copia y se tipea en el sistema del proveedor. En monoespaciada las medidas de una familia quedan además alineadas una debajo de la otra, así que se comparan de un vistazo.
**Fecha:** 2026-08-12

## Los dos ejes del paso Repuestos: cantidad ≠ pertenencia al motor
**Decisión:** el paso Repuestos separa dos cosas que antes iban pegadas. La **cantidad** dice "esta pieza va en ESTE presupuesto"; el **círculo** dice "esta pieza sirve para ESTE MOTOR" (la ficha, permanente). La única dependencia va en un sentido: poner cantidad marca el círculo solo; marcar no pone cantidad. Como consecuencia directa, **el paso arranca vacío**: la ficha del motor dejó de precargarse como selección y pasó a ser la lista de dónde elegir.
**Por qué:** lo pidió el dueño con un caso concreto: para un mismo motor sirven el cojinete de la marca A y el de la marca B, pero en este presupuesto va solo el de la marca A. Antes, la única forma de dejar anotada la marca B era cargarla al presupuesto (y entonces competía por ser la más cara). Con el círculo, la marca B queda guardada en el motor sin cotizarse.
**El tilde guarda de dónde salió**, que es lo que decide si sobrevive al sacar la cantidad: `previa` (ya estaba en la ficha) y `manual` (lo tildó el usuario) **no se destildan solas**; `auto` (lo puso una cantidad o una medida hermana) **se va con la cantidad**. Sin ese dato no se puede cumplir la regla que pidió el dueño: "si lo agregué y lo saco, que se vaya del motor; pero si ya figuraba de antes, que quede".
**Cuándo se escribe en el motor:** lo que el usuario toca a mano se guarda **al instante** (es un acto sobre el motor, igual que el tacho de la ficha); lo que se tildó solo viaja con el presupuesto y lo guarda el backend **al confirmarlo**. Así, abandonar un presupuesto a medio armar no le deja al motor lo que se estuvo probando, pero un tilde deliberado nunca se pierde.
**Fecha:** 2026-08-14

## El círculo (contorno / lleno) en vez de chips de texto
**Decisión:** el estado de cada repuesto se muestra con un círculo verde: **contorno** = está en el motor, **lleno** = además está en el presupuesto, **gris vacío** = ninguno de los dos. Es también el control: clickearlo marca o desmarca.
**Por qué:** la primera propuesta eran chips de texto ("En el motor" / "En el presupuesto"). El dueño los vio largos y propuso el círculo, que ocupa ~20px en vez de ~130 en una tabla que ya tiene siete columnas. Tiene razón: el par vacío/lleno se lee sin leer.
**Lo que se agregó igual, porque el color solo no alcanza** (pantalla al sol, daltonismo, impresión): el estado va en el `title` y en `aria-checked`, y el `×N` sigue al lado. La suite lo lee por `data-estado`.
**Cuidado con la celda:** la columna necesita `wrap: true`. Con `overflow: hidden` la celda dibujaba el `…` del ellipsis al lado del círculo, que se veía como una manchita.
**Fecha:** 2026-08-14

## La cantidad que el motor recuerda es la que más se repite
**Decisión:** la cantidad de cada repuesto en la ficha es **la moda** de sus presupuestos (uno con ×1 y dos con ×2 → 2); si empatan, gana la del presupuesto más reciente. Se recalcula al guardar o editar un presupuesto (`db.recalcular_cantidades_ficha`). Lo que se marcó sin cotizar se guarda **sin cantidad**.
**Por qué:** lo definió el dueño con ese ejemplo. La cantidad no es un dato del catálogo sino del envase de esa marca, y la única evidencia real de cuántos envases hacen falta es lo que se cotizó en la práctica. Un promedio o "la última" se dejan mover por un presupuesto raro; la más repetida no.
**Excepción:** si el taller escribe la cantidad a mano en la ficha, **manda la suya** y el recálculo no la vuelve a tocar (`cantidad_manual`), con un cartelito "Cantidad puesta a mano" para que se entienda por qué ese número no se mueve.
**Detalle de implementación:** "sin cantidad" se guarda como **0** y viaja por la API como `null`. La columna nació `NOT NULL DEFAULT 1` y aflojar eso en SQLite obliga a reconstruir la tabla — no vale el riesgo sobre fichas reales del dueño.
**Fecha:** 2026-08-14

## Las medidas hermanas se marcan en el motor, no entran al presupuesto
**Decisión:** al cargar una medida (050), las otras medidas de esa misma pieza (STD, 025, 075…) quedan **marcadas en el motor, sin cantidad**, en vez de entrar cotizadas al presupuesto como hasta ahora.
**Por qué:** pedido del dueño. Hasta que no se mide el motor no se sabe qué medida va, así que tenerlas anotadas sirve; pero cotizarlas todas infla el grupo con opciones que nadie eligió. Lo que se cotiza es lo que el taller eligió.
**Consecuencia asumida:** el Pedido muestra menos medidas para elegir, porque solo lista lo congelado en el presupuesto. Se evaluó completarlas leyendo la ficha del motor y **el dueño lo descartó por ahora**: prefiere que el sistema avise y sugiera, no que complete solo.
**Fecha:** 2026-08-14

## Sin stock: avisar y sugerir, nunca reemplazar solo
**Decisión:** cuando un repuesto no tiene stock, la pantalla ofrece "Marcas que sirven" — otras marcas que cubren la misma pieza. Solo sugiere: no cambia ni una línea por su cuenta. Las que ya están en la ficha del motor salen primero y marcadas.
**Por qué:** el dueño fue explícito ("que dé el aviso y una sugerencia, pero que no se haga automáticamente"). Cambiar una marca por otra tiene consecuencias de precio y de calidad que decide el taller.
**Cómo se encuentran:** el proveedor usa **la misma descripción para la misma pieza en todas las marcas**, así que descripción + medida identifican al repuesto y todo lo que las comparta es intercambiable. Es un dato del negocio que aportó el dueño y quedó documentado en `CRAC/CRAC.md`. No confundir con `base_codigo`, que agrupa las medidas de un mismo código (misma marca): son dos ejes distintos, marca y medida.
**Fecha:** 2026-08-14

## "Repuestos ya utilizados" en vez de precargar la ficha
**Decisión:** botón en el paso Repuestos que abre los presupuestos anteriores **de ese motor** (fecha · cliente · cuántos repuestos · total · estado); al entrar a uno se ven sus repuestos con la cantidad que llevaron y se eligen los que se quieran traer. Arranca **todo destildado**, con "Seleccionar todos" a mano, y trae los **precios de hoy** avisando lo que cambió.
**Por qué:** arrancar en cero costaba la velocidad del "segundo presupuesto de un click". El dueño pidió este atajo en vez de un "Cargar todo": la ficha acumula alternativas que nunca se cotizaron todas juntas, mientras que un presupuesto anterior **es** una combinación que ya se armó de verdad. Destildado por defecto porque es el mismo principio que todo el cambio: nada entra sin que el taller lo elija.
**Se superpone a propósito con "Duplicar presupuesto"**, que copia todo (mano de obra incluida) y arranca un presupuesto nuevo. Éste es para picotear repuestos sueltos de varios anteriores sin salir del que se está armando.
**Fecha:** 2026-08-14

## El ajuste % no pisa un precio de mano de obra editado a mano
**Decisión:** el precio unitario de un servicio de la Cámara se puede editar en el paso Servicios (tabla de la derecha). Un precio así editado **no recibe el ajuste % de mano de obra**, ni en el momento ni si después se cambia el porcentaje; el ↺ (o vaciar el recuadro) lo devuelve al de la lista y ahí sí vuelve a ajustarse. Sacar el servicio del presupuesto (cantidad 0) borra también su precio editado.
**Por qué:** es la regla que el backend ya aplicaba a los ítems manuales — "esos ya tienen un precio que el usuario eligió a mano, ajustarlos de nuevo por un % global sería doble ajuste" (`_resolver_items`). Un precio tipeado es exactamente eso: un número elegido a mano. Aplicarle el % encima haría que el renglón muestre algo distinto de lo que se escribió.
**Consecuencias asumidas:** (1) "Actualizar a precios de hoy" **informa** el renglón editado como diferencia contra la lista de la Cámara — es lo mismo que ya pasaba con un precio editado desde el detalle, y la revalidación nunca toca la mano de obra, solo la muestra; (2) **duplicar un presupuesto no arrastra los precios editados**, porque la copia se arma a precios de hoy por diseño.
**Implementación:** el override viaja como `precio_unitario` en el ítem con `servicio_id`; sin ese campo el backend calcula el precio contra la lista como siempre. El cálculo (pantalla, total y payload) vive en un solo lugar, `utils/servicios.js`.
**Fecha:** 2026-08-18

## Confirmar un presupuesto pasa por una pantalla de revisión
**Decisión:** el wizard tiene un paso más. El botón verde del paso Repuestos dice ahora "Revisar presupuesto" y lleva al paso 5, que muestra cómo quedó todo (mano de obra + repuestos cotizados + totales) **sin guardar nada**; recién "Confirmar y generar PDF" crea el presupuesto y abre el PDF.
**Por qué:** lo pidió el dueño. Antes, un solo click guardaba, generaba el PDF y lo abría: si algo estaba mal había que editar un presupuesto ya emitido (que además genera una versión nueva de PDF). Revisar antes es más barato que corregir después.
**Qué muestra la de repuestos:** solo **lo que se cotiza** — una línea por categoría, la opción elegida —, con "+N alternativas guardadas" al lado. Mostrar todas las opciones repetiría el pop-up "Ver repuestos" y haría que la suma de la pantalla no coincida con el total.
**Cómo se mantiene fiel:** la pantalla no tiene lógica propia de precios. Usa `lineasServicios` (mano de obra) y `agruparLineas` + `opcionElegida` (repuestos), que es la misma regla que aplica el backend en `_resolver_grupos`. Si esa regla cambia, la revisión cambia con ella.
**Fecha:** 2026-08-18

## Se cotiza todo lo cargado: no hay más "el más caro"
**Decisión:** desaparece la regla que elegía sola con qué opción se cotizaba cada categoría (la de mayor subtotal, pisable a mano). Ahora **cada repuesto que se carga cotiza**, y por eso una misma categoría puede llevar dos piezas que suman las dos: válvulas de admisión y válvulas de escape son las dos "Válvulas". Se fueron con la regla el chip "El más caro", la nota "El más barato", el botón "Usar este", el "Ahorro potencial" y el "Hoy cotizaría $X" de la ficha del motor.
**Por qué:** pedido del dueño ("que el usuario que utiliza el sistema ponga directamente qué repuesto va a usar"). La regla nació como tolerancia —si el día de la compra faltaba la barata, el presupuesto ya cubría la cara— pero obligaba a cargar alternativas que después había que explicar, y hacía imposible cotizar dos piezas distintas de la misma categoría.
**Cómo conviven con lo emitido:** en `presupuesto_item_opciones`, `elegida = 1` pasó a significar "esta línea suma al total". Los presupuestos anteriores tenían exactamente una elegida por grupo, así que **su total no cambia ni un peso**; sus alternativas se leen hoy como opcionales (guardadas, sin cobrar), que es lo que eran.
**Qué queda del grupo:** la categoría del proveedor sigue agrupando —es lo único que lee el cliente en el PDF y lo que ordena el pedido— pero ya no decide nada.
**Fecha:** 2026-08-18

## "Opcionales": lo que puede llegar a hacer falta y no se cobra
**Decisión:** una línea de presupuesto (mano de obra o repuesto) se puede marcar como **opcional**: queda guardada, sale en el PDF en su propia caja y con precio, pero **no suma al total**. Se marca arrastrando la línea a la caja "Opcionales" —en el paso Servicios y en la Revisión— o con la flechita del renglón; en el pop-up "Ver repuestos" es una casilla, en la columna que antes decía "Cotiza".
**Por qué la palabra:** el dueño la venía llamando "extraordinarios" y pidió una mejor. Se le propusieron cuatro y eligió **"Opcionales"**: es la que el cliente entiende sin explicación ("esto se cobra solo si hace falta"), mientras que "extraordinario" suena a recargo. El caso que lo motivó: poner una bomba de aceite por las dudas de que la del motor no sirva, sin inflar el presupuesto.
**En el PDF llevan precio por renglón** (las otras dos cajas no lo llevan: el cliente solo ve el total). Lo eligió el dueño y es lo coherente: como no están en el total, el precio es lo único que le dice cuánto le costaría si hace falta. Va además un subtotal "Si se hacen todos" y la aclaración de que no están incluidos.
**Por qué la flechita además del arrastre:** arrastrar no funciona en el celular, y el dueño usa el sistema desde el teléfono. Los dos caminos terminan en la misma función.
**Modelo de datos:** una columna nueva, `presupuesto_items.opcional` (migración aditiva, default 0 → nada de lo emitido cambia). El total se calcula en `db.total_de_items`, que es el único lugar que decide qué suma.
**Fecha:** 2026-08-18

## El precio unitario y el subtotal son la misma casilla vista de los dos lados
**Decisión:** las dos son editables y **manda la última que se escribe**: escribir el unitario recalcula el subtotal (unitario × cantidad), escribir el subtotal recalcula el unitario (subtotal ÷ cantidad). Cambiar la cantidad, en cambio, siempre deja fijo el unitario.
**Por qué:** lo pidió el dueño así ("el que se edita va a ser el que manda en la ecuación, el otro va a funcionar como esclavo"). En el mostrador se negocia de las dos formas: "te lo dejo en 20.000 la unidad" y "te lo dejo en 80.000 todo".
**Qué se guarda:** siempre el **unitario**; el subtotal es una cuenta. Así el ajuste %, el PDF y el backend siguen leyendo un solo número por línea.
**Casos raros:** con cantidad 0 no se puede repartir el subtotal, así que el valor queda inválido (recuadro rojo) en vez de inventar un número; el redondeo es a dos decimales, con lo cual reescribir el subtotal puede dejar una diferencia de centavos contra lo tipeado si la cantidad no divide justo.
**Dónde:** paso Servicios, pop-up "Ver repuestos" y edición del detalle, todos contra `utils/precios.js`.
**Fecha:** 2026-08-18

## Los buscadores ignoran acentos y no miran el orden de las palabras
**Decisión:** todos los buscadores del sistema normalizan (minúsculas, sin acentos) y buscan **palabra por palabra, en cualquier orden y como fragmento**: "valvulas" encuentra "VÁLVULAS" y "fiat 2.8" encuentra "FIAT DUCATO 2.8TD". Una palabra que no aparece descarta el resultado.
**Por qué:** el dueño escribía "valvulas" y no encontraba nada, y tenía que adivinar el orden exacto de la descripción del proveedor.
**Implementación:** la misma regla en los dos lados — `utils/texto.js` (pantalla) y `app/texto.py` (base) — porque parte de los buscadores filtran en el navegador y parte en SQL. En tablas chicas (motores, clientes, presupuestos) se usa una función `norm()` registrada en la conexión SQLite; en el catálogo del proveedor, que tiene 64.000 filas y se consulta en cada tecla, se guarda una **columna normalizada** (`crac_repuestos.busqueda`) que se llena al importar y que la migración completa sola sobre lo ya cargado.
**Detalle que importa:** el punto se conserva (separa decimales de cilindrada) y la coma se convierte en punto, así "2,8" y "2.8" buscan lo mismo. Todo lo demás (barras, guiones, paréntesis) separa palabras — por eso buscar el código "CAAC02740  60/" también trae "060" y "S60": es el precio de la tolerancia, y se prefirió eso a que el buscador vuelva a ser exigente.
**Fecha:** 2026-08-18

## El cartel de precios solo aparece cuando los precios SUBEN
**Decisión:** el banner rojo del detalle ("hay repuestos más caros que cuando se emitió") aparece únicamente si algún precio **subió**. Si todos bajaron, no hay cartel ni aviso por línea. El botón "Actualizar a precios de hoy" del encabezado sigue estando siempre, y el resumen aclara "ningún repuesto subió de precio" cuando corresponde.
**Por qué:** pedido del dueño. Un precio que bajó no rompe nada: el presupuesto emitido sigue cubriendo el trabajo y hasta deja más margen. Avisarlo en rojo hacía ruido por algo que no había que corregir.
**Qué NO cambió:** los avisos de "ya no tiene stock" y "ya no está en la lista" siguen apareciendo, suba o baje el precio — no son un problema de precio sino de disponibilidad.
**Implementación:** el backend devuelve `hay_subas` en el resumen de revalidación y el detalle lo decide por línea comparando `precio_actual > precio_unitario`.
**Fecha:** 2026-08-18

## Una fila deja de arrastrarse mientras se escribe en ella, pero el mouse la libera en cualquier lado
**Decisión:** `useArrastreOpcionales` sigue apagando el `draggable` de la fila cuando se aprieta el mouse sobre un recuadro editable (si no, querer seleccionar el texto de un precio arrastra el renglón entero), pero el **desbloqueo escucha en `document`**, no en el recuadro: cualquier `mouseup` o `dragend`, caiga donde caiga, devuelve el arrastre.
**Por qué:** como estaba, el desbloqueo colgaba del `onMouseUp`/`onBlur` del propio recuadro. Al apretar sobre el precio y soltar afuera —justo lo que uno hace al querer seleccionar el número— el recuadro nunca recibía el evento y **esa fila quedaba sin poder arrastrarse a Opcionales** hasta que perdiera el foco. Se descubrió porque la verificación de UI del arrastre fallaba: Playwright agarra la fila por el centro, que cae sobre el recuadro del precio.
**Lo que no cambió:** sobre el recuadro del precio el arrastre sigue apagado a propósito. La fila se agarra por la descripción — y para el celular está la flechita, que hace lo mismo.
**Fecha:** 2026-08-19

## Sacar una línea del presupuesto se lleva también su marca de opcional
**Decisión:** poner un servicio en cantidad 0 (o borrar un ítem manual) borra su entrada de `opcionales`, igual que ya borraba su precio pisado.
**Por qué:** la clave quedaba colgada en el estado del wizard. Volver a agregar el mismo servicio más tarde lo traía marcado como opcional —sin sumar al total— sin que nadie lo hubiera tocado. Es la misma regla que ya estaba escrita para el precio pisado ("un dato que ya no se ve en ningún lado no puede volver solo"), que al agregar los opcionales no se extendió.
**Fecha:** 2026-08-19

## Las suites de verificación limpian también la papelera de repuestos
**Decisión:** el arranque de `tests/backend_grupos.py` y de `tests/ui_grupos.mjs` vacía `motor_repuestos_papelera` además de las fichas, los presupuestos y los clientes.
**Por qué:** el bloque 7 de la suite de backend cuenta **exactamente** cuántos códigos eliminados tiene un motor. Como la papelera no se limpiaba, correr la suite de backend después de la de UI (mismo `DATA_DIR`) fallaba en dos verificaciones, y la corrida siguiente pasaba —porque la propia suite terminaba vaciando esa papelera—. Eso es lo que hace parecer "flaky" a un test que en realidad está midiendo bien.
**Regla que queda:** si una suite falla una vez y pasa a la siguiente, buscar el estado que no se está limpiando antes de culpar al test.
**Fecha:** 2026-08-19

## Las suites se corren enteras, siempre — lo que se optimiza es cómo se espera
**Decisión:** `tests/backend_grupos.py` y `tests/ui_grupos.mjs` se corren **completas**. No se agrega filtro por bloque ni se recortan las esperas de la suite de UI.
**Por qué:** el dueño lo pidió explícitamente (2026-08-19): "hacé lo más seguro para que no se nos pase ninguna falla, no importa cuánto tarda". Las dos ideas de acelerarla la debilitan: correr un bloque suelto baja la cobertura, y acortar las esperas fijas produce fallas intermitentes — que es lo peor que le puede pasar a una suite, porque uno deja de creerle (ya pasó con la papelera, ver la entrada de arriba).
**Los números, para no volver a discutirlo a ciegas:** la de backend son **2 segundos** con 237 checks (no hay ninguna excusa para saltearla, nunca). La de UI son **~7-8 minutos** con 211 checks, de los cuales ~160 segundos son esperas fijas; maneja un Chromium de verdad, así que no puede ser instantánea.
**Lo que sí se optimiza:** correr la de UI **una sola vez, al final**, después de tener todos los arreglos hechos —no una vez por arreglo— y **en segundo plano**, siguiendo la conversación con el dueño mientras corre en vez de quedarse esperándola. La sesión del 2026-08-19 tardó 50 minutos por hacer justo lo contrario: tres corridas completas de la de UI y un bloqueo esperando la última.
**Fecha:** 2026-08-19

## La plata va en pesos enteros, y lo que sobra se redondea hacia ARRIBA
**Decisión:** el sistema no maneja centavos. Todo precio, subtotal y total —en pantalla, en la base y en el PDF— es un entero de pesos, y el redondeo es **siempre hacia arriba**, nunca al más cercano.
**Por qué:** pedido del dueño (2026-08-19): "eliminá los centavos de todo el sistema y redondealos hacia arriba". El taller cobra en pesos redondos; los `,51` y `,83` que arrastra el catálogo del proveedor solo ensuciaban la pantalla y el PDF. Hacia arriba porque, si hay que elegir, el taller no cobra de menos.
**Dónde vive el redondeo:** en dos funciones gemelas, `aPesos` (`utils/format.js`) y `pesos` (`app/helpers.py`). Tienen que dar el mismo número las dos: si una redondea distinto, el total que se ve al armar el presupuesto deja de coincidir con el que guarda el backend. Todo lo demás las usa.
**Lo que NO se redondea:** el catálogo del proveedor se importa tal cual viene, con sus decimales. El redondeo pasa recién cuando un precio **entra a un presupuesto** o **se muestra**. Así el dato crudo del proveedor sigue siendo el del proveedor.
**"Entrar a un presupuesto" es al AGREGAR la línea, no al guardarla.** Es la parte que salió mal la primera vez: la línea se quedaba con el precio decimal del catálogo hasta el guardado, y como la pantalla cotizaba `ceil(unitario × cantidad)` y el backend `ceil(unitario) × cantidad`, el total que se aprobaba en la Revisión podía ser unos pesos menor que el emitido. El redondeo va en `lineaDeCatalogo`/`lineaDeOpcion`, apenas el precio deja de ser catálogo y pasa a ser presupuesto.
**Los presupuestos ya emitidos no se migran:** los que se cotizaron con centavos los conservan en la base y se **muestran** redondeados. Lo eligió el dueño: no se tocan datos de trabajos ya entregados al cliente. La consecuencia hay que tenerla presente en la revalidación — lo cotizado (entero) y el catálogo (con centavos) se comparan **los dos redondeados**, porque si no un código cuyo precio no cambió en absoluto se lee como "cambió" y todos los presupuestos aparecen desactualizados.
**Efecto conocido y aceptado:** como el unitario es entero, escribir un subtotal que no se reparte justo entre la cantidad lo empuja al múltiplo siguiente (5.001 ÷ 4 → unitario 1.251 → subtotal 5.004). Las dos pantallas donde se edita lo aclaran debajo de la tabla.
**Fecha:** 2026-08-19

## Un recuadro que muestra un valor CALCULADO no se reformatea mientras se escribe
**Decisión:** el recuadro del subtotal usa `CampoMonto`, que mientras está enfocado muestra un **borrador local con lo tipeado letra por letra** y recién al salir vuelve a mostrar el valor derivado ya formateado. Cada tecla sigue avisando hacia arriba, así que el total se actualiza en vivo igual que antes.
**Por qué:** el recuadro mostraba siempre `textoSubtotal(unitario, cantidad)`, o sea el valor recalculado y formateado. React lo reescribía en cada tecla: escribir "5" devolvía "$ 5", **el cursor saltaba al final** y aparecían centavos de la nada. Es exactamente lo que reportó el dueño ("me deja escribir un número y el cursor después se corre y agrega centavos"). El recuadro del precio unitario nunca tuvo el problema porque guarda el texto tal cual se tipea.
**Regla que queda:** si un input muestra algo que se calcula a partir de otra cosa, no puede ser un campo controlado por el valor calculado. O se guarda el texto tipeado (como el unitario), o se usa el borrador local (como el subtotal, donde persistir el texto de una cuenta no tendría sentido).
**Dónde:** paso Servicios, pop-up "Ver repuestos", paso de Revisión y edición del detalle.
**Fecha:** 2026-08-19

## El círculo verde marca (y desmarca) toda la familia de medidas
**Decisión:** tocar el círculo de un repuesto con medida marca en el motor **todas sus medidas hermanas** (STD, 025, 050…), no solo la tocada. Y es simétrico: apagarlo las saca a todas.
**Por qué:** pedido del dueño (2026-08-19), y es lo que ya hacía **poner una cantidad** desde el 2026-08-14 (`useRepuestosAgrupados` marca las hermanas por su cuenta). Los dos caminos llevan a lo mismo: STD y 050 son la misma pieza, y cuál va se sabe recién cuando se mide el motor, así que se anotan todas y después se elige.
**Por qué simétrico al apagar:** si prender marca cuatro, apagar tiene que sacar esas cuatro; si no, quedan tres medidas prendidas que el usuario cree haber apagado. Para sacar **una sola** medida queda el tacho de la ficha, que es el control fino.
**Implementación:** las hermanas se preguntan al catálogo (`GET /repuestos/medidas`), no a la ficha del motor — lo que se quiere marcar son justamente las que **todavía no están** guardadas. Van todas en una sola llamada a `ficha-repuestos/marcar`, que ya aceptaba varios códigos, porque comparten categoría. Una pieza sin medidas se comporta como antes.
**Fecha:** 2026-08-19

## En la Revisión se edita todo, y con la misma cuenta que en los pasos anteriores
**Decisión:** el paso 5 (Revisión) dejó de ser de solo lectura: se editan **cantidad, precio unitario y subtotal** de todas las líneas —mano de obra, repuestos y opcionales—. Bajar una cantidad a cero saca la línea, igual que en los pasos anteriores.
**Por qué:** pedido del dueño. Es la última pantalla antes de emitir; encontrar ahí un precio mal cargado y tener que volver dos pasos para corregirlo no tiene sentido.
**Cómo se comparte la cuenta:** la lógica de edición se sacó de las pantallas y quedó como **funciones puras** en `utils/servicios.js` (`conCantidadServicio`, `conPrecioServicio`, `conSubtotalServicio`) y `utils/grupos.js` (`conCantidadRepuesto`, `conPrecioRepuesto`, `conSubtotalRepuesto`). Las usan el paso Servicios, el pop-up de repuestos —vía `useRepuestosAgrupados`— y la Revisión. Corregir un precio en la última pantalla da exactamente lo mismo que haberlo corregido dos pasos antes, porque es literalmente el mismo código.
**Dónde vive el estado:** los setters están en el wizard, no en el paso: la Revisión se desmonta al volver atrás y con ella se perdería lo editado.
**Fecha:** 2026-08-19

## Un solo script es el dueño del entorno de dev, y una sola contraseña
**Decisión:** `tests/preparar.sh` levanta todo (deps, base con los datos reales, backend, frontend), espera a que respondan y **prueba el login** antes de devolver el control. Las dependencias pesadas las adelanta el hook de arranque (`.claude/hooks/session-start.sh`), antes de que empiece la sesión. La contraseña es **una sola** en todo el proyecto: `APP_PASSWORD`, que usan el backend (para generar su hash), la suite de UI y la de backend.
**Por qué:** la sesión del 2026-08-19 (segunda) tardó **una hora**, y ~30 minutos fueron desperdicio de dos clases. La suite de UI corrió **4 veces** cuando una alcanzaba: la 1 murió en el login porque el backend se había levantado con una contraseña distinta de la que teclea la suite (había un `test123` escrito a mano); la 2 murió porque `pkill -f wsgi.py` mató también al shell que corría el pkill y el backend no volvió; la 3 falló por un check recién escrito que estaba mal (contaba filas del buscador en vez de medidas de la familia); recién la 4 fue verde. Preparar el entorno a mano costó otros ~6 minutos.
**El punto que importa:** el script es el dueño de **las dos puntas** de la clave —genera el hash con el que arranca el backend y exporta la misma clave que va a teclear la suite—, así que el desajuste que rompió dos corridas ya no es posible. Y para es siempre por PID: `pkill -f` está prohibido en este repo.
**Dónde no vive la contraseña:** en el repo. Misma regla que el `DEPLOY_SECRET` — el dueño la pasa al empezar la sesión. Si falta, las suites lo dicen al arrancar en vez de morir en el login siete minutos después.
**Las cinco reglas operativas** (nunca esperar bloqueado, la suite de UI entera una vez al final, los checks nuevos se prueban antes con un script chico, nunca `pkill -f`, y no tocar el entorno mientras corre una suite) quedaron en **`CLAUDE.md`**, no acá: `decisiones.md` es memoria de por qué, y estas hay que cumplirlas. La lección de fondo: la regla de "una sola corrida al final" ya estaba escrita en este archivo desde la sesión anterior y se rompió igual — una regla que se lee como historia no se cumple.
**Fecha:** 2026-08-19

## Los catálogos técnicos viven en git como JSON, no en SQLite (2026-08-19)
**Decisión:** las 1.396 fichas técnicas de la búsqueda por medidas (camisas, guías, subconjuntos) son tres archivos JSON en `CRAC/tecnicos/`, versionados, que `app/tecnicos.py` carga en memoria al primer uso y filtra en Python. **No hay tabla en la base.**
**Por qué:** el primer plan era una tabla `repuestos_tecnicos` con las medidas en columnas. No hace falta: son 1.396 registros que no cambian con el uso —solo cuando se procesa un catálogo nuevo, unas pocas veces al año— y filtrarlos en Python tarda menos que el ida y vuelta a SQLite. Lo que se gana es lo que *no* hay que escribir: sin tabla no hay migración, ni importación, ni fingerprint para saber si el JSON cambió, ni el riesgo de que un deploy deje producción con el buscador vacío porque nadie corrió la importación. Se hace `git pull` y ya está.
**Lo único que sí sale de la base:** el precio y el stock, con un solo `SELECT ... WHERE codigo IN (...)` sobre los ≤100 resultados ya recortados.
**Cuándo dejaría de valer:** si los catálogos técnicos crecieran un orden de magnitud (decenas de miles de fichas) o pasaran a editarse desde la app. Hoy no es ninguno de los dos casos.
**Fecha:** 2026-08-19

## Los precios del buscador salen de nuestra base, no del repo del que vino
**Decisión:** de `Chiappo-Repuestos-` se copiaron **solo los datos técnicos**. Su lista de precios (`api/_data/precios.js`, 3,7 MB) y sus 25 archivos `CRAC_*.js` (5,8 MB) se dejaron allá.
**Por qué:** este sistema ya tiene el catálogo del proveedor entero —64.250 repuestos con precio y stock— y se actualiza todos los días con el Excel. Antes de escribir una línea se cruzaron los dos: **todo código que el otro repo sabe mapear existe en nuestra base** (camisas 136/136, guías RYC 555/555, Indy 164/164, Nubo 71/71, subconjuntos Mahle 109/201 con al menos una sobremedida). Copiar los precios habría metido una segunda lista que se desincroniza el primer día y hace que el mismo repuesto valga dos cosas según por dónde se entre.
**Consecuencia visible:** una ficha sin código del proveedor (las ~360 que no están cruzadas) se muestra igual, con sus medidas, y dice **"Consultar"** en vez de un precio. Un dato que falta se dice, no se inventa.
**Fecha:** 2026-08-19

## El código del proveedor se resuelve al convertir, no en cada búsqueda
**Decisión:** `scripts/convertir_tecnicos.js` deja en el JSON el código del proveedor **exacto**, resuelto contra `CRAC/precio-stock.csv`. En runtime la búsqueda de precio es una comparación directa contra `crac_repuestos.codigo`.
**Por qué:** en la lista del proveedor los códigos vienen alineados con relleno (`"G IY1171   STD"`, `"S BE01010  0.4"`) y en los catálogos técnicos van con un solo espacio (`"G IY1171 STD"`). Sin resolver esa diferencia, Indy y Nubo daban **0 coincidencias** —235 fichas sin precio— y la mitad de los subconjuntos también. Se podía normalizar en cada consulta, pero eso obliga a un `replace()` en SQL que tira el índice, o a una columna normalizada nueva en una tabla de 64.000 filas. Hacerlo una vez, cuando se convierte el catálogo, cuesta cero y deja el runtime tonto.
**Lo que hay que saber si se regenera:** el script avisa si dos códigos del proveedor normalizan igual (hoy hay 4, ninguno de los que usamos) y se queda con el primero. Si alguna vez un código nuestro cae en una de esas colisiones, hay que mirarlo a mano.
**Subconjuntos, el caso raro:** un código Mahle no tiene UN código del proveedor sino **uno por sobremedida** (`codigo.padEnd(11) + medida`). Se guardan todos, y al buscar se muestra el que tiene stock y precio, diciendo cuál es en la columna "Precio de".
**Fecha:** 2026-08-19

## Un dato que hay que verificar no se muestra igual que un dato que falta ("?")
**Decisión:** los campos del catálogo de pistones que el TXT trae mal —filas que el lector de PDF sacó corridas de columna, largos totales imposibles— **no se cargan con lo que dice el TXT ni se cargan como vacíos**: van a `extra.revisar` (campo → motivo) y la pantalla los muestra como **"?"**, con el motivo en el tooltip. El "—" queda para el dato que simplemente no existe.
**Por qué:** pedido explícito del dueño (2026-08-20: "dejalos en blanco y un signo de pregunta, después me fijo"), y coincide con lo que ya hacía el buscador: una ficha sin código del proveedor dice "Consultar" y no un precio inventado. Cargar el número corrido sería peor que no cargarlo, porque el filtro de medidas devolvería el pistón equivocado y nadie tendría cómo darse cuenta.
**La regla que descarta un largo total:** tiene que ser un número positivo **y mayor que la altura de compresión**. Con eso caen solos los siete casos en que la celda del PDF se leyó vacía, negativa o con el "+ó-" adentro (un largo de -4,00 mm, o de 13,80 mm en un pistón de 65,00 de altura de compresión).
**Dónde se anotan:** en el pendiente #1 de `estado.md`, con qué le pasa a cada uno y cómo se arregla (volver a correr la extracción de Persan para esos números y regenerar el JSON).
**Fecha:** 2026-08-20

## Las sobremedidas de un pistón salen de la lista viva del proveedor, no del TXT
**Decisión:** `codigos_crac` de cada pistón se arma cruzando el código base contra `CRAC/precio-stock.csv`, ignorando la columna `MEDIDAS CRAC` que trae el TXT.
**Por qué:** esa columna es una **foto del día que se procesó el catálogo**. Para `PS082PH` dice "STD - 0.6" y la lista de hoy tiene además 1.0 y 1.5: respetarla habría dejado dos sobremedidas con stock invisibles en el buscador. El TXT es la fuente de los **datos técnicos**; de lo que se consigue y a cuánto, la fuente es la lista, que se actualiza todos los días.
**El detalle que costó:** en la lista del proveedor **el código y la sobremedida comparten un campo de ancho fijo (14 caracteres)**, así que el separador se come los espacios y a veces un dígito: `"P PS082PH  0.6"`, pero también `"P PS140PH/1STD"` y `"P PS136PH/10.4"` —ese `.4` es un `0.4` recortado—. Partir por espacios no sirve. Se matchea por prefijo **y se exige que lo que sobra sea una sobremedida válida** (`STD`, `0.6`, `030`, `.4`); sin esa segunda condición la base `P PS161C` se lleva puesto al `P PS161C /10.4`, que es otro producto.
**Fecha:** 2026-08-20

## Una tabla ancha scrollea; no aplasta la columna que envuelve
**Decisión:** `DataTable` le pone al `<table>` un `minWidth` igual a la suma de lo que pide cada columna (`width`, o `minWidth`, o 120 px para las que envuelven texto).
**Por qué:** la tabla es `tableLayout: fixed` con `width: 100%`. Cuando la suma de los anchos declarados no entra en el contenedor, el navegador los reparte proporcionalmente y **la columna sin ancho fijo queda en cero**: el texto sale una letra por renglón y el encabezado desaparece. Se destapó al agregar pistones, que tiene más columnas que las otras familias, pero le pasaba a cualquier tabla del sistema en una pantalla angosta. El div de afuera ya tenía `overflow: auto`, así que con el mínimo puesto la tabla simplemente **scrollea**, que es lo que uno espera de una tabla ancha.
**Fecha:** 2026-08-20

## El signo de la tolerancia la hace de un solo lado (+ / −)
**Decisión:** el casillero de tolerancia de la búsqueda por medidas acepta signo, y el signo cambia el rango: `+` es "ese valor o más", `−` es "ese valor o menos", y sin signo sigue siendo el `±` de siempre. Con número al lado el signo acota (`+2` sobre 40 es de 40 a 42); solo, no pone tope. El signo se cambia con un botón de tres estados entre los dos casilleros **o** escribiéndolo adelante del número, que es lo que hace cualquiera.
**Por qué:** pedido del dueño (2026-08-21), con el caso que lo motivó: buscó una guía de válvula de 40 y encontró después una de 50 que también le servía. Una pieza más larga o más gruesa muchas veces entra donde va la chica —se recorta, se rectifica—, así que "de 40 para arriba" es una búsqueda real del taller, y con `±` obliga a adivinar la tolerancia (¿±5? ¿±10?) hasta que aparezca.
**Dónde vive la regla:** en `_rango()` de `app/tecnicos.py`, un solo lugar, así que vale para las cinco familias y para cualquier medida que se agregue después. El frontend solo manda el texto tal cual se escribió.
**El detalle que podía romperlo callado:** el `+` en una query string significa espacio. Viaja como `%2B` porque `URLSearchParams` lo escapa; si algún día se arma la URL a mano y se escapa mal, la tolerancia se cae al `±0,5` por defecto **sin error visible**. Por eso la suite de backend lo prueba por HTTP y no solo llamando a la función.
**Fecha:** 2026-08-21

## Bujes de biela Indubrón: el TXT se verificó contra el Excel antes de cargarlo
**Decisión:** la quinta familia del buscador (190 bujes de biela) se cargó desde el TXT que pasó el dueño, pero recién después de compararlo **fila por fila y campo por campo** contra la hoja `CATALOGO BIELA` del `Indubrón.xlsm`: 190 filas, los 13 campos de cada una, cero diferencias (normalizando coma/punto decimal y espacios). El TXT quedó en `CRAC/tecnicos/fuentes/` y el `.xlsm` no entró al repo.
**Por qué verificar y no confiar:** la extracción anterior, la de pistones Persan, salió de leer tablas de un PDF y **10 de 35 filas** tenían columnas corridas. Ese antecedente es la razón por la que el dueño preguntó "fijate si están bien extraídos" antes de pedir la pantalla. Acá la fuente era un Excel, no un PDF, y se nota: salió exacto.
**Lo que sí hay que saber de estos datos:** 7 códigos aparecen **dos veces**, bajo dos marcas distintas (el I-115 es el buje del Corsa 1.7 D y el del Isuzu 4EE1). No es un error de extracción: el catálogo los lista así y las dos fichas se muestran. Tres filas son **referencias cruzadas** ("VER CITROEN") sin ninguna medida: se cargan igual, porque buscando "Ford" tienen que aparecer para mandar a la ficha que sí tiene los datos.
**Fecha:** 2026-08-21

## Una medida puede traer dos valores, y entra si cualquiera de los dos sirve
**Decisión:** en `medidas` y en las sobremedidas, un valor puede ser un número o una lista de dos. El Ø exterior STD de un buje viene con su banda de tolerancia (`"35,04/07"` → `[35.04, 35.07]`) y veinte bujes son escalonados o trapezoidales, con dos anchos (`"14,60/20,20"` → `[14.6, 20.2]`). `_en_rango()` da por buena la ficha si **cualquiera** de los valores cae en lo que se pidió.
**Por qué así y no un intervalo continuo:** un buje de 14,60/20,20 tiene dos anchos, no todos los anchos entre 14,60 y 20,20. Tratarlo como intervalo lo haría aparecer buscando 17, que es un ancho que la pieza no tiene. Con "cualquiera de los dos" aparece buscando 14,6 y buscando 20,2, que es lo correcto en los dos casos — y para la banda de tolerancia del STD da lo mismo, porque son 3 centésimas de diferencia.
**Por qué no promediar ni quedarse con uno:** promediar inventa una medida que no existe en ninguna pieza; quedarse con la primera hace que el buje escalonado sea inencontrable por su otro ancho, que es justo el que se mide cuando se mira del otro lado.
**Fecha:** 2026-08-21

## La forma de la guía se muestra dibujada, recortada de la lámina del catálogo
**Decisión:** la columna **Forma** de guías muestra el dibujo de la forma al lado del código, el filtro es una fila de nueve dibujos clicables (no un `<select>` de letras), y un botón abre la **lámina completa** con las nueve formas y las cuatro figuras de detalles numerados.
**Por qué:** el código solo ("A-1-6") no le dice nada a nadie que no tenga la lámina del catálogo al lado; la forma, en cambio, se reconoce de un vistazo cuando se tiene la guía en la mano. El dueño mandó la lámina justamente para eso (2026-08-21).
**De dónde salen los dibujos:** de la última página del catálogo RYC 2025, una sola imagen de 1399×572. `scripts/recortar_formas_ryc.py` la corta en trece PNG (nueve formas + cuatro figuras de detalles) y les saca el fondo: cada pixel queda negro con transparencia proporcional a lo oscuro que era, así el trazo conserva el antialias y se ve limpio sobre fila blanca o beige, a 38 px en la tabla y a 104 px en la lámina. Son 66 KB en total, viven en `webapp/frontend/public/formas/` y se commitean.
**Las cajas de recorte están escritas a mano, y eso es a propósito:** detectarlas por huecos de blanco separaba los números de su figura (el "1" y el "2" son dos etiquetas del MISMO dibujo, y el "4" cuelga por fuera del contorno). El script se defiende solo: avisa si a una caja le quedó tinta pegada por fuera, que es lo único que puede salir mal al retocarlas y en el recorte chico no se ve.
**Los números tienen nombre.** La referencia del catálogo dice qué es cada detalle (1 ranura exterior para el asiento del anillo de fijación, 2 rebaje, 3 extremidad cónica, 4 cámara interna, 5 agujero para lubricación, 6 cámara interna en el extremo de la guía, 7 filete de lubricación, 8 filete de lubricación total). Están en la lámina y en el tooltip de cada guía: sin eso "A-1-6" es una matrícula, con eso dice qué tiene la pieza que se está mirando.
**La "N" va sin dibujo.** Siete guías Indy tienen forma "N", que no está en la lámina de RYC (Indy y Nubo usan las mismas letras que RYC en todo lo demás). Se muestra el código sin dibujo: uno prestado sería peor que ninguno, misma regla que el "?" de los pistones.
**Actualizado el 2026-08-21 (más tarde ese día): la N ya tiene su dibujo.** El dueño mandó la referencia del catálogo NUBO 2025 como archivo (la pestaña "REF" del Excel), que sí trae la N. Ver la decisión de abajo.
**Fecha:** 2026-08-21

## La N se recortó de la referencia de Nubo, y se pasó a línea para que no desentone
**Decisión:** la décima forma, la **N**, sale de la referencia del catálogo NUBO 2025 (`CRAC/tecnicos/fuentes/nubo_formas.jpg`, la imagen de la pestaña "REF" del Excel que mandó el dueño). Se recorta **solo la N** —las otras nueve se quedan como están, que es lo que pidió— con `scripts/recortar_forma_n.py`.
**Por qué no se rehicieron las diez de esa lámina:** son de estilos distintos (Nubo dibuja con sombreado, RYC con línea pura) y el dueño fue explícito: "recorta solo la letra N, las otras dejalas como están".
**Cómo se emparejó el estilo igual:** el dibujo de Nubo tiene el contorno casi negro y el relleno en grises claros, así que la rampa de transparencia se corta bien abajo (120 → 40) y queda **solo el contorno y la letra**: una N de línea, del mismo palo que las otras nueve. Sin eso, un cilindro sombreado al lado de nueve siluetas canta.
**Lo que cambia en pantalla:** el filtro de formas ya no tiene ninguna letra pelada (las nueve del catálogo tienen dibujo) y la lámina muestra diez.
**Fecha:** 2026-08-21

## El dibujo del pistón se recorta solo, y todos salen del mismo tamaño
**Decisión:** los subconjuntos Mahle muestran el **dibujo del pistón** del catálogo en una columna propia de la búsqueda por medidas (miniatura de 56 px; un clic la abre en grande al lado de la descripción). Los archivos los genera `scripts/recortar_pistones_mahle.py` desde las fotos crudas de `CRAC/tecnicos/fuentes/pistones/`, y salen a `webapp/frontend/public/pistones/<código sin espacios>.png`.
**Por qué un recorte automático y no a mano:** las fotos llegan como rectángulos sacados a ojo del PDF, con lo que haya alrededor adentro — números de la fila, rayas de la grilla, barras negras, medio pistón del vecino. Recortarlas a mano son 48 recortes hoy y 153 más cuando aparezcan; el script las deja limpias todas juntas y vuelve a correr cuando caen fotos nuevas. Las cajas escritas a mano de `recortar_formas_ryc.py` funcionan porque ahí la lámina es **una sola imagen fija**; acá cada foto viene distinta.
**Cómo encuentra el dibujo:** un pistón son **dos vistas, una sobre la otra y del mismo ancho** (el corte y el círculo). El script borra las rayas que cruzan la imagen, descarta los pedazos que son pura recta (corchetes de cota), arranca de una de las dos vistas y le suma los que estén alineados, midan lo mismo de ancho y no estén más lejos que un Ø. Un número suelto no pasa ninguna de las tres. (De qué pedazo arranca cambió el 2026-08-29, cuando llegaron fotos con la fila entera del catálogo adentro: ver la sección de más abajo.)
**Por qué el trazo se lleva a negro pleno:** hay páginas del catálogo dibujadas en gris clarito y otras casi en negro. El contraste se estira contra los valores de cada imagen, así ninguna se ve desteñida al lado de las otras.
**Todos del mismo tamaño (pedido del dueño), sin reescalar:** el recorte queda en su resolución original y se **rellena con transparente** hasta una proporción fija de 13:20. Como los dos lados salen de multiplicar ese par de enteros, la proporción es exactamente la misma en los 48 archivos y a una altura fija miden todos lo mismo **al pixel** — con un 0,65 decimal, el redondeo dejaba a unos un pixel más anchos. Reescalar el dibujo para igualar pixeles no habría agregado nitidez, la habría sacado.
**Qué código le toca a cada foto:** el número que trae el nombre del archivo, cruzado contra los códigos de `subconjuntos.json` (que el catálogo escribe "S BE14040" y "S BE 14040" indistinto). Si un código tiene dos fotos gana la del dibujo más grande. El script avisa de lo que no pudo cruzar en vez de saltearlo en silencio.
**Cuáles tienen dibujo lo dice un manifiesto generado** (`dibujos-pistones.js`), no una prueba de carga: pedir un PNG que no está deja un cuadrito roto en la tabla y un 404 por fila. Los subconjuntos sin foto van con un guión (eran 144 el 2026-08-21; con la segunda tanda quedaron 65).
**Fecha:** 2026-08-21

## La forma se normaliza al cargar el catálogo, no en el JSON
**Decisión:** `_normalizar_forma()` en `app/tecnicos.py` arregla al vuelo las formas que vienen mal escritas: `A1` → `A-1`, `P36` → `P-3-6`, `A-13` → `A-1-3`. Son 6 fichas de 915.
**Por qué ahí y no en el JSON:** el JSON se regenera cuando se procesa un catálogo nuevo, y una corrección escrita adentro se pierde en silencio la próxima vez. En el `_catalogo()` vale también para el catálogo que venga mañana, sin depender de que el script de conversión se acuerde.
**La regla y por qué es segura:** la lámina define los detalles del **1 al 8**, así que un número de más de un dígito solo puede ser dos detalles pegados. Lo que no encaje en "letra + dígitos" se deja tal cual vino — mejor un código raro en pantalla que uno inventado.
**Fecha:** 2026-08-21

---

## Las etiquetas de sobremedida de las camisas: la regla del paréntesis (2026-08-22)

**Contexto.** El buscador de camisas mostraba mal la sobremedida de más de la
mitad del catálogo. El JSON venía del buscador web viejo, que numeraba las
medidas de cada camisa en orden fijo (`-.060"`, `-.030"`, STD, …) sin mirar en
qué columna del catálogo estaba cada valor. Una camisa STD figuraba como
`-.060"`, y las medidas métricas (`+0,50 mm`) aparecían como pulgadas.

**El problema real.** El Excel de Fadecya tiene, en las nueve columnas de
"DIMENSIONES EXTERIORES INDICATIVAS", **dos filas de encabezado superpuestas**:
pulgadas arriba y milímetros entre paréntesis abajo, y no coinciden columna a
columna. Leer una fila por posición es, literalmente, tirar una moneda.

**Decisión.** La etiqueta la decide **la celda, no la columna**: si el valor
está entre paréntesis se lee con el encabezado métrico, y si no, con el de
pulgadas. Además, tres formas sueltas que el catálogo escribe a mano dentro de
la celda: `+.090"= 104,05` (etiqueta y valor juntos), `+.040"=` (la etiqueta
apunta al valor de la celda siguiente) y un bloque —la UC 1278— que trae su
propio encabezado y sus valores en las filas de abajo, sin repetir el código.

**Por qué se confía en esto.** Se cruzó contra la página de Fadecya, que publica
las sobremedidas disponibles fila por fila: de los 366 valores que están en las
dos fuentes, la regla acierta **361**, y los 5 restantes son justamente los
`+.040"=`, que se resuelven aparte. No es una heurística que "parece andar": es
una regla verificada contra la fuente independiente.

**Qué fuente manda para qué.** Los números salen del **Excel** (el dueño confía
más en él: "yo confío más en el excel que en lo que dice la página"). Las
**etiquetas** las confirma la página, que también aporta las camisas nuevas
desde 2019 y las sobremedidas que Fadecya agregó después. El precio y el stock,
como siempre, salen de la base del proveedor.

**Lo que se descarta a propósito.** El asterisco (`81,76*`) y el `+` de adelante
de los Ø exteriores de las húmedas (`+124,92`). El dueño no sabe qué significan
y pidió expresamente no ponerlos en el programa: un signo que no se puede
explicar en pantalla es ruido. El número se guarda igual.

## Un dato mal cargado se muestra con "?" y no se corrige a ojo (2026-08-22)

**Contexto.** El dueño avisó que en la página de Fadecya los altos de pestaña de
4,00 son en realidad 4,76. Como los números salen del Excel, 16 fichas se
arreglaron solas. Pero quedaron **10 que dicen 4,00 también en el Excel** — y
ahí las dos fuentes coinciden en un valor sospechoso.

**Decisión (del dueño, textual).** "Si el excel también dice 4.00 poné 4.00 pero
con un signo de pregunta al lado. Y cuando se apoya el mouse arriba quiero que
salga una nota aclarando qué significa el signo de pregunta." Es decir: **no se
corrige, no se borra, se marca**. El JSON lo lleva en `extra.revisar`, un
mecanismo que ya existía para los pistones con columnas corridas; lo que se
sumó es el caso "hay valor **y** hay reparo", que antes no se mostraba.

**Por qué así.** Cambiar los 4,00 a 4,76 por regla habría metido un error nuevo:
en varias de esas fichas la página dice 3,95 o 3,98, o sea que el 4,00 del Excel
es un redondeo y no un 4,76 mal escrito. Corregir a ojo, en un dato con el que
se decide si una camisa entra en un motor, es peor que mostrar la duda.

## El filtro "solo las que tiene el proveedor": tildado, en todas menos subconjuntos (2026-08-22)

**Contexto.** Al sumar las 107 camisas húmedas, el catálogo pasó a tener piezas
que el proveedor no vende: salen del catálogo de fábrica de Fadecya, no de su
lista. El dueño lo pidió así: agregarlas, pero con un filtro que muestre solo lo
disponible, **tildado por defecto** y que se pueda destildar.

**Decisión.** Salió **solo en camisas** —era la única familia con piezas que el
proveedor no vende, y activarlo en las demás habría escondido piezas que hoy se
ven sin que nadie lo pidiera— y el dueño pidió extenderlo apenas lo vio: va a
pasar los catálogos completos de las otras familias, y ahí va a pasar
exactamente lo mismo que con las húmedas. Quedó en **todas menos
subconjuntos**, que dejó afuera expresamente: esa pestaña se usa para leer la
ficha del pistón Mahle —medidas, dibujo, código de aros, camisa que le va—
aunque el subconjunto no se pueda pedir, así que esconder por defecto la mitad
de las fichas estorbaría en vez de ayudar. Se implementó como una propiedad
de la familia (`filtro_proveedor` en `ESPEC`), así prenderlo o apagarlo en una
familia es una línea, y la pantalla lee de ahí si muestra la casilla — no la
tiene duplicada.

**Lo que cambió al extenderlo.** Las búsquedas de las otras familias devuelven
menos por defecto (Ø vástago 11 ±0,1 pasó de 30 guías a 24). Las suites que
verifican el **dato del catálogo** —que un buje escalonado tiene sus dos anchos,
que la forma "P36" se normaliza a "P-3-6"— van con `solo_crac=0`: ahí se está
verificando el catálogo, no si la pieza se consigue.

**Detalle de UX.** Cuando el filtro esconde algo, la línea de resultados lo dice
("hay 13 más en el catálogo que el proveedor no tiene") y ese texto es el botón
que las muestra. Un filtro activado por defecto que no avisa lo que esconde es
una trampa: alguien busca una camisa que sabe que existe, no la encuentra y
concluye que el sistema está incompleto.

## Asientos de válvulas: tres catálogos en una familia, y el ángulo como medida (2026-08-28)

**Contexto.** El dueño pasó tres catálogos de asientos —Indy (hoja
`Asientos-Seats - casquillos`), Nubo (hoja `ASIENTOS`) y RYC (un Excel entero de
asientos)— y pidió una categoría nueva en la búsqueda por medidas con seis
datos: tipo (admisión / escape), Ø exterior, Ø interior, altura, ángulo y
cantidad por juego.

**Una sola familia con los tres catálogos, y la marca dice de cuál salió.** Es
lo mismo que ya se había hecho con las guías (RYC + Indy + Nubo juntas). La
columna **Marca** dice INDY, NUBO o RYC —que es como los nombró el dueño ("ese
dato solamente te lo da Indy, para las otras marcas poné un guión")— y la marca
del vehículo (CHEVROLET, CATERPILLAR) va adentro de "Motor / aplicación", que es
donde se la busca.

**La cantidad por juego solo la publica Indy.** Pedido textual: en Nubo y RYC va
un **guión**, no un número copiado del catálogo vecino. En el JSON es `null`, y
la pantalla ya muestra "—" para cualquier campo vacío. El **0** de la columna de
Indy (51 filas) se trata igual que un vacío: un juego de cero piezas no existe,
es un dato que falta.

**El ángulo es una medida con tolerancia, no una lista de valores.** La
tentación era un desplegable con 30º / 45º, que es el 76 % del catálogo. No se
hizo: hay diez asientos de 7º, 11º, 44,3º, 46º y 50º —así los escribe el
catálogo de Indy— y una lista cerrada los dejaría fuera del buscador para
siempre. Entra como una medida más (`medidas.angulo`), con el mismo casillero de
valor + tolerancia que las otras, y el casillero dice **º** en vez de mm: para
eso `CampoMedida` y el tag de arriba de la tabla aceptan ahora una `unidad`, que
por defecto sigue siendo mm.

**El cruce con la lista del proveedor: cada catálogo escribe su código distinto.**
La categoría del proveedor es la **F** (asientos / casquillos) y adentro hay tres
marcas: `IY` (Indy), `NB` (Nubo) y `R` (RYC).

| Catálogo | Código | Código del proveedor | Cómo se cruza |
|---|---|---|---|
| Indy | `A5177` | `F IY 5177` | se le saca la "A" del frente |
| Nubo | `C105` (tipo A) | `F NB 105A` | número + la letra del tipo pegada |
| RYC | `523` | `F R 523T` | por el número: la letra final es del proveedor, no del catálogo |

Cruzan **326 de las 1.108 fichas** (258 Indy, 55 Nubo, 13 RYC), y del lado del
proveedor quedan sin ficha 41 códigos Indy, 4 Nubo y 3 RYC — son piezas de
ediciones viejas de los catálogos. Los 55 cruces de Nubo y los 13 de RYC se
revisaron **uno por uno** contra la descripción del proveedor antes de darlos por
buenos. Como en subconjuntos y bujes, un código base tiene una fila por
sobremedida (STD, 003, 005, 010…) y se guardan todas: el precio que se muestra
es el de la que tiene stock, y la columna "Precio de" dice cuál es.

**Las filas sin código no entran.** Nubo tiene siete filas con medidas pero sin
código (productos que todavía no numeró) y RYC tres semiterminados sin tipo. Sin
código no hay nada que pedir, así que las de Nubo se saltean; los semiterminados
de RYC sí entran, porque tienen código y medidas y el tipo vacío se muestra como
un guión.

**Las fuentes se commitean como volcado CSV de la hoja, no como el Excel.** El
Excel de Nubo pesa 7,5 MB y trae quince hojas de las que se usa una: los tres
volcados juntos pesan 78 KB, se leen en un diff y alcanzan para regenerar el
JSON. El encabezado de `scripts/convertir_asientos.py` dice qué hoja de qué
archivo es cada uno y con qué tres líneas se rehace el volcado.

---

## Lo que engaña al recorte de pistones cuando la foto trae la fila entera (2026-08-29)
**El caso:** la segunda tanda de fotos (79, contra las 48 de la primera) vino recortada mucho más ancha: cada foto trae la **fila completa del catálogo** —todas sus columnas— y varias se llevaron puesto el **encabezado de la página**. El script salía con la camisa de la columna "C", con un iconito del encabezado o con el bloque de texto del código, en 30 de las 79.

**Decisión:** tres reglas nuevas en `scripts/recortar_pistones_mahle.py`, todas apoyadas en algo que el dibujo del pistón tiene y los intrusos no:

1. **Lo pintado de color es papel.** El catálogo resalta en celeste la celda del código de subconjunto. Un rectángulo macizo tiene más tinta que cualquier dibujo de línea, así que ganaba siempre. El dibujo es gris neutro (R = G = B): alcanza con tirar todo pixel cuyos canales difieran en más de 40. Se van con él los textos naranjas de la tabla, que tampoco hacen falta.
2. **El arranque es el círculo, no el pedazo con más tinta.** La columna "C" de la fila dibuja la **camisa**: un tubo rayado, el doble de alto que el pistón y con bastante más tinta. Redonda no es. Lo único redondo de la fila es la vista de abajo del pistón, así que se arranca de ahí. Y para que un círculo no se confunda con la camisa se mide **si tiene los lados rectos**: la parte de las filas del pedazo que miden lo mismo de ancho que la más ancha. Medido sobre estas fotos, las camisas dan de 0,67 para arriba y los pistones de 0,46 para abajo; el corte está en 0,6.
3. **Arriba de la celda resaltada no se mira.** Los iconitos del encabezado (el pistón en perspectiva de la columna "KH", el bloque de motor, los aros) también son redondos, y cuando el dibujo de la fila salió chico son más grandes que él. La celda resaltada **es el código que se está recortando**, así que marca dónde empieza la fila, y el dibujo cae siempre debajo de la primera línea de texto de su fila. Las fotos de la primera tanda no traen celda resaltada: sin ella la regla no se aplica y todo sigue como estaba.

**Por qué medir la forma y no la posición:** la tentación era cortar por altura ("el encabezado son los primeros 200 px"), pero cada foto viene recortada distinta y hay fotos donde el dibujo está arriba de todo. Las tres reglas de arriba se apoyan en algo que no depende de cómo se recortó la foto.

**Un detalle que se cuela solo:** los redondelitos de adentro del dibujo (el agujero del perno, las marcas del centro) son círculos perfectos y chicos. Se saltean los que caen dentro de la caja de otro candidato más grande: son un detalle de la vista, no la vista.

**Cómo se verificó:** la lámina de control (`--hoja`) con los 127, mirada de a cuatro pedazos, más una segunda lámina de los 79 nuevos a 380 px por celda para poder ver si se coló un número o una cota. Los 48 de la primera tanda salen **byte a byte iguales** que antes del cambio — es la prueba de que las reglas nuevas no rompieron nada viejo, y conviene repetirla (`git status` sobre `public/pistones/`) cada vez que se toque el script.

**Fecha:** 2026-08-29

## El número del código sale de la "S" del nombre del archivo (2026-08-29)
**Decisión:** `_numero_del_nombre()` busca los dígitos pegados a la **"S"** del código (`S48301`, `1_S48950` → 48950) y recién si no hay ninguna S cae al primer número del nombre, que es como se llamaban las fotos de la primera tanda (`14040.png`).
**Por qué:** la segunda tanda trajo tres códigos con **dos recortes cada uno**, numerados por delante (`1_S0591230.png`, `2_S0591230.png`). Con el primer número a secas esas fotos se leen como el código **1** y el **2**. Hoy ningún subconjunto tiene esos números y el script las saltearía avisando —molesto pero inofensivo—, pero el día que exista una ficha con el número 3 un `3_` le pondría al pistón **el dibujo de otro, sin avisar**. Un error silencioso en un dato que el dueño usa para elegir un repuesto es exactamente lo que no puede pasar.
**Cómo se comprobó que no rompe lo viejo:** la regla nueva se corrió contra los 135 nombres que ya estaban en la carpeta y da **el mismo número que la vieja en los 135**, antes de tocar el script.
**Fecha:** 2026-08-29

## Una foto cuyo código no está en el catálogo se queda en `fuentes/` (2026-08-29)
**Decisión:** cuando el número de una foto no cruza con ningún código de `subconjuntos.json` (le pasó a `S26510.png`, el FORD CARGO 6.6 L: el proveedor lista el `S BE26500` de la fila de arriba pero no el 26510), la foto **no se borra**. Queda en `CRAC/tecnicos/fuentes/pistones/` y el script avisa en cada corrida.
**Por qué:** el catálogo del proveedor se reimporta cada tanto y los códigos aparecen y desaparecen. Si la foto se queda, el día que el código entre el dibujo se carga solo con la próxima corrida; si se borra, hay que acordarse de que existía y volver a recortarla del PDF. El aviso repetido es el precio, y es barato: son dos líneas por corrida y dicen algo cierto.
**Fecha:** 2026-08-29
