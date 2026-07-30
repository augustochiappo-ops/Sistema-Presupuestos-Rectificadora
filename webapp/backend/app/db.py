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
from .helpers import formato_nombre_titulo


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
                notas      TEXT,
                -- % de aumento/descuento sobre mano de obra aplicado al cotizar
                -- (o al último guardado en edición); se guarda para mostrarlo de
                -- nuevo la próxima vez que se abra a editar, no para recalcular nada.
                ajuste_pct REAL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS presupuesto_items (
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                presupuesto_id    INTEGER REFERENCES presupuestos(id) ON DELETE CASCADE,
                servicio_id       INTEGER REFERENCES servicios(id),
                descripcion_custom TEXT,
                precio_aplicado   REAL,
                -- Repuestos dentro del presupuesto. Se referencia por código (TEXT) y
                -- nunca por crac_repuestos.id: el import diario del CSV hace
                -- DELETE + reinsert y los ids no son estables.
                tipo              TEXT NOT NULL DEFAULT 'servicio',  -- 'servicio' | 'repuesto'
                repuesto_codigo   TEXT,     -- código del proveedor congelado; NULL en servicios y manuales
                cantidad          REAL NOT NULL DEFAULT 1,
                precio_unitario   REAL,     -- unitario congelado al cotizar (NULL en servicios)
                stock_al_cotizar  INTEGER,  -- 1/0 al cotizar; NULL en servicios y manuales
                categoria         TEXT      -- categoría congelada al cotizar; es lo único que sale en el PDF
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

            CREATE TABLE IF NOT EXISTS favoritos_categorias (
                cat_prefijo TEXT PRIMARY KEY
            );

            -- Repuestos sugeridos (usados antes en presupuestos de este motor) que
            -- el usuario ocultó a mano desde "Listado de Motores". No borra el
            -- historial: solo deja de sugerirse en cualquier pantalla del sistema.
            CREATE TABLE IF NOT EXISTS repuestos_ocultos_motor (
                motor_id        INTEGER NOT NULL REFERENCES motores(id) ON DELETE CASCADE,
                repuesto_codigo TEXT NOT NULL,
                PRIMARY KEY (motor_id, repuesto_codigo)
            );

            -- Prefijos del proveedor de repuestos (categoría y marca)
            CREATE TABLE IF NOT EXISTS crac_prefijos (
                tipo    TEXT NOT NULL,   -- 'categoria' | 'marca'
                prefijo TEXT NOT NULL,
                nombre  TEXT NOT NULL,
                PRIMARY KEY (tipo, prefijo)
            );

            -- Repuestos del proveedor: precio y stock, actualizado a diario
            CREATE TABLE IF NOT EXISTS crac_repuestos (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                codigo        TEXT NOT NULL,
                aplicacion    TEXT,
                precio        REAL,
                stock         INTEGER NOT NULL DEFAULT 0,   -- 1 = con stock, 0 = sin stock
                cat_prefijo   TEXT,
                marca_prefijo TEXT,
                resto         TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_crac_repuestos_codigo ON crac_repuestos(codigo);
            CREATE INDEX IF NOT EXISTS idx_crac_repuestos_cat    ON crac_repuestos(cat_prefijo);
            CREATE INDEX IF NOT EXISTS idx_crac_repuestos_marca  ON crac_repuestos(marca_prefijo);
        """)

        cols_motores = {r[1] for r in conn.execute("PRAGMA table_info(motores)")}
        if "diametro" not in cols_motores:
            conn.execute("ALTER TABLE motores ADD COLUMN diametro REAL")

        cols_presupuestos = {r[1] for r in conn.execute("PRAGMA table_info(presupuestos)")}
        if "ajuste_pct" not in cols_presupuestos:
            conn.execute("ALTER TABLE presupuestos ADD COLUMN ajuste_pct REAL DEFAULT 0")

        cols_items = {r[1] for r in conn.execute("PRAGMA table_info(presupuesto_items)")}
        if "descripcion_custom" not in cols_items:
            conn.execute("ALTER TABLE presupuesto_items ADD COLUMN descripcion_custom TEXT")
        if "tipo" not in cols_items:
            conn.execute("ALTER TABLE presupuesto_items ADD COLUMN tipo TEXT NOT NULL DEFAULT 'servicio'")
            conn.execute("ALTER TABLE presupuesto_items ADD COLUMN repuesto_codigo TEXT")
            conn.execute("ALTER TABLE presupuesto_items ADD COLUMN cantidad REAL NOT NULL DEFAULT 1")
            conn.execute("ALTER TABLE presupuesto_items ADD COLUMN precio_unitario REAL")
            conn.execute("ALTER TABLE presupuesto_items ADD COLUMN stock_al_cotizar INTEGER")
        if "categoria" not in cols_items:
            conn.execute("ALTER TABLE presupuesto_items ADD COLUMN categoria TEXT")

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
    ajuste_pct: float = 0,
) -> int:
    """
    Crea (o reutiliza) el cliente, inserta el presupuesto y sus ítems.
    items: list of {servicio_id, descripcion_custom, precio_aplicado,
                    tipo, repuesto_codigo, cantidad, precio_unitario, stock_al_cotizar,
                    categoria}
    (servicio_id es None para ítems custom; los campos de repuesto son opcionales
    y solo vienen en ítems con tipo='repuesto')
    ajuste_pct: % de aumento/descuento sobre mano de obra usado al cotizar (ya
    aplicado en los precios de `items`); se guarda solo para mostrarlo de nuevo
    la próxima vez que se abra a editar.
    Retorna el id del presupuesto creado.
    """
    total = sum((i.get("precio_aplicado") or 0.0) for i in items)
    nombre_normalizado = formato_nombre_titulo(cliente_nombre.strip())

    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, nombre FROM clientes WHERE nombre = ? COLLATE NOCASE",
            (nombre_normalizado,),
        ).fetchone()

        if row:
            cliente_id = row[0]
            # Prolija oportunistamente nombres viejos guardados antes de esta
            # normalización (ej. todo en minúscula).
            if row[1] != nombre_normalizado:
                conn.execute("UPDATE clientes SET nombre = ? WHERE id = ?", (nombre_normalizado, cliente_id))
        else:
            cur = conn.execute(
                "INSERT INTO clientes (nombre) VALUES (?)",
                (nombre_normalizado,),
            )
            cliente_id = cur.lastrowid

        cur = conn.execute(
            "INSERT INTO presupuestos (cliente_id, motor_id, fecha, total, ajuste_pct) VALUES (?, ?, ?, ?, ?)",
            (cliente_id, motor_id, date.today().isoformat(), total, ajuste_pct or 0),
        )
        presupuesto_id = cur.lastrowid

        for item in items:
            conn.execute(
                """
                INSERT INTO presupuesto_items
                    (presupuesto_id, servicio_id, descripcion_custom, precio_aplicado,
                     tipo, repuesto_codigo, cantidad, precio_unitario, stock_al_cotizar,
                     categoria)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    presupuesto_id,
                    item.get("servicio_id"),
                    item.get("descripcion_custom"),
                    item.get("precio_aplicado"),
                    item.get("tipo") or "servicio",
                    item.get("repuesto_codigo"),
                    item.get("cantidad") or 1,
                    item.get("precio_unitario"),
                    item.get("stock_al_cotizar"),
                    item.get("categoria"),
                ),
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


def buscar_presupuestos(
    repuesto: str | None = None,
    motor: str | None = None,
    desde: str | None = None,
    hasta: str | None = None,
) -> list[dict]:
    """
    Busca presupuestos por repuesto usado (contra descripción, categoría y
    código congelados, no el catálogo vigente), por nombre de motor y/o por
    rango de fechas de emisión (fecha ISO 'YYYY-MM-DD', inclusive en ambas
    puntas). Cualquier combinación de filtros es válida; sin ninguno, es
    equivalente a get_presupuestos(). DISTINCT porque el join con
    presupuesto_items puede traer más de una fila por presupuesto si tiene
    varios repuestos que matchean el filtro.
    """
    query = """
        SELECT DISTINCT p.id, p.fecha, c.nombre, m.motor, p.total, p.pdf_path
        FROM presupuestos p
        LEFT JOIN clientes c ON c.id = p.cliente_id
        LEFT JOIN motores  m ON m.id = p.motor_id
    """
    where: list[str] = []
    params: list = []

    if repuesto:
        query += " JOIN presupuesto_items pi ON pi.presupuesto_id = p.id AND pi.tipo = 'repuesto'"
        term = f"%{repuesto}%"
        where.append("(pi.descripcion_custom LIKE ? OR pi.categoria LIKE ? OR pi.repuesto_codigo LIKE ?)")
        params.extend([term, term, term])
    if motor:
        where.append("m.motor LIKE ?")
        params.append(f"%{motor}%")
    if desde:
        where.append("p.fecha >= ?")
        params.append(desde)
    if hasta:
        where.append("p.fecha <= ?")
        params.append(hasta)

    if where:
        query += " WHERE " + " AND ".join(where)
    query += " ORDER BY p.fecha DESC, p.id DESC"

    with get_connection() as conn:
        cur = conn.execute(query, params)
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


def get_cliente(cliente_id: int) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, nombre, notas FROM clientes WHERE id = ?",
            (cliente_id,),
        ).fetchone()
        if not row:
            return None
        return {"id": row[0], "nombre": row[1], "notas": row[2]}


