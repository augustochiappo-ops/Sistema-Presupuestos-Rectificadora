import os

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DATA_DIR = os.environ.get("DATA_DIR", os.path.join(_BACKEND_DIR, "data"))
DB_PATH = os.path.join(DATA_DIR, "presupuestos.db")
PDFS_DIR = os.path.join(DATA_DIR, "pdfs")

SECRET_KEY = os.environ.get("SECRET_KEY", "dev-only-change-me")

APP_USERNAME = os.environ.get("APP_USERNAME", "admin")
APP_PASSWORD_HASH = os.environ.get("APP_PASSWORD_HASH")  # generado con werkzeug.security.generate_password_hash

NOMBRE_TALLER = os.environ.get("NOMBRE_TALLER", "Rectificaciones Chicappo")
