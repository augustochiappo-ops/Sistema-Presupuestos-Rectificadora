import os
from datetime import timedelta

from flask import Flask, jsonify, request

from . import config, db
from .auth import ROL_TALLER, bp as auth_bp, rol_actual
from .routes.motores import bp as motores_bp
from .routes.servicios import bp as servicios_bp
from .routes.excel import bp as excel_bp
from .routes.clientes import bp as clientes_bp
from .routes.presupuestos import bp as presupuestos_bp
from .routes.precios import bp as precios_bp
from .routes.repuestos import bp as repuestos_bp
from .routes.tecnicos import bp as tecnicos_bp
from .routes.deploy import bp as deploy_bp
from .routes.backup import bp as backup_bp
from .routes.mantenimiento import bp as mantenimiento_bp
from .routes.taller import bp as taller_bp
from .static_frontend import bp as static_bp

# Lo único de la API a lo que llega la cuenta del taller. Todo el resto de
# /api/… le devuelve 403, incluido lo que se agregue más adelante: el guard es
# una lista de lo permitido, no de lo prohibido, así que un endpoint nuevo nace
# cerrado para el taller y hay que abrirlo a propósito.
_API_TALLER = ("/api/auth/", "/api/taller/")


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
    app.register_blueprint(precios_bp)
    app.register_blueprint(repuestos_bp)
    app.register_blueprint(tecnicos_bp)
    app.register_blueprint(deploy_bp)
    app.register_blueprint(backup_bp)
    app.register_blueprint(mantenimiento_bp)
    app.register_blueprint(taller_bp)
    app.register_blueprint(static_bp)

    @app.before_request
    def _cerrar_api_al_taller():
        """El taller no ve precios, y eso se decide acá y no en la interfaz.

        Esconder los precios en el frontend no alcanza: la API seguiría
        devolviéndolos a quien pida /api/presupuestos con la sesión del taller.
        Así que el corte está en el servidor y es de tipo lista blanca: con rol
        'taller', lo único que se responde es /api/auth y /api/taller (que están
        escritos sin un solo precio). Lo que no es /api —el HTML, el JS, el CSS
        del frontend— no se toca: la app es la misma para los dos roles.
        """
        camino = request.path
        if not camino.startswith("/api/"):
            return None
        if rol_actual() != ROL_TALLER:
            return None
        if camino.startswith(_API_TALLER):
            return None
        return jsonify({"error": "Esta parte del sistema es de la oficina"}), 403

    return app
