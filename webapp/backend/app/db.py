"""
Módulo de base de datos SQLite.
Gestiona la conexión y el esquema de la base de datos.
Portado de la app de escritorio (src/data/db.py) sin cambios de esquema ni de lógica,
salvo donde se indica explícitamente (soporte de ítems custom en guardar_presupuesto).
"""
import os
import sqlite3
from datetime import date

from . import config


def get_connection() -> sqlite3.Connection:
    """Devuelve una conexión a la base de datos. Crea el directorio si no existe."""
    os.makedirs(os.path.dirname(config.DB_PATH), exist_ok=True)
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Crea todas las tablas si no existen. Seguro de llamar varias veces."""
    with get_connection() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS motores (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                indice     TEXT,
                motor      TEXT NOT NULL,
                marca      TEXT,
                lista_num  INTEGER,
                diametro   REAL,
                cilindros  INTEGER,
                tipo       TEXT,
                cilindrada TEXT,
                origen     TEXT DEFAULT 'facra'
            );

            CREATE TABLE IF NOT EXISTS servicios (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                item_num    INTEGER,
                descripcion TEXT,
                l1  REAL, l2  REAL, l3  REAL, l4  REAL, l5  REAL,
                l6  REAL, l7  REAL, l8  REAL, l9  REAL, l10 REAL,
                l11 REAL,  l12 REAL, l13 REAL
            );

            CREATE TABLE IF NOT EXISTS clientes (
                id       INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre   TEXT NOT NULL,
                telefono TEXT,
                email    TEXT,
                notas    TEXT
            );

            CREATE TABLE IF NOT EXISTS presupuestos (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                cliente_id INTEGER REFERENCES clientes(id),
                motor_id   INTEGER REFERENCES motores(id),
                fecha      TEXT,
                total      REAL,
                pdf_path   TEXT,
                notas      TEXT
            );

            CREATE TABLE IF NOT EXISTS presupuesto_items (
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                presupuesto_id    INTEGER REFERENCES presupuestos(id) ON DELETE CASCADE,
                servicio_id       INTEGER REFERENCES servicios(id),
                descripcion_custom TEXT,
                precio_aplicado   REAL
            );

            CREATE TABLE IF NOT EXISTS presupuesto_pdfs (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                presupuesto_id INTEGER REFERENCES presupuestos(id) ON DELETE CASCADE,
                version        INTEGER NOT NULL DEFAULT 1,
                pdf_path       TEXT NOT NULL,
                fecha          TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS favoritos_servicios (
                servicio_id INTEGER PRIMARY KEY REFERENCES servicios(id) ON DELETE CASCADE
            );
        """)

        cols_motores = {r[1] for r in conn.execute("PRAGMA table_info(motores)")}
        if "diametro" not in cols_motores:
            conn.execute("ALTER TABLE motores ADD COLUMN diametro REAL")

        cols_items = {r[1] for r in conn.execute("PRAGMA table_info(presupuesto_items)")}
        if "descripcion_custom" not in cols_items:
            conn.execute("ALTER TABLE presupuesto_items ADD COLUMN descripcion_custom TEXT")

        pdfs_sin_migrar = conn.execute(
            """
            SELECT p.id, p.pdf_path, p.fecha
            FROM presupuestos p
            WHERE p.pdf_path IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM presupuesto_pdfs pp WHERE pp.presupuesto_id = p.id
              )
            """
        ).fetchall()
        for row in pdfs_sin_migrar:
            conn.execute(
                "INSERT INTO presupuesto_pdfs (presupuesto_id, version, pdf_path, fecha) VALUES (?,1,?,?)",
                (row[0], row[1], row[2] or date.today().isoformat()),
            )

        # Normaliza pdf_path a solo el nombre de archivo: la app de escritorio guardaba
        # la ruta absoluta de Windows (ej. "C:\...\Presupuestos\presupuesto_0001.pdf"),
        # que deja de ser válida al migrar la DB a otro entorno (otro SO, otro servidor).
        # La ruta completa se reconstruye siempre contra config.PDFS_DIR al servir el archivo.
        for tabla in ("presupuestos", "presupuesto_pdfs"):
            filas = conn.execute(f"SELECT id, pdf_path FROM {tabla} WHERE pdf_path IS NOT NULL").fetchall()
            for row_id, pdf_path in filas:
                nombre = pdf_path.replace("\\", "/").rsplit("/", 1)[-1]
                if nombre != pdf_path:
                    conn.execute(f"UPDATE {tabla} SET pdf_path = ? WHERE id = ?", (nombre, row_id))


