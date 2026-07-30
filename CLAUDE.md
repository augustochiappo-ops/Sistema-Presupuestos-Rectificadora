# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Memoria del proyecto

Los archivos de memoria están en `.claude/memory/`. **Leerlos al inicio de cada sesión.**

- [`.claude/memory/estado.md`](.claude/memory/estado.md) — qué está hecho, qué falta, próximo paso
- [`.claude/memory/decisiones.md`](.claude/memory/decisiones.md) — decisiones técnicas tomadas y su contexto

**Al cerrar cada sesión:** actualizar `estado.md` con lo que se completó y el próximo paso.

---

## Project overview

Sistema de Presupuestos para una **rectificadora de motores**. Permite generar presupuestos semiautomáticos seleccionando un motor, que el sistema calcule repuestos + mano de obra, y emita un PDF. Corre **100% local**, sin dependencia de servicios en la nube.

## Entorno de trabajo del usuario

- El usuario trabaja con **Claude Code en su versión web** (claude.ai/code), no en una compu con la consola instalada. **Todos los cambios de esta app se hacen sobre la versión web** (`webapp/backend` + `webapp/frontend`).
- La **versión de escritorio** (`main.py`, PyQt6, sección "Commands" abajo) está **en desuso**. No priorizar desarrollo ahí salvo pedido explícito del usuario.

## Flujo de trabajo de este proyecto (importante, seguirlo siempre)

Así se trabaja en este repo, a pedido explícito del usuario:

1. El usuario pide un cambio. Claude lo implementa, lo prueba localmente (levantando `webapp/backend` + `webapp/frontend` en dev, ver sección de abajo) y, si tocó el frontend, corre `npm run build` y commitea `static_build/` de nuevo.
2. Claude **commitea y pushea directo a `master`** — no se usan ramas nuevas ni PRs para este repo. `master` es la única rama y es la que sirve producción.
3. Producción (PythonAnywhere, `chiapppo.pythonanywhere.com`) no se actualiza sola: alguien tiene que correr el deploy. **El entorno de Claude Code en la nube no tiene salida de red hacia `chiapppo.pythonanywhere.com`** (403 de policy en el proxy de egress, confirmado — no es transitorio, no hay que reintentarlo). Por eso, al final de cada tanda de cambios, Claude le pasa al usuario el comando exacto para pegar en la **consola Bash de PythonAnywhere** (o donde corresponda) — típicamente el webhook de deploy:
   ```bash
   curl -X POST https://chiapppo.pythonanywhere.com/api/deploy -H "X-Deploy-Secret: <secreto>"
   ```
   Si hace falta algo más que el deploy (migración manual, revisar un log, etc.), Claude también da esos comandos listos para copiar/pegar, explicando qué hace cada uno.
4. El usuario corre el/los comando(s) y pega el resultado si algo falla, para poder diagnosticar sin acceso directo al servidor.

## Cómo levantar la app web (dev) y sacar capturas de pantalla

Para verificar visualmente un cambio en la versión web o generar una captura de pantalla de la app:

1. **Backend Flask**: parado en `webapp/backend`, corre en `http://127.0.0.1:5000`.
   ```bash
   cd webapp/backend
   pip install -r requirements.txt
   python wsgi.py   # o: flask --app wsgi run
   ```
   Necesita `APP_USERNAME`/`APP_PASSWORD_HASH` en el entorno para poder loguearse en dev (generar el hash con `werkzeug.security.generate_password_hash`).
2. **Frontend Vite (dev server)**: parado en `webapp/frontend`, corre en `http://localhost:5173` y proxea `/api` al backend Flask (ver `vite.config.js`).
   ```bash
   cd webapp/frontend
   npm install
   npm run dev
   ```
3. **Captura con browser headless**: con ambos servidores arriba, usar el Chromium headless preinstalado en el entorno remoto (Playwright, `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`) para navegar a `http://localhost:5173` y sacar el screenshot. No hace falta correr `playwright install`: el browser ya está listo (usar `playwright-core` + `executablePath` apuntando al Chromium ya instalado).
4. Para probar features reales conviene importar datos de FACRA (`Excel/Facra/*.xls`, endpoints `/api/excel/nomenclador` y `/api/excel/lista-orientadora`) en la base de datos local de prueba — la DB vive en `webapp/backend/data/` (gitignored), así que no contamina el repo ni la base real de producción.
5. Recordar matar los procesos de backend y frontend al terminar si quedaron corriendo en background.

## Ramas y producción

- **`master` es la única rama y sirve producción.** El deploy (PythonAnywhere) hace `git pull` sobre `master`. Todo cambio se pushea ahí directamente (ver "Flujo de trabajo" arriba).
- La rama `main` existió como espejo/respaldo pero **se eliminó** (remota y local) a pedido del usuario para no tener dos ramas iguales dando confusión. No recrearla salvo pedido explícito.
- Ver `.claude/memory/estado.md` para el historial completo de por qué existían dos ramas y cuándo se unificaron.

## Commands

```bash
# Instalar dependencias
pip install -r requirements.txt

# Ejecutar la app
python main.py

# Dependencias principales
# PyQt6        → UI de escritorio
# pandas       → lectura del Excel del proveedor
# reportlab    → generación de PDF
# SQLite3      → base de datos local (incluido en Python stdlib)
```

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
| `design:design-system` | Al definir la paleta visual, tipografía y componentes PyQt6 reutilizables |
| `design:ux-copy` | Al redactar textos de la interfaz: botones, labels, mensajes de error, tooltips |
| `design:accessibility-review` | Al revisar que la UI sea clara y usable |
| `design:design-critique` | Al evaluar decisiones de UI/UX antes de implementarlas |

## Architecture notes

- **Local-first**: toda la lógica y el almacenamiento son locales. Sin backend remoto.
- **Base de datos interna**: persiste las asociaciones motor → repuestos (códigos del proveedor). Se va enriqueciendo a medida que se usan presupuestos.
- **Actualización de precios**: el sistema debe poder reimportar la lista de la Cámara y el Excel del proveedor sin perder las asociaciones guardadas.
- **Stack**: Python + PyQt6 para la UI de escritorio. pandas para leer el Excel del proveedor. reportlab (o similar) para generar PDF. SQLite como base de datos local.
