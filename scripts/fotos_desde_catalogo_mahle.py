#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Saca de un catálogo MAHLE Aftermarket las fotos de pistón, ya recortadas de la
página, y las deja en `CRAC/tecnicos/fuentes/pistones/`.

    python3 scripts/fotos_desde_catalogo_mahle.py --pdf catalogo.pdf
    python3 scripts/fotos_desde_catalogo_mahle.py --pdf catalogo.pdf --todos
    python3 scripts/fotos_desde_catalogo_mahle.py --pdf catalogo.pdf --ver

ESTE SCRIPT NO ESCRIBE NINGÚN DIBUJO NI NINGÚN MANIFIESTO. Deja fotos, que es
exactamente lo que hasta ahora mandaba el dueño recortadas a mano. El que limpia,
recorta y arma el manifiesto sigue siendo `recortar_pistones_mahle.py`, que es el
único dueño de `webapp/frontend/public/pistones/` y de `dibujos-pistones.js`. El
circuito completo, entonces:

    python3 scripts/fotos_desde_catalogo_mahle.py --pdf catalogo.pdf
    python3 scripts/recortar_pistones_mahle.py --hoja

Se hizo así a propósito. Un tercer script escribiendo en la carpeta de dibujos es
justo la forma en que el de Mahle llegó a borrarle los 110 PNG al de Federal
Mogul (ver decisiones.md, "Dos scripts dueños de la misma carpeta"). Acá no hay
nada que repartir: esto produce entrada, no salida.

CÓMO ESTÁ ARMADA LA PÁGINA. Todos los volúmenes de la serie usan la misma
plantilla, una fila por bloque de motor:

    │ MOTOR 3114/3116 │ Nº │  Ø  │ [DIBUJO] │ A11400 │ … │ E11440 │ S11440 │ C11440 │ K11440 │
                                     ▲                      ▲        ▲                 ▲
                              x ≈ 195,6, y a 28            393,4    438,7            527,3
                              puntos de la fila

El dibujo del pistón va en la columna "KH +/- GL", **siempre a 28 puntos por
debajo** del renglón de códigos de su fila (se midió en las 32 páginas: no varía).
Es la única imagen de la fila que cae a la izquierda de las columnas de código;
la otra, a x ≈ 476, es el dibujo de la camisa y mide casi lo mismo, así que lo
que las distingue es la columna y no el tamaño.

POR QUÉ SE RASTERIZA LA PÁGINA Y NO SE SACA LA IMAGEN EMBEBIDA. El dibujo SÍ está
como imagen suelta (a diferencia de los recortes a ojo), pero es de 64 × 95 px
con `/Interpolate: True`: el PDF mismo le pide al lector que la suavice al
agrandarla. Sacarla cruda da un dibujo de 60 px de alto, que en la ficha ampliada
—que lo pide a 320— se ve como un borrón. Rasterizar la página a 300 dpi y
recortar ahí da los ~210 × 310 px de los dibujos que ya están, y es además lo
mismo que venía haciendo el dueño a mano con `pdftoppm -jpeg -r 300`.

CUÁLES SE SACAN. Por defecto, sólo las de los códigos que tienen ficha y todavía
no tienen foto: llenar la carpeta de fuentes con fotos que ninguna ficha usa hace
que `recortar_pistones_mahle.py` imprima un aviso por cada una y ahogue los
avisos que sí importan. Con `--todos` salen todas las del PDF.

