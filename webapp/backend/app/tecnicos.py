"""
Catálogos técnicos: los que permiten buscar una pieza POR SUS MEDIDAS
("una camisa de Ø 104,5 con pestaña de 4,45") en vez de por código o
descripción, que es lo que ya hace `crac.py`.

De dónde salen: de los catálogos de cada fabricante, convertidos a
`CRAC/tecnicos/*.json` por los scripts de `scripts/` (`convertir_tecnicos.js`
para guías y subconjuntos, `convertir_camisas_fadecya.py` para camisas). Son
1.500 fichas que cambian solo cuando se procesa un catálogo nuevo (unas pocas
veces al año), así que viven en git y se cargan en memoria — no van a SQLite.
Sin tabla no hay migración, ni paso de importación, ni riesgo de que un deploy
deje producción con el buscador vacío: alcanza con el `git pull`.

Lo que sí sale de la base es el PRECIO y el STOCK. La ficha técnica trae el
código del proveedor ya resuelto (ver el encabezado del script de conversión) y
acá se busca contra `crac_repuestos`, que se actualiza todos los días con el
Excel del proveedor. Copiar los precios del otro repo habría dejado dos listas
desincronizadas desde el primer día.

Regla de confidencialidad del negocio: igual que en `crac.py`, el nombre del
proveedor puede aparecer en esta capa de datos pero nunca en pantalla.
"""
import json
import os
import re

from . import config, texto
from .db import get_connection

TECNICOS_DIR = os.path.join(config.REPO_DIR, "CRAC", "tecnicos")

# Tope de resultados, igual que el buscador web del que sale esto: pasada esa
# cantidad la respuesta se recorta y se avisa (`capped`), porque una búsqueda
# que devuelve 400 camisas no es una búsqueda, es el catálogo entero.
LIMITE_RESULTADOS = 100

# Tolerancia por defecto de los filtros de medida, en milímetros. Es la del
# buscador original: el taller mide con calibre y nunca da exacto.
TOLERANCIA_DEFECTO = 0.5

# Qué se puede filtrar en cada familia. `medidas` son los campos numéricos: cada
# uno se filtra con `<campo>` y `tol_<campo>`. El orden es el que usa la
# pantalla para armar los filtros.
#
# `filtro_proveedor` es la casilla "Solo las que tiene el proveedor", tildada por
# defecto. Va en las cinco familias: los catálogos técnicos son los del
# fabricante y siempre traen más piezas de las que el proveedor vende, así que
# la búsqueda arranca mostrando lo que se puede pedir hoy y la casilla abre el
# catálogo entero cuando hace falta saber qué existe.
ESPEC = {
    "camisas": {
        "label": "Camisas",
        "medidas": ["diam_int", "diam_ext_cil", "alt_pest", "largo"],
        # Ø de sobremedida: no es un campo de la ficha sino de cada sobremedida
        # de la lista, así que se filtra aparte (ver `_sobremedidas_match`).
        "sobremedidas": True,
        "filtro_proveedor": True,
    },
    "guias": {
        "label": "Guías de válvulas",
        "medidas": ["diam_vastago", "diam_ext", "largo"],
        "tipo": True,
        "filtro_proveedor": True,
        # Forma del cuerpo (la letra de "A-1-6"): se filtra por la letra sola,
        # que es lo que distingue una guía recta de una con pestaña. Los
        # detalles numerados afinan demasiado para ser un filtro.
        "forma": True,
    },
    "subconjuntos": {
        "label": "Subconjuntos",
        "medidas": ["diam_piston", "alt_piston", "diam_perno"],
        "descripcion": True,
        "filtro_proveedor": True,
    },
    # Los mismos filtros que subconjuntos, a propósito: es la misma pieza
    # buscada de la misma manera (Ø del pistón, alto, perno), solo que suelta.
    "pistones": {
        "label": "Pistones",
        "medidas": ["diam_piston", "alt_piston", "diam_perno"],
        "descripcion": True,
        "filtro_proveedor": True,
    },
    "bujes_biela": {
        "label": "Bujes de biela",
        "medidas": ["diam_perno", "diam_int", "ancho"],
        # El Ø exterior de un buje no es un número sino una familia: el STD y
        # hasta siete sobremedidas. Se filtra como en camisas, contra la lista
        # entera, y la pantalla marca cuál fue la que matcheó.
        "sobremedidas": True,
        "filtro_proveedor": True,
    },
}

