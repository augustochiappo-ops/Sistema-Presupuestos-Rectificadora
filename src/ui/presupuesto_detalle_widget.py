"""
Vista de detalle y edición de un presupuesto.
- Modo vista (read-only): tabla de servicios, notas, historial de PDFs
- Modo edición: precios editables, servicios custom, notas editables
"""
import os

from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QTableWidgetItem, QHeaderView, QFrame, QLineEdit,
    QTextEdit, QMessageBox, QSizePolicy,
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
        self._build_ui()

    # ─── Construcción ─────────────────────────────────────────────────────────
    def _build_ui(self):
        self.setStyleSheet(f"background-color: {COLOR_CONTENT_BG};")
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        root.addWidget(self._build_nav_bar())
        root.addWidget(self._build_info_bar())
        root.addWidget(self._build_search_bar())
        root.addWidget(self._build_tabla(), 1)
        root.addWidget(self._build_notas_section())
        root.addWidget(self._build_pdf_section())

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

        layout.addWidget(self.btn_volver)
        layout.addWidget(self.lbl_titulo, 1)
        layout.addWidget(self.btn_reconstruir_pdf)
        layout.addWidget(self.btn_editar)
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
    def _poblar_tabla_vista(self, items: list[dict]):
        self.tabla.setEditTriggers(ZoomableTable.EditTrigger.NoEditTriggers)
        # Limpiar cell widgets previos
        for row in range(self.tabla.rowCount()):
            self.tabla.removeCellWidget(row, 2)
        self.tabla.setRowCount(len(items))

        for fila, item in enumerate(items):
            self.tabla.setRowHeight(fila, 28)

            desc = item.get("desc_facra") or item.get("descripcion_custom") or "—"
            num  = str(item.get("item_num") or "—")

            num_i = QTableWidgetItem(num)
            num_i.setTextAlignment(CENTER)
            num_i.setFlags(Qt.ItemFlag.ItemIsEnabled | Qt.ItemFlag.ItemIsSelectable)
            self.tabla.setItem(fila, 0, num_i)

            desc_i = QTableWidgetItem(desc)
            desc_i.setTextAlignment(LEFT)
            desc_i.setFlags(Qt.ItemFlag.ItemIsEnabled | Qt.ItemFlag.ItemIsSelectable)
            self.tabla.setItem(fila, 1, desc_i)

            precio_i = QTableWidgetItem(_fmt_precio(item.get("precio_aplicado")))
            precio_i.setTextAlignment(RIGHT)
            precio_i.setFlags(Qt.ItemFlag.ItemIsEnabled | Qt.ItemFlag.ItemIsSelectable)
            self.tabla.setItem(fila, 2, precio_i)

    # ─── MODO EDICIÓN ─────────────────────────────────────────────────────────
    def _entrar_modo_edicion(self):
        self._modo_edicion = True
        self.btn_editar.setVisible(False)
        self.btn_reconstruir_pdf.setVisible(False)
        self.btn_guardar.setVisible(True)
        self.btn_cancelar_edicion.setVisible(True)
        self.notas_edit.setReadOnly(False)
        items = get_presupuesto_items_full(self._presupuesto_id)
        self._poblar_tabla_edicion(items)
        self.lbl_titulo.setText(f"Presupuesto #{self._presupuesto_id:04d}  —  Editando")

    def _poblar_tabla_edicion(self, items: list[dict]):
        # Limpiar cell widgets previos
        for row in range(self.tabla.rowCount()):
            self.tabla.removeCellWidget(row, 1)
            self.tabla.removeCellWidget(row, 2)

        self.tabla.setRowCount(len(items))

        for fila, item in enumerate(items):
            self.tabla.setRowHeight(fila, 32)
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

    def _insertar_fila_edicion(
        self, fila: int, num: str, desc: str, precio,
        servicio_id=None, es_custom: bool = False
    ):
        # Col 0: Nº
        num_i = QTableWidgetItem(num)
        num_i.setTextAlignment(CENTER)
        num_i.setFlags(Qt.ItemFlag.ItemIsEnabled | Qt.ItemFlag.ItemIsSelectable)
        num_i.setData(Qt.ItemDataRole.UserRole, {
            "servicio_id": servicio_id,
            "es_custom":   es_custom,
        })
        self.tabla.setItem(fila, 0, num_i)

        # Col 1: Descripción
        if es_custom:
            desc_edit = QLineEdit(desc)
            desc_edit.setPlaceholderText("Describí el servicio...")
            desc_edit.setStyleSheet(
                f"border: 1px solid {COLOR_BTN_PRIMARY}; border-radius: 3px;"
                f" padding: 2px 6px; font-size: {FONT_SIZE_MD}px; font-family: {FONT_FAMILY};"
            )
            self.tabla.setCellWidget(fila, 1, desc_edit)
            # Quitar item texto para col 1
            self.tabla.setItem(fila, 1, None)
        else:
            desc_i = QTableWidgetItem(desc)
            desc_i.setTextAlignment(LEFT)
            desc_i.setFlags(Qt.ItemFlag.ItemIsEnabled | Qt.ItemFlag.ItemIsSelectable)
            self.tabla.setItem(fila, 1, desc_i)

        # Col 2: Precio → siempre un QLineEdit en modo edición
        precio_edit = QLineEdit(_fmt_precio(precio) if precio is not None else "")
        precio_edit.setPlaceholderText("$ 0,00")
        precio_edit.setStyleSheet(
            f"border: 1px solid {COLOR_BTN_PRIMARY}; border-radius: 3px;"
            f" padding: 2px 6px; font-size: {FONT_SIZE_MD}px; font-family: {FONT_FAMILY};"
        )
        self.tabla.setCellWidget(fila, 2, precio_edit)

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
        desc_edit.setStyleSheet(
            f"border: 1px solid #cccccc; border-radius: 3px; background: #fafafa;"
            f" padding: 2px 6px; font-size: {FONT_SIZE_MD}px; font-family: {FONT_FAMILY};"
            f" color: #999999;"
        )
        self.tabla.setCellWidget(row, 1, desc_edit)

        # Col 2: precio
        precio_edit = QLineEdit()
        precio_edit.setPlaceholderText("$ 0,00")
        precio_edit.setStyleSheet(
            f"border: 1px solid #cccccc; border-radius: 3px; background: #fafafa;"
            f" padding: 2px 6px; font-size: {FONT_SIZE_MD}px; font-family: {FONT_FAMILY};"
            f" color: #999999;"
        )
        self.tabla.setCellWidget(row, 2, precio_edit)

        # Cuando se confirme la descripción, convertir en fila real
        def _on_desc_confirmada():
            desc_edit.editingFinished.disconnect(_on_desc_confirmada)
            texto = desc_edit.text().strip()
            if not texto:
                return
            # Convertir fila en blanco a fila real de custom
            self.tabla.removeCellWidget(row, 1)
            self.tabla.removeCellWidget(row, 2)
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
                precio_w = self.tabla.cellWidget(fila, 2)
                if isinstance(desc_w, QLineEdit) and desc_w.text().strip():
                    items_data.append({
                        "servicio_id":      None,
                        "descripcion_custom": desc_w.text().strip(),
                        "precio_aplicado":  _parse_precio(
                            precio_w.text() if isinstance(precio_w, QLineEdit) else ""
                        ),
                    })
                continue

            num_item = self.tabla.item(fila, 0)
            if not num_item:
                continue
            meta = num_item.data(Qt.ItemDataRole.UserRole) or {}
            servicio_id = meta.get("servicio_id")
            es_custom   = meta.get("es_custom", False)

            # Descripción
            if es_custom:
                desc_w = self.tabla.cellWidget(fila, 1)
                desc_custom = desc_w.text().strip() if isinstance(desc_w, QLineEdit) else ""
            else:
                desc_custom = None

            # Precio
            precio_w = self.tabla.cellWidget(fila, 2)
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
