"""
La API del taller.

Es la ÚNICA parte de /api a la que llega la cuenta del taller (el guard de
create_app cierra todo lo demás), y está escrita con una regla que no se
negocia: acá no sale un precio. Ni un unitario, ni un subtotal, ni el total del
presupuesto. Lo que sale es qué motor es, de quién es, qué hay que hacerle, qué
repuestos se pidieron y en qué estado está el trabajo.

La oficina también usa estos endpoints: ve el mismo tablero, con los mismos
estados, desde su propio menú. Lo que la oficina tiene de más (marcar urgente,
poner fecha de entrega) está más abajo y sí lleva `oficina_required`.
"""
import os

from flask import Blueprint, jsonify, request, send_file, session

from .. import config, db, pdf_gen
from ..auth import login_required, oficina_required, rol_actual

bp = Blueprint("taller", __name__, url_prefix="/api/taller")


def _usuario():
    """Quién está moviendo el trabajo. Queda anotado en el historial."""
    return session.get("usuario")


@bp.get("/trabajos")
@login_required
def trabajos():
    """El tablero completo. `entregados=0` deja afuera lo ya entregado."""
    incluir = request.args.get("entregados", "1") != "0"
    return jsonify({
        "trabajos": db.get_trabajos(incluir_entregados=incluir),
        "estados": db.ESTADOS_TRABAJO,
        "conteo": db.contar_trabajos_por_estado(),
        "rol": rol_actual(),
    })


@bp.get("/resumen")
@login_required
def resumen():
    """Sólo los números por estado. Es lo que alimenta el contador del menú."""
    return jsonify(db.contar_trabajos_por_estado())


@bp.get("/trabajos/<int:presupuesto_id>")
@login_required
def orden(presupuesto_id):
    """La orden de trabajo de un motor: todo lo que hay que hacerle, sin plata."""
    datos = db.get_orden_trabajo(presupuesto_id)
    if not datos:
        return jsonify({"error": "Ese trabajo no existe o todavía no está aprobado"}), 404
    return jsonify(datos)


@bp.post("/trabajos/<int:presupuesto_id>/estado")
@login_required
def cambiar_estado(presupuesto_id):
    """Mueve el trabajo de estado. Lo pueden hacer los dos roles."""
    data = request.get_json(silent=True) or {}
    estado = (data.get("estado") or "").strip()
    try:
        movido = db.cambiar_estado_trabajo(presupuesto_id, estado, _usuario())
    except ValueError:
        return jsonify({"error": f"Estado desconocido: {estado}"}), 400
    if not movido:
        return jsonify({"error": "Ese trabajo no existe o todavía no está aprobado"}), 404
    return jsonify(movido)


@bp.put("/trabajos/<int:presupuesto_id>/notas")
@login_required
def notas(presupuesto_id):
    """Las notas que el taller le deja a la oficina sobre este motor."""
    if not db.get_orden_trabajo(presupuesto_id):
        return jsonify({"error": "Ese trabajo no existe o todavía no está aprobado"}), 404
    data = request.get_json(silent=True) or {}
    return jsonify({"notas_taller": db.set_notas_taller(presupuesto_id, data.get("notas_taller"))})


@bp.get("/trabajos/<int:presupuesto_id>/orden.pdf")
@login_required
def orden_pdf(presupuesto_id):
    """
    La orden de trabajo en PDF, para imprimirla y dejarla con el motor. Es el
    papel que va atado al block: sin precios, con letra grande y con espacio
    para escribir a mano al costado.
    """
    datos = db.get_orden_trabajo(presupuesto_id)
    if not datos:
        return jsonify({"error": "Ese trabajo no existe o todavía no está aprobado"}), 404

    nombre = f"orden_{presupuesto_id:04d}.pdf"
    ruta = os.path.join(config.PDFS_DIR, nombre)
    pdf_gen.generar_orden_trabajo(datos, ruta)
    return send_file(ruta, mimetype="application/pdf", as_attachment=False, download_name=nombre)


# ─── Lo que sólo mueve la oficina ─────────────────────────────────────────────

@bp.post("/trabajos/<int:presupuesto_id>/prioridad")
@oficina_required
def prioridad(presupuesto_id):
    """Marca el trabajo como urgente: en el tablero del taller va arriba de todo."""
    data = request.get_json(silent=True) or {}
    return jsonify({"prioridad": db.set_prioridad(presupuesto_id, bool(data.get("prioridad", True)))})


@bp.put("/trabajos/<int:presupuesto_id>/entrega")
@oficina_required
def entrega(presupuesto_id):
    """La fecha que la oficina le prometió al cliente (ISO 'YYYY-MM-DD', o vacío)."""
    data = request.get_json(silent=True) or {}
    return jsonify({
        "entrega_prometida": db.set_entrega_prometida(presupuesto_id, data.get("entrega_prometida"))
    })
