"""
Generación de PDF de presupuesto.
Usa reportlab (Platypus). Portado de la app de escritorio (src/utils/pdf_gen.py)
sin cambios de lógica ni de diseño; el nombre del taller sale de config.NOMBRE_TALLER
en vez de estar fijo en el código (mismo valor por defecto).
"""
import os
from datetime import date

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
)
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER

from . import config
from .helpers import formato_precio_ars as _fmt_precio

AZUL_OSCURO  = colors.HexColor("#1a2744")
AZUL_MEDIO   = colors.HexColor("#3b5090")
AZUL_CLARO   = colors.HexColor("#dce4f5")
GRIS_TEXTO   = colors.HexColor("#333333")
GRIS_MUTED   = colors.HexColor("#666666")
BLANCO       = colors.white


def _estilos():
    return {
        "taller": ParagraphStyle("taller", fontName="Helvetica-Bold", fontSize=22, textColor=AZUL_OSCURO, leading=26, alignment=TA_LEFT),
        "subtaller": ParagraphStyle("subtaller", fontName="Helvetica", fontSize=10, textColor=GRIS_MUTED, leading=14, alignment=TA_LEFT),
        "titulo_doc": ParagraphStyle("titulo_doc", fontName="Helvetica-Bold", fontSize=20, textColor=AZUL_MEDIO, leading=24, alignment=TA_RIGHT),
        "num_doc": ParagraphStyle("num_doc", fontName="Helvetica", fontSize=12, textColor=GRIS_MUTED, alignment=TA_RIGHT),
        "label": ParagraphStyle("label", fontName="Helvetica-Bold", fontSize=9, textColor=GRIS_MUTED, leading=12),
        "valor": ParagraphStyle("valor", fontName="Helvetica", fontSize=11, textColor=GRIS_TEXTO, leading=14),
        "valor_bold": ParagraphStyle("valor_bold", fontName="Helvetica-Bold", fontSize=11, textColor=AZUL_OSCURO, leading=14),
        "celda_num": ParagraphStyle("celda_num", fontName="Helvetica", fontSize=10, textColor=GRIS_TEXTO, alignment=TA_CENTER),
        "celda_desc": ParagraphStyle("celda_desc", fontName="Helvetica", fontSize=10, textColor=GRIS_TEXTO, leading=13),
        "celda_precio": ParagraphStyle("celda_precio", fontName="Helvetica", fontSize=10, textColor=GRIS_TEXTO, alignment=TA_RIGHT),
        "total_label": ParagraphStyle("total_label", fontName="Helvetica-Bold", fontSize=13, textColor=BLANCO, alignment=TA_LEFT),
        "total_valor": ParagraphStyle("total_valor", fontName="Helvetica-Bold", fontSize=14, textColor=BLANCO, alignment=TA_RIGHT),
        "pie": ParagraphStyle("pie", fontName="Helvetica-Oblique", fontSize=8, textColor=GRIS_MUTED, alignment=TA_CENTER, leading=12),
    }


def _fmt_fecha(fecha_iso: str | None) -> str:
    if not fecha_iso:
        return date.today().strftime("%d/%m/%Y")
    try:
        y, m, d = fecha_iso.split("-")
        return f"{d}/{m}/{y}"
    except Exception:
        return fecha_iso


def _fmt_cantidad(cantidad) -> str:
    """Cantidad sin decimales cuando es entera (2, no 2.0)."""
    try:
        c = float(cantidad)
    except (TypeError, ValueError):
        return str(cantidad or "")
    return str(int(c)) if c == int(c) else f"{c:g}"


