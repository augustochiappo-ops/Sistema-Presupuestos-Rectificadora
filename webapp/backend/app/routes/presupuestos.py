import os

from flask import Blueprint, jsonify, request, send_from_directory, abort

from .. import db, facra, pdf_gen, config
from ..auth import login_required

bp = Blueprint("presupuestos", __name__, url_prefix="/api/presupuestos")


def _items_para_pdf(presupuesto_id):
    items_full = db.get_presupuesto_items_full(presupuesto_id)
    return [
        {
            "item_num": it["item_num"],
            "descripcion": it["desc_facra"] or it["descripcion_custom"],
            "precio_aplicado": it["precio_aplicado"],
        }
        for it in items_full
    ]


def _resolver_items(items_payload, lista_num):
    """
    Recalcula el precio server-side para ítems de FACRA (no confía en el precio
    que mande el cliente); los ítems custom usan el precio que carga el usuario
    a mano, porque no existe otra fuente de verdad para un servicio ad-hoc.
    """
    precios_lista = {s["id"]: s["precio"] for s in facra.get_servicios_para_lista(lista_num)}
    resueltos = []
    for it in items_payload:
        servicio_id = it.get("servicio_id")
        if servicio_id:
            if servicio_id not in precios_lista:
                continue
            resueltos.append({
                "servicio_id": servicio_id,
                "descripcion_custom": None,
                "precio_aplicado": precios_lista[servicio_id],
            })
        else:
            desc = (it.get("descripcion_custom") or "").strip()
            if not desc:
                continue
            try:
                precio = float(it.get("precio_aplicado"))
            except (TypeError, ValueError):
                continue
            resueltos.append({
                "servicio_id": None,
                "descripcion_custom": desc,
                "precio_aplicado": precio,
            })
    return resueltos


def _resolver_items_edicion(items_payload):
    """
    A diferencia de la creación, al editar un presupuesto ya existente el precio
    de CUALQUIER ítem (incluidos los de FACRA) es editable a mano — así es como
    ya funciona la app de escritorio (permite ajustar/descontar un precio en la
    edición), así que acá se confía en el precio que manda el cliente en vez de
    recalcularlo contra el catálogo.
    """
    resueltos = []
    for it in items_payload:
        try:
            precio = float(it.get("precio_aplicado"))
        except (TypeError, ValueError):
            continue
        servicio_id = it.get("servicio_id")
        if servicio_id:
            resueltos.append({"servicio_id": servicio_id, "descripcion_custom": None, "precio_aplicado": precio})
        else:
            desc = (it.get("descripcion_custom") or "").strip()
            if not desc:
                continue
            resueltos.append({"servicio_id": None, "descripcion_custom": desc, "precio_aplicado": precio})
    return resueltos


@bp.get("")
@login_required
def listar():
    return jsonify(db.get_presupuestos())


@bp.get("/<int:presupuesto_id>")
@login_required
def detalle(presupuesto_id):
    d = db.get_presupuesto_detalle(presupuesto_id)
    if not d:
        return jsonify({"error": "Presupuesto no encontrado"}), 404
    return jsonify(d)


@bp.get("/<int:presupuesto_id>/items")
@login_required
def items(presupuesto_id):
    return jsonify(db.get_presupuesto_items_full(presupuesto_id))


@bp.post("")
@login_required
def crear():
    data = request.get_json(silent=True) or {}
    cliente_nombre = (data.get("cliente_nombre") or "").strip()
    motor_id = data.get("motor_id")
    items_payload = data.get("items") or []

    if not cliente_nombre:
        return jsonify({"error": "Falta el nombre del cliente"}), 400
    if not motor_id:
        return jsonify({"error": "Falta el motor"}), 400

    motor = db.get_motor(motor_id)
    if not motor:
        return jsonify({"error": "Motor no encontrado"}), 404

    items_resueltos = _resolver_items(items_payload, motor.get("lista_num"))
    if not items_resueltos:
        return jsonify({"error": "Agregá al menos un servicio"}), 400

    presupuesto_id = db.guardar_presupuesto(cliente_nombre, motor_id, items_resueltos)

    detalle = db.get_presupuesto_detalle(presupuesto_id)
    pdf_path = os.path.join(config.PDFS_DIR, f"presupuesto_{presupuesto_id:04d}.pdf")
    pdf_gen.generar_pdf(
        presupuesto_id, detalle["cliente"], detalle["motor"],
        _items_para_pdf(presupuesto_id), detalle["total"], pdf_path,
    )
    db.guardar_pdf_historial(presupuesto_id, pdf_path)

    return jsonify(db.get_presupuesto_detalle(presupuesto_id)), 201


@bp.put("/<int:presupuesto_id>")
@login_required
def actualizar(presupuesto_id):
    existente = db.get_presupuesto_detalle(presupuesto_id)
    if not existente:
        return jsonify({"error": "Presupuesto no encontrado"}), 404

    data = request.get_json(silent=True) or {}
    items_payload = data.get("items") or []
    notas = data.get("notas") or ""

    items_resueltos = _resolver_items_edicion(items_payload)
    if not items_resueltos:
        return jsonify({"error": "Agregá al menos un servicio"}), 400

    db.actualizar_presupuesto(presupuesto_id, items_resueltos, notas)
    return jsonify(db.get_presupuesto_detalle(presupuesto_id))


@bp.post("/<int:presupuesto_id>/pdf")
@login_required
def reconstruir_pdf(presupuesto_id):
    detalle = db.get_presupuesto_detalle(presupuesto_id)
    if not detalle:
        return jsonify({"error": "Presupuesto no encontrado"}), 404

    versiones = db.get_pdfs_presupuesto(presupuesto_id)
    siguiente_version = (versiones[0]["version"] + 1) if versiones else 1
    pdf_path = os.path.join(config.PDFS_DIR, f"presupuesto_{presupuesto_id:04d}_v{siguiente_version}.pdf")

    pdf_gen.generar_pdf(
        presupuesto_id, detalle["cliente"], detalle["motor"],
        _items_para_pdf(presupuesto_id), detalle["total"], pdf_path,
    )
    db.guardar_pdf_historial(presupuesto_id, pdf_path)

    return jsonify(db.get_pdfs_presupuesto(presupuesto_id))


@bp.get("/<int:presupuesto_id>/pdfs")
@login_required
def pdfs(presupuesto_id):
    return jsonify(db.get_pdfs_presupuesto(presupuesto_id))


@bp.get("/<int:presupuesto_id>/pdf/<int:version>")
@login_required
def ver_pdf(presupuesto_id, version):
    pdfs_list = db.get_pdfs_presupuesto(presupuesto_id)
    match = next((p for p in pdfs_list if p["version"] == version), None)
    if not match:
        abort(404)

    directorio, archivo = os.path.split(match["pdf_path"])
    descargar = request.args.get("descargar") == "1"
    return send_from_directory(directorio, archivo, as_attachment=descargar, download_name=archivo)
