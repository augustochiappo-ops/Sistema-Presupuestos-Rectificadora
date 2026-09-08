# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Memoria del proyecto

Los archivos de memoria están en `.claude/memory/`. **Leerlos al inicio de cada sesión.**

- [`.claude/memory/estado.md`](.claude/memory/estado.md) — qué está hecho, qué falta, próximo paso
- [`.claude/memory/decisiones.md`](.claude/memory/decisiones.md) — decisiones técnicas tomadas y su contexto

### Cierre de sesión (seguir estos cuatro pasos)

1. **Actualizar la memoria**: `estado.md` con lo que se completó, lo que se verificó y el próximo paso; `decisiones.md` si en la sesión se tomó alguna decisión técnica o de diseño que convenga poder releer más adelante.
2. **El cierre se commitea y pushea directo a `master`, nunca en una rama nueva.** Es la misma regla que rige todo el trabajo de este repo (ver "Flujo de trabajo", punto 2), pero acá va dicha aparte porque el cierre es donde más tienta abrir una rama "solo para dejar el registro" — y después hay que acordarse de mergearla. `master` es donde vive el código de producción: el cierre se escribe ahí y listo, sin merges pendientes.
3. **Mergear lo que haya quedado suelto.** Antes de cerrar, mirar `git ls-remote --heads origin` y `git branch -a`: si hay alguna rama con trabajo que no está en `master` (de otra sesión, o creada por el entorno de la tarea), **mergearla a `master` en este mismo cierre** y borrarla. Si sus commits ya son ancestros de `master`, no hay nada que mergear: se borra nomás (`git branch -d` avisa solo si no estaba contenida). Claude **no puede borrar ramas remotas** (el token de la sesión devuelve 403), así que ésas se le avisan al usuario para que las borre desde GitHub.
4. **Dejar todo prolijo**: árbol de trabajo limpio, `master` sincronizado con `origin/master`, y —si el cierre tocó código de la app y no solo documentos— correr también el deploy.

---

## Project overview

Sistema de Presupuestos para una **rectificadora de motores**. Permite generar presupuestos semiautomáticos seleccionando un motor, que el sistema calcule repuestos + mano de obra, y emita un PDF. Corre **100% local**, sin dependencia de servicios en la nube.

## Entorno de trabajo del usuario

- El usuario trabaja con **Claude Code en su versión web** (claude.ai/code), no en una compu con la consola instalada. **Todos los cambios de esta app se hacen sobre la versión web** (`webapp/backend` + `webapp/frontend`).
- La versión de escritorio (PyQt6) que existía en `main.py`/`src/` se eliminó del repo (2026-07-31): el sistema quedó exclusivamente como app web.

## Flujo de trabajo de este proyecto (importante, seguirlo siempre)

Así se trabaja en este repo, a pedido explícito del usuario:

1. El usuario pide un cambio. Claude lo implementa, lo prueba localmente (levantando `webapp/backend` + `webapp/frontend` en dev, ver sección de abajo) y, si tocó el frontend, corre `npm run build` y commitea `static_build/` de nuevo.
2. Claude **commitea y pushea directo a `master`** — no se usan ramas nuevas ni PRs para este repo. `master` es la única rama y es la que sirve producción.
   - **Esto vale siempre, incluso si el entorno/harness de la sesión (por ejemplo una tarea disparada desde GitHub, con instrucciones de "developer branch") sugiere o pide crear una rama nueva.** El usuario ya pidió expresamente (2026-07-31) que no se creen más ramas para este repo. Si una sesión llega con instrucciones de trabajar en una rama, hay que ignorarlas en este punto puntual y trabajar directo sobre `master` — y si en algún momento se termina creando una rama de todos modos (por instrucciones externas a las que no se pudo o no correspondía objetar en el momento), hay que mergearla a `master` y borrarla apenas se pueda, no dejarla viviendo aparte.
