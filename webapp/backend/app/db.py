"""
Módulo de base de datos SQLite.
Gestiona la conexión y el esquema de la base de datos.
Portado de la app de escritorio (src/data/db.py) sin cambios de esquema ni de lógica,
salvo donde se indica explícitamente (soporte de ítems custom en guardar_presupuesto).
"""
import os
import sqlite3
from datetime import date, datetime

from . import config, texto
from .helpers import formato_nombre_titulo, pesos


def get_connection() -> sqlite3.Connection:
    """Devuelve una conexión a la base de datos. Crea el directorio si no existe."""
    os.makedirs(os.path.dirname(config.DB_PATH), exist_ok=True)
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    # norm(): la misma normalización de búsqueda que usa el frontend (sin
    # acentos, sin mayúsculas). Permite escribir "norm(c.nombre) LIKE ?" en
    # tablas chicas —clientes, motores, presupuestos— sin tener que guardar una
    # columna normalizada aparte. El catálogo del proveedor SÍ la guarda
    # (crac_repuestos.busqueda): son 64.000 filas y se consulta en cada tecla.
    conn.create_function("norm", 1, texto.normalizar, deterministic=True)
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
                notas    TEXT,
                -- 'mecanico' | 'dueno' | NULL (sin clasificar todavía)
                tipo     TEXT
            );

            CREATE TABLE IF NOT EXISTS presupuestos (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                cliente_id INTEGER REFERENCES clientes(id),
                -- Contraparte opcional (si cliente_id es el dueño, acá va el
                -- mecánico que lo trajo, y viceversa). NULL si no se cargó.
                contacto_id INTEGER REFERENCES clientes(id),
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
                categoria         TEXT,     -- categoría congelada al cotizar; es lo único que sale en el PDF
                -- 1 = línea OPCIONAL: está en el presupuesto y sale en el PDF en
                -- su propia caja ("por si hace falta"), pero NO suma al total.
                -- Sirve tanto para mano de obra como para repuestos.
                opcional          INTEGER NOT NULL DEFAULT 0
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

            -- Opciones de un grupo de repuestos dentro de un presupuesto.
            -- Un grupo es una categoría del proveedor (ej. "Cojinetes biela"):
            -- junta lo que se cargó de esa categoría, y su nombre es lo único
            -- que lee el cliente en el PDF.
            --
            -- Desde el 2026-08-18 **todo lo que se carga cotiza**: el sistema ya
            -- no elige por precio, el taller carga lo que va a usar (por eso una
            -- misma categoría puede llevar dos piezas que suman las dos, como
            -- las válvulas de admisión y las de escape).
            --   elegida = 1 → suma al total.
            --   elegida = 0 → opcional: queda guardada y sale en la caja de
            --     opcionales del PDF, pero no se cobra. Es también como quedaron
            --     las "alternativas para el pedido" de los presupuestos
            --     anteriores a ese cambio, que por eso siguen dando el mismo
            --     total que el día que se emitieron.
            --
            -- Cada opción vive TAMBIÉN como fila de presupuesto_items. Es a
            -- propósito: así los totales, el PDF y las búsquedas siguen viendo
            -- una sola tabla. Las dos filas se escriben desde la misma
            -- estructura calculada en _resolver_grupos, así que no divergen.
            CREATE TABLE IF NOT EXISTS presupuesto_item_opciones (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                presupuesto_id   INTEGER NOT NULL REFERENCES presupuestos(id) ON DELETE CASCADE,
                grupo_num        INTEGER NOT NULL,
                repuesto_codigo  TEXT,
                descripcion      TEXT,
                categoria        TEXT,
                marca            TEXT,
                medida           TEXT,
                cantidad         REAL NOT NULL DEFAULT 1,
                precio_unitario  REAL,
                subtotal         REAL,       -- cantidad × unitario, congelado al cotizar
                stock_al_cotizar INTEGER,
                elegida          INTEGER NOT NULL DEFAULT 0,  -- 1 = es la que se cotizó
                -- Quedó de cuando el sistema elegía solo con cuál cotizar y se
                -- podía pisar esa elección a mano. Hoy siempre es 0: no hay nada
                -- que pisar, cotiza todo lo que se carga.
                elegida_a_mano   INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_pio_presupuesto ON presupuesto_item_opciones(presupuesto_id);

            -- Ficha de repuestos del motor: qué grupos y qué opciones sirven para
            -- este motor. A diferencia del presupuesto, la ficha está VIVA: no
            -- congela precio, stock ni descripción, se resuelven contra el catálogo
            -- vigente en cada consulta. Lo único que se persiste de cada opción es
            -- la cantidad, porque esa sí es una decisión del taller (cuántos
            -- blísters hacen falta según cómo venga envasada esa marca).
            CREATE TABLE IF NOT EXISTS motor_repuesto_grupos (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                motor_id    INTEGER NOT NULL REFERENCES motores(id) ON DELETE CASCADE,
                categoria   TEXT NOT NULL,   -- nombre resuelto; es lo que lee el cliente en el PDF
                cat_prefijo TEXT,            -- prefijo del proveedor, para volver al catálogo
                UNIQUE (motor_id, categoria)
            );

            -- cantidad = 0 significa "marcado, sin cantidad": la pieza sirve para
            -- el motor pero todavía no se cotizó nunca, así que el sistema no
            -- inventa un número que el taller no eligió. Hacia afuera (API y
            -- pantallas) ese 0 viaja como `cantidad: null`. Se usa 0 y no NULL
            -- porque la columna nació NOT NULL y en SQLite aflojar eso obliga a
            -- reconstruir la tabla — no vale el riesgo sobre fichas reales.
            -- cantidad_manual = 1 cuando el taller escribió la cantidad a mano:
            -- ahí manda la suya y el recálculo automático no la vuelve a tocar.
            CREATE TABLE IF NOT EXISTS motor_repuesto_opciones (
                grupo_id        INTEGER NOT NULL REFERENCES motor_repuesto_grupos(id) ON DELETE CASCADE,
                repuesto_codigo TEXT NOT NULL,
                cantidad        REAL NOT NULL DEFAULT 1,
                cantidad_manual INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (grupo_id, repuesto_codigo)
            );

            -- Papelera de la ficha: todo lo que sale de motor_repuesto_opciones
            -- cae acá en vez de desaparecer. Borrar un repuesto del motor es la
            -- operación más fácil de hacer sin querer (el tacho de una familia se
            -- lleva cuatro medidas de un click), y sin este registro no habría
            -- forma de saber qué había antes: la ficha no guarda historial.
            -- Se llena sola desde guardar_ficha_motor, que es por donde pasan
            -- todos los cambios de ficha. Volver a agregar un código lo saca de
            -- acá: si está en la ficha, no está eliminado.
            CREATE TABLE IF NOT EXISTS motor_repuestos_papelera (
                motor_id        INTEGER NOT NULL REFERENCES motores(id) ON DELETE CASCADE,
                repuesto_codigo TEXT NOT NULL,
                categoria       TEXT NOT NULL,   -- la que tenía en la ficha, para poder restaurarlo a su grupo
                cat_prefijo     TEXT,
                cantidad        REAL NOT NULL DEFAULT 1,
                eliminado_en    TEXT NOT NULL,
                PRIMARY KEY (motor_id, repuesto_codigo)
            );

            -- Pares clave/valor de la instalación. Hoy guarda cuándo se importó por
            -- última vez el catálogo del proveedor, para poder avisar en pantalla
            -- que los precios "de hoy" son en realidad los de la última carga.
            CREATE TABLE IF NOT EXISTS app_meta (
                clave TEXT PRIMARY KEY,
                valor TEXT
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
                resto         TEXT,
                -- Medida del código (STD, 025, 050…) y el código sin ella. Dos
                -- códigos con el mismo base_codigo son la misma pieza en distintas
                -- medidas, que es como se agregan solas al armar un grupo.
                medida        TEXT,
                base_codigo   TEXT,
                -- Descripción normalizada (sin acentos ni mayúsculas) para
                -- buscar por palabras sueltas y en cualquier orden. Se llena al
                -- importar (crac.importar_precio_stock) con texto.normalizar.
                busqueda      TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_crac_repuestos_codigo ON crac_repuestos(codigo);
            CREATE INDEX IF NOT EXISTS idx_crac_repuestos_cat    ON crac_repuestos(cat_prefijo);
            CREATE INDEX IF NOT EXISTS idx_crac_repuestos_marca  ON crac_repuestos(marca_prefijo);
        """)
        # El índice de base_codigo NO va en el script de arriba: sobre una DB
        # vieja, el CREATE TABLE IF NOT EXISTS no agrega la columna (la tabla ya
        # existe) y el índice fallaría antes de llegar al ALTER de más abajo.

        cols_motores = {r[1] for r in conn.execute("PRAGMA table_info(motores)")}
        if "diametro" not in cols_motores:
            conn.execute("ALTER TABLE motores ADD COLUMN diametro REAL")

        cols_presupuestos = {r[1] for r in conn.execute("PRAGMA table_info(presupuestos)")}
        if "ajuste_pct" not in cols_presupuestos:
            conn.execute("ALTER TABLE presupuestos ADD COLUMN ajuste_pct REAL DEFAULT 0")
        if "contacto_id" not in cols_presupuestos:
            conn.execute("ALTER TABLE presupuestos ADD COLUMN contacto_id INTEGER REFERENCES clientes(id)")
        if "aprobado_en" not in cols_presupuestos:
            # Fecha en que el cliente aprobó el presupuesto. NULL = todavía no.
            # Sirve de flag y de fecha a la vez, así no hacen falta dos columnas.
            conn.execute("ALTER TABLE presupuestos ADD COLUMN aprobado_en TEXT")

        cols_clientes = {r[1] for r in conn.execute("PRAGMA table_info(clientes)")}
        if "tipo" not in cols_clientes:
            conn.execute("ALTER TABLE clientes ADD COLUMN tipo TEXT")

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
        if "grupo_num" not in cols_items:
            # Liga la línea cotizada con su grupo de opciones. NULL = repuesto
            # suelto o servicio, o sea el comportamiento de siempre.
            conn.execute("ALTER TABLE presupuesto_items ADD COLUMN grupo_num INTEGER")
        if "opcional" not in cols_items:
            # Migración aditiva con default 0: todo lo ya emitido sigue sumando
            # exactamente lo mismo que antes.
            conn.execute(
                "ALTER TABLE presupuesto_items ADD COLUMN opcional INTEGER NOT NULL DEFAULT 0"
            )

        cols_ficha = {r[1] for r in conn.execute("PRAGMA table_info(motor_repuesto_opciones)")}
        if "cantidad_manual" not in cols_ficha:
            conn.execute(
                "ALTER TABLE motor_repuesto_opciones ADD COLUMN cantidad_manual INTEGER NOT NULL DEFAULT 0"
            )

        cols_crac = {r[1] for r in conn.execute("PRAGMA table_info(crac_repuestos)")}
        hay_catalogo = None
        if "medida" not in cols_crac:
            conn.execute("ALTER TABLE crac_repuestos ADD COLUMN medida TEXT")
            conn.execute("ALTER TABLE crac_repuestos ADD COLUMN base_codigo TEXT")
            hay_catalogo = conn.execute("SELECT 1 FROM crac_repuestos LIMIT 1").fetchone()
        if "busqueda" not in cols_crac:
            conn.execute("ALTER TABLE crac_repuestos ADD COLUMN busqueda TEXT")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_crac_repuestos_base ON crac_repuestos(base_codigo)")

        # Catálogo cargado antes de que existiera la columna normalizada: se
        # llena acá para no obligar a reimportar el CSV. Es un UPDATE sobre
        # ~64.000 filas, pero corre UNA sola vez (después ya no hay NULLs).
        falta_busqueda = conn.execute(
            "SELECT 1 FROM crac_repuestos WHERE busqueda IS NULL LIMIT 1"
        ).fetchone()
        if falta_busqueda:
            filas = conn.execute(
                "SELECT id, aplicacion FROM crac_repuestos WHERE busqueda IS NULL"
            ).fetchall()
            conn.executemany(
                "UPDATE crac_repuestos SET busqueda = ? WHERE id = ?",
                [(texto.normalizar(f[1]), f[0]) for f in filas],
            )

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

    # Catálogo importado antes de que existieran medida/base_codigo: se calculan
    # ahora, para que las medidas funcionen sin tener que volver a cargar el CSV.
    # Fuera del `with` porque recalcular_medidas abre su propia conexión, y el
    # import es local para no crear un ciclo (crac importa de este módulo).
    if hay_catalogo:
        from . import crac
        crac.recalcular_medidas()


_TIPO_OPUESTO = {"mecanico": "dueno", "dueno": "mecanico"}


def _resolver_cliente(conn: sqlite3.Connection, nombre: str, tipo: str | None) -> int:
    """Busca un cliente por nombre exacto (case-insensitive) o lo crea. Si ya
    existe pero todavía no tiene `tipo` clasificado y se pasa uno, lo clasifica
    ahora (nunca pisa un tipo ya asignado)."""
    nombre_normalizado = formato_nombre_titulo(nombre.strip())
    row = conn.execute(
        "SELECT id, nombre, tipo FROM clientes WHERE nombre = ? COLLATE NOCASE",
        (nombre_normalizado,),
    ).fetchone()

    if row:
        cliente_id = row[0]
        # Prolija oportunistamente nombres viejos guardados antes de esta
        # normalización (ej. todo en minúscula).
        if row[1] != nombre_normalizado:
            conn.execute("UPDATE clientes SET nombre = ? WHERE id = ?", (nombre_normalizado, cliente_id))
        if tipo and not row[2]:
            conn.execute("UPDATE clientes SET tipo = ? WHERE id = ?", (tipo, cliente_id))
        return cliente_id

    cur = conn.execute(
        "INSERT INTO clientes (nombre, tipo) VALUES (?, ?)",
        (nombre_normalizado, tipo),
    )
    return cur.lastrowid


def total_de_items(items: list[dict]) -> float:
    """
    Total del presupuesto: la suma de los subtotales, SIN las líneas opcionales.
    Una línea opcional ("por si hace falta": la bomba de aceite que capaz no se
    cambia) queda guardada, sale en el PDF en su propia caja y con su precio,
    pero no se cobra hasta que se decida hacerla — por eso no entra acá.
    """
    return sum((i.get("precio_aplicado") or 0.0) for i in items if not i.get("opcional"))


_COLS_ITEM = (
    "presupuesto_id, servicio_id, descripcion_custom, precio_aplicado, "
    "tipo, repuesto_codigo, cantidad, precio_unitario, stock_al_cotizar, "
    "categoria, grupo_num, opcional"
)


def _insertar_item(conn: sqlite3.Connection, presupuesto_id: int, item: dict) -> None:
    """Inserta una línea de presupuesto. Usado tanto al crear como al editar,
    para que las dos rutas no se desincronicen cuando se agrega una columna."""
    conn.execute(
        f"INSERT INTO presupuesto_items ({_COLS_ITEM}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
            item.get("grupo_num"),
            1 if item.get("opcional") else 0,
        ),
    )


def _insertar_opciones(conn: sqlite3.Connection, presupuesto_id: int, opciones: list[dict]) -> None:
    """Guarda las opciones de todos los grupos del presupuesto (incluida la
    elegida, que además va como línea en presupuesto_items)."""
    for op in opciones or []:
        conn.execute(
            """
            INSERT INTO presupuesto_item_opciones
                (presupuesto_id, grupo_num, repuesto_codigo, descripcion, categoria,
                 marca, medida, cantidad, precio_unitario, subtotal, stock_al_cotizar,
                 elegida, elegida_a_mano)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                presupuesto_id,
                op.get("grupo_num"),
                op.get("repuesto_codigo"),
                op.get("descripcion"),
                op.get("categoria"),
                op.get("marca"),
                op.get("medida"),
                op.get("cantidad") or 1,
                op.get("precio_unitario"),
                op.get("subtotal"),
                op.get("stock_al_cotizar"),
                1 if op.get("elegida") else 0,
                1 if op.get("elegida_a_mano") else 0,
            ),
        )


def guardar_presupuesto(
    cliente_nombre: str,
    motor_id: int,
    items: list[dict],
    ajuste_pct: float = 0,
    cliente_tipo: str | None = None,
    contacto_nombre: str | None = None,
    opciones: list[dict] | None = None,
) -> int:
    """
    Crea (o reutiliza) el cliente, inserta el presupuesto y sus ítems.
    items: list of {servicio_id, descripcion_custom, precio_aplicado,
                    tipo, repuesto_codigo, cantidad, precio_unitario, stock_al_cotizar,
                    categoria, grupo_num}
    opciones: las opciones de cada grupo de repuestos (ver presupuesto_item_opciones).
    Cada opción viene además como línea en `items`; las opcionales van con
    opcional=1 y no suman al total (ver total_de_items).
    (servicio_id es None para ítems custom; los campos de repuesto son opcionales
    y solo vienen en ítems con tipo='repuesto')
    ajuste_pct: % de aumento/descuento sobre mano de obra usado al cotizar (ya
    aplicado en los precios de `items`); se guarda solo para mostrarlo de nuevo
    la próxima vez que se abra a editar.
    cliente_tipo: 'mecanico' | 'dueno' | None — clasificación del cliente
    principal (solo se usa si el cliente es nuevo o todavía no tiene tipo).
    contacto_nombre: nombre opcional de la contraparte (el mecánico si el
    cliente es el dueño, o viceversa); se resuelve como otro cliente, con el
    tipo inverso al del cliente principal.
    Retorna el id del presupuesto creado.
    """
    total = total_de_items(items)

    with get_connection() as conn:
        cliente_id = _resolver_cliente(conn, cliente_nombre, cliente_tipo)

        contacto_id = None
        if contacto_nombre and contacto_nombre.strip():
            tipo_principal = cliente_tipo
            if not tipo_principal:
                row_tipo = conn.execute("SELECT tipo FROM clientes WHERE id = ?", (cliente_id,)).fetchone()
                tipo_principal = row_tipo[0] if row_tipo else None
            tipo_contraparte = _TIPO_OPUESTO.get(tipo_principal)
            contacto_id = _resolver_cliente(conn, contacto_nombre, tipo_contraparte)

        cur = conn.execute(
            "INSERT INTO presupuestos (cliente_id, contacto_id, motor_id, fecha, total, ajuste_pct) VALUES (?, ?, ?, ?, ?, ?)",
            (cliente_id, contacto_id, motor_id, date.today().isoformat(), total, ajuste_pct or 0),
        )
        presupuesto_id = cur.lastrowid

        for item in items:
            _insertar_item(conn, presupuesto_id, item)
        _insertar_opciones(conn, presupuesto_id, opciones)

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
            SELECT p.id, p.fecha, c.nombre, m.motor, p.total, p.pdf_path, c.tipo AS cliente_tipo,
                   p.aprobado_en
            FROM presupuestos p
            LEFT JOIN clientes  c ON c.id = p.cliente_id
            LEFT JOIN motores   m ON m.id = p.motor_id
            ORDER BY p.fecha DESC, p.id DESC
            """
        )
        cols = ["id", "fecha", "cliente", "motor", "total", "pdf_path", "cliente_tipo", "aprobado_en"]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def buscar_presupuestos(
    repuesto: str | None = None,
    motor: str | None = None,
    cliente: str | None = None,
    desde: str | None = None,
    hasta: str | None = None,
) -> list[dict]:
    """
    Busca presupuestos por repuesto usado (contra descripción, categoría y
    código congelados, no el catálogo vigente), por nombre de motor, por
    cliente (nombre o descripción interna) y/o por rango de fechas de emisión
    (fecha ISO 'YYYY-MM-DD', inclusive en ambas puntas). Cualquier combinación
    de filtros es válida; sin ninguno, es equivalente a get_presupuestos().
    DISTINCT porque el join con presupuesto_items puede traer más de una fila
    por presupuesto si tiene varios repuestos que matchean el filtro.
    """
    query = """
        SELECT DISTINCT p.id, p.fecha, c.nombre, m.motor, p.total, p.pdf_path, c.tipo AS cliente_tipo,
               p.aprobado_en
        FROM presupuestos p
        LEFT JOIN clientes c ON c.id = p.cliente_id
        LEFT JOIN motores  m ON m.id = p.motor_id
    """
    where: list[str] = []
    params: list = []

    # Los tres buscadores de texto van por palabras sueltas y sin acentos (ver
    # texto.condicion_like): "valvula admision" encuentra "VÁLVULA DE ADMISIÓN".
    if repuesto:
        query += " JOIN presupuesto_items pi ON pi.presupuesto_id = p.id AND pi.tipo = 'repuesto'"
        cond, ps = texto.condicion_like(
            ["norm(pi.descripcion_custom)", "norm(pi.categoria)", "norm(pi.repuesto_codigo)"], repuesto
        )
        if cond:
            where.append(f"({cond})")
            params.extend(ps)
    if motor:
        cond, ps = texto.condicion_like(["norm(m.motor)"], motor)
        if cond:
            where.append(f"({cond})")
            params.extend(ps)
    if cliente:
        cond, ps = texto.condicion_like(["norm(c.nombre)", "norm(c.notas)"], cliente)
        if cond:
            where.append(f"({cond})")
            params.extend(ps)
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
        cols = ["id", "fecha", "cliente", "motor", "total", "pdf_path", "cliente_tipo", "aprobado_en"]
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
    # notas (descripción interna) viaja acá para que el buscador de la pantalla
    # Clientes pueda indexarla del lado del cliente, sin pedir cada cliente
    # por separado. total_presupuestos/ultimo_presupuesto cuentan tanto los
    # presupuestos donde este cliente es el principal como aquellos donde
    # aparece solo como contraparte (ej. un mecánico que trae autos ajenos).
    with get_connection() as conn:
        cur = conn.execute(
            """
            SELECT c.id, c.nombre, c.notas, c.tipo,
                   COUNT(DISTINCT p.id) AS total_presupuestos,
                   MAX(p.fecha)         AS ultimo_presupuesto
            FROM clientes c
            LEFT JOIN presupuestos p ON p.cliente_id = c.id OR p.contacto_id = c.id
            GROUP BY c.id
            ORDER BY c.nombre COLLATE NOCASE
            """
        )
        cols = ["id", "nombre", "notas", "tipo", "total_presupuestos", "ultimo_presupuesto"]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def get_cliente(cliente_id: int) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, nombre, notas, tipo FROM clientes WHERE id = ?",
            (cliente_id,),
        ).fetchone()
        if not row:
            return None
        return {"id": row[0], "nombre": row[1], "notas": row[2], "tipo": row[3]}


def actualizar_cliente(cliente_id: int, nombre: str, notas: str | None, tipo: str | None = None) -> bool:
    """Renombra un cliente y/o actualiza su descripción interna (notas) y su
    tipo (mecánico/dueño). No fusiona con otro cliente si el nuevo nombre
    coincide con uno existente — caso borde que se deja para una limpieza
    manual futura."""
    with get_connection() as conn:
        cur = conn.execute(
            "UPDATE clientes SET nombre = ?, notas = ?, tipo = ? WHERE id = ?",
            (nombre.strip(), (notas or "").strip() or None, tipo, cliente_id),
        )
        return cur.rowcount > 0


def contar_presupuestos_cliente(cliente_id: int) -> int:
    """Presupuestos en los que aparece este cliente, sea como principal o como
    contraparte (el mecánico que trajo el auto de un dueño). Los dos casos
    cuentan: si se borrara el cliente, ese presupuesto quedaría con un nombre
    menos."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT COUNT(*) FROM presupuestos WHERE cliente_id = ? OR contacto_id = ?",
            (cliente_id, cliente_id),
        ).fetchone()
        return row[0]


