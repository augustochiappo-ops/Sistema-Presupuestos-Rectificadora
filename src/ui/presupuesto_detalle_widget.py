"""
Vista de detalle y edición de un presupuesto.
- Modo vista (read-only): tabla de servicios + sección Repuestos con avisos
  de cambios de precio/stock del catálogo, notas, historial de PDFs
- Modo edición: precios editables, servicios custom, cantidad/unitario de
  repuestos, alta manual de repuestos, notas editables
"""
import os

from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QTableWidgetItem, QHeaderView, QFrame, QLineEdit,
    QTextEdit, QMessageBox, QSizePolicy, QSpinBox,
)
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QFont, QDesktopServices, QColor
from PyQt6.QtCore import QUrl

from ..data.db import (
    get_presupuesto_detalle, get_presupuesto_items_full,
    actualizar_presupuesto, guardar_pdf_historial, get_pdfs_presupuesto,
)
from ..utils.pdf_gen import generar_pdf
from .widgets import ZoomableTable
from .styles import (
    FONT_FAMILY, FONT_SIZE_MD, FONT_SIZE_SM, FONT_SIZE_LG, FONT_SIZE_XL,
    COLOR_TEXT_PRIMARY, COLOR_TEXT_MUTED, COLOR_TEXT_PLACEHOLDER,
    COLOR_CONTENT_BG, COLOR_WHITE, COLOR_PANEL_BG, COLOR_PANEL_BORDER,
    COLOR_BTN_PRIMARY, COLOR_BTN_PRIMARY_HOV,
    BUTTON_PRIMARY, BUTTON_SUCCESS, SEARCH_INPUT,
)

_PDF_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "Presupuestos",
)

CENTER = Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignHCenter
LEFT   = Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignLeft
RIGHT  = Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignRight

_BTN_LINK = f"""
QPushButton {{
    background: transparent; border: none;
    color: {COLOR_BTN_PRIMARY};
    font-size: {FONT_SIZE_MD}px; font-family: {FONT_FAMILY};
    padding: 6px 0; text-align: left;
}}
QPushButton:hover {{ color: {COLOR_BTN_PRIMARY_HOV}; text-decoration: underline; }}
"""

_BTN_SECONDARY = f"""
QPushButton {{
    background: {COLOR_WHITE};
    color: {COLOR_BTN_PRIMARY};
    border: 1.5px solid {COLOR_BTN_PRIMARY};
    border-radius: 6px;
    padding: 7px 16px;
    font-size: {FONT_SIZE_MD}px;
    font-family: {FONT_FAMILY};
    font-weight: bold;
}}
QPushButton:hover {{ background: #dce4f5; }}
"""


def _fmt_precio(valor) -> str:
    if valor is None:
        return "—"
    try:
        entero, decimal = f"{float(valor):.2f}".split(".")
        ef = ""
        for i, d in enumerate(reversed(entero)):
            if i and i % 3 == 0:
                ef = "." + ef
            ef = d + ef
        return f"$ {ef},{decimal}"
    except (ValueError, TypeError):
        return "—"


def _parse_precio(texto: str) -> float:
    """Parsea un precio en formato argentino: '$ 1.234,50' → 1234.50"""
    try:
        clean = texto.replace("$", "").replace(".", "").replace(",", ".").strip()
        return float(clean) if clean else 0.0
    except (ValueError, TypeError):
        return 0.0


def _fmt_fecha(fecha_iso: str | None) -> str:
    if not fecha_iso:
        return "—"
    try:
        y, m, d = fecha_iso.split("-")
        return f"{d}/{m}/{y}"
    except Exception:
        return fecha_iso or "—"


def _fmt_cantidad(cantidad) -> str:
    try:
        c = float(cantidad)
    except (TypeError, ValueError):
        return str(cantidad or "")
    return str(int(c)) if c == int(c) else f"{c:g}"


def _warnings_repuesto(item: dict) -> list[str]:
    """
    Avisos de cambios post-emisión: cada línea de repuesto congela precio y
    stock al cotizar; items_full trae además precio_actual/stock_actual del
    catálogo vigente. Si difieren, se avisa acá (nunca en el PDF).
    """
    w = []
    if not item.get("repuesto_codigo"):
        return w
    # stock es NOT NULL en el catálogo: si vino None, el código salió de la lista
    if item.get("stock_actual") is None:
        w.append("Ya no está en la lista del catálogo")
        return w
    precio_actual = item.get("precio_actual")
    if precio_actual and item.get("precio_unitario") is not None \
            and precio_actual != item.get("precio_unitario"):
        w.append(f"Precio de lista cambió: {_fmt_precio(item.get('precio_unitario'))} → {_fmt_precio(precio_actual)}")
    if item.get("stock_al_cotizar") == 1 and item.get("stock_actual") == 0:
        w.append("Ya no tiene stock")
    return w


