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


def guardar_presupuesto(
    cliente_nombre: str,
    motor_id: int,
    items: list[dict],
) -> int:
    """
    Crea (o reutiliza) el cliente, inserta el presupuesto y sus ítems.
    items: list of {servicio_id, descripcion, precio_aplicado}
    Retorna el id del presupuesto creado.
    """
    from datetime import date

    total = sum(
        (i["precio_aplicado"] or 0.0) for i in items
    )

    with get_connection() as conn:
        row = conn.execute(
            "SELECT id FROM clientes WHERE nombre = ? COLLATE NOCASE",
            (cliente_nombre.strip(),),
        ).fetchone()

        if row:
            cliente_id = row[0]
        else:
            cur = conn.execute(
                "INSERT INTO clientes (nombre) VALUES (?)",
                (cliente_nombre.strip(),),
            )
            cliente_id = cur.lastrowid

        cur = conn.execute(
            "INSERT INTO presupuestos (cliente_id, motor_id, fecha, total) VALUES (?, ?, ?, ?)",
            (cliente_id, motor_id, date.today().isoformat(), total),
        )
        presupuesto_id = cur.lastrowid

        for item in items:
            conn.execute(
                """
                INSERT INTO presupuesto_items (presupuesto_id, servicio_id, precio_aplicado)
                VALUES (?, ?, ?)
                """,
                (presupuesto_id, item.get("servicio_id"), item.get("precio_aplicado")),
            )

        return presupuesto_id


def update_presupuesto_pdf(presupuesto_id: int, pdf_path: str) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE presupuestos SET pdf_path = ? WHERE id = ?",
            (pdf_path, presupuesto_id),
        )


def get_presupuestos() -> list[dict]:
    with get_connection() as conn:
        cur = conn.execute(
            """
            SELECT p.id, p.fecha, c.nombre, m.motor, p.total, p.pdf_path
            FROM presupuestos p
            LEFT JOIN clientes  c ON c.id = p.cliente_id
            LEFT JOIN motores   m ON m.id = p.motor_id
            ORDER BY p.fecha DESC, p.id DESC
            """
        )
        cols = ["id", "fecha", "cliente", "motor", "total", "pdf_path"]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def get_presupuesto_items(presupuesto_id: int) -> list[dict]:
    with get_connection() as conn:
        cur = conn.execute(
            """
            SELECT pi.id, s.item_num, s.descripcion, pi.precio_aplicado
            FROM presupuesto_items pi
            LEFT JOIN servicios s ON s.id = pi.servicio_id
            WHERE pi.presupuesto_id = ?
            ORDER BY s.item_num
            """,
            (presupuesto_id,),
        )
        cols = ["id", "item_num", "descripcion", "precio_aplicado"]
        return [dict(zip(cols, row)) for row in cur.fetchall()]
