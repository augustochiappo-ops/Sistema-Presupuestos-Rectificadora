# Verificaciones

Dos suites que cubren el bloque de **grupos de repuestos** (qué cotiza cada
categoría, opcionales, ficha del motor, pedido, medidas automáticas). Se
escribieron el 2026-08-10 junto con la feature y sirven para no romperla al
tocar repuestos más adelante.

No son tests unitarios ni usan pytest: son scripts que corren de punta a punta
contra los **datos reales del repo** y contra la app de verdad. Imprimen una
línea por verificación y salen con código 1 si falla alguna.

> **Regla no negociable:** las dos suites **crean y borran datos**. La de backend
> termina vaciando presupuestos y clientes. Corrélas siempre contra un `DATA_DIR`
> descartable, **nunca** contra `webapp/backend/data/` si ahí vive la base que te
> importa, y **nunca** contra producción.

---

## 1. Backend — `backend_grupos.py`

220 verificaciones sobre la lógica, la base y el PDF.

```bash
# Una sola vez: entorno con las dependencias del backend + pypdf (para leer el PDF)
python3 -m venv /tmp/rect-venv
/tmp/rect-venv/bin/pip install -r webapp/backend/requirements.txt pypdf

# Correr (DATA_DIR es obligatorio y tiene que ser una carpeta descartable)
DATA_DIR=/tmp/rect-test /tmp/rect-venv/bin/python tests/backend_grupos.py
```

La primera corrida sobre un `DATA_DIR` nuevo importa sola los datos reales
(FACRA + catálogo del proveedor). Tarda ~30s por las 64.250 filas del CSV; las
corridas siguientes reusan lo importado.

Qué cubre, por bloque:

| Bloque | Qué verifica |
|---|---|
| Medidas | Familia `CAAC02740` completa (7 medidas), `ACAM 3066` sin hermanas (es número de parte, no medida), `S60`/`60/` excluidos, fecha de importación del catálogo |
| Qué cotiza | **Todo lo cargado cotiza** (desde el 2026-08-18): una línea por repuesto, dos repuestos de la misma categoría suman los dos (válvulas de admisión + escape), y lo marcado como **opcional** queda guardado pero no suma |
| Presupuesto | Una línea por repuesto cargado, total = suma de las que cotizan, `grupo_num`, las opciones guardadas con su marca |
| Opcionales | Se guardan como línea (`opcional = 1`), no entran en el total, salen en la caja propia del PDF con precio y subtotal, y se pueden marcar tanto en la creación como en la edición |
| Buscadores | Sin acentos ni mayúsculas y por palabras sueltas en cualquier orden ("fiat 2.8" encuentra "FIAT DUCATO 2.8TD", "ramon pena" encuentra "Ramón Peña"): catálogo del proveedor, motores e historial |
| Presupuestos viejos | Un presupuesto emitido antes del cambio conserva **exactamente** su total: sus alternativas se leen como opcionales |
| Ficha del motor | Se crea sola al confirmar, resuelve precios de hoy, respeta la cantidad cargada, se copia a otro motor |
| Marcar sin cotizar | `POST .../ficha-repuestos/marcar` mete el código en la ficha **sin cantidad** y no le pisa la cantidad a uno que ya venía cotizado; desmarcar lo saca y lo deja en la papelera; 400 sin códigos y 404 de motor inexistente |
| Cantidad recordada | Es la que **más se repite** en los presupuestos del motor (uno con ×1 y dos con ×2 → 2), la ficha informa `usado_en` y `cotizadas`, y la cantidad escrita a mano (`cantidad_manual`) no la pisa el recálculo |
| Repuestos ya utilizados | `GET .../presupuestos-repuestos` lista los presupuestos del motor con repuestos, del más nuevo al más viejo, con cuántos llevó cada uno |
| Alternativas sin stock | `crac.get_alternativas` busca por **descripción + medida** (el proveedor repite la descripción entre marcas), nunca devuelve el mismo código ni sus medidas hermanas, y solo sugiere lo que hoy tiene stock |
| Pedido | Precios de hoy, agrupado por marca, total cotizado coincide, fecha del catálogo, más barato ≤ cotizado |
| HTTP | 401 sin sesión, 404 de motor inexistente, 400 al copiar la ficha del mismo motor, PUT que reemplaza la ficha |
| Totales | El total nunca suma las alternativas |
| PDF | Sin columna "Cant." en repuestos, sin códigos del proveedor, sin nombrar al proveedor, con la categoría, y el encabezado exacto ("Rectificaciones Chiappo" / "Rectificación de motores") |
| Revalidar | Recién creado no detecta cambios; sube un precio y la diferencia es exacta; con dos líneas cotizando la diferencia del grupo suma las dos; una baja cuenta como cambio pero **no** como suba (`hay_subas`, que es lo que decide el cartel rojo); el código fuera de catálogo conserva su precio y avisa; la mano de obra se informa pero NO se toca; al aplicar cambia el total, la fecha pasa a hoy, sobreviven notas/ajuste %/aprobado, y se genera **una** versión nueva de PDF; la segunda vez no acumula versiones |
| Duplicar | La copia se crea con otro cliente, mismo motor y mismo ajuste %, a precios de hoy, con su propio PDF, sin tocar el original |
| Borrar cliente | Con presupuestos da 409 (y dice cuántos) y el cliente sobrevive; sin presupuestos da 204 y desaparece; la contraparte de un presupuesto ajeno también queda bloqueada; id inexistente da 404 |
| Borrado | Vacía presupuestos y clientes, deja intactos motores, mano de obra, catálogo, favoritos y fichas |

