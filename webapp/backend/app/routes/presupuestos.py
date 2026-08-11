import os

from flask import Blueprint, jsonify, request, send_from_directory, abort

from .. import db, facra, pdf_gen, config, crac
from ..auth import login_required
from ..helpers import formato_precio_ars

bp = Blueprint("presupuestos", __name__, url_prefix="/api/presupuestos")

TIPOS_CLIENTE_VALIDOS = {"mecanico", "dueno"}


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


def _resolver_grupos(grupos_payload, congelar_stock=True):
    """
    Resuelve los grupos de opciones de repuesto.

    Un grupo es una necesidad del motor (ej. "Cojinetes biela") cubierta por
    varias piezas intercambiables. Se cotiza **la de mayor subtotal** — la
    tolerancia del taller: si el día de la compra la barata no está, el
    presupuesto ya cubre la cara. Medido por subtotal y no por precio de lista
    porque las marcas vienen en envases distintos: un juego de 8 a $1.000 sale
    menos que 4 blísters de 2 a $400 ($1.600), aunque el precio de lista del
    primero sea más alto.

    Devuelve (items, opciones, descartados):
      - items: una línea por grupo (la elegida), para presupuesto_items. Así los
        totales, el PDF y las búsquedas siguen viendo exactamente lo de antes.
      - opciones: todas las alternativas, para presupuesto_item_opciones.
      - descartados: grupos que no se pudieron resolver, para avisar.
    """
    items, opciones, descartados = [], [], []

    for indice, grupo in enumerate(grupos_payload or [], start=1):
        resueltas = []
        for op in grupo.get("opciones") or []:
            resuelto = _resolver_repuesto(op, congelar_stock=congelar_stock)
            if not resuelto:
                descartados.append(_descripcion_descartado(op))
                continue
            del_catalogo = crac.get_repuesto_por_codigo(resuelto["repuesto_codigo"]) if resuelto["repuesto_codigo"] else None
            resueltas.append({
                **resuelto,
                "grupo_num": indice,
                # marca y medida son datos del proveedor que no salen nunca en el
                # PDF, pero sí hacen falta para armar el pedido después.
                "marca": (del_catalogo or {}).get("marca") or op.get("marca"),
                "medida": (del_catalogo or {}).get("medida") or op.get("medida"),
            })

        if not resueltas:
            continue

        # La categoría del grupo manda sobre la de cada opción: es lo único que
        # lee el cliente en el PDF, y todas las opciones del grupo son la misma
        # pieza. Si el grupo no la trae, se usa la de la primera opción resuelta.
        categoria = (grupo.get("categoria") or "").strip() or resueltas[0].get("categoria")
        for r in resueltas:
            r["categoria"] = categoria

        elegida = _elegir_opcion(resueltas, grupo.get("elegida_a_mano"))

        for r in resueltas:
            es_elegida = r is elegida
            opciones.append({
                "grupo_num": indice,
                "repuesto_codigo": r["repuesto_codigo"],
                "descripcion": r["descripcion_custom"],
                "categoria": categoria,
                "marca": r.get("marca"),
                "medida": r.get("medida"),
                "cantidad": r["cantidad"],
                "precio_unitario": r["precio_unitario"],
                "subtotal": r["precio_aplicado"],
                "stock_al_cotizar": r["stock_al_cotizar"],
                "elegida": es_elegida,
                "elegida_a_mano": es_elegida and bool(grupo.get("elegida_a_mano")),
            })

        items.append({k: v for k, v in elegida.items() if k not in ("marca", "medida")})

    return items, opciones, descartados


def _elegir_opcion(resueltas, codigo_a_mano=None):
    """
    La opción con la que se cotiza el grupo. Normalmente la de mayor subtotal;
    si el usuario pisó la elección a mano y ese código está en el grupo, gana ese.
    Una opción sin precio (el catálogo tiene ~12.000 con precio 0) nunca puede
    ganar por precio, pero queda igual guardada para el pedido.
    """
    if codigo_a_mano:
        for r in resueltas:
            if r["repuesto_codigo"] == codigo_a_mano:
                return r

    con_precio = [r for r in resueltas if (r["precio_aplicado"] or 0) > 0]
    candidatas = con_precio or resueltas
    # max() con clave devuelve el primero ante empate, que es lo que queremos.
    return max(candidatas, key=lambda r: r["precio_aplicado"] or 0)