def guardar_presupuesto(
    cliente_nombre: str,
    motor_id: int,
    items: list[dict],
) -> int:
    """
    Crea (o reutiliza) el cliente, inserta el presupuesto y sus ítems.
    items: list of {servicio_id, descripcion_custom, precio_aplicado}
    (servicio_id es None para ítems custom, igual que en actualizar_presupuesto)
    Retorna el id del presupuesto creado.
    """
    total = sum((i.get("precio_aplicado") or 0.0) for i in items)

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
                INSERT INTO presupuesto_items (presupuesto_id, servicio_id, descripcion_custom, precio_aplicado)
                VALUES (?, ?, ?, ?)
                """,
                (presupuesto_id, item.get("servicio_id"), item.get("descripcion_custom"), item.get("precio_aplicado")),
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


# ─── Clientes ─────────────────────────────────────────────────────────────────

def get_clientes_lista() -> list[dict]:
    with get_connection() as conn:
        cur = conn.execute(
            """
            SELECT c.id, c.nombre,
                   COUNT(p.id)   AS total_presupuestos,
                   MAX(p.fecha)  AS ultimo_presupuesto
            FROM clientes c
            LEFT JOIN presupuestos p ON p.cliente_id = c.id
            GROUP BY c.id
            ORDER BY c.nombre COLLATE NOCASE
            """
        )
        cols = ["id", "nombre", "total_presupuestos", "ultimo_presupuesto"]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def get_clientes_nombres() -> list[str]:
    with get_connection() as conn:
        cur = conn.execute(
            "SELECT nombre FROM clientes ORDER BY nombre COLLATE NOCASE"
        )
        return [row[0] for row in cur.fetchall()]


def get_presupuestos_por_cliente(cliente_id: int) -> list[dict]:
    with get_connection() as conn:
        cur = conn.execute(
            """
            SELECT p.id, p.fecha, c.nombre, m.motor, p.total, p.pdf_path
            FROM presupuestos p
            LEFT JOIN clientes c ON c.id = p.cliente_id
            LEFT JOIN motores  m ON m.id = p.motor_id
            WHERE p.cliente_id = ?
            ORDER BY p.fecha DESC, p.id DESC
            """,
            (cliente_id,),
        )
        cols = ["id", "fecha", "cliente", "motor", "total", "pdf_path"]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


# ─── Detalle de presupuesto ───────────────────────────────────────────────────

def get_presupuesto_detalle(presupuesto_id: int) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT p.id, p.fecha, p.total, p.notas,
                   c.id AS cliente_id, c.nombre AS cliente,
                   m.id AS motor_id,   m.motor,  m.lista_num
            FROM presupuestos p
            LEFT JOIN clientes c ON c.id = p.cliente_id
            LEFT JOIN motores  m ON m.id = p.motor_id
            WHERE p.id = ?
            """,
            (presupuesto_id,),
        ).fetchone()
        if not row:
            return None
        cols = ["id", "fecha", "total", "notas",
                "cliente_id", "cliente", "motor_id", "motor", "lista_num"]
        return dict(zip(cols, row))


def get_presupuesto_items_full(presupuesto_id: int) -> list[dict]:
    with get_connection() as conn:
        cur = conn.execute(
            """
            SELECT pi.id, pi.servicio_id, s.item_num,
                   s.descripcion AS desc_facra, pi.descripcion_custom,
                   pi.precio_aplicado
            FROM presupuesto_items pi
            LEFT JOIN servicios s ON s.id = pi.servicio_id
            WHERE pi.presupuesto_id = ?
            ORDER BY CASE WHEN s.item_num IS NULL THEN 9999 ELSE s.item_num END,
                     pi.id
            """,
            (presupuesto_id,),
        )
        cols = ["id", "servicio_id", "item_num", "desc_facra",
                "descripcion_custom", "precio_aplicado"]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def actualizar_presupuesto(
    presupuesto_id: int,
    items_data: list[dict],
    notas: str,
) -> float:
    """
    items_data: [{servicio_id, descripcion_custom, precio_aplicado}]
    Elimina los ítems anteriores y los reinserta. Retorna el nuevo total.
    """
    total = sum((i.get("precio_aplicado") or 0.0) for i in items_data)
    with get_connection() as conn:
        conn.execute(
            "DELETE FROM presupuesto_items WHERE presupuesto_id = ?",
            (presupuesto_id,),
        )
        for item in items_data:
            conn.execute(
                """
                INSERT INTO presupuesto_items
                    (presupuesto_id, servicio_id, descripcion_custom, precio_aplicado)
                VALUES (?, ?, ?, ?)
                """,
                (
                    presupuesto_id,
                    item.get("servicio_id"),
                    item.get("descripcion_custom"),
                    item.get("precio_aplicado"),
                ),
            )
        conn.execute(
            "UPDATE presupuestos SET total = ?, notas = ? WHERE id = ?",
            (total, notas.strip() if notas else None, presupuesto_id),
        )
    return total


