#!/usr/bin/env python3
"""
Convierte el TXT de bujes de biela Indubrón al JSON que lee el buscador por
medidas.

    python3 scripts/convertir_bujes_indubron.py

Se corre A MANO, cuando llega una tanda nueva del catálogo Indubrón. La salida
(CRAC/tecnicos/bujes_biela.json) se commitea: es lo que hace que producción
tenga los datos apenas hace `git pull`, igual que las otras cuatro familias.

De dónde sale el TXT: del Excel "Indubrón.xlsm", hoja CATALOGO BIELA. Se
verificó fila por fila contra el Excel (190 filas, los 13 campos de cada una)
antes de commitearlo, así que acá se lee el TXT y no el .xlsm — el TXT es el
formato que ya usan las otras extracciones y no obliga a tener openpyxl.

Tres cosas que este script resuelve y por eso existe:

1. EL Ø EXTERIOR ES UNA FAMILIA, NO UN NÚMERO. Cada buje tiene el Ø exterior
   STD y hasta siete sobremedidas (003, 005, 010, 015, 020, 030 y 040). Se
   cargan como `extra.sobremedidas`, igual que en camisas, para que el filtro
   de "Ø exterior" encuentre el buje por cualquiera de ellas y la pantalla
   marque cuál fue la que matcheó.

2. LAS MEDIDAS DOBLES. El Ø exterior STD viene con su banda de tolerancia
   ("35,04/07" es 35,04 y 35,07) y veinte bujes son escalonados o
   trapezoidales, con dos anchos ("14,60/20,20"). No se promedia ni se elige
   uno: se guardan los dos, y el buscador da por buena la ficha si cualquiera
   de ellos cae en lo que se pidió. Así el buje escalonado aparece buscando
   14,6 y buscando 20,2, pero no buscando 17.

3. EL CÓDIGO DEL PROVEEDOR. En la lista del proveedor el buje es
   "B I I-115  STD": categoría B (bujes de biela), marca I (Indubrón), el
   código Indubrón con el número a tres dígitos y la sobremedida al final. El
   catálogo lo escribe "I-115" y también "I-06", así que se matchea por el
   número normalizado. El sufijo de letra (I-143X, el trapezoidal) SÍ cuenta:
   I-143 e I-143X son dos productos distintos y cruzarlos sería mostrar el
   precio equivocado.

NO se copia ningún precio: el precio y el stock los pone la base local, que se
actualiza todos los días con el Excel del proveedor.
"""
import csv
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TXT = os.path.join(RAIZ, "CRAC", "tecnicos", "fuentes", "indubron_bujes_biela.txt")
CSV_PROVEEDOR = os.path.join(RAIZ, "CRAC", "precio-stock.csv")
SALIDA = os.path.join(RAIZ, "CRAC", "tecnicos", "bujes_biela.json")

# Las columnas de sobremedida del catálogo, en el orden en que las imprime.
SOBREMEDIDAS = ["003", "005", "010", "015", "020", "030", "040"]


# ── El TXT ───────────────────────────────────────────────────────────────────
def leer_tabla(path: str) -> list[dict]:
    """Las filas de la tabla pipe del TXT, como diccionarios por encabezado."""
    filas = []
    cabecera = None
    with open(path, encoding="utf-8") as f:
        for linea in f:
            linea = linea.rstrip("\n")
            if not linea.startswith("|"):
                continue
            celdas = [c.strip() for c in linea.strip().strip("|").split("|")]
            if cabecera is None:
                cabecera = celdas
                continue
            if len(celdas) != len(cabecera):
                raise SystemExit(f"Fila con {len(celdas)} celdas y no {len(cabecera)}: {celdas[:3]}")
            filas.append(dict(zip(cabecera, celdas)))
    if not filas:
        raise SystemExit(f"No se encontró ninguna tabla en {path}")
    return filas


def numero(valor: str):
    """Un número del catálogo, con coma o con punto decimal. Vacío es None."""
    valor = (valor or "").strip().replace(",", ".")
    if not valor:
        return None
    try:
        return round(float(valor), 4)
    except ValueError:
        return None


def intervalo(valor: str):
    """
    Una medida que puede venir como número o como rango.

    El catálogo escribe el rango de dos maneras: completo ("27,98/28,01") o
    abreviado, repitiendo solo lo que cambia ("35,04/07" es 35,04 a 35,07;
    "41,40/43" es 41,40 a 41,43). En el abreviado se reemplazan los últimos
    dígitos del primer número, que es exactamente lo que hace la abreviatura.

    Devuelve un número si es una medida sola, `[desde, hasta]` si son dos, o
    None si la celda está vacía.
    """
    crudo = (valor or "").strip().replace(",", ".")
    if not crudo:
        return None
    if "/" not in crudo:
        return numero(crudo)

    izquierda, derecha = [p.strip() for p in crudo.split("/", 1)]
    desde = numero(izquierda)
    if desde is None:
        return None

    if "." in derecha:
        hasta = numero(derecha)
    else:
        # Abreviado: los últimos len(derecha) caracteres del primer número.
        hasta = numero(izquierda[: -len(derecha)] + derecha) if len(derecha) < len(izquierda) else None

    if hasta is None or hasta < desde:
        raise SystemExit(f"Rango que no se entiende: {valor!r} → ({desde}, {hasta})")
    return [desde, hasta] if hasta != desde else desde


