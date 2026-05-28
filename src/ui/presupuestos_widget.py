"""
Pantalla: Presupuestos.
Muestra el historial y permite crear nuevos presupuestos.
(Funcionalidad completa en próximas iteraciones.)
"""
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
)
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QFont

from .styles import (
    FONT_FAMILY, FONT_SIZE_XL, FONT_SIZE_MD,
    COLOR_TEXT_PRIMARY, COLOR_TEXT_PLACEHOLDER,
    BUTTON_SUCCESS, COLOR_CONTENT_BG,
)


class PresupuestosWidget(QWidget):
    def __init__(self):
        super().__init__()
        self._build_ui()

    def _build_ui(self):
        self.setStyleSheet(f"background-color: {COLOR_CONTENT_BG};")
        layout = QVBoxLayout(self)
        layout.setContentsMargins(32, 32, 32, 32)
        layout.setSpacing(16)

        # Encabezado
        header = QHBoxLayout()

        titulo = QLabel("Presupuestos")
        titulo.setFont(QFont(FONT_FAMILY, FONT_SIZE_XL, QFont.Weight.Bold))
        titulo.setStyleSheet(f"color: {COLOR_TEXT_PRIMARY};")

        btn_nuevo = QPushButton("＋  Nuevo Presupuesto")
        btn_nuevo.setStyleSheet(BUTTON_SUCCESS)
        btn_nuevo.setFixedHeight(40)

        header.addWidget(titulo)
        header.addStretch()
        header.addWidget(btn_nuevo)
        layout.addLayout(header)

        # Placeholder
        msg = QLabel(
            "📋  El historial de presupuestos aparecerá acá.\n"
            "Usá el botón para crear tu primer presupuesto."
        )
        msg.setAlignment(Qt.AlignmentFlag.AlignCenter)
        msg.setStyleSheet(
            f"color: {COLOR_TEXT_PLACEHOLDER}; font-size: {FONT_SIZE_MD}px;"
            " margin-top: 80px; line-height: 1.8;"
        )
        layout.addWidget(msg)
        layout.addStretch()