_cache: dict[str, list[dict]] = {}


def _normalizar_forma(valor) -> str | None:
    """
    La forma de una guía es la letra del cuerpo más los detalles numerados que
    tenga: "A-1-6" es el cuerpo A con los detalles 1 y 6 de la lámina del
    catálogo RYC.

    Algunas fichas vienen sin los guiones ("A1", "F1") o con dos detalles
    pegados ("P36", "A-13"), porque el catálogo de origen los escribió así. Como
    la lámina define los detalles del 1 al 8, un número de más de un dígito solo
    puede ser dos detalles pegados: se separan. Lo que no encaje en
    "letra + dígitos" se deja tal cual vino — mejor un código raro en pantalla
    que uno inventado.
    """
    texto = str(valor or "").strip().upper()
    if not texto:
        return None
    m = re.match(r"^([A-Z]+)([\d\s-]*)$", texto)
    if not m:
        return texto
    letra, resto = m.group(1), m.group(2)
    digitos = re.findall(r"\d", resto)
    return "-".join([letra, *digitos]) if digitos else letra


def _catalogo(familia: str) -> list[dict]:
    """
    Las fichas de una familia, cacheadas por proceso. Una familia sin archivo
    devuelve vacío en vez de reventar: así se puede sumar un catálogo nuevo sin
    tocar el código, y si falta, la pantalla simplemente no muestra la pestaña.
    """
    if familia in _cache:
        return _cache[familia]

    path = os.path.join(TECNICOS_DIR, f"{familia}.json")
    if not os.path.exists(path):
        _cache[familia] = []
        return []

    with open(path, encoding="utf-8") as f:
        fichas = json.load(f)

    for ficha in fichas:
        extra = ficha.get("extra") or {}
        # Los tres textos normalizados se calculan una vez y quedan en memoria:
        # es la misma idea que `crac_repuestos.busqueda`, que se guarda para no
        # normalizar 64.000 filas en cada tecla.
        ficha["_codigo"] = texto.normalizar(
            f"{ficha.get('codigo') or ''} {ficha.get('codigo_fab') or ''}"
        )
        ficha["_aplicacion"] = texto.normalizar(
            " ".join(
                str(v)
                for v in (ficha.get("aplicacion"), ficha.get("descripcion"), extra.get("motor"))
                if v
            )
        )
        ficha["_descripcion"] = texto.normalizar(ficha.get("descripcion") or "")
        if "forma" in extra:
            # La forma se normaliza acá y no en el JSON: así vale también para
            # el catálogo que se regenere mañana, sin depender de que el script
            # de conversión se acuerde.
            extra["forma"] = _normalizar_forma(extra.get("forma"))
            ficha["_forma_base"] = (extra["forma"] or "")[:1]

    _cache[familia] = fichas
    return fichas


def get_familias() -> list[dict]:
    """Las familias que tienen catálogo cargado, con cuántas fichas hay en cada una."""
    familias = []
    for id_familia, espec in ESPEC.items():
        fichas = _catalogo(id_familia)
        if fichas:
            familias.append({
                "id": id_familia,
                "label": espec["label"],
                "total": len(fichas),
                "filtro_proveedor": bool(espec.get("filtro_proveedor")),
            })
    return familias


# ─── Filtros ─────────────────────────────────────────────────────────────────
def _numero(valor):
    try:
        return float(str(valor).replace(",", "."))
    except (TypeError, ValueError):
        return None


def _rango(valor, tolerancia) -> tuple[float, float] | None:
    """
    El rango de una medida buscada, o None si no se pidió filtrar por este campo.

    La tolerancia puede llevar signo, y el signo la hace de un solo lado:

        "0.5"  → 40 ± 0,5      (39,50 a 40,50)  — lo de siempre
        "+"    → 40 o más      (40 a infinito)
        "-"    → 40 o menos    (de -infinito a 40)
        "+2"   → 40 a 42
        "-2"   → 38 a 40

    Sale de cómo busca el taller: una guía de 40 de largo entra donde va una de
    50, así que "40 y para arriba" encuentra en un intento lo que con ± exige
    adivinar la tolerancia. El signo solo, sin número, no pone tope.
    """
    centro = _numero(valor)
    if centro is None:
        return None

    tol = str(tolerancia or "").strip().replace(",", ".")
    signo = tol[0] if tol[:1] in ("+", "-") else ""
    resto = tol[1:].strip() if signo else tol

    margen = _numero(resto)
    if margen is None:
        # Sin número: con signo no hay tope de ese lado, sin signo vale el ±0,5
        # de siempre.
        margen = float("inf") if signo else TOLERANCIA_DEFECTO
    margen = abs(margen)

    if signo == "+":
        return centro, centro + margen
    if signo == "-":
        return centro - margen, centro
    return centro - margen, centro + margen


