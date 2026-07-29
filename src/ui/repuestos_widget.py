"""
Pantalla: Repuestos.
Panel de categorías + selector de marca + filtros de código y descripción
sobre los repuestos importados desde el proveedor (precio y stock).
"""
from PyQt6.QtWidgets import (
    QWidget, QHBoxLayout, QVBoxLayout, QListWidget, QListWidgetItem,
    QTableWidgetItem, QComboBox, QLineEdit, QLabel, QHeaderView,
    QFrame, QSizePolicy, QStackedWidget,
)
from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QFont, QColor

from ..data.crac import get_categorias, get_marcas, get_repuestos, get_repuestos_count
from .widgets import ZoomableTable
from .styles import (
    FONT_FAMILY, FONT_SIZE_MD, FONT_SIZE_SM, FONT_SIZE_XL,
    COLOR_TEXT_PRIMARY, COLOR_TEXT_MUTED, COLOR_TEXT_SECONDARY,
    COLOR_CONTENT_BG, COLOR_SUCCESS, COLOR_ERROR,
    BRANDS_PANEL_STYLE, SEARCH_INPUT, COMBO_INPUT,
)

CENTER = Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignHCenter
LEFT   = Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignLeft
RIGHT  = Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignRight

_COLS = [
    ("Código",      140),
    ("Descripción", 360),
    ("Marca",       140),
    ("Categoría",   160),
    ("Precio",      120),
    ("Stock",        90),
]
COL_DESCRIPCION = 1
LIMITE_RESULTADOS = 1000


def _formato_precio(precio: float | None) -> str:
    if not precio:
        return "—"
    return f"$ {precio:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


