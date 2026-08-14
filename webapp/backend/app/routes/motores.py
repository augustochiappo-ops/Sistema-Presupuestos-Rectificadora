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


@bp.get("/<int:motor_id>/ficha-repuestos")
@login_required
def ficha_repuestos(motor_id):
    """
    Qué repuestos sirven para este motor, agrupados por categoría del proveedor.
    Reemplaza a las viejas sugerencias deducidas del historial: acá la
    asociación es explícita y la carga el taller. Precio, stock, marca y medida
    salen del catálogo vigente, no de lo que se cotizó alguna vez.
    """
    motor = db.get_motor(motor_id)
    if not motor:
        return jsonify({"error": "Motor no encontrado"}), 404
    return jsonify(db.get_ficha_motor(motor_id))


@bp.put("/<int:motor_id>/ficha-repuestos")
@login_required
def guardar_ficha_repuestos(motor_id):
    motor = db.get_motor(motor_id)
    if not motor:
        return jsonify({"error": "Motor no encontrado"}), 404
    data = request.get_json(silent=True) or {}
    db.guardar_ficha_motor(motor_id, data.get("grupos") or [])
    return jsonify(db.get_ficha_motor(motor_id))


@bp.post("/<int:motor_id>/ficha-repuestos/marcar")
@login_required
def marcar_en_ficha(motor_id):
    """
    Marca (o desmarca) repuestos como "sirven para este motor", sin cotizarlos.
    Es lo que hace el círculo del paso Repuestos: entran a la ficha SIN cantidad
    — el sistema no inventa un número que el taller no eligió.

    Body: {codigos: [...], categoria, cat_prefijo, marcado: true|false}
    Desmarcar los saca de la ficha (van a la papelera del motor, como cualquier
    otro borrado, así que se puede deshacer).
    """
    if not db.get_motor(motor_id):
        return jsonify({"error": "Motor no encontrado"}), 404

    data = request.get_json(silent=True) or {}
    codigos = [c.strip() for c in (data.get("codigos") or []) if (c or "").strip()]
    if not codigos:
        return jsonify({"error": "Faltan los códigos"}), 400

    if data.get("marcado") is False:
        fuera = set(codigos)
        nueva = [
            {
                "categoria": g["categoria"],
                "cat_prefijo": g["cat_prefijo"],
                "opciones": [
                    {"codigo": o["codigo"], "cantidad": o["cantidad"],
                     "cantidad_manual": o["cantidad_manual"]}
                    for o in g["opciones"] if o["codigo"] not in fuera
                ],
            }
            for g in db.get_ficha_motor(motor_id)
        ]
        db.guardar_ficha_motor(motor_id, nueva)
        return jsonify(db.get_ficha_motor(motor_id))

    categoria = (data.get("categoria") or "").strip()
    if not categoria:
        return jsonify({"error": "Falta la categoría"}), 400
    db.fusionar_ficha_motor(motor_id, [{
        "categoria": categoria,
        "cat_prefijo": data.get("cat_prefijo"),
        # cantidad None = marcado sin cantidad. Si el código ya estaba con una
        # cantidad, fusionar_ficha_motor no se la pisa.
        "opciones": [{"codigo": c, "cantidad": None} for c in codigos],
    }])
    return jsonify(db.get_ficha_motor(motor_id))


@bp.get("/<int:motor_id>/presupuestos-repuestos")
@login_required
def presupuestos_con_repuestos(motor_id):
    """
    Presupuestos anteriores de este motor que llevaron repuestos. Es la lista
    que abre "Repuestos ya utilizados"; el detalle de cada uno se lee con
    GET /api/presupuestos/<id>/grupos.
    """
    if not db.get_motor(motor_id):
        return jsonify({"error": "Motor no encontrado"}), 404
    return jsonify(db.get_presupuestos_con_repuestos(motor_id))


@bp.post("/<int:motor_id>/ficha-repuestos/copiar-de/<int:origen_id>")
@login_required
def copiar_ficha_repuestos(motor_id, origen_id):
    """Trae la ficha de otro motor y la fusiona con la de este, sin pisar lo que
    ya tenga. Muchos motores comparten repuestos: es la forma rápida de cargar
    un motor nuevo."""
    if not db.get_motor(motor_id):
        return jsonify({"error": "Motor no encontrado"}), 404
    if not db.get_motor(origen_id):
        return jsonify({"error": "Motor de origen no encontrado"}), 404
    if motor_id == origen_id:
        return jsonify({"error": "El motor de origen tiene que ser otro"}), 400
    db.copiar_ficha_motor(origen_id, motor_id)
    return jsonify(db.get_ficha_motor(motor_id))


@bp.get("/<int:motor_id>/repuestos-eliminados")
@login_required
def repuestos_eliminados(motor_id):
    """
    Papelera de la ficha: lo que se sacó de este motor, del último borrado al
    primero. Existe para poder deshacer un borrado hecho sin querer — el tacho
    de una familia se lleva las cuatro medidas de un click.
    """
    if not db.get_motor(motor_id):
        return jsonify({"error": "Motor no encontrado"}), 404
    return jsonify(db.get_papelera_motor(motor_id))


@bp.post("/<int:motor_id>/repuestos-eliminados/restaurar")
@login_required
def restaurar_repuestos_eliminados(motor_id):
    """Devuelve a la ficha los códigos indicados, cada uno a su categoría y con
    la cantidad que tenía."""
    if not db.get_motor(motor_id):
        return jsonify({"error": "Motor no encontrado"}), 404
    data = request.get_json(silent=True) or {}
    codigos = data.get("codigos")
    if not isinstance(codigos, list) or not codigos:
        return jsonify({"error": "Falta la lista de códigos a restaurar"}), 400
    restaurados = db.restaurar_de_papelera(motor_id, codigos)
    return jsonify({
        "restaurados": restaurados,
        "ficha": db.get_ficha_motor(motor_id),
        "papelera": db.get_papelera_motor(motor_id),
    })


@bp.delete("/<int:motor_id>/repuestos-eliminados")
@login_required
def vaciar_repuestos_eliminados(motor_id):
    """Saca de la papelera definitivamente: los códigos que lleguen en
    ?codigos=A,B, o toda la papelera del motor si no se pasa ninguno."""
    if not db.get_motor(motor_id):
        return jsonify({"error": "Motor no encontrado"}), 404
    crudo = (request.args.get("codigos") or "").strip()
    codigos = [c for c in crudo.split(",") if c.strip()] if crudo else None
    borrados = db.borrar_de_papelera(motor_id, codigos)
    return jsonify({"borrados": borrados, "papelera": db.get_papelera_motor(motor_id)})


@bp.get("/<int:motor_id>/presupuestos")
@login_required
def presupuestos_del_motor(motor_id):
    motor = db.get_motor(motor_id)
    if not motor:
        return jsonify({"error": "Motor no encontrado"}), 404
    return jsonify(db.get_presupuestos_por_motor(motor_id))
