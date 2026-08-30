"""
Precios propios de mano de obra: la capa del taller sobre la lista de la Cámara.

Por qué existe
--------------
La lista de FACRA es un punto de partida, no la tarifa del taller. Hasta ahora,
el dueño corregía el precio de un renglón mientras armaba el presupuesto y esa
corrección moría ahí (se congelaba en presupuesto_items y el presupuesto
siguiente volvía a arrancar de FACRA), así que reescribía los mismos precios en
cada cotización. Este módulo es donde esas correcciones se quedan.

Cómo se resuelve un precio
--------------------------
    precio_facra (servicios.l<lista_num>)
       × (1 + ajuste_general/100)      si NO hay precio propio
       precio_propio                   si lo hay — PISA, no se le suma el general
       × (1 + ajuste_pct/100)          el ajuste de ESE presupuesto, aplicado
                                       después por quien cotiza

Las dos reglas que definen el diseño, y por qué:

1. **El ajuste general no pisa un precio propio.** El % general es el atajo para
   "la Cámara viene atrasada, subí todo": aplica sobre lo que el dueño NO tarifó
   a mano. Donde puso su precio, manda el suyo — si no, tocar el % le movería en
   silencio los precios que justamente decidió fijar.

2. **Un precio propio SÍ recibe el ajuste_pct del presupuesto.** Un precio propio
   es la lista del taller: lo mismo que la de FACRA pero suya. El ajuste_pct es
   la palanca de negociación de esa cotización puntual ("a este cliente -10%"), y
   si no alcanzara a los precios propios, un descuento dejaría afuera justo los
   renglones que el dueño tarifó. Distinto del precio pisado A MANO dentro del
   presupuesto, que es una decisión de ese presupuesto y no recibe el ajuste
   (ver _resolver_items en routes/presupuestos.py).

Ese ajuste_pct no se aplica acá: lo aplica quien cotiza, sobre el precio que este
módulo ya resolvió. Acá termina la "lista vigente del taller".

Punto de enganche
-----------------
`aplicar_precios_propios()` se llama desde facra.get_servicios_para_lista(), que es el ÚNICO
lugar de todo el backend donde se lee un precio de mano de obra. Sus tres
llamadores (los servicios de un motor, el armado del presupuesto y la
recotización) quedan cubiertos sin tocarlos.
"""
from datetime import datetime

from .db import get_connection
from .helpers import pesos

# Las trece listas de la Cámara. Un motor apunta a una por su lista_num, y el
# precio de un servicio sale de la columna l<n> correspondiente.
LISTAS = tuple(range(1, 14))

_CLAVE_AJUSTE = "ajuste_mano_obra_pct"


def lista_valida(lista_num) -> bool:
    try:
        return int(lista_num) in LISTAS
    except (TypeError, ValueError):
        return False


