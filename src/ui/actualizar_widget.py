"""
Pantalla: Actualizar Excel.
Permite importar los archivos de FACRA y (en el futuro) CRAC.
"""
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel,
    QPushButton, QFileDialog, QFrame, QSizePolicy,
)
from PyQt6.QtCore import Qt, QThread, pyqtSignal
from PyQt6.QtGui import QFont

from ..data.facra import importar_nomenclador, importar_lista_orientadora
from .styles import (
    FONT_FAMILY, FONT_SIZE_MD, FONT_SIZE_LG, FONT_SIZE_XL,
    COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY, COLOR_TEXT_MUTED,
    COLOR_SUCCESS, COLOR_ERROR,
    BUTTON_PRIMARY, CARD_STYLE, COLOR_CONTENT_BG,
)


# ─── Hilo de importación (no bloquea la UI) ──────────────────────────────────
class _ImportThread(QThread):
    resultado = pyqtSignal(int, str)

    def __init__(self, func, path: str):
        super().__init__()
        self.func = func
        self.path = path

    def run(self):
        count, msg = self.func(self.path)
        self.resultado.emit(count, msg)


# ─── Tarjeta individual de Excel ─────────────────────────────────────────────
class _CardExcel(QFrame):
    """
    Componente reutilizable: muestra el nombre del archivo Excel,
    una descripción y un botón para importarlo.
    """
    importado = pyqtSignal()   # se emite cuando la importación termina con éxito

    def __init__(self, titulo: str, descripcion: str, boton_texto: str,
                 func_importar, habilitado: bool = True, parent=None):
        super().__init__(parent)
        self._func = func_importar
        self._hilo = None
        self._build(titulo, descripcion, boton_texto, habilitado)

    def _build(self, titulo, descripcion, boton_texto, habilitado):
        self.setStyleSheet(CARD_STYLE)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(22, 18, 22, 18)
        layout.setSpacing(8)

        lbl_titulo = QLabel(titulo)
        lbl_titulo.setFont(QFont(FONT_FAMILY, FONT_SIZE_LG, QFont.Weight.Bold))
        lbl_titulo.setStyleSheet(f"color: {COLOR_TEXT_PRIMARY}; border: none;")

        lbl_desc = QLabel(descripcion)
        lbl_desc.setStyleSheet(
            f"color: {COLOR_TEXT_SECONDARY}; font-size: {FONT_SIZE_MD}px;"
            " border: none;"
        )
        lbl_desc.setWordWrap(True)

        fila = QHBoxLayout()
        self.btn = QPushButton(f"📂  {boton_texto}")
        self.btn.setStyleSheet(BUTTON_PRIMARY)
        self.btn.setFixedHeight(38)
        self.btn.setEnabled(habilitado)
        self.btn.clicked.connect(self._seleccionar_archivo)

        self.lbl_status = QLabel("")
        self.lbl_status.setStyleSheet(f"font-size: {FONT_SIZE_MD}px; border: none;")

        fila.addWidget(self.btn)
        fila.addWidget(self.lbl_status)
        fila.addStretch()

        layout.addWidget(lbl_titulo)
        layout.addWidget(lbl_desc)
        layout.addLayout(fila)

    def _seleccionar_archivo(self):
        path, _ = QFileDialog.getOpenFileName(
            self, "Seleccionar archivo Excel", "", "Excel (*.xls *.xlsx)"
        )
        if not path:
            return
        self._iniciar_importacion(path)

    def _iniciar_importacion(self, path: str):
        self.btn.setEnabled(False)
        self.lbl_status.setText("⏳  Importando…")
        self.lbl_status.setStyleSheet(
            f"color: {COLOR_TEXT_MUTED}; font-size: {FONT_SIZE_MD}px; border: none;"
        )

        self._hilo = _ImportThread(self._func, path)
        self._hilo.resultado.connect(self._on_resultado)
        self._hilo.start()

    def _on_resultado(self, count: int, msg: str):
        self.btn.setEnabled(True)
        ok = count > 0
        color = COLOR_SUCCESS if ok else COLOR_ERROR
        self.lbl_status.setText(msg)
        self.lbl_status.setStyleSheet(
            f"color: {color}; font-size: {FONT_SIZE_MD}px; border: none; font-weight: bold;"
        )
        if ok:
            self.importado.emit()


# ─── Widget principal ─────────────────────────────────────────────────────────
class ActualizarWidget(QWidget):
    # Se emite cuando se importa algo para que otros widgets puedan actualizarse
    datos_actualizados = pyqtSignal()

    def __init__(self):
        super().__init__()
        self._build_ui()

    def _build_ui(self):
        self.setStyleSheet(f"background-color: {COLOR_CONTENT_BG};")
        layout = QVBoxLayout(self)
        layout.setContentsMargins(32, 32, 32, 32)
        layout.setSpacing(14)

        # Encabezado
        titulo = QLabel("Actualizar Excel")
        titulo.setFont(QFont(FONT_FAMILY, FONT_SIZE_XL, QFont.Weight.Bold))
        titulo.setStyleSheet(f"color: {COLOR_TEXT_PRIMARY};")

        subtitulo = QLabel(
            "Importá los archivos de FACRA para mantener motores y precios al día."
        )
        subtitulo.setStyleSheet(
            f"color: {COLOR_TEXT_SECONDARY}; font-size: {FONT_SIZE_MD}px; margin-bottom: 6px;"
        )

        layout.addWidget(titulo)
        layout.addWidget(subtitulo)

        # ── Sección FACRA ──────────────────────────────────────────
        layout.addWidget(self._separador("FACRA"))

        card_nom = _CardExcel(
            "📋  Nomenclador de Motores",
            "Lista de todos los motores con su número de lista asignado (1–13). "
            "Actualizá cuando FACRA publique una versión nueva.",
            "Cargar nomenclador.xls",
            importar_nomenclador,
        )
        card_nom.importado.connect(self.datos_actualizados)
        layout.addWidget(card_nom)

        card_lista = _CardExcel(
            "💲  Lista Orientadora de Mano de Obra",
            "Precios vigentes por servicio, clasificados por número de lista. "
            "Se actualiza con cada nueva publicación de FACRA.",
            "Cargar lista_orientadora.xls",
            importar_lista_orientadora,
        )
        card_lista.importado.connect(self.datos_actualizados)
        layout.addWidget(card_lista)

        # ── Sección CRAC (deshabilitada) ──────────────────────────
        layout.addWidget(self._separador("CRAC  —  próximamente"))

        def _no_disponible(path):
            return 0, "✗ Módulo no disponible aún"

        layout.addWidget(_CardExcel(
            "📦  Lista de Precios CRAC",
            "Precios de repuestos del proveedor CRAC. Se habilitará en una próxima versión.",
            "Cargar precios_crac.xls",
            _no_disponible,
            habilitado=False,
        ))
        layout.addWidget(_CardExcel(
            "🔖  Lista de Prefijos CRAC",
            "Codificación y prefijos de partes CRAC. Se habilitará en una próxima versión.",
            "Cargar prefijos_crac.xls",
            _no_disponible,
            habilitado=False,
        ))

        layout.addStretch()

    @staticmethod
    def _separador(texto: str) -> QLabel:
        lbl = QLabel(texto.upper())
        lbl.setStyleSheet(
            f"font-size: 10px; font-weight: bold; color: {COLOR_TEXT_MUTED};"
            " letter-spacing: 1.5px; margin-top: 10px;"
        )
        return lbl
