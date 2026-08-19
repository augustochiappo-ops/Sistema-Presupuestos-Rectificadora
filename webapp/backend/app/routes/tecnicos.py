from flask import Blueprint, jsonify, request

from .. import tecnicos
from ..auth import login_required

bp = Blueprint("tecnicos", __name__, url_prefix="/api/tecnicos")


@bp.get("/familias")
@login_required
def familias():
    """Qué catálogos técnicos hay cargados. La pantalla arma una pestaña por cada uno."""
    return jsonify(tecnicos.get_familias())


@bp.get("/buscar")
@login_required
def buscar():
    """
    Búsqueda por medidas. Cada campo numérico va como `<campo>` + `tol_<campo>`
    (la tolerancia es opcional, por defecto ±0,5 mm). Sin ningún filtro devuelve
    vacío, igual que la búsqueda por código de `routes/repuestos.py`.
    """
    familia = (request.args.get("familia") or "").strip()
    return jsonify(tecnicos.buscar(familia, request.args))