# ─── Ajuste general sobre toda la lista de la Cámara ──────────────────────────
def get_ajuste_general_pct() -> float:
    """% de aumento (o descuento) sobre la lista de FACRA. 0 = sin ajuste."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT valor FROM app_meta WHERE clave = ?", (_CLAVE_AJUSTE,)
        ).fetchone()
    if not row or row[0] is None:
        return 0.0
    try:
        return float(row[0])
    except (TypeError, ValueError):
        return 0.0


def set_ajuste_general_pct(pct) -> float:
    pct = float(pct or 0)
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO app_meta (clave, valor) VALUES (?, ?) "
            "ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor",
            (_CLAVE_AJUSTE, str(pct)),
        )
    return pct


# ─── Lectura ──────────────────────────────────────────────────────────────────
def get_propios(lista_num) -> dict:
    """{servicio_id: fila} de los precios propios de una lista."""
    if not lista_valida(lista_num):
        return {}
    with get_connection() as conn:
        filas = conn.execute(
            """
            SELECT servicio_id, precio, precio_facra_al_fijar, origen,
                   presupuesto_id, actualizado_en
              FROM precios_mano_obra
             WHERE lista_num = ?
            """,
            (int(lista_num),),
        ).fetchall()
    cols = ["servicio_id", "precio", "precio_facra_al_fijar", "origen",
            "presupuesto_id", "actualizado_en"]
    return {f[0]: dict(zip(cols, f)) for f in filas}


def aplicar_precios_propios(servicios: list[dict], lista_num) -> list[dict]:
    """
    Superpone los precios propios y el ajuste general sobre las filas que
    devuelve FACRA. Cada fila sale con:

        precio       — lo que vale HOY para el taller (es el que usa todo el
                       sistema: el wizard, el guardado y la recotización)
        precio_facra — el de la Cámara, sin tocar, para poder mostrar de dónde
                       sale el número
        es_propio    — True si el precio lo fijó el taller
        desfasado    — True si la Cámara se movió desde que se fijó el propio

    Devuelve filas nuevas (no muta las de entrada).
    """
    propios = get_propios(lista_num)
    ajuste = get_ajuste_general_pct()
    factor = 1 + (ajuste / 100)

    salida = []
    for s in servicios:
        fila = dict(s)
        facra = s.get("precio")
        fila["precio_facra"] = facra

        propio = propios.get(s.get("id"))
        if propio:
            fila["precio"] = pesos(propio["precio"])
            fila["es_propio"] = True
            fila["precio_propio_fijado_en"] = propio["actualizado_en"]
            fila["origen_propio"] = propio["origen"]
            # La Cámara se movió desde que se fijó este precio: hay que
            # repasarlo. Se compara en pesos enteros, que es la unidad en la que
            # el sistema muestra y cobra; un decimal de diferencia no es noticia.
            al_fijar = propio["precio_facra_al_fijar"]
            fila["desfasado"] = (
                al_fijar is not None
                and facra is not None
                and pesos(al_fijar) != pesos(facra)
            )
            fila["precio_facra_al_fijar"] = al_fijar
        else:
            # Sin precio propio manda la Cámara con el ajuste general. Con
            # ajuste 0 el precio queda igual que siempre (pesos() lo redondea,
            # que es lo que ya hacían todos los consumidores).
            fila["precio"] = pesos(facra * factor) if facra is not None else None
            fila["es_propio"] = False
            fila["desfasado"] = False

        salida.append(fila)
    return salida


def _precios_facra(conn, servicio_id) -> dict:
    """{lista_num: precio} de un servicio, tal cual está en la lista de FACRA."""
    cols = ", ".join(f"l{n}" for n in LISTAS)
    row = conn.execute(
        f"SELECT {cols} FROM servicios WHERE id = ?", (servicio_id,)
    ).fetchone()
    if not row:
        return {}
    return {n: row[i] for i, n in enumerate(LISTAS)}


def listar_propios() -> list[dict]:
    """
    Todo lo que el taller tarifó, de lo más reciente a lo más viejo, con el
    precio de FACRA de hoy al lado y el flag de desfasado. Es lo que alimenta el
    apartado "Mis precios", que es lo que hace auditable a toda la feature: sin
    esta vista, guardar precios desde el wizard sería sembrar cambios invisibles.
    """
    with get_connection() as conn:
        filas = conn.execute(
            """
            SELECT p.servicio_id, p.lista_num, p.precio, p.precio_facra_al_fijar,
                   p.origen, p.presupuesto_id, p.actualizado_en,
                   s.item_num, s.descripcion
              FROM precios_mano_obra p
              JOIN servicios s ON s.id = p.servicio_id
             ORDER BY p.actualizado_en DESC, s.item_num, p.lista_num
            """
        ).fetchall()

        salida = []
        for f in filas:
            (servicio_id, lista_num, precio, al_fijar, origen,
             presupuesto_id, actualizado_en, item_num, descripcion) = f
            facra_hoy = _precios_facra(conn, servicio_id).get(lista_num)
            salida.append({
                "servicio_id": servicio_id,
                "lista_num": lista_num,
                "precio": pesos(precio),
                "precio_facra": pesos(facra_hoy) if facra_hoy is not None else None,
                "precio_facra_al_fijar": pesos(al_fijar) if al_fijar is not None else None,
                "desfasado": (
                    al_fijar is not None
                    and facra_hoy is not None
                    and pesos(al_fijar) != pesos(facra_hoy)
                ),
                "origen": origen,
                "presupuesto_id": presupuesto_id,
                "actualizado_en": actualizado_en,
                "item_num": item_num,
                "descripcion": descripcion,
            })
        return salida


# ─── Propagación proporcional a las trece listas ──────────────────────────────
def previsualizar_propagacion(servicio_id, lista_num, precio) -> list[dict]:
    """
    Qué precio quedaría en cada una de las trece listas si el precio `precio`
    fijado en la lista `lista_num` se propagara manteniendo la curva de FACRA de
    ESTE servicio: precio_n = precio × (l_n / l_k).

    Se usa la curva del propio servicio y no una escala global porque no existe
    tal escala: cada servicio escala distinto entre listas (medido sobre los
    datos reales, el ratio l8/l1 va de 1,0 a 4,2 según el ítem). Respetar la
    curva del ítem conserva la lógica de tamaño de motor que la Cámara ya pensó.

    Si la lista de referencia no tiene precio en FACRA (o es 0) no hay ratio
    posible: se devuelve `precio: None` en las demás y solo se puede fijar la
    que se está editando. Hay 5 de 235 servicios sin las trece listas cargadas.

    No escribe nada: es la vista previa que se muestra ANTES de confirmar.
    """
    with get_connection() as conn:
        facra = _precios_facra(conn, servicio_id)
    if not facra:
        return []

    base = facra.get(int(lista_num))
    salida = []
    for n in LISTAS:
        facra_n = facra.get(n)
        if n == int(lista_num):
            propuesto = pesos(precio)
        elif base and base > 0 and facra_n:
            propuesto = pesos(float(precio) * (facra_n / base))
        else:
            propuesto = None
        salida.append({
            "lista_num": n,
            "precio_facra": pesos(facra_n) if facra_n is not None else None,
            "precio_propuesto": propuesto,
        })
    return salida


# ─── Escritura ────────────────────────────────────────────────────────────────
def _escribir(conn, servicio_id, lista_num, precio, facra_al_fijar,
              origen, presupuesto_id, ahora):
    """Un precio propio, con su renglón de historial. Sin commit (lo hace quien llama)."""
    antes = conn.execute(
        "SELECT precio FROM precios_mano_obra WHERE servicio_id = ? AND lista_num = ?",
        (servicio_id, lista_num),
    ).fetchone()

    conn.execute(
        """
        INSERT INTO precios_mano_obra
            (servicio_id, lista_num, precio, precio_facra_al_fijar, origen,
             presupuesto_id, actualizado_en)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(servicio_id, lista_num) DO UPDATE SET
            precio = excluded.precio,
            precio_facra_al_fijar = excluded.precio_facra_al_fijar,
            origen = excluded.origen,
            presupuesto_id = excluded.presupuesto_id,
            actualizado_en = excluded.actualizado_en
        """,
        (servicio_id, lista_num, precio, facra_al_fijar, origen,
         presupuesto_id, ahora),
    )
    conn.execute(
        """
        INSERT INTO precios_mano_obra_historial
            (servicio_id, lista_num, precio_antes, precio_despues, origen,
             presupuesto_id, fecha)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (servicio_id, lista_num, antes[0] if antes else None, precio, origen,
         presupuesto_id, ahora),
    )