def _grupos_para_ficha(opciones):
    """Convierte las opciones resueltas al formato de la ficha del motor, para
    que el motor quede cargado con lo que se acaba de presupuestar."""
    por_grupo: dict[int, dict] = {}
    for op in opciones:
        if not op.get("repuesto_codigo"):
            continue  # los repuestos fuera de catálogo no van a la ficha
        grupo = por_grupo.setdefault(op["grupo_num"], {
            "categoria": op.get("categoria"),
            "cat_prefijo": None,
            "opciones": [],
        })
        grupo["opciones"].append({"codigo": op["repuesto_codigo"], "cantidad": op["cantidad"]})
    return [g for g in por_grupo.values() if g["categoria"] and g["opciones"]]


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


def _linea_revalidada(fila):
    """
    Precio, stock y avisos de una línea congelada, medidos contra el catálogo de
    HOY. La fila viene de get_presupuesto_items_full o de get_grupos_presupuesto,
    que ya traen precio_actual/stock_actual resueltos por código.

    Un código que ya no está en el catálogo CONSERVA su precio cotizado y se
    marca: sacarlo del presupuesto perdería en silencio algo que el motor
    necesita. stock es NOT NULL en el catálogo, así que stock_actual en None solo
    puede significar que la fila ya no existe.

    Devuelve (precio, stock, cambio, avisos).
    """
    en_catalogo = fila.get("stock_actual") is not None
    precio_antes = fila.get("precio_unitario") or 0
    stock_antes = fila.get("stock_al_cotizar")

    if en_catalogo:
        precio = fila.get("precio_actual") or 0
        stock = fila.get("stock_actual")
    else:
        precio = precio_antes
        stock = stock_antes

    avisos = []
    if not en_catalogo:
        avisos.append("Ya no está en el catálogo — se mantiene el precio cotizado")
    elif precio != precio_antes:
        if precio == 0:
            avisos.append("El catálogo de hoy no le pone precio")
        else:
            avisos.append(
                f"Precio: {formato_precio_ars(precio_antes)} → {formato_precio_ars(precio)}"
            )
    if stock == 0:
        avisos.append("Sin stock hoy")

    return precio, stock, (precio != precio_antes or stock != stock_antes), avisos


def _resumen_opcion(codigo, descripcion, marca, medida, cantidad, precio):
    return {
        "repuesto_codigo": codigo,
        "descripcion": descripcion,
        "marca": marca,
        "medida": medida,
        "cantidad": cantidad,
        "precio_unitario": precio,
        "subtotal": round((precio or 0) * (cantidad or 0), 2),
    }


