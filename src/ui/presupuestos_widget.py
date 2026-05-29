"""
Pantalla: Presupuestos.
Historial de presupuestos + wizard de creación (4 pasos).
"""
import os

from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QTableWidgetItem, QHeaderView, QStackedWidget, QFrame,
    QLineEdit, QSizePolicy, QMessageBox, QListWidget, QListWidgetItem,
)
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QFont, QDesktopServices, QColor
from PyQt6.QtCore import QUrl

from ..data.facra import get_servicios_para_lista
from ..data.db import (
    guardar_presupuesto, get_presupuestos, update_presupuesto_pdf,
    get_clientes_nombres, guardar_pdf_historial,
)
from ..utils.pdf_gen import generar_pdf
from .motor_selector_widget import MotorSelectorWidget
from .widgets import ZoomableTable
from .styles import (
    FONT_FAMILY, FONT_SIZE_MD, FONT_SIZE_SM, FONT_SIZE_LG, FONT_SIZE_XL,
    COLOR_TEXT_PRIMARY, COLOR_TEXT_MUTED, COLOR_TEXT_PLACEHOLDER,
    COLOR_CONTENT_BG, COLOR_WHITE, COLOR_PANEL_BG, COLOR_PANEL_BORDER,
    COLOR_BTN_PRIMARY, COLOR_BTN_PRIMARY_HOV,
    BUTTON_PRIMARY, BUTTON_SUCCESS, SEARCH_INPUT,
)

CENTER = Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignHCenter
LEFT   = Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignLeft
RIGHT  = Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignRight

# Carpeta donde se guardan los PDFs generados
_PDF_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "Presupuestos",
)


def _fmt_precio(valor) -> str:
    if valor is None:
        return "—"
    try:
        entero, decimal = f"{float(valor):.2f}".split(".")
        entero_fmt = ""
        for i, d in enumerate(reversed(entero)):
            if i and i % 3 == 0:
                entero_fmt = "." + entero_fmt
            entero_fmt = d + entero_fmt
        return f"$ {entero_fmt},{decimal}"
    except (ValueError, TypeError):
        return "—"


_BTN_LINK = f"""
QPushButton {{
    background: transparent;
    border: none;
    color: {COLOR_BTN_PRIMARY};
    font-size: {FONT_SIZE_MD}px;
    font-family: {FONT_FAMILY};
    padding: 6px 0;
    text-align: left;
}}
QPushButton:hover {{
    color: {COLOR_BTN_PRIMARY_HOV};
    text-decoration: underline;
}}
"""


