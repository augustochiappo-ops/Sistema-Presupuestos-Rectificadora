import os

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DATA_DIR = os.environ.get("DATA_DIR", os.path.join(_BACKEND_DIR, "data"))
DB_PATH = os.path.join(DATA_DIR, "presupuestos.db")
PDFS_DIR = os.path.join(DATA_DIR, "pdfs")

SECRET_KEY = os.environ.get("SECRET_KEY", "dev-only-change-me")

APP_USERNAME = os.environ.get("APP_USERNAME", "admin")
APP_PASSWORD_HASH = os.environ.get("APP_PASSWORD_HASH")  # generado con werkzeug.security.generate_password_hash

# Duración de la sesión: se cuenta desde el momento del login y no se renueva
# con el uso, así cada jornada hay que volver a escribir la contraseña (y no se
# olvida). Configurable con SESSION_HORAS por si hace falta cambiarla.
SESSION_HORAS = int(os.environ.get("SESSION_HORAS", "8"))

NOMBRE_TALLER = os.environ.get("NOMBRE_TALLER", "Rectificaciones Chiappo")

# Deploy remoto: POST /api/deploy con header X-Deploy-Secret hace `git pull` +
# reload de la web app vía la API de PythonAnywhere, para poder actualizar el
# sistema sin entrar manualmente a la consola/dashboard.
REPO_DIR = os.path.dirname(os.path.dirname(_BACKEND_DIR))
DEPLOY_SECRET = os.environ.get("DEPLOY_SECRET")
PA_USERNAME = os.environ.get("PA_USERNAME")
PA_DOMAIN = os.environ.get("PA_DOMAIN")
PA_API_TOKEN = os.environ.get("PA_API_TOKEN")
