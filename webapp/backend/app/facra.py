"""
Módulo FACRA.
Lee los Excel de FACRA, parsea los datos y los guarda en SQLite.
Portado de la app de escritorio (src/data/facra.py) sin cambios de lógica.
"""
import re
import pandas as pd
from .db import get_connection

BRAND_ALIASES = {
    "CATERPILAR":      "CATERPILLAR",
    "M.W.M.":          "M.W.M",
    "MAXION-SPRINTER": "MAXION",
}


def _parse_motor(descripcion: str) -> dict:
    """
    Extrae cilindros, tipo de combustible y cilindrada de la descripción de un motor.

    Formato esperado:
        [MARCA] [MODELO] [CILINDRADA?] [NAFTA/DIESEL/TURBO?] *[N]CIL* [DIÁMETRO]mm
    """
    resultado = {"cilindros": None, "tipo": None, "cilindrada": None, "diametro": None}

    m = re.search(r"\*(\d+)\s*CIL\*", descripcion, re.IGNORECASE)
    if m:
        resultado["cilindros"] = int(m.group(1))

    desc_up = descripcion.upper()
    if "DIESEL" in desc_up:
        resultado["tipo"] = "TURBO DIESEL" if "TURBO" in desc_up else "DIESEL"
    elif "NAF" in desc_up:
        resultado["tipo"] = "NAFTA"

    m = re.search(r"(\d+\.?\d*)\s*mm\s*$", descripcion.strip())
    if m:
        resultado["diametro"] = float(m.group(1))

    m = re.search(r"(\d{3,4})\s*cc", descripcion, re.IGNORECASE)
    if m:
        resultado["cilindrada"] = m.group(1) + "cc"
    else:
        desc_limpia = re.sub(r"\s+\d+\.?\d*\s*mm\s*$", "", descripcion.strip())
        m = re.search(r"(?<!\d)(\d\.\d{1,2})(?!\d)", desc_limpia)
        if m:
            resultado["cilindrada"] = m.group(1) + "L"

    return resultado


def importar_nomenclador(path: str) -> tuple[int, str]:
    """
    Lee nomenclador.xls y guarda los motores en la tabla 'motores'.
    Reemplaza solo los registros de origen 'facra'.
    Retorna (cantidad_importada, mensaje).
    """
    try:
        df = pd.read_excel(path, engine="xlrd", header=None)

        motores_df = df.iloc[5:].copy()
        motores_df.columns = ["indice", "motor", "lista"]
        motores_df = motores_df.dropna(subset=["motor"])
        motores_df = motores_df[motores_df["motor"].astype(str).str.strip() != ""]

        motores_df["marca"] = (
            motores_df["motor"]
            .astype(str)
            .str.strip()
            .str.split()
            .str[0]
            .replace(BRAND_ALIASES)
        )

        with get_connection() as conn:
            conn.execute("DELETE FROM motores WHERE origen = 'facra'")

            count = 0
            for _, row in motores_df.iterrows():
                desc = str(row["motor"]).strip()
                detalles = _parse_motor(desc)

                try:
                    lista_num = int(float(row["lista"]))
                except (ValueError, TypeError):
                    lista_num = None

                conn.execute(
                    """
                    INSERT INTO motores
                        (indice, motor, marca, lista_num, cilindros, tipo,
                         cilindrada, diametro, origen)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'facra')
                    """,
                    (
                        str(row["indice"]).strip(),
                        desc,
                        row["marca"],
                        lista_num,
                        detalles["cilindros"],
                        detalles["tipo"],
                        detalles["cilindrada"],
                        detalles["diametro"],
                    ),
                )
                count += 1

        return count, f"{count} motores importados correctamente"

    except Exception as e:
        return 0, f"Error al importar: {str(e)}"


def importar_lista_orientadora(path: str) -> tuple[int, str]:
    """
    Lee lista_orientadora.xls y guarda los servicios en la tabla 'servicios'.
    Retorna (cantidad_importada, mensaje).
    """
    try:
        df = pd.read_excel(path, engine="xlrd", header=None)

        servicios_df = df.iloc[6:].copy()
        servicios_df = servicios_df.dropna(subset=[0])

        with get_connection() as conn:
            conn.execute("DELETE FROM servicios")

            count = 0
            for _, row in servicios_df.iterrows():
                try:
                    item_num = int(float(row[0]))
                except (ValueError, TypeError):
                    continue

                descripcion = str(row[1]).strip() if pd.notna(row[1]) else ""

                precios = []
                for i in range(2, 15):
                    try:
                        val = float(row[i]) if pd.notna(row[i]) else None
                    except (ValueError, TypeError):
                        val = None
                    precios.append(val)

                conn.execute(
                    """
                    INSERT INTO servicios
                        (item_num, descripcion, l1, l2, l3, l4, l5, l6, l7,
                         l8, l9, l10, l11, l12, l13)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (item_num, descripcion, *precios),
                )
                count += 1

        return count, f"{count} servicios importados correctamente"

    except Exception as e:
        return 0, f"Error al importar: {str(e)}"


def get_marcas() -> list[str]:
    with get_connection() as conn:
        cur = conn.execute(
            "SELECT DISTINCT marca FROM motores WHERE marca IS NOT NULL ORDER BY marca"
        )
        return [row[0] for row in cur.fetchall()]


def get_servicios_para_lista(lista_num: int | None) -> list[dict]:
    col = f"l{lista_num}" if lista_num and 1 <= lista_num <= 13 else "NULL"
    with get_connection() as conn:
        cur = conn.execute(
            f"SELECT id, item_num, descripcion, {col} AS precio FROM servicios ORDER BY item_num"
        )
        return [
            {"id": r[0], "item_num": r[1], "descripcion": r[2], "precio": r[3]}
            for r in cur.fetchall()
        ]


def get_motores(marca: str | None = None, busqueda: str | None = None) -> list[dict]:
    # usado_antes: el motor ya tiene al menos un presupuesto hecho. Van primero
    # (mismo orden alfabético entre ellos), con un fondo distinto en la UI, para
    # no tener que buscarlos entre el resto cada vez que se repite un motor.
    query = """
        SELECT id, indice, motor, marca, lista_num,
               cilindros, tipo, cilindrada, diametro, origen,
               EXISTS(SELECT 1 FROM presupuestos p WHERE p.motor_id = motores.id) AS usado_antes
        FROM motores
        WHERE 1=1
    """
    params: list = []

    if marca and marca.upper() != "TODOS":
        query += " AND marca = ?"
        params.append(marca)

    if busqueda:
        term = f"%{busqueda}%"
        query += " AND (motor LIKE ? OR marca LIKE ? OR indice LIKE ?)"
        params.extend([term, term, term])

    query += " ORDER BY usado_antes DESC, marca, motor"

    with get_connection() as conn:
        cur = conn.execute(query, params)
        cols = ["id", "indice", "motor", "marca", "lista_num",
                "cilindros", "tipo", "cilindrada", "diametro", "origen", "usado_antes"]
        return [dict(zip(cols, row)) for row in cur.fetchall()]