def _revalidacion(presupuesto_id, detalle):
    """
    Recotiza el presupuesto contra el catálogo de HOY sin tocar nada, y devuelve
    (resumen, payload): el resumen es lo que se le muestra al dueño para que
    confirme, el payload es exactamente lo que se guarda si confirma. Los dos
    salen del mismo cálculo, así que no pueden discrepar.

    Solo se recotizan los repuestos. La mano de obra se compara igual contra la
    lista FACRA vigente, pero NO se toca: cambiar un precio de mano de obra es
    una decisión del taller (se hace a mano desde Editar, con el ajuste %), no
    algo que dependa del proveedor. Se informa aparte, como aviso.

    Dentro de cada grupo vuelve a ganar la de mayor subtotal — con la misma
    _elegir_opcion que usan la creación y la edición, no una copia de la regla —
    así que si otra marca pasó a ser la más cara, el resumen lo muestra.
    """
    grupos_resumen, grupos_payload = [], []
    subtotal_rep_antes = subtotal_rep_ahora = 0.0
    hay_cambios_repuestos = False

    # Ordenado por grupo_num: _resolver_grupos reasigna el número por posición,
    # así que mantener el orden mantiene los números que ya tenía el presupuesto.
    for grupo in sorted(db.get_grupos_presupuesto(presupuesto_id), key=lambda g: g["grupo_num"]):
        elegida_a_mano = next(
            (o["repuesto_codigo"] for o in grupo["opciones"] if o["elegida_a_mano"]), None
        )
        anterior = next((o for o in grupo["opciones"] if o["elegida"]), None)

        opciones_payload, avisos_por_codigo = [], {}
        for o in grupo["opciones"]:
            precio, stock, cambio, avisos = _linea_revalidada(o)
            hay_cambios_repuestos = hay_cambios_repuestos or cambio
            avisos_por_codigo[o["repuesto_codigo"]] = avisos
            opciones_payload.append({
                "repuesto_codigo": o["repuesto_codigo"],
                "descripcion": o["descripcion"],
                "categoria": o["categoria"],
                "marca": o["marca"],
                "medida": o["medida"],
                "cantidad": o["cantidad"],
                "precio_unitario": precio,
                "stock_al_cotizar": stock,
            })

        if not opciones_payload:
            continue

        resueltas = [
            {**op, "precio_aplicado": round((op["precio_unitario"] or 0) * (op["cantidad"] or 0), 2)}
            for op in opciones_payload
        ]
        elegida = _elegir_opcion(resueltas, elegida_a_mano)

        subtotal_antes = (anterior or {}).get("subtotal") or 0
        subtotal_ahora = elegida["precio_aplicado"]
        subtotal_rep_antes += subtotal_antes
        subtotal_rep_ahora += subtotal_ahora

        cambio_de_opcion = bool(
            anterior and anterior["repuesto_codigo"] != elegida["repuesto_codigo"]
        )
        hay_cambios_repuestos = hay_cambios_repuestos or cambio_de_opcion

        grupos_payload.append({
            "categoria": grupo["categoria"],
            "elegida_a_mano": elegida_a_mano,
            "opciones": opciones_payload,
        })
        grupos_resumen.append({
            "grupo_num": grupo["grupo_num"],
            "categoria": grupo["categoria"],
            "subtotal_antes": subtotal_antes,
            "subtotal_ahora": subtotal_ahora,
            "diferencia": round(subtotal_ahora - subtotal_antes, 2),
            "cambio_de_opcion": cambio_de_opcion,
            "elegida_a_mano": bool(elegida_a_mano),
            "elegida_antes": _resumen_opcion(
                (anterior or {}).get("repuesto_codigo"), (anterior or {}).get("descripcion"),
                (anterior or {}).get("marca"), (anterior or {}).get("medida"),
                (anterior or {}).get("cantidad"), (anterior or {}).get("precio_unitario"),
            ) if anterior else None,
            "elegida_ahora": _resumen_opcion(
                elegida["repuesto_codigo"], elegida["descripcion"], elegida["marca"],
                elegida["medida"], elegida["cantidad"], elegida["precio_unitario"],
            ),
            "avisos": avisos_por_codigo.get(elegida["repuesto_codigo"], []),
        })

    # Ítems sueltos (repuestos fuera de grupo) y servicios.
    items_payload, sueltos_resumen, mano_obra_lineas = [], [], []
    total_servicios = 0.0
    subtotal_mo_antes = subtotal_mo_ahora = 0.0

    factor_ajuste = 1 + (float(detalle.get("ajuste_pct") or 0) / 100)
    precios_lista = {
        s["id"]: s["precio"] for s in facra.get_servicios_para_lista(detalle.get("lista_num"))
    }

    for it in db.get_presupuesto_items_full(presupuesto_id):
        if it["tipo"] == "repuesto":
            if it["grupo_num"] is not None:
                continue  # ya rearmado arriba, como parte de su grupo
            precio, stock, cambio, avisos = _linea_revalidada(it)
            hay_cambios_repuestos = hay_cambios_repuestos or cambio
            items_payload.append({
                "tipo": "repuesto",
                "repuesto_codigo": it["repuesto_codigo"],
                "descripcion": it["descripcion_custom"],
                "categoria": it["categoria"],
                "cantidad": it["cantidad"],
                "precio_unitario": precio,
                "stock_al_cotizar": stock,
            })
            subtotal_antes = it["precio_aplicado"] or 0
            subtotal_ahora = round(precio * (it["cantidad"] or 0), 2)
            subtotal_rep_antes += subtotal_antes
            subtotal_rep_ahora += subtotal_ahora
            if cambio:
                sueltos_resumen.append({
                    "repuesto_codigo": it["repuesto_codigo"],
                    "descripcion": it["categoria"] or it["descripcion_custom"],
                    "cantidad": it["cantidad"],
                    "precio_antes": it["precio_unitario"],
                    "precio_ahora": precio,
                    "subtotal_antes": subtotal_antes,
                    "subtotal_ahora": subtotal_ahora,
                    "diferencia": round(subtotal_ahora - subtotal_antes, 2),
                    "avisos": avisos,
                })
            continue

        # Servicio: se copia tal cual. _resolver_items_edicion confía en el
        # unitario recibido, que es justo lo que queremos para no tocarlo.
        unitario = it["precio_unitario"] if it["precio_unitario"] is not None else it["precio_aplicado"]
        items_payload.append({
            "servicio_id": it["servicio_id"],
            "descripcion_custom": it["descripcion_custom"],
            "cantidad": it["cantidad"],
            "precio_unitario": unitario,
        })
        total_servicios += it["precio_aplicado"] or 0

        if not it["servicio_id"]:
            continue  # ítem manual: no hay lista contra la cual compararlo
        precio_lista = precios_lista.get(it["servicio_id"])
        if precio_lista is None:
            continue  # servicio sin precio en la lista de este motor
        cantidad = it["cantidad"] or 1
        precio_hoy = round(precio_lista * factor_ajuste, 2)
        subtotal_mo_antes += round((unitario or 0) * cantidad, 2)
        subtotal_mo_ahora += round(precio_hoy * cantidad, 2)
        if precio_hoy != unitario:
            mano_obra_lineas.append({
                "descripcion": it["desc_facra"],
                "cantidad": cantidad,
                "precio_antes": unitario,
                "precio_ahora": precio_hoy,
                "diferencia": round((precio_hoy - (unitario or 0)) * cantidad, 2),
            })

    total_antes = detalle.get("total") or 0
    total_nuevo = round(total_servicios + subtotal_rep_ahora, 2)

    resumen = {
        "hay_cambios": bool(hay_cambios_repuestos or mano_obra_lineas),
        "hay_cambios_repuestos": bool(hay_cambios_repuestos),
        "hay_cambios_mano_obra": bool(mano_obra_lineas),
        "repuestos": {
            "grupos": grupos_resumen,
            "sueltos": sueltos_resumen,
            "subtotal_antes": round(subtotal_rep_antes, 2),
            "subtotal_ahora": round(subtotal_rep_ahora, 2),
            "diferencia": round(subtotal_rep_ahora - subtotal_rep_antes, 2),
        },
        "mano_obra": {
            "lineas": mano_obra_lineas,
            "subtotal_antes": round(subtotal_mo_antes, 2),
            "subtotal_ahora": round(subtotal_mo_ahora, 2),
            "diferencia": round(subtotal_mo_ahora - subtotal_mo_antes, 2),
        },
        "total_antes": total_antes,
        "total_nuevo": total_nuevo,
        "diferencia": round(total_nuevo - total_antes, 2),
        "catalogo": crac.get_info_catalogo(),
    }
    return resumen, {"items": items_payload, "grupos_repuestos": grupos_payload}


