"""
Ventana principal de la aplicación.
Contiene el sidebar de navegación y el área de contenido (QStackedWidget).
"""
from PyQt6.QtWidgets import (
    QMainWindow, QWidget, QHBoxLayout, QVBoxLayout,
    QListWidget, QListWidgetItem, QStackedWidget, QLabel,
)
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QFont

from .motores_widget              import MotoresWidget
from .actualizar_widget           import ActualizarWidget
from .presupuestos_widget         import PresupuestosWidget
from .clientes_widget             import ClientesWidget
from .presupuesto_detalle_widget  import PresupuestoDetalleWidget
from .placeholder_widget          import PlaceholderWidget
from .styles import FONT_FAMILY, FONT_SIZE_MD, FONT_SIZE_LG, SIDEBAR_STYLE, COLOR_CONTENT_BG


# Ítems del menú: (emoji + texto, índice en el stack)
MENU_ITEMS = [
    ("🔧   Listado de Motores",  0),
    ("📂   Actualizar Excel",    1),
    ("📋   Presupuestos",        2),
    ("💲   Editar Precios",      3),
    ("👥   Clientes",            4),
]


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Sistema de Presupuestos — Rectificadora")
        self.setMinimumSize(1100, 680)
        self.resize(1280, 760)
        self._build_ui()

    # ──────────────────────────────────────────────────────────────────────────
    def _build_ui(self):
        central = QWidget()
        self.setCentralWidget(central)
        root = QHBoxLayout(central)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        root.addWidget(self._build_sidebar())
        root.addWidget(self._build_stack())

    # ── Sidebar ───────────────────────────────────────────────────────────────
    def _build_sidebar(self) -> QWidget:
        sidebar = QWidget()
        sidebar.setObjectName("sidebar")
        sidebar.setStyleSheet(SIDEBAR_STYLE)

        layout = QVBoxLayout(sidebar)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Logo / nombre del taller
        logo = QLabel("⚙  Rectificadora")
        logo.setStyleSheet("""
            color: white;
            font-size: 15px;
            font-weight: bold;
            padding: 22px 20px 18px 20px;
            border-bottom: 1px solid #2d3f6e;
            font-family: Segoe UI;
        """)
        layout.addWidget(logo)

        # Lista de navegación
        self.nav = QListWidget()
        self.nav.setStyleSheet("")   # hereda de SIDEBAR_STYLE via objectName
        for texto, _ in MENU_ITEMS:
            item = QListWidgetItem(texto)
            item.setFont(QFont(FONT_FAMILY, FONT_SIZE_MD))
            self.nav.addItem(item)

        self.nav.setCurrentRow(0)
        self.nav.currentRowChanged.connect(self._cambiar_pagina)
        layout.addWidget(self.nav)
        layout.addStretch()

        # Versión al pie
        version = QLabel("v0.1.0")
        version.setStyleSheet(
            "color: #5b85d0; font-size: 10px; padding: 12px 20px;"
            " font-family: Segoe UI;"
        )
        layout.addWidget(version)

        return sidebar

    # ── Stack de contenido ────────────────────────────────────────────────────
    def _build_stack(self) -> QStackedWidget:
        self.stack = QStackedWidget()
        self.stack.setStyleSheet(f"background-color: {COLOR_CONTENT_BG};")

        self._motores_widget      = MotoresWidget()
        self._actualizar_widget   = ActualizarWidget()
        self._presupuestos_widget = PresupuestosWidget()
        self._clientes_widget     = ClientesWidget()
        self._detalle_widget      = PresupuestoDetalleWidget()

        # ── Señales de actualización de datos ────────────────────────────────
        self._actualizar_widget.datos_actualizados.connect(
            self._motores_widget.recargar
        )
        self._actualizar_widget.datos_actualizados.connect(
            lambda: self._presupuestos_widget._selector_motor.recargar()
        )

        # ── Señales de apertura del detalle de presupuesto ───────────────────
        # Desde Presupuestos (stack index 2) → detalle (stack index 5)
        self._presupuestos_widget.abrir_presupuesto.connect(
            lambda pid: self._abrir_detalle(pid, back=2)
        )
        # Desde Clientes (stack index 4) → detalle (stack index 5)
        self._clientes_widget.abrir_presupuesto.connect(
            lambda pid: self._abrir_detalle(pid, back=4)
        )
        # Desde el detalle → volver al stack anterior
        self._detalle_widget.volver.connect(self._volver_desde_detalle)

        self.stack.addWidget(self._motores_widget)      # 0
        self.stack.addWidget(self._actualizar_widget)   # 1
        self.stack.addWidget(self._presupuestos_widget) # 2
        self.stack.addWidget(PlaceholderWidget(         # 3
            "💲  Editar Precios",
            "Este módulo estará disponible en una próxima versión.",
        ))
        self.stack.addWidget(self._clientes_widget)     # 4
        self.stack.addWidget(self._detalle_widget)      # 5 (sin ítem de menú)

        return self.stack

    def _abrir_detalle(self, presupuesto_id: int, back: int):
        self._detalle_widget.abrir(presupuesto_id, back)
        self.stack.setCurrentIndex(5)

    def _volver_desde_detalle(self, back_index: int):
        self.stack.setCurrentIndex(back_index)
        # Sincronizar el ítem seleccionado en el sidebar (solo para índices 0-4)
        if 0 <= back_index <= 4:
            self.nav.blockSignals(True)
            self.nav.setCurrentRow(back_index)
            self.nav.blockSignals(False)

    # ── Navegación ────────────────────────────────────────────────────────────
    def _cambiar_pagina(self, index: int):
        self.stack.setCurrentIndex(index)
