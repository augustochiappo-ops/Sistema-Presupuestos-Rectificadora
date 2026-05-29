"""
Pantalla: Clientes.
Lista de clientes con su historial de presupuestos.
"""
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QTableWidgetItem, QHeaderView, QStackedWidget,
)
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QFont

from ..data.db import get_clientes_lista, get_presupuestos_por_cliente
from .widgets import ZoomableTable
from .styles import (
    FONT_FAMILY, FONT_SIZE_MD, FONT_SIZE_XL,
    COLOR_TEXT_PRIMARY, COLOR_TEXT_MUTED, COLOR_TEXT_PLACEHOLDER,
    COLOR_CONTENT_BG, COLOR_PANEL_BORDER,
    COLOR_BTN_PRIMARY, COLOR_BTN_PRIMARY_HOV,
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


def _fmt_fecha(fecha_iso: str | None) -> str:
    if not fecha_iso:
        return "—"
    try:
        y, m, d = fecha_iso.split("-")
        return f"{d}/{m}/{y}"
    except Exception:
        return fecha_iso or "—"


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


class ClientesWidget(QWidget):
    # Emite el id del presupuesto cuando el usuario quiere verlo
    abrir_presupuesto = pyqtSignal(int)

    def __init__(self):
        super().__init__()
        self._cliente_actual: dict = {}
        self._presupuestos_cliente: list[dict] = []
        self._build_ui()

    # ─── Construcción ─────────────────────────────────────────────────────────
    def _build_ui(self):
        self.setStyleSheet(f"background-color: {COLOR_CONTENT_BG};")
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        self._stack = QStackedWidget()
        self._stack.addWidget(self._build_lista_page())    # 0
        self._stack.addWidget(self._build_detalle_page())  # 1
        root.addWidget(self._stack)

    # ─── PÁGINA 0: Lista de clientes ──────────────────────────────────────────
    def _build_lista_page(self) -> QWidget:
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

        titulo = QLabel("Clientes")
        titulo.setFont(QFont(FONT_FAMILY, FONT_SIZE_XL, QFont.Weight.Bold))
        titulo.setStyleSheet(f"color: {COLOR_TEXT_PRIMARY};")
        top_layout.addWidget(titulo)
        top_layout.addStretch()
        layout.addWidget(topbar)

        # Tabla de clientes
        self.tabla_clientes = ZoomableTable()
        self.tabla_clientes.setColumnCount(3)
        self.tabla_clientes.setHorizontalHeaderLabels(
            ["Nombre", "Presupuestos", "Último presupuesto"]
        )
        self.tabla_clientes.setEditTriggers(ZoomableTable.EditTrigger.NoEditTriggers)
        self.tabla_clientes.setSelectionBehavior(ZoomableTable.SelectionBehavior.SelectRows)
        self.tabla_clientes.setAlternatingRowColors(True)
        self.tabla_clientes.verticalHeader().setVisible(False)
        self.tabla_clientes.setShowGrid(True)
        self.tabla_clientes.setSortingEnabled(True)

        hdr = self.tabla_clientes.horizontalHeader()
        hdr.setDefaultAlignment(Qt.AlignmentFlag.AlignCenter)
        hdr.setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        hdr.setSectionResizeMode(1, QHeaderView.ResizeMode.Fixed)
        hdr.setSectionResizeMode(2, QHeaderView.ResizeMode.Fixed)
        self.tabla_clientes.setColumnWidth(1, 130)
        self.tabla_clientes.setColumnWidth(2, 160)

        self.tabla_clientes.cellClicked.connect(self._on_cliente_click)

        layout.addWidget(self.tabla_clientes, 1)

        # Placeholder sin clientes
        self._lbl_vacio_clientes = QLabel(
            "No hay clientes aún.\nSe cargan automáticamente al crear presupuestos."
        )
        self._lbl_vacio_clientes.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._lbl_vacio_clientes.setStyleSheet(
            f"color: {COLOR_TEXT_PLACEHOLDER}; font-size: {FONT_SIZE_MD}px;"
        )
        layout.addWidget(self._lbl_vacio_clientes, 0, Qt.AlignmentFlag.AlignCenter)
        layout.addStretch()

        return page

    def _cargar_clientes(self):
        clientes = get_clientes_lista()
        self._clientes_actuales = clientes

        if not clientes:
            self.tabla_clientes.setVisible(False)
            self._lbl_vacio_clientes.setVisible(True)
            return

        self.tabla_clientes.setVisible(True)
        self._lbl_vacio_clientes.setVisible(False)
        self.tabla_clientes.setSortingEnabled(False)
        self.tabla_clientes.setRowCount(len(clientes))

        for fila, c in enumerate(clientes):
            self.tabla_clientes.setRowHeight(fila, 28)

            nombre = QTableWidgetItem(c.get("nombre") or "—")
            nombre.setTextAlignment(LEFT)
            nombre.setData(Qt.ItemDataRole.UserRole, c)
            self.tabla_clientes.setItem(fila, 0, nombre)

            total_p = QTableWidgetItem(str(c.get("total_presupuestos") or 0))
            total_p.setTextAlignment(CENTER)
            self.tabla_clientes.setItem(fila, 1, total_p)

            ultimo = QTableWidgetItem(_fmt_fecha(c.get("ultimo_presupuesto")))
            ultimo.setTextAlignment(CENTER)
            self.tabla_clientes.setItem(fila, 2, ultimo)

        self.tabla_clientes.setSortingEnabled(True)

    def _on_cliente_click(self, row: int, col: int):
        item = self.tabla_clientes.item(row, 0)
        if not item:
            return
        cliente = item.data(Qt.ItemDataRole.UserRole)
        if not cliente:
            return
        self._cliente_actual = cliente
        self._cargar_presupuestos_cliente(cliente["id"])
        self._stack.setCurrentIndex(1)

    # ─── PÁGINA 1: Presupuestos del cliente ───────────────────────────────────
    def _build_detalle_page(self) -> QWidget:
        page = QWidget()
        page.setStyleSheet(f"background-color: {COLOR_CONTENT_BG};")
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Nav bar
        nav = QWidget()
        nav.setStyleSheet(
            f"background-color: {COLOR_CONTENT_BG}; border-bottom: 1px solid {COLOR_PANEL_BORDER};"
        )
        nav_layout = QHBoxLayout(nav)
        nav_layout.setContentsMargins(20, 10, 20, 10)

        btn_volver = QPushButton("← Volver a clientes")
        btn_volver.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_volver.setStyleSheet(_BTN_LINK)
        btn_volver.clicked.connect(lambda: self._stack.setCurrentIndex(0))

        self.lbl_nombre_cliente = QLabel("")
        self.lbl_nombre_cliente.setFont(QFont(FONT_FAMILY, FONT_SIZE_XL, QFont.Weight.Bold))
        self.lbl_nombre_cliente.setStyleSheet(f"color: {COLOR_TEXT_PRIMARY};")

        nav_layout.addWidget(btn_volver)
        nav_layout.addSpacing(20)
        nav_layout.addWidget(self.lbl_nombre_cliente)
        nav_layout.addStretch()
        layout.addWidget(nav)

        # Tabla de presupuestos del cliente
        self.tabla_pres_cliente = ZoomableTable()
        self.tabla_pres_cliente.setColumnCount(4)
        self.tabla_pres_cliente.setHorizontalHeaderLabels(
            ["Nº", "Fecha", "Motor", "Total"]
        )
        self.tabla_pres_cliente.setEditTriggers(ZoomableTable.EditTrigger.NoEditTriggers)
        self.tabla_pres_cliente.setSelectionBehavior(ZoomableTable.SelectionBehavior.SelectRows)
        self.tabla_pres_cliente.setAlternatingRowColors(True)
        self.tabla_pres_cliente.verticalHeader().setVisible(False)
        self.tabla_pres_cliente.setShowGrid(True)
        self.tabla_pres_cliente.setSortingEnabled(False)

        hdr = self.tabla_pres_cliente.horizontalHeader()
        hdr.setDefaultAlignment(Qt.AlignmentFlag.AlignCenter)
        hdr.setSectionResizeMode(0, QHeaderView.ResizeMode.Fixed)
        hdr.setSectionResizeMode(1, QHeaderView.ResizeMode.Fixed)
        hdr.setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)
        hdr.setSectionResizeMode(3, QHeaderView.ResizeMode.Fixed)
        self.tabla_pres_cliente.setColumnWidth(0, 70)
        self.tabla_pres_cliente.setColumnWidth(1, 100)
        self.tabla_pres_cliente.setColumnWidth(3, 140)

        self.tabla_pres_cliente.cellClicked.connect(self._on_presupuesto_click)

        layout.addWidget(self.tabla_pres_cliente, 1)

        self._lbl_sin_pres = QLabel("Este cliente no tiene presupuestos.")
        self._lbl_sin_pres.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._lbl_sin_pres.setStyleSheet(
            f"color: {COLOR_TEXT_PLACEHOLDER}; font-size: {FONT_SIZE_MD}px;"
        )
        layout.addWidget(self._lbl_sin_pres, 0, Qt.AlignmentFlag.AlignCenter)
        layout.addStretch()

        return page

    def _cargar_presupuestos_cliente(self, cliente_id: int):
        presupuestos = get_presupuestos_por_cliente(cliente_id)
        self._presupuestos_cliente = presupuestos
        self.lbl_nombre_cliente.setText(self._cliente_actual.get("nombre", "—"))

        if not presupuestos:
            self.tabla_pres_cliente.setVisible(False)
            self._lbl_sin_pres.setVisible(True)
            return

        self.tabla_pres_cliente.setVisible(True)
        self._lbl_sin_pres.setVisible(False)
        self.tabla_pres_cliente.setRowCount(len(presupuestos))

        for fila, p in enumerate(presupuestos):
            self.tabla_pres_cliente.setRowHeight(fila, 28)

            nro = QTableWidgetItem(f"{p['id']:04d}")
            nro.setTextAlignment(CENTER)
            nro.setData(Qt.ItemDataRole.UserRole, p["id"])
            self.tabla_pres_cliente.setItem(fila, 0, nro)

            fecha = QTableWidgetItem(_fmt_fecha(p.get("fecha")))
            fecha.setTextAlignment(CENTER)
            self.tabla_pres_cliente.setItem(fila, 1, fecha)

            motor = QTableWidgetItem(p.get("motor") or "—")
            motor.setTextAlignment(LEFT)
            self.tabla_pres_cliente.setItem(fila, 2, motor)

            total = QTableWidgetItem(_fmt_precio(p.get("total")))
            total.setTextAlignment(RIGHT)
            self.tabla_pres_cliente.setItem(fila, 3, total)

    def _on_presupuesto_click(self, row: int, col: int):
        item = self.tabla_pres_cliente.item(row, 0)
        if not item:
            return
        presupuesto_id = item.data(Qt.ItemDataRole.UserRole)
        if presupuesto_id:
            self.abrir_presupuesto.emit(presupuesto_id)

    # ─── showEvent ────────────────────────────────────────────────────────────
    def showEvent(self, event):
        super().showEvent(event)
        self._cargar_clientes()
        self._stack.setCurrentIndex(0)