EL NÚMERO DE LA FILA NO SIEMPRE ES UNO SOLO. Lo normal es que el subconjunto, el
conjunto y el pistón-con-anillos de una fila compartan número (S11440 / K11440 /
E11440), pero en 11 filas de este catálogo no: la fila de E21500 trae el kit
K21510, y la de E21610 trae el K21410. Por eso la foto se guarda UNA VEZ POR
NÚMERO DISTINTO de la fila —el mismo dibujo con dos nombres—, que es lo que
`recortar_pistones_mahle.py` necesita para colgárselo a las dos fichas.
"""
import argparse
import collections
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUENTES = os.path.join(RAIZ, "CRAC", "tecnicos", "fuentes", "pistones")
FICHAS = {f: os.path.join(RAIZ, "CRAC", "tecnicos", f"{f}.json")
          for f in ("subconjuntos", "conjuntos")}

# Las columnas de código, por su x0 en puntos. Son las tres que nos interesan:
# E (pistón con anillos), S (subconjunto) y K (kit). Se dejan afuera A (juego de
# anillos) y C (camisa), que son otras familias y tienen su propio dibujo.
COLUMNAS = {"E": 393.4, "S": 438.7, "K": 527.3}
# Ocho puntos y no dos: un código de siete dígitos ("E0211000") arranca 4 puntos
# antes que uno de cinco, porque la columna no está alineada a la izquierda. Con
# la tolerancia justa esas filas se leían a medias. Sobra margen igual: la
# columna más cercana a otra son los 35 puntos que separan S de C.
TOLERANCIA_COLUMNA = 8.0
# Cuánto pueden diferir dos códigos de la misma fila en su distancia al borde de
# arriba. Son de un mismo renglón, pero el PDF los apoya con décimas distintas
# (599,9 y 600,0), y partir la fila en dos por esa décima deja códigos sueltos.
TOLERANCIA_FILA = 2.0

# La columna del dibujo del pistón, y la caja en la que entra. La de la camisa
# está en x ≈ 476 y mide casi igual: la banda de x es lo que las separa.
BANDA_X = (170.0, 230.0)
CAJA = ((40.0, 60.0), (55.0, 95.0))       # (ancho mín/máx, alto mín/máx)
BAJO_LA_FILA = (10.0, 45.0)               # el dibujo está a ~28 puntos de su fila

DPI = 300
MARGEN = 3.0     # puntos de aire alrededor del rectángulo del dibujo


def _lector(pdf):
    try:
        import pdfplumber
        import pypdfium2
        from pypdf import PdfReader
    except ImportError as e:
        sys.exit(f"Falta una dependencia ({e.name}). Instalá: "
                 f".venv/bin/pip install pdfplumber pypdfium2 pypdf")
    return pdfplumber, pypdfium2, PdfReader


def imagenes(pagina, lector):
    """
    Dónde queda dibujada cada imagen de la página: [(x, top, ancho, alto)].

    Se recorre el flujo de instrucciones (`q` / `Q` / `cm` / `Do`) llevando la
    matriz de transformación, que es lo que dice en qué rectángulo termina cada
    imagen. `top` se cuenta desde el borde de ARRIBA, como lo hace pdfplumber, y
    no desde abajo como el PDF: las dos conviven en este proyecto y mezclarlas
    manda todos los recortes a la fila de al lado.
    """
    from pypdf.generic import ContentStream
    alto_pagina = float(pagina.mediabox.height)
    try:
        flujo = ContentStream(pagina.get_contents(), lector)
    except Exception:
        return []
    ctm, pila, salida = [1, 0, 0, 1, 0, 0], [], []
    for operandos, operador in flujo.operations:
        op = operador.decode() if isinstance(operador, bytes) else operador
        if op == "q":
            pila.append(list(ctm))
        elif op == "Q":
            ctm = pila.pop() if pila else [1, 0, 0, 1, 0, 0]
        elif op == "cm":
            a, b, c, d, e, f = [float(x) for x in operandos]
            A, B, C, D, E, F = ctm
            ctm = [a * A + b * C, a * B + b * D, c * A + d * C, c * B + d * D,
                   e * A + f * C + E, e * B + f * D + F]
        elif op == "Do":
            ancho, alto = abs(ctm[0]), abs(ctm[3])
            salida.append((ctm[4], alto_pagina - (ctm[5] + alto), ancho, alto))
    return salida


def filas_de(pagina_plumber):
    """
    Las filas de la página: {top del renglón de códigos: {"S": "S11440", …}}.

    SÓLO ENTRA LO QUE ESTÁ DENTRO DE LA PÁGINA. Varias páginas arrastran, a x
    negativa, el texto de la página de al lado que quedó fuera del recorte: no se
    ve al imprimir y no tiene dibujo acá, pero pdfplumber lo lee igual. Tomarlo
    en serio le pondría a un código el dibujo de otra fila.
    """
    ancho = pagina_plumber.width
    sueltos = []
    for palabra in pagina_plumber.extract_words():
        if not re.fullmatch(r"[SKE]\d{4,7}", palabra["text"]):
            continue
        if not 0 <= palabra["x0"] <= ancho:
            continue
        for letra, x in COLUMNAS.items():
            if abs(palabra["x0"] - x) < TOLERANCIA_COLUMNA:
                sueltos.append((palabra["top"], letra, palabra["text"]))

    por_top = collections.defaultdict(dict)
    for top, letra, texto in sorted(sueltos):
        cercana = next((t for t in por_top if abs(t - top) <= TOLERANCIA_FILA), None)
        por_top[cercana if cercana is not None else round(top, 1)][letra] = texto
    return por_top


def dibujo_de(top_fila, imagenes_pagina):
    """El rectángulo del dibujo de pistón de esta fila, o None."""
    (an_min, an_max), (al_min, al_max) = CAJA
    for x, top, ancho, alto in imagenes_pagina:
        if not BANDA_X[0] <= x <= BANDA_X[1]:
            continue
        if not (an_min <= ancho <= an_max and al_min <= alto <= al_max):
            continue
        if BAJO_LA_FILA[0] <= top - top_fila <= BAJO_LA_FILA[1]:
            return (x, top, ancho, alto)
    return None


def numeros(codigos):
    """Los números distintos de una fila: {"11440"} o {"21500", "21510"}."""
    return {re.sub(r"^[SKE]0*", "", c) for c in codigos.values()}


def numeros_que_faltan():
    """Los números de ficha de Mahle que todavía no tienen foto de origen."""
    import json
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from recortar_pistones_mahle import _numero_del_nombre

    con_foto = set()
    if os.path.isdir(FUENTES):
        for nombre in os.listdir(FUENTES):
            if nombre.lower().endswith((".png", ".jpg", ".jpeg")):
                m = _numero_del_nombre(nombre)
                if m:
                    con_foto.add(int(m.group(1)))
    faltan = {}
    for ruta in FICHAS.values():
        if not os.path.exists(ruta):
            continue
        for ficha in json.load(open(ruta, encoding="utf-8")):
            if (ficha.get("marca") or "") != "MAHLE":
                continue
            m = re.search(r"(\d+)", ficha["codigo"])
            if m and int(m.group(1)) not in con_foto:
                faltan.setdefault(int(m.group(1)), []).append(ficha["codigo"])
    return faltan


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pdf", required=True, help="el catálogo MAHLE Aftermarket")
    ap.add_argument("--todos", action="store_true",
                    help="sacar todas las fotos, no sólo las de fichas sin foto")
    ap.add_argument("--ver", action="store_true",
                    help="no escribe nada: dice qué sacaría")
    ap.add_argument("--salida", default=FUENTES)
    args = ap.parse_args()

    pdfplumber, pypdfium2, PdfReader = _lector(args.pdf)
    faltan = numeros_que_faltan()
    lector = PdfReader(args.pdf)
    documento = pypdfium2.PdfDocument(args.pdf)
    escala = DPI / 72.0

    sacadas, sin_dibujo, salteadas = {}, [], 0
    with pdfplumber.open(args.pdf) as doc:
        for i, pagina in enumerate(doc.pages):
            por_top = filas_de(pagina)
            if not por_top:
                continue
            ims = imagenes(lector.pages[i], lector)
            render = None
            for top, codigos in sorted(por_top.items()):
                nums = numeros(codigos)
                if args.todos:
                    quiero = nums
                else:
                    quiero = {n for n in nums if int(n) in faltan}
                if not quiero:
                    salteadas += 1
                    continue
                caja = dibujo_de(top, ims)
                if caja is None:
                    sin_dibujo.append((i + 1, sorted(codigos.values())))
                    continue
                if render is None:
                    render = documento[i].render(scale=escala).to_pil()
                x, y, ancho, alto = caja
                recorte = render.crop((
                    int((x - MARGEN) * escala), int((y - MARGEN) * escala),
                    int((x + ancho + MARGEN) * escala), int((y + alto + MARGEN) * escala)))
                for n in sorted(quiero):
                    sacadas[f"S{n}"] = (recorte, i + 1, sorted(codigos.values()))

    print(f"✓ {len(sacadas)} fotos de {len(set(id(v[0]) for v in sacadas.values()))} "
          f"dibujos distintos · {salteadas} filas salteadas (ya tienen foto o no "
          f"tienen ficha)")
    for nombre, (recorte, pagina, codigos) in sorted(sacadas.items()):
        fichas = faltan.get(int(nombre[1:]), [])
        destino = "" if args.ver else f" → {nombre}.png"
        print(f"   p{pagina:<3} {'/'.join(codigos):<26} {recorte.size[0]}×{recorte.size[1]}"
              f"  {', '.join(fichas)}{destino}")
    if sin_dibujo:
        print(f"   ⚠ {len(sin_dibujo)} filas que hacían falta y no tienen dibujo en la página:")
        for pagina, codigos in sin_dibujo:
            print(f"      p{pagina} {'/'.join(codigos)}")

    if args.ver:
        print("\n(--ver: no se escribió nada)")
        return
    os.makedirs(args.salida, exist_ok=True)
    for nombre, (recorte, _p, _c) in sorted(sacadas.items()):
        recorte.save(os.path.join(args.salida, f"{nombre}.png"))
    print(f"\nAhora, para que entren a la pantalla:\n"
          f"    python3 scripts/recortar_pistones_mahle.py --hoja")


if __name__ == "__main__":
    main()
