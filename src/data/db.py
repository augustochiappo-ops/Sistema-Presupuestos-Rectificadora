"""
Módulo de base de datos SQLite.
Gestiona la conexión y el esquema de la base de datos local.
"""
import sqlite3
import os

# Ruta absoluta a la base de datos (carpeta db/ en la raíz del proyecto)
_BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_PATH = os.path.join(_BASE_DIR, "db", "presupuestos.db")


def get_connection() -> sqlite3.Connection:
    """Devuelve una conexión a la base de datos. Crea el directorio si no existe."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # acceso por nombre de columna
    return conn


def init_db():
    """Crea todas las tablas si no existen. Seguro de llamar varias veces."""
    with get_connection() as conn:
        conn.executescript("""
            -- Motores: viene del nomenclador FACRA + los que el usuario crea manualmente
            CREATE TABLE IF NOT EXISTS motores (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                indice     TEXT,
                motor      TEXT NOT NULL,
                marca      TEXT,
                lista_num  INTEGER,
                diametro   REAL,        -- diámetro del cilindro en mm
                cilindros  INTEGER,
                tipo       TEXT,        -- NAFTA | DIESEL | TURBO DIESEL
                cilindrada TEXT,        -- ej: "1900cc" | "1.6L"
                origen     TEXT DEFAULT 'facra'   -- 'facra' | 'manual'
            );

            -- Servicios: viene de la lista orientadora FACRA
            CREATE TABLE IF NOT EXISTS servicios (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                item_num    INTEGER,
                descripcion TEXT,
                l1  REAL, l2  REAL, l3  REAL, l4  REAL, l5  REAL,
                l6  REAL, l7  REAL, l8  REAL, l9  REAL, l10 REAL,
                l11 REAL,  l12 REAL, l13 REAL
            );

            -- Clientes
            CREATE TABLE IF NOT EXISTS clientes (
                id       INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre   TEXT NOT NULL,
                telefono TEXT,
                email    TEXT,
                notas    TEXT
            );

            -- Presupuestos
            CREATE TABLE IF NOT EXISTS presupuestos (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                cliente_id INTEGER REFERENCES clientes(id),
                motor_id   INTEGER REFERENCES motores(id),
                fecha      TEXT,
                total      REAL,
                pdf_path   TEXT,
                notas      TEXT
            );

            -- Ítems de cada presupuesto
            CREATE TABLE IF NOT EXISTS presupuesto_items (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                presupuesto_id  INTEGER REFERENCES presupuestos(id) ON DELETE CASCADE,
                servicio_id     INTEGER REFERENCES servicios(id),
                precio_aplicado REAL
            );
        """)

        # Migración: agregar columnas nuevas si la DB ya existía sin ellas
        columnas_existentes = {
            row[1] for row in conn.execute("PRAGMA table_info(motores)")
        }
        if "diametro" not in columnas_existentes:
            conn.execute("ALTER TABLE motores ADD COLUMN diametro REAL")
