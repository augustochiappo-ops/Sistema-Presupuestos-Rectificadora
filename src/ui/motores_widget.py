"""
Pantalla: Listado de Motores.
Clic en cualquier fila → muestra la lista orientadora de mano de obra para ese motor.
"""
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QTableWidgetItem, QHeaderView, QStackedWidget, QFrame,
    QSizePolicy,
)
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QFont

from ..data.facra import get_servicios_para_lista
from .motor_selector_widget import MotorSelectorWidget
from .widgets import ZoomableTable
from .styles import (
    FONT_FAMILY, FONT_SIZE_MD, FONT_SIZE_LG, FONT_SIZE_XL,
    COLOR_TEXT_PRIMARY, COLOR_TEXT_MUTED, COLOR_CONTENT_BG,
    COLOR_PANEL_BORDER, COLOR_BTN_PRIMARY, COLOR_BTN_PRIMARY_HOV,
)

CENTER = Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignHCenter
LEFT   = Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignLeft
RIGHT  = Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignRight


class MotoresWidget(QWidget):
    def __init__(self):
        super().__init__()
        self._build_ui()

    def _build_ui(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        self._stack = QStackedWidget()

        # Página 0: selector de motores
        self._selector = MotorSelectorWidget()
        self._selector.motor_seleccionado.connect(self._mostrar_detalle)

        # Página 1: lista orientadora del motor seleccionado
        self._detalle_page = self._build_detalle_page()

        self._stack.addWidget(self._selector)    # index 0
        self._stack.addWidget(self._detalle_page) # index 1

        root.addWidget(self._stack)

    # ─── Delegación al selector (llamado desde main_window) ─────────────────
    def recargar(self):
        self._selector.recargar()
        self._stack.setCurrentIndex(0)

    # ─── Página de detalle ────────────────────────────────────────────────────
    def _build_detalle_page(self) -> QWidget:
        page = QWidget()
        page.setStyleSheet(f"background-color: {COLOR_CONTENT_BG};")
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Barra de navegación superior
        nav_bar = QWidget()
        nav_bar.setStyleSheet(f"background-color: {COLOR_CONTENT_BG};")
        nav_layout = QHBoxLayout(nav_bar)
        nav_layout.setContentsMargins(20, 12, 20, 10)
        nav_layout.setSpacing(16)

        btn_volver = QPushButton("← Volver al listado")
        btn_volver.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_volver.setStyleSheet(f"""
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
        """)
        btn_volver.clicked.connect(lambda: self._stack.setCurrentIndex(0))

        self.lbl_motor_nombre = QLabel("")
        self.lbl_motor_nombre.setFont(QFont(FONT_FAMILY, FONT_SIZE_LG, QFont.Weight.Bold))
        self.lbl_motor_nombre.setStyleSheet(f"color: {COLOR_TEXT_PRIMARY};")
        self.lbl_motor_nombre.setSizePolicy(
            QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred
        )

        self.lbl_lista_num = QLabel("")
        self.lbl_lista_num.setStyleSheet(
            f"color: {COLOR_TEXT_MUTED}; font-size: {FONT_SIZE_MD}px;"
            f" font-family: {FONT_FAMILY};"
        )

        nav_layout.addWidget(btn_volver)
        nav_layout.addWidget(self.lbl_motor_nombre, 1)
        nav_layout.addWidget(self.lbl_lista_num)

        layout.addWidget(nav_bar)

        # Separador
        sep = QFrame()
        sep.setFrameShape(QFrame.Shape.HLine)
        sep.setStyleSheet(f"color: {COLOR_PANEL_BORDER}; margin: 0;")
        layout.addWidget(sep)

        # Tabla de servicios
        self.tabla_servicios = ZoomableTable()
        self.tabla_servicios.setColumnCount(3)
        self.tabla_servicios.setHorizontalHeaderLabels(["Nº", "Descripción", "Precio"])
        self.tabla_servicios.setEditTriggers(ZoomableTable.EditTrigger.NoEditTriggers)
        self.tabla_servicios.setSelectionBehavior(ZoomableTable.SelectionBehavior.SelectRows)
        self.tabla_servicios.setAlternatingRowColors(True)
        self.tabla_servicios.verticalHeader().setVisible(False)
        self.tabla_servicios.setShowGrid(True)
        self.tabla_servicios.setSortingEnabled(False)

        hdr = self.tabla_servicios.horizontalHeader()
        hdr.setDefaultAlignment(Qt.AlignmentFlag.AlignCenter)
        hdr.setSectionResizeMode(0, QHeaderView.ResizeMode.Fixed)
        hdr.setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        hdr.setSectionResizeMode(2, QHeaderView.ResizeMode.Fixed)
        self.tabla_servicios.setColumnWidth(0, 60)
        self.tabla_servicios.setColumnWidth(2, 140)

        layout.addWidget(self.tabla_servicios)
        return page

    def _mostrar_detalle(self, motor: dict):
        lista_num = motor.get("lista_num")
        motor_desc = motor.get("motor", "Motor")

        self.lbl_motor_nombre.setText(motor_desc)
        lista_str = f"Lista {lista_num}" if lista_num else "sin lista de precios"
        self.lbl_lista_num.setText(lista_str)
        self.tabla_servicios.setHorizontalHeaderLabels(
            ["Nº", "Descripción", f"Precio (L{lista_num})" if lista_num else "Precio"]
        )

        servicios = get_servicios_para_lista(lista_num)
        self._poblar_servicios(servicios)
        self._stack.setCurrentIndex(1)

    def _poblar_servicios(self, servicios: list[dict]):
        self.tabla_servicios.setRowCount(len(servicios))
        for fila, s in enumerate(servicios):
            self.tabla_servicios.setRowHeight(fila, 28)

            num_item = QTableWidgetItem(str(s["item_num"] or ""))
            num_item.setTextAlignment(CENTER)
            self.tabla_servicios.setItem(fila, 0, num_item)

            desc_item = QTableWidgetItem(s["descripcion"] or "")
            desc_item.setTextAlignment(LEFT)
            self.tabla_servicios.setItem(fila, 1, desc_item)

            precio = s["precio"]
            precio_item = QTableWidgetItem(
                f"$ {precio:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
                if precio is not None else "—"
            )
            precio_item.setTextAlignment(RIGHT)
            self.tabla_servicios.setItem(fila, 2, precio_item)
