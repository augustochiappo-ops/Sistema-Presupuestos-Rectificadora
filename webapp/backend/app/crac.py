"""
Módulo del proveedor de repuestos (interno: "CRAC").
Portado de la app de escritorio (src/data/crac.py) sin cambios de lógica.
Lee precio-stock.csv y prefijos_crac.csv, decodifica los códigos de pieza
y guarda todo en SQLite. Ver CRAC/CRAC.md (raíz del repo) para el detalle
del formato y el algoritmo de decodificación.

Regla de confidencialidad del negocio: el nombre del proveedor puede
aparecer en este módulo (capa de datos interna) pero nunca debe llegar
a una pantalla o PDF que vea el cliente.
"""
import csv
import re
from datetime import datetime

from .db import get_connection


# ─── Importación de prefijos ──────────────────────────────────────────────────
def importar_prefijos(path: str) -> tuple[int, str]:
    """
    Lee prefijos_crac.csv (tipo;prefijo;nombre;activo;codigos_ref, con encabezado)
    y reemplaza la tabla crac_prefijos. La columna 'activo' no se usa: se
    guardan y usan todas las categorías y marcas por igual.
    """
    try:
        with get_connection() as conn:
            conn.execute("DELETE FROM crac_prefijos")
            count = 0
            with open(path, encoding="utf-8-sig", newline="") as f:
                reader = csv.DictReader(f, delimiter=";")
                for row in reader:
                    tipo = (row.get("tipo") or "").strip().lower()
                    prefijo = (row.get("prefijo") or "").strip()
                    nombre = (row.get("nombre") or "").strip()
                    if tipo not in ("categoria", "marca") or not prefijo:
                        continue
                    conn.execute(
                        "INSERT INTO crac_prefijos (tipo, prefijo, nombre) VALUES (?, ?, ?)",
                        (tipo, prefijo, nombre),
                    )
                    count += 1

        return count, f"✓ {count} prefijos importados correctamente"

    except Exception as e:
        return 0, f"✗ Error al importar: {str(e)}"


# ─── Decodificación de códigos (CRAC.md sección 3.2) ─────────────────────────
def _cargar_tablas_prefijos(conn):
    cat_2, cat_1, marca_2, marca_1 = {}, {}, {}, {}
    for tipo, prefijo, nombre in conn.execute(
        "SELECT tipo, prefijo, nombre FROM crac_prefijos"
    ):
        if tipo == "categoria":
            (cat_2 if len(prefijo) == 2 else cat_1)[prefijo] = nombre
        elif tipo == "marca":
            (marca_2 if len(prefijo) == 2 else marca_1)[prefijo] = nombre
    return cat_2, cat_1, marca_2, marca_1


def _decodificar(codigo: str, cat_2: dict, cat_1: dict, marca_2: dict, marca_1: dict):
    """
    Longest-match contra las tablas de categoría y marca.
    Devuelve (cat_prefijo, marca_prefijo, resto) o None si no es estándar.
    """
    s = codigo.strip()

    if s[:2] in cat_2:
        cat, s = s[:2], s[2:]
    elif s[:1] in cat_1:
        cat, s = s[:1], s[1:]
        if s.startswith(" "):
            s = s[1:]
    else:
        return None

    if s[:2] in marca_2:
        marca, resto = s[:2], s[2:]
    elif s[:1] in marca_1:
        marca, resto = s[:1], s[1:]
        if resto.startswith(" "):
            resto = resto[1:]
    else:
        return None

    return cat, marca, resto.strip()


# ─── Medidas (STD / 025 / 050 / …) ────────────────────────────────────────────
# Una medida es un sufijo del código, separado por espacio: "A AK104050 STD",
# "CAAC02740  010" (ojo: el CSV mezcla espacio simple y doble). Dos códigos que
# comparten todo menos la medida son la misma pieza en otro tamaño.
#
# NO alcanza con mirar el último token del código: hay 13.458 códigos como
# "ACAM 3066" cuyo último token es un número de parte, no una medida. La
# diferencia está DESPUÉS de decodificar: en un código con medida, el `resto`
# (lo que queda sacando categoría y marca) tiene dos tokens — número de parte y
# medida — mientras que en "ACAM 3066" el resto es un solo token ("3066").
_RE_MEDIDA = re.compile(r"^(STD|\d{1,4}([.,]\d+)?)$", re.IGNORECASE)


