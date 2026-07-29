"""
Widget reutilizable: panel de marcas + buscador + tabla de motores.
Emite `motor_seleccionado(dict)` al hacer clic en cualquier celda de una fila.
"""
from PyQt6.QtWidgets import (
    QWidget, QHBoxLayout, QVBoxLayout, QListWidget, QListWidgetItem,
    QTableWidgetItem, QLineEdit, QLabel, QHeaderView, QFrame, QSizePolicy,
)
from PyQt6.QtCore import Qt, QTimer, pyqtSignal
from PyQt6.QtGui import QFont

from ..data.facra import get_marcas, get_motores
from .widgets import ZoomableTable
from .styles import (
    FONT_FAMILY, FONT_SIZE_MD, FONT_SIZE_SM, FONT_SIZE_XL,
    COLOR_TEXT_PRIMARY, COLOR_TEXT_MUTED,
    COLOR_CONTENT_BG, BRANDS_PANEL_STYLE, SEARCH_INPUT,
)

COL_MOTOR = 1

_COLS = [
    ("Código",        105),
    ("Motor",         300),
    ("Marca",         120),
    ("Cilindrada",     90),
    ("Tipo",          130),
    ("Cilindros",      75),
    ("Diámetro cil.", 100),
    ("Lista Nº",       70),
    ("Origen",         65),
]

MOTOR_MIN_WIDTH = 160
CENTER = Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignHCenter
LEFT   = Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignLeft


class _NumItem(QTableWidgetItem):
    def __init__(self, valor: float | None, texto: str):
        super().__init__(texto)
        self._valor = valor if valor is not None else -1.0

    def __lt__(self, other: QTableWidgetItem) -> bool:
        if isinstance(other, _NumItem):
            return self._valor < other._valor
        return super().__lt__(other)