def generar_pdf(
    presupuesto_id: int,
    cliente: str,
    motor: str,
    items: list[dict],
    total: float,
    output_path: str,
    repuestos: list[dict] | None = None,
    opcionales: list[dict] | None = None,
) -> str:
    """
    Genera el PDF del presupuesto y lo guarda en output_path.
    items: list of {item_num, descripcion, precio_aplicado, cantidad} (servicios
    de mano de obra); `cantidad` es opcional (default 1) y se muestra como
    "×N" junto a la descripción cuando es distinta de 1 (ej. "Reunir cilindros
    ×4"). `precio_aplicado` ya viene multiplicado por la cantidad.
    repuestos: list of {descripcion, cantidad, precio_unitario, precio_aplicado};
    van en una sección propia, después de los servicios, y `descripcion` es la
    categoría del repuesto (ej. "Aros") — el código y la descripción del proveedor
    no salen en el PDF. `precio_unitario` puede ser None (filas agrupadas con
    precios distintos). El total ya los incluye.
    opcionales: list of {descripcion, cantidad, precio_aplicado} — trabajos y
    repuestos que pueden llegar a hacer falta y NO están incluidos en el total
    (ej. una bomba de aceite, por si la del motor no sirve). Van en una caja
    aparte al final, esta sí CON el precio de cada renglón y su propio subtotal:
    como no entran en el total, el precio es lo único que le dice al cliente
    cuánto le costaría si hace falta.
    Retorna output_path.
    """
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    doc = SimpleDocTemplate(
        output_path, pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm, topMargin=2 * cm, bottomMargin=2 * cm,
    )

    E = _estilos()
    story = []
    page_w = A4[0] - 4 * cm

    fecha_hoy = _fmt_fecha(None)
    num_str = f"N.° {presupuesto_id:04d}"

    header_data = [
        [Paragraph(config.NOMBRE_TALLER, E["taller"]), Paragraph("PRESUPUESTO", E["titulo_doc"])],
        [Paragraph("Rectificación de motores", E["subtaller"]), Paragraph(num_str, E["num_doc"])],
        [Paragraph(f"Fecha: {fecha_hoy}", E["subtaller"]), Paragraph("", E["num_doc"])],
    ]
    header_table = Table(header_data, colWidths=[page_w * 0.55, page_w * 0.45])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 0.3 * cm))

    story.append(HRFlowable(width="100%", thickness=3, color=AZUL_OSCURO, spaceAfter=0.5 * cm))

    info_data = [
        [Paragraph("CLIENTE", E["label"]), Paragraph("MOTOR", E["label"])],
        [Paragraph(cliente or "—", E["valor_bold"]), Paragraph(motor or "—", E["valor"])],
    ]
    info_table = Table(info_data, colWidths=[page_w * 0.40, page_w * 0.60])
    info_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("BACKGROUND", (0, 0), (-1, -1), AZUL_CLARO),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [AZUL_CLARO, BLANCO]),
        ("BOX", (0, 0), (-1, -1), 0.5, AZUL_MEDIO),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, AZUL_MEDIO),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, 0), 6),
        ("TOPPADDING", (0, 1), (-1, 1), 4),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 8),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 0.5 * cm))

    estilo_tabla_items = TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), AZUL_OSCURO),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [BLANCO, AZUL_CLARO]),
        ("TOPPADDING", (0, 1), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.5, AZUL_MEDIO),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, colors.HexColor("#cccccc")),
    ])

    def _hd(texto, alignment=TA_LEFT):
        return Paragraph(texto, ParagraphStyle(
            "hd", fontName="Helvetica-Bold", fontSize=10, textColor=BLANCO, alignment=alignment,
        ))

    # Un presupuesto puede ser de solo repuestos: en ese caso no se imprime la
    # tabla de servicios vacía. Ninguna de las dos tablas muestra precios por
    # línea (ni de mano de obra ni de repuestos) — el cliente solo ve QUÉ se
    # hizo y QUÉ se puso, el precio queda únicamente en el TOTAL final.
    if items:
        col_n = 1.2 * cm
        col_d = page_w - col_n

        tabla_data = [[
            _hd("Nº", TA_CENTER),
            _hd("Descripción del servicio"),
        ]]

        for item in items:
            desc = str(item.get("descripcion") or "")
            cantidad = item.get("cantidad")
            if cantidad is not None and float(cantidad) != 1:
                desc = f"{desc} ×{_fmt_cantidad(cantidad)}"
            tabla_data.append([
                Paragraph(str(item.get("item_num") or ""), E["celda_num"]),
                Paragraph(desc, E["celda_desc"]),
            ])

        tabla_servicios = Table(tabla_data, colWidths=[col_n, col_d], repeatRows=1)
        tabla_servicios.setStyle(estilo_tabla_items)
        story.append(tabla_servicios)
        story.append(Spacer(1, 0.3 * cm))

    # Los repuestos van sin cantidad: con los grupos de opciones, la cantidad de
    # una línea es la cantidad de ENVASES de la marca que ganó (una viene por
    # juego de 8, otra por blíster de 2), así que ese número no significa nada
    # para el cliente y cambiaría según qué marca se termine cotizando.
    if repuestos:
        rep_data = [[_hd("Repuestos")]]

        for rep in repuestos:
            rep_data.append([
                Paragraph(str(rep.get("descripcion") or ""), E["celda_desc"]),
            ])

        tabla_repuestos = Table(
            rep_data,
            colWidths=[page_w],
            repeatRows=1,
        )
        tabla_repuestos.setStyle(estilo_tabla_items)
        story.append(tabla_repuestos)
        story.append(Spacer(1, 0.3 * cm))

    total_data = [[Paragraph("TOTAL", E["total_label"]), Paragraph(_fmt_precio(total), E["total_valor"])]]
    total_table = Table(total_data, colWidths=[page_w * 0.7, page_w * 0.3])
    total_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), AZUL_OSCURO),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.5, AZUL_MEDIO),
    ]))
    story.append(total_table)
    story.append(Spacer(1, 0.5 * cm))

    # Opcionales: va DESPUÉS del total y con precio por renglón, justamente para
    # que se lea como lo que es — algo que todavía no está cobrado.
    if opcionales:
        col_p = 3.4 * cm
        op_data = [[
            _hd("Opcionales — puede llegar a hacer falta"),
            _hd("Precio", TA_RIGHT),
        ]]
        subtotal_opcionales = 0.0
        for op in opcionales:
            desc = str(op.get("descripcion") or "")
            cantidad = op.get("cantidad")
            if cantidad is not None and float(cantidad) != 1:
                desc = f"{desc} ×{_fmt_cantidad(cantidad)}"
            precio = op.get("precio_aplicado") or 0
            subtotal_opcionales += precio
            op_data.append([
                Paragraph(desc, E["celda_desc"]),
                Paragraph(_fmt_precio(precio), E["celda_precio"]),
            ])
        op_data.append([
            Paragraph("<b>Si se hacen todos</b>", E["celda_desc"]),
            Paragraph(f"<b>{_fmt_precio(subtotal_opcionales)}</b>", E["celda_precio"]),
        ])

        tabla_opcionales = Table(op_data, colWidths=[page_w - col_p, col_p], repeatRows=1)
        tabla_opcionales.setStyle(estilo_tabla_items)
        story.append(tabla_opcionales)
        story.append(Spacer(1, 0.2 * cm))
        story.append(Paragraph(
            "Estos trabajos y repuestos no están incluidos en el total: se agregan solo si hacen falta.",
            E["pie"],
        ))

    story.append(Spacer(1, 0.6 * cm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cccccc"), spaceAfter=0.3 * cm))
    story.append(Paragraph(
        "Este presupuesto tiene una validez de 7 días a partir de la fecha de emisión.",
        E["pie"],
    ))

    doc.build(story)
    return output_path


# ─── Orden de trabajo (el papel que va con el motor) ──────────────────────────

ESTADOS_LEGIBLES = {
    "aprobado": "Para hacer",
    "en_proceso": "En proceso",
    "terminado": "Terminado",
    "entregado": "Entregado",
}


def generar_orden_trabajo(orden: dict, output_path: str) -> str:
    """
    La orden de trabajo del taller, para imprimir y dejar con el motor.

    Es el mismo dato que ve el taller en pantalla, en papel: qué motor es, de
    quién es, qué hay que hacerle y qué repuestos se pidieron. NO lleva precios
    —ni de mano de obra, ni de repuestos, ni total— porque es un papel que anda
    dando vueltas por el taller y por el mostrador.

    `orden` es lo que devuelve db.get_orden_trabajo().
    """
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    doc = SimpleDocTemplate(
        output_path, pagesize=A4,
        leftMargin=1.6 * cm, rightMargin=1.6 * cm, topMargin=1.6 * cm, bottomMargin=1.6 * cm,
    )

    E = _estilos()
    story = []
    page_w = A4[0] - 3.2 * cm

    numero = f"N.° {orden['id']:04d}"
    estado = ESTADOS_LEGIBLES.get(orden.get("estado_trabajo"), "Para hacer")
    urgente = " · URGENTE" if orden.get("prioridad") else ""

    header_data = [
        [Paragraph(config.NOMBRE_TALLER, E["taller"]), Paragraph("ORDEN DE TRABAJO", E["titulo_doc"])],
        [Paragraph("Rectificación de motores", E["subtaller"]), Paragraph(numero, E["num_doc"])],
        [Paragraph(f"Estado: {estado}{urgente}", E["subtaller"]),
         Paragraph(f"Aprobado: {_fmt_fecha(orden.get('aprobado_en'))}", E["num_doc"])],
    ]
    header_table = Table(header_data, colWidths=[page_w * 0.55, page_w * 0.45])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 0.3 * cm))
    story.append(HRFlowable(width="100%", thickness=3, color=AZUL_OSCURO, spaceAfter=0.4 * cm))

    # El motor, grande: es el dato que se busca de un vistazo entre diez papeles.
    motor_style = ParagraphStyle(
        "motor_orden", fontName="Helvetica-Bold", fontSize=17, textColor=AZUL_OSCURO, leading=21,
    )
    info_data = [
        [Paragraph("MOTOR", E["label"]), Paragraph("CLIENTE", E["label"])],
        [Paragraph(orden.get("motor") or "—", motor_style),
         Paragraph(orden.get("cliente") or "—", E["valor_bold"])],
    ]
    pie_cliente = []
    if orden.get("contacto"):
        pie_cliente.append(orden["contacto"])
    if orden.get("telefono"):
        pie_cliente.append(orden["telefono"])
    entrega = _fmt_fecha(orden["entrega_prometida"]) if orden.get("entrega_prometida") else "sin fecha"
    info_data.append([
        Paragraph(f"Entrega prometida: {entrega}", E["subtaller"]),
        Paragraph(" · ".join(pie_cliente) or " ", E["subtaller"]),
    ])
    info_table = Table(info_data, colWidths=[page_w * 0.55, page_w * 0.45])
    info_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("BACKGROUND", (0, 0), (-1, -1), AZUL_CLARO),
        ("BOX", (0, 0), (-1, -1), 0.5, AZUL_MEDIO),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 0.45 * cm))

    def _hd(texto, alignment=TA_LEFT):
        return Paragraph(texto, ParagraphStyle(
            "hd", fontName="Helvetica-Bold", fontSize=10, textColor=BLANCO, alignment=alignment,
        ))

    estilo_tabla = TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), AZUL_MEDIO),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [BLANCO, AZUL_CLARO]),
        ("TOPPADDING", (0, 1), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.5, AZUL_MEDIO),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, colors.HexColor("#cccccc")),
    ])

    def _texto_opcional(item):
        return " <font color='#888888'>(opcional)</font>" if item.get("opcional") else ""

    tareas = orden.get("tareas") or []
    if tareas:
        # La columna de la izquierda queda vacía a propósito: es el casillero
        # para tildar a mano lo que se va haciendo. En pantalla no hay tildes
        # (no se anotan procesos), pero el papel del taller sí se tilda con
        # lápiz, que es como se venía trabajando.
        col_tilde = 1.0 * cm
        col_n = 1.2 * cm
        data = [[_hd(""), _hd("Nº", TA_CENTER), _hd("Qué hay que hacerle al motor")]]
        for t in tareas:
            desc = str(t.get("descripcion") or "")
            cantidad = t.get("cantidad")
            if cantidad is not None and float(cantidad) != 1:
                desc = f"{desc} ×{_fmt_cantidad(cantidad)}"
            data.append([
                Paragraph("", E["celda_desc"]),
                Paragraph(str(t.get("item_num") or ""), E["celda_num"]),
                Paragraph(desc + _texto_opcional(t), E["celda_desc"]),
            ])
        tabla = Table(data, colWidths=[col_tilde, col_n, page_w - col_tilde - col_n], repeatRows=1)
        tabla.setStyle(estilo_tabla)
        story.append(tabla)
        story.append(Spacer(1, 0.35 * cm))

    repuestos = orden.get("repuestos") or []
    if repuestos:
        col_tilde = 1.0 * cm
        col_cant = 1.6 * cm
        col_cod = 3.6 * cm
        data = [[_hd(""), _hd("Cant.", TA_CENTER), _hd("Código"), _hd("Repuesto")]]
        for r in repuestos:
            detalle = [str(r.get("descripcion") or r.get("categoria") or "")]
            if r.get("marca"):
                detalle.append(str(r["marca"]))
            if r.get("medida"):
                detalle.append(str(r["medida"]))
            data.append([
                Paragraph("", E["celda_desc"]),
                Paragraph(_fmt_cantidad(r.get("cantidad")), E["celda_num"]),
                Paragraph(str(r.get("codigo") or "—"), E["celda_desc"]),
                Paragraph(" · ".join(detalle) + _texto_opcional(r), E["celda_desc"]),
            ])
        tabla = Table(
            data,
            colWidths=[col_tilde, col_cant, col_cod, page_w - col_tilde - col_cant - col_cod],
            repeatRows=1,
        )
        tabla.setStyle(estilo_tabla)
        story.append(tabla)
        story.append(Spacer(1, 0.35 * cm))

    for titulo, texto_nota in (("Notas de la oficina", orden.get("notas")),
                               ("Notas del taller", orden.get("notas_taller"))):
        if not texto_nota:
            continue
        nota_data = [[_hd(titulo)], [Paragraph(str(texto_nota).replace("\n", "<br/>"), E["celda_desc"])]]
        tabla_nota = Table(nota_data, colWidths=[page_w])
        tabla_nota.setStyle(estilo_tabla)
        story.append(tabla_nota)
        story.append(Spacer(1, 0.3 * cm))

    # Renglones en blanco para escribir a mano lo que aparezca en la máquina.
    obs_data = [[_hd("Observaciones")]] + [[Paragraph("&nbsp;", E["celda_desc"])] for _ in range(4)]
    tabla_obs = Table(obs_data, colWidths=[page_w])
    tabla_obs.setStyle(estilo_tabla)
    story.append(tabla_obs)

    story.append(Spacer(1, 0.5 * cm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cccccc"), spaceAfter=0.3 * cm))
    story.append(Paragraph(
        "Orden de trabajo interna. No es un presupuesto y no lleva precios.",
        E["pie"],
    ))

    doc.build(story)
    return output_path
