"""
API de precios propios de mano de obra (pantalla "Editar Precios").

La lógica vive en app/precios.py; acá solo se valida la entrada y se traduce a
JSON. Regla de validación: un precio inválido devuelve 400 con el motivo y no se
guarda nada — nunca a medias, y nunca un número que el dueño no escribió.
"""
from flask import Blueprint, jsonify, request

from .. import db, facra, precios
from ..auth import login_required

bp = Blueprint("precios", __name__, url_prefix="/api/precios")


def _lista_pedida(valor):
    """(lista_num, error). Traduce lo que llega por query string o body."""
    if valor is None or valor == "":
        return None, "Falta la lista"
    if not precios.lista_valida(valor):
        return None, "La lista tiene que ser un número del 1 al 13"
    return int(valor), None


def _precio_pedido(valor):
    """(precio, error). El taller cobra en pesos enteros y positivos."""
    try:
        numero = float(valor)
    except (TypeError, ValueError):
        return None, "El precio tiene que ser un número"
    if numero <= 0:
        return None, "El precio tiene que ser mayor que cero"
    return numero, None


def _servicio_existe(servicio_id) -> bool:
    with db.get_connection() as conn:
        return conn.execute(
            "SELECT 1 FROM servicios WHERE id = ?", (servicio_id,)
        ).fetchone() is not None


@bp.get("/mano-obra")
@login_required
def mano_obra():
    """
    Los 235 servicios de una lista, con el precio de la Cámara y el propio.
    Es lo que muestra el apartado 1 de la pantalla.
    """
    lista_num, error = _lista_pedida(request.args.get("lista"))
    if error:
        return jsonify({"error": error}), 400
    return jsonify({
        "lista_num": lista_num,
        "ajuste_general_pct": precios.get_ajuste_general_pct(),
        "servicios": facra.get_servicios_para_lista(lista_num),
    })


@bp.get("/listas")
@login_required
def listas():
    """
    Las trece listas con cuántos motores usa cada una. Sirve para que el
    selector no sea trece números pelados: la lista 8 tiene 99 motores y la 11
    tiene 5, y eso decide cuál conviene tarifar primero.
    """
    with db.get_connection() as conn:
        filas = conn.execute(
            "SELECT lista_num, COUNT(*) FROM motores "
            "WHERE lista_num IS NOT NULL GROUP BY lista_num"
        ).fetchall()
        propios = dict(conn.execute(
            "SELECT lista_num, COUNT(*) FROM precios_mano_obra GROUP BY lista_num"
        ).fetchall())
    motores = dict(filas)
    return jsonify([
        {"lista_num": n, "motores": motores.get(n, 0), "propios": propios.get(n, 0)}
        for n in precios.LISTAS
    ])


@bp.post("/mano-obra")
@login_required
def guardar_mano_obra():
    """Fija un precio propio, opcionalmente propagado a las trece listas."""
    data = request.get_json(silent=True) or {}

    servicio_id = data.get("servicio_id")
    if not servicio_id or not _servicio_existe(servicio_id):
        return jsonify({"error": "Servicio no encontrado"}), 404

    lista_num, error = _lista_pedida(data.get("lista_num"))
    if error:
        return jsonify({"error": error}), 400

    precio, error = _precio_pedido(data.get("precio"))
    if error:
        return jsonify({"error": error}), 400

    escritas = precios.guardar(
        servicio_id, lista_num, precio,
        propagar=bool(data.get("propagar")),
        origen=data.get("origen") or "pantalla",
        presupuesto_id=data.get("presupuesto_id"),
    )
    return jsonify({"guardados": escritas})