def eliminar_presupuesto(presupuesto_id: int) -> bool:
    """Elimina un presupuesto junto con sus ítems e historial de PDFs. Retorna False si no existía."""
    with get_connection() as conn:
        existe = conn.execute(
            "SELECT 1 FROM presupuestos WHERE id = ?", (presupuesto_id,)
        ).fetchone()
        if not existe:
            return False
        conn.execute("DELETE FROM presupuesto_items WHERE presupuesto_id = ?", (presupuesto_id,))
        conn.execute("DELETE FROM presupuesto_pdfs WHERE presupuesto_id = ?", (presupuesto_id,))
        conn.execute("DELETE FROM presupuestos WHERE id = ?", (presupuesto_id,))
        return True


# ─── Historial de PDFs ────────────────────────────────────────────────────────

def guardar_pdf_historial(presupuesto_id: int, pdf_path: str) -> int:
    """Guarda un nuevo PDF en el historial. Retorna el número de versión."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT COALESCE(MAX(version), 0) FROM presupuesto_pdfs WHERE presupuesto_id = ?",
            (presupuesto_id,),
        ).fetchone()
        version = (row[0] or 0) + 1
        conn.execute(
            "INSERT INTO presupuesto_pdfs (presupuesto_id, version, pdf_path, fecha) VALUES (?,?,?,?)",
            (presupuesto_id, version, pdf_path, date.today().isoformat()),
        )
        conn.execute(
            "UPDATE presupuestos SET pdf_path = ? WHERE id = ?",
            (pdf_path, presupuesto_id),
        )
        return version


def get_pdfs_presupuesto(presupuesto_id: int) -> list[dict]:
    with get_connection() as conn:
        cur = conn.execute(
            """
            SELECT id, version, pdf_path, fecha
            FROM presupuesto_pdfs
            WHERE presupuesto_id = ?
            ORDER BY version DESC
            """,
            (presupuesto_id,),
        )
        cols = ["id", "version", "pdf_path", "fecha"]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


# ─── Favoritos de servicios ───────────────────────────────────────────────────

def toggle_favorito_servicio(servicio_id: int) -> bool:
    with get_connection() as conn:
        existe = conn.execute(
            "SELECT 1 FROM favoritos_servicios WHERE servicio_id = ?",
            (servicio_id,),
        ).fetchone()
        if existe:
            conn.execute(
                "DELETE FROM favoritos_servicios WHERE servicio_id = ?",
                (servicio_id,),
            )
            return False
        else:
            conn.execute(
                "INSERT INTO favoritos_servicios (servicio_id) VALUES (?)",
                (servicio_id,),
            )
            return True


def get_favoritos_ids() -> set[int]:
    with get_connection() as conn:
        cur = conn.execute("SELECT servicio_id FROM favoritos_servicios")
        return {row[0] for row in cur.fetchall()}


# ─── Motores (lookup puntual, no existía en la app de escritorio) ─────────────

def get_motor(motor_id: int) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT id, indice, motor, marca, lista_num,
                   cilindros, tipo, cilindrada, diametro, origen
            FROM motores WHERE id = ?
            """,
            (motor_id,),
        ).fetchone()
        if not row:
            return None
        cols = ["id", "indice", "motor", "marca", "lista_num",
                "cilindros", "tipo", "cilindrada", "diametro", "origen"]
        return dict(zip(cols, row))
