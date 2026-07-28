import hmac
import subprocess
import threading
import urllib.error
import urllib.request

from flask import Blueprint, jsonify, request

from .. import config

bp = Blueprint("deploy", __name__, url_prefix="/api/deploy")


def _reload_webapp():
    if not (config.PA_USERNAME and config.PA_DOMAIN and config.PA_API_TOKEN):
        return False, "Faltan PA_USERNAME / PA_DOMAIN / PA_API_TOKEN en el servidor"
    url = f"https://www.pythonanywhere.com/api/v0/user/{config.PA_USERNAME}/webapps/{config.PA_DOMAIN}/reload/"
    req = urllib.request.Request(url, method="POST", headers={"Authorization": f"Token {config.PA_API_TOKEN}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status == 200, None
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}: {e.read().decode(errors='replace')}"
    except Exception as e:
        return False, str(e)


@bp.post("")
def deploy():
    """Webhook de deploy: baja el último código de git y reinicia la web app.
    Protegido por un secreto propio (no por el login de usuarios) porque lo
    llama Claude directamente, no una persona logueada en el sistema."""
    secret = request.headers.get("X-Deploy-Secret", "")
    if not config.DEPLOY_SECRET or not hmac.compare_digest(secret, config.DEPLOY_SECRET):
        return jsonify({"error": "No autorizado"}), 401

    pull = subprocess.run(
        ["git", "pull"], cwd=config.REPO_DIR,
        capture_output=True, text=True, timeout=60,
    )

    # El reload mata el proceso que está respondiendo esta misma petición, así que
    # se dispara en un hilo aparte con un pequeño delay para que la respuesta HTTP
    # llegue al cliente antes de que el servidor se reinicie (si no, a veces corta
    # la respuesta a mitad de camino con un 502, aunque el reload haya funcionado bien).
    threading.Timer(1.5, _reload_webapp).start()

    return jsonify({
        "git_pull": {"ok": pull.returncode == 0, "stdout": pull.stdout, "stderr": pull.stderr},
        "reload": {"scheduled": True},
    })
