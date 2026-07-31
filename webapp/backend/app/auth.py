import time
from functools import wraps

from flask import Blueprint, jsonify, request, session
from werkzeug.security import check_password_hash

from . import config

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def _sesion_activa():
    """La sesión vale hasta SESSION_HORAS después del login, sin renovarse con el uso."""
    if not session.get("logueado"):
        return False

    inicio = session.get("login_ts")
    if not inicio or time.time() - inicio >= config.SESSION_HORAS * 3600:
        session.clear()
        return False
    return True


def _datos_sesion():
    """Datos que la interfaz necesita: quién es y hasta cuándo vale la sesión."""
    return {
        "usuario": session.get("usuario"),
        "horas_sesion": config.SESSION_HORAS,
        "vence_ts": session.get("login_ts", 0) + config.SESSION_HORAS * 3600,
    }


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not _sesion_activa():
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

    session.clear()
    session["logueado"] = True
    session["usuario"] = usuario
    session["login_ts"] = time.time()
    session.permanent = True
    return jsonify(_datos_sesion())


@bp.post("/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@bp.get("/session")
def get_session():
    if not _sesion_activa():
        return jsonify({"error": "No autenticado"}), 401
    return jsonify(_datos_sesion())