def _partir_medida(codigo: str, resto: str | None) -> tuple[str | None, str | None]:
    """
    Devuelve (medida, base_codigo) para un código ya decodificado.
    base_codigo es el código sin la medida y con los espacios colapsados, para
    que "CAAC02740  010" y un hipotético "CAAC02740 STD" caigan en la misma
    familia. Si el código no tiene medida devuelve (None, None): no participa
    del agregado automático de medidas.
    """
    if not resto:
        return None, None
    tokens = resto.split()
    if len(tokens) < 2 or not _RE_MEDIDA.match(tokens[-1]):
        return None, None

    medida = tokens[-1]
    # El código completo sin el último token: se corta por la derecha para no
    # depender de cómo quedó separada la categoría del resto.
    partes = codigo.split()
    base = " ".join(partes[:-1])
    return medida, base


def recalcular_medidas() -> int:
    """
    Recalcula medida/base_codigo de todo el catálogo ya cargado. Se usa en la
    migración, para que un catálogo importado antes de que existieran estas
    columnas no quede sin medidas hasta la próxima carga del CSV.
    """
    with get_connection() as conn:
        cat_2, cat_1, marca_2, marca_1 = _cargar_tablas_prefijos(conn)
        filas = conn.execute("SELECT id, codigo FROM crac_repuestos").fetchall()
        actualizados = 0
        for fila_id, codigo in filas:
            decodificado = _decodificar(codigo, cat_2, cat_1, marca_2, marca_1)
            resto = decodificado[2] if decodificado else None
            medida, base = _partir_medida(codigo, resto)
            conn.execute(
                "UPDATE crac_repuestos SET medida = ?, base_codigo = ? WHERE id = ?",
                (medida, base, fila_id),
            )
            if medida:
                actualizados += 1
    return actualizados