class PresupuestoDetalleWidget(QWidget):
    # Emite el stack index al que volver
    volver = pyqtSignal(int)

    def __init__(self):
        super().__init__()
        self._presupuesto_id: int | None = None
        self._back_index: int = 2
        self._detalle: dict = {}
        self._modo_edicion: bool = False
        self._blank_row: int | None = None
        self._sep_row: int | None = None       # fila separadora "Repuestos" en modo vista
        # Metadatos por fila en modo edición (tipo, código, stock congelado, etc.)
        self._row_meta: dict[int, dict] = {}
        self._build_ui()

    # ─── Construcción ─────────────────────────────────────────────────────────
    def _build_ui(self):
        self.setStyleSheet(f"background-color: {COLOR_CONTENT_BG};")
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        root.addWidget(self._build_nav_bar())
        root.addWidget(self._build_info_bar())
        root.addWidget(self._build_warning_bar())
        root.addWidget(self._build_search_bar())
        root.addWidget(self._build_tabla(), 1)
        root.addWidget(self._build_notas_section())
        root.addWidget(self._build_pdf_section())

    # ── Aviso de cambios en el catálogo de repuestos ──────────────────────────
    def _build_warning_bar(self) -> QWidget:
        self.lbl_warning_rep = QLabel(
            "⚠  La lista de repuestos cambió desde la emisión de este presupuesto — "
            "revisá los avisos en la sección Repuestos antes de reconfirmar."
        )
        self.lbl_warning_rep.setWordWrap(True)
        self.lbl_warning_rep.setStyleSheet(
            "background-color: #fdecea; color: #c62828;"
            f" font-size: {FONT_SIZE_SM}px; font-family: {FONT_FAMILY};"
            " padding: 8px 20px; border-bottom: 1px solid #f5c6c0;"
        )
        self.lbl_warning_rep.setVisible(False)
        return self.lbl_warning_rep

    # ── Barra de navegación ───────────────────────────────────────────────────
    def _build_nav_bar(self) -> QWidget:
        bar = QWidget()
        bar.setStyleSheet(
            f"background-color: {COLOR_CONTENT_BG};"
            f" border-bottom: 1px solid {COLOR_PANEL_BORDER};"
        )
        layout = QHBoxLayout(bar)
        layout.setContentsMargins(20, 10, 20, 10)
        layout.setSpacing(12)

        self.btn_volver = QPushButton("← Volver")
        self.btn_volver.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_volver.setStyleSheet(_BTN_LINK)
        self.btn_volver.clicked.connect(self._accion_volver)

        self.lbl_titulo = QLabel("")
        self.lbl_titulo.setFont(QFont(FONT_FAMILY, FONT_SIZE_LG, QFont.Weight.Bold))
        self.lbl_titulo.setStyleSheet(f"color: {COLOR_TEXT_PRIMARY};")
        self.lbl_titulo.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)

        self.btn_reconstruir_pdf = QPushButton("Reconstruir PDF")
        self.btn_reconstruir_pdf.setStyleSheet(_BTN_SECONDARY)
        self.btn_reconstruir_pdf.setFixedHeight(36)
        self.btn_reconstruir_pdf.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_reconstruir_pdf.clicked.connect(self._reconstruir_pdf)

        self.btn_editar = QPushButton("✏ Editar")
        self.btn_editar.setStyleSheet(BUTTON_PRIMARY)
        self.btn_editar.setFixedHeight(36)
        self.btn_editar.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_editar.clicked.connect(self._entrar_modo_edicion)

        self.btn_guardar = QPushButton("💾 Guardar cambios")
        self.btn_guardar.setStyleSheet(BUTTON_SUCCESS)
        self.btn_guardar.setFixedHeight(36)
        self.btn_guardar.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_guardar.setVisible(False)
        self.btn_guardar.clicked.connect(self._guardar_cambios)

        self.btn_cancelar_edicion = QPushButton("Cancelar")
        self.btn_cancelar_edicion.setStyleSheet(_BTN_SECONDARY)
        self.btn_cancelar_edicion.setFixedHeight(36)
        self.btn_cancelar_edicion.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_cancelar_edicion.setVisible(False)
        self.btn_cancelar_edicion.clicked.connect(self._cancelar_edicion)

        # Alta manual de repuestos en edición (el buscador de catálogo completo
        # vive en el wizard de creación)
        self.btn_agregar_rep = QPushButton("＋ Repuesto")
        self.btn_agregar_rep.setStyleSheet(_BTN_SECONDARY)
        self.btn_agregar_rep.setFixedHeight(36)
        self.btn_agregar_rep.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_agregar_rep.setVisible(False)
        self.btn_agregar_rep.clicked.connect(self._agregar_fila_repuesto)

        layout.addWidget(self.btn_volver)
        layout.addWidget(self.lbl_titulo, 1)
        layout.addWidget(self.btn_reconstruir_pdf)
        layout.addWidget(self.btn_editar)
        layout.addWidget(self.btn_agregar_rep)
        layout.addWidget(self.btn_cancelar_edicion)
        layout.addWidget(self.btn_guardar)

        return bar

    # ── Barra de info ─────────────────────────────────────────────────────────
    def _build_info_bar(self) -> QWidget:
        bar = QWidget()
        bar.setStyleSheet(f"background-color: {COLOR_PANEL_BG}; border-bottom: 1px solid {COLOR_PANEL_BORDER};")
        layout = QHBoxLayout(bar)
        layout.setContentsMargins(20, 8, 20, 8)
        layout.setSpacing(32)

        def _info_pair(label: str) -> tuple[QLabel, QLabel]:
            lbl = QLabel(label)
            lbl.setStyleSheet(f"color: {COLOR_TEXT_MUTED}; font-size: 9px; font-family: {FONT_FAMILY}; font-weight: bold; letter-spacing: 1px;")
            val = QLabel("—")
            val.setStyleSheet(f"color: {COLOR_TEXT_PRIMARY}; font-size: {FONT_SIZE_MD}px; font-family: {FONT_FAMILY};")
            val.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)
            return lbl, val

        lbl_c, self.val_cliente = _info_pair("CLIENTE")
        lbl_m, self.val_motor   = _info_pair("MOTOR")
        lbl_f, self.val_fecha   = _info_pair("FECHA")

        for lbl, val in [(lbl_c, self.val_cliente), (lbl_m, self.val_motor), (lbl_f, self.val_fecha)]:
            pair = QWidget()
            pair.setStyleSheet("background: transparent;")
            pair_l = QVBoxLayout(pair)
            pair_l.setContentsMargins(0, 0, 0, 0)
            pair_l.setSpacing(2)
            pair_l.addWidget(lbl)
            pair_l.addWidget(val)
            layout.addWidget(pair)

        return bar

    # ── Buscador ──────────────────────────────────────────────────────────────
    def _build_search_bar(self) -> QWidget:
        bar = QWidget()
        bar.setStyleSheet(f"background-color: {COLOR_CONTENT_BG};")
        layout = QHBoxLayout(bar)
        layout.setContentsMargins(20, 8, 20, 4)
        layout.setSpacing(8)

        lupa = QLabel("🔍")
        lupa.setStyleSheet("font-size: 14px;")
        self.buscador_det = QLineEdit()
        self.buscador_det.setPlaceholderText("Buscar por Nº o descripción del servicio...")
        self.buscador_det.setStyleSheet(SEARCH_INPUT)
        self.buscador_det.setFixedHeight(34)
        self.buscador_det.textChanged.connect(self._filtrar_tabla)

        layout.addWidget(lupa)
        layout.addWidget(self.buscador_det)
        return bar

    # ── Tabla de servicios ────────────────────────────────────────────────────
    def _build_tabla(self) -> QWidget:
        self.tabla = ZoomableTable()
        self.tabla.setColumnCount(3)
        self.tabla.setHorizontalHeaderLabels(["Nº", "Descripción", "Precio"])
        self.tabla.setEditTriggers(ZoomableTable.EditTrigger.NoEditTriggers)
        self.tabla.setSelectionBehavior(ZoomableTable.SelectionBehavior.SelectRows)
        self.tabla.setAlternatingRowColors(True)
        self.tabla.verticalHeader().setVisible(False)
        self.tabla.setShowGrid(True)
        self.tabla.setSortingEnabled(False)

        hdr = self.tabla.horizontalHeader()
        hdr.setDefaultAlignment(Qt.AlignmentFlag.AlignCenter)
        hdr.setSectionResizeMode(0, QHeaderView.ResizeMode.Fixed)
        hdr.setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        hdr.setSectionResizeMode(2, QHeaderView.ResizeMode.Fixed)
        self.tabla.setColumnWidth(0, 56)
        self.tabla.setColumnWidth(2, 150)

        return self.tabla

    # ── Sección de notas ──────────────────────────────────────────────────────
    def _build_notas_section(self) -> QWidget:
        section = QWidget()
        section.setStyleSheet(f"background-color: {COLOR_CONTENT_BG};")
        layout = QVBoxLayout(section)
        layout.setContentsMargins(20, 8, 20, 8)
        layout.setSpacing(4)

        lbl = QLabel("NOTAS")
        lbl.setStyleSheet(
            f"color: {COLOR_TEXT_MUTED}; font-size: 9px; font-family: {FONT_FAMILY};"
            " font-weight: bold; letter-spacing: 1px;"
        )
        layout.addWidget(lbl)

        self.notas_edit = QTextEdit()
        self.notas_edit.setFixedHeight(80)
        self.notas_edit.setReadOnly(True)
        self.notas_edit.setPlaceholderText("Sin notas.")
        self.notas_edit.setStyleSheet(f"""
            QTextEdit {{
                border: 1px solid {COLOR_PANEL_BORDER};
                border-radius: 6px;
                padding: 6px 10px;
                font-size: {FONT_SIZE_MD}px;
                font-family: {FONT_FAMILY};
                background: {COLOR_WHITE};
                color: {COLOR_TEXT_PRIMARY};
            }}
        """)
        layout.addWidget(self.notas_edit)
        return section

    # ── Sección de PDFs ───────────────────────────────────────────────────────
    def _build_pdf_section(self) -> QWidget:
        self._pdf_section = QWidget()
        self._pdf_section.setStyleSheet(
            f"background-color: {COLOR_PANEL_BG}; border-top: 1px solid {COLOR_PANEL_BORDER};"
        )
        self._pdf_layout = QHBoxLayout(self._pdf_section)
        self._pdf_layout.setContentsMargins(20, 8, 20, 8)
        self._pdf_layout.setSpacing(12)
        return self._pdf_section

    def _actualizar_pdf_section(self):
        # Limpiar layout anterior
        while self._pdf_layout.count():
            item = self._pdf_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        pdfs = get_pdfs_presupuesto(self._presupuesto_id)
        if not pdfs:
            lbl = QLabel("Sin PDFs generados.")
            lbl.setStyleSheet(f"color: {COLOR_TEXT_MUTED}; font-size: {FONT_SIZE_SM}px;")
            self._pdf_layout.addWidget(lbl)
            self._pdf_layout.addStretch()
            return

        # El más reciente
        ultimo = pdfs[0]
        lbl_ultimo = QLabel(
            f"📄 v{ultimo['version']} — {_fmt_fecha(ultimo['fecha'])}"
        )
        lbl_ultimo.setStyleSheet(
            f"color: {COLOR_TEXT_PRIMARY}; font-size: {FONT_SIZE_SM}px; font-family: {FONT_FAMILY};"
        )
        self._pdf_layout.addWidget(lbl_ultimo)

        btn_abrir = QPushButton("Abrir")
        btn_abrir.setStyleSheet(_BTN_LINK)
        btn_abrir.setFixedHeight(28)
        pdf_path = ultimo["pdf_path"]
        btn_abrir.clicked.connect(lambda: self._abrir_pdf(pdf_path))
        self._pdf_layout.addWidget(btn_abrir)

        # Versiones anteriores
        if len(pdfs) > 1:
            self._pdfs_anteriores_visible = False

            btn_anteriores = QPushButton(f"Ver versiones anteriores ({len(pdfs) - 1})")
            btn_anteriores.setStyleSheet(_BTN_LINK)
            btn_anteriores.setFixedHeight(28)

            container_anteriores = QWidget()
            container_anteriores.setStyleSheet("background: transparent;")
            cont_layout = QHBoxLayout(container_anteriores)
            cont_layout.setContentsMargins(0, 0, 0, 0)
            cont_layout.setSpacing(6)
            container_anteriores.setVisible(False)

            for pdf in pdfs[1:]:
                lbl = QLabel(f"v{pdf['version']} — {_fmt_fecha(pdf['fecha'])}")
                lbl.setStyleSheet(f"color: {COLOR_TEXT_MUTED}; font-size: {FONT_SIZE_SM}px;")
                p = pdf["pdf_path"]
                btn = QPushButton("Abrir")
                btn.setStyleSheet(_BTN_LINK)
                btn.setFixedHeight(24)
                btn.clicked.connect(lambda _, path=p: self._abrir_pdf(path))
                cont_layout.addWidget(lbl)
                cont_layout.addWidget(btn)

            def _toggle():
                visible = not container_anteriores.isVisible()
                container_anteriores.setVisible(visible)
                btn_anteriores.setText(
                    f"Ocultar anteriores" if visible
                    else f"Ver versiones anteriores ({len(pdfs) - 1})"
                )
            btn_anteriores.clicked.connect(_toggle)

            self._pdf_layout.addWidget(btn_anteriores)
            self._pdf_layout.addWidget(container_anteriores)

        self._pdf_layout.addStretch()

    def _abrir_pdf(self, path: str):
        if path and os.path.exists(path):
            QDesktopServices.openUrl(QUrl.fromLocalFile(path))
        else:
            QMessageBox.warning(self, "PDF no encontrado", f"No se encontró el archivo:\n{path}")

    # ─── API pública ──────────────────────────────────────────────────────────
    def abrir(self, presupuesto_id: int, back_index: int):
        self._presupuesto_id = presupuesto_id
        self._back_index     = back_index
        self._modo_edicion   = False
        self._blank_row      = None
        self._cargar()

    def _cargar(self):
        det = get_presupuesto_detalle(self._presupuesto_id)
        if not det:
            return
        self._detalle = det

        num_str = f"Presupuesto #{self._presupuesto_id:04d}"
        self.lbl_titulo.setText(num_str + ("  —  Editando" if self._modo_edicion else ""))
        self.val_cliente.setText(det.get("cliente") or "—")
        self.val_motor.setText(det.get("motor") or "—")
        self.val_fecha.setText(_fmt_fecha(det.get("fecha")))

        notas = det.get("notas") or ""
        self.notas_edit.setPlainText(notas)
        self.notas_edit.setReadOnly(not self._modo_edicion)

        items = get_presupuesto_items_full(self._presupuesto_id)
        if self._modo_edicion:
            self._poblar_tabla_edicion(items)
        else:
            self._poblar_tabla_vista(items)

        self._actualizar_pdf_section()
        self.buscador_det.clear()

    # ─── MODO VISTA ───────────────────────────────────────────────────────────
    _COLOR_WARNING = QColor("#c62828")
    _SEP_BG = "#e8ecf5"
    _SEP_FG = "#5a6a8a"

    def _poblar_tabla_vista(self, items: list[dict]):
        self.tabla.setEditTriggers(ZoomableTable.EditTrigger.NoEditTriggers)
        self.tabla.setColumnCount(3)
        self.tabla.setHorizontalHeaderLabels(["Nº", "Descripción", "Precio"])
        self._config_columnas_vista()
        # Limpiar cell widgets y spans previos
        for row in range(self.tabla.rowCount()):
            for col in range(self.tabla.columnCount()):
                self.tabla.removeCellWidget(row, col)
        self.tabla.clearSpans()
        self._sep_row = None
        self._row_meta = {}

        # items_full ordena los repuestos al final: se separan con una fila título
        servicios  = [i for i in items if i.get("tipo") != "repuesto"]
        repuestos  = [i for i in items if i.get("tipo") == "repuesto"]
        con_sep    = bool(servicios and repuestos)
        self.tabla.setRowCount(len(items) + (1 if con_sep else 0))

        hay_warnings = False
        fila = 0

        for item in servicios:
            self._fila_vista_servicio(fila, item)
            fila += 1

        if con_sep:
            self._sep_row = fila
            self.tabla.setRowHeight(fila, 22)
            self.tabla.setSpan(fila, 0, 1, 3)
            sep_lbl = QLabel("  ─── Repuestos ───")
            sep_lbl.setAlignment(LEFT)
            sep_lbl.setStyleSheet(
                f"background-color: {self._SEP_BG}; color: {self._SEP_FG}; "
                "font-size: 11px; font-style: italic;"
            )
            self.tabla.setCellWidget(fila, 0, sep_lbl)
            fila += 1

        for item in repuestos:
            if self._fila_vista_repuesto(fila, item):
                hay_warnings = True
            fila += 1

        self.lbl_warning_rep.setVisible(hay_warnings)

    def _config_columnas_vista(self):
        hdr = self.tabla.horizontalHeader()
        hdr.setSectionResizeMode(0, QHeaderView.ResizeMode.Fixed)
        hdr.setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        hdr.setSectionResizeMode(2, QHeaderView.ResizeMode.Fixed)
        self.tabla.setColumnWidth(0, 90)
        self.tabla.setColumnWidth(2, 150)

    def _fila_vista_servicio(self, fila: int, item: dict):
        self.tabla.setRowHeight(fila, 28)

        num_i = QTableWidgetItem(str(item.get("item_num") or "—"))
        num_i.setTextAlignment(CENTER)
        num_i.setFlags(Qt.ItemFlag.ItemIsEnabled | Qt.ItemFlag.ItemIsSelectable)
        self.tabla.setItem(fila, 0, num_i)

        desc_i = QTableWidgetItem(item.get("desc_facra") or item.get("descripcion_custom") or "—")
        desc_i.setTextAlignment(LEFT)
        desc_i.setFlags(Qt.ItemFlag.ItemIsEnabled | Qt.ItemFlag.ItemIsSelectable)
        self.tabla.setItem(fila, 1, desc_i)

        precio_i = QTableWidgetItem(_fmt_precio(item.get("precio_aplicado")))
        precio_i.setTextAlignment(RIGHT)
        precio_i.setFlags(Qt.ItemFlag.ItemIsEnabled | Qt.ItemFlag.ItemIsSelectable)
        self.tabla.setItem(fila, 2, precio_i)

    def _fila_vista_repuesto(self, fila: int, item: dict) -> bool:
        """Fila de repuesto en modo vista. Retorna True si tiene avisos."""
        self.tabla.setRowHeight(fila, 28)
        warnings = _warnings_repuesto(item)

        num_i = QTableWidgetItem(item.get("repuesto_codigo") or "—")
        num_i.setTextAlignment(CENTER)
        num_i.setFlags(Qt.ItemFlag.ItemIsEnabled | Qt.ItemFlag.ItemIsSelectable)
        self.tabla.setItem(fila, 0, num_i)

        cantidad = item.get("cantidad") or 1
        desc = item.get("descripcion_custom") or "—"
        if cantidad != 1:
            desc = f"{desc}   ×{_fmt_cantidad(cantidad)} ({_fmt_precio(item.get('precio_unitario'))} c/u)"
        if warnings:
            desc += "   ⚠ " + "  ·  ".join(warnings)
        desc_i = QTableWidgetItem(desc)
        desc_i.setTextAlignment(LEFT)
        desc_i.setFlags(Qt.ItemFlag.ItemIsEnabled | Qt.ItemFlag.ItemIsSelectable)
        if warnings:
            desc_i.setForeground(self._COLOR_WARNING)
            desc_i.setToolTip("\n".join(warnings))
        self.tabla.setItem(fila, 1, desc_i)

        precio_i = QTableWidgetItem(_fmt_precio(item.get("precio_aplicado")))
        precio_i.setTextAlignment(RIGHT)
        precio_i.setFlags(Qt.ItemFlag.ItemIsEnabled | Qt.ItemFlag.ItemIsSelectable)
        self.tabla.setItem(fila, 2, precio_i)

        return bool(warnings)

    # ─── MODO EDICIÓN ─────────────────────────────────────────────────────────
    _EDIT_INPUT_STYLE = (
        f"border: 1px solid {COLOR_BTN_PRIMARY}; border-radius: 3px;"
        f" padding: 2px 6px; font-size: {FONT_SIZE_MD}px; font-family: {FONT_FAMILY};"
    )
    _BLANK_INPUT_STYLE = (
        f"border: 1px solid #cccccc; border-radius: 3px; background: #fafafa;"
        f" padding: 2px 6px; font-size: {FONT_SIZE_MD}px; font-family: {FONT_FAMILY};"
        f" color: #999999;"
    )

    def _entrar_modo_edicion(self):
        self._modo_edicion = True
        self.btn_editar.setVisible(False)
        self.btn_reconstruir_pdf.setVisible(False)
        self.btn_guardar.setVisible(True)
        self.btn_cancelar_edicion.setVisible(True)
        self.btn_agregar_rep.setVisible(True)
        self.notas_edit.setReadOnly(False)
        items = get_presupuesto_items_full(self._presupuesto_id)
        self._poblar_tabla_edicion(items)
        self.lbl_titulo.setText(f"Presupuesto #{self._presupuesto_id:04d}  —  Editando")

    def _poblar_tabla_edicion(self, items: list[dict]):
        # En edición la tabla gana la columna Cant. (solo la usan los repuestos)
        for row in range(self.tabla.rowCount()):
            for col in range(self.tabla.columnCount()):
                self.tabla.removeCellWidget(row, col)
        self.tabla.clearSpans()
        self._sep_row = None
        self._row_meta = {}

        self.tabla.setColumnCount(4)
        self.tabla.setHorizontalHeaderLabels(["Nº", "Descripción", "Cant.", "Precio"])
        hdr = self.tabla.horizontalHeader()
        hdr.setSectionResizeMode(0, QHeaderView.ResizeMode.Fixed)
        hdr.setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        hdr.setSectionResizeMode(2, QHeaderView.ResizeMode.Fixed)
        hdr.setSectionResizeMode(3, QHeaderView.ResizeMode.Fixed)
        self.tabla.setColumnWidth(0, 90)
        self.tabla.setColumnWidth(2, 70)
        self.tabla.setColumnWidth(3, 150)

        self.tabla.setRowCount(len(items))

        for fila, item in enumerate(items):
            self.tabla.setRowHeight(fila, 32)
            if item.get("tipo") == "repuesto":
                self._insertar_fila_edicion_repuesto(fila, item)
            else:
                self._insertar_fila_edicion(
                    fila,
                    num=str(item.get("item_num") or "—"),
                    desc=item.get("desc_facra") or item.get("descripcion_custom") or "",
                    precio=item.get("precio_aplicado"),
                    servicio_id=item.get("servicio_id"),
                    es_custom=(item.get("servicio_id") is None),
                )

        # Fila en blanco para nuevo servicio
        self._agregar_fila_en_blanco()

    def _celda_guion(self, fila: int, col: int):
        item = QTableWidgetItem("—")
        item.setTextAlignment(CENTER)
        item.setForeground(QColor("#aaaaaa"))
        item.setFlags(Qt.ItemFlag.ItemIsEnabled)
        self.tabla.setItem(fila, col, item)

    def _insertar_fila_edicion(
        self, fila: int, num: str, desc: str, precio,
        servicio_id=None, es_custom: bool = False
    ):
        self._row_meta[fila] = {
            "tipo":        "servicio",
            "servicio_id": servicio_id,
            "es_custom":   es_custom,
        }

        # Col 0: Nº
        num_i = QTableWidgetItem(num)
        num_i.setTextAlignment(CENTER)
        num_i.setFlags(Qt.ItemFlag.ItemIsEnabled | Qt.ItemFlag.ItemIsSelectable)
        self.tabla.setItem(fila, 0, num_i)

        # Col 1: Descripción
        if es_custom:
            desc_edit = QLineEdit(desc)
            desc_edit.setPlaceholderText("Describí el servicio...")
            desc_edit.setStyleSheet(self._EDIT_INPUT_STYLE)
            self.tabla.setCellWidget(fila, 1, desc_edit)
            # Quitar item texto para col 1
            self.tabla.setItem(fila, 1, None)
        else:
            desc_i = QTableWidgetItem(desc)
            desc_i.setTextAlignment(LEFT)
            desc_i.setFlags(Qt.ItemFlag.ItemIsEnabled | Qt.ItemFlag.ItemIsSelectable)
            self.tabla.setItem(fila, 1, desc_i)

        # Col 2: cantidad no aplica a servicios
        self._celda_guion(fila, 2)

        # Col 3: Precio → siempre un QLineEdit en modo edición
        precio_edit = QLineEdit(_fmt_precio(precio) if precio is not None else "")
        precio_edit.setPlaceholderText("$ 0,00")
        precio_edit.setStyleSheet(self._EDIT_INPUT_STYLE)
        self.tabla.setCellWidget(fila, 3, precio_edit)

    def _insertar_fila_edicion_repuesto(self, fila: int, item: dict):
        """Fila editable de repuesto: descripción, cantidad y precio unitario."""
        self._row_meta[fila] = {
            "tipo":             "repuesto",
            "repuesto_codigo":  item.get("repuesto_codigo"),
            "stock_al_cotizar": item.get("stock_al_cotizar"),
            "codigo_editable":  False,
        }

        # Col 0: código congelado (identifica la línea contra el catálogo)
        num_i = QTableWidgetItem(item.get("repuesto_codigo") or "—")
        num_i.setTextAlignment(CENTER)
        num_i.setFlags(Qt.ItemFlag.ItemIsEnabled | Qt.ItemFlag.ItemIsSelectable)
        self.tabla.setItem(fila, 0, num_i)

        # Col 1: descripción editable
        desc_edit = QLineEdit(item.get("descripcion_custom") or "")
        desc_edit.setPlaceholderText("Descripción del repuesto...")
        desc_edit.setStyleSheet(self._EDIT_INPUT_STYLE)
        self.tabla.setCellWidget(fila, 1, desc_edit)

        # Col 2: cantidad
        spin = QSpinBox()
        spin.setRange(1, 999)
        spin.setValue(int(item.get("cantidad") or 1))
        self.tabla.setCellWidget(fila, 2, spin)

        # Col 3: precio unitario (el subtotal se recalcula al guardar)
        precio_edit = QLineEdit(
            _fmt_precio(item.get("precio_unitario")) if item.get("precio_unitario") is not None else ""
        )
        precio_edit.setPlaceholderText("$ 0,00")
        precio_edit.setStyleSheet(self._EDIT_INPUT_STYLE)
        self.tabla.setCellWidget(fila, 3, precio_edit)

    def _agregar_fila_repuesto(self):
        """Alta manual de un repuesto en edición (código opcional a mano)."""
        # Siempre al final: la fila en blanco de "nuevo servicio" captura su
        # índice en un closure y no debe correrse.
        row = self.tabla.rowCount()
        self.tabla.insertRow(row)
        self.tabla.setRowHeight(row, 32)

        self._row_meta[row] = {
            "tipo":             "repuesto",
            "repuesto_codigo":  None,
            "stock_al_cotizar": None,
            "codigo_editable":  True,
        }

        codigo_edit = QLineEdit()
        codigo_edit.setPlaceholderText("Código (opc.)")
        codigo_edit.setStyleSheet(self._EDIT_INPUT_STYLE)
        self.tabla.setCellWidget(row, 0, codigo_edit)

        desc_edit = QLineEdit()
        desc_edit.setPlaceholderText("Descripción del repuesto...")
        desc_edit.setStyleSheet(self._EDIT_INPUT_STYLE)
        self.tabla.setCellWidget(row, 1, desc_edit)

        spin = QSpinBox()
        spin.setRange(1, 999)
        spin.setValue(1)
        self.tabla.setCellWidget(row, 2, spin)

        precio_edit = QLineEdit()
        precio_edit.setPlaceholderText("$ 0,00")
        precio_edit.setStyleSheet(self._EDIT_INPUT_STYLE)
        self.tabla.setCellWidget(row, 3, precio_edit)

        desc_edit.setFocus()

    def _agregar_fila_en_blanco(self):
        row = self.tabla.rowCount()
        self.tabla.insertRow(row)
        self.tabla.setRowHeight(row, 32)
        self._blank_row = row

        # Col 0: marcador visual
        num_i = QTableWidgetItem("—")
        num_i.setTextAlignment(CENTER)
        num_i.setForeground(QColor("#aaaaaa"))
        num_i.setFlags(Qt.ItemFlag.ItemIsEnabled)
        self.tabla.setItem(row, 0, num_i)

        # Col 1: descripción editable
        desc_edit = QLineEdit()
        desc_edit.setPlaceholderText("Nuevo servicio (opcional)...")
        desc_edit.setStyleSheet(self._BLANK_INPUT_STYLE)
        self.tabla.setCellWidget(row, 1, desc_edit)

        # Col 2: cantidad no aplica
        self._celda_guion(row, 2)

        # Col 3: precio
        precio_edit = QLineEdit()
        precio_edit.setPlaceholderText("$ 0,00")
        precio_edit.setStyleSheet(self._BLANK_INPUT_STYLE)
        self.tabla.setCellWidget(row, 3, precio_edit)

        # Cuando se confirme la descripción, convertir en fila real
        def _on_desc_confirmada():
            desc_edit.editingFinished.disconnect(_on_desc_confirmada)
            texto = desc_edit.text().strip()
            if not texto:
                return
            # Convertir fila en blanco a fila real de custom
            self.tabla.removeCellWidget(row, 1)
            self.tabla.removeCellWidget(row, 3)
            precio_val = _parse_precio(precio_edit.text())
            self._insertar_fila_edicion(
                row, "—", texto, precio_val,
                servicio_id=None, es_custom=True
            )
            # Actualizar marcador col 0
            num_i_new = self.tabla.item(row, 0)
            if num_i_new:
                num_i_new.setForeground(QColor("#333333"))
            # Agregar nueva fila en blanco
            self._blank_row = None
            self._agregar_fila_en_blanco()

        desc_edit.editingFinished.connect(_on_desc_confirmada)

    # ─── Guardar y cancelar ───────────────────────────────────────────────────
    def _guardar_cambios(self):
        items_data = []
        blank = self._blank_row

        for fila in range(self.tabla.rowCount()):
            if fila == blank:
                # Fila en blanco: solo incluir si tiene texto
                desc_w = self.tabla.cellWidget(fila, 1)
                precio_w = self.tabla.cellWidget(fila, 3)
                if isinstance(desc_w, QLineEdit) and desc_w.text().strip():
                    items_data.append({
                        "servicio_id":      None,
                        "descripcion_custom": desc_w.text().strip(),
                        "precio_aplicado":  _parse_precio(
                            precio_w.text() if isinstance(precio_w, QLineEdit) else ""
                        ),
                    })
                continue

            meta = self._row_meta.get(fila) or {}

            if meta.get("tipo") == "repuesto":
                desc_w = self.tabla.cellWidget(fila, 1)
                desc = desc_w.text().strip() if isinstance(desc_w, QLineEdit) else ""
                if not desc:
                    continue
                spin = self.tabla.cellWidget(fila, 2)
                cantidad = spin.value() if isinstance(spin, QSpinBox) else 1
                precio_w = self.tabla.cellWidget(fila, 3)
                unitario = _parse_precio(
                    precio_w.text() if isinstance(precio_w, QLineEdit) else "0"
                )
                if meta.get("codigo_editable"):
                    codigo_w = self.tabla.cellWidget(fila, 0)
                    codigo = codigo_w.text().strip() if isinstance(codigo_w, QLineEdit) else ""
                    codigo = codigo or None
                else:
                    codigo = meta.get("repuesto_codigo")
                items_data.append({
                    "servicio_id":       None,
                    "descripcion_custom": desc,
                    # El subtotal se recalcula siempre: precio_aplicado = cant × unitario
                    "precio_aplicado":   round(cantidad * unitario, 2),
                    "tipo":              "repuesto",
                    "repuesto_codigo":   codigo,
                    "cantidad":          cantidad,
                    "precio_unitario":   unitario,
                    # El stock congelado al cotizar se preserva tal cual
                    "stock_al_cotizar":  meta.get("stock_al_cotizar"),
                })
                continue

            servicio_id = meta.get("servicio_id")
            es_custom   = meta.get("es_custom", False)

            # Descripción
            if es_custom:
                desc_w = self.tabla.cellWidget(fila, 1)
                desc_custom = desc_w.text().strip() if isinstance(desc_w, QLineEdit) else ""
            else:
                desc_custom = None

            # Precio
            precio_w = self.tabla.cellWidget(fila, 3)
            precio = _parse_precio(
                precio_w.text() if isinstance(precio_w, QLineEdit) else "0"
            )

            items_data.append({
                "servicio_id":       servicio_id,
                "descripcion_custom": desc_custom,
                "precio_aplicado":   precio,
            })

        notas = self.notas_edit.toPlainText().strip()

        try:
            actualizar_presupuesto(self._presupuesto_id, items_data, notas)
        except Exception as exc:
            QMessageBox.critical(self, "Error", f"No se pudieron guardar los cambios:\n{exc}")
            return

        self._salir_modo_edicion()

    def _cancelar_edicion(self):
        self._salir_modo_edicion()

    def _salir_modo_edicion(self):
        self._modo_edicion = False
        self._blank_row    = None
        self.btn_editar.setVisible(True)
        self.btn_reconstruir_pdf.setVisible(True)
        self.btn_guardar.setVisible(False)
        self.btn_cancelar_edicion.setVisible(False)
        self.btn_agregar_rep.setVisible(False)
        self._cargar()

    # ─── Reconstruir PDF ──────────────────────────────────────────────────────
    def _reconstruir_pdf(self):
        if not self._presupuesto_id or not self._detalle:
            return
        items = get_presupuesto_items_full(self._presupuesto_id)
        items_pdf = [
            {
                "item_num":       i.get("item_num"),
                "descripcion":    i.get("desc_facra") or i.get("descripcion_custom") or "",
                "precio_aplicado": i.get("precio_aplicado"),
            }
            for i in items
            if i.get("tipo") != "repuesto"
        ]
        repuestos_pdf = [
            {
                "codigo":          i.get("repuesto_codigo"),
                "descripcion":     i.get("descripcion_custom") or "",
                "cantidad":        i.get("cantidad"),
                "precio_unitario": i.get("precio_unitario"),
                "precio_aplicado": i.get("precio_aplicado"),
            }
            for i in items
            if i.get("tipo") == "repuesto"
        ]
        total = self._detalle.get("total") or 0.0

        # Determinar próxima versión
        pdfs = get_pdfs_presupuesto(self._presupuesto_id)
        version = (pdfs[0]["version"] + 1) if pdfs else 1

        pdf_path = os.path.join(
            _PDF_DIR, f"presupuesto_{self._presupuesto_id:04d}_v{version}.pdf"
        )
        try:
            generar_pdf(
                presupuesto_id=self._presupuesto_id,
                cliente=self._detalle.get("cliente", "—"),
                motor=self._detalle.get("motor", "—"),
                items=items_pdf,
                total=total,
                output_path=pdf_path,
                repuestos=repuestos_pdf,
            )
            guardar_pdf_historial(self._presupuesto_id, pdf_path)
            self._actualizar_pdf_section()
            QDesktopServices.openUrl(QUrl.fromLocalFile(pdf_path))
        except Exception as exc:
            QMessageBox.critical(self, "Error PDF", f"No se pudo generar el PDF:\n{exc}")

    # ─── Buscador ─────────────────────────────────────────────────────────────
    def _filtrar_tabla(self, texto: str):
        texto = texto.strip().lower()
        for row in range(self.tabla.rowCount()):
            if row == self._blank_row:
                self.tabla.setRowHidden(row, bool(texto))
                continue
            if not texto:
                self.tabla.setRowHidden(row, False)
                continue
            num_item  = self.tabla.item(row, 0)
            desc_item = self.tabla.item(row, 1)
            desc_w    = self.tabla.cellWidget(row, 1)
            num_t  = num_item.text().lower()  if num_item  else ""
            if desc_item:
                desc_t = desc_item.text().lower()
            elif isinstance(desc_w, QLineEdit):
                desc_t = desc_w.text().lower()
            else:
                desc_t = ""
            self.tabla.setRowHidden(row, texto not in num_t and texto not in desc_t)

    # ─── Volver ───────────────────────────────────────────────────────────────
    def _accion_volver(self):
        if self._modo_edicion:
            res = QMessageBox.question(
                self, "Cambios sin guardar",
                "Tenés cambios sin guardar. ¿Salir de todas formas?",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            )
            if res != QMessageBox.StandardButton.Yes:
                return
            self._modo_edicion = False
        self.volver.emit(self._back_index)
