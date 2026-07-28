import os
import tempfile

from flask import Blueprint, jsonify, request
from werkzeug.utils import secure_filename

from .. import facra
from ..auth import login_required

bp = Blueprint("excel", __name__, url_prefix="/api/excel")


def _guardar_temporal(archivo):
    nombre = secure_filename(archivo.filename or "archivo.xls")
    fd, path = tempfile.mkstemp(suffix=os.path.splitext(nombre)[1] or ".xls")
    os.close(fd)
    archivo.save(path)
    return path


@bp.post("/nomenclador")
@login_required
def nomenclador():
    archivo = request.files.get("archivo")
    if not archivo:
        return jsonify({"error": "Falta el archivo"}), 400
    path = _guardar_temporal(archivo)
    try:
        count, mensaje = facra.importar_nomenclador(path)
    finally:
        os.remove(path)
    if count == 0:
        return jsonify({"error": mensaje}), 400
    return jsonify({"count": count, "mensaje": mensaje})


@bp.post("/lista-orientadora")
@login_required
def lista_orientadora():
    archivo = request.files.get("archivo")
    if not archivo:
        return jsonify({"error": "Falta el archivo"}), 400
    path = _guardar_temporal(archivo)
    try:
        count, mensaje = facra.importar_lista_orientadora(path)
    finally:
        os.remove(path)
    if count == 0:
        return jsonify({"error": mensaje}), 400
    return jsonify({"count": count, "mensaje": mensaje})