def _regenerar_pdf(presupuesto_id):
    """
    Emite una versión nueva del PDF con el estado actual del presupuesto y la
    registra en el historial. Se relee el detalle acá adentro a propósito: quien
    llama puede haber cambiado el total justo antes, y el total es lo que se
    imprime. Devuelve el historial de versiones ya actualizado.
    """
    detalle = db.get_presupuesto_detalle(presupuesto_id)
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
    return db.get_pdfs_presupuesto(presupuesto_id)


@bp.get("")
@login_required
def listar():
    repuesto = request.args.get("repuesto") or None
    motor = request.args.get("motor") or None
    cliente = request.args.get("cliente") or None
    desde = request.args.get("desde") or None
    hasta = request.args.get("hasta") or None
    if repuesto or motor or cliente or desde or hasta:
        return jsonify(db.buscar_presupuestos(repuesto=repuesto, motor=motor, cliente=cliente, desde=desde, hasta=hasta))
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


@bp.get("/<int:presupuesto_id>/grupos")
@login_required
def grupos(presupuesto_id):
    """Grupos de opciones congelados, para reconstruirlos al editar."""
    if not db.get_presupuesto_detalle(presupuesto_id):
        return jsonify({"error": "Presupuesto no encontrado"}), 404
    return jsonify(db.get_grupos_presupuesto(presupuesto_id))


@bp.post("/<int:presupuesto_id>/aprobar")
@login_required
def aprobar(presupuesto_id):
    """Marca/desmarca que el cliente aprobó el presupuesto."""
    if not db.get_presupuesto_detalle(presupuesto_id):
        return jsonify({"error": "Presupuesto no encontrado"}), 404
    data = request.get_json(silent=True) or {}
    aprobado = bool(data.get("aprobado", True))
    return jsonify({"aprobado_en": db.aprobar_presupuesto(presupuesto_id, aprobado)})


