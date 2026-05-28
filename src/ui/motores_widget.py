"""
Pantalla: Listado de Motores.
"""
from PyQt6.QtWidgets import (
    QWidget, QHBoxLayout, QVBoxLayout, QListWidget, QListWidgetItem,
    QTableWidget, QTableWidgetItem, QLineEdit, QLabel, QHeaderView, QFrame,
    QSizePolicy,
)
from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QFont

from ..data.facra import get_marcas, get_motores
from .styles import (
    FONT_FAMILY, FONT_SIZE_MD, FONT_SIZE_SM, FONT_SIZE_XL,
    COLOR_TEXT_PRIMARY, COLOR_TEXT_MUTED,
    COLOR_CONTENT_BG, BRANDS_PANEL_STYLE, TABLE_STYLE, SEARCH_INPUT,
)

# Índice de la columna Motor (la que se expande para llenar el espacio)
COL_MOTOR = 1

# (encabezado, ancho fijo px)  — todas Interactive; Motor se ajusta dinámicamente
_COLS = [
    ("Código",      105),
    ("Motor",       300),   # ancho inicial; se expande automáticamente
    ("Marca",       120),
    ("Cilindrada",   90),
    ("Tipo",        130),
    ("Cilindros",    75),
    ("Diámetro cil.", 100),
    ("Lista Nº",     70),
    ("Origen",       65),
]

# Ancho mínimo garantizado para la columna Motor
MOTOR_MIN_WIDTH = 160

CENTER = Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignHCenter
LEFT   = Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignLeft


class _NumItem(QTableWidgetItem):
    """Item numérico: ordena por valor real, no por texto (evita "9" > "10")."""
    def __init__(self, valor: float | None, texto: str):
        super().__init__(texto)
        # Guardamos el número como dato de ordenamiento
        self._valor = valor if valor is not None else -1.0

    def __lt__(self, other: QTableWidgetItem) -> bool:
        if isinstance(other, _NumItem):
            return self._valor < other._valor
        return super().__lt__(other)