def _en_rango(valor, rango: tuple[float, float]) -> bool:
    """
    Una medida que la ficha no tiene NO entra en el rango. Es a propósito: si
    alguien filtra por largo, una ficha sin largo cargado no es una respuesta,
    es un dato que falta.

    Una medida puede traer más de un valor y no uno solo: el Ø exterior STD de
    un buje viene con su banda de tolerancia (35,04 y 35,07) y un buje
    escalonado tiene dos anchos (14,60 y 20,20). Entra si CUALQUIERA de ellos
    cae en el rango pedido — buscando 14,6 o buscando 20,2 aparece el mismo
    buje escalonado, pero buscando 17 no aparece ninguno, porque un buje de
    14,60/20,20 no tiene ningún ancho de 17.
    """
    if valor is None:
        return False
    if isinstance(valor, (list, tuple)):
        return any(_en_rango(v, rango) for v in valor)
    return rango[0] <= valor <= rango[1]


def _contiene(texto_normalizado: str, busqueda: str) -> bool:
    """Todas las palabras de la búsqueda, en cualquier orden — la regla de `texto.py`."""
    return all(p in texto_normalizado for p in texto.palabras(busqueda))


def _sobremedidas_match(ficha: dict, rango, etiqueta) -> list | None:
    """
    Las sobremedidas de la ficha que caen dentro del rango pedido. Devuelve None
    si la ficha queda descartada. Sin filtros de sobremedida devuelve [].
    """
    sobremedidas = (ficha.get("extra") or {}).get("sobremedidas") or []
    if etiqueta and not any(s.get("label") == etiqueta for s in sobremedidas):
        return None
    if not rango:
        return []
    dentro = [s for s in sobremedidas if _en_rango(s.get("valor"), rango)]
    return dentro or None


def buscar(familia: str, filtros: dict) -> dict:
    """
    Las fichas de `familia` que cumplen todos los filtros, con precio y stock de
    la base. Sin ningún filtro devuelve vacío: mostrar el catálogo entero no le
    sirve a nadie y son 100 filas de ruido.
    """
    espec = ESPEC.get(familia)
    if not espec:
        return {"total": 0, "capped": False, "sin_proveedor": 0, "resultados": []}

    rangos = {
        campo: _rango(filtros.get(campo), filtros.get(f"tol_{campo}"))
        for campo in espec["medidas"]
    }
    rangos = {campo: r for campo, r in rangos.items() if r}

    codigo = (filtros.get("codigo") or "").strip()
    aplicacion = (filtros.get("aplicacion") or "").strip()
    descripcion = (filtros.get("descripcion") or "").strip() if espec.get("descripcion") else ""
    tipo = (filtros.get("tipo") or "").strip() if espec.get("tipo") else ""
    forma = (filtros.get("forma") or "").strip().upper() if espec.get("forma") else ""

    rango_sobre = etiqueta_sobre = None
    if espec.get("sobremedidas"):
        rango_sobre = _rango(filtros.get("diam_sobremedida"), filtros.get("tol_diam_sobremedida"))
        etiqueta_sobre = (filtros.get("sobremedida") or "").strip() or None

    # La búsqueda arranca mostrando lo que el proveedor tiene, y `solo_crac=0`
    # la abre al catálogo entero, para saber qué existe aunque haya que
    # conseguirlo por otro lado (ver `filtro_proveedor` en ESPEC).
    solo_crac = (
        espec.get("filtro_proveedor")
        and str(filtros.get("solo_crac", "1")).strip() not in ("0", "false", "no")
    )

    hay_filtro = any([rangos, codigo, aplicacion, descripcion, tipo, forma, rango_sobre, etiqueta_sobre])
    if not hay_filtro:
        return {"total": 0, "capped": False, "sin_proveedor": 0, "resultados": []}

    encontradas = []
    # Cuántas quedaron afuera solo por no estar en la lista del proveedor: la
    # pantalla lo dice, así se sabe que destildando el filtro hay más.
    ocultas = 0
    for ficha in _catalogo(familia):
        if codigo and not _contiene(ficha["_codigo"], codigo):
            continue
        if aplicacion and not _contiene(ficha["_aplicacion"], aplicacion):
            continue
        if descripcion and not _contiene(ficha["_descripcion"], descripcion):
            continue
        if tipo and ficha.get("tipo") != tipo:
            continue
        if forma and ficha.get("_forma_base") != forma:
            continue

        medidas = ficha.get("medidas") or {}
        if any(not _en_rango(medidas.get(campo), rango) for campo, rango in rangos.items()):
            continue

        match_sobre = []
        if espec.get("sobremedidas"):
            match_sobre = _sobremedidas_match(ficha, rango_sobre, etiqueta_sobre)
            if match_sobre is None:
                continue

        if solo_crac and not ficha.get("codigos_crac"):
            ocultas += 1
            continue

        encontradas.append((ficha, match_sobre))
        if len(encontradas) > LIMITE_RESULTADOS:
            break

    capped = len(encontradas) > LIMITE_RESULTADOS
    encontradas = encontradas[:LIMITE_RESULTADOS]

    precios = _precios([f for f, _ in encontradas])
    resultados = [_salida(ficha, match, precios) for ficha, match in encontradas]
    return {
        "total": len(resultados),
        "capped": capped,
        "sin_proveedor": ocultas,
        "resultados": resultados,
    }