## 2. UI — `ui_grupos.mjs`

195 verificaciones con navegador real, más capturas de pantalla en
`tests/capturas/`.

```bash
# Terminal 1 — backend contra una base descartable
cd webapp/backend
DATA_DIR=/tmp/rect-test APP_USERNAME=admin \
  APP_PASSWORD_HASH="$(/tmp/rect-venv/bin/python -c "from werkzeug.security import generate_password_hash as g; print(g('test123'))")" \
  SESSION_COOKIE_SECURE=0 /tmp/rect-venv/bin/python wsgi.py

# Terminal 2 — frontend
cd webapp/frontend && npm install && npm run dev

# Terminal 3 — la suite
cd webapp/frontend && npm install --no-save playwright-core   # solo la primera vez
DATA_DIR=/tmp/rect-test node tests/ui_grupos.mjs
```

El Chromium **ya está instalado** en el entorno remoto
(`/opt/pw-browsers/chromium`): no hay que correr `playwright install`. Si está en
otro lado, pasá `CHROMIUM_PATH`. La URL del frontend se puede cambiar con
`BASE_URL`.

La suite espera el usuario `admin` con contraseña `test123`, que es lo que
configuran las variables de arriba.

Qué cubre: login · agrupado automático al tildar dentro de una categoría ·
cantidad heredada por el grupo · las 6 medidas hermanas quedando marcadas en el
motor (sin entrar al presupuesto) · **precio unitario y subtotal editables**
(escribir uno recalcula el otro) · **caja de opcionales** en el paso Servicios y
en la Revisión, con la flechita del renglón y con arrastre de verdad (la fila se
agarra por la descripción: sobre el recuadro del precio el arrastre está apagado
a propósito, y soltar el mouse afuera se lo tiene que devolver) · sacar del
presupuesto un servicio opcional y volver a agregarlo **no** lo trae marcado ·
casilla "Opcional" en el pop-up de repuestos · aviso "¿cantidad correcta?" ·
**buscadores sin acentos y por palabras sueltas** (mano de obra y catálogo) ·
confirmación del presupuesto · detalle con "Repuestos por categoría" y el chip
"Cotiza" · marcar aprobado · pantalla de
pedido (agrupado por marca, fecha del catálogo, cotizado vs. diferencia, copiar
códigos) · **"Actualizar a precios de hoy"** (sin cambios avisa y no hace nada;
con cambios abre el resumen con las dos secciones, aplica, deja el PDF en Versión
2 y limpia el banner de avisos; la segunda vez no acumula versiones y, si solo
cambió la mano de obra, no ofrece aplicar; **si los precios BAJAN no aparece el
cartel rojo** y el resumen aclara que ninguno subió; al terminar el bloque el
catálogo y la lista de la Cámara quedan como estaban) · **duplicar** desde el listado y
desde el detalle (wizard cargado, saltea el motor, repuestos copiados, el
original queda intacto) · ficha de repuestos del motor y copiarla desde otro
motor · fecha de última carga y borrado de datos de prueba en Actualizar Excel ·
**pop-up de códigos del pedido** (se abre desde "Copiar códigos", copia de a uno,
contador "N de M copiados", el portapapeles queda con un solo código, copiar
todos y reiniciar marcas) · **repuestos del motor separados por grupos** (arrancan
cerrados, la flechita despliega uno solo, expandir/colapsar todo) · **eliminar
cliente** (tacho habilitado solo sin presupuestos, confirmación, desaparece de la
lista, y el aviso con la cantidad al intentarlo desde la ficha) · **cartel de
"Deshacer"** (al borrar un cliente la fila se va pero la base todavía lo tiene,
"Deshacer" lo devuelve, y cuando el cartel se apaga el borrado sale de verdad) ·
**grupos del pop-up "Ver repuestos"** (flechita por grupo, colapsar/expandir
todo, familias que no se parten al cambiar la opción cotizada, y deshacer al
quitar una medida o una familia entera) · **el círculo del motor** (marcar a mano
no cotiza y se guarda en el momento sin cantidad, poner cantidad lo llena solo,
sacar la cantidad de algo que ya era del motor lo deja marcado, destildar lo saca
y lo manda a la papelera) · **"Repuestos ya utilizados"** (lista los presupuestos
anteriores del motor, arrancan todos destildados, el botón se habilita al tildar
y lo elegido entra al presupuesto) · **el paso Repuestos arranca en cero** aunque
el motor tenga ficha cargada.