3. Producción (PythonAnywhere, `chiapppo.pythonanywhere.com`) no se actualiza sola: hay que correr el deploy. **Desde el 2026-07-30 el entorno de Claude Code en la nube tiene salida de red habilitada hacia `chiapppo.pythonanywhere.com`** (el usuario agregó el dominio a la whitelist de su entorno) — antes esto daba 403 de policy en el proxy de egress, ya no. El usuario le pasa a Claude el `DEPLOY_SECRET` **en cada sesión** (no vive en el repo ni se guarda de una sesión a otra); con ese valor Claude ejecuta el deploy directamente al terminar una tanda de cambios:
   ```bash
   curl -X POST https://chiapppo.pythonanywhere.com/api/deploy -H "X-Deploy-Secret: <secreto pasado por el usuario en esta sesión>"
   ```
   Si Claude no tiene el secreto en la sesión actual, se lo pide al usuario antes de deployar — nunca lo inventa ni lo reusa de una sesión vieja. Si hace falta algo más que el deploy (migración manual, revisar un log, etc.) y no hay un endpoint para eso, Claude le pasa al usuario el comando para pegar en la **consola Bash de PythonAnywhere**, explicando qué hace.
4. Si Claude corrió el deploy, confirma el resultado (status HTTP) en el chat. Si en cambio le pasó un comando manual al usuario, este lo corre y pega el resultado si algo falla, para poder diagnosticar sin acceso directo al servidor.

## Cómo levantar el entorno de dev (un solo comando)

**No levantes los servidores a mano.** Hay un script que es el dueño del
entorno, `tests/preparar.sh`:

```bash
export APP_PASSWORD="…"     # la que pasa el dueño en cada sesión
tests/preparar.sh           # deps + base con datos reales + backend + frontend
```

Deja el backend en `http://127.0.0.1:5000` y el frontend en
`http://localhost:5173`, espera a que los dos respondan y **prueba el login**
antes de devolver el control. Después:

```bash
source /tmp/rect-corrida/entorno.sh   # deja DATA_DIR y la clave puestas
tests/preparar.sh --estado            # qué hay levantado
tests/preparar.sh --parar             # bajar todo (por PID)
```

Las dependencias pesadas (venv, `node_modules`, `playwright-core`, importar los
datos reales) las prepara solo el **hook de arranque**
(`.claude/hooks/session-start.sh`), antes de que empiece la sesión, así que a
partir de la segunda vez `preparar.sh` tarda segundos.

Para capturas de pantalla: con los dos servidores arriba, Chromium headless ya
está instalado en el entorno remoto (`/opt/pw-browsers/chromium`) —
`playwright-core` + `executablePath`, **nunca** `playwright install`.

### Los dos carriles de verificación (2026-09-08)

Las siete suites enteras son **veinte minutos**, casi todos de las tres de UI.
Correrlas después de cada cambio chico era el mayor desperdicio de tiempo del
proyecto. Ahora:

```bash
tests/rapido.sh              # en CADA cambio: backend + humo · 2 min 30 s
tests/rapido.sh --backend    # si el cambio no toca el frontend · 4 segundos
```

Y las **tres de UI enteras corren solas los miércoles y viernes a las 7:00** de
la mañana, en una Routine que trabaja sobre `master`: si algo falla, lo arregla,
vuelve a correr la suite y pushea.

**El límite, que no se negocia:** que `rapido.sh` pase no quiere decir que el
cambio esté bien, quiere decir que la app no se cayó. **Si el cambio toca lo que
una suite de UI cubre —el agrupado de repuestos, los precios, un filtro de la
búsqueda por medidas— esa suite se corre igual antes de pushear.** Los dos
carriles ahorran correr las TRES por un cambio que toca UNA; no ahorran correr
la que corresponde. Y una tanda grande —un catálogo nuevo, una familia nueva—
sigue terminando con las tres, como hasta ahora.

### Cinco reglas que se ganaron a los golpes

Las cinco salieron de sesiones que tardaron el doble de lo que debían (50 y 60
minutos, 2026-08-19). Ninguna sacrifica cobertura: lo que atacan es desperdicio.

1. **Nunca esperar bloqueado.** Lo que tarde —la suite de UI son ~7 minutos— va
   en segundo plano, y mientras tanto se sigue: commitear, escribir la memoria,
   preparar el deploy. Un `until … sleep` esperando en primer plano es tiempo
   del dueño tirado a la basura; ya se comió 10 minutos de una sesión.
