from flask import Blueprint, jsonify

from .. import db
from ..auth import login_required

bp = Blueprint("servicios", __name__, url_prefix="/api/servicios")


@bp.get("/favoritos")
@login_required
def favoritos():
    return jsonify(sorted(db.get_favoritos_ids()))


@bp.post("/<int:servicio_id>/favorito")
@login_required
def toggle_favorito(servicio_id):
    es_favorito = db.toggle_favorito_servicio(servicio_id)
    return jsonify({"servicio_id": servicio_id, "favorito": es_favorito})
