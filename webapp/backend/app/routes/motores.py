from flask import Blueprint, jsonify, request

from .. import facra, db
from ..auth import login_required

bp = Blueprint("motores", __name__, url_prefix="/api/motores")


@bp.get("")
@login_required
def listar():
    marca = request.args.get("marca")
    busqueda = request.args.get("busqueda")
    return jsonify(facra.get_motores(marca=marca, busqueda=busqueda))


@bp.get("/marcas")
@login_required
def marcas():
    return jsonify(facra.get_marcas())


@bp.get("/<int:motor_id>")
@login_required
def detalle(motor_id):
    motor = db.get_motor(motor_id)
    if not motor:
        return jsonify({"error": "Motor no encontrado"}), 404
    return jsonify(motor)


@bp.get("/<int:motor_id>/servicios")
@login_required
def servicios(motor_id):
    motor = db.get_motor(motor_id)
    if not motor:
        return jsonify({"error": "Motor no encontrado"}), 404
    return jsonify(facra.get_servicios_para_lista(motor.get("lista_num")))


@bp.get("/<int:motor_id>/repuestos-sugeridos")
@login_required
def repuestos_sugeridos(motor_id):
    motor = db.get_motor(motor_id)
    if not motor:
        return jsonify({"error": "Motor no encontrado"}), 404
    incluir_ocultos = request.args.get("incluir_ocultos") == "1"
    return jsonify(db.get_repuestos_sugeridos_motor(motor_id, incluir_ocultos=incluir_ocultos))


@bp.post("/<int:motor_id>/repuestos-sugeridos/ocultar")
@login_required
def ocultar_repuesto_sugerido(motor_id):
    motor = db.get_motor(motor_id)
    if not motor:
        return jsonify({"error": "Motor no encontrado"}), 404
    data = request.get_json(silent=True) or {}
    codigo = (data.get("codigo") or "").strip()
    if not codigo:
        return jsonify({"error": "Falta el código del repuesto"}), 400
    oculto = db.toggle_repuesto_oculto_motor(motor_id, codigo)
    return jsonify({"codigo": codigo, "oculto": oculto})


@bp.get("/<int:motor_id>/presupuestos")
@login_required
def presupuestos_del_motor(motor_id):
    motor = db.get_motor(motor_id)
    if not motor:
        return jsonify({"error": "Motor no encontrado"}), 404
    return jsonify(db.get_presupuestos_por_motor(motor_id))
