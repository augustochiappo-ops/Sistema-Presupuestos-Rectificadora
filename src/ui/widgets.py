"""
Widgets reutilizables de la UI.
"""
from PyQt6.QtWidgets import QTableWidget
from PyQt6.QtCore import Qt

from .styles import make_table_style, FONT_SIZE_MD

_ZOOM_MIN = 8
_ZOOM_MAX = 24


class ZoomableTable(QTableWidget):
    """QTableWidget con zoom de fuente vía Ctrl + rueda del ratón."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._font_px   = FONT_SIZE_MD
        self._extra_css = ""
        self.setStyleSheet(make_table_style(self._font_px))

    def set_extra_style(self, css: str):
        """Agrega CSS extra que se preserva en cada re-estilización por zoom."""
        self._extra_css = css
        self.setStyleSheet(make_table_style(self._font_px) + css)

    def wheelEvent(self, event):
        if event.modifiers() & Qt.KeyboardModifier.ControlModifier:
            delta = event.angleDelta().y()
            if delta > 0:
                self._font_px = min(self._font_px + 1, _ZOOM_MAX)
            elif delta < 0:
                self._font_px = max(self._font_px - 1, _ZOOM_MIN)
            self.setStyleSheet(make_table_style(self._font_px) + self._extra_css)
            row_h = max(22, int(self._font_px * 2.2))
            for row in range(self.rowCount()):
                self.setRowHeight(row, row_h)
            event.accept()
        else:
            super().wheelEvent(event)