def eliminar_cliente(cliente_id: int) -> str:
    """Borra un cliente que no tenga ningún presupuesto asociado.
    Devuelve 'ok' | 'no_existe' | 'tiene_presupuestos'.

    El borrado se bloquea a propósito en vez de arrastrar los presupuestos: un
    presupuesto es plata cotizada y su PDF ya está en manos del cliente, así que
    no se pierde de rebote por borrar una ficha. Primero se borran los
    presupuestos (uno por uno, desde el detalle) y recién después el cliente."""
    with get_connection() as conn:
        if not conn.execute("SELECT 1 FROM clientes WHERE id = ?", (cliente_id,)).fetchone():
            return "no_existe"
        usado = conn.execute(
            "SELECT COUNT(*) FROM presupuestos WHERE cliente_id = ? OR contacto_id = ?",
            (cliente_id, cliente_id),
        ).fetchone()[0]
        if usado:
            return "tiene_presupuestos"
        conn.execute("DELETE FROM clientes WHERE id = ?", (cliente_id,))
        return "ok"


def get_presupuestos_por_cliente(cliente_id: int) -> list[dict]:
    # Incluye tanto los presupuestos donde este cliente es el principal como
    # aquellos donde aparece solo como contraparte; en ese caso "cliente"
    # muestra el nombre de la otra persona y "rol" indica que este cliente fue
    # la contraparte (útil en la ficha de un mecánico: qué dueños representó).
    with get_connection() as conn:
        cur = conn.execute(
            """
            SELECT p.id, p.fecha,
                   CASE WHEN p.cliente_id = ? THEN ct.nombre ELSE c.nombre END AS cliente,
                   CASE WHEN p.cliente_id = ? THEN 'cliente' ELSE 'contacto' END AS rol,
                   m.motor, p.total, p.pdf_path
            FROM presupuestos p
            LEFT JOIN clientes c  ON c.id = p.cliente_id
            LEFT JOIN clientes ct ON ct.id = p.contacto_id
            LEFT JOIN motores  m  ON m.id = p.motor_id
            WHERE p.cliente_id = ? OR p.contacto_id = ?
            ORDER BY p.fecha DESC, p.id DESC
            """,
            (cliente_id, cliente_id, cliente_id, cliente_id),
        )
        cols = ["id", "fecha", "cliente", "rol", "motor", "total", "pdf_path"]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