def sobremedidas(fila: dict) -> list[dict]:
    """
    El Ø exterior STD y las sobremedidas que tenga cargadas, en orden. El STD se
    guarda con su texto original porque es una banda de tolerancia ("35,04/07")
    y escribirla como "35,04 / 35,07" ocupa el doble y dice lo mismo.
    """
    lista = []
    std_crudo = (fila.get("Ø EXT. STD") or "").strip()
    std = intervalo(std_crudo)
    if std is not None:
        item = {"label": "STD", "valor": std}
        if isinstance(std, list):
            item["texto"] = std_crudo.replace(".", ",")
        lista.append(item)

    for medida in SOBREMEDIDAS:
        valor = intervalo(fila.get(f"Ø EXT. {medida}"))
        if valor is not None:
            lista.append({"label": medida, "valor": valor})
    return lista


# ── La lista del proveedor ───────────────────────────────────────────────────
# "B I I-115  STD": categoría, marca, código Indubrón y sobremedida.
CODIGO_PROVEEDOR = re.compile(r"^B I (I-\d+[A-Z]*)\s*(\S*)\s*$")


def normalizar(codigo: str) -> str | None:
    """
    "I-06", "I-006" e "i-6" son el mismo buje; "I-143" e "I-143X" no lo son. El
    número se compara sin ceros a la izquierda y el sufijo de letra se respeta.
    """
    m = re.match(r"^I-0*(\d+)([A-Z]*)$", (codigo or "").strip().upper())
    return f"{m.group(1)}{m.group(2)}" if m else None


def indice_proveedor() -> dict[str, list[dict]]:
    """{código Indubrón normalizado: [{codigo del proveedor, medida}]}."""
    indice: dict[str, list[dict]] = {}
    with open(CSV_PROVEEDOR, encoding="latin-1") as f:
        for fila in csv.reader(f, delimiter=";"):
            if not fila:
                continue
            m = CODIGO_PROVEEDOR.match(fila[0])
            if not m:
                continue
            clave = normalizar(m.group(1))
            if not clave:
                continue
            indice.setdefault(clave, []).append({"codigo": fila[0], "medida": m.group(2) or None})
    return indice


# ── La ficha ─────────────────────────────────────────────────────────────────
def texto(valor: str) -> str | None:
    return (valor or "").strip() or None


def ficha(fila: dict, indice: dict) -> dict:
    codigo = (fila.get("CÓDIGO") or "").strip()
    marca = texto(fila.get("MARCA"))
    descripcion = texto(fila.get("DESCRIPCIÓN"))

    return {
        "codigo": codigo,
        "codigo_fab": codigo,
        "marca": marca,
        # El motor se busca por marca o por modelo indistintamente: "chevrolet
        # corsa" y "corsa" tienen que traer el mismo buje.
        "aplicacion": " ".join(p for p in (marca, descripcion) if p),
        "descripcion": descripcion,
        "medidas": {
            "diam_perno": intervalo(fila.get("Ø PERNO")),
            "diam_int": intervalo(fila.get("Ø INT. SEMI TER")),
            "ancho": intervalo(fila.get("ANCHO")),
        },
        "extra": {
            "fabricante": "INDUBRON",
            "sobremedidas": sobremedidas(fila),
        },
        "codigos_crac": indice.get(normalizar(codigo), []),
    }


def main():
    filas = leer_tabla(TXT)
    indice = indice_proveedor()
    fichas = [ficha(f, indice) for f in filas]

    with open(SALIDA, "w", encoding="utf-8") as f:
        json.dump(fichas, f, ensure_ascii=False, indent=1)
        f.write("\n")

    sin_codigo = sorted({f["codigo"] for f in fichas if not f["codigos_crac"]})
    sin_medidas = [f["codigo"] for f in fichas if not any(f["medidas"].values())]
    print(f"✓ {len(fichas)} bujes de biela → {os.path.relpath(SALIDA, RAIZ)}")
    print(f"  {sum(len(f['codigos_crac']) for f in fichas)} códigos del proveedor cruzados")
    if sin_codigo:
        print(f"  ⚠ sin código en la lista del proveedor ({len(sin_codigo)}): {', '.join(sin_codigo)}")
    if sin_medidas:
        # Las referencias cruzadas del catálogo ("VER CITROEN") no traen medidas
        # a propósito: mandan a otra ficha.
        print(f"  · sin medidas, son referencias cruzadas ({len(sin_medidas)}): {', '.join(sin_medidas)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
