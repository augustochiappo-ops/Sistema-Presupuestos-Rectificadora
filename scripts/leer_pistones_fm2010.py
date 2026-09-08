#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Lee el catálogo Federal Mogul 2010 de pistones, subconjuntos y conjuntos.

    python3 scripts/leer_pistones_fm2010.py                     # a /tmp/fm2010.json
    python3 scripts/leer_pistones_fm2010.py --salida ruta.json
    python3 scripts/leer_pistones_fm2010.py --pagina 41          # mirar una sola

QUÉ DEJA. Un JSON con una fila por variante de motor del catálogo: las medidas
ya separadas por columna, la lista de códigos de esa fila (`P…` pistón, `SC…`
subconjunto, `K…` conjunto) y de qué página y a qué altura salió cada una, para
poder abrir el PDF y verificarla. NO escribe los `.json` del repo: de eso se
encarga `pistones_fm_desde_proveedor.py`.

POR QUÉ POR COORDENADAS Y NO CON TEXTO PLANO. Porque el texto plano miente. Una
corrida del PDF cruza columnas: `extract_text` devuelve "Motor M20B20K - 4,8D
80,00" en una sola pieza —el nombre del motor de la columna 1 pegado al Ø de la
columna 2— y "39,45 3,00" mezclando la altura de compresión con el primer aro.
Leyendo carácter por carácter, cada valor cae en la columna donde está dibujado.
Es la misma trampa que documenta `leer_conjuntos_mahle.py` para el catálogo de
Mahle.

LA GRILLA, que es lo único que hay que entender. La página 6 del catálogo la
explica y los bordes se midieron sobre el PDF (595 × 842 puntos, sin rotación):

    col 1   78–200   motor, cilindros, combustible, cilindrada, R.C., vehículo, años
    col 2  200–283   Ø nominal y carrera, y el DIBUJO del pistón
    col 3  283–312   altura de compresión (A), la cámara (±B y BØ) y longitud total (D)
    col 4  312–350   altura de cada aro, y abajo Ø del perno "x" su largo
    col 5  350–396   huelgo (l) y altura de medición (h)
    col 6  396–418   posición del pistón respecto al nivel del block
    col 7  418–520   números de parte: P pistón, SC subconjunto, K conjunto

NO TODAS LAS PÁGINAS ESTÁN ALINEADAS AL MISMO PUNTO. Las de Cummins arrancan
cuatro puntos más a la izquierda que las de Ford, y las de Peugeot corren la
columna del perno diez puntos. Los bordes de arriba son los del MEDIO de cada
hueco, no los del texto de una página en particular: puestos donde cae el texto
—en 432, por ejemplo, que es donde arrancan los códigos de la mayoría— un código
dibujado en 431,99 se lee como columna 6 y la fila se pierde entera. Pasó con
todas las páginas de Peugeot.

LAS CUATRO COSAS QUE NO SE VEN A SIMPLE VISTA:

1. La columna 3 apila hasta cuatro valores y el orden es el que manda: el
   PRIMERO es la altura de compresión y el ÚLTIMO la longitud total. Los del
   medio son la cámara de la cabeza: el que viene con "BØ" adelante es su
   diámetro y el otro su profundidad (negativa cuando es un rebaje).
2. En la columna 4 la "x" no es un dato, es el separador del perno: el valor de
   arriba es el diámetro y el de abajo el largo. Todo lo que está más arriba que
   esa "x" son alturas de aros, y son tres, cuatro o cinco según el motor.
3. Hay páginas con DOS TÍTULOS encimados, uno viejo debajo del que se ve —la
   41 dice "FORD TRANSIT - MOTOR 2.5 DIESEL" y abajo quedó "FORD ECOSPORT -
   DV4TD"—. Se queda el que se dibuja último, que es el que tapa al otro. Por
   eso el título va a `extra` y la aplicación de la ficha sale de la columna 1,
   que es por fila y no tiene esta ambigüedad.
4. La línea "Torque de Aprieto … Tapa de Cilindros" cruza las columnas 1 a 3 y
   no es una fila: se descarta por su texto.
