"""
Widget genérico de "próximamente".
Se usa para secciones que todavía no están implementadas.
"""
from PyQt6.QtWidgets import QWidget, QVBoxLayout, QLabel
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QFont

from .styles import (
    FONT_FAMILY, FONT_SIZE_XL, FONT_SIZE_MD,
    COLOR_TEXT_PRIMARY, COLOR_TEXT_PLACEHOLDER, COLOR_CONTENT_BG,
)


class PlaceholderWidget(QWidget):
    def __init__(self, titulo: str, mensaje: str):
        super().__init__()
        self.setStyleSheet(f"background-color: {COLOR_CONTENT_BG};")
        layout = QVBoxLayout(self)
        layout.setContentsMargins(32, 32, 32, 32)
        layout.setSpacing(12)

        lbl_titulo = QLabel(titulo)
        lbl_titulo.setFont(QFont(FONT_FAMILY, FONT_SIZE_XL, QFont.Weight.Bold))
        lbl_titulo.setStyleSheet(f"color: {COLOR_TEXT_PRIMARY};")
        layout.addWidget(lbl_titulo)

        lbl_msg = QLabel(mensaje)
        lbl_msg.setAlignment(Qt.AlignmentFlag.AlignCenter)
        lbl_msg.setStyleSheet(
            f"color: {COLOR_TEXT_PLACEHOLDER}; font-size: {FONT_SIZE_MD}px;"
            " margin-top: 80px;"
        )
        layout.addWidget(lbl_msg)
        layout.addStretch()