2. **La suite de UI se corre entera, UNA vez, al final**, con todos los arreglos
   ya hechos. No una vez por arreglo. (Ver `decisiones.md`: entera siempre, sin
   filtros ni recortes de esperas — lo que se optimiza es cuándo se corre, no
   qué cubre.) Desde el 2026-09-08 "al final" puede ser el miércoles o el
   viernes: ver "Los dos carriles de verificación", arriba.
3. **Un check nuevo se prueba primero con un script chico** (un `.mjs` de veinte
   líneas en el scratchpad que abra Chromium y verifique solo eso: ~1 minuto).
   Meter un check sin probar y descubrir a los 7 minutos que estaba mal escrito
   el check —no la app— ya pasó y cuesta una corrida entera.
4. **Nunca `pkill -f`.** `pkill -f wsgi.py` también matchea la línea de comandos
   del shell que corre el pkill: se mata a sí mismo, el servidor no vuelve, y la
   corrida siguiente muere sin explicación. Se para con `tests/preparar.sh
   --parar`, que mata por PID.
5. **Mientras corre una suite no se toca el entorno.** Nada de reiniciar
   servidores, cambiar `DATA_DIR` ni correr `preparar.sh` — la suite trabaja
   contra esa base y se queda sin datos a mitad de camino. Pasó el 2026-08-19,
   con la suite ya lanzada: se perdieron los 7 minutos completos. Si hay que
   tocar el entorno, primero se espera a que termine.
   **`git` también es tocar el entorno**: un `checkout`, un `merge` o un
   `rebase` cambian los archivos que el servidor de Vite está sirviendo. El
   2026-09-08 un checkout borró por unos segundos los PNG que la suite estaba
   verificando y el fallo que salió no era el real. Commitear sí se puede —no
   toca el árbol de trabajo—; cambiar de rama, no.

### Una sola contraseña en todo el proyecto

`APP_PASSWORD` (usuario `APP_USERNAME`, default `admin`) la usan las tres cosas:
con ella `preparar.sh` genera el hash del backend, con ella entra la suite de UI
y con ella entra la de backend. **No vive en el repo** —misma regla que el
`DEPLOY_SECRET`— así que el dueño la pasa al empezar la sesión; si falta, las
suites lo dicen al arrancar en vez de morir en el login siete minutos después.
Tener dos contraseñas dando vueltas ya costó dos corridas.

### Dos cuentas, dos roles (2026-09-08)

El sistema tiene **dos cuentas**, y el usuario con que se entra decide el rol:

| Cuenta | Variables | Qué ve |
|---|---|---|
| **Oficina** | `APP_USERNAME` (default `admin`) + `APP_PASSWORD_HASH` | todo el sistema, como siempre |
| **Taller** | `TALLER_USERNAME` (default `taller`) + `TALLER_PASSWORD_HASH` | sólo el panel de trabajos, sin un solo precio |

**El corte está en el backend, no en la interfaz.** `create_app` tiene un
`before_request` de lista blanca: con rol `taller`, lo único que se responde de
`/api` es `/api/auth` y `/api/taller`; todo lo demás da 403, **incluido lo que se
agregue en el futuro**. Esconder los precios en el frontend no habría servido de
nada: bastaba con abrir `/api/presupuestos` en otra pestaña.

Si `TALLER_PASSWORD_HASH` no está configurado, la cuenta del taller no existe y
el sistema funciona exactamente como antes. En dev, `preparar.sh` le da al taller
**la misma contraseña** que a la oficina (una sola contraseña dando vueltas, ver
arriba) y cambia sólo el usuario; en producción son dos contraseñas distintas que
pone el dueño.

## Cuando el dueño pide "caveman"

Quiere decir **este flujo de trabajo completo**, no sólo el tono de los
mensajes. Salió de la sesión del 2026-09-07, donde la anterior se había comido
el 36% de la ventana de contexto y la mayor parte no era prosa: eran salidas
enormes volcadas al contexto.

**1. Prender la skill `caveman` en nivel `full`** (`Skill(caveman, "full")`), y
dejarla prendida toda la sesión. Compacta los mensajes del chat: sin relleno,
sin narrar cada llamada a herramienta, sin tablas decorativas, sin volcar logs
crudos. La skill se apaga sola donde comprimir sería peligroso (advertencias,
acciones irreversibles, secuencias de pasos donde el orden importa) y **no toca
nada que quede escrito fuera del chat**: commits, documentos del repo, memoria y
comentarios de código van en prosa normal, que es como los lee el dueño después.