class PresupuestosWidget(QWidget):
    # Emite el id del presupuesto a abrir en la vista detalle
    abrir_presupuesto = pyqtSignal(int)

    def __init__(self):
        super().__init__()
        # Estado del wizard
        self._cliente_nombre: str = ""
        self._motor_actual: dict = {}
        self._presupuestos_actuales: list[dict] = []

        self._build_ui()

    # ─── Construcción principal ───────────────────────────────────────────────
    def _build_ui(self):
        self.setStyleSheet(f"background-color: {COLOR_CONTENT_BG};")
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        self._stack = QStackedWidget()
        self._stack.addWidget(self._build_historial_page())    # 0
        self._stack.addWidget(self._build_cliente_page())      # 1
        self._stack.addWidget(self._build_motor_page())        # 2
        self._stack.addWidget(self._build_servicios_page())    # 3

        root.addWidget(self._stack)

    # ─── PÁGINA 0: Historial ──────────────────────────────────────────────────
    def _build_historial_page(self) -> QWidget:
        page = QWidget()
        page.setStyleSheet(f"background-color: {COLOR_CONTENT_BG};")
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Barra superior
        topbar = QWidget()
        topbar.setStyleSheet(f"background-color: {COLOR_CONTENT_BG};")
        top_layout = QHBoxLayout(topbar)
        top_layout.setContentsMargins(20, 16, 20, 12)

        titulo = QLabel("Presupuestos")
        titulo.setFont(QFont(FONT_FAMILY, FONT_SIZE_XL, QFont.Weight.Bold))
        titulo.setStyleSheet(f"color: {COLOR_TEXT_PRIMARY};")

        btn_nuevo = QPushButton("＋  Nuevo Presupuesto")
        btn_nuevo.setStyleSheet(BUTTON_SUCCESS)
        btn_nuevo.setFixedHeight(40)
        btn_nuevo.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_nuevo.clicked.connect(self._iniciar_wizard)

        top_layout.addWidget(titulo)
        top_layout.addStretch()
        top_layout.addWidget(btn_nuevo)
        layout.addWidget(topbar)

        # Tabla de historial
        self.tabla_historial = ZoomableTable()
        self.tabla_historial.setColumnCount(5)
        self.tabla_historial.setHorizontalHeaderLabels(
            ["Nº", "Fecha", "Cliente", "Motor", "Total"]
        )
        self.tabla_historial.setEditTriggers(ZoomableTable.EditTrigger.NoEditTriggers)
        self.tabla_historial.setSelectionBehavior(ZoomableTable.SelectionBehavior.SelectRows)
        self.tabla_historial.setAlternatingRowColors(True)
        self.tabla_historial.verticalHeader().setVisible(False)
        self.tabla_historial.setShowGrid(True)
        self.tabla_historial.setSortingEnabled(False)

        hdr = self.tabla_historial.horizontalHeader()
        hdr.setDefaultAlignment(Qt.AlignmentFlag.AlignCenter)
        hdr.setSectionResizeMode(0, QHeaderView.ResizeMode.Fixed)
        hdr.setSectionResizeMode(1, QHeaderView.ResizeMode.Fixed)
        hdr.setSectionResizeMode(2, QHeaderView.ResizeMode.Fixed)
        hdr.setSectionResizeMode(3, QHeaderView.ResizeMode.Stretch)
        hdr.setSectionResizeMode(4, QHeaderView.ResizeMode.Fixed)
        self.tabla_historial.setColumnWidth(0, 60)
        self.tabla_historial.setColumnWidth(1, 100)
        self.tabla_historial.setColumnWidth(2, 200)
        self.tabla_historial.setColumnWidth(4, 140)

        # Clic en una fila → abrir detalle del presupuesto
        self.tabla_historial.cellClicked.connect(self._on_fila_historial_click)

        layout.addWidget(self.tabla_historial, 1)  # stretch=1 para que ocupe todo el espacio

        # Placeholder cuando no hay presupuestos
        self._lbl_vacio = QLabel(
            "No hay presupuestos aún.\nUsá el botón para crear el primero."
        )
        self._lbl_vacio.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._lbl_vacio.setStyleSheet(
            f"color: {COLOR_TEXT_PLACEHOLDER}; font-size: {FONT_SIZE_MD}px;"
            " line-height: 1.8;"
        )
        layout.addWidget(self._lbl_vacio, 0, Qt.AlignmentFlag.AlignCenter)
        layout.addStretch()

        return page

    def _cargar_historial(self):
        presupuestos = get_presupuestos()
        self._presupuestos_actuales = presupuestos

        if not presupuestos:
            self.tabla_historial.setVisible(False)
            self._lbl_vacio.setVisible(True)
            return

        self.tabla_historial.setVisible(True)
        self._lbl_vacio.setVisible(False)
        self.tabla_historial.setRowCount(len(presupuestos))

        for fila, p in enumerate(presupuestos):
            self.tabla_historial.setRowHeight(fila, 28)

            # Nº
            nro = QTableWidgetItem(f"{p['id']:04d}")
            nro.setTextAlignment(CENTER)
            self.tabla_historial.setItem(fila, 0, nro)
            # Fecha
            fecha = p.get("fecha") or ""
            try:
                y, m, d = fecha.split("-")
                fecha_fmt = f"{d}/{m}/{y}"
            except Exception:
                fecha_fmt = fecha
            fecha_item = QTableWidgetItem(fecha_fmt)
            fecha_item.setTextAlignment(CENTER)
            self.tabla_historial.setItem(fila, 1, fecha_item)
            # Cliente
            cliente_item = QTableWidgetItem(p.get("cliente") or "—")
            cliente_item.setTextAlignment(LEFT)
            self.tabla_historial.setItem(fila, 2, cliente_item)
            # Motor
            motor_item = QTableWidgetItem(p.get("motor") or "—")
            motor_item.setTextAlignment(LEFT)
            self.tabla_historial.setItem(fila, 3, motor_item)
            # Total
            total_item = QTableWidgetItem(_fmt_precio(p.get("total")))
            total_item.setTextAlignment(RIGHT)
            self.tabla_historial.setItem(fila, 4, total_item)

    def _on_fila_historial_click(self, row: int, col: int):
        if row >= len(self._presupuestos_actuales):
            return
        p = self._presupuestos_actuales[row]
        self.abrir_presupuesto.emit(p["id"])

    def showEvent(self, event):
        super().showEvent(event)
        self._cargar_historial()

    # ─── PÁGINA 1: Cliente ────────────────────────────────────────────────────
    def _build_cliente_page(self) -> QWidget:
        page = QWidget()
        page.setStyleSheet(f"background-color: {COLOR_CONTENT_BG};")
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        layout.addWidget(self._build_nav_bar("Cancelar", lambda: self._ir(0)))

        # Contenido centrado
        content = QWidget()
        content.setStyleSheet(f"background-color: {COLOR_CONTENT_BG};")
        c_layout = QVBoxLayout(content)
        c_layout.setContentsMargins(60, 40, 60, 40)
        c_layout.setSpacing(20)

        titulo = QLabel("Nuevo Presupuesto")
        titulo.setFont(QFont(FONT_FAMILY, FONT_SIZE_XL, QFont.Weight.Bold))
        titulo.setStyleSheet(f"color: {COLOR_TEXT_PRIMARY};")
        c_layout.addWidget(titulo)

        subtitulo = QLabel("Paso 1 de 3  —  Ingresá el nombre del cliente")
        subtitulo.setStyleSheet(f"color: {COLOR_TEXT_MUTED}; font-size: {FONT_SIZE_MD}px;")
        c_layout.addWidget(subtitulo)

        c_layout.addSpacing(10)

        lbl = QLabel("Nombre del cliente")
        lbl.setFont(QFont(FONT_FAMILY, FONT_SIZE_MD, QFont.Weight.Bold))
        lbl.setStyleSheet(f"color: {COLOR_TEXT_PRIMARY};")
        c_layout.addWidget(lbl)

        self.input_cliente = QLineEdit()
        self.input_cliente.setPlaceholderText("Ej: García Juan Carlos")
        self.input_cliente.setStyleSheet(SEARCH_INPUT)
        self.input_cliente.setFixedHeight(44)
        self.input_cliente.setMaximumWidth(480)
        self.input_cliente.textChanged.connect(self._on_cliente_changed)
        self.input_cliente.returnPressed.connect(self._avanzar_a_motor)
        c_layout.addWidget(self.input_cliente)

        # Lista de sugerencias de clientes existentes
        self.lista_sugerencias = QListWidget()
        self.lista_sugerencias.setMaximumWidth(480)
        self.lista_sugerencias.setMaximumHeight(150)
        self.lista_sugerencias.setVisible(False)
        self.lista_sugerencias.setStyleSheet(f"""
            QListWidget {{
                border: 1px solid #3b5090;
                border-radius: 6px;
                background: white;
                font-size: {FONT_SIZE_MD}px;
                font-family: {FONT_FAMILY};
            }}
            QListWidget::item {{ padding: 7px 12px; }}
            QListWidget::item:hover {{ background: #dce4f5; }}
            QListWidget::item:selected {{ background: #3b5090; color: white; }}
        """)
        self.lista_sugerencias.itemClicked.connect(self._seleccionar_sugerencia)
        c_layout.addWidget(self.lista_sugerencias)

        self.btn_siguiente_cliente = QPushButton("Siguiente  →")
        self.btn_siguiente_cliente.setStyleSheet(BUTTON_PRIMARY)
        self.btn_siguiente_cliente.setFixedHeight(42)
        self.btn_siguiente_cliente.setFixedWidth(180)
        self.btn_siguiente_cliente.setEnabled(False)
        self.btn_siguiente_cliente.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_siguiente_cliente.clicked.connect(self._avanzar_a_motor)
        c_layout.addWidget(self.btn_siguiente_cliente)

        c_layout.addStretch()
        layout.addWidget(content)
        return page

    def _on_cliente_changed(self, texto: str):
        self.btn_siguiente_cliente.setEnabled(bool(texto.strip()))
        self._actualizar_sugerencias(texto)

    def _actualizar_sugerencias(self, texto: str):
        texto = texto.strip()
        if not texto:
            self.lista_sugerencias.setVisible(False)
            return
        nombres = get_clientes_nombres()
        matches = [n for n in nombres if texto.lower() in n.lower()]
        if not matches:
            self.lista_sugerencias.setVisible(False)
            return
        self.lista_sugerencias.blockSignals(True)
        self.lista_sugerencias.clear()
        for n in matches[:8]:
            self.lista_sugerencias.addItem(QListWidgetItem(n))
        self.lista_sugerencias.blockSignals(False)
        self.lista_sugerencias.setVisible(True)

    def _seleccionar_sugerencia(self, item: QListWidgetItem):
        self.input_cliente.setText(item.text())
        self.lista_sugerencias.setVisible(False)

    def _avanzar_a_motor(self):
        texto = self.input_cliente.text().strip()
        if not texto:
            return
        self._cliente_nombre = texto
        self._selector_motor.limpiar_busqueda()
        self._ir(2)

    # ─── PÁGINA 2: Selector de motor ─────────────────────────────────────────
    def _build_motor_page(self) -> QWidget:
        page = QWidget()
        page.setStyleSheet(f"background-color: {COLOR_CONTENT_BG};")
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        layout.addWidget(self._build_nav_bar("Volver", lambda: self._ir(1)))

        self._selector_motor = MotorSelectorWidget(titulo="Paso 2 — Seleccioná el motor")
        self._selector_motor.motor_seleccionado.connect(self._on_motor_elegido)
        layout.addWidget(self._selector_motor)

        return page

    def _on_motor_elegido(self, motor: dict):
        self._motor_actual = motor
        lista_num = motor.get("lista_num")
        servicios = get_servicios_para_lista(lista_num)
        self._poblar_servicios(servicios, lista_num)
        self._ir(3)

    # ─── PÁGINA 3: Servicios con checkboxes ──────────────────────────────────
    def _build_servicios_page(self) -> QWidget:
        page = QWidget()
        page.setStyleSheet(f"background-color: {COLOR_CONTENT_BG};")
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        layout.addWidget(self._build_nav_bar("Volver", lambda: self._ir(2)))

        # Cabecera informativa
        info_bar = QWidget()
        info_bar.setStyleSheet(f"background-color: {COLOR_PANEL_BG}; border-bottom: 1px solid {COLOR_PANEL_BORDER};")
        info_layout = QHBoxLayout(info_bar)
        info_layout.setContentsMargins(20, 10, 20, 10)

        self.lbl_motor_wiz = QLabel("")
        self.lbl_motor_wiz.setFont(QFont(FONT_FAMILY, FONT_SIZE_MD, QFont.Weight.Bold))
        self.lbl_motor_wiz.setStyleSheet(f"color: {COLOR_TEXT_PRIMARY};")

        self.lbl_lista_wiz = QLabel("")
        self.lbl_lista_wiz.setStyleSheet(f"color: {COLOR_TEXT_MUTED}; font-size: {FONT_SIZE_SM}px;")

        lbl_hint = QLabel("Tildá los servicios a realizar")
        lbl_hint.setStyleSheet(f"color: {COLOR_TEXT_MUTED}; font-size: {FONT_SIZE_SM}px;")

        info_layout.addWidget(self.lbl_motor_wiz)
        info_layout.addWidget(self.lbl_lista_wiz)
        info_layout.addStretch()
        info_layout.addWidget(lbl_hint)
        layout.addWidget(info_bar)

        # Tabla de servicios con checkboxes
        self.tabla_servicios_wiz = ZoomableTable()
        self.tabla_servicios_wiz.setColumnCount(4)
        self.tabla_servicios_wiz.setHorizontalHeaderLabels(
            ["", "Nº", "Descripción", "Precio"]
        )
        self.tabla_servicios_wiz.setEditTriggers(ZoomableTable.EditTrigger.NoEditTriggers)
        self.tabla_servicios_wiz.setSelectionBehavior(ZoomableTable.SelectionBehavior.SelectRows)
        self.tabla_servicios_wiz.setAlternatingRowColors(True)
        self.tabla_servicios_wiz.verticalHeader().setVisible(False)
        self.tabla_servicios_wiz.setShowGrid(True)
        self.tabla_servicios_wiz.setSortingEnabled(False)

        hdr = self.tabla_servicios_wiz.horizontalHeader()
        hdr.setDefaultAlignment(Qt.AlignmentFlag.AlignCenter)
        hdr.setSectionResizeMode(0, QHeaderView.ResizeMode.Fixed)
        hdr.setSectionResizeMode(1, QHeaderView.ResizeMode.Fixed)
        hdr.setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)
        hdr.setSectionResizeMode(3, QHeaderView.ResizeMode.Fixed)
        self.tabla_servicios_wiz.setColumnWidth(0, 36)
        self.tabla_servicios_wiz.setColumnWidth(1, 52)
        self.tabla_servicios_wiz.setColumnWidth(3, 140)

        self.tabla_servicios_wiz.itemChanged.connect(self._recalcular_total)
        self.tabla_servicios_wiz.cellClicked.connect(self._toggle_check)

        layout.addWidget(self.tabla_servicios_wiz)

        # Barra inferior: total + botón finalizar
        bottom_bar = QWidget()
        bottom_bar.setStyleSheet(
            f"background-color: {COLOR_WHITE}; border-top: 2px solid #1a2744;"
        )
        bottom_bar.setFixedHeight(60)
        bottom_layout = QHBoxLayout(bottom_bar)
        bottom_layout.setContentsMargins(20, 0, 20, 0)

        lbl_total_titulo = QLabel("Total:")
        lbl_total_titulo.setFont(QFont(FONT_FAMILY, FONT_SIZE_LG, QFont.Weight.Bold))
        lbl_total_titulo.setStyleSheet(f"color: {COLOR_TEXT_PRIMARY};")

        self.lbl_total = QLabel("$ 0,00")
        self.lbl_total.setFont(QFont(FONT_FAMILY, FONT_SIZE_LG, QFont.Weight.Bold))
        self.lbl_total.setStyleSheet("color: #1a2744;")

        self.btn_finalizar = QPushButton("Finalizar presupuesto  ✓")
        self.btn_finalizar.setStyleSheet(BUTTON_SUCCESS)
        self.btn_finalizar.setFixedHeight(42)
        self.btn_finalizar.setFixedWidth(240)
        self.btn_finalizar.setEnabled(False)
        self.btn_finalizar.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_finalizar.clicked.connect(self._finalizar)

        bottom_layout.addWidget(lbl_total_titulo)
        bottom_layout.addWidget(self.lbl_total)
        bottom_layout.addStretch()
        bottom_layout.addWidget(self.btn_finalizar)
        layout.addWidget(bottom_bar)

        return page

    def _poblar_servicios(self, servicios: list[dict], lista_num: int | None):
        self.lbl_motor_wiz.setText(self._motor_actual.get("motor", "—"))
        lista_str = f"Lista {lista_num}" if lista_num else "sin lista de precios"
        self.lbl_lista_wiz.setText(f"  |  {lista_str}")
        self.tabla_servicios_wiz.setHorizontalHeaderLabels(
            ["", "Nº", "Descripción", f"Precio (L{lista_num})" if lista_num else "Precio"]
        )

        self.tabla_servicios_wiz.blockSignals(True)
        self.tabla_servicios_wiz.setRowCount(len(servicios))

        for fila, s in enumerate(servicios):
            self.tabla_servicios_wiz.setRowHeight(fila, 28)

            # Col 0: checkbox — guarda servicio_id y precio como UserRole
            check = QTableWidgetItem()
            check.setFlags(
                Qt.ItemFlag.ItemIsEnabled
                | Qt.ItemFlag.ItemIsUserCheckable
                | Qt.ItemFlag.ItemIsSelectable
            )
            check.setCheckState(Qt.CheckState.Unchecked)
            check.setData(Qt.ItemDataRole.UserRole, {
                "servicio_id": s.get("id"),
                "item_num":    s.get("item_num"),
                "descripcion": s.get("descripcion"),
                "precio":      s.get("precio"),
            })
            self.tabla_servicios_wiz.setItem(fila, 0, check)

            # Col 1: Nº
            num = QTableWidgetItem(str(s.get("item_num") or ""))
            num.setTextAlignment(CENTER)
            num.setFlags(Qt.ItemFlag.ItemIsEnabled | Qt.ItemFlag.ItemIsSelectable)
            self.tabla_servicios_wiz.setItem(fila, 1, num)

            # Col 2: Descripción
            desc = QTableWidgetItem(s.get("descripcion") or "")
            desc.setTextAlignment(LEFT)
            desc.setFlags(Qt.ItemFlag.ItemIsEnabled | Qt.ItemFlag.ItemIsSelectable)
            self.tabla_servicios_wiz.setItem(fila, 2, desc)

            # Col 3: Precio
            precio = s.get("precio")
            precio_item = QTableWidgetItem(_fmt_precio(precio))
            precio_item.setTextAlignment(RIGHT)
            precio_item.setFlags(Qt.ItemFlag.ItemIsEnabled | Qt.ItemFlag.ItemIsSelectable)
            self.tabla_servicios_wiz.setItem(fila, 3, precio_item)

        self.tabla_servicios_wiz.blockSignals(False)
        self._recalcular_total()

    def _toggle_check(self, row: int, col: int):
        """Clic en cualquier celda de la fila togglea el checkbox."""
        check = self.tabla_servicios_wiz.item(row, 0)
        if not check:
            return
        nuevo_estado = (
            Qt.CheckState.Unchecked
            if check.checkState() == Qt.CheckState.Checked
            else Qt.CheckState.Checked
        )
        check.setCheckState(nuevo_estado)

    _COLOR_CHECK_BG = QColor("#c8e6c9")
    _COLOR_CHECK_FG = QColor("#1b5e20")

    def _recalcular_total(self):
        total = 0.0
        alguno_tildado = False
        n_cols = self.tabla_servicios_wiz.columnCount()

        for fila in range(self.tabla_servicios_wiz.rowCount()):
            check = self.tabla_servicios_wiz.item(fila, 0)
            if not check:
                continue
            checked = check.checkState() == Qt.CheckState.Checked

            # Color de fila según estado del checkbox
            for c in range(n_cols):
                item = self.tabla_servicios_wiz.item(fila, c)
                if item:
                    if checked:
                        item.setBackground(self._COLOR_CHECK_BG)
                        item.setForeground(self._COLOR_CHECK_FG)
                    else:
                        item.setData(Qt.ItemDataRole.BackgroundRole, None)
                        item.setData(Qt.ItemDataRole.ForegroundRole, None)

            if checked:
                alguno_tildado = True
                datos = check.data(Qt.ItemDataRole.UserRole)
                if datos and datos.get("precio") is not None:
                    total += float(datos["precio"])

        self.lbl_total.setText(_fmt_precio(total))
        self.btn_finalizar.setEnabled(alguno_tildado)

    # ─── Finalizar presupuesto ────────────────────────────────────────────────
    def _finalizar(self):
        items = []
        for fila in range(self.tabla_servicios_wiz.rowCount()):
            check = self.tabla_servicios_wiz.item(fila, 0)
            if check and check.checkState() == Qt.CheckState.Checked:
                datos = check.data(Qt.ItemDataRole.UserRole)
                if datos:
                    items.append({
                        "servicio_id":     datos.get("servicio_id"),
                        "item_num":        datos.get("item_num"),
                        "descripcion":     datos.get("descripcion"),
                        "precio_aplicado": datos.get("precio"),
                    })

        if not items:
            return

        motor_id   = self._motor_actual.get("id")
        motor_desc = self._motor_actual.get("motor", "Motor")
        total      = sum((i.get("precio_aplicado") or 0) for i in items)

        try:
            presupuesto_id = guardar_presupuesto(
                cliente_nombre=self._cliente_nombre,
                motor_id=motor_id,
                items=items,
            )

            # Generar PDF
            pdf_path = os.path.join(_PDF_DIR, f"presupuesto_{presupuesto_id:04d}.pdf")
            generar_pdf(
                presupuesto_id=presupuesto_id,
                cliente=self._cliente_nombre,
                motor=motor_desc,
                items=[{
                    "item_num":        i.get("item_num"),
                    "descripcion":     i.get("descripcion"),
                    "precio_aplicado": i.get("precio_aplicado"),
                } for i in items],
                total=total,
                output_path=pdf_path,
            )
            update_presupuesto_pdf(presupuesto_id, pdf_path)

            # Abrir PDF
            if os.path.exists(pdf_path):
                QDesktopServices.openUrl(QUrl.fromLocalFile(pdf_path))

        except Exception as exc:
            QMessageBox.critical(
                self,
                "Error al guardar",
                f"No se pudo guardar el presupuesto:\n{exc}",
            )
            return

        # Volver al historial
        self._cliente_nombre = ""
        self._motor_actual   = {}
        self.input_cliente.clear()
        self._cargar_historial()
        self._ir(0)

    # ─── Helpers de navegación ────────────────────────────────────────────────
    def _ir(self, pagina: int):
        self._stack.setCurrentIndex(pagina)

    def _iniciar_wizard(self):
        self.input_cliente.clear()
        self.lista_sugerencias.setVisible(False)
        self._ir(1)

    def _build_nav_bar(self, texto_boton: str, callback) -> QWidget:
        bar = QWidget()
        bar.setStyleSheet(
            f"background-color: {COLOR_CONTENT_BG};"
            f" border-bottom: 1px solid {COLOR_PANEL_BORDER};"
        )
        layout = QHBoxLayout(bar)
        layout.setContentsMargins(20, 10, 20, 10)

        btn = QPushButton(f"← {texto_boton}")
        btn.setCursor(Qt.CursorShape.PointingHandCursor)
        btn.setStyleSheet(_BTN_LINK)
        btn.clicked.connect(callback)

        layout.addWidget(btn)
        layout.addStretch()
        return bar
