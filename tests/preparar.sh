#!/usr/bin/env bash
#
# Deja el entorno de desarrollo listo y andando: dependencias, base de prueba
# con los datos reales importados, backend Flask y frontend Vite.
#
# POR QUÉ EXISTE (2026-08-19). Levantar todo esto a mano al principio de cada
# sesión costaba entre 6 y 10 minutos, y peor: era la fuente de dos clases de
# error que tiraron a la basura corridas enteras de la suite de UI.
#
#   1. El backend levantado con una contraseña y la suite tecleando otra. Acá el
#      script es el DUEÑO DE LAS DOS PUNTAS: genera el hash que recibe el backend
#      y exporta la misma clave que va a teclear la suite. No pueden discrepar.
#   2. Matar los servidores con `pkill -f wsgi.py`, que también matchea la línea
#      de comandos del shell que corre el pkill y se mata a sí mismo. Acá se para
#      SIEMPRE por PID (ver --parar). Regla: nunca `pkill -f` en este repo.
#
# Uso:
#   tests/preparar.sh            deps + base + servidores, deja todo andando
#   tests/preparar.sh --deps     solo dependencias y base (es lo que corre el
#                                hook de arranque; no necesita la contraseña)
#   tests/preparar.sh --parar    baja los servidores, por PID
#   tests/preparar.sh --estado   dice qué hay levantado
#
# Variables:
#   APP_PASSWORD  contraseña del usuario de la app. OBLIGATORIA para levantar el
#                 backend. No vive en el repo —misma regla que el DEPLOY_SECRET—
#                 así que el dueño la pasa en cada sesión:
#                     export APP_PASSWORD="..."
#   APP_USERNAME  usuario (default: admin)
#   DATA_DIR      base descartable (default: .datos-dev/, gitignoreada). NUNCA
#                 apuntarla a webapp/backend/data ni a producción: las suites
#                 crean y borran datos.
#   VENV          entorno de Python (default: .venv/, gitignoreado)
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# El venv y la base de prueba viven DENTRO del repo (gitignoreados) y no en
# /tmp: lo que el hook de arranque prepara tiene que sobrevivir hasta la sesión,
# y lo único que con seguridad se conserva del contenedor es el workspace. Son
# justo las dos cosas caras — el pip install y los 30 s de importar el catálogo.
VENV="${VENV:-$RAIZ/.venv}"
DATA_DIR="${DATA_DIR:-$RAIZ/.datos-dev}"
USUARIO="${APP_USERNAME:-admin}"
CORRIDA="${CORRIDA:-/tmp/rect-corrida}"   # logs y PIDs: son de la corrida, no se conservan

BACKEND_URL="http://127.0.0.1:5000"
FRONTEND_URL="http://localhost:5173"

mkdir -p "$CORRIDA"

paso()  { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
ok()    { printf '  ✓ %s\n' "$*"; }
aviso() { printf '  ! %s\n' "$*"; }

# ---------------------------------------------------------------- parar/estado

vivo() { [ -f "$CORRIDA/$1.pid" ] && kill -0 "$(cat "$CORRIDA/$1.pid")" 2>/dev/null; }

parar_uno() {
  local nombre="$1" pid_file="$CORRIDA/$1.pid"
  [ -f "$pid_file" ] || return 0
  local pid; pid="$(cat "$pid_file")"
  if kill -0 "$pid" 2>/dev/null; then
    # Se mata el GRUPO entero (setsid le dio uno propio): npm run dev deja un
    # hijo vite que sobreviviría a matar solo al padre.
    kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
    ok "$nombre parado (pid $pid)"
  fi
  rm -f "$pid_file"
}

parar_todo() {
  paso "Parando los servidores"
  parar_uno backend
  parar_uno frontend
}

estado() {
  vivo backend  && ok "backend andando  ($BACKEND_URL)"  || aviso "backend parado"
  vivo frontend && ok "frontend andando ($FRONTEND_URL)" || aviso "frontend parado"
  [ -f "$DATA_DIR/presupuestos.db" ] && ok "base en $DATA_DIR" || aviso "no hay base en $DATA_DIR"
}

case "${1:-}" in
  --parar)  parar_todo; exit 0 ;;
  --estado) estado; exit 0 ;;
