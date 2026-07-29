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
) -> str:
    """
    Genera el PDF del presupuesto y lo guarda en output_path.
    items: list of {item_num, descripcion, precio_aplicado} (servicios de mano de obra)
    repuestos: list of {codigo, descripcion, cantidad, precio_unitario, precio_aplicado};
    van en una sección propia, después de los servicios. El total ya los incluye.
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
        [Paragraph("Taller de rectificación de motores", E["subtaller"]), Paragraph(num_str, E["num_doc"])],
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
    # tabla de servicios vacía.
    if items:
        col_n = 1.2 * cm
        col_p = 3.0 * cm
        col_d = page_w - col_n - col_p

        tabla_data = [[
            _hd("Nº", TA_CENTER),
            _hd("Descripción del servicio"),
            _hd("Precio", TA_RIGHT),
        ]]

        for item in items:
            tabla_data.append([
                Paragraph(str(item.get("item_num") or ""), E["celda_num"]),
                Paragraph(str(item.get("descripcion") or ""), E["celda_desc"]),
                Paragraph(_fmt_precio(item.get("precio_aplicado")), E["celda_precio"]),
            ])

        tabla_servicios = Table(tabla_data, colWidths=[col_n, col_d, col_p], repeatRows=1)
        tabla_servicios.setStyle(estilo_tabla_items)
        story.append(tabla_servicios)
        story.append(Spacer(1, 0.3 * cm))

    if repuestos:
        col_cod  = 2.5 * cm
        col_cant = 1.3 * cm
        col_unit = 2.6 * cm
        col_sub  = 2.6 * cm
        col_desc = page_w - col_cod - col_cant - col_unit - col_sub

        rep_data = [[
            _hd("Código"),
            _hd("Repuesto"),
            _hd("Cant.", TA_CENTER),
            _hd("P. unitario", TA_RIGHT),
            _hd("Subtotal", TA_RIGHT),
        ]]

        for rep in repuestos:
            rep_data.append([
                Paragraph(str(rep.get("codigo") or "—"), E["celda_desc"]),
                Paragraph(str(rep.get("descripcion") or ""), E["celda_desc"]),
                Paragraph(_fmt_cantidad(rep.get("cantidad")), E["celda_num"]),
                Paragraph(_fmt_precio(rep.get("precio_unitario")), E["celda_precio"]),
                Paragraph(_fmt_precio(rep.get("precio_aplicado")), E["celda_precio"]),
            ])

        tabla_repuestos = Table(
            rep_data,
            colWidths=[col_cod, col_desc, col_cant, col_unit, col_sub],
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
    story.append(Spacer(1, 0.8 * cm))

    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cccccc"), spaceAfter=0.3 * cm))
    story.append(Paragraph(
        "Este presupuesto tiene una validez de 7 días a partir de la fecha de emisión.",
        E["pie"],
    ))

    doc.build(story)
    return output_path
