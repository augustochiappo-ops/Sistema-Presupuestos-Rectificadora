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
    categoria = request.args.get("categoria")
    return jsonify(crac.get_marcas(categoria))


@bp.get("/medidas")
@login_required
def medidas():
    """
    Las otras medidas de la misma pieza (STD, 025, 050…), para agregarlas solas
    al grupo cuando se elige una. Devuelve solo lo que existe de verdad en el
    catálogo: si esa pieza no tiene 1.00, no aparece un 1.00.
    """
    codigo = (request.args.get("codigo") or "").strip()
    if not codigo:
        return jsonify([])
    return jsonify(crac.get_medidas_hermanas(codigo))


@bp.get("/catalogo-info")
@login_required
def catalogo_info():
    """Cuándo se cargó por última vez la lista del proveedor: los precios 'de
    hoy' son en realidad los de esa carga, y conviene que se vea."""
    return jsonify(crac.get_info_catalogo())


@bp.get("/categorias/favoritos")
@login_required
def categorias_favoritos():
    return jsonify(sorted(crac.get_favoritos_categorias()))


@bp.post("/categorias/<string:prefijo>/favorito")
@login_required
def toggle_categoria_favorito(prefijo):
    es_favorito = crac.toggle_favorito_categoria(prefijo)
    return jsonify({"prefijo": prefijo, "favorito": es_favorito})


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
