import os

from flask import Blueprint, jsonify, request, send_from_directory, abort

from .. import db, facra, pdf_gen, config, crac
from ..auth import login_required

bp = Blueprint("presupuestos", __name__, url_prefix="/api/presupuestos")


def _categoria_de_item(it):
    """
    Nombre que sale en el PDF para una línea de repuesto. Se usa la categoría
    congelada al cotizar; para presupuestos anteriores a esa columna se resuelve
    por código contra el catálogo vigente, y si tampoco está (repuesto manual o
    código dado de baja) se cae a la descripción, que es lo único que queda.
    """
    categoria = (it.get("categoria") or "").strip()
    if categoria:
        return categoria
    codigo = it.get("repuesto_codigo")
    if codigo:
        del_catalogo = crac.get_repuesto_por_codigo(codigo)
        if del_catalogo and del_catalogo.get("categoria"):
            return del_catalogo["categoria"]
    return (it.get("descripcion_custom") or "").strip() or "Repuesto"


def _agrupar_repuestos(items_repuesto):
    """
    El PDF muestra los repuestos por categoría (ej. "Aros"), sin código ni
    descripción del proveedor: son datos internos que el cliente no necesita.
    Varias líneas de la misma categoría se suman en una sola fila; el precio
    unitario solo tiene sentido si todas comparten el mismo, si no va None y el
    PDF imprime "—". Se respeta el orden de aparición de la primera línea.
    """
    agrupados = {}
    for it in items_repuesto:
        categoria = _categoria_de_item(it)
        grupo = agrupados.get(categoria)
        if grupo is None:
            grupo = {
                "descripcion": categoria,
                "cantidad": 0,
                "precio_unitario": None,
                "precio_aplicado": 0,
                "_unitarios": set(),
            }
            agrupados[categoria] = grupo
        grupo["cantidad"] += it["cantidad"] or 0
        grupo["precio_aplicado"] += it["precio_aplicado"] or 0
        grupo["_unitarios"].add(it["precio_unitario"])

    resultado = []
    for grupo in agrupados.values():
        unitarios = grupo.pop("_unitarios")
        grupo["precio_unitario"] = unitarios.pop() if len(unitarios) == 1 else None
        resultado.append(grupo)
    return resultado


def _items_para_pdf(presupuesto_id):
    """Separa servicios y repuestos: el PDF los imprime en secciones distintas."""
    items_full = db.get_presupuesto_items_full(presupuesto_id)
    servicios = [
        {
            "item_num": it["item_num"],
            "descripcion": it["desc_facra"] or it["descripcion_custom"],
            "precio_aplicado": it["precio_aplicado"],
            "cantidad": it["cantidad"],
        }
        for it in items_full
        if it["tipo"] != "repuesto"
    ]
    repuestos = _agrupar_repuestos([it for it in items_full if it["tipo"] == "repuesto"])
    return servicios, repuestos


def _resolver_repuesto(it, congelar_stock=True):
    """
    Normaliza un ítem repuesto del payload. El subtotal (precio_aplicado) se
    calcula SIEMPRE server-side como cantidad × unitario. El unitario que manda
    el cliente se respeta (es editable por diseño); si no vino y hay código en
    el catálogo, se toma el de la lista. Devuelve None si el ítem es inválido.

    congelar_stock: en la creación el stock se lee del catálogo (no se confía
    en el cliente); en la edición se preserva el valor congelado que el
    frontend devuelve tal cual lo recibió.
    """
    try:
        cantidad = float(it.get("cantidad", 1))
    except (TypeError, ValueError):
        return None
    if cantidad <= 0:
        return None

    codigo = (it.get("repuesto_codigo") or "").strip() or None
    desc = (it.get("descripcion") or it.get("descripcion_custom") or "").strip()
    precio_unitario = it.get("precio_unitario")
    stock_al_cotizar = None if congelar_stock else it.get("stock_al_cotizar")
    # La categoría es lo único del repuesto que sale en el PDF, así que se congela
    # igual que el precio: el catálogo manda, y si el ítem es manual (o su código
    # ya no está en la lista) se usa la que haya cargado el usuario.
    categoria = (it.get("categoria") or "").strip() or None

    if codigo:
        del_catalogo = crac.get_repuesto_por_codigo(codigo)
        if del_catalogo:
            if precio_unitario is None:
                precio_unitario = del_catalogo["precio"]
            if not desc:
                desc = (del_catalogo["aplicacion"] or "").strip() or codigo
            if del_catalogo.get("categoria"):
                categoria = del_catalogo["categoria"]
            if congelar_stock:
                stock_al_cotizar = del_catalogo["stock"]
        # Código que ya no está en el catálogo (ej. reimport a mitad del wizard):
        # se acepta igual como línea manual con el código que vino, siempre que
        # traiga descripción y unitario propios.

    try:
        precio_unitario = float(precio_unitario)
    except (TypeError, ValueError):
        return None
    if not desc:
        return None

    return {
        "servicio_id": None,
        "descripcion_custom": desc,
        "precio_aplicado": round(cantidad * precio_unitario, 2),
        "tipo": "repuesto",
        "repuesto_codigo": codigo,
        "cantidad": cantidad,
        "precio_unitario": precio_unitario,
        "stock_al_cotizar": stock_al_cotizar,
        "categoria": categoria,
    }


