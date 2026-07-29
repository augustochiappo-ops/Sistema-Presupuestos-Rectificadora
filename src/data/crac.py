"""
Módulo del proveedor de repuestos (interno: "CRAC").
Lee precio-stock.csv y prefijos_crac.csv, decodifica los códigos de pieza
y guarda todo en SQLite. Ver CRAC/CRAC.md para el detalle del formato y
el algoritmo de decodificación.

Regla de confidencialidad del negocio: el nombre del proveedor puede
aparecer en este módulo (capa de datos interna) pero nunca debe llegar
a una pantalla o PDF que vea el cliente.
"""
import csv
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

                    conn.execute(
                        """
                        INSERT INTO crac_repuestos
                            (codigo, aplicacion, precio, stock, cat_prefijo, marca_prefijo, resto)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (codigo, aplicacion.strip(), precio, stock, cat_pref, marca_pref, resto),
                    )
                    count += 1

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


def get_marcas() -> list[dict]:
    """Marcas presentes en los repuestos importados, con nombre resuelto."""
    with get_connection() as conn:
        cur = conn.execute(
            """
            SELECT DISTINCT r.marca_prefijo, COALESCE(p.nombre, r.marca_prefijo) AS nombre
            FROM crac_repuestos r
            LEFT JOIN crac_prefijos p ON p.tipo = 'marca' AND p.prefijo = r.marca_prefijo
            WHERE r.marca_prefijo IS NOT NULL
            ORDER BY nombre COLLATE NOCASE
            """
        )
        return [{"prefijo": r[0], "nombre": r[1]} for r in cur.fetchall()]


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
               COALESCE(pm.nombre, r.marca_prefijo) AS marca
        {where}
        ORDER BY r.codigo
        LIMIT ?
    """
    with get_connection() as conn:
        cur = conn.execute(query, params + [limite])
        cols = ["codigo", "aplicacion", "precio", "stock", "categoria", "marca"]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


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
