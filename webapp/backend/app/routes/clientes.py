from flask import Blueprint, jsonify, request

from .. import db
from ..auth import login_required
from ..helpers import formato_nombre_titulo

bp = Blueprint("clientes", __name__, url_prefix="/api/clientes")

TIPOS_VALIDOS = {"mecanico", "dueno"}


@bp.get("")
@login_required
def listar():
    return jsonify(db.get_clientes_lista())


@bp.get("/<int:cliente_id>")
@login_required
def detalle(cliente_id):
    cliente = db.get_cliente(cliente_id)
    if not cliente:
        return jsonify({"error": "Cliente no encontrado"}), 404
    return jsonify(cliente)


@bp.put("/<int:cliente_id>")
@login_required
def actualizar(cliente_id):
    if not db.get_cliente(cliente_id):
        return jsonify({"error": "Cliente no encontrado"}), 404

    data = request.get_json(silent=True) or {}
    nombre = (data.get("nombre") or "").strip()
    if not nombre:
        return jsonify({"error": "Falta el nombre del cliente"}), 400

    tipo = data.get("tipo") or None
    if tipo is not None and tipo not in TIPOS_VALIDOS:
        return jsonify({"error": "Tipo de cliente inválido"}), 400

    db.actualizar_cliente(cliente_id, formato_nombre_titulo(nombre), data.get("notas"), tipo)
    return jsonify(db.get_cliente(cliente_id))


@bp.delete("/<int:cliente_id>")
@login_required
def eliminar(cliente_id):
    """Borra un cliente. Si tiene presupuestos (propios o donde figura como
    contraparte) devuelve 409 con la cantidad, para que la pantalla pueda decir
    exactamente cuántos hay que borrar primero."""
    resultado = db.eliminar_cliente(cliente_id)
    if resultado == "no_existe":
        return jsonify({"error": "Cliente no encontrado"}), 404
    if resultado == "tiene_presupuestos":
        cuantos = db.contar_presupuestos_cliente(cliente_id)
        return jsonify({
            "error": (
                f"Este cliente tiene {cuantos} presupuesto{'' if cuantos == 1 else 's'}. "
                "Borralos primero y después vas a poder borrar el cliente."
            ),
            "presupuestos": cuantos,
        }), 409
    return "", 204


@bp.get("/<int:cliente_id>/presupuestos")
@login_required
def presupuestos(cliente_id):
    return jsonify(db.get_presupuestos_por_cliente(cliente_id))