class RepuestosWidget(QWidget):
    def __init__(self):
        super().__init__()
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
        panel.setObjectName("categoriasPanel")
        panel.setStyleSheet(BRANDS_PANEL_STYLE)

        layout = QVBoxLayout(panel)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        lbl = QLabel("  CATEGORÍAS")
        lbl.setStyleSheet(
            f"font-weight: bold; color: {COLOR_TEXT_MUTED}; font-size: 10px;"
            f" font-family: {FONT_FAMILY}; letter-spacing: 1.5px;"
            " padding: 14px 16px 8px 16px;"
        )
        layout.addWidget(lbl)

        self.lista_categorias = QListWidget()
        self.lista_categorias.setFixedWidth(200)
        self.lista_categorias.currentRowChanged.connect(self._filtrar)
        layout.addWidget(self.lista_categorias)

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
        top_layout.setSpacing(10)

        titulo = QLabel("Repuestos")
        titulo.setStyleSheet(
            f"color: {COLOR_TEXT_PRIMARY}; font-size: {FONT_SIZE_XL}px; font-weight: bold;"
            f" font-family: {FONT_FAMILY};"
        )
        top_layout.addWidget(titulo)

        filtros = QHBoxLayout()
        filtros.setSpacing(10)

        lbl_marca = QLabel("Marca:")
        lbl_marca.setStyleSheet(
            f"color: {COLOR_TEXT_SECONDARY}; font-size: {FONT_SIZE_MD}px;"
            f" font-family: {FONT_FAMILY};"
        )
        self.combo_marca = QComboBox()
        self.combo_marca.setStyleSheet(COMBO_INPUT)
        self.combo_marca.setFixedWidth(220)
        self.combo_marca.currentIndexChanged.connect(self._filtrar)

        self.filtro_codigo = QLineEdit()
        self.filtro_codigo.setPlaceholderText("Filtrar por código...")
        self.filtro_codigo.setStyleSheet(SEARCH_INPUT)
        self.filtro_codigo.setFixedWidth(220)
        self.filtro_codigo.textChanged.connect(lambda: self._search_timer.start(280))

        self.filtro_descripcion = QLineEdit()
        self.filtro_descripcion.setPlaceholderText("Filtrar por descripción...")
        self.filtro_descripcion.setStyleSheet(SEARCH_INPUT)
        self.filtro_descripcion.setFixedWidth(280)
        self.filtro_descripcion.textChanged.connect(lambda: self._search_timer.start(280))

        filtros.addWidget(lbl_marca)
        filtros.addWidget(self.combo_marca)
        filtros.addWidget(self.filtro_codigo)
        filtros.addWidget(self.filtro_descripcion)
        filtros.addStretch()
        top_layout.addLayout(filtros)

        self.lbl_contador = QLabel("")
        self.lbl_contador.setStyleSheet(
            f"color: {COLOR_TEXT_MUTED}; font-size: {FONT_SIZE_SM}px;"
        )
        top_layout.addWidget(self.lbl_contador)

        layout.addWidget(topbar)

        # Stack: mensaje vacío vs. tabla de resultados
        self._stack = QStackedWidget()
        self._stack.addWidget(self._build_placeholder())  # 0
        self._stack.addWidget(self._build_tabla())         # 1
        layout.addWidget(self._stack)

        return panel

    def _build_placeholder(self) -> QWidget:
        page = QWidget()
        page.setStyleSheet(f"background-color: {COLOR_CONTENT_BG};")
        layout = QVBoxLayout(page)
        layout.addStretch()
        lbl = QLabel("Elegí una categoría, una marca, o escribí un código o\nuna descripción para buscar repuestos.")
        lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        lbl.setStyleSheet(
            f"color: {COLOR_TEXT_MUTED}; font-size: {FONT_SIZE_MD}px;"
            f" font-family: {FONT_FAMILY};"
        )
        layout.addWidget(lbl)
        layout.addStretch()
        return page

    def _build_tabla(self) -> QWidget:
        self.tabla = ZoomableTable()
        self.tabla.setColumnCount(len(_COLS))
        self.tabla.setHorizontalHeaderLabels([c[0] for c in _COLS])
        self.tabla.setEditTriggers(ZoomableTable.EditTrigger.NoEditTriggers)
        self.tabla.setSelectionBehavior(ZoomableTable.SelectionBehavior.SelectRows)
        self.tabla.setAlternatingRowColors(True)
        self.tabla.verticalHeader().setVisible(False)
        self.tabla.setShowGrid(True)
        self.tabla.setSortingEnabled(False)
        self.tabla.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)

        hdr = self.tabla.horizontalHeader()
        hdr.setDefaultAlignment(Qt.AlignmentFlag.AlignCenter)
        hdr.setStretchLastSection(False)
        for i, (_, ancho) in enumerate(_COLS):
            hdr.setSectionResizeMode(
                i,
                QHeaderView.ResizeMode.Stretch if i == COL_DESCRIPCION
                else QHeaderView.ResizeMode.Interactive,
            )
            if i != COL_DESCRIPCION:
                self.tabla.setColumnWidth(i, ancho)

        return self.tabla

    # ─── Carga de datos ───────────────────────────────────────────────────────
    def showEvent(self, event):
        super().showEvent(event)
        if not self._cargado:
            self._cargado = True
            self._cargar_selectores()

    def recargar(self):
        """Se llama tras importar un CSV nuevo desde Actualizar Excel."""
        self._cargado = False
        self._cargar_selectores()
        self._cargado = True

    def _cargar_selectores(self):
        # Categorías (panel izquierdo)
        self.lista_categorias.blockSignals(True)
        self.lista_categorias.clear()
        item_todos = QListWidgetItem("  Todos")
        item_todos.setFont(QFont(FONT_FAMILY, FONT_SIZE_MD))
        self.lista_categorias.addItem(item_todos)
        for c in get_categorias():
            item = QListWidgetItem(f"  {c['nombre']}")
            item.setData(Qt.ItemDataRole.UserRole, c["prefijo"])
            item.setFont(QFont(FONT_FAMILY, FONT_SIZE_MD))
            self.lista_categorias.addItem(item)
        self.lista_categorias.setCurrentRow(0)
        self.lista_categorias.blockSignals(False)

        # Marcas (combo)
        self.combo_marca.blockSignals(True)
        self.combo_marca.clear()
        self.combo_marca.addItem("Todas", userData=None)
        for m in get_marcas():
            self.combo_marca.addItem(m["nombre"], userData=m["prefijo"])
        self.combo_marca.setCurrentIndex(0)
        self.combo_marca.blockSignals(False)

        self.filtro_codigo.blockSignals(True)
        self.filtro_codigo.clear()
        self.filtro_codigo.blockSignals(False)
        self.filtro_descripcion.blockSignals(True)
        self.filtro_descripcion.clear()
        self.filtro_descripcion.blockSignals(False)

        self._stack.setCurrentIndex(0)
        self.lbl_contador.setText("")

    # ─── Filtrado ─────────────────────────────────────────────────────────────
    def _categoria_seleccionada(self) -> str | None:
        item = self.lista_categorias.currentItem()
        if not item:
            return None
        return item.data(Qt.ItemDataRole.UserRole)

    def _marca_seleccionada(self) -> str | None:
        return self.combo_marca.currentData()

    def _filtrar(self):
        categoria   = self._categoria_seleccionada()
        marca       = self._marca_seleccionada()
        codigo      = self.filtro_codigo.text().strip() or None
        descripcion = self.filtro_descripcion.text().strip() or None

        if not any([categoria, marca, codigo, descripcion]):
            self._stack.setCurrentIndex(0)
            self.lbl_contador.setText("")
            return

        total = get_repuestos_count(categoria, marca, descripcion, codigo)
        repuestos = get_repuestos(categoria, marca, descripcion, codigo, limite=LIMITE_RESULTADOS)
        self._poblar_tabla(repuestos)
        self._stack.setCurrentIndex(1)

        plural = "s" if total != 1 else ""
        if total > len(repuestos):
            self.lbl_contador.setText(
                f"{total} repuesto{plural} encontrado{plural} — mostrando los primeros {len(repuestos)}"
            )
        else:
            self.lbl_contador.setText(f"{total} repuesto{plural} encontrado{plural}")

    def _poblar_tabla(self, repuestos: list[dict]):
        self.tabla.setRowCount(len(repuestos))
        for fila, r in enumerate(repuestos):
            self.tabla.setRowHeight(fila, 28)

            celdas = [
                (0, r["codigo"]     or "", CENTER),
                (1, r["aplicacion"] or "", LEFT),
                (2, r["marca"]      or "", CENTER),
                (3, r["categoria"]  or "", CENTER),
            ]
            for col, valor, alin in celdas:
                cell = QTableWidgetItem(valor)
                cell.setTextAlignment(alin)
                self.tabla.setItem(fila, col, cell)

            precio_item = QTableWidgetItem(_formato_precio(r["precio"]))
            precio_item.setTextAlignment(RIGHT)
            self.tabla.setItem(fila, 4, precio_item)

            con_stock = bool(r["stock"])
            stock_item = QTableWidgetItem("Sí" if con_stock else "No")
            stock_item.setTextAlignment(CENTER)
            stock_item.setForeground(QColor(COLOR_SUCCESS) if con_stock else QColor(COLOR_ERROR))
            self.tabla.setItem(fila, 5, stock_item)
