from flask import Blueprint, jsonify, request

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


# ─── Servicios guardados: los ítems manuales que se reusan ────────────────────


@bp.get("/guardados")
@login_required
def guardados():
    """Los trabajos guardados con el disquete, con los precios con que se
    usaron en presupuestos anteriores (ver db.get_servicios_guardados)."""
    return jsonify(db.get_servicios_guardados())


@bp.post("/guardados")
@login_required
def guardar():
    data = request.get_json(silent=True) or {}
    precio = data.get("precio")
    if precio is not None:
        try:
            precio = float(precio)
        except (TypeError, ValueError):
            return jsonify({"error": "El precio no es un número"}), 400
        if precio < 0:
            return jsonify({"error": "El precio no puede ser negativo"}), 400
    try:
        guardado = db.guardar_servicio(data.get("descripcion"), precio)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify(guardado), 201


@bp.delete("/guardados/<int:guardado_id>")
@login_required
def borrar_guardado(guardado_id):
    if not db.borrar_servicio_guardado(guardado_id):
        return jsonify({"error": "Ese trabajo ya no estaba guardado"}), 404
    return jsonify({"ok": True})