# ─── Importación de precio + stock ─────────────────────────────────────────────
def importar_precio_stock(path: str) -> tuple[int, str]:
    """
    Lee precio-stock.csv (sin encabezado, separador ';', comillas dobles,
    encoding Latin-1) y reemplaza la tabla crac_repuestos.
    Cada código se decodifica contra los prefijos ya cargados en crac_prefijos
    (cargar la Lista de Prefijos primero para que la categoría/marca se
    muestren; si no, el repuesto igual se guarda con su código, aplicación,
    precio y stock, solo que sin categoría/marca resueltas).
    """
    try:
        with get_connection() as conn:
            cat_2, cat_1, marca_2, marca_1 = _cargar_tablas_prefijos(conn)
            conn.execute("DELETE FROM crac_repuestos")

            count = 0
            with open(path, encoding="latin-1", newline="") as f:
                reader = csv.reader(f, delimiter=";", quotechar='"')
                for fila in reader:
                    if len(fila) < 4:
                        continue
                    codigo, aplicacion, precio_txt, stock_txt = fila[0:4]
                    codigo = codigo.strip()
                    if not codigo:
                        continue

                    try:
                        precio = float(precio_txt.strip().replace(",", ".")) if precio_txt else 0.0
                    except ValueError:
                        precio = 0.0

                    stock = 1 if stock_txt.strip().lower() == "si" else 0

                    decodificado = _decodificar(codigo, cat_2, cat_1, marca_2, marca_1)
                    cat_pref, marca_pref, resto = decodificado or (None, None, None)
                    medida, base_codigo = _partir_medida(codigo, resto)

                    conn.execute(
                        """
                        INSERT INTO crac_repuestos
                            (codigo, aplicacion, precio, stock, cat_prefijo, marca_prefijo,
                             resto, medida, base_codigo)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (codigo, aplicacion.strip(), precio, stock, cat_pref, marca_pref,
                         resto, medida, base_codigo),
                    )
                    count += 1

            # Fecha de esta carga: los precios "de hoy" que muestra el sistema son
            # en realidad los de la última importación, y conviene que se vea.
            conn.execute(
                "INSERT INTO app_meta (clave, valor) VALUES ('catalogo_importado_en', ?) "
                "ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor",
                (datetime.now().isoformat(timespec="seconds"),),
            )

        return count, f"✓ {count} repuestos importados correctamente"

    except Exception as e:
        return 0, f"✗ Error al importar: {str(e)}"


# ─── Consultas ────────────────────────────────────────────────────────────────
def get_categorias() -> list[dict]:
    """Categorías presentes en los repuestos importados, con nombre resuelto."""
    with get_connection() as conn:
        cur = conn.execute(
            """
            SELECT DISTINCT r.cat_prefijo, COALESCE(p.nombre, r.cat_prefijo) AS nombre
            FROM crac_repuestos r
            LEFT JOIN crac_prefijos p ON p.tipo = 'categoria' AND p.prefijo = r.cat_prefijo
            WHERE r.cat_prefijo IS NOT NULL
            ORDER BY nombre COLLATE NOCASE
            """
        )
        return [{"prefijo": r[0], "nombre": r[1]} for r in cur.fetchall()]


def get_marcas(categoria: str | None = None) -> list[dict]:
    """
    Marcas presentes en los repuestos importados, con nombre resuelto.
    Si se pasa `categoria`, solo devuelve las marcas que tienen repuestos
    en esa categoría (para que el selector de marcas se actualice según
    la categoría elegida).
    """
    query = """
        SELECT DISTINCT r.marca_prefijo, COALESCE(p.nombre, r.marca_prefijo) AS nombre
        FROM crac_repuestos r
        LEFT JOIN crac_prefijos p ON p.tipo = 'marca' AND p.prefijo = r.marca_prefijo
        WHERE r.marca_prefijo IS NOT NULL
    """
    params: list = []
    if categoria:
        query += " AND r.cat_prefijo = ?"
        params.append(categoria)
    query += " ORDER BY nombre COLLATE NOCASE"

    with get_connection() as conn:
        cur = conn.execute(query, params)
        return [{"prefijo": r[0], "nombre": r[1]} for r in cur.fetchall()]


# ─── Favoritos de categorías ───────────────────────────────────────────────────
def toggle_favorito_categoria(cat_prefijo: str) -> bool:
    with get_connection() as conn:
        existe = conn.execute(
            "SELECT 1 FROM favoritos_categorias WHERE cat_prefijo = ?",
            (cat_prefijo,),
        ).fetchone()
        if existe:
            conn.execute(
                "DELETE FROM favoritos_categorias WHERE cat_prefijo = ?",
                (cat_prefijo,),
            )
            return False
        else:
            conn.execute(
                "INSERT INTO favoritos_categorias (cat_prefijo) VALUES (?)",
                (cat_prefijo,),
            )
            return True


def get_favoritos_categorias() -> set[str]:
    with get_connection() as conn:
        cur = conn.execute("SELECT cat_prefijo FROM favoritos_categorias")
        return {row[0] for row in cur.fetchall()}


def _where_filtros(categoria, marca, descripcion, codigo):
    query = """
        FROM crac_repuestos r
        LEFT JOIN crac_prefijos pc ON pc.tipo = 'categoria' AND pc.prefijo = r.cat_prefijo
        LEFT JOIN crac_prefijos pm ON pm.tipo = 'marca'     AND pm.prefijo = r.marca_prefijo
        WHERE 1=1
    """
    params: list = []
    if categoria:
        query += " AND r.cat_prefijo = ?"
        params.append(categoria)
    if marca:
        query += " AND r.marca_prefijo = ?"
        params.append(marca)
    if descripcion:
        query += " AND r.aplicacion LIKE ?"
        params.append(f"%{descripcion}%")
    if codigo:
        query += " AND r.codigo LIKE ?"
        params.append(f"%{codigo}%")
    return query, params


def get_repuestos(
    categoria: str | None = None,
    marca: str | None = None,
    descripcion: str | None = None,
    codigo: str | None = None,
    limite: int = 1000,
) -> list[dict]:
    """Repuestos filtrados por categoría, marca, descripción (aplicación) y/o código."""
    where, params = _where_filtros(categoria, marca, descripcion, codigo)
    query = f"""
        SELECT r.codigo, r.aplicacion, r.precio, r.stock,
               COALESCE(pc.nombre, r.cat_prefijo)   AS categoria,
               COALESCE(pm.nombre, r.marca_prefijo) AS marca,
               r.cat_prefijo, r.medida
        {where}
        ORDER BY r.codigo
        LIMIT ?
    """
    with get_connection() as conn:
        cur = conn.execute(query, params + [limite])
        cols = ["codigo", "aplicacion", "precio", "stock", "categoria", "marca",
                "cat_prefijo", "medida"]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def get_repuesto_por_codigo(codigo: str) -> dict | None:
    """
    Un repuesto puntual por código exacto (para congelar precio/stock/descripción/
    categoría al agregarlo a un presupuesto). None si el código no está en el catálogo.
    """
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT r.codigo, r.aplicacion, r.precio, r.stock,
                   COALESCE(pc.nombre, r.cat_prefijo)   AS categoria,
                   COALESCE(pm.nombre, r.marca_prefijo) AS marca,
                   r.cat_prefijo, r.medida
            FROM crac_repuestos r
            LEFT JOIN crac_prefijos pc ON pc.tipo = 'categoria' AND pc.prefijo = r.cat_prefijo
            LEFT JOIN crac_prefijos pm ON pm.tipo = 'marca'     AND pm.prefijo = r.marca_prefijo
            WHERE r.codigo = ?
            LIMIT 1
            """,
            (codigo,),
        ).fetchone()
        if not row:
            return None
        cols = ["codigo", "aplicacion", "precio", "stock", "categoria", "marca",
                "cat_prefijo", "medida"]
        return dict(zip(cols, row))