esac

SOLO_DEPS=0
[ "${1:-}" = "--deps" ] && SOLO_DEPS=1

# ------------------------------------------------------------------- 1. Python

paso "Dependencias de Python"
if [ ! -x "$VENV/bin/python" ]; then
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q --upgrade pip
  # pypdf lo necesita la suite de backend para leer el PDF generado.
  "$VENV/bin/pip" install -q -r "$RAIZ/webapp/backend/requirements.txt" pypdf
  ok "venv creado en $VENV"
else
  ok "venv ya estaba en $VENV"
fi

# -------------------------------------------------------------------- 2. Node

paso "Dependencias de Node"
cd "$RAIZ/webapp/frontend"
if [ ! -d node_modules/vite ]; then
  npm install --silent
  ok "node_modules instalado"
else
  ok "node_modules ya estaba"
fi
# playwright-core no está en package.json a propósito (solo lo usa la suite de
# UI, no la app). El Chromium ya viene en el entorno remoto, así que NO hay que
# correr playwright install.
if [ ! -d node_modules/playwright-core ]; then
  npm install --silent --no-save playwright-core
  ok "playwright-core instalado"
else
  ok "playwright-core ya estaba"
fi
cd "$RAIZ"

# --------------------------------------------------------- 3. Base descartable

paso "Base de prueba en $DATA_DIR"
case "$DATA_DIR" in
  *webapp/backend/data*)
    echo "  ✗ DATA_DIR apunta a la base real. Elegí una carpeta descartable." >&2
    exit 1 ;;
esac
mkdir -p "$DATA_DIR"
DATA_DIR="$DATA_DIR" RAIZ="$RAIZ" "$VENV/bin/python" - <<'PY'
# Importa los datos reales del repo la primera vez (~30 s por las 64.250 filas
# del catálogo). Las veces siguientes no hace nada: es lo que hace que preparar
# el entorno sea instantáneo a partir de la segunda vez.
import os, sys
RAIZ = os.environ["RAIZ"]
sys.path.insert(0, os.path.join(RAIZ, "webapp", "backend"))
os.environ.setdefault("APP_PASSWORD_HASH", "x")  # config lo lee al importarse
from app import db, facra, crac

EXCEL = os.path.join(RAIZ, "Excel", "Facra")
CRAC = os.path.join(RAIZ, "CRAC")
db.init_db()
if not facra.get_motores():
    print("    importando FACRA…", flush=True)
    facra.importar_nomenclador(os.path.join(EXCEL, "nomenclador_1779985703.xls"))
    facra.importar_lista_orientadora(
        os.path.join(EXCEL, "lista_orientadora_de_mano_de_obra_1779985697.xls"))
if crac.get_info_catalogo()["total"] == 0:
    print("    importando el catálogo del proveedor (~30 s)…", flush=True)
    crac.importar_prefijos(os.path.join(CRAC, "prefijos_crac.csv"))
    crac.importar_precio_stock(os.path.join(CRAC, "precio-stock.csv"))
print(f"    {len(facra.get_motores())} motores · "
      f"{crac.get_info_catalogo()['total']} repuestos")
PY
ok "base lista"

if [ "$SOLO_DEPS" = "1" ]; then
  paso "Listo (--deps): falta levantar los servidores"
  echo "  Corré: export APP_PASSWORD=\"…\" && tests/preparar.sh"
  exit 0
fi

# --------------------------------------------------------------- 4. Servidores

if [ -z "${APP_PASSWORD:-}" ]; then
  cat >&2 <<'MSG'

  ✗ Falta APP_PASSWORD.

    Es la contraseña con la que se entra a la app. No vive en el repo (misma
    regla que el DEPLOY_SECRET: no se commitea ni se guarda de una sesión a
    otra), así que el dueño la pasa al empezar:

        export APP_PASSWORD="…"
        tests/preparar.sh

    Con eso el backend queda levantado con esa clave Y la suite de UI teclea
    esa misma clave, que es justo lo que evita el desajuste.

MSG
  exit 1
fi

parar_todo >/dev/null 2>&1 || true

