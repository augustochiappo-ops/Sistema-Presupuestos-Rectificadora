import os

from flask import Blueprint, send_from_directory

_STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static_build")

bp = Blueprint("static_frontend", __name__)


@bp.route("/", defaults={"path": ""})
@bp.route("/<path:path>")
def serve(path):
    """Sirve el build de React; cualquier ruta que no sea un archivo estático
    ni empiece con /api cae en index.html para que React Router la resuelva."""
    full_path = os.path.join(_STATIC_DIR, path)
    if path and os.path.isfile(full_path):
        return send_from_directory(_STATIC_DIR, path)
    return send_from_directory(_STATIC_DIR, "index.html")