@bp.get("/<int:presupuesto_id>/revalidacion")
@login_required
def revalidacion(presupuesto_id):
    """Qué cambiaría si se recotizara contra el catálogo de hoy. No toca nada."""
    detalle = db.get_presupuesto_detalle(presupuesto_id)
    if not detalle:
        return jsonify({"error": "Presupuesto no encontrado"}), 404

    resumen, _payload = _revalidacion(presupuesto_id, detalle)
    return jsonify(resumen)


@bp.post("/<int:presupuesto_id>/revalidar")
@login_required
def revalidar(presupuesto_id):
    """
    Aplica los precios de hoy a los repuestos y emite una versión nueva del PDF.
    Se recalcula todo acá de nuevo: no se confía en el resumen que vio el
    navegador, que pudo quedar viejo si el catálogo se reimportó mientras tanto.

    La mano de obra no se toca (ver _revalidacion), así que si lo único que
    cambió fue la lista de FACRA no hay nada que guardar y no se emite versión
    nueva de PDF — tocar el botón dos veces no acumula versiones.
    """
    detalle = db.get_presupuesto_detalle(presupuesto_id)
    if not detalle:
        return jsonify({"error": "Presupuesto no encontrado"}), 404

    resumen, payload = _revalidacion(presupuesto_id, detalle)
    if not resumen["hay_cambios_repuestos"]:
        return jsonify({"sin_cambios": True, "resumen": resumen})

    items_resueltos = _resolver_items_edicion(payload["items"])
    # congelar_stock=False: el stock de hoy ya viene calculado en el payload, y
    # así las líneas fuera de catálogo conservan el que tenían congelado.
    items_grupos, opciones, _ = _resolver_grupos(payload["grupos_repuestos"], congelar_stock=False)
    items_resueltos += items_grupos
    if not items_resueltos:
        return jsonify({"error": "El presupuesto quedaría vacío"}), 400

    db.actualizar_presupuesto(
        presupuesto_id, items_resueltos, detalle.get("notas") or "",
        detalle.get("ajuste_pct") or 0, opciones=opciones,
    )
    # Los precios pasan a ser los de hoy, así que la semana de validez vuelve a
    # contar desde hoy — y coincide con la fecha que imprime el PDF.
    db.actualizar_fecha_presupuesto(presupuesto_id)
    pdfs_actualizados = _regenerar_pdf(presupuesto_id)

    return jsonify({
        "sin_cambios": False,
        "resumen": resumen,
        "detalle": db.get_presupuesto_detalle(presupuesto_id),
        "pdfs": pdfs_actualizados,
    })


@bp.get("/<int:presupuesto_id>/pedido")
@login_required
def pedido(presupuesto_id):
    """
    Qué hay que ir a comprar. A diferencia del presupuesto (que congela precios
    al cotizar), acá todo se muestra con el precio y el stock de HOY: es el
    momento de decidir a quién se le compra.

    Cada grupo trae sus opciones agrupadas por marca, con las medidas debajo,
    ordenadas de más barata a más cara. `ahorro` es lo que quedaría de margen si
    se consigue la más barata con stock en vez de la que se cotizó.
    """
    detalle_p = db.get_presupuesto_detalle(presupuesto_id)
    if not detalle_p:
        return jsonify({"error": "Presupuesto no encontrado"}), 404

    grupos_out = []
    total_cotizado = 0.0
    total_mas_barato = 0.0

    for grupo in db.get_grupos_presupuesto(presupuesto_id):
        opciones = []
        for op in grupo["opciones"]:
            # Precio de hoy si el código sigue en el catálogo; si ya no está, se
            # cae al congelado y se marca, para que no desaparezca del pedido.
            en_catalogo = op["precio_actual"] is not None
            precio_hoy = op["precio_actual"] if en_catalogo else op["precio_unitario"]
            cantidad = op["cantidad"] or 0
            opciones.append({
                **op,
                "en_catalogo": en_catalogo,
                "precio_hoy": precio_hoy,
                "subtotal_hoy": round((precio_hoy or 0) * cantidad, 2),
                "hay_stock": bool(op["stock_actual"]),
            })

        elegida = next((o for o in opciones if o["elegida"]), None)
        cotizado = (elegida or {}).get("subtotal") or 0
        con_stock = [o for o in opciones if o["hay_stock"] and (o["subtotal_hoy"] or 0) > 0]
        mas_barata = min(con_stock, key=lambda o: o["subtotal_hoy"]) if con_stock else None

        total_cotizado += cotizado
        total_mas_barato += (mas_barata or {}).get("subtotal_hoy") or cotizado

        grupos_out.append({
            "grupo_num": grupo["grupo_num"],
            "categoria": grupo["categoria"],
            "cotizado": cotizado,
            "sin_stock_total": not con_stock,
            "mas_barata_codigo": (mas_barata or {}).get("repuesto_codigo"),
            "ahorro": round(cotizado - mas_barata["subtotal_hoy"], 2) if mas_barata else 0,
            "marcas": _agrupar_por_marca(opciones),
        })

    return jsonify({
        "presupuesto": detalle_p,
        "grupos": grupos_out,
        "total_cotizado": round(total_cotizado, 2),
        "total_mas_barato_con_stock": round(total_mas_barato, 2),
        "catalogo": crac.get_info_catalogo(),
    })


