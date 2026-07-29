import os
import tempfile

from flask import Blueprint, jsonify, request

from .. import crac
from ..auth import login_required

bp = Blueprint("repuestos", __name__, url_prefix="/api/repuestos")

LIMITE_RESULTADOS = 1000


def _guardar_temporal(archivo):
    fd, path = tempfile.mkstemp(suffix=".csv")
    os.close(fd)
    archivo.save(path)
    return path


@bp.get("/categorias")
@login_required
def categorias():
    return jsonify(crac.get_categorias())


@bp.get("/marcas")
@login_required
def marcas():
    return jsonify(crac.get_marcas())


@bp.get("")
@login_required
def listar():
    categoria = request.args.get("categoria")
    marca = request.args.get("marca")
    codigo = request.args.get("codigo")
    descripcion = request.args.get("descripcion")

    if not any([categoria, marca, codigo, descripcion]):
        return jsonify({"total": 0, "repuestos": []})

    total = crac.get_repuestos_count(categoria, marca, descripcion, codigo)
    repuestos = crac.get_repuestos(categoria, marca, descripcion, codigo, limite=LIMITE_RESULTADOS)
    return jsonify({"total": total, "repuestos": repuestos})


@bp.post("/importar-prefijos")
@login_required
def importar_prefijos():
    archivo = request.files.get("archivo")
    if not archivo:
        return jsonify({"error": "Falta el archivo"}), 400
    path = _guardar_temporal(archivo)
    try:
        count, mensaje = crac.importar_prefijos(path)
    finally:
        os.remove(path)
    if count == 0:
        return jsonify({"error": mensaje}), 400
    return jsonify({"count": count, "mensaje": mensaje})


@bp.post("/importar-precio-stock")
@login_required
def importar_precio_stock():
    archivo = request.files.get("archivo")
    if not archivo:
        return jsonify({"error": "Falta el archivo"}), 400
    path = _guardar_temporal(archivo)
    try:
        count, mensaje = crac.importar_precio_stock(path)
    finally:
        os.remove(path)
    if count == 0:
        return jsonify({"error": mensaje}), 400
    return jsonify({"count": count, "mensaje": mensaje})
