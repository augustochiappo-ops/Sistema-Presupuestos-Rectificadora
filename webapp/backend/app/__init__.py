import os
from datetime import timedelta

from flask import Flask

from . import config, db
from .auth import bp as auth_bp
from .routes.motores import bp as motores_bp
from .routes.servicios import bp as servicios_bp
from .routes.excel import bp as excel_bp
from .routes.clientes import bp as clientes_bp
from .routes.presupuestos import bp as presupuestos_bp
from .routes.repuestos import bp as repuestos_bp
from .routes.deploy import bp as deploy_bp
from .routes.backup import bp as backup_bp
from .routes.mantenimiento import bp as mantenimiento_bp
from .static_frontend import bp as static_bp


def create_app():
    app = Flask(__name__)
    app.config["SECRET_KEY"] = config.SECRET_KEY
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    # En dev (http://localhost) tiene que ser "0"; en PythonAnywhere (https) se pone en "1".
    app.config["SESSION_COOKIE_SECURE"] = os.environ.get("SESSION_COOKIE_SECURE", "0") == "1"
    # La sesión vence a las N horas del login (no se renueva con cada request:
    # SESSION_REFRESH_EACH_REQUEST=False), así el vencimiento es absoluto.
    app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(hours=config.SESSION_HORAS)
    app.config["SESSION_REFRESH_EACH_REQUEST"] = False
    # 100MB: de sobra para un .xls de FACRA y también para subir una copia de
    # seguridad completa (DB + todos los PDFs generados hasta la fecha).
    app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024

    os.makedirs(config.DATA_DIR, exist_ok=True)
    os.makedirs(config.PDFS_DIR, exist_ok=True)
    db.init_db()

    app.register_blueprint(auth_bp)
    app.register_blueprint(motores_bp)
    app.register_blueprint(servicios_bp)
    app.register_blueprint(excel_bp)
    app.register_blueprint(clientes_bp)
    app.register_blueprint(presupuestos_bp)
    app.register_blueprint(repuestos_bp)
    app.register_blueprint(deploy_bp)
    app.register_blueprint(backup_bp)
    app.register_blueprint(mantenimiento_bp)
    app.register_blueprint(static_bp)

    return app
