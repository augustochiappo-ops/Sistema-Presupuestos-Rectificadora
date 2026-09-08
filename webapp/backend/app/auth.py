import time
from functools import wraps

from flask import Blueprint, jsonify, request, session
from werkzeug.security import check_password_hash

from . import config

bp = Blueprint("auth", __name__, url_prefix="/api/auth")

# Los dos roles del sistema. "oficina" es la cuenta de siempre (arma
# presupuestos, ve precios, toca todo); "taller" es la cuenta nueva, que sólo ve
# el panel de trabajos y nunca un precio. El rol se guarda en la sesión al
# hacer login y no se puede cambiar sin volver a entrar.
ROL_OFICINA = "oficina"
ROL_TALLER = "taller"


def _cuentas():
    """Las cuentas configuradas, en orden: usuario → (hash, rol).

    La del taller aparece sólo si el servidor tiene TALLER_PASSWORD_HASH. Así,
    una instalación que todavía no configuró la segunda cuenta sigue andando
    exactamente como antes en lugar de dejar entrar a nadie.
    """
    cuentas = {}
    if config.APP_PASSWORD_HASH:
        cuentas[config.APP_USERNAME] = (config.APP_PASSWORD_HASH, ROL_OFICINA)
    if config.TALLER_PASSWORD_HASH:
        cuentas[config.TALLER_USERNAME] = (config.TALLER_PASSWORD_HASH, ROL_TALLER)
    return cuentas


def _sesion_activa():
    """La sesión vale hasta SESSION_HORAS después del login, sin renovarse con el uso."""
    if not session.get("logueado"):
        return False

    inicio = session.get("login_ts")
    if not inicio or time.time() - inicio >= config.SESSION_HORAS * 3600:
        session.clear()
        return False
    return True


def rol_actual():
    """Rol de la sesión en curso, o None si no hay sesión.

    Una sesión abierta antes de que existieran los roles no tiene el dato
    guardado: se la trata como oficina, que es lo que era.
    """
    if not _sesion_activa():
        return None
    return session.get("rol") or ROL_OFICINA


def _datos_sesion():
    """Datos que la interfaz necesita: quién es, con qué rol y hasta cuándo vale la sesión."""
    return {
        "usuario": session.get("usuario"),
        "rol": session.get("rol") or ROL_OFICINA,
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


def oficina_required(view):
    """Sólo la oficina. Es el candado explícito de un endpoint puntual; el
    candado general lo pone el guard de create_app, que corre en cada request."""
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not _sesion_activa():
            return jsonify({"error": "No autenticado"}), 401
        if rol_actual() != ROL_OFICINA:
            return jsonify({"error": "Esta parte del sistema es de la oficina"}), 403
        return view(*args, **kwargs)
    return wrapped


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    usuario = (data.get("usuario") or "").strip()
    password = data.get("password") or ""

    cuentas = _cuentas()
    if not cuentas:
        return jsonify({"error": "El servidor no tiene configurada la contraseña (APP_PASSWORD_HASH)"}), 500

    cuenta = cuentas.get(usuario)
    if not cuenta or not check_password_hash(cuenta[0], password):
        return jsonify({"error": "Usuario o contraseña incorrectos"}), 401

    session.clear()
    session["logueado"] = True
    session["usuario"] = usuario
    session["rol"] = cuenta[1]
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