def guardar(servicio_id, lista_num, precio, propagar=False,
            origen="pantalla", presupuesto_id=None) -> list[dict]:
    """
    Fija un precio propio. Con `propagar`, lo fija además en las otras doce
    listas manteniendo la curva de FACRA (ver previsualizar_propagacion).

    Devuelve las filas escritas [{lista_num, precio}]. Todo en una transacción:
    una propagación no puede quedar a medias.
    """
    servicio_id = int(servicio_id)
    lista_num = int(lista_num)
    precio = pesos(precio)
    ahora = datetime.now().isoformat(timespec="seconds")

    if propagar:
        objetivo = [
            (f["lista_num"], f["precio_propuesto"])
            for f in previsualizar_propagacion(servicio_id, lista_num, precio)
            if f["precio_propuesto"] is not None
        ]
    else:
        objetivo = [(lista_num, precio)]

    with get_connection() as conn:
        facra = _precios_facra(conn, servicio_id)
        escritas = []
        for n, p in objetivo:
            _escribir(conn, servicio_id, n, p, facra.get(n), origen,
                      presupuesto_id, ahora)
            escritas.append({"lista_num": n, "precio": p})
    return escritas


def guardar_lote(lista_num, precios, origen="presupuesto",
                 presupuesto_id=None) -> list[dict]:
    """
    Varios precios de una misma lista de una sola vez: es lo que usa el wizard
    cuando se confirma el resumen de Revisión ("editaste 3 precios, ¿los guardo
    como tuyos?"). `precios` es [{servicio_id, precio}].
    """
    lista_num = int(lista_num)
    ahora = datetime.now().isoformat(timespec="seconds")
    escritas = []
    with get_connection() as conn:
        for item in precios:
            servicio_id = int(item["servicio_id"])
            precio = pesos(item["precio"])
            if precio is None or precio <= 0:
                continue
            facra = _precios_facra(conn, servicio_id)
            _escribir(conn, servicio_id, lista_num, precio, facra.get(lista_num),
                      origen, presupuesto_id, ahora)
            escritas.append({"servicio_id": servicio_id, "precio": precio})
    return escritas


