from flask import Blueprint, jsonify

from .. import db
from ..auth import login_required

bp = Blueprint("clientes", __name__, url_prefix="/api/clientes")


@bp.get("")
@login_required
def listar():
    return jsonify(db.get_clientes_lista())


@bp.get("/nombres")
@login_required
def nombres():
    return jsonify(db.get_clientes_nombres())


@bp.get("/<int:cliente_id>/presupuestos")
@login_required
def presupuestos(cliente_id):
    return jsonify(db.get_presupuestos_por_cliente(cliente_id))
