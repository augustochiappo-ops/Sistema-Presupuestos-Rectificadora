import hmac
import subprocess
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

    reload_ok, reload_error = _reload_webapp()

    return jsonify({
        "git_pull": {"ok": pull.returncode == 0, "stdout": pull.stdout, "stderr": pull.stderr},
        "reload": {"ok": reload_ok, "error": reload_error},
    })
