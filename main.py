"""
Punto de entrada del Sistema de Presupuestos.
Inicializa la base de datos y lanza la interfaz gráfica.
"""
import sys
from PyQt6.QtWidgets import QApplication
from PyQt6.QtGui import QFont

from src.data.db import init_db
from src.ui.main_window import MainWindow


def main():
    # 1. Inicializar la base de datos (crea las tablas si no existen)
    init_db()

    # 2. Crear la aplicación
    app = QApplication(sys.argv)
    app.setApplicationName("Sistema de Presupuestos")
    app.setFont(QFont("Segoe UI", 10))

    # 3. Crear y mostrar la ventana principal
    window = MainWindow()
    window.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
