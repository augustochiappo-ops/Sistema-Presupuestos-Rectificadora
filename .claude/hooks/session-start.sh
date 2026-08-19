#!/usr/bin/env bash
#
# Hook de arranque de sesión (Claude Code en la web).
#
# Prepara lo que tarda y no depende de nada que el dueño tenga que pasar:
# el venv de Python, node_modules, playwright-core y la base de prueba con los
# datos reales importados. Son ~6 minutos la primera vez sobre un contenedor
# nuevo, y hasta el 2026-08-19 se pagaban DENTRO de la sesión, mientras el dueño
# esperaba. Acá se pagan mientras él escribe el pedido.
#
# Lo que el hook NO hace es levantar los servidores: para eso hace falta la
# contraseña, que no vive en el repo. Eso queda a un comando:
#
#     export APP_PASSWORD="…" && tests/preparar.sh
#
# El estado del contenedor queda cacheado después del hook, así que la sesión
# siguiente encuentra todo hecho y el script no repite nada (es idempotente).
set -euo pipefail

# Solo en el entorno remoto: en una máquina propia el dueño maneja sus deps.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# DATA_DIR y VENV para toda la sesión, así las suites y el script coinciden sin
# que haya que acordarse de pasarlos en cada comando. Los dos viven dentro del
# repo y gitignoreados (ver .gitignore).
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  {
    echo "export DATA_DIR=\"${CLAUDE_PROJECT_DIR:-.}/.datos-dev\""
    echo "export VENV=\"${CLAUDE_PROJECT_DIR:-.}/.venv\""
  } >> "$CLAUDE_ENV_FILE"
fi

tests/preparar.sh --deps
