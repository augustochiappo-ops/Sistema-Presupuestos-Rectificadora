"""
Catálogos técnicos: los que permiten buscar una pieza POR SUS MEDIDAS
("una camisa de Ø 104,5 con pestaña de 4,45") en vez de por código o
descripción, que es lo que ya hace `crac.py`.

De dónde salen: del repo del buscador web del negocio, convertidos con
`scripts/convertir_tecnicos.js` a `CRAC/tecnicos/*.json`. Son 1.396 fichas que
cambian solo cuando se procesa un catálogo nuevo (unas pocas veces al año), así
que viven en git y se cargan en memoria — no van a SQLite. Sin tabla no hay
migración, ni paso de importación, ni riesgo de que un deploy deje producción
con el buscador vacío: alcanza con el `git pull`.

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
ESPEC = {
    "camisas": {
        "label": "Camisas",
        "medidas": ["diam_int", "diam_ext_cil", "alt_pest", "largo"],
        # Ø de sobremedida: no es un campo de la ficha sino de cada sobremedida
        # de la lista, así que se filtra aparte (ver `_sobremedidas_match`).
        "sobremedidas": True,
    },
    "guias": {
        "label": "Guías de válvulas",
        "medidas": ["diam_vastago", "diam_ext", "largo"],
        "tipo": True,
    },
    "subconjuntos": {
        "label": "Subconjuntos",
        "medidas": ["diam_piston", "alt_piston", "diam_perno"],
        "descripcion": True,
    },
}

_cache: dict[str, list[dict]] = {}


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

    _cache[familia] = fichas
    return fichas


def get_familias() -> list[dict]:
    """Las familias que tienen catálogo cargado, con cuántas fichas hay en cada una."""
    familias = []
    for id_familia, espec in ESPEC.items():
        fichas = _catalogo(id_familia)
        if fichas:
            familias.append({"id": id_familia, "label": espec["label"], "total": len(fichas)})
    return familias


# ─── Filtros ─────────────────────────────────────────────────────────────────
def _rango(valor, tolerancia) -> tuple[float, float] | None:
    """`valor ± tolerancia`, o None si no se pidió filtrar por este campo."""
    try:
        centro = float(str(valor).replace(",", "."))
    except (TypeError, ValueError):
        return None
    try:
        margen = abs(float(str(tolerancia).replace(",", ".")))
    except (TypeError, ValueError):
        margen = TOLERANCIA_DEFECTO
    return centro - margen, centro + margen


def _en_rango(valor, rango: tuple[float, float]) -> bool:
    """
    Una medida que la ficha no tiene NO entra en el rango. Es a propósito: si
    alguien filtra por largo, una ficha sin largo cargado no es una respuesta,
    es un dato que falta.
    """
    if valor is None:
        return False
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
        return {"total": 0, "capped": False, "resultados": []}

    rangos = {
        campo: _rango(filtros.get(campo), filtros.get(f"tol_{campo}"))
        for campo in espec["medidas"]
    }
    rangos = {campo: r for campo, r in rangos.items() if r}

    codigo = (filtros.get("codigo") or "").strip()
    aplicacion = (filtros.get("aplicacion") or "").strip()
    descripcion = (filtros.get("descripcion") or "").strip() if espec.get("descripcion") else ""
    tipo = (filtros.get("tipo") or "").strip() if espec.get("tipo") else ""

    rango_sobre = etiqueta_sobre = None
    if espec.get("sobremedidas"):
        rango_sobre = _rango(filtros.get("diam_sobremedida"), filtros.get("tol_diam_sobremedida"))
        etiqueta_sobre = (filtros.get("sobremedida") or "").strip() or None

    hay_filtro = any([rangos, codigo, aplicacion, descripcion, tipo, rango_sobre, etiqueta_sobre])
    if not hay_filtro:
        return {"total": 0, "capped": False, "resultados": []}

    encontradas = []
    for ficha in _catalogo(familia):
        if codigo and not _contiene(ficha["_codigo"], codigo):
            continue
        if aplicacion and not _contiene(ficha["_aplicacion"], aplicacion):
            continue
        if descripcion and not _contiene(ficha["_descripcion"], descripcion):
            continue
        if tipo and ficha.get("tipo") != tipo:
            continue

        medidas = ficha.get("medidas") or {}
        if any(not _en_rango(medidas.get(campo), rango) for campo, rango in rangos.items()):
            continue

        match_sobre = []
        if espec.get("sobremedidas"):
            match_sobre = _sobremedidas_match(ficha, rango_sobre, etiqueta_sobre)
            if match_sobre is None:
                continue

        encontradas.append((ficha, match_sobre))
        if len(encontradas) > LIMITE_RESULTADOS:
            break

    capped = len(encontradas) > LIMITE_RESULTADOS
    encontradas = encontradas[:LIMITE_RESULTADOS]

    precios = _precios([f for f, _ in encontradas])
    resultados = [_salida(ficha, match, precios) for ficha, match in encontradas]
    return {"total": len(resultados), "capped": capped, "resultados": resultados}


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