class MotorSelectorWidget(QWidget):
    motor_seleccionado = pyqtSignal(dict)

    def __init__(self, titulo: str = "Listado de Motores", parent=None):
        super().__init__(parent)
        self._titulo = titulo
        self._cargado = False
        self._build_ui()

    # ─── Construcción ────────────────────────────────────────────────────────
    def _build_ui(self):
        root = QHBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)
        root.addWidget(self._build_left_panel(), 0)
        root.addWidget(self._build_right_panel(), 1)

        self._search_timer = QTimer()
        self._search_timer.setSingleShot(True)
        self._search_timer.timeout.connect(self._filtrar)

    def _build_left_panel(self) -> QFrame:
        panel = QFrame()
        panel.setObjectName("brandsPanel")
        panel.setStyleSheet(BRANDS_PANEL_STYLE)

        layout = QVBoxLayout(panel)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        lbl = QLabel("  MARCAS")
        lbl.setStyleSheet(
            f"font-weight: bold; color: {COLOR_TEXT_MUTED}; font-size: 10px;"
            f" font-family: {FONT_FAMILY}; letter-spacing: 1.5px;"
            " padding: 14px 16px 8px 16px;"
        )
        layout.addWidget(lbl)

        self.lista_marcas = QListWidget()
        self.lista_marcas.setFixedWidth(185)
        self.lista_marcas.currentRowChanged.connect(self._filtrar)
        layout.addWidget(self.lista_marcas)

        return panel

    def _build_right_panel(self) -> QWidget:
        panel = QWidget()
        panel.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        panel.setStyleSheet(f"background-color: {COLOR_CONTENT_BG};")
        layout = QVBoxLayout(panel)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Barra superior
        topbar = QWidget()
        topbar.setStyleSheet(f"background-color: {COLOR_CONTENT_BG};")
        top_layout = QVBoxLayout(topbar)
        top_layout.setContentsMargins(20, 16, 20, 10)
        top_layout.setSpacing(6)

        top_row = QHBoxLayout()
        lbl_titulo = QLabel(self._titulo)
        lbl_titulo.setFont(QFont(FONT_FAMILY, FONT_SIZE_XL, QFont.Weight.Bold))
        lbl_titulo.setStyleSheet(f"color: {COLOR_TEXT_PRIMARY};")
        top_row.addWidget(lbl_titulo)
        top_row.addStretch()

        lupa = QLabel("🔍")
        lupa.setStyleSheet("font-size: 16px;")
        self.buscador = QLineEdit()
        self.buscador.setPlaceholderText("Buscar por marca, modelo o código...")
        self.buscador.setStyleSheet(SEARCH_INPUT)
        self.buscador.setFixedWidth(300)
        self.buscador.textChanged.connect(lambda: self._search_timer.start(280))
        top_row.addWidget(lupa)
        top_row.addWidget(self.buscador)
        top_layout.addLayout(top_row)

        self.lbl_contador = QLabel("")
        self.lbl_contador.setStyleSheet(
            f"color: {COLOR_TEXT_MUTED}; font-size: {FONT_SIZE_SM}px;"
        )
        top_layout.addWidget(self.lbl_contador)

        layout.addWidget(topbar)

        # Tabla
        self.tabla = ZoomableTable()
        self.tabla.setColumnCount(len(_COLS))
        self.tabla.setHorizontalHeaderLabels([c[0] for c in _COLS])
        self.tabla.setEditTriggers(ZoomableTable.EditTrigger.NoEditTriggers)
        self.tabla.setSelectionBehavior(ZoomableTable.SelectionBehavior.SelectRows)
        self.tabla.setAlternatingRowColors(True)
        self.tabla.verticalHeader().setVisible(False)
        self.tabla.setShowGrid(True)
        self.tabla.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)

        hdr = self.tabla.horizontalHeader()
        hdr.setDefaultAlignment(Qt.AlignmentFlag.AlignCenter)
        hdr.setStretchLastSection(False)
        self.tabla.setSortingEnabled(True)

        for i, (_, ancho) in enumerate(_COLS):
            hdr.setSectionResizeMode(i, QHeaderView.ResizeMode.Interactive)
            self.tabla.setColumnWidth(i, ancho)

        hdr.sectionResized.connect(self._on_columna_redimensionada)
        self.tabla.cellClicked.connect(self._on_fila_click)

        layout.addWidget(self.tabla)
        return panel

    # ─── Ajuste columna Motor ─────────────────────────────────────────────────
    def _ajustar_columna_motor(self):
        viewport_w = self.tabla.viewport().width()
        otras = sum(
            self.tabla.columnWidth(i)
            for i in range(len(_COLS))
            if i != COL_MOTOR
        )
        nuevo = max(MOTOR_MIN_WIDTH, viewport_w - otras)
        self.tabla.horizontalHeader().blockSignals(True)
        self.tabla.setColumnWidth(COL_MOTOR, nuevo)
        self.tabla.horizontalHeader().blockSignals(False)

    def _on_columna_redimensionada(self, col: int, old_w: int, new_w: int):
        if col != COL_MOTOR:
            self._ajustar_columna_motor()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self._ajustar_columna_motor()

    # ─── Carga de datos ───────────────────────────────────────────────────────
    def showEvent(self, event):
        super().showEvent(event)
        if not self._cargado:
            self._cargado = True
            self._cargar_marcas()

    def recargar(self):
        self._cargado = False
        self._cargar_marcas()
        self._cargado = True

    def limpiar_busqueda(self):
        """Resetea el buscador y la selección de marca, y recarga la lista."""
        self.buscador.blockSignals(True)
        self.buscador.clear()
        self.buscador.blockSignals(False)
        self.lista_marcas.blockSignals(True)
        self.lista_marcas.setCurrentRow(0)
        self.lista_marcas.blockSignals(False)
        self._filtrar()

    def _cargar_marcas(self):
        marcas = get_marcas()
        self.lista_marcas.blockSignals(True)
        self.lista_marcas.clear()

        item_todos = QListWidgetItem("  Todos")
        item_todos.setFont(QFont(FONT_FAMILY, FONT_SIZE_MD))
        self.lista_marcas.addItem(item_todos)

        for m in marcas:
            item = QListWidgetItem(f"  {m}")
            item.setFont(QFont(FONT_FAMILY, FONT_SIZE_MD))
            self.lista_marcas.addItem(item)

        self.lista_marcas.blockSignals(False)
        self.lista_marcas.setCurrentRow(0)
        self._filtrar()

    # ─── Filtrado ─────────────────────────────────────────────────────────────
    def _marca_seleccionada(self) -> str | None:
        item = self.lista_marcas.currentItem()
        if not item:
            return None
        texto = item.text().strip()
        return None if texto.upper() == "TODOS" else texto

    def _filtrar(self):
        marca = self._marca_seleccionada()
        busq  = self.buscador.text().strip() or None
        motores = get_motores(marca=marca, busqueda=busq)
        self._poblar_tabla(motores)

    # ─── Tabla ────────────────────────────────────────────────────────────────
    def _poblar_tabla(self, motores: list[dict]):
        self.tabla.setSortingEnabled(False)
        self.tabla.setRowCount(len(motores))

        for fila, m in enumerate(motores):
            self.tabla.setRowHeight(fila, 28)

            # Columna 0: Código — almacena el dict completo como user data
            cod = QTableWidgetItem(m.get("indice") or "")
            cod.setTextAlignment(CENTER)
            cod.setData(Qt.ItemDataRole.UserRole, m)
            self.tabla.setItem(fila, 0, cod)

            texto_celdas = [
                (1, m.get("motor")      or "", LEFT),
                (2, m.get("marca")      or "", CENTER),
                (3, m.get("cilindrada") or "", CENTER),
                (4, m.get("tipo")       or "", CENTER),
                (8, m.get("origen")     or "", CENTER),
            ]
            for col, valor, alin in texto_celdas:
                cell = QTableWidgetItem(valor)
                cell.setTextAlignment(alin)
                self.tabla.setItem(fila, col, cell)

            cil = m.get("cilindros")
            self.tabla.setItem(fila, 5, _NumItem(
                float(cil) if cil else None, str(cil) if cil else ""
            ))
            dia = m.get("diametro")
            self.tabla.setItem(fila, 6, _NumItem(
                dia, f"{dia} mm" if dia is not None else ""
            ))
            lst = m.get("lista_num")
            self.tabla.setItem(fila, 7, _NumItem(
                float(lst) if lst else None, str(lst) if lst else ""
            ))
            for col in (5, 6, 7):
                if self.tabla.item(fila, col):
                    self.tabla.item(fila, col).setTextAlignment(CENTER)

        self.tabla.setSortingEnabled(True)

        total     = len(motores)
        marca_txt = self._marca_seleccionada() or "todas las marcas"
        plural    = "es" if total != 1 else ""
        self.lbl_contador.setText(f"{total} motor{plural}  ·  {marca_txt}")

    # ─── Click en fila ────────────────────────────────────────────────────────
    def _on_fila_click(self, row: int, col: int):
        id_item = self.tabla.item(row, 0)
        if not id_item:
            return
        motor = id_item.data(Qt.ItemDataRole.UserRole)
        if motor:
            self.motor_seleccionado.emit(motor)