# Lanza un servidor en su propia sesión (para poder matarle el grupo entero) y
# deja el PID del líder en un archivo. El PID se escribe DESDE ADENTRO: `$!`
# después de `setsid` devuelve el envoltorio, que muere enseguida, y quedaría un
# pid file apuntando a nada.
lanzar() {
  local nombre="$1"; shift
  setsid bash -c 'echo $$ > "$1"; shift; exec "$@"' _ "$CORRIDA/$nombre.pid" "$@" \
    > "$CORRIDA/$nombre.log" 2>&1 < /dev/null &
  sleep 1   # que alcance a escribir el pid file
}

paso "Levantando el backend"
# La clave viaja por el entorno, no interpolada en la línea de comandos: una
# comilla o una barra en la contraseña romperían el comando.
HASH="$(CLAVE="$APP_PASSWORD" "$VENV/bin/python" -c \
  "import os; from werkzeug.security import generate_password_hash as g; print(g(os.environ['CLAVE']))")"
cd "$RAIZ/webapp/backend"
lanzar backend env "DATA_DIR=$DATA_DIR" "APP_USERNAME=$USUARIO" \
  "APP_PASSWORD_HASH=$HASH" SESSION_COOKIE_SECURE=0 "$VENV/bin/python" wsgi.py
cd "$RAIZ"

paso "Levantando el frontend"
cd "$RAIZ/webapp/frontend"
lanzar frontend npm run dev
cd "$RAIZ"

esperar_url() {
  local url="$1" nombre="$2" i
  for i in $(seq 1 60); do
    if curl -s -o /dev/null --max-time 2 "$url"; then ok "$nombre responde"; return 0; fi
    sleep 1
  done
  echo "  ✗ $nombre no respondió en 60 s — mirá $CORRIDA/${nombre}.log" >&2
  return 1
}

paso "Esperando a que respondan"
esperar_url "$BACKEND_URL/api/auth/session" backend
esperar_url "$FRONTEND_URL" frontend

# Prueba de fuego: que el login ANDE con la clave que se acaba de configurar. Si
# esto falla, la suite de UI iba a morir en el login — mejor enterarse ahora.
paso "Probando el login"
# El cuerpo lo arma Python: una comilla en la contraseña haría un JSON inválido
# y el login "fallaría" por un motivo que no tiene nada que ver con la clave.
CUERPO="$(CLAVE="$APP_PASSWORD" USUARIO="$USUARIO" "$VENV/bin/python" -c \
  "import json, os; print(json.dumps({'usuario': os.environ['USUARIO'], 'password': os.environ['CLAVE']}))")"
CODIGO="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BACKEND_URL/api/auth/login" \
  -H 'Content-Type: application/json' --data-binary "$CUERPO")"
if [ "$CODIGO" != "200" ]; then
  echo "  ✗ el login devolvió $CODIGO con el usuario '$USUARIO'" >&2
  exit 1
fi
ok "login OK con el usuario '$USUARIO'"

# Un archivo para hacerle `source` desde cualquier comando posterior. Un proceso
# hijo no le puede exportar variables al shell que lo llamó, y en Claude Code
# cada comando corre en un shell nuevo: sin esto habría que repetir la clave y
# el DATA_DIR en cada línea, que es justo cómo se cuelan los desajustes.
# %q escapa para el shell: una comilla en la contraseña rompería el archivo.
{
  printf 'export DATA_DIR=%q\n' "$DATA_DIR"
  printf 'export APP_USERNAME=%q\n' "$USUARIO"
  printf 'export APP_PASSWORD=%q\n' "$APP_PASSWORD"
  printf 'export VENV=%q\n' "$VENV"
} > "$CORRIDA/entorno.sh"
chmod 600 "$CORRIDA/entorno.sh"

cat <<MSG

  Todo listo.

    frontend   $FRONTEND_URL
    backend    $BACKEND_URL
    base       $DATA_DIR
    logs       $CORRIDA/{backend,frontend}.log

  Las suites (ver tests/README.md) — el source deja DATA_DIR y la clave puestas:

    source $CORRIDA/entorno.sh
    \$VENV/bin/python tests/backend_grupos.py
    node tests/ui_grupos.mjs

  Para bajar todo:  tests/preparar.sh --parar

MSG
