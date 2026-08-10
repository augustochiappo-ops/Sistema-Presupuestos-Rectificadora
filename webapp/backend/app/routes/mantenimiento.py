"""
Operaciones de mantenimiento del sistema. Hoy solo el borrado de los datos de
prueba, para arrancar limpio la primera vez que se empieza a usar en serio.
"""
import os

from flask import Blueprint, jsonify, request

from .. import db, config
from ..auth import login_required

bp = Blueprint("mantenimiento", __name__, url_prefix="/api/mantenimiento")

# Palabra que hay que mandar para confirmar. Es una operación destructiva y sin
# vuelta atrás salvo por la copia de seguridad, así que no alcanza con un POST.
CONFIRMACION = "BORRAR"


@bp.post("/borrar-datos-prueba")
@login_required
def borrar_datos_prueba():
    """
    Borra presupuestos (con sus ítems, opciones y PDFs) y clientes.
    NO toca los motores, la mano de obra, el catálogo del proveedor, los
    favoritos ni las fichas de repuestos de los motores: todo eso es dato
    importado o trabajo cargado a mano, no datos de prueba.
    """
    data = request.get_json(silent=True) or {}
    if data.get("confirmar") != CONFIRMACION:
        return jsonify({"error": "Falta la confirmación"}), 400

    resumen = db.borrar_datos_prueba()

    borrados = 0
    for nombre in resumen.pop("pdfs", []):
        ruta = os.path.join(config.PDFS_DIR, nombre)
        if os.path.exists(ruta):
            os.remove(ruta)
            borrados += 1

    resumen["pdfs_borrados"] = borrados
    return jsonify(resumen)