**2. Nunca traer al contexto lo que se puede filtrar antes.** Es acá donde está
el ahorro grande, no en el tono. Las cuatro que más rindieron:

* `estado.md` pesa 200 KB. Se ubica la sección con `grep -n` y se leen las
  líneas que hacen falta, nunca el archivo entero.
* Los logs de los scripts de extracción son miles de líneas de warnings de
  fuentes. Se miran siempre con `grep -v` filtrando el ruido.
* Un diff de 25.000 líneas de JSON **se cuenta, no se lee**: `git diff -U0 |
  grep -vc` para separar las líneas de texto de las de medidas.
* Para mirar los datos, un script de Python que imprima tres números —no traer
  las fichas al chat.

**3. No usar subagentes.** Cada uno arranca en frío y vuelve a derivar el
contexto que acá ya está: para este repo sale más caro que hacer el trabajo
directo.

**4. La confiabilidad no se negocia por tokens.** El nivel `ultra` de la skill
no se usa acá: con medidas, códigos y conteos conviene el margen de claridad de
`full`. Y comprimir mensajes no cambia en nada lo que hay que verificar — las
suites se corren enteras igual, y el resultado se informa con el número exacto.

## Ramas y producción

- **`master` es la única rama y sirve producción.** El deploy (PythonAnywhere) hace `git pull` sobre `master`. Todo cambio se pushea ahí directamente (ver "Flujo de trabajo" arriba).
- La rama `main` existió como espejo/respaldo pero **se eliminó** (remota y local) a pedido del usuario para no tener dos ramas iguales dando confusión. No recrearla salvo pedido explícito.
- Ver `.claude/memory/estado.md` para el historial completo de por qué existían dos ramas y cuándo se unificaron.

## Domain concepts

| Término | Descripción |
|---|---|
| Rectificadora | Taller de rectificación de motores (engine reconditioning shop) |
| Cámara de Rectificadores | Entidad gremial que publica la lista oficial de precios de mano de obra y los motores soportados. Actualización semanal o quincenal. |
| Proveedor | Empresa que envía **diariamente** un archivo Excel con precios de repuestos |
| Motor | Unidad central del presupuesto; se selecciona de la lista de la Cámara |
| Repuesto | Pieza asociada a un motor; tiene un código del proveedor y un precio del Excel diario |
| Asociación motor–repuesto | Vínculo guardado en la base de datos interna: una vez que se asigna un código de repuesto a un motor, queda guardado para futuros presupuestos |

## Data sources (external)

1. **Lista de la Cámara de Rectificadores** — fuente de: lista de motores disponibles + precios de mano de obra por operación. Se importa/actualiza periódicamente.
2. **Excel del Proveedor** — fuente de: precios actuales de repuestos (se reemplaza diariamente). El sistema lee este archivo para obtener el precio al momento de armar el presupuesto.

## Core features (full vision)

- **Selección de motor**: desplegable/buscador con todos los motores de la Cámara.
- **Cálculo automático**: al elegir el motor se consultan la lista de la Cámara (mano de obra) y el Excel del proveedor (repuestos asociados al motor).
- **Panel del taller**: la cuenta del taller entra al mismo sistema y ve un
  tablero con los motores aprobados, en cuatro columnas: *Para hacer → En proceso
  → Terminado → Entregado*. Los estados los mueven los dos roles. Cada motor abre
  su **orden de trabajo**: qué hay que hacerle, qué repuestos se pidieron (con
  código, marca y medida) y las notas — nunca un precio. La orden se puede
  imprimir en PDF para dejarla con el motor. La oficina agrega, sobre lo mismo,
  la marca de *urgente* y la *fecha de entrega prometida*.