# ─── Precio y stock, de la base ──────────────────────────────────────────────
def _precios(fichas: list[dict]) -> dict[str, dict]:
    """
    Precio y stock de todos los códigos del proveedor que aparecen en estas
    fichas, en una sola consulta. Son como mucho 100 fichas, así que la lista de
    códigos es chica y entra holgada en un IN.
    """
    codigos = sorted({c["codigo"] for f in fichas for c in (f.get("codigos_crac") or [])})
    if not codigos:
        return {}

    huecos = ",".join("?" * len(codigos))
    with get_connection() as conn:
        filas = conn.execute(
            f"SELECT codigo, precio, stock FROM crac_repuestos WHERE codigo IN ({huecos})",
            codigos,
        ).fetchall()
    return {f["codigo"]: {"precio": f["precio"], "stock": bool(f["stock"])} for f in filas}


def _mejor_codigo(ficha: dict, precios: dict) -> dict:
    """
    Cuál de los códigos del proveedor de esta ficha se muestra. Camisas y guías
    tienen uno solo; un subconjunto Mahle tiene uno por sobremedida, y ahí se
    elige el que más le sirve al taller: con stock y precio antes que con precio
    suelto, y con precio antes que sin nada.
    """
    candidatos = ficha.get("codigos_crac") or []
    if not candidatos:
        return {"codigo_crac": None, "medida_crac": None, "precio": None, "stock": None}

    def puntaje(c):
        p = precios.get(c["codigo"]) or {}
        return (bool(p.get("stock")) and p.get("precio") is not None, p.get("precio") is not None)

    mejor = max(candidatos, key=puntaje)
    datos = precios.get(mejor["codigo"]) or {}
    return {
        "codigo_crac": mejor["codigo"],
        "medida_crac": mejor.get("medida"),
        "precio": datos.get("precio"),
        "stock": datos.get("stock"),
    }


def _salida(ficha: dict, sobremedidas_match: list, precios: dict) -> dict:
    """La ficha como la lee la pantalla, sin los campos internos de búsqueda."""
    salida = {
        "codigo": ficha.get("codigo"),
        "codigo_fab": ficha.get("codigo_fab"),
        "marca": ficha.get("marca"),
        "aplicacion": ficha.get("aplicacion"),
        "descripcion": ficha.get("descripcion"),
        "tipo": ficha.get("tipo"),
        "medidas": ficha.get("medidas") or {},
        "extra": ficha.get("extra") or {},
        "sobremedidas_match": sobremedidas_match,
    }
    salida.update(_mejor_codigo(ficha, precios))
    return salida
