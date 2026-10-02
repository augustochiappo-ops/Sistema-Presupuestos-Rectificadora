from flask import Blueprint, jsonify

from .. import db, facra
from ..auth import login_required

bp = Blueprint("servicios", __name__, url_prefix="/api/servicios")


@bp.get("")
@login_required
def listar():
    """
    La lista de mano de obra de la Cámara entera, SIN precio.

    Es la que usa el presupuesto rápido cuando el motor se escribe a mano: los
    trabajos son los mismos para cualquier motor (lo que cambia de un motor a
    otro es la columna de precio, l1…l13), así que se pueden tildar igual aunque
    el motor no esté en la lista. El precio no viaja porque sin motor de la
    lista no hay de qué columna sacarlo.
    """
    return jsonify(facra.get_servicios_para_lista(None))


@bp.get("/favoritos")
@login_required
def favoritos():
    return jsonify(sorted(db.get_favoritos_ids()))


@bp.post("/<int:servicio_id>/favorito")
@login_required
def toggle_favorito(servicio_id):
    es_favorito = db.toggle_favorito_servicio(servicio_id)
    return jsonify({"servicio_id": servicio_id, "favorito": es_favorito})
