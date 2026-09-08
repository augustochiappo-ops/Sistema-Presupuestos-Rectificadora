#!/usr/bin/env bash
#
# El chequeo de cada cambio: las tres suites de backend y el test de humo.
# Tarda unos DOS MINUTOS Y MEDIO.
#
#   tests/rapido.sh              todo (backend + humo)
#   tests/rapido.sh --backend    solo las de backend, 3 segundos
#
# POR QUÉ EXISTE (2026-09-08). Las tres suites de UI son 380 checks y unos
# VEINTE MINUTOS. Correrlas después de cada cambio chico es el mayor desperdicio
# de tiempo del proyecto, y no correrlas nunca es peor. Así que el trabajo quedó
# partido en dos carriles:
#
#   * ESTE, en cada cambio. Las tres de backend tardan UN SEGUNDO cada una y
#     cubren los datos, los cálculos y los endpoints; el humo tarda dos minutos
#     y cubre que ninguna pantalla se cayó y que ninguna tabla quedó cortada.
#   * LAS TRES DE UI ENTERAS, los miércoles y los viernes a las 7 de la mañana,
#     en una Routine que corre sola sobre `master` (ver tests/README.md).
#
# LO QUE ESTE SCRIPT NO HACE, dicho claro: no reemplaza a las suites de UI. Si
# el cambio toca lo que una de ellas cubre —el agrupado de repuestos, los
# precios, un filtro de la búsqueda por medidas— esa suite se corre igual antes
# de pushear. Lo que el corte de dos carriles ahorra es correr las TRES por un
# cambio que toca UNA, no correr la que corresponde.
#
# El entorno lo prepara `tests/preparar.sh`, que es el dueño de la contraseña.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="${VENV:-$RAIZ/.venv}"
SOLO_BACKEND=false
[[ "${1:-}" == "--backend" ]] && SOLO_BACKEND=true

if [[ -z "${APP_PASSWORD:-}" ]]; then
  echo "Falta APP_PASSWORD. Levantá el entorno con:" >&2
  echo '  export APP_PASSWORD="…" && tests/preparar.sh' >&2
  echo "y después:  source /tmp/rect-corrida/entorno.sh" >&2
  exit 1
fi

cd "$RAIZ"
fallaron=()
inicio=$SECONDS

for suite in backend_medidas backend_grupos backend_precios; do
  printf '\n\033[1m▶ %s\033[0m\n' "$suite"
  if "$VENV/bin/python" "tests/$suite.py" | tail -2; then
    :
  else
    fallaron+=("$suite")
  fi
done

if [[ "$SOLO_BACKEND" == false ]]; then
  printf '\n\033[1m▶ humo (la app, con Chromium)\033[0m\n'
  node tests/humo.mjs | tail -3 || fallaron+=("humo")
fi

printf '\n%s\n' "=================================================="
if ((${#fallaron[@]})); then
  printf 'FALLARON: %s   (%s s)\n' "${fallaron[*]}" "$((SECONDS - inicio))"
  exit 1
fi
printf 'TODO OK   (%s s)\n' "$((SECONDS - inicio))"
