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
   qué cubre.)
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

### Una sola contraseña en todo el proyecto

`APP_PASSWORD` (usuario `APP_USERNAME`, default `admin`) la usan las tres cosas:
con ella `preparar.sh` genera el hash del backend, con ella entra la suite de UI
y con ella entra la de backend. **No vive en el repo** —misma regla que el
`DEPLOY_SECRET`— así que el dueño la pasa al empezar la sesión; si falta, las
suites lo dicen al arrancar en vez de morir en el login siete minutos después.
Tener dos contraseñas dando vueltas ya costó dos corridas.

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
- **Buscador de repuestos**: ícono de lupa en cada ítem (ej. "válvulas") que abre una interfaz de búsqueda dentro del catálogo del proveedor. El código elegido queda guardado asociado al motor para próximos presupuestos.
- **Edición post-creación**: los presupuestos se pueden modificar después de generados.
- **Historial de clientes**: cada presupuesto queda vinculado a un cliente (nombre + motor + fecha).
- **Generación de PDF**: presupuesto formal con nombre del cliente, motor, fecha y leyenda de validez de 1 semana.

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
