"""
Pantalla: Presupuestos.
Historial de presupuestos + wizard de creación (Cliente → Motor → Servicios → Repuestos).
"""
import os

from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QTableWidgetItem, QHeaderView, QStackedWidget, QFrame,
    QLineEdit, QSizePolicy, QMessageBox, QListWidget, QListWidgetItem,
    QComboBox, QSpinBox,
)
from PyQt6.QtCore import Qt, pyqtSignal, QTimer
from PyQt6.QtGui import QFont, QDesktopServices, QColor
from PyQt6.QtCore import QUrl

from ..data.facra import get_servicios_para_lista
from ..data.db import (
    guardar_presupuesto, get_presupuestos, update_presupuesto_pdf,
    get_clientes_nombres, guardar_pdf_historial,
    toggle_favorito_servicio, get_favoritos_ids,
    get_repuestos_sugeridos_motor,
)
from ..data.crac import get_categorias, get_marcas, get_repuestos, get_repuestos_count
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

_PDF_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "Presupuestos",
)

_STAR_ON  = "#f59e0b"
_STAR_OFF = "#bdbdbd"
_SEP_BG   = "#e8ecf5"
_SEP_FG   = "#5a6a8a"


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
        # Servicios elegidos (se congelan al pasar al paso Repuestos)
        self._items_servicios: list[dict] = []
        self._total_servicios: float = 0.0
        # Repuestos agregados al presupuesto en curso. Cada línea:
        # {repuesto_codigo, descripcion, cantidad, precio_unitario, stock_al_cotizar}
        # (repuesto_codigo/stock None en ítems manuales fuera de catálogo)
        self._repuestos: list[dict] = []
        self._resultados_rep: list[dict] = []
        self._sugeridos_rep: list[dict] = []
        # Favoritos
        self._fav_ids: set[int] = set()
        self._star_btns: dict[int, QPushButton] = {}
        self._separador_row: int | None = None

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
        self._stack.addWidget(self._build_repuestos_page())    # 4

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

        self.tabla_historial.cellClicked.connect(self._on_fila_historial_click)

        layout.addWidget(self.tabla_historial, 1)

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

            nro = QTableWidgetItem(f"{p['id']:04d}")
            nro.setTextAlignment(CENTER)
            self.tabla_historial.setItem(fila, 0, nro)

            fecha = p.get("fecha") or ""
            try:
                y, m, d = fecha.split("-")
                fecha_fmt = f"{d}/{m}/{y}"
            except Exception:
                fecha_fmt = fecha
            fecha_item = QTableWidgetItem(fecha_fmt)
            fecha_item.setTextAlignment(CENTER)
            self.tabla_historial.setItem(fila, 1, fecha_item)

            cliente_item = QTableWidgetItem(p.get("cliente") or "—")
            cliente_item.setTextAlignment(LEFT)
            self.tabla_historial.setItem(fila, 2, cliente_item)

            motor_item = QTableWidgetItem(p.get("motor") or "—")
            motor_item.setTextAlignment(LEFT)
            self.tabla_historial.setItem(fila, 3, motor_item)

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

        content = QWidget()
        content.setStyleSheet(f"background-color: {COLOR_CONTENT_BG};")
        c_layout = QVBoxLayout(content)
        c_layout.setContentsMargins(60, 40, 60, 40)
        c_layout.setSpacing(20)

        titulo = QLabel("Nuevo Presupuesto")
        titulo.setFont(QFont(FONT_FAMILY, FONT_SIZE_XL, QFont.Weight.Bold))
        titulo.setStyleSheet(f"color: {COLOR_TEXT_PRIMARY};")
        c_layout.addWidget(titulo)

        subtitulo = QLabel("Paso 1 de 4  —  Ingresá el nombre del cliente")
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

    # ─── PÁGINA 3: Servicios con checkboxes, buscador y favoritos ─────────────
    def _build_servicios_page(self) -> QWidget:
        page = QWidget()
        page.setStyleSheet(f"background-color: {COLOR_CONTENT_BG};")
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        layout.addWidget(self._build_nav_bar("Volver", lambda: self._ir(2)))

        # Cabecera informativa
        info_bar = QWidget()
        info_bar.setStyleSheet(
            f"background-color: {COLOR_PANEL_BG}; border-bottom: 1px solid {COLOR_PANEL_BORDER};"
        )
        info_layout = QHBoxLayout(info_bar)
        info_layout.setContentsMargins(20, 10, 20, 10)

        self.lbl_motor_wiz = QLabel("")
        self.lbl_motor_wiz.setFont(QFont(FONT_FAMILY, FONT_SIZE_MD, QFont.Weight.Bold))
        self.lbl_motor_wiz.setStyleSheet(f"color: {COLOR_TEXT_PRIMARY};")

        self.lbl_lista_wiz = QLabel("")
        self.lbl_lista_wiz.setStyleSheet(
            f"color: {COLOR_TEXT_MUTED}; font-size: {FONT_SIZE_SM}px;"
        )

        lbl_hint = QLabel("Tildá los servicios a realizar")
        lbl_hint.setStyleSheet(
            f"color: {COLOR_TEXT_MUTED}; font-size: {FONT_SIZE_SM}px;"
        )

        info_layout.addWidget(self.lbl_motor_wiz)
        info_layout.addWidget(self.lbl_lista_wiz)
        info_layout.addStretch()
        info_layout.addWidget(lbl_hint)
        layout.addWidget(info_bar)

        # Buscador de servicios
        search_bar = QWidget()
        search_bar.setStyleSheet(f"background-color: {COLOR_CONTENT_BG};")
        sl = QHBoxLayout(search_bar)
        sl.setContentsMargins(16, 8, 16, 8)

        self.buscador_servicios = QLineEdit()
        self.buscador_servicios.setPlaceholderText("🔍  Buscar servicio…")
        self.buscador_servicios.setStyleSheet(SEARCH_INPUT)
        self.buscador_servicios.setFixedHeight(36)
        self.buscador_servicios.textChanged.connect(self._filtrar_servicios)

        sl.addWidget(self.buscador_servicios)
        layout.addWidget(search_bar)

        # Tabla de servicios
        # Col 0: ★ favorito  |  Col 1: ✓ checkbox  |  Col 2: Nº  |  Col 3: Descripción  |  Col 4: Precio
        self.tabla_servicios_wiz = ZoomableTable()
        self.tabla_servicios_wiz.setColumnCount(5)
        self.tabla_servicios_wiz.setHorizontalHeaderLabels(
            ["★", "✓", "Nº", "Descripción", "Precio"]
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
        hdr.setSectionResizeMode(2, QHeaderView.ResizeMode.Fixed)
        hdr.setSectionResizeMode(3, QHeaderView.ResizeMode.Stretch)
        hdr.setSectionResizeMode(4, QHeaderView.ResizeMode.Fixed)
        self.tabla_servicios_wiz.setColumnWidth(0, 36)
        self.tabla_servicios_wiz.setColumnWidth(1, 36)
        self.tabla_servicios_wiz.setColumnWidth(2, 52)
        self.tabla_servicios_wiz.setColumnWidth(4, 140)

        self.tabla_servicios_wiz.set_extra_style("""
            QTableWidget::indicator:unchecked {
                width: 18px; height: 18px;
                border: 2px solid #9e9e9e;
                border-radius: 3px;
                background: #ffffff;
            }
            QTableWidget::indicator:checked {
                width: 18px; height: 18px;
                border: 2px solid #2e7d32;
                border-radius: 3px;
                background-color: #43a047;
            }
        """)

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

        # Ahora un presupuesto puede ser de solo repuestos: este botón avanza al
        # paso Repuestos siempre, y la validación final vive en ese paso.
        self.btn_siguiente_repuestos = QPushButton("Siguiente: Repuestos  →")
        self.btn_siguiente_repuestos.setStyleSheet(BUTTON_PRIMARY)
        self.btn_siguiente_repuestos.setFixedHeight(42)
        self.btn_siguiente_repuestos.setFixedWidth(240)
        self.btn_siguiente_repuestos.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_siguiente_repuestos.clicked.connect(self._avanzar_a_repuestos)

        bottom_layout.addWidget(lbl_total_titulo)
        bottom_layout.addWidget(self.lbl_total)
        bottom_layout.addStretch()
        bottom_layout.addWidget(self.btn_siguiente_repuestos)
        layout.addWidget(bottom_bar)

        return page

    def _poblar_servicios(self, servicios: list[dict], lista_num: int | None):
        self.lbl_motor_wiz.setText(self._motor_actual.get("motor", "—"))
        lista_str = f"Lista {lista_num}" if lista_num else "sin lista de precios"
        self.lbl_lista_wiz.setText(f"  |  {lista_str}")
        self.tabla_servicios_wiz.setHorizontalHeaderLabels(
            ["★", "✓", "Nº", "Descripción",
             f"Precio (L{lista_num})" if lista_num else "Precio"]
        )

        # Resetear buscador sin disparar el filtro
        self.buscador_servicios.blockSignals(True)
        self.buscador_servicios.clear()
        self.buscador_servicios.blockSignals(False)

        # Cargar favoritos y separar listas
        self._fav_ids = get_favoritos_ids()
        self._star_btns.clear()
        self._separador_row = None

        favs    = [s for s in servicios if s.get("id") in self._fav_ids]
        no_favs = [s for s in servicios if s.get("id") not in self._fav_ids]
        con_sep = bool(favs and no_favs)
        total_rows = len(servicios) + (1 if con_sep else 0)

        self.tabla_servicios_wiz.blockSignals(True)
        self.tabla_servicios_wiz.setRowCount(total_rows)

        fila = 0

        for s in favs:
            self._add_servicio_row(fila, s, is_fav=True)
            fila += 1

        if con_sep:
            self._separador_row = fila
            self.tabla_servicios_wiz.setRowHeight(fila, 22)
            self.tabla_servicios_wiz.setSpan(fila, 0, 1, 5)
            sep_lbl = QLabel("  ─── Lista de la Cámara de Rectificadores ───")
            sep_lbl.setAlignment(LEFT)
            sep_lbl.setStyleSheet(
                f"background-color: {_SEP_BG}; color: {_SEP_FG}; "
                "font-size: 11px; font-style: italic;"
            )
            self.tabla_servicios_wiz.setCellWidget(fila, 0, sep_lbl)
            fila += 1

        for s in no_favs:
            self._add_servicio_row(fila, s, is_fav=False)
            fila += 1

        self.tabla_servicios_wiz.blockSignals(False)
        self._recalcular_total()

    def _add_servicio_row(self, fila: int, s: dict, is_fav: bool):
        self.tabla_servicios_wiz.setRowHeight(fila, 28)
        servicio_id = s.get("id")

        # Col 0: botón de estrella (favorito)
        btn_star = QPushButton("★" if is_fav else "☆")
        btn_star.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_star.setStyleSheet(
            f"QPushButton {{ background: transparent; border: none; font-size: 15px; "
            f"color: {_STAR_ON if is_fav else _STAR_OFF}; }}"
            f"QPushButton:hover {{ color: {_STAR_ON}; }}"
        )
        btn_star.clicked.connect(
            lambda checked, sid=servicio_id: self._toggle_favorito(sid)
        )
        self.tabla_servicios_wiz.setCellWidget(fila, 0, btn_star)
        self._star_btns[servicio_id] = btn_star

        # Col 1: checkbox — guarda los datos del servicio como UserRole
        check = QTableWidgetItem()
        check.setFlags(
            Qt.ItemFlag.ItemIsEnabled
            | Qt.ItemFlag.ItemIsUserCheckable
            | Qt.ItemFlag.ItemIsSelectable
        )
        check.setCheckState(Qt.CheckState.Unchecked)
        check.setData(Qt.ItemDataRole.UserRole, {
            "servicio_id": servicio_id,
            "item_num":    s.get("item_num"),
            "descripcion": s.get("descripcion"),
            "precio":      s.get("precio"),
        })
        self.tabla_servicios_wiz.setItem(fila, 1, check)

        # Col 2: Nº
        num = QTableWidgetItem(str(s.get("item_num") or ""))
        num.setTextAlignment(CENTER)
        num.setFlags(Qt.ItemFlag.ItemIsEnabled | Qt.ItemFlag.ItemIsSelectable)
        self.tabla_servicios_wiz.setItem(fila, 2, num)

        # Col 3: Descripción
        desc = QTableWidgetItem(s.get("descripcion") or "")
        desc.setTextAlignment(LEFT)
        desc.setFlags(Qt.ItemFlag.ItemIsEnabled | Qt.ItemFlag.ItemIsSelectable)
        self.tabla_servicios_wiz.setItem(fila, 3, desc)

        # Col 4: Precio
        precio_item = QTableWidgetItem(_fmt_precio(s.get("precio")))
        precio_item.setTextAlignment(RIGHT)
        precio_item.setFlags(Qt.ItemFlag.ItemIsEnabled | Qt.ItemFlag.ItemIsSelectable)
        self.tabla_servicios_wiz.setItem(fila, 4, precio_item)

    def _toggle_favorito(self, servicio_id: int):
        es_fav = toggle_favorito_servicio(servicio_id)
        if es_fav:
            self._fav_ids.add(servicio_id)
        else:
            self._fav_ids.discard(servicio_id)
        btn = self._star_btns.get(servicio_id)
        if btn:
            btn.setText("★" if es_fav else "☆")
            btn.setStyleSheet(
                f"QPushButton {{ background: transparent; border: none; font-size: 15px; "
                f"color: {_STAR_ON if es_fav else _STAR_OFF}; }}"
                f"QPushButton:hover {{ color: {_STAR_ON}; }}"
            )

    def _filtrar_servicios(self, texto: str):
        texto = texto.strip().lower()
        alguno_fav_visible = False

        for fila in range(self.tabla_servicios_wiz.rowCount()):
            if fila == self._separador_row:
                continue
            item_desc = self.tabla_servicios_wiz.item(fila, 3)
            item_num  = self.tabla_servicios_wiz.item(fila, 2)
            if item_desc is None:
                self.tabla_servicios_wiz.setRowHidden(fila, True)
                continue
            desc_t = (item_desc.text() or "").lower()
            num_t  = (item_num.text() if item_num else "").lower()
            match = (not texto) or texto in desc_t or texto in num_t
            self.tabla_servicios_wiz.setRowHidden(fila, not match)
            if match and self._separador_row is not None and fila < self._separador_row:
                alguno_fav_visible = True

        # El separador se oculta si ningún favorito pasa el filtro
        if self._separador_row is not None:
            self.tabla_servicios_wiz.setRowHidden(
                self._separador_row, not alguno_fav_visible
            )

    def _toggle_check(self, row: int, col: int):
        """Clic en cualquier celda (excepto col 0 = estrella y la fila separadora) togglea el checkbox."""
        if col == 0 or row == self._separador_row:
            return
        check = self.tabla_servicios_wiz.item(row, 1)
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
        n_cols = self.tabla_servicios_wiz.columnCount()

        self.tabla_servicios_wiz.blockSignals(True)
        try:
            for fila in range(self.tabla_servicios_wiz.rowCount()):
                if fila == self._separador_row:
                    continue
                check = self.tabla_servicios_wiz.item(fila, 1)  # col 1 = checkbox
                if not check:
                    continue
                checked = check.checkState() == Qt.CheckState.Checked

                # Col 0 es un widget (estrella), se maneja aparte; colorear cols 1-4
                for c in range(1, n_cols):
                    item = self.tabla_servicios_wiz.item(fila, c)
                    if item:
                        if checked:
                            item.setBackground(self._COLOR_CHECK_BG)
                            item.setForeground(self._COLOR_CHECK_FG)
                        else:
                            item.setData(Qt.ItemDataRole.BackgroundRole, None)
                            item.setData(Qt.ItemDataRole.ForegroundRole, None)

                if checked:
                    datos = check.data(Qt.ItemDataRole.UserRole)
                    if datos and datos.get("precio") is not None:
                        total += float(datos["precio"])
        finally:
            self.tabla_servicios_wiz.blockSignals(False)

        self.lbl_total.setText(_fmt_precio(total))

    # ─── Avanzar al paso Repuestos ────────────────────────────────────────────
    def _avanzar_a_repuestos(self):
        """Congela la selección de servicios y pasa al paso 4 (Repuestos)."""
        items = []
        for fila in range(self.tabla_servicios_wiz.rowCount()):
            if fila == self._separador_row:
                continue
            check = self.tabla_servicios_wiz.item(fila, 1)  # col 1 = checkbox
            if check and check.checkState() == Qt.CheckState.Checked:
                datos = check.data(Qt.ItemDataRole.UserRole)
                if datos:
                    items.append({
                        "servicio_id":     datos.get("servicio_id"),
                        "item_num":        datos.get("item_num"),
                        "descripcion":     datos.get("descripcion"),
                        "precio_aplicado": datos.get("precio"),
                    })

        self._items_servicios = items
        self._total_servicios = sum((i.get("precio_aplicado") or 0) for i in items)
        self._preparar_pagina_repuestos()
        self._ir(4)

    # ─── PÁGINA 4: Repuestos ──────────────────────────────────────────────────
    def _build_repuestos_page(self) -> QWidget:
        page = QWidget()
        page.setStyleSheet(f"background-color: {COLOR_CONTENT_BG};")
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        layout.addWidget(self._build_nav_bar("Volver", lambda: self._ir(3)))

        # Cabecera informativa
        info_bar = QWidget()
        info_bar.setStyleSheet(
            f"background-color: {COLOR_PANEL_BG}; border-bottom: 1px solid {COLOR_PANEL_BORDER};"
        )
        info_layout = QHBoxLayout(info_bar)
        info_layout.setContentsMargins(20, 10, 20, 10)

        self.lbl_motor_rep = QLabel("")
        self.lbl_motor_rep.setFont(QFont(FONT_FAMILY, FONT_SIZE_MD, QFont.Weight.Bold))
        self.lbl_motor_rep.setStyleSheet(f"color: {COLOR_TEXT_PRIMARY};")

        lbl_hint = QLabel("Paso 4 de 4 — Agregá repuestos (opcional)")
        lbl_hint.setStyleSheet(f"color: {COLOR_TEXT_MUTED}; font-size: {FONT_SIZE_SM}px;")

        info_layout.addWidget(self.lbl_motor_rep)
        info_layout.addStretch()
        info_layout.addWidget(lbl_hint)
        layout.addWidget(info_bar)

        # Sugeridos: repuestos usados antes en presupuestos del mismo motor
        self.lbl_sugeridos = QLabel("  Usados antes en este motor — click para agregar")
        self.lbl_sugeridos.setStyleSheet(
            f"color: {COLOR_TEXT_MUTED}; font-size: {FONT_SIZE_SM}px; padding: 6px 10px;"
        )
        layout.addWidget(self.lbl_sugeridos)

        self.tabla_sugeridos = ZoomableTable()
        self.tabla_sugeridos.setColumnCount(4)
        self.tabla_sugeridos.setHorizontalHeaderLabels(["Código", "Descripción", "Precio actual", "Stock"])
        self._config_tabla_repuestos(self.tabla_sugeridos, col_desc=1)
        self.tabla_sugeridos.setMaximumHeight(140)
        self.tabla_sugeridos.cellClicked.connect(self._on_sugerido_click)
        layout.addWidget(self.tabla_sugeridos)

        # Filtros de búsqueda en el catálogo
        filtros = QWidget()
        filtros.setStyleSheet(f"background-color: {COLOR_CONTENT_BG};")
        fl = QHBoxLayout(filtros)
        fl.setContentsMargins(16, 8, 16, 4)
        fl.setSpacing(8)

        self.combo_cat_rep = QComboBox()
        self.combo_cat_rep.setFixedHeight(34)
        self.combo_cat_rep.currentIndexChanged.connect(self._programar_busqueda_rep)

        self.combo_marca_rep = QComboBox()
        self.combo_marca_rep.setFixedHeight(34)
        self.combo_marca_rep.currentIndexChanged.connect(self._programar_busqueda_rep)

        self.input_codigo_rep = QLineEdit()
        self.input_codigo_rep.setPlaceholderText("Código…")
        self.input_codigo_rep.setStyleSheet(SEARCH_INPUT)
        self.input_codigo_rep.setFixedHeight(34)
        self.input_codigo_rep.textChanged.connect(self._programar_busqueda_rep)

        self.input_desc_rep = QLineEdit()
        self.input_desc_rep.setPlaceholderText("🔍  Descripción…")
        self.input_desc_rep.setStyleSheet(SEARCH_INPUT)
        self.input_desc_rep.setFixedHeight(34)
        self.input_desc_rep.textChanged.connect(self._programar_busqueda_rep)

        fl.addWidget(self.combo_cat_rep, 2)
        fl.addWidget(self.combo_marca_rep, 2)
        fl.addWidget(self.input_codigo_rep, 2)
        fl.addWidget(self.input_desc_rep, 3)
        layout.addWidget(filtros)

        # El mismo debounce que la pestaña Repuestos
        self._timer_busqueda_rep = QTimer(self)
        self._timer_busqueda_rep.setSingleShot(True)
        self._timer_busqueda_rep.setInterval(280)
        self._timer_busqueda_rep.timeout.connect(self._buscar_repuestos_wizard)

        self.lbl_resultados_rep = QLabel(
            "  Elegí una categoría, una marca, o escribí un código o descripción — click en una fila para agregar"
        )
        self.lbl_resultados_rep.setStyleSheet(
            f"color: {COLOR_TEXT_PLACEHOLDER}; font-size: {FONT_SIZE_SM}px; padding: 2px 10px;"
        )
        layout.addWidget(self.lbl_resultados_rep)

        self.tabla_resultados_rep = ZoomableTable()
        self.tabla_resultados_rep.setColumnCount(5)
        self.tabla_resultados_rep.setHorizontalHeaderLabels(["Código", "Descripción", "Marca", "Precio", "Stock"])
        self._config_tabla_repuestos(self.tabla_resultados_rep, col_desc=1)
        self.tabla_resultados_rep.cellClicked.connect(self._on_resultado_rep_click)
        layout.addWidget(self.tabla_resultados_rep, 1)

        # Alta manual (fuera de catálogo)
        manual = QWidget()
        manual.setStyleSheet(f"background-color: {COLOR_CONTENT_BG};")
        ml = QHBoxLayout(manual)
        ml.setContentsMargins(16, 4, 16, 4)
        ml.setSpacing(8)

        lbl_manual = QLabel("Fuera de catálogo:")
        lbl_manual.setStyleSheet(f"color: {COLOR_TEXT_MUTED}; font-size: {FONT_SIZE_SM}px;")

        self.input_manual_codigo = QLineEdit()
        self.input_manual_codigo.setPlaceholderText("Código (opcional)")
        self.input_manual_codigo.setStyleSheet(SEARCH_INPUT)
        self.input_manual_codigo.setFixedHeight(32)
        self.input_manual_codigo.setMaximumWidth(150)

        self.input_manual_desc = QLineEdit()
        self.input_manual_desc.setPlaceholderText("Descripción")
        self.input_manual_desc.setStyleSheet(SEARCH_INPUT)
        self.input_manual_desc.setFixedHeight(32)

        self.input_manual_precio = QLineEdit()
        self.input_manual_precio.setPlaceholderText("Precio unit.")
        self.input_manual_precio.setStyleSheet(SEARCH_INPUT)
        self.input_manual_precio.setFixedHeight(32)
        self.input_manual_precio.setMaximumWidth(120)

        self.spin_manual_cant = QSpinBox()
        self.spin_manual_cant.setRange(1, 999)
        self.spin_manual_cant.setFixedHeight(32)

        btn_manual = QPushButton("＋ Agregar")
        btn_manual.setStyleSheet(BUTTON_PRIMARY)
        btn_manual.setFixedHeight(32)
        btn_manual.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_manual.clicked.connect(self._agregar_repuesto_manual)

        ml.addWidget(lbl_manual)
        ml.addWidget(self.input_manual_codigo)
        ml.addWidget(self.input_manual_desc, 1)
        ml.addWidget(self.input_manual_precio)
        ml.addWidget(self.spin_manual_cant)
        ml.addWidget(btn_manual)
        layout.addWidget(manual)

        # Repuestos agregados
        lbl_agregados = QLabel("  Repuestos agregados")
        lbl_agregados.setFont(QFont(FONT_FAMILY, FONT_SIZE_SM, QFont.Weight.Bold))
        lbl_agregados.setStyleSheet(f"color: {COLOR_TEXT_PRIMARY}; padding: 6px 10px 2px;")
        layout.addWidget(lbl_agregados)

        self.tabla_rep_agregados = ZoomableTable()
        self.tabla_rep_agregados.setColumnCount(6)
        self.tabla_rep_agregados.setHorizontalHeaderLabels(
            ["Código", "Descripción", "Cant.", "P. unitario", "Subtotal", ""]
        )
        self._config_tabla_repuestos(self.tabla_rep_agregados, col_desc=1)
        hdr = self.tabla_rep_agregados.horizontalHeader()
        hdr.setSectionResizeMode(2, QHeaderView.ResizeMode.Fixed)
        hdr.setSectionResizeMode(3, QHeaderView.ResizeMode.Fixed)
        hdr.setSectionResizeMode(4, QHeaderView.ResizeMode.Fixed)
        hdr.setSectionResizeMode(5, QHeaderView.ResizeMode.Fixed)
        self.tabla_rep_agregados.setColumnWidth(2, 80)
        self.tabla_rep_agregados.setColumnWidth(3, 120)
        self.tabla_rep_agregados.setColumnWidth(4, 130)
        self.tabla_rep_agregados.setColumnWidth(5, 46)
        self.tabla_rep_agregados.setMaximumHeight(190)
        layout.addWidget(self.tabla_rep_agregados)

        # Barra inferior: totales + confirmar
        bottom_bar = QWidget()
        bottom_bar.setStyleSheet(
            f"background-color: {COLOR_WHITE}; border-top: 2px solid #1a2744;"
        )
        bottom_bar.setFixedHeight(60)
        bottom_layout = QHBoxLayout(bottom_bar)
        bottom_layout.setContentsMargins(20, 0, 20, 0)

        self.lbl_total_desglose = QLabel("")
        self.lbl_total_desglose.setStyleSheet(
            f"color: {COLOR_TEXT_MUTED}; font-size: {FONT_SIZE_SM}px;"
        )

        lbl_total_titulo = QLabel("Total:")
        lbl_total_titulo.setFont(QFont(FONT_FAMILY, FONT_SIZE_LG, QFont.Weight.Bold))
        lbl_total_titulo.setStyleSheet(f"color: {COLOR_TEXT_PRIMARY};")

        self.lbl_total_general = QLabel("$ 0,00")
        self.lbl_total_general.setFont(QFont(FONT_FAMILY, FONT_SIZE_LG, QFont.Weight.Bold))
        self.lbl_total_general.setStyleSheet("color: #1a2744;")

        self.btn_confirmar = QPushButton("Confirmar presupuesto  ✓")
        self.btn_confirmar.setStyleSheet(BUTTON_SUCCESS)
        self.btn_confirmar.setFixedHeight(42)
        self.btn_confirmar.setFixedWidth(240)
        self.btn_confirmar.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_confirmar.clicked.connect(self._finalizar)

        bottom_layout.addWidget(self.lbl_total_desglose)
        bottom_layout.addStretch()
        bottom_layout.addWidget(lbl_total_titulo)
        bottom_layout.addWidget(self.lbl_total_general)
        bottom_layout.addSpacing(16)
        bottom_layout.addWidget(self.btn_confirmar)
        layout.addWidget(bottom_bar)

        return page

    @staticmethod
    def _config_tabla_repuestos(tabla: ZoomableTable, col_desc: int):
        tabla.setEditTriggers(ZoomableTable.EditTrigger.NoEditTriggers)
        tabla.setSelectionBehavior(ZoomableTable.SelectionBehavior.SelectRows)
        tabla.setAlternatingRowColors(True)
        tabla.verticalHeader().setVisible(False)
        tabla.setShowGrid(True)
        tabla.setSortingEnabled(False)
        hdr = tabla.horizontalHeader()
        hdr.setDefaultAlignment(Qt.AlignmentFlag.AlignCenter)
        for c in range(tabla.columnCount()):
            hdr.setSectionResizeMode(
                c,
                QHeaderView.ResizeMode.Stretch if c == col_desc else QHeaderView.ResizeMode.Fixed,
            )
        tabla.setColumnWidth(0, 110)

    def _preparar_pagina_repuestos(self):
        """Se llama al entrar al paso 4: refresca sugeridos, filtros y totales."""
        self.lbl_motor_rep.setText(self._motor_actual.get("motor", "—"))

        # Sugeridos del historial de este motor
        self._sugeridos_rep = get_repuestos_sugeridos_motor(self._motor_actual.get("id"))
        hay_sugeridos = bool(self._sugeridos_rep)
        self.lbl_sugeridos.setVisible(hay_sugeridos)
        self.tabla_sugeridos.setVisible(hay_sugeridos)
        if hay_sugeridos:
            self.tabla_sugeridos.setRowCount(len(self._sugeridos_rep))
            for fila, s in enumerate(self._sugeridos_rep):
                self.tabla_sugeridos.setRowHeight(fila, 26)
                self._set_celda(self.tabla_sugeridos, fila, 0, s.get("codigo") or "—", CENTER)
                self._set_celda(self.tabla_sugeridos, fila, 1, s.get("descripcion") or "", LEFT)
                precio = s.get("precio_actual")
                self._set_celda(self.tabla_sugeridos, fila, 2, _fmt_precio(precio) if precio else "—", RIGHT)
                self._set_celda_stock(self.tabla_sugeridos, fila, 3, s.get("stock_actual"))

        # Filtros del catálogo (se recargan por si hubo un import nuevo)
        self.combo_cat_rep.blockSignals(True)
        self.combo_cat_rep.clear()
        self.combo_cat_rep.addItem("Todas las categorías", None)
        for c in get_categorias():
            self.combo_cat_rep.addItem(c["nombre"], c["prefijo"])
        self.combo_cat_rep.blockSignals(False)

        self.combo_marca_rep.blockSignals(True)
        self.combo_marca_rep.clear()
        self.combo_marca_rep.addItem("Todas las marcas", None)
        for m in get_marcas():
            self.combo_marca_rep.addItem(m["nombre"], m["prefijo"])
        self.combo_marca_rep.blockSignals(False)

        self._refrescar_agregados()

    @staticmethod
    def _set_celda(tabla, fila, col, texto, align):
        item = QTableWidgetItem(str(texto))
        item.setTextAlignment(align)
        item.setFlags(Qt.ItemFlag.ItemIsEnabled | Qt.ItemFlag.ItemIsSelectable)
        tabla.setItem(fila, col, item)

    _COLOR_SIN_STOCK = QColor("#c62828")

    def _set_celda_stock(self, tabla, fila, col, stock):
        texto = "Sí" if stock else ("—" if stock is None else "No")
        item = QTableWidgetItem(texto)
        item.setTextAlignment(CENTER)
        item.setFlags(Qt.ItemFlag.ItemIsEnabled | Qt.ItemFlag.ItemIsSelectable)
        if stock == 0:
            item.setForeground(self._COLOR_SIN_STOCK)
        tabla.setItem(fila, col, item)

    def _programar_busqueda_rep(self, *_):
        self._timer_busqueda_rep.start()

    def _buscar_repuestos_wizard(self):
        categoria = self.combo_cat_rep.currentData()
        marca = self.combo_marca_rep.currentData()
        codigo = self.input_codigo_rep.text().strip()
        descripcion = self.input_desc_rep.text().strip()

        # Igual que la pestaña Repuestos: sin filtro no se consulta (catálogo enorme)
        if not (categoria or marca or codigo or descripcion):
            self._resultados_rep = []
            self.tabla_resultados_rep.setRowCount(0)
            self.lbl_resultados_rep.setText(
                "  Elegí una categoría, una marca, o escribí un código o descripción — click en una fila para agregar"
            )
            return

        self._resultados_rep = get_repuestos(
            categoria=categoria, marca=marca,
            descripcion=descripcion or None, codigo=codigo or None,
        )
        total = get_repuestos_count(
            categoria=categoria, marca=marca,
            descripcion=descripcion or None, codigo=codigo or None,
        )
        extra = f" — mostrando los primeros {len(self._resultados_rep)}" if total > len(self._resultados_rep) else ""
        self.lbl_resultados_rep.setText(
            f"  {total} repuesto{'s' if total != 1 else ''} encontrado{'s' if total != 1 else ''}{extra} — click en una fila para agregar"
        )

        self.tabla_resultados_rep.setRowCount(len(self._resultados_rep))
        for fila, r in enumerate(self._resultados_rep):
            self.tabla_resultados_rep.setRowHeight(fila, 26)
            self._set_celda(self.tabla_resultados_rep, fila, 0, r.get("codigo") or "", CENTER)
            self._set_celda(self.tabla_resultados_rep, fila, 1, r.get("aplicacion") or "", LEFT)
            self._set_celda(self.tabla_resultados_rep, fila, 2, r.get("marca") or "—", LEFT)
            precio = r.get("precio")
            self._set_celda(self.tabla_resultados_rep, fila, 3, _fmt_precio(precio) if precio else "—", RIGHT)
            self._set_celda_stock(self.tabla_resultados_rep, fila, 4, r.get("stock"))

    def _on_sugerido_click(self, row: int, col: int):
        if row >= len(self._sugeridos_rep):
            return
        s = self._sugeridos_rep[row]
        self._agregar_repuesto(
            codigo=s.get("codigo"), descripcion=s.get("descripcion") or s.get("codigo"),
            precio=s.get("precio_actual"), stock=s.get("stock_actual"),
        )

    def _on_resultado_rep_click(self, row: int, col: int):
        if row >= len(self._resultados_rep):
            return
        r = self._resultados_rep[row]
        self._agregar_repuesto(
            codigo=r.get("codigo"), descripcion=r.get("aplicacion") or r.get("codigo"),
            precio=r.get("precio"), stock=r.get("stock"),
        )

    def _agregar_repuesto(self, codigo, descripcion, precio, stock):
        # Si el código ya estaba agregado, se suma una unidad en vez de duplicar
        for rep in self._repuestos:
            if codigo and rep.get("repuesto_codigo") == codigo:
                rep["cantidad"] += 1
                self._refrescar_agregados()
                return
        self._repuestos.append({
            "repuesto_codigo": codigo,
            "descripcion": descripcion,
            "cantidad": 1,
            "precio_unitario": float(precio or 0),
            "stock_al_cotizar": stock,
        })
        self._refrescar_agregados()

    def _agregar_repuesto_manual(self):
        desc = self.input_manual_desc.text().strip()
        try:
            precio = float(self.input_manual_precio.text().strip().replace(".", "").replace(",", "."))
        except ValueError:
            QMessageBox.warning(self, "Repuesto manual", "Ingresá un precio válido (ej: 15300,50).")
            return
        if not desc:
            QMessageBox.warning(self, "Repuesto manual", "Ingresá la descripción del repuesto.")
            return
        self._repuestos.append({
            "repuesto_codigo": self.input_manual_codigo.text().strip() or None,
            "descripcion": desc,
            "cantidad": self.spin_manual_cant.value(),
            "precio_unitario": precio,
            "stock_al_cotizar": None,
        })
        self.input_manual_codigo.clear()
        self.input_manual_desc.clear()
        self.input_manual_precio.clear()
        self.spin_manual_cant.setValue(1)
        self._refrescar_agregados()

    def _refrescar_agregados(self):
        tabla = self.tabla_rep_agregados
        tabla.setRowCount(len(self._repuestos))
        for fila, rep in enumerate(self._repuestos):
            tabla.setRowHeight(fila, 32)
            self._set_celda(tabla, fila, 0, rep.get("repuesto_codigo") or "—", CENTER)

            desc = rep.get("descripcion") or ""
            if rep.get("stock_al_cotizar") == 0:
                desc += "   ⚠ Sin stock — sujeto a disponibilidad"
            self._set_celda(tabla, fila, 1, desc, LEFT)
            if rep.get("stock_al_cotizar") == 0:
                tabla.item(fila, 1).setForeground(self._COLOR_SIN_STOCK)

            spin = QSpinBox()
            spin.setRange(1, 999)
            spin.setValue(int(rep.get("cantidad") or 1))
            spin.valueChanged.connect(
                lambda val, idx=fila: self._cambiar_cantidad_rep(idx, val)
            )
            tabla.setCellWidget(fila, 2, spin)

            editor_precio = QLineEdit(f"{rep.get('precio_unitario') or 0:.2f}".replace(".", ","))
            editor_precio.setAlignment(Qt.AlignmentFlag.AlignRight)
            editor_precio.textChanged.connect(
                lambda texto, idx=fila: self._cambiar_precio_rep(idx, texto)
            )
            tabla.setCellWidget(fila, 3, editor_precio)

            subtotal = (rep.get("precio_unitario") or 0) * (rep.get("cantidad") or 0)
            self._set_celda(tabla, fila, 4, _fmt_precio(subtotal), RIGHT)

            btn_quitar = QPushButton("✕")
            btn_quitar.setCursor(Qt.CursorShape.PointingHandCursor)
            btn_quitar.setStyleSheet(
                "QPushButton { background: transparent; border: none; color: #c62828; font-size: 14px; }"
                "QPushButton:hover { color: #8e0000; }"
            )
            btn_quitar.clicked.connect(lambda checked, idx=fila: self._quitar_repuesto(idx))
            tabla.setCellWidget(fila, 5, btn_quitar)

        self._actualizar_totales_rep()

    def _cambiar_cantidad_rep(self, idx: int, valor: int):
        if idx >= len(self._repuestos):
            return
        self._repuestos[idx]["cantidad"] = valor
        self._actualizar_subtotal_rep(idx)

    def _cambiar_precio_rep(self, idx: int, texto: str):
        if idx >= len(self._repuestos):
            return
        try:
            precio = float(texto.strip().replace(".", "").replace(",", "."))
        except ValueError:
            precio = None  # precio inválido: bloquea el confirmar hasta corregirlo
        self._repuestos[idx]["precio_unitario"] = precio
        self._actualizar_subtotal_rep(idx)

    def _actualizar_subtotal_rep(self, idx: int):
        rep = self._repuestos[idx]
        subtotal = (rep.get("precio_unitario") or 0) * (rep.get("cantidad") or 0)
        item = self.tabla_rep_agregados.item(idx, 4)
        if item:
            item.setText(_fmt_precio(subtotal))
        self._actualizar_totales_rep()

    def _quitar_repuesto(self, idx: int):
        if idx >= len(self._repuestos):
            return
        del self._repuestos[idx]
        self._refrescar_agregados()

    def _actualizar_totales_rep(self):
        total_rep = sum(
            (r.get("precio_unitario") or 0) * (r.get("cantidad") or 0)
            for r in self._repuestos
        )
        total_general = self._total_servicios + total_rep
        self.lbl_total_desglose.setText(
            f"Servicios: {_fmt_precio(self._total_servicios)}   ·   Repuestos: {_fmt_precio(total_rep)}"
        )
        self.lbl_total_general.setText(_fmt_precio(total_general))

        hay_items = bool(self._items_servicios or self._repuestos)
        precios_ok = all(r.get("precio_unitario") is not None for r in self._repuestos)
        self.btn_confirmar.setEnabled(hay_items and precios_ok)

    # ─── Finalizar presupuesto ────────────────────────────────────────────────
    def _finalizar(self):
        items = list(self._items_servicios)
        items_repuestos_pdf = []
        for rep in self._repuestos:
            cantidad = rep.get("cantidad") or 0
            unitario = rep.get("precio_unitario")
            if cantidad <= 0 or unitario is None:
                continue
            subtotal = round(cantidad * unitario, 2)
            items.append({
                "servicio_id": None,
                "descripcion_custom": rep.get("descripcion"),
                "precio_aplicado": subtotal,
                "tipo": "repuesto",
                "repuesto_codigo": rep.get("repuesto_codigo"),
                "cantidad": cantidad,
                "precio_unitario": unitario,
                "stock_al_cotizar": rep.get("stock_al_cotizar"),
            })
            items_repuestos_pdf.append({
                "codigo": rep.get("repuesto_codigo"),
                "descripcion": rep.get("descripcion"),
                "cantidad": cantidad,
                "precio_unitario": unitario,
                "precio_aplicado": subtotal,
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

            pdf_path = os.path.join(_PDF_DIR, f"presupuesto_{presupuesto_id:04d}.pdf")
            generar_pdf(
                presupuesto_id=presupuesto_id,
                cliente=self._cliente_nombre,
                motor=motor_desc,
                items=[{
                    "item_num":        i.get("item_num"),
                    "descripcion":     i.get("descripcion"),
                    "precio_aplicado": i.get("precio_aplicado"),
                } for i in self._items_servicios],
                total=total,
                output_path=pdf_path,
                repuestos=items_repuestos_pdf,
            )
            update_presupuesto_pdf(presupuesto_id, pdf_path)

            if os.path.exists(pdf_path):
                QDesktopServices.openUrl(QUrl.fromLocalFile(pdf_path))

        except Exception as exc:
            QMessageBox.critical(
                self,
                "Error al guardar",
                f"No se pudo guardar el presupuesto:\n{exc}",
            )
            return

        self._cliente_nombre = ""
        self._motor_actual   = {}
        self._items_servicios = []
        self._total_servicios = 0.0
        self._repuestos = []
        self.input_cliente.clear()
        self._cargar_historial()
        self._ir(0)

    # ─── Helpers de navegación ────────────────────────────────────────────────
    def _ir(self, pagina: int):
        self._stack.setCurrentIndex(pagina)

    def _iniciar_wizard(self):
        self.input_cliente.clear()
        self.lista_sugerencias.setVisible(False)
        # Arranque limpio: lo elegido en un wizard anterior no debe arrastrarse
        self._items_servicios = []
        self._total_servicios = 0.0
        self._repuestos = []
        self.input_codigo_rep.blockSignals(True)
        self.input_desc_rep.blockSignals(True)
        self.input_codigo_rep.clear()
        self.input_desc_rep.clear()
        self.input_codigo_rep.blockSignals(False)
        self.input_desc_rep.blockSignals(False)
        self._resultados_rep = []
        self.tabla_resultados_rep.setRowCount(0)
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