def actualizar_cliente(cliente_id: int, nombre: str, notas: str | None) -> bool:
    """Renombra un cliente y/o actualiza su descripción interna (notas). No
    fusiona con otro cliente si el nuevo nombre coincide con uno existente —
    caso borde que se deja para una limpieza manual futura."""
    with get_connection() as conn:
        cur = conn.execute(
            "UPDATE clientes SET nombre = ?, notas = ? WHERE id = ?",
            (nombre.strip(), (notas or "").strip() or None, cliente_id),
        )
        return cur.rowcount > 0


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
            SELECT p.id, p.fecha, p.total, p.notas, p.ajuste_pct,
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
        cols = ["id", "fecha", "total", "notas", "ajuste_pct",
                "cliente_id", "cliente", "motor_id", "motor", "lista_num"]
        return dict(zip(cols, row))


def get_presupuesto_items_full(presupuesto_id: int) -> list[dict]:
    # precio_actual/stock_actual: valores vigentes en el catálogo del proveedor
    # (por código, con subqueries para no duplicar filas si el CSV trae un código
    # repetido). NULL cuando el código ya no está en la lista → "fuera de lista".
    with get_connection() as conn:
        cur = conn.execute(
            """
            SELECT pi.id, pi.servicio_id, s.item_num,
                   s.descripcion AS desc_facra, pi.descripcion_custom,
                   pi.precio_aplicado,
                   pi.tipo, pi.repuesto_codigo, pi.cantidad,
                   pi.precio_unitario, pi.stock_al_cotizar, pi.categoria,
                   (SELECT cr.precio FROM crac_repuestos cr
                     WHERE cr.codigo = pi.repuesto_codigo LIMIT 1) AS precio_actual,
                   (SELECT cr.stock FROM crac_repuestos cr
                     WHERE cr.codigo = pi.repuesto_codigo LIMIT 1) AS stock_actual
            FROM presupuesto_items pi
            LEFT JOIN servicios s ON s.id = pi.servicio_id
            WHERE pi.presupuesto_id = ?
            ORDER BY CASE WHEN pi.tipo = 'repuesto' THEN 1 ELSE 0 END,
                     CASE WHEN s.item_num IS NULL THEN 9999 ELSE s.item_num END,
                     pi.id
            """,
            (presupuesto_id,),
        )
        cols = ["id", "servicio_id", "item_num", "desc_facra",
                "descripcion_custom", "precio_aplicado",
                "tipo", "repuesto_codigo", "cantidad",
                "precio_unitario", "stock_al_cotizar", "categoria",
                "precio_actual", "stock_actual"]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def actualizar_presupuesto(
    presupuesto_id: int,
    items_data: list[dict],
    notas: str,
    ajuste_pct: float = 0,
) -> float:
    """
    items_data: [{servicio_id, descripcion_custom, precio_aplicado,
                  tipo, repuesto_codigo, cantidad, precio_unitario, stock_al_cotizar,
                  categoria}]
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
                    (presupuesto_id, servicio_id, descripcion_custom, precio_aplicado,
                     tipo, repuesto_codigo, cantidad, precio_unitario, stock_al_cotizar,
                     categoria)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    presupuesto_id,
                    item.get("servicio_id"),
                    item.get("descripcion_custom"),
                    item.get("precio_aplicado"),
                    item.get("tipo") or "servicio",
                    item.get("repuesto_codigo"),
                    item.get("cantidad") or 1,
                    item.get("precio_unitario"),
                    item.get("stock_al_cotizar"),
                    item.get("categoria"),
                ),
            )
        conn.execute(
            "UPDATE presupuestos SET total = ?, notas = ?, ajuste_pct = ? WHERE id = ?",
            (total, notas.strip() if notas else None, ajuste_pct or 0, presupuesto_id),
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


def get_repuestos_sugeridos_motor(motor_id: int, incluir_ocultos: bool = False) -> list[dict]:
    """
    Repuestos usados en presupuestos anteriores del mismo motor, con el precio
    y stock vigentes en el catálogo del proveedor. Derivado del historial: no
    hay tabla de asociación motor-repuesto, la asociación nace de haberlos
    cotizado juntos alguna vez.

    Los ocultados a mano (repuestos_ocultos_motor) se excluyen por defecto —
    ocultar es un solo criterio compartido por todas las pantallas (wizard,
    edición de presupuesto y el detalle de motor en "Listado de Motores"), no
    algo separado por pantalla. incluir_ocultos=True devuelve todo (con el
    campo `oculto`) y es solo para la pantalla que necesita poder revertirlo.
    """
    with get_connection() as conn:
        cur = conn.execute(
            """
            SELECT pi.repuesto_codigo               AS codigo,
                   MAX(pi.descripcion_custom)       AS descripcion,
                   MAX(pi.categoria)                AS categoria,
                   COUNT(*)                         AS veces_usado,
                   MAX(p.fecha)                     AS ultima_fecha,
                   (SELECT cr.precio FROM crac_repuestos cr
                     WHERE cr.codigo = pi.repuesto_codigo LIMIT 1) AS precio_actual,
                   (SELECT cr.stock FROM crac_repuestos cr
                     WHERE cr.codigo = pi.repuesto_codigo LIMIT 1) AS stock_actual,
                   EXISTS(
                     SELECT 1 FROM repuestos_ocultos_motor rom
                     WHERE rom.motor_id = ? AND rom.repuesto_codigo = pi.repuesto_codigo
                   ) AS oculto
            FROM presupuesto_items pi
            JOIN presupuestos p ON p.id = pi.presupuesto_id
            WHERE p.motor_id = ?
              AND pi.tipo = 'repuesto'
              AND pi.repuesto_codigo IS NOT NULL
            GROUP BY pi.repuesto_codigo
            ORDER BY ultima_fecha DESC, veces_usado DESC
            """,
            (motor_id, motor_id),
        )
        cols = ["codigo", "descripcion", "categoria", "veces_usado", "ultima_fecha",
                "precio_actual", "stock_actual", "oculto"]
        filas = [dict(zip(cols, row)) for row in cur.fetchall()]

    if incluir_ocultos:
        return filas
    return [f for f in filas if not f["oculto"]][:20]


def toggle_repuesto_oculto_motor(motor_id: int, codigo: str) -> bool:
    """Oculta/muestra un repuesto sugerido para un motor. No borra nada del
    historial de presupuestos, solo deja de aparecer como sugerencia. Retorna
    True si quedó oculto, False si quedó visible de nuevo."""
    with get_connection() as conn:
        existe = conn.execute(
            "SELECT 1 FROM repuestos_ocultos_motor WHERE motor_id = ? AND repuesto_codigo = ?",
            (motor_id, codigo),
        ).fetchone()
        if existe:
            conn.execute(
                "DELETE FROM repuestos_ocultos_motor WHERE motor_id = ? AND repuesto_codigo = ?",
                (motor_id, codigo),
            )
            return False
        conn.execute(
            "INSERT INTO repuestos_ocultos_motor (motor_id, repuesto_codigo) VALUES (?, ?)",
            (motor_id, codigo),
        )
        return True


def get_presupuestos_por_motor(motor_id: int) -> list[dict]:
    with get_connection() as conn:
        cur = conn.execute(
            """
            SELECT p.id, p.fecha, c.nombre, m.motor, p.total, p.pdf_path
            FROM presupuestos p
            LEFT JOIN clientes c ON c.id = p.cliente_id
            LEFT JOIN motores  m ON m.id = p.motor_id
            WHERE p.motor_id = ?
            ORDER BY p.fecha DESC, p.id DESC
            """,
            (motor_id,),
        )
        cols = ["id", "fecha", "cliente", "motor", "total", "pdf_path"]
        return [dict(zip(cols, row)) for row in cur.fetchall()]