def get_medidas_hermanas(codigo: str) -> list[dict]:
    """
    Todas las medidas de la misma pieza (mismo base_codigo), incluida la del
    código que se pasa. Lista vacía si ese código no tiene medida: no todas las
    piezas vienen en medidas, y ahí no hay nada que agregar solo.

    Solo devuelve lo que existe de verdad en el catálogo del proveedor: nunca se
    inventa una medida (si esa pieza no tiene 1.00, no aparece un 1.00).
    """
    with get_connection() as conn:
        base = conn.execute(
            "SELECT base_codigo FROM crac_repuestos WHERE codigo = ? LIMIT 1",
            (codigo,),
        ).fetchone()
        if not base or not base[0]:
            return []

        cur = conn.execute(
            """
            SELECT r.codigo, r.aplicacion, r.precio, r.stock,
                   COALESCE(pc.nombre, r.cat_prefijo)   AS categoria,
                   COALESCE(pm.nombre, r.marca_prefijo) AS marca,
                   r.cat_prefijo, r.medida
            FROM crac_repuestos r
            LEFT JOIN crac_prefijos pc ON pc.tipo = 'categoria' AND pc.prefijo = r.cat_prefijo
            LEFT JOIN crac_prefijos pm ON pm.tipo = 'marca'     AND pm.prefijo = r.marca_prefijo
            WHERE r.base_codigo = ?
            ORDER BY r.medida
            """,
            (base[0],),
        )
        cols = ["codigo", "aplicacion", "precio", "stock", "categoria", "marca",
                "cat_prefijo", "medida"]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def get_info_catalogo() -> dict:
    """Cuándo se importó por última vez el catálogo del proveedor, y cuántos hay."""
    with get_connection() as conn:
        total = conn.execute("SELECT COUNT(*) FROM crac_repuestos").fetchone()[0]
        fila = conn.execute(
            "SELECT valor FROM app_meta WHERE clave = 'catalogo_importado_en'"
        ).fetchone()
    return {"importado_en": fila[0] if fila else None, "total": total}


def get_repuestos_count(
    categoria: str | None = None,
    marca: str | None = None,
    descripcion: str | None = None,
    codigo: str | None = None,
) -> int:
    where, params = _where_filtros(categoria, marca, descripcion, codigo)
    with get_connection() as conn:
        cur = conn.execute(f"SELECT COUNT(*) {where}", params)
        return cur.fetchone()[0]