- **Búsqueda por medidas**: sección propia del menú lateral que encuentra una pieza por sus medidas (Ø, largo, alto…) con tolerancia, cuando no se sabe el código. Los catálogos técnicos (camisas, válvulas, guías, asientos, subconjuntos, conjuntos, pistones, cojinetes de biela, cojinetes de bancada y bujes de biela) viven en `CRAC/tecnicos/*.json`; el precio y el stock salen del catálogo del proveedor ya importado. Cómo se leyó cada catálogo del fabricante está documentado al lado de los datos: `CRAC/tecnicos/CARGA-CONJUNTOS.md` y `CRAC/tecnicos/CARGA-COJINETES.md`.
- **Buscador de repuestos**: ícono de lupa en cada ítem (ej. "válvulas") que abre una interfaz de búsqueda dentro del catálogo del proveedor. El código elegido queda guardado asociado al motor para próximos presupuestos.
- **Edición post-creación**: los presupuestos se pueden modificar después de generados.
- **Historial de clientes**: cada presupuesto queda vinculado a un cliente (nombre + motor + fecha).
- **Generación de PDF**: presupuesto formal con nombre del cliente, motor, fecha y leyenda de validez de 1 semana.

### Qué fichas entran al buscador por medidas (regla del dueño, 2026-09-08)

Antes de cargar un catálogo hay que saber de qué grupo es la familia. Son dos, y
el criterio no es el mismo:

| Grupo | Familias | Qué entra |
|---|---|---|
| **Catálogo completo** | camisas, guías, asientos, bujes de biela | Todo lo que trae el catálogo del fabricante, **lo trabaje o no el proveedor** |
| **Sólo proveedor** | válvulas, pistones, subconjuntos, conjuntos, cojinetes de biela / bancada / axiales, pernos | **Sólo** la ficha que tiene renglón en la lista del proveedor |

El motivo de que la línea caiga ahí: las cuatro del primer grupo son las que el
taller necesita **identificar** por sus medidas cuando no sabe el código, y eso
sirve igual si después la pieza se consigue por otro lado. En las demás, una
ficha sin código es una ficha que no se puede pedir.

**Rige de acá en adelante.** Los 92 subconjuntos sin proveedor que ya estaban
cargados se dejan (ver `decisiones.md`); lo que cambia es la próxima tanda.

En el código la regla se ve en un solo lugar: `filtro_proveedor` —la casilla
"Solo las que tiene el proveedor"— la llevan **las cuatro del catálogo completo y
nadie más**. Está en `ESPEC`, en `webapp/backend/app/tecnicos.py`, con el detalle
escrito ahí mismo; el frontend sólo la lee. Al agregar una familia nueva, decidir
el grupo primero.

## Skills disponibles para el desarrollo

Estas skills deben usarse **proactivamente** cuando la tarea corresponda a su especialidad. No esperar a que el usuario las pida.

| Skill | Cuándo usarla |
|---|---|
| `engineering:architecture` | Al diseñar la estructura general del sistema o de un módulo nuevo |
| `engineering:system-design` | Al diseñar componentes específicos (base de datos, importación de Excel, generación de PDF) |
| `engineering:code-review` | Al revisar código antes de darlo por terminado |
| `engineering:testing-strategy` | Al definir cómo testear un módulo o feature |
| `engineering:tech-debt` | Al detectar problemas de diseño o deuda técnica acumulada |
| `engineering:debug` | Al diagnosticar errores difíciles de rastrear |
| `engineering:deploy-checklist` | Al preparar una versión para entregar al usuario final |
| `design:design-system` | Al definir la paleta visual, tipografía y componentes reutilizables del frontend |
| `design:ux-copy` | Al redactar textos de la interfaz: botones, labels, mensajes de error, tooltips |
| `design:accessibility-review` | Al revisar que la UI sea clara y usable |
| `design:design-critique` | Al evaluar decisiones de UI/UX antes de implementarlas |

## Architecture notes

- **Local-first**: toda la lógica y el almacenamiento son locales. Corre en PythonAnywhere, sin dependencia de servicios en la nube de terceros.
- **Base de datos interna**: persiste las asociaciones motor → repuestos (códigos del proveedor). Se va enriqueciendo a medida que se usan presupuestos.
- **Actualización de precios**: el sistema debe poder reimportar la lista de la Cámara y el Excel del proveedor sin perder las asociaciones guardadas.
- **Stack**: Flask (backend) + React/Vite (frontend) en `webapp/`. pandas para leer el Excel del proveedor. reportlab (o similar) para generar PDF. SQLite como base de datos local.