"""
import argparse
import json
import os
import re
import sys

try:
    import pdfplumber
except ImportError:
    sys.exit("Falta pdfplumber. Instalalo con: .venv/bin/pip install pdfplumber")


RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = os.path.join(RAIZ, "CRAC", "tecnicos", "fuentes", "federal_mogul_pistones_2010.pdf")

# Páginas con datos. Las 1–6 son tapa, índice y la leyenda "Como usar este
# catálogo"; la 91 es la contratapa con los datos de la fábrica.
PRIMERA, ULTIMA = 7, 90

# Bordes de columna en puntos, medidos sobre el PDF (ver el encabezado).
COLS = [("motor", 78, 200), ("diam", 200, 283), ("alturas", 283, 312),
        ("aros", 312, 350), ("huelgo", 350, 396), ("posicion", 396, 418),
        ("codigos", 396, 520)]

# Un título de bloque va en 16,6 pt; los datos, en 7,6.
CUERPO_TITULO = 12

# Un código puede llevar cola: "/1" y "/4" son variantes del mismo juego (el
# catálogo las usa para los Perkins, que cambian según el Ø de camisa) y "BC" o
# "AC" marcan la versión con otra altura de compresión, que la página 6 del
# catálogo explica. La cola va en el código: el proveedor la escribe igual
# ("T F K10091/1").
RE_CODIGO = re.compile(r"^(P|SC|K)\s?(\d{4,7})((?:/\d{1,2})?(?:BC|AC)?)$")
ETIQUETAS = ("pistón", "pistones", "subconjunto", "subconjuntos",
             "conjunto", "conjuntos")
RE_NUMERO = re.compile(r"^[+-]?\d{1,3}(?:[.,]\d+)?$")
RE_CILINDROS = re.compile(r"^([\d/]+)\s*cilindros?\b", re.IGNORECASE)
RE_CILINDRADA = re.compile(r"\bc\.?c\.?$", re.IGNORECASE)


def _num(texto):
    """
    "117,80" → 117.8. Devuelve None si no es un número.

    El catálogo mezcla los dos separadores: la mayoría de los valores usan coma
    ("2,90") pero varias páginas de Cummins escriben el mismo aro con punto
    ("2.90"). Sacar el punto siempre —como si fuera separador de miles— convertía
    ese aro de 2,90 mm en uno de 290 mm. Sólo es separador de miles cuando lo
    siguen exactamente tres dígitos y no hay coma en el número.
    """
    if not texto:
        return None
    t = texto.strip().replace(" ", "")
    if "," in t:
        t = t.replace(".", "").replace(",", ".")
    else:
        t = re.sub(r"\.(?=\d{3}\b)", "", t)
    try:
        return float(t)
    except ValueError:
        return None


def _lineas(palabras):
    """Las palabras agrupadas por renglón, cada renglón ordenado de izquierda a derecha."""
    filas = []
    for w in sorted(palabras, key=lambda w: (w["top"], w["x0"])):
        if filas and abs(w["top"] - filas[-1][0]) <= 2.0:
            filas[-1][1].append(w)
        else:
            filas.append((w["top"], [w]))
    return [(top, sorted(ws, key=lambda w: w["x0"])) for top, ws in filas]


def _texto(linea):
    return " ".join(w["text"] for w in linea).strip()


# ─────────────────────────────────────────────────────────────────────────────
# Títulos de bloque
# ─────────────────────────────────────────────────────────────────────────────

def titulos(page):
    """
    Los títulos de la página, con su altura. Cuando hay dos encimados (ver el
    punto 3 del encabezado) gana el que se dibujó último: es el que se ve.
    """
    grandes = [c for c in page.chars if c["size"] >= CUERPO_TITULO]
    if not grandes:
        return []

    # Agrupar por renglón EN ORDEN DE DIBUJO, no por posición: dos títulos
    # encimados difieren menos de un punto en `top` y hay que poder separarlos.
    grupos = []
    for c in grandes:
        if grupos and abs(c["top"] - grupos[-1][0]) <= 0.3:
            grupos[-1][1].append(c)
        else:
            grupos.append((c["top"], [c]))

    salida = []
    for top, chars in grupos:
        texto = "".join(c["text"] for c in sorted(chars, key=lambda c: c["x0"])).strip()
        texto = re.sub(r"\s+", " ", texto)
        if not texto:
            continue
        # Un título encimado con el anterior lo reemplaza.
        if salida and abs(top - salida[-1][0]) <= 3.0:
            salida[-1] = (top, texto)
        else:
            salida.append((top, texto))
    return salida


# ─────────────────────────────────────────────────────────────────────────────
# Las columnas de una fila
# ─────────────────────────────────────────────────────────────────────────────

def _col(palabras, nombre):
    x0, x1 = next((a, b) for n, a, b in COLS if n == nombre)
    return [w for w in palabras if x0 <= w["x0"] < x1]


def _valores(palabras):
    """Los renglones de una columna como texto, de arriba abajo."""
    return [_texto(l) for _, l in _lineas(palabras)]


def leer_alturas(palabras):
    """
    Columna 3: altura de compresión, la cámara y la longitud total.

    El orden es el que manda: el primer valor es la altura de compresión y el
    último la longitud total. Los del medio describen la cabeza — "BØ 41,60" es
    el diámetro de la cámara y "-19,43" su profundidad.
    """
    alt_comp = cam_diam = cam_prof = alt_total = None
    sueltos = []
    for v in _valores(palabras):
        if not v:
            continue
        if v.upper().startswith("BØ"):
            cam_diam = _num(v[2:])
        elif _num(v) is not None:
            # Lo que no es número queda afuera: la columna también lleva marcas
            # como "AC" (la versión de otra altura de compresión) y, cuando la
            # fila arrastra una nota al pie, el texto de la nota.
            sueltos.append(v)
    if sueltos:
        alt_comp = _num(sueltos[0])
        if len(sueltos) > 1:
            alt_total = _num(sueltos[-1])
        for v in sueltos[1:-1]:
            if cam_prof is None:
                cam_prof = _num(v)
    return alt_comp, cam_prof, cam_diam, alt_total


def _aro(texto):
    """
    La altura de un aro. "T 3,50" es el mismo 3,50 marcado como trapezoidal —la
    T es el tipo, no parte del número— y sin sacarla el aro se perdía entero.
    """
    return _num(re.sub(r"^[TL]\s*", "", texto.strip()))


def leer_aros_y_perno(palabras):
    """
    Columna 4: las alturas de los aros arriba, el perno abajo.

    La "x" es el separador y no un dato (punto 2 del encabezado): arriba de ella
    está el Ø del perno y abajo su largo. Todo lo que quede más arriba son aros.
    """
    lineas = [(top, _texto(l)) for top, l in _lineas(palabras)]
    corte = next((i for i, (_, t) in enumerate(lineas) if t.strip().lower() == "x"), None)
    if corte is None or corte == 0:
        return [a for a in (_aro(t) for _, t in lineas) if a is not None], None, None
    diam = _num(lineas[corte - 1][1])
    largo = _num(lineas[corte + 1][1]) if corte + 1 < len(lineas) else None
    aros = [a for a in (_aro(t) for _, t in lineas[:corte - 1]) if a is not None]
    return aros, diam, largo


def _codigos_de(linea):
    """
    Los códigos de un renglón de la columna 7.

    Palabra por palabra y no el renglón entero, porque la columna 6 se mete en
    este rango (ver COLS) y en las páginas de Mercedes el renglón dice
    "-0,07 P18497". Pero hay códigos partidos en dos palabras —la página 25
    escribe "P" y "018702" con un espacio en el medio—, así que si ninguna
    palabra sola es un código se prueba pegándolas de a dos.

    Los códigos ENTRE PARÉNTESIS quedan afuera a propósito: son referencias a un
    juego que esa fila no vende (la 59 dice "(K48990)", que en la lista del
    proveedor es un conjunto de Mahle). Un código de verdad va suelto y con su
    etiqueta arriba.
    """
    sueltos = [RE_CODIGO.match(w["text"]) for w in linea]
    if any(sueltos):
        return sueltos
    pegados = ["".join(p["text"] for p in linea[i:i + 2]) for i in range(len(linea) - 1)]
    return [RE_CODIGO.match(t) for t in pegados]


def leer_codigos(palabras):
    """
    Columna 7: los números de parte con su familia.

    Vienen etiquetados —"Pistón", "Subconjunto", "Conjunto"— pero la etiqueta no
    hace falta para saber qué es cada uno: la letra del código ya lo dice. Se
    devuelven en orden para poder mirarlos contra el PDF.
    """
    salida = []
    for _, linea in _lineas(palabras):
        # Palabra por palabra y no el renglón entero: la columna 6 se mete en
        # este rango (ver COLS) y en las páginas de Mercedes el renglón dice
        # "-0,07 P18497". Mirando el renglón completo el código se perdía.
        for m in filter(None, _codigos_de(linea)):
            familia = {"P": "pistones", "SC": "subconjuntos", "K": "conjuntos"}[m.group(1)]
            salida.append({"familia": familia,
                           "codigo": m.group(1) + m.group(2) + m.group(3),
                           "numero": m.group(2) + m.group(3)})
    return salida


def leer_columna1(palabras):
    """
    Columna 1: el motor y para qué sirve.

    Cada dato se reconoce por su forma —"Motor …", "6 cilindros", "3620 c.c.",
    "R.C. 7,40:1", "Años: 1968/1973"— y lo que no encaja en ninguna es la
    aplicación: los vehículos que llevan ese pistón, que es lo que el taller
    busca por texto.
    """
    lineas = [_texto(l) for _, l in _lineas(palabras)]
    datos = {"motor": None, "nro_cil": None, "combustible": None, "cilindrada": None,
             "r_compresion": None, "anios": None, "notas": [], "aplicacion": []}
    for t in lineas:
        if not t:
            continue
        bajo = t.lower()
        if bajo.startswith("motor"):
            datos["motor"] = t[5:].strip() or None
        elif RE_CILINDROS.match(t):
            datos["nro_cil"] = RE_CILINDROS.match(t).group(1)
        elif bajo in ("diesel", "nafta", "gas", "nafta/gas"):
            datos["combustible"] = t
        elif RE_CILINDRADA.search(t):
            datos["cilindrada"] = t
        elif bajo.startswith("r.c."):
            datos["r_compresion"] = t[4:].strip(" :") or None
        elif bajo.startswith("años"):
            datos["anios"] = t.split(":", 1)[-1].strip()
        elif bajo.startswith(("altura de compresión", "torque")):
            datos["notas"].append(t)
        else:
            datos["aplicacion"].append(t)
    # Las líneas de vehículos vienen cortadas al ancho de la columna y varias
    # terminan en coma; sin limpiarlas la aplicación queda con comas dobles.
    datos["aplicacion"] = ", ".join(t.rstrip(" ,") for t in datos["aplicacion"]) or None
    return datos


# ─────────────────────────────────────────────────────────────────────────────
# Una página
# ─────────────────────────────────────────────────────────────────────────────

def arranques(palabras):
    """
    Dónde empieza cada fila de la página.

    El ancla es la COLUMNA 7, no la línea "Motor …" de la columna 1: hay filas
    sin motor propio —la página 56 trae el mismo motor con dos alturas de
    compresión, "P18497" y abajo "P18497BC", y la segunda no repite los datos
    del motor— y esas filas se perdían enteras. La columna 7, en cambio, siempre
    arranca con su etiqueta ("Pistón", "Subconjunto", "Conjunto").

    Una fila es una corrida de renglones seguidos de esa columna: entre dos
    filas hay un salto grande —la altura del dibujo del pistón— y dentro de una
    los renglones van cada 9 o 10 puntos. Si además hay una línea "Motor …" en
    el medio de la corrida, ahí empieza otra fila: dos motores distintos nunca
    son la misma pieza.
    """
    lineas = _lineas(_col(palabras, "codigos"))
    corridas, con_codigo = [], []
    for top, linea in lineas:
        texto = _texto(linea)
        codigos = any(_codigos_de(linea))
        util = texto.lower() in ETIQUETAS or codigos
        if codigos and corridas:
            con_codigo[-1] = True
        if not util:
            # Texto suelto de la columna (referencias OE, Ø de camisa): sigue la
            # corrida abierta pero no puede abrir una.
            if corridas and top - corridas[-1][-1] <= 22:
                corridas[-1].append(top)
            continue
        if corridas and top - corridas[-1][-1] <= 22:
            corridas[-1].append(top)
        else:
            corridas.append([top])
            con_codigo.append(codigos)

    # Una corrida SIN ningún código no abre fila: se la come la de arriba. La
    # página 76 termina la fila del Renault K9K con un segundo "Subconjunto" y
    # el código europeo "A354068", que no es un número de parte de los que se
    # cargan. Tomado como fila propia, cortaba la de arriba una línea antes de
    # tiempo y se llevaba puesta la longitud total del pistón, que es el último
    # valor de la columna 3: el subconjunto quedaba con 0,25 mm de alto.

    # La línea "Motor …" NO se usa para partir una corrida. Se probó y salió
    # peor: las páginas de Cummins escriben dos ("Motor C" y abajo "Motor 300
    # HP") para una sola pieza, y la fila se partía al medio dejando el pistón
    # de un lado y el subconjunto del otro.
    return sorted(c[0] for c, tiene in zip(corridas, con_codigo) if tiene)


def leer_pagina(page, nro):
    # `extra_attrs=["size"]` no es un adorno: sin el cuerpo de letra no hay forma
    # de sacar los títulos de la columna 1, que empiezan a su misma altura de x
    # y se colarían como aplicación de la fila de abajo.
    palabras = [w for w in page.extract_words(x_tolerance=1.2, y_tolerance=1.5,
                                              extra_attrs=["size"])
                if w["x0"] >= COLS[0][1] and w["top"] > 95
                and w["size"] < CUERPO_TITULO]

    tits = sorted(titulos(page))

    anclas = arranques(palabras)

    filas = []
    for i, top in enumerate(anclas):
        desde = top - 4
        hasta = anclas[i + 1] - 4 if i + 1 < len(anclas) else 10_000
        trozo = [w for w in palabras if desde <= w["top"] < hasta]
        # Las notas al pie de la fila cruzan las columnas 1 a 5 y no son datos
        # de la pieza: el torque de la tapa de cilindros y el espesor de la
        # junta. Sin cortarlas, el "1.65 mm" del espesor entra en la columna 3 y
        # se lleva puesta la longitud total del pistón, que es su último valor.
        nota = next((t for t, l in _lineas(trozo)
                     if _texto(l).lower().startswith(("torque", "junta"))), None)
        if nota is not None:
            trozo = [w for w in trozo if w["top"] < nota - 1]

        codigos = leer_codigos(_col(trozo, "codigos"))
        if not codigos:
            continue

        col1 = leer_columna1(_col(trozo, "motor"))
        diams = [_num(v) for v in _valores(_col(trozo, "diam"))]
        diams = [d for d in diams if d is not None]
        alt_comp, cam_prof, cam_diam, alt_total = leer_alturas(_col(trozo, "alturas"))
        aros, diam_perno, largo_perno = leer_aros_y_perno(_col(trozo, "aros"))
        huelgos = [_num(v) for v in _valores(_col(trozo, "huelgo"))]
        huelgos = [h for h in huelgos if h is not None]
        # La columna 6 se pisa a propósito con la 7 (ver COLS): lo que se guarda
        # como posición es lo que quedó ahí y NO es un código de parte.
        posicion = " ".join(v for v in _valores(_col(trozo, "posicion"))
                            if v and not RE_CODIGO.match(v.replace(" ", ""))) or None

        titulo = next((t for y, t in reversed(tits) if y < top), None)

        filas.append({
            "pagina": nro, "y": round(top, 1), "titulo": titulo,
            "codigos": codigos,
            "diam_piston": diams[0] if diams else None,
            "carrera": diams[1] if len(diams) > 1 else None,
            "alt_compresion": alt_comp,
            "cam_prof": cam_prof,
            "cam_diam": cam_diam,
            "alt_piston": alt_total,
            "aros": aros,
            "diam_perno": diam_perno,
            "largo_perno": largo_perno,
            "huelgo": huelgos[0] if huelgos else None,
            "alt_medicion": huelgos[1] if len(huelgos) > 1 else None,
            "posicion_block": posicion,
            **col1,
        })
    return filas


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pdf", default=PDF)
    ap.add_argument("--salida", default="/tmp/fm2010.json")
    ap.add_argument("--pagina", type=int, help="leer una sola página y mostrarla")
    args = ap.parse_args()

    if not os.path.exists(args.pdf):
        sys.exit(f"No está el PDF: {args.pdf}")

    filas = []
    with pdfplumber.open(args.pdf) as pdf:
        rango = [args.pagina] if args.pagina else range(PRIMERA, ULTIMA + 1)
        for nro in rango:
            filas.extend(leer_pagina(pdf.pages[nro - 1], nro))

    if args.pagina:
        print(json.dumps(filas, ensure_ascii=False, indent=1))
        return

    with open(args.salida, "w", encoding="utf-8") as f:
        json.dump(filas, f, ensure_ascii=False, indent=1)

    codigos = [c for f in filas for c in f["codigos"]]
    con_tres = sum(1 for f in filas if f["diam_piston"] and f["alt_piston"] and f["diam_perno"])
    print(f"✓ {len(filas)} filas · {len(codigos)} códigos · "
          f"{con_tres} filas con las tres medidas → {args.salida}")
    for fam in ("pistones", "subconjuntos", "conjuntos"):
        print(f"   {fam}: {sum(1 for c in codigos if c['familia'] == fam)}")


if __name__ == "__main__":
    main()