def _agrupar_por_marca(opciones):
    """
    Con las medidas agregadas solas, un grupo puede tener 20 filas. Agruparlas
    por marca (con las medidas debajo) lo vuelve legible de un vistazo. Las
    marcas van de la más barata a la más cara.
    """
    por_marca: dict[str, dict] = {}
    for op in opciones:
        nombre = op.get("marca") or "Sin marca"
        marca = por_marca.setdefault(nombre, {"marca": nombre, "medidas": []})
        marca["medidas"].append(op)

    salida = []
    for marca in por_marca.values():
        marca["medidas"].sort(key=lambda o: (o.get("medida") or ""))
        precios = [o["subtotal_hoy"] for o in marca["medidas"] if (o["subtotal_hoy"] or 0) > 0]
        marca["desde"] = min(precios) if precios else 0
        marca["hay_stock"] = any(o["hay_stock"] for o in marca["medidas"])
        marca["tiene_elegida"] = any(o["elegida"] for o in marca["medidas"])
        salida.append(marca)

    salida.sort(key=lambda m: (m["desde"] == 0, m["desde"]))
    return salida


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

    cliente_tipo = data.get("cliente_tipo") or None
    if cliente_tipo is not None and cliente_tipo not in TIPOS_CLIENTE_VALIDOS:
        return jsonify({"error": "Tipo de cliente inválido"}), 400
    contacto_nombre = (data.get("contacto_nombre") or "").strip() or None

    if not cliente_nombre:
        return jsonify({"error": "Falta el nombre del cliente"}), 400
    if not motor_id:
        return jsonify({"error": "Falta el motor"}), 400

    motor = db.get_motor(motor_id)
    if not motor:
        return jsonify({"error": "Motor no encontrado"}), 404

    items_resueltos, descartados = _resolver_items(items_payload, motor.get("lista_num"), ajuste_pct)
    items_grupos, opciones, descartados_grupos = _resolver_grupos(data.get("grupos_repuestos"))
    descartados += descartados_grupos
    if descartados:
        return jsonify({
            "error": "Algunos ítems no se pudieron procesar: " + ", ".join(descartados),
            "items_descartados": descartados,
        }), 400
    items_resueltos += items_grupos
    if not items_resueltos:
        return jsonify({"error": "Agregá al menos un servicio o repuesto"}), 400

    presupuesto_id = db.guardar_presupuesto(
        cliente_nombre, motor_id, items_resueltos, ajuste_pct,
        cliente_tipo=cliente_tipo, contacto_nombre=contacto_nombre,
        opciones=opciones,
    )

    # El motor queda cargado con lo que se acaba de presupuestar: la próxima vez
    # el paso Repuestos arranca solo, con precios de hoy.
    db.fusionar_ficha_motor(motor_id, _grupos_para_ficha(opciones))

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
    # congelar_stock=False: al editar se preserva el stock que quedó grabado al
    # cotizar, igual que ya hace _resolver_items_edicion con los repuestos sueltos.
    items_grupos, opciones, _ = _resolver_grupos(data.get("grupos_repuestos"), congelar_stock=False)
    items_resueltos += items_grupos
    if not items_resueltos:
        return jsonify({"error": "Agregá al menos un servicio o repuesto"}), 400

    db.actualizar_presupuesto(presupuesto_id, items_resueltos, notas, ajuste_pct, opciones=opciones)
    if existente.get("motor_id"):
        db.fusionar_ficha_motor(existente["motor_id"], _grupos_para_ficha(opciones))
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
    if not db.get_presupuesto_detalle(presupuesto_id):
        return jsonify({"error": "Presupuesto no encontrado"}), 404

    return jsonify(_regenerar_pdf(presupuesto_id))


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
