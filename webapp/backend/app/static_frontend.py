import mimetypes
import os

from flask import Blueprint, send_from_directory

_STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static_build")

# El manifiesto de la app del celular. Python no conoce la extensión y lo
# mandaría como application/octet-stream, que algunos navegadores no aceptan.
mimetypes.add_type("application/manifest+json", ".webmanifest")

bp = Blueprint("static_frontend", __name__)


@bp.route("/", defaults={"path": ""})
@bp.route("/<path:path>")
def serve(path):
    """Sirve el build de React; cualquier ruta que no sea un archivo estático
    ni empiece con /api cae en index.html para que React Router la resuelva.

    El caché es lo que hace que la app abra rápido en el celular:

    * /assets/… son los JS y CSS del build, con el hash del contenido en el
      nombre (index-YV-imnvs.js). Un archivo con ese nombre no cambia nunca, así
      que el navegador lo guarda un año y no vuelve a preguntar: abrir la app es
      bajar sólo el index.html.
    * index.html, al revés, se revisa SIEMPRE (no-cache = "preguntá antes de
      usarlo"): es el que dice qué assets usar, y uno viejo después de un deploy
      apuntaría a archivos que el build nuevo ya borró.
    """
    full_path = os.path.join(_STATIC_DIR, path)
    if path and os.path.isfile(full_path):
        respuesta = send_from_directory(_STATIC_DIR, path)
        if path.startswith("assets/"):
            respuesta.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return respuesta
    respuesta = send_from_directory(_STATIC_DIR, "index.html")
    respuesta.headers["Cache-Control"] = "no-cache"
    return respuesta