def borrar(servicio_id, lista_num=None) -> int:
    """
    El ↺: saca el precio propio y el servicio vuelve a valer lo de la Cámara.
    Sin `lista_num`, lo saca de las trece. Queda registrado en el historial con
    precio_despues NULL, para que se pueda ver que hubo una vuelta atrás.
    """
    servicio_id = int(servicio_id)
    ahora = datetime.now().isoformat(timespec="seconds")
    with get_connection() as conn:
        if lista_num is None:
            filas = conn.execute(
                "SELECT lista_num, precio FROM precios_mano_obra WHERE servicio_id = ?",
                (servicio_id,),
            ).fetchall()
        else:
            filas = conn.execute(
                "SELECT lista_num, precio FROM precios_mano_obra "
                "WHERE servicio_id = ? AND lista_num = ?",
                (servicio_id, int(lista_num)),
            ).fetchall()

        for n, precio_antes in filas:
            conn.execute(
                "DELETE FROM precios_mano_obra WHERE servicio_id = ? AND lista_num = ?",
                (servicio_id, n),
            )
            conn.execute(
                """
                INSERT INTO precios_mano_obra_historial
                    (servicio_id, lista_num, precio_antes, precio_despues,
                     origen, presupuesto_id, fecha)
                VALUES (?, ?, ?, NULL, 'pantalla', NULL, ?)
                """,
                (servicio_id, n, precio_antes, ahora),
            )
    return len(filas)


def tiene_precio_propio(conn, servicio_id) -> bool:
    """
    ¿Este servicio tiene precio propio en alguna lista? Lo consulta
    facra.importar_lista_orientadora antes de borrar un servicio que ya no viene
    en la lista de la Cámara: un precio del taller no puede desaparecer en
    silencio en una reimportación. Recibe la conexión abierta porque se llama
    desde adentro de la transacción de importación.
    """
    return conn.execute(
        "SELECT 1 FROM precios_mano_obra WHERE servicio_id = ? LIMIT 1",
        (servicio_id,),
    ).fetchone() is not None