# ─── Detalle de presupuesto ───────────────────────────────────────────────────

def get_presupuesto_detalle(presupuesto_id: int) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT p.id, p.fecha, p.total, p.notas, p.ajuste_pct, p.aprobado_en,
                   c.id AS cliente_id, c.nombre AS cliente, c.tipo AS cliente_tipo,
                   ct.nombre AS contacto,
                   m.id AS motor_id,   m.motor,  m.lista_num, m.cilindros
            FROM presupuestos p
            LEFT JOIN clientes c  ON c.id = p.cliente_id
            LEFT JOIN clientes ct ON ct.id = p.contacto_id
            LEFT JOIN motores  m  ON m.id = p.motor_id
            WHERE p.id = ?
            """,
            (presupuesto_id,),
        ).fetchone()
        if not row:
            return None
        cols = ["id", "fecha", "total", "notas", "ajuste_pct", "aprobado_en",
                "cliente_id", "cliente", "cliente_tipo", "contacto",
                "motor_id", "motor", "lista_num", "cilindros"]
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
                   pi.precio_unitario, pi.stock_al_cotizar, pi.categoria, pi.grupo_num,
                   pi.opcional,
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
                "precio_unitario", "stock_al_cotizar", "categoria", "grupo_num",
                "opcional", "precio_actual", "stock_actual"]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def actualizar_presupuesto(
    presupuesto_id: int,
    items_data: list[dict],
    notas: str,
    ajuste_pct: float = 0,
    opciones: list[dict] | None = None,
) -> float:
    """
    items_data: [{servicio_id, descripcion_custom, precio_aplicado,
                  tipo, repuesto_codigo, cantidad, precio_unitario, stock_al_cotizar,
                  categoria, grupo_num}]
    opciones: alternativas de los grupos de repuestos (reemplazan a las anteriores).
    Elimina los ítems anteriores y los reinserta. Retorna el nuevo total.
    """
    total = total_de_items(items_data)
    with get_connection() as conn:
        conn.execute(
            "DELETE FROM presupuesto_items WHERE presupuesto_id = ?",
            (presupuesto_id,),
        )
        conn.execute(
            "DELETE FROM presupuesto_item_opciones WHERE presupuesto_id = ?",
            (presupuesto_id,),
        )
        for item in items_data:
            _insertar_item(conn, presupuesto_id, item)
        _insertar_opciones(conn, presupuesto_id, opciones)
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
        conn.execute("DELETE FROM presupuesto_item_opciones WHERE presupuesto_id = ?", (presupuesto_id,))
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


# ─── Ficha de repuestos del motor ─────────────────────────────────────────────
# Reemplaza a las viejas "sugerencias" deducidas del historial de presupuestos.
# Acá la asociación motor→repuesto es explícita: el taller decide qué piezas
# sirven para el motor, agrupadas por categoría del proveedor. La ficha está
# viva — precio, stock, descripción, marca y medida se resuelven contra el
# catálogo vigente en cada consulta — y lo único propio que guarda de cada
# opción es la cantidad (cuántos envases hacen falta, que cambia según cómo
# venga envasada esa marca).

def get_uso_repuestos_motor(motor_id: int) -> dict[str, dict]:
    """
    Cuántos presupuestos de este motor llevaron cada repuesto, cuándo fue la
    última vez, y con qué cantidad. Sale de las opciones congeladas de los
    presupuestos — el registro de lo que el taller usó de verdad, no de lo que
    quedó anotado en la ficha.

    Por código: {usado_en, ultima_vez, cantidad}. La `cantidad` es **la que más
    se repite** entre los presupuestos (uno con ×1 y dos con ×2 → 2); si empatan,
    gana la del presupuesto más reciente. Es la que el motor recuerda para la
    próxima vez.
    """
    with get_connection() as conn:
        filas = conn.execute(
            """
            SELECT o.repuesto_codigo, o.cantidad, p.fecha, p.id
            FROM presupuesto_item_opciones o
            JOIN presupuestos p ON p.id = o.presupuesto_id
            WHERE p.motor_id = ?
              AND o.repuesto_codigo IS NOT NULL
              AND o.cantidad > 0
            ORDER BY p.fecha, p.id
            """,
            (motor_id,),
        ).fetchall()

    uso: dict[str, dict] = {}
    vistos: set[tuple[str, int]] = set()
    for orden, (codigo, cantidad, fecha, presupuesto_id) in enumerate(filas):
        # Un mismo código podría aparecer en dos grupos del mismo presupuesto;
        # para "usado en N presupuestos" cuenta una sola vez.
        if (codigo, presupuesto_id) in vistos:
            continue
        vistos.add((codigo, presupuesto_id))
        info = uso.setdefault(codigo, {"usado_en": 0, "ultima_vez": None, "_cantidades": {}})
        info["usado_en"] += 1
        if fecha:
            info["ultima_vez"] = fecha
        # Las filas vienen de la más vieja a la más nueva, así que `orden` guarda
        # cuál fue la última vez que se usó cada cantidad: eso desempata solo.
        conteo = info["_cantidades"].setdefault(cantidad, {"veces": 0, "ultimo": orden})
        conteo["veces"] += 1
        conteo["ultimo"] = orden

    for info in uso.values():
        cantidades = info.pop("_cantidades")
        info["cantidad"] = max(
            cantidades.items(), key=lambda kv: (kv[1]["veces"], kv[1]["ultimo"])
        )[0]
    return uso


def _orden_por_uso(opciones: list[dict]) -> list[dict]:
    """
    Ordena las opciones de un grupo de la más usada a la menos, **moviendo la
    familia de medidas entera**: las medidas de un mismo repuesto (STD/025/050…)
    nunca se separan, porque en pantalla van dentro de la misma línea vertical.
    Lo que nunca se usó queda al final, ordenado por marca.
    """
    familias: dict[str, list[dict]] = {}
    orden: list[str] = []
    for o in opciones:
        base = o.get("base_codigo") or o["codigo"]
        if base not in familias:
            familias[base] = []
            orden.append(base)
        familias[base].append(o)

    def dias(iso: str | None) -> int:
        if not iso:
            return 0
        try:
            return date.fromisoformat(iso[:10]).toordinal()
        except ValueError:
            return 0

    def clave(base: str):
        grupo = familias[base]
        return (
            -max(o.get("usado_en") or 0 for o in grupo),
            -max(dias(o.get("ultima_vez")) for o in grupo),
            (grupo[0].get("marca") or "").lower(),
        )

    salida = []
    for base in sorted(orden, key=clave):
        salida.extend(sorted(familias[base], key=lambda o: (o.get("medida") or "")))
    return salida


def get_ficha_motor(motor_id: int) -> list[dict]:
    """
    Grupos de repuestos del motor con sus opciones resueltas contra el catálogo
    de hoy. La ficha no decide nada: es la lista de qué piezas sirven para este
    motor, y cuál entra en un presupuesto lo elige el taller al armarlo.

    `cantidad` en null = marcado sin cantidad (la pieza sirve para el motor pero
    todavía no se cotizó nunca). Adentro se guarda como 0 — ver el comentario del
    esquema en init_db.
    """
    uso = get_uso_repuestos_motor(motor_id)
    with get_connection() as conn:
        grupos = conn.execute(
            """
            SELECT id, categoria, cat_prefijo
            FROM motor_repuesto_grupos
            WHERE motor_id = ?
            ORDER BY categoria COLLATE NOCASE
            """,
            (motor_id,),
        ).fetchall()

        resultado = []
        for grupo_id, categoria, cat_prefijo in grupos:
            cur = conn.execute(
                """
                SELECT mro.repuesto_codigo, mro.cantidad, mro.cantidad_manual,
                       cr.aplicacion, cr.precio, cr.stock, cr.medida, cr.base_codigo,
                       COALESCE(pm.nombre, cr.marca_prefijo) AS marca
                FROM motor_repuesto_opciones mro
                LEFT JOIN crac_repuestos cr ON cr.id = (
                    SELECT id FROM crac_repuestos WHERE codigo = mro.repuesto_codigo LIMIT 1
                )
                LEFT JOIN crac_prefijos pm ON pm.tipo = 'marca' AND pm.prefijo = cr.marca_prefijo
                WHERE mro.grupo_id = ?
                ORDER BY marca COLLATE NOCASE, cr.medida
                """,
                (grupo_id,),
            )
            opciones = []
            for (codigo, cantidad, cantidad_manual, aplicacion, precio, stock,
                 medida, base_codigo, marca) in cur.fetchall():
                # precio/stock en None = el código ya no está en el catálogo.
                # Se conserva igual en la ficha: sigue siendo una pieza que
                # sirve para el motor, solo que hoy el proveedor no la lista.
                del_uso = uso.get(codigo, {})
                opciones.append({
                    "codigo": codigo,
                    # 0 adentro = marcado sin cantidad; afuera viaja como null.
                    "cantidad": cantidad if cantidad else None,
                    "cantidad_manual": bool(cantidad_manual),
                    "descripcion": aplicacion,
                    "precio_actual": precio,
                    "stock_actual": stock,
                    "medida": medida,
                    # Familia de medidas: mismo repuesto y misma marca, distinta
                    # medida (STD/025/050…). La pantalla la usa para poder sacar
                    # las cuatro juntas sin tocar el resto de la categoría.
                    "base_codigo": base_codigo,
                    "marca": marca,
                    "en_catalogo": precio is not None,
                    "subtotal": pesos((precio or 0) * (cantidad or 0)),
                    # Historial de uso real en este motor: es lo que decide el
                    # orden de la lista y lo que la pantalla muestra debajo de
                    # cada opción ("Usado en 3 presupuestos · última vez …").
                    "usado_en": del_uso.get("usado_en", 0),
                    "ultima_vez": del_uso.get("ultima_vez"),
                })
            opciones = _orden_por_uso(opciones)
            resultado.append({
                "categoria": categoria,
                "cat_prefijo": cat_prefijo,
                "opciones": opciones,
                # Lo anotado por las dudas vs. lo que realmente se compra.
                "cotizadas": sum(1 for o in opciones if o["usado_en"] > 0),
            })
        return resultado


def guardar_ficha_motor(motor_id: int, grupos: list[dict]) -> None:
    """
    Reemplaza la ficha completa del motor.
    grupos: [{categoria, cat_prefijo, opciones: [{codigo, cantidad}]}]
    Los grupos sin opciones se descartan (un grupo vacío no significa nada).

    Todo cambio de ficha pasa por acá (la pantalla del motor, el paso Repuestos
    del presupuesto, copiar de otro motor, y la fusión al confirmar), así que es
    el único lugar donde hace falta mantener la papelera: lo que estaba y ya no
    está se guarda como eliminado, y lo que vuelve a entrar se saca de la
    papelera.
    """
    with get_connection() as conn:
        antes = {
            codigo: (categoria, cat_prefijo, cantidad)
            for codigo, categoria, cat_prefijo, cantidad in conn.execute(
                """
                SELECT mro.repuesto_codigo, mrg.categoria, mrg.cat_prefijo, mro.cantidad
                FROM motor_repuesto_opciones mro
                JOIN motor_repuesto_grupos mrg ON mrg.id = mro.grupo_id
                WHERE mrg.motor_id = ?
                """,
                (motor_id,),
            )
        }

        viejos = conn.execute(
            "SELECT id FROM motor_repuesto_grupos WHERE motor_id = ?", (motor_id,)
        ).fetchall()
        for (grupo_id,) in viejos:
            conn.execute("DELETE FROM motor_repuesto_opciones WHERE grupo_id = ?", (grupo_id,))
        conn.execute("DELETE FROM motor_repuesto_grupos WHERE motor_id = ?", (motor_id,))

        for grupo in grupos or []:
            categoria = (grupo.get("categoria") or "").strip()
            opciones = [o for o in (grupo.get("opciones") or []) if (o.get("codigo") or "").strip()]
            if not categoria or not opciones:
                continue
            cur = conn.execute(
                "INSERT INTO motor_repuesto_grupos (motor_id, categoria, cat_prefijo) VALUES (?, ?, ?)",
                (motor_id, categoria, grupo.get("cat_prefijo")),
            )
            grupo_id = cur.lastrowid
            for op in opciones:
                # cantidad None (o ausente) = marcado sin cantidad → 0 adentro.
                # Es la diferencia entre "esta pieza sirve para el motor" y
                # "de esta pieza van 4": el sistema no inventa el número.
                try:
                    cantidad = float(op["cantidad"]) if op.get("cantidad") is not None else 0
                except (TypeError, ValueError):
                    cantidad = 0
                conn.execute(
                    """
                    INSERT INTO motor_repuesto_opciones
                        (grupo_id, repuesto_codigo, cantidad, cantidad_manual)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(grupo_id, repuesto_codigo) DO UPDATE SET
                        cantidad = excluded.cantidad,
                        cantidad_manual = excluded.cantidad_manual
                    """,
                    (grupo_id, op["codigo"].strip(), max(cantidad, 0),
                     1 if op.get("cantidad_manual") else 0),
                )

        despues = {
            codigo
            for (codigo,) in conn.execute(
                """
                SELECT mro.repuesto_codigo
                FROM motor_repuesto_opciones mro
                JOIN motor_repuesto_grupos mrg ON mrg.id = mro.grupo_id
                WHERE mrg.motor_id = ?
                """,
                (motor_id,),
            )
        }

        ahora = datetime.now().isoformat(timespec="seconds")
        for codigo, (categoria, cat_prefijo, cantidad) in antes.items():
            if codigo in despues:
                continue
            conn.execute(
                """
                INSERT INTO motor_repuestos_papelera
                    (motor_id, repuesto_codigo, categoria, cat_prefijo, cantidad, eliminado_en)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(motor_id, repuesto_codigo) DO UPDATE SET
                    categoria = excluded.categoria,
                    cat_prefijo = excluded.cat_prefijo,
                    cantidad = excluded.cantidad,
                    eliminado_en = excluded.eliminado_en
                """,
                (motor_id, codigo, categoria, cat_prefijo, cantidad, ahora),
            )

        # Lo que volvió a la ficha ya no está eliminado, sin importar cómo volvió
        # (restaurado a mano, agregado de nuevo desde el catálogo, o traído de
        # otro motor). Si no, quedaría listado en los dos lados a la vez.
        for codigo in despues:
            conn.execute(
                "DELETE FROM motor_repuestos_papelera WHERE motor_id = ? AND repuesto_codigo = ?",
                (motor_id, codigo),
            )


def fusionar_ficha_motor(motor_id: int, grupos: list[dict]) -> None:
    """
    Suma los grupos de un presupuesto recién guardado a la ficha del motor, sin
    pisar lo que ya había: los grupos nuevos se agregan, y en los que ya existen
    se suman las opciones nuevas y se actualiza la cantidad de las repetidas
    (la última decisión del taller es la que vale).
    """
    actuales = {g["categoria"]: g for g in get_ficha_motor(motor_id)}
    for grupo in grupos or []:
        categoria = (grupo.get("categoria") or "").strip()
        if not categoria:
            continue
        existente = actuales.get(categoria)
        if existente:
            por_codigo = {o["codigo"]: dict(o) for o in existente["opciones"]}
        else:
            por_codigo = {}
            actuales[categoria] = {
                "categoria": categoria,
                "cat_prefijo": grupo.get("cat_prefijo"),
                "opciones": [],
            }
        for op in grupo.get("opciones") or []:
            codigo = (op.get("codigo") or "").strip()
            if not codigo:
                continue
            previa = por_codigo.get(codigo) or {}
            entrante = op.get("cantidad")
            if previa.get("cantidad_manual"):
                # La cantidad escrita a mano por el taller le gana al cálculo.
                cantidad = previa.get("cantidad")
            elif entrante is None:
                # Marcar una pieza que ya estaba no le borra la cantidad que tenía.
                cantidad = previa.get("cantidad")
            else:
                cantidad = entrante
            por_codigo[codigo] = {
                "codigo": codigo,
                "cantidad": cantidad,
                "cantidad_manual": bool(previa.get("cantidad_manual")),
            }
        actuales[categoria]["opciones"] = list(por_codigo.values())

    guardar_ficha_motor(motor_id, list(actuales.values()))


def recalcular_cantidades_ficha(motor_id: int) -> int:
    """
    Pone en la ficha la cantidad que el motor recuerda de cada repuesto: la que
    más se repite en sus presupuestos (ver get_uso_repuestos_motor). No toca las
    que el taller escribió a mano ni las que nunca se cotizaron. Corre después
    de guardar o editar un presupuesto. Retorna cuántas cambió.
    """
    uso = get_uso_repuestos_motor(motor_id)
    if not uso:
        return 0
    cambiadas = 0
    with get_connection() as conn:
        filas = conn.execute(
            """
            SELECT mro.grupo_id, mro.repuesto_codigo, mro.cantidad
            FROM motor_repuesto_opciones mro
            JOIN motor_repuesto_grupos mrg ON mrg.id = mro.grupo_id
            WHERE mrg.motor_id = ? AND mro.cantidad_manual = 0
            """,
            (motor_id,),
        ).fetchall()
        for grupo_id, codigo, cantidad in filas:
            recordada = uso.get(codigo, {}).get("cantidad")
            if recordada is None or recordada == cantidad:
                continue
            conn.execute(
                """
                UPDATE motor_repuesto_opciones SET cantidad = ?
                WHERE grupo_id = ? AND repuesto_codigo = ?
                """,
                (recordada, grupo_id, codigo),
            )
            cambiadas += 1
    return cambiadas


def get_presupuestos_con_repuestos(motor_id: int) -> list[dict]:
    """
    Presupuestos de este motor que llevaron repuestos, del más nuevo al más
    viejo. Es la lista que abre el botón "Repuestos ya utilizados": de ahí se
    entra a uno y se eligen repuestos sueltos para el presupuesto en curso.
    """
    with get_connection() as conn:
        cur = conn.execute(
            """
            SELECT p.id, p.fecha, p.total, p.aprobado_en,
                   COALESCE(c.nombre, '—') AS cliente,
                   COUNT(DISTINCT o.repuesto_codigo) AS repuestos
            FROM presupuestos p
            LEFT JOIN clientes c ON c.id = p.cliente_id
            JOIN presupuesto_item_opciones o ON o.presupuesto_id = p.id
            WHERE p.motor_id = ?
            GROUP BY p.id
            HAVING repuestos > 0
            ORDER BY p.fecha DESC, p.id DESC
            """,
            (motor_id,),
        )
        return [
            {
                "id": pid,
                "fecha": fecha,
                "total": total,
                "aprobado_en": aprobado_en,
                "cliente": cliente,
                "repuestos": repuestos,
            }
            for pid, fecha, total, aprobado_en, cliente, repuestos in cur.fetchall()
        ]


def copiar_ficha_motor(origen_id: int, destino_id: int) -> int:
    """
    Copia la ficha de otro motor sobre la del destino, fusionando (no pisa lo
    que el destino ya tenga). Muchos motores comparten repuestos, así que esto
    ahorra la mayor parte de la carga inicial. Retorna cuántos grupos quedaron.
    """
    origen = get_ficha_motor(origen_id)
    grupos = [
        {
            "categoria": g["categoria"],
            "cat_prefijo": g["cat_prefijo"],
            "opciones": [{"codigo": o["codigo"], "cantidad": o["cantidad"]} for o in g["opciones"]],
        }
        for g in origen
    ]
    fusionar_ficha_motor(destino_id, grupos)
    return len(get_ficha_motor(destino_id))


# ─── Papelera de la ficha del motor ───────────────────────────────────────────

def get_papelera_motor(motor_id: int) -> list[dict]:
    """
    Repuestos que se sacaron de la ficha de este motor, del último borrado al
    primero. Se resuelven contra el catálogo de hoy igual que la ficha, para que
    se reconozcan por descripción y marca y no solo por el código.
    """
    with get_connection() as conn:
        cur = conn.execute(
            """
            SELECT p.repuesto_codigo, p.categoria, p.cat_prefijo, p.cantidad, p.eliminado_en,
                   cr.aplicacion, cr.precio, cr.stock, cr.medida, cr.base_codigo,
                   COALESCE(pm.nombre, cr.marca_prefijo) AS marca
            FROM motor_repuestos_papelera p
            LEFT JOIN crac_repuestos cr ON cr.id = (
                SELECT id FROM crac_repuestos WHERE codigo = p.repuesto_codigo LIMIT 1
            )
            LEFT JOIN crac_prefijos pm ON pm.tipo = 'marca' AND pm.prefijo = cr.marca_prefijo
            WHERE p.motor_id = ?
            ORDER BY p.eliminado_en DESC, p.categoria COLLATE NOCASE, p.repuesto_codigo
            """,
            (motor_id,),
        )
        return [
            {
                "codigo": codigo,
                "categoria": categoria,
                "cat_prefijo": cat_prefijo,
                "cantidad": cantidad,
                "eliminado_en": eliminado_en,
                "descripcion": aplicacion,
                "precio_actual": precio,
                "stock_actual": stock,
                "medida": medida,
                "base_codigo": base_codigo,
                "marca": marca,
                "en_catalogo": precio is not None,
            }
            for (codigo, categoria, cat_prefijo, cantidad, eliminado_en,
                 aplicacion, precio, stock, medida, base_codigo, marca) in cur.fetchall()
        ]


def restaurar_de_papelera(motor_id: int, codigos: list[str]) -> int:
    """
    Devuelve a la ficha los códigos indicados, cada uno a la categoría de la que
    salió y con la cantidad que tenía. Retorna cuántos se restauraron.
    La baja de la papelera la hace guardar_ficha_motor (vía fusionar), que es
    quien mantiene las dos listas coherentes.
    """
    pedidos = {c.strip() for c in codigos or [] if (c or "").strip()}
    if not pedidos:
        return 0

    guardados = [p for p in get_papelera_motor(motor_id) if p["codigo"] in pedidos]
    if not guardados:
        return 0

    por_categoria: dict[str, dict] = {}
    for p in guardados:
        grupo = por_categoria.setdefault(
            p["categoria"],
            {"categoria": p["categoria"], "cat_prefijo": p["cat_prefijo"], "opciones": []},
        )
        grupo["opciones"].append({"codigo": p["codigo"], "cantidad": p["cantidad"]})

    fusionar_ficha_motor(motor_id, list(por_categoria.values()))
    return len(guardados)


def borrar_de_papelera(motor_id: int, codigos: list[str] | None = None) -> int:
    """
    Saca definitivamente de la papelera: los códigos indicados, o todo lo que
    haya si no se pasa ninguno. No toca la ficha.
    """
    with get_connection() as conn:
        if codigos is None:
            cur = conn.execute("DELETE FROM motor_repuestos_papelera WHERE motor_id = ?", (motor_id,))
            return cur.rowcount
        limpios = [c.strip() for c in codigos if (c or "").strip()]
        if not limpios:
            return 0
        marcas = ",".join("?" * len(limpios))
        cur = conn.execute(
            f"DELETE FROM motor_repuestos_papelera WHERE motor_id = ? AND repuesto_codigo IN ({marcas})",
            [motor_id, *limpios],
        )
        return cur.rowcount


# ─── Grupos dentro de un presupuesto ──────────────────────────────────────────

def get_grupos_presupuesto(presupuesto_id: int) -> list[dict]:
    """
    Grupos congelados de un presupuesto, con todas sus opciones. Trae además el
    precio y stock VIGENTES de cada opción, para poder comparar contra lo
    congelado (mismo criterio que get_presupuesto_items_full).
    """
    with get_connection() as conn:
        cur = conn.execute(
            """
            SELECT o.grupo_num, o.repuesto_codigo, o.descripcion, o.categoria,
                   o.marca, o.medida, o.cantidad, o.precio_unitario, o.subtotal,
                   o.stock_al_cotizar, o.elegida, o.elegida_a_mano,
                   (SELECT cr.precio FROM crac_repuestos cr
                     WHERE cr.codigo = o.repuesto_codigo LIMIT 1) AS precio_actual,
                   (SELECT cr.stock FROM crac_repuestos cr
                     WHERE cr.codigo = o.repuesto_codigo LIMIT 1) AS stock_actual,
                   -- La familia de medidas no se congela (es dato del catálogo,
                   -- no del presupuesto): se resuelve contra el catálogo de hoy,
                   -- igual que precio_actual y stock_actual.
                   (SELECT cr.base_codigo FROM crac_repuestos cr
                     WHERE cr.codigo = o.repuesto_codigo LIMIT 1) AS base_codigo
            FROM presupuesto_item_opciones o
            WHERE o.presupuesto_id = ?
            ORDER BY o.grupo_num, o.elegida DESC, o.subtotal DESC
            """,
            (presupuesto_id,),
        )
        cols = ["grupo_num", "repuesto_codigo", "descripcion", "categoria", "marca",
                "medida", "cantidad", "precio_unitario", "subtotal", "stock_al_cotizar",
                "elegida", "elegida_a_mano", "precio_actual", "stock_actual", "base_codigo"]
        filas = [dict(zip(cols, row)) for row in cur.fetchall()]

    grupos: dict[int, dict] = {}
    for fila in filas:
        num = fila["grupo_num"]
        grupo = grupos.get(num)
        if grupo is None:
            grupo = {
                "grupo_num": num,
                "categoria": fila["categoria"],
                "opciones": [],
            }
            grupos[num] = grupo
        grupo["opciones"].append(fila)
    return list(grupos.values())


def aprobar_presupuesto(presupuesto_id: int, aprobado: bool) -> str | None:
    """Marca o desmarca el presupuesto como aprobado por el cliente.
    Retorna la fecha de aprobación, o None si quedó sin aprobar."""
    valor = date.today().isoformat() if aprobado else None
    with get_connection() as conn:
        conn.execute(
            "UPDATE presupuestos SET aprobado_en = ? WHERE id = ?",
            (valor, presupuesto_id),
        )
    return valor


def actualizar_fecha_presupuesto(presupuesto_id: int) -> str:
    """
    Pone la fecha del presupuesto en hoy. Se usa al recotizarlo contra el catálogo
    vigente: los precios pasan a ser los de hoy, así que la validez de una semana
    vuelve a contar desde hoy y el estado que muestra la app coincide con la fecha
    que imprime el PDF (que siempre sale con la del día).
    """
    valor = date.today().isoformat()
    with get_connection() as conn:
        conn.execute(
            "UPDATE presupuestos SET fecha = ? WHERE id = ?",
            (valor, presupuesto_id),
        )
    return valor


def borrar_datos_prueba() -> dict:
    """
    Vacía presupuestos y clientes para arrancar limpio, dejando intacto todo lo
    que es dato de referencia importado: motores, mano de obra, catálogo del
    proveedor y favoritos. Devuelve los nombres de los PDFs que quedaron
    huérfanos, para que quien llame los borre del disco.

    No toca la ficha de repuestos de los motores: es trabajo cargado a mano, no
    dato de prueba.
    """
    with get_connection() as conn:
        pdfs = [r[0] for r in conn.execute(
            "SELECT pdf_path FROM presupuesto_pdfs WHERE pdf_path IS NOT NULL"
        ).fetchall()]
        pdfs += [r[0] for r in conn.execute(
            "SELECT pdf_path FROM presupuestos WHERE pdf_path IS NOT NULL"
        ).fetchall()]

        resumen = {
            "presupuestos": conn.execute("SELECT COUNT(*) FROM presupuestos").fetchone()[0],
            "clientes": conn.execute("SELECT COUNT(*) FROM clientes").fetchone()[0],
        }

        conn.execute("DELETE FROM presupuesto_items")
        conn.execute("DELETE FROM presupuesto_item_opciones")
        conn.execute("DELETE FROM presupuesto_pdfs")
        conn.execute("DELETE FROM presupuestos")
        conn.execute("DELETE FROM clientes")
        conn.execute("DELETE FROM repuestos_ocultos_motor")

    resumen["pdfs"] = sorted(set(pdfs))
    return resumen


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
