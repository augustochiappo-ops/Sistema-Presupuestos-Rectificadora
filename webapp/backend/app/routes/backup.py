from flask import Blueprint, jsonify, request, send_file

from .. import backup
from ..auth import login_required

bp = Blueprint("backup", __name__, url_prefix="/api/backup")


@bp.get("/exportar")
@login_required
def exportar():
    buffer, nombre = backup.crear_backup_zip()
    return send_file(buffer, mimetype="application/zip", as_attachment=True, download_name=nombre)


@bp.post("/analizar")
@login_required
def analizar():
    archivo = request.files.get("archivo")
    if not archivo:
        return jsonify({"error": "Falta el archivo"}), 400
    try:
        resultado = backup.analizar_backup(archivo)
    except backup.BackupInvalido as e:
        return jsonify({"error": str(e)}), 400
    return jsonify(resultado)


@bp.post("/restaurar")
@login_required
def restaurar():
    data = request.get_json(silent=True) or {}
    token = data.get("token")
    try:
        resultado = backup.restaurar_backup(token)
    except backup.BackupInvalido as e:
        return jsonify({"error": str(e)}), 400
    return jsonify(resultado)