def _descripcion_descartado(it):
    return (
        (it.get("descripcion") or it.get("descripcion_custom") or "").strip()
        or (it.get("repuesto_codigo") or "").strip()
        or f"servicio #{it.get('servicio_id')}"
    )


def _resolver_items(items_payload, lista_num, ajuste_pct=0):
    """
    Recalcula el precio server-side para ítems de FACRA (no confía en el precio
    que mande el cliente); los ítems custom usan el precio que carga el usuario
    a mano, porque no existe otra fuente de verdad para un servicio ad-hoc.
    Los repuestos congelan código, unitario y stock al momento de cotizar.

    Los servicios (FACRA o custom) admiten una cantidad (default 1, ej. "Reunir
    cilindros" ×4 en un motor de 4 cilindros): el subtotal siempre se calcula acá
    como cantidad × unitario, igual que ya se hace con repuestos.

    ajuste_pct: aumento (positivo) o descuento (negativo) en porcentaje sobre el
    precio de lista de mano de obra, ej. 5 = +5%, -10 = -10%. Se aplica SOLO a
    los servicios de la lista FACRA (no a ítems custom ni a repuestos): esos ya
    tienen un precio que el usuario eligió a mano, adjustarlos de nuevo por un
    % global sería doble ajuste. El precio ajustado queda grabado como si fuera
    el precio de lista (no se persiste el % por separado).

    Retorna (resueltos, descartados): descartados lleva una descripción por cada
    ítem inválido, para avisar en vez de perderlo en silencio.
    """
    factor_ajuste = 1 + (float(ajuste_pct or 0) / 100)
    precios_lista = {s["id"]: s["precio"] for s in facra.get_servicios_para_lista(lista_num)}
    resueltos, descartados = [], []
    for it in items_payload:
        if it.get("tipo") == "repuesto":
            resuelto = _resolver_repuesto(it, congelar_stock=True)
            if resuelto:
                resueltos.append(resuelto)
            else:
                descartados.append(_descripcion_descartado(it))
            continue

        try:
            cantidad = float(it.get("cantidad", 1))
        except (TypeError, ValueError):
            descartados.append(_descripcion_descartado(it))
            continue
        if cantidad <= 0:
            descartados.append(_descripcion_descartado(it))
            continue

        servicio_id = it.get("servicio_id")
        if servicio_id:
            if servicio_id not in precios_lista:
                descartados.append(_descripcion_descartado(it))
                continue
            precio_unitario = round(precios_lista[servicio_id] * factor_ajuste, 2)
            resueltos.append({
                "servicio_id": servicio_id,
                "descripcion_custom": None,
                "precio_aplicado": round(precio_unitario * cantidad, 2),
                "cantidad": cantidad,
                "precio_unitario": precio_unitario,
            })
        else:
            desc = (it.get("descripcion_custom") or "").strip()
            if not desc:
                descartados.append(_descripcion_descartado(it))
                continue
            try:
                # El campo que carga el usuario a mano es el precio unitario.
                precio_unitario = float(it.get("precio_aplicado"))
            except (TypeError, ValueError):
                descartados.append(desc)
                continue
            resueltos.append({
                "servicio_id": None,
                "descripcion_custom": desc,
                "precio_aplicado": round(precio_unitario * cantidad, 2),
                "cantidad": cantidad,
                "precio_unitario": precio_unitario,
            })
    return resueltos, descartados