class MotoresWidget(QWidget):
    def __init__(self):
        super().__init__()
        self._cargado = False
        self._build_ui()

    # ──────────────────────────────────────────────────────────────────────────
    def _build_ui(self):
        root = QHBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)
        left  = self._build_left_panel()
        right = self._build_right_panel()
        root.addWidget(left,  0)   # ancho fijo (185px)
        root.addWidget(right, 1)   # stretch=1 → llena TODO el espacio restante

        self._search_timer = QTimer()
        self._search_timer.setSingleShot(True)
        self._search_timer.timeout.connect(self._filtrar)

    # ── Panel izquierdo ───────────────────────────────────────────────────────
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

    # ── Panel derecho ─────────────────────────────────────────────────────────
    def _build_right_panel(self) -> QWidget:
        panel = QWidget()
        panel.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        panel.setStyleSheet(f"background-color: {COLOR_CONTENT_BG};")
        layout = QVBoxLayout(panel)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # ── Barra superior (título + buscador) con padding propio ────────────
        topbar = QWidget()
        topbar.setStyleSheet(f"background-color: {COLOR_CONTENT_BG};")
        top_layout = QVBoxLayout(topbar)
        top_layout.setContentsMargins(20, 16, 20, 10)
        top_layout.setSpacing(6)

        top_row = QHBoxLayout()
        titulo = QLabel("Listado de Motores")
        titulo.setFont(QFont(FONT_FAMILY, FONT_SIZE_XL, QFont.Weight.Bold))
        titulo.setStyleSheet(f"color: {COLOR_TEXT_PRIMARY};")
        top_row.addWidget(titulo)
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

        # Contador
        self.lbl_contador = QLabel("")
        self.lbl_contador.setStyleSheet(
            f"color: {COLOR_TEXT_MUTED}; font-size: {FONT_SIZE_SM}px;"
        )
        top_layout.addWidget(self.lbl_contador)

        layout.addWidget(topbar)

        # Tabla (sin márgenes, llega al borde)
        self.tabla = QTableWidget()
        self.tabla.setColumnCount(len(_COLS))
        self.tabla.setHorizontalHeaderLabels([c[0] for c in _COLS])
        self.tabla.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.tabla.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.tabla.setAlternatingRowColors(True)
        self.tabla.verticalHeader().setVisible(False)
        self.tabla.setStyleSheet(TABLE_STYLE)
        self.tabla.setShowGrid(True)
        self.tabla.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)

        hdr = self.tabla.horizontalHeader()
        hdr.setDefaultAlignment(Qt.AlignmentFlag.AlignCenter)
        hdr.setStretchLastSection(False)
        self.tabla.setSortingEnabled(True)   # clic en columna → ordena, toggle asc/desc

        # Todas Interactive (arrastrables) con ancho inicial
        for i, (_, ancho) in enumerate(_COLS):
            hdr.setSectionResizeMode(i, QHeaderView.ResizeMode.Interactive)
            self.tabla.setColumnWidth(i, ancho)

        # Cuando el usuario arrastra una columna fija, recalcular Motor
        hdr.sectionResized.connect(self._on_columna_redimensionada)

        layout.addWidget(self.tabla)
        return panel

    # ── Ajuste dinámico de la columna Motor ───────────────────────────────────
    def _ajustar_columna_motor(self):
        """Expande la columna Motor para que la tabla ocupe todo el ancho disponible."""
        viewport_w = self.tabla.viewport().width()
        otras = sum(
            self.tabla.columnWidth(i)
            for i in range(len(_COLS))
            if i != COL_MOTOR
        )
        nuevo = max(MOTOR_MIN_WIDTH, viewport_w - otras)
        # Bloquear señal para no disparar _on_columna_redimensionada en loop
        self.tabla.horizontalHeader().blockSignals(True)
        self.tabla.setColumnWidth(COL_MOTOR, nuevo)
        self.tabla.horizontalHeader().blockSignals(False)

    def _on_columna_redimensionada(self, col: int, old_w: int, new_w: int):
        """Solo recalcula Motor cuando el usuario redimensiona otra columna."""
        if col != COL_MOTOR:
            self._ajustar_columna_motor()

    def resizeEvent(self, event):
        """Al cambiar el tamaño de la ventana, la columna Motor se adapta."""
        super().resizeEvent(event)
        self._ajustar_columna_motor()

    # ── Carga inicial ─────────────────────────────────────────────────────────
    def showEvent(self, event):
        super().showEvent(event)
        if not self._cargado:
            self._cargado = True
            self._cargar_marcas()

    def recargar(self):
        self._cargado = False
        self._cargar_marcas()
        self._cargado = True

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

    # ── Filtrado ──────────────────────────────────────────────────────────────
    def _marca_seleccionada(self) -> str | None:
        item = self.lista_marcas.currentItem()
        if not item:
            return None
        texto = item.text().strip()
        return None if texto.upper() == "TODOS" else texto

    def _filtrar(self):
        marca = self._marca_seleccionada()
        busq  = self.buscador.text().strip() or None
        self._poblar_tabla(get_motores(marca=marca, busqueda=busq))

    # ── Tabla ─────────────────────────────────────────────────────────────────
    def _poblar_tabla(self, motores: list[dict]):
        # Desactivar sorting durante la carga para evitar re-ordenamientos intermedios
        self.tabla.setSortingEnabled(False)
        self.tabla.setRowCount(len(motores))

        for fila, m in enumerate(motores):
            self.tabla.setRowHeight(fila, 28)

            # Columnas de texto normal
            texto_celdas = [
                (0, m.get("indice") or "",   CENTER),
                (1, m.get("motor")  or "",   LEFT),
                (2, m.get("marca")  or "",   CENTER),
                (3, m.get("cilindrada") or "", CENTER),
                (4, m.get("tipo") or "",     CENTER),
                (8, m.get("origen") or "",   CENTER),
            ]
            for col, valor, alineacion in texto_celdas:
                cell = QTableWidgetItem(valor)
                cell.setTextAlignment(alineacion)
                self.tabla.setItem(fila, col, cell)

            # Columnas numéricas (usan _NumItem para orden correcto)
            cil = m.get("cilindros")
            self.tabla.setItem(fila, 5, _NumItem(
                float(cil) if cil else None,
                str(cil) if cil else ""
            ))
            dia = m.get("diametro")
            self.tabla.setItem(fila, 6, _NumItem(
                dia,
                f"{dia} mm" if dia is not None else ""
            ))
            lst = m.get("lista_num")
            self.tabla.setItem(fila, 7, _NumItem(
                float(lst) if lst else None,
                str(lst) if lst else ""
            ))
            # Alinear al centro las numéricas
            for col in (5, 6, 7):
                if self.tabla.item(fila, col):
                    self.tabla.item(fila, col).setTextAlignment(CENTER)

        self.tabla.setSortingEnabled(True)   # reactivar sorting

        total     = len(motores)
        marca_txt = self._marca_seleccionada() or "todas las marcas"
        plural    = "es" if total != 1 else ""
        self.lbl_contador.setText(f"{total} motor{plural}  ·  {marca_txt}")