@bp.post("/mano-obra/lote")
@login_required
def guardar_lote():
    """
    Varios precios de una misma lista de una sola vez: lo que confirma el
    resumen de Revisión del wizard ("editaste 3 precios, ¿los guardo?").
    """
    data = request.get_json(silent=True) or {}

    lista_num, error = _lista_pedida(data.get("lista_num"))
    if error:
        return jsonify({"error": error}), 400

    entrada = data.get("precios") or []
    if not isinstance(entrada, list) or not entrada:
        return jsonify({"error": "No hay precios para guardar"}), 400

    # Se valida TODO antes de escribir nada: un renglón malo no puede dejar la
    # tanda guardada por la mitad.
    limpios = []
    for item in entrada:
        if not isinstance(item, dict):
            return jsonify({"error": "Precio mal formado"}), 400
        servicio_id = item.get("servicio_id")
        if not servicio_id or not _servicio_existe(servicio_id):
            return jsonify({"error": f"Servicio {servicio_id} no encontrado"}), 404
        precio, error = _precio_pedido(item.get("precio"))
        if error:
            return jsonify({"error": error}), 400
        limpios.append({"servicio_id": servicio_id, "precio": precio})

    escritas = precios.guardar_lote(
        lista_num, limpios,
        origen=data.get("origen") or "presupuesto",
        presupuesto_id=data.get("presupuesto_id"),
    )
    return jsonify({"guardados": escritas})


@bp.get("/mano-obra/propagacion")
@login_required
def propagacion():
    """
    Vista previa de los trece montos, sin escribir nada. Es lo que se muestra
    ANTES de confirmar una propagación: cambiar de una vez el precio de trece
    listas no puede pasar a ciegas.
    """
    servicio_id = request.args.get("servicio_id")
    if not servicio_id or not str(servicio_id).isdigit() or not _servicio_existe(int(servicio_id)):
        return jsonify({"error": "Servicio no encontrado"}), 404

    lista_num, error = _lista_pedida(request.args.get("lista"))
    if error:
        return jsonify({"error": error}), 400

    precio, error = _precio_pedido(request.args.get("precio"))
    if error:
        return jsonify({"error": error}), 400

    return jsonify(precios.previsualizar_propagacion(int(servicio_id), lista_num, precio))


@bp.delete("/mano-obra")
@login_required
def borrar_mano_obra():
    """El ↺: el servicio vuelve a valer lo de la Cámara."""
    data = request.get_json(silent=True) or {}

    servicio_id = data.get("servicio_id")
    if not servicio_id or not _servicio_existe(servicio_id):
        return jsonify({"error": "Servicio no encontrado"}), 404

    # Sin lista_num se borran las trece; con una, solo esa.
    lista_num = None
    if data.get("lista_num") is not None:
        lista_num, error = _lista_pedida(data.get("lista_num"))
        if error:
            return jsonify({"error": error}), 400

    return jsonify({"borrados": precios.borrar(servicio_id, lista_num)})


@bp.get("/mios")
@login_required
def mios():
    """Todo lo que tarifó el taller: el apartado "Mis precios"."""
    return jsonify(precios.listar_propios())


@bp.get("/ajuste-general")
@login_required
def get_ajuste_general():
    """
    Solo el %, sin los 235 servicios. Lo consulta el wizard para poder avisar
    "tu lista ya tiene +25%" al lado de su propio ajuste por presupuesto: son dos
    porcentajes distintos sobre la misma mano de obra y aplicarlos sin saber del
    otro es el error más fácil de cometer acá.
    """
    return jsonify({"pct": precios.get_ajuste_general_pct()})


@bp.put("/ajuste-general")
@login_required
def ajuste_general():
    """% sobre toda la lista de la Cámara. No pisa los precios propios."""
    data = request.get_json(silent=True) or {}
    try:
        pct = float(data.get("pct"))
    except (TypeError, ValueError):
        return jsonify({"error": "El porcentaje tiene que ser un número"}), 400
    # Un -100% dejaría toda la mano de obra en cero y un número enorme es casi
    # seguro un error de tipeo (un 2500 en vez de 25). Se acota a algo que un
    # taller pueda querer de verdad.
    if not -90 <= pct <= 500:
        return jsonify({"error": "El porcentaje tiene que estar entre -90 y 500"}), 400
    return jsonify({"pct": precios.set_ajuste_general_pct(pct)})