def _resolver_items_edicion(items_payload):
    """
    A diferencia de la creación, al editar un presupuesto ya existente el precio
    de CUALQUIER ítem (incluidos los de FACRA) es editable a mano — así es como
    ya funciona la app de escritorio (permite ajustar/descontar un precio en la
    edición), así que acá se confía en el unitario que manda el cliente en vez
    de recalcularlo contra el catálogo. El subtotal (precio_aplicado) se
    recalcula igual server-side como cantidad × unitario, tanto para servicios
    como para repuestos, para no arrastrar drift de redondeo entre cliente y
    servidor. Para repuestos se preservan además el código y el stock
    congelados que el frontend devuelve intactos.
    """
    resueltos = []
    for it in items_payload:
        if it.get("tipo") == "repuesto":
            resuelto = _resolver_repuesto(it, congelar_stock=False)
            if resuelto:
                resueltos.append(resuelto)
            continue

        try:
            # precio_unitario es el campo nuevo; se acepta precio_aplicado como
            # fallback para presupuestos armados antes de este cambio (cantidad 1).
            precio_unitario = float(it.get("precio_unitario", it.get("precio_aplicado")))
            cantidad = float(it.get("cantidad", 1))
        except (TypeError, ValueError):
            continue
        if cantidad <= 0:
            continue
        precio_aplicado = round(precio_unitario * cantidad, 2)

        servicio_id = it.get("servicio_id")
        if servicio_id:
            resueltos.append({
                "servicio_id": servicio_id, "descripcion_custom": None,
                "precio_aplicado": precio_aplicado, "cantidad": cantidad, "precio_unitario": precio_unitario,
            })
        else:
            desc = (it.get("descripcion_custom") or "").strip()
            if not desc:
                continue
            resueltos.append({
                "servicio_id": None, "descripcion_custom": desc,
                "precio_aplicado": precio_aplicado, "cantidad": cantidad, "precio_unitario": precio_unitario,
            })
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
    try:
        ajuste_pct = float(data.get("ajuste_pct") or 0)
    except (TypeError, ValueError):
        ajuste_pct = 0

    if not cliente_nombre:
        return jsonify({"error": "Falta el nombre del cliente"}), 400
    if not motor_id:
        return jsonify({"error": "Falta el motor"}), 400

    motor = db.get_motor(motor_id)
    if not motor:
        return jsonify({"error": "Motor no encontrado"}), 404

    items_resueltos, descartados = _resolver_items(items_payload, motor.get("lista_num"), ajuste_pct)
    if descartados:
        return jsonify({
            "error": "Algunos ítems no se pudieron procesar: " + ", ".join(descartados),
            "items_descartados": descartados,
        }), 400
    if not items_resueltos:
        return jsonify({"error": "Agregá al menos un servicio o repuesto"}), 400

    presupuesto_id = db.guardar_presupuesto(cliente_nombre, motor_id, items_resueltos, ajuste_pct)

    detalle = db.get_presupuesto_detalle(presupuesto_id)
    nombre_archivo = f"presupuesto_{presupuesto_id:04d}.pdf"
    items_servicios, items_repuestos = _items_para_pdf(presupuesto_id)
    pdf_gen.generar_pdf(
        presupuesto_id, detalle["cliente"], detalle["motor"],
        items_servicios, detalle["total"],
        os.path.join(config.PDFS_DIR, nombre_archivo),
        repuestos=items_repuestos,
    )
    # Se guarda solo el nombre del archivo (no la ruta completa) para que la DB
    # sea portable entre entornos — la ruta completa se reconstruye siempre
    # contra config.PDFS_DIR del servidor donde corre la app en ese momento.
    db.guardar_pdf_historial(presupuesto_id, nombre_archivo)

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
    try:
        ajuste_pct = float(data.get("ajuste_pct") or 0)
    except (TypeError, ValueError):
        ajuste_pct = 0

    items_resueltos = _resolver_items_edicion(items_payload)
    if not items_resueltos:
        return jsonify({"error": "Agregá al menos un servicio o repuesto"}), 400

    db.actualizar_presupuesto(presupuesto_id, items_resueltos, notas, ajuste_pct)
    return jsonify(db.get_presupuesto_detalle(presupuesto_id))


@bp.delete("/<int:presupuesto_id>")
@login_required
def eliminar(presupuesto_id):
    if not db.get_presupuesto_detalle(presupuesto_id):
        return jsonify({"error": "Presupuesto no encontrado"}), 404

    for pdf in db.get_pdfs_presupuesto(presupuesto_id):
        ruta = os.path.join(config.PDFS_DIR, pdf["pdf_path"])
        if os.path.exists(ruta):
            os.remove(ruta)

    db.eliminar_presupuesto(presupuesto_id)
    return "", 204


@bp.post("/<int:presupuesto_id>/pdf")
@login_required
def reconstruir_pdf(presupuesto_id):
    detalle = db.get_presupuesto_detalle(presupuesto_id)
    if not detalle:
        return jsonify({"error": "Presupuesto no encontrado"}), 404

    versiones = db.get_pdfs_presupuesto(presupuesto_id)
    siguiente_version = (versiones[0]["version"] + 1) if versiones else 1
    nombre_archivo = f"presupuesto_{presupuesto_id:04d}_v{siguiente_version}.pdf"

    items_servicios, items_repuestos = _items_para_pdf(presupuesto_id)
    pdf_gen.generar_pdf(
        presupuesto_id, detalle["cliente"], detalle["motor"],
        items_servicios, detalle["total"],
        os.path.join(config.PDFS_DIR, nombre_archivo),
        repuestos=items_repuestos,
    )
    db.guardar_pdf_historial(presupuesto_id, nombre_archivo)

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

    descargar = request.args.get("descargar") == "1"
    return send_from_directory(config.PDFS_DIR, match["pdf_path"], as_attachment=descargar, download_name=match["pdf_path"])
