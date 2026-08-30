"""
Módulo FACRA.
Lee los Excel de FACRA, parsea los datos y los guarda en SQLite.
Portado de la app de escritorio (src/data/facra.py) sin cambios de lógica.
"""
import re
import pandas as pd
from . import texto
from .db import get_connection
# Importadas por nombre y no como módulo (`from . import precios`) a propósito:
# importar_lista_orientadora tiene una variable local `precios` —los trece
# precios de la fila que está leyendo— que taparía al módulo. Ya pasó: el
# AttributeError quedaba tapado por el try/except de la importación y la
# reimportación fallaba entera devolviendo solo un mensaje de error.
from .precios import aplicar_precios_propios, tiene_precio_propio

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
            # Reimportar SIN romper lo que ya apunta a un motor. Un presupuesto y
            # la ficha de repuestos guardan el motor por su id; si borráramos y
            # recreáramos los motores (ids nuevos por AUTOINCREMENT), esos
            # vínculos quedarían colgados: el presupuesto perdería el nombre del
            # motor y la ficha quedaría huérfana. Por eso se reconcilia — el motor
            # que ya existe se ACTUALIZA en su lugar (mismo id) y solo los nuevos
            # se insertan. La identidad es el texto del motor, único en el
            # nomenclador; el 'indice' no sirve de clave (hay cuatro repetidos).
            existentes = {
                motor: mid for mid, motor in conn.execute(
                    "SELECT id, motor FROM motores WHERE origen = 'facra'"
                )
            }
            vistos: set[int] = set()

            count = 0
            for _, row in motores_df.iterrows():
                desc = str(row["motor"]).strip()
                detalles = _parse_motor(desc)

                try:
                    lista_num = int(float(row["lista"]))
                except (ValueError, TypeError):
                    lista_num = None

                indice = str(row["indice"]).strip()
                mid = existentes.get(desc)
                if mid is not None:
                    conn.execute(
                        """
                        UPDATE motores
                           SET indice = ?, marca = ?, lista_num = ?, cilindros = ?,
                               tipo = ?, cilindrada = ?, diametro = ?, origen = 'facra'
                         WHERE id = ?
                        """,
                        (indice, row["marca"], lista_num, detalles["cilindros"],
                         detalles["tipo"], detalles["cilindrada"], detalles["diametro"], mid),
                    )
                else:
                    cur = conn.execute(
                        """
                        INSERT INTO motores
                            (indice, motor, marca, lista_num, cilindros, tipo,
                             cilindrada, diametro, origen)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'facra')
                        """,
                        (indice, desc, row["marca"], lista_num, detalles["cilindros"],
                         detalles["tipo"], detalles["cilindrada"], detalles["diametro"]),
                    )
                    mid = cur.lastrowid
                vistos.add(mid)
                count += 1

            # Motores que estaban y ya no vienen en el nomenclador. Se borran solo
            # si nada los usa: uno con presupuesto, ficha o papelera se conserva
            # aunque salga de la lista, porque perderlo rompería ese trabajo (y
            # con las FK activas su borrado arrastraría la ficha en cascada).
            for mid in [m for m in existentes.values() if m not in vistos]:
                usado = conn.execute(
                    """
                    SELECT 1 FROM presupuestos            WHERE motor_id = ?
                    UNION ALL SELECT 1 FROM motor_repuesto_grupos  WHERE motor_id = ?
                    UNION ALL SELECT 1 FROM repuestos_ocultos_motor WHERE motor_id = ?
                    LIMIT 1
                    """,
                    (mid, mid, mid),
                ).fetchone()
                if not usado:
                    conn.execute("DELETE FROM motores WHERE id = ?", (mid,))

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
            # Igual que con los motores: un presupuesto guarda el servicio por su
            # id, así que se reconcilia en vez de borrar y recrear. La identidad
            # es (item_num, descripcion), única en la lista; el item_num solo no
            # alcanza (hay uno repetido con dos descripciones distintas).
            existentes = {
                (item_num, descripcion): sid
                for sid, item_num, descripcion in conn.execute(
                    "SELECT id, item_num, descripcion FROM servicios"
                )
            }
            vistos: set[int] = set()

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

                sid = existentes.get((item_num, descripcion))
                if sid is not None:
                    conn.execute(
                        """
                        UPDATE servicios
                           SET l1=?, l2=?, l3=?, l4=?, l5=?, l6=?, l7=?,
                               l8=?, l9=?, l10=?, l11=?, l12=?, l13=?
                         WHERE id = ?
                        """,
                        (*precios, sid),
                    )
                else:
                    cur = conn.execute(
                        """
                        INSERT INTO servicios
                            (item_num, descripcion, l1, l2, l3, l4, l5, l6, l7,
                             l8, l9, l10, l11, l12, l13)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (item_num, descripcion, *precios),
                    )
                    sid = cur.lastrowid
                vistos.add(sid)
                count += 1

            # Servicios que ya no vienen en la lista: se borran salvo que algún
            # presupuesto los use (ahí se conservan para no perder el renglón de
            # mano de obra que ya quedó cotizado) o que el taller les haya fijado
            # un precio propio. Lo segundo importa porque precios_mano_obra cuelga
            # de servicio_id con ON DELETE CASCADE: sin este chequeo, un servicio
            # que la Cámara saca de la lista se llevaría puesto el precio del
            # dueño, en silencio y en medio de una importación de rutina.
            for sid in [s for s in existentes.values() if s not in vistos]:
                usado = conn.execute(
                    "SELECT 1 FROM presupuesto_items WHERE servicio_id = ? LIMIT 1", (sid,)
                ).fetchone()
                if not usado and not tiene_precio_propio(conn, sid):
                    conn.execute("DELETE FROM servicios WHERE id = ?", (sid,))

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
    """
    Los servicios de mano de obra con el precio que rige HOY para el taller.

    Es el único lugar del backend donde se lee un precio de mano de obra, así que
    es acá donde se superpone la capa de precios propios (app/precios.py): el
    precio de la Cámara es el punto de partida, y arriba van el ajuste general y
    el precio que el taller haya fijado para ese servicio en esta lista. Sus tres
    llamadores —los servicios de un motor, el armado del presupuesto y la
    recotización— quedan cubiertos sin tocarlos.

    Cada fila trae, además de `precio` (el vigente), `precio_facra`, `es_propio` y
    `desfasado`, para que la pantalla pueda explicar de dónde sale el número en
    vez de mostrar un monto sin origen.
    """
    col = f"l{lista_num}" if lista_num and 1 <= lista_num <= 13 else "NULL"
    with get_connection() as conn:
        cur = conn.execute(
            f"SELECT id, item_num, descripcion, {col} AS precio FROM servicios ORDER BY item_num"
        )
        filas = [
            {"id": r[0], "item_num": r[1], "descripcion": r[2], "precio": r[3]}
            for r in cur.fetchall()
        ]
    return aplicar_precios_propios(filas, lista_num)


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

    # Por palabras sueltas, en cualquier orden y sin acentos: "fiat 2.8"
    # encuentra "FIAT DUCATO 2.8TD", y "citroen" encuentra "CITROËN".
    # norm() es la función que registra db.get_connection (ver app/texto.py).
    cond, params_busqueda = texto.condicion_like(
        ["norm(motor)", "norm(marca)", "norm(indice)"], busqueda
    )
    if cond:
        query += f" AND ({cond})"
        params.extend(params_busqueda)

    query += " ORDER BY usado_antes DESC, marca, motor"

    with get_connection() as conn:
        cur = conn.execute(query, params)
        cols = ["id", "indice", "motor", "marca", "lista_num",
                "cilindros", "tipo", "cilindrada", "diametro", "origen", "usado_antes"]
        return [dict(zip(cols, row)) for row in cur.fetchall()]