Las dos suites **arrancan limpiando el estado que ellas mismas generan**
(presupuestos, clientes, fichas de motor y la papelera de repuestos eliminados),
así que se pueden correr dos veces seguidas sobre el mismo `DATA_DIR` —y una
después de la otra— y dan el mismo resultado. Los datos importados (motores,
mano de obra, catálogo) no se tocan.

> La papelera se agregó a esa limpieza el 2026-08-19. Antes quedaba con lo que
> dejaba la corrida anterior, y el bloque 7 de la suite de backend —que cuenta
> exactamente cuántos códigos eliminados tiene el motor— fallaba al correrla
> después de la de UI, para volver a pasar en la corrida siguiente. Si alguna
> vez una suite falla una vez y pasa a la siguiente, sospechar de un estado que
> no se está limpiando, no de un test "flaky".

También falla si la página tira **cualquier error de JavaScript**, aunque la
verificación en sí pase.

---

## Detalles que cuestan de redescubrir

- **`text=` de Playwright matchea substrings.** Buscar `text=El más caro` también
  matchea el encabezado "Se cotiza el más caro de cada grupo". Para los chips hay
  que usar `getByText('...', { exact: true })`. Ojo: desde el 2026-08-12 la nota
  de la columna "Cotiza" dice exactamente lo mismo que el chip ("El más caro"),
  así que ese conteo da 1 tanto cuando cotiza el más caro como cuando se eligió
  otro a mano — lo que cambia es cuál fila lo lleva.
- **Las filas de una familia se identifican por `data-familia`** (el atributo que
  también dibuja la línea roja). El helper `familiaSinPartir()` verifica que las
  filas de una misma familia queden pegadas: es la regresión del bug de los aros.
- **El cartel de "Deshacer"** se busca por `[data-testid="cartel-deshacer"]`. Los
  borrados que no se pueden revertir (presupuesto, cliente, vaciar la papelera,
  borrar datos de prueba) no salen hasta que el cartel se apaga, unos 8 segundos
  después: si un check mira la base enseguida, todavía va a estar el dato.
- **El paso Cliente del wizard** solo pide clasificar (Mecánico / Dueño) cuando el
  cliente es nuevo. Si ya existe de una corrida anterior, ese botón no aparece —
  la suite lo contempla.
- **El catálogo de mano de obra del wizard no es una `<table>`**: son filas
  sueltas dentro de `.servicios-picker-grid`. Para elegir un servicio hay que ir
  por el botón `[title="Elegir cantidad"]`, no por `table tbody tr`.
- **La suite de UI toca la base por SQL** (helper `py()`) para simular que el
  proveedor actualizó su lista. Necesita el mismo `DATA_DIR` con el que se
  levantó el backend: `DATA_DIR=/tmp/rect-test node tests/ui_grupos.mjs`.
- **`config` del backend lee el entorno al importarse**, así que `APP_USERNAME` y
  `APP_PASSWORD_HASH` tienen que estar seteados antes de importar `app`.
