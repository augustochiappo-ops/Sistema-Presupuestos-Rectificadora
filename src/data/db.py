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
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                presupuesto_id    INTEGER REFERENCES presupuestos(id) ON DELETE CASCADE,
                servicio_id       INTEGER REFERENCES servicios(id),
                descripcion_custom TEXT,   -- para servicios manuales (no FACRA)
                precio_aplicado   REAL
            );

            -- Historial de PDFs por presupuesto
            CREATE TABLE IF NOT EXISTS presupuesto_pdfs (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                presupuesto_id INTEGER REFERENCES presupuestos(id) ON DELETE CASCADE,
                version        INTEGER NOT NULL DEFAULT 1,
                pdf_path       TEXT NOT NULL,
                fecha          TEXT NOT NULL
            );
        """)

        # ── Migraciones automáticas ───────────────────────────────────────────
        cols_motores = {r[1] for r in conn.execute("PRAGMA table_info(motores)")}
        if "diametro" not in cols_motores:
            conn.execute("ALTER TABLE motores ADD COLUMN diametro REAL")

        cols_items = {r[1] for r in conn.execute("PRAGMA table_info(presupuesto_items)")}
        if "descripcion_custom" not in cols_items:
            conn.execute("ALTER TABLE presupuesto_items ADD COLUMN descripcion_custom TEXT")

        # Migrar pdf_path existente de presupuestos → presupuesto_pdfs
        from datetime import date as _date
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
                (row[0], row[1], row[2] or _date.today().isoformat()),
            )


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


# ─── Clientes ─────────────────────────────────────────────────────────────────

def get_clientes_lista() -> list[dict]:
    """Lista de clientes con cantidad de presupuestos y fecha del último."""
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
    """Lista de nombres de clientes para autocompletado."""
    with get_connection() as conn:
        cur = conn.execute(
            "SELECT nombre FROM clientes ORDER BY nombre COLLATE NOCASE"
        )
        return [row[0] for row in cur.fetchall()]


def get_presupuestos_por_cliente(cliente_id: int) -> list[dict]:
    """Presupuestos de un cliente específico."""
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
    """Ítems del presupuesto con descripción FACRA y/o descripción custom."""
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
    Actualiza ítems y notas del presupuesto.
    items_data: [{servicio_id, descripcion_custom, precio_aplicado}]
    Elimina los ítems anteriores y los reinserta.
    Retorna el nuevo total.
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


# ─── Historial de PDFs ────────────────────────────────────────────────────────

def guardar_pdf_historial(presupuesto_id: int, pdf_path: str) -> int:
    """Guarda un nuevo PDF en el historial. Retorna el número de versión."""
    from datetime import date as _date
    with get_connection() as conn:
        row = conn.execute(
            "SELECT COALESCE(MAX(version), 0) FROM presupuesto_pdfs WHERE presupuesto_id = ?",
            (presupuesto_id,),
        ).fetchone()
        version = (row[0] or 0) + 1
        conn.execute(
            "INSERT INTO presupuesto_pdfs (presupuesto_id, version, pdf_path, fecha) VALUES (?,?,?,?)",
            (presupuesto_id, version, pdf_path, _date.today().isoformat()),
        )
        conn.execute(
            "UPDATE presupuestos SET pdf_path = ? WHERE id = ?",
            (pdf_path, presupuesto_id),
        )
        return version


def get_pdfs_presupuesto(presupuesto_id: int) -> list[dict]:
    """PDFs del presupuesto ordenados del más reciente al más antiguo."""
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
