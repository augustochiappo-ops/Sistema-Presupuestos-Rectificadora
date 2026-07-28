from functools import wraps

from flask import Blueprint, jsonify, request, session
from werkzeug.security import check_password_hash

from . import config

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("logueado"):
            return jsonify({"error": "No autenticado"}), 401
        return view(*args, **kwargs)
    return wrapped


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    usuario = (data.get("usuario") or "").strip()
    password = data.get("password") or ""

    if not config.APP_PASSWORD_HASH:
        return jsonify({"error": "El servidor no tiene configurada la contraseña (APP_PASSWORD_HASH)"}), 500

    if usuario != config.APP_USERNAME or not check_password_hash(config.APP_PASSWORD_HASH, password):
        return jsonify({"error": "Usuario o contraseña incorrectos"}), 401

    session["logueado"] = True
    session["usuario"] = usuario
    session.permanent = True
    return jsonify({"usuario": usuario})


@bp.post("/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@bp.get("/session")
def get_session():
    if not session.get("logueado"):
        return jsonify({"error": "No autenticado"}), 401
    return jsonify({"usuario": session.get("usuario")})
