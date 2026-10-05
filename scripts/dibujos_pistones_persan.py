#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Saca del catálogo de Persan (Edición 16, 2026) el dibujo de cada pistón.

    .venv/bin/pip install pdfplumber        # trae pypdfium2, que dibuja la página
    .venv/bin/python scripts/dibujos_pistones_persan.py
    .venv/bin/python scripts/dibujos_pistones_persan.py --hoja   # + lámina de control

El PDF no va al repo: está en el release `catalogos` (el comando para bajarlo
está en el encabezado de `leer_pistones_persan.py`) y queda en
`CRAC/tecnicos/fuentes/persan_2026_ed16.pdf`.

Deja los PNG en `webapp/frontend/public/pistones/` (PS<número>.png) y el
manifiesto en `webapp/frontend/src/screens/BusquedaMedidas/dibujos-pistones-persan.js`.
La salida se commitea.

POR QUÉ ESTE SCRIPT DIBUJA LA PÁGINA. En el catálogo de Federal Mogul cada
dibujo es una imagen suelta embebida y se saca entera. En el de Persan NO hay
imágenes: el pistón está dibujado con trazos (vectores) en el contenido de la
página. Así que se dibuja la página entera con pypdfium2 a `DPI` y se recorta la
celda de la figura.

DÓNDE ESTÁ CADA DIBUJO. En la columna "Figura del pistón", la que va de x 235,6
a 288,0 en las páginas pares —en las impares la tabla está corrida unos diez
puntos a la derecha, así que el borde no se supone: se buscan las dos rayas
verticales de la grilla que encierran la columna (`columna_figura`). Cada fila
de la tabla va de una raya horizontal a la siguiente (`separadores`), y la fila
de un pistón es la que contiene su número en la primera columna.

QUÉ SE TIRA ANTES DE BUSCAR LA TINTA. La celda tiene, además del dibujo, las
notas al pie de la fila ("(1) (5)": inserto en la ranura, canal de
refrigeración…) y los restos de las rayas de la grilla en el borde. Las notas se
tapan con blanco usando la caja de cada letra que da pdfplumber, y el recorte se
hace un par de puntos adentro de las rayas. Lo que queda es el dibujo: se toma
la caja de toda la tinta y se le da el mismo contraste y la misma proporción
que a los de Mahle y Federal Mogul (`recortar` y `encuadrar`), para que en la
tabla los tres catálogos se vean iguales.

A QUÉ FICHA LE TOCA. Las fichas de Persan (`pistones.json`, código del
proveedor `P PS…`) guardan en `codigo_fab` el número del catálogo ("82"). Un
mismo número puede figurar en más de una página —el mismo pistón en dos marcas
de auto— y varias fichas del proveedor pueden compartir número (variantes): el
dibujo se saca una vez, de la primera aparición, y todas apuntan al mismo PNG.
Las fichas sin número (las que el proveedor vende y el catálogo no trae) se
quedan sin dibujo.

MANIFIESTO PROPIO. Como el de Federal Mogul: cada script es dueño de su archivo
y la pantalla (`pistones.jsx`) junta los tres mapas. Escribir estos códigos en
el de Mahle haría que la próxima corrida de aquel script se los lleve puestos.
"""
import argparse
import json
import os
import re
import sys

import numpy as np
from PIL import Image

try:
    import pdfplumber
    import pypdfium2
except ImportError:
    sys.exit("Falta pdfplumber. Instalalo con: .venv/bin/pip install pdfplumber")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recortar_pistones_mahle import Pedazo, TINTA, encuadrar, recortar  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = os.path.join(RAIZ, "CRAC", "tecnicos", "fuentes", "persan_2026_ed16.pdf")
FICHAS = os.path.join(RAIZ, "CRAC", "tecnicos", "pistones.json")
SALIDA = os.path.join(RAIZ, "webapp", "frontend", "public", "pistones")
MANIFIESTO = os.path.join(RAIZ, "webapp", "frontend", "src", "screens",
                          "BusquedaMedidas", "dibujos-pistones-persan.js")

DPI = 300
ESCALA = DPI / 72.0

# La zona de datos de la tabla y la primera columna (el número del pistón),
# las mismas que usa leer_pistones_persan.py.
DATOS_TOP = (112, 755)
NRO_X_MAX = 71.2

# La columna de la figura mide 52,4 puntos de ancho; se aceptan rayas
# verticales que encierren entre 50 y 55.
ANCHO_COLUMNA = (50.0, 55.0)
# Los bordes en una página par, por si en alguna no se encuentran las rayas.
COLUMNA_DEFECTO = (235.6, 288.0)
# Cuántos puntos adentro de las rayas se recorta: lo justo para que el grosor de
# la raya no entre en la celda.
ADENTRO = 1.5


# ─────────────────────────────────────────────────────────────────────────────
# La geometría de la tabla
# ─────────────────────────────────────────────────────────────────────────────

def es_pagina_de_tabla(palabras):
    return any(p["text"] == "NÚMERO" and 40 < p["x0"] < 70 and 50 < p["top"] < 70
               for p in palabras)


def columna_figura(pagina):
    """Los dos bordes (x) de la columna de la figura, sacados de la grilla."""
    xs = sorted({round(e["x0"], 1) for e in pagina.edges
                 if e["orientation"] == "v" and 220 < e["x0"] < 310
                 and e["bottom"] - e["top"] > 50})
    for i, a in enumerate(xs):
        for b in xs[i + 1:]:
            if ANCHO_COLUMNA[0] <= b - a <= ANCHO_COLUMNA[1]:
                return a, b
    return COLUMNA_DEFECTO


def separadores(pagina):
    """
    Las rayas horizontales que cruzan la tabla ENTERA: el borde de cada fila.

    No alcanza con que crucen la columna de la figura: el dibujo del pistón
    tiene sus propias horizontales de lado a lado de la celda (la línea de
    centro del círculo, el borde de la cabeza), y tomadas como bordes de fila
    cortaban el dibujo por la mitad — salía el corte y medio círculo.
    """
    return sorted({round(e["top"], 1) for e in pagina.edges
                   if e["orientation"] == "h" and e["x1"] - e["x0"] > 400
                   and 100 < e["top"] < 800})


def numeros(palabras):
    """Cada número de pistón de la página con la altura de su renglón."""
    return [(p["text"].lstrip("0"), p["top"]) for p in palabras
            if p["x0"] < NRO_X_MAX and DATOS_TOP[0] < p["top"] < DATOS_TOP[1]
            and re.fullmatch(r"\d{1,5}", p["text"])]


# ─────────────────────────────────────────────────────────────────────────────
# El dibujo de una fila
# ─────────────────────────────────────────────────────────────────────────────

def dibujo(imagen_pagina, pagina, caja):
    """
    El dibujo que hay en la caja (x0, top, x1, bottom, en puntos), negro sobre
    transparente y con la proporción de todos, o None si la celda está vacía.
    """
    x0, top, x1, bottom = caja
    # Las notas al pie de la fila ("(1) (5)") se tapan: son letras, no dibujo.
    tapadas = imagen_pagina.copy()
    from PIL import ImageDraw
    pincel = ImageDraw.Draw(tapadas)
    for c in pagina.chars:
        if c["x1"] > x0 and c["x0"] < x1 and c["bottom"] > top and c["top"] < bottom:
            pincel.rectangle([c["x0"] * ESCALA - 2, c["top"] * ESCALA - 2,
                              c["x1"] * ESCALA + 2, c["bottom"] * ESCALA + 2], fill="white")

    recorte = tapadas.crop((round(x0 * ESCALA), round(top * ESCALA),
                            round(x1 * ESCALA), round(bottom * ESCALA)))
    gris = np.asarray(recorte.convert("L")).astype(np.float32)
    mascara = gris < TINTA
    if mascara.sum() < 200:  # una celda vacía, o una mota
        return None
    ys, xs = np.where(mascara)
    pedazo = Pedazo(int(ys.min()), int(ys.max()), int(xs.min()), int(xs.max()),
                    int(mascara.sum()))
    return encuadrar(recortar(gris, mascara, pedazo))


# ─────────────────────────────────────────────────────────────────────────────
# Cruzar con las fichas
# ─────────────────────────────────────────────────────────────────────────────

def codigos_por_numero():
    """Número del catálogo → códigos del proveedor de las fichas de Persan."""
    mapa = {}
    for ficha in json.load(open(FICHAS, encoding="utf-8")):
        if not (ficha.get("codigo") or "").startswith("P PS"):
            continue
        numero = (ficha.get("codigo_fab") or "").lstrip("0")
        if numero:
            mapa.setdefault(numero, []).append(ficha["codigo"])
    return mapa


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pdf", default=PDF)
    ap.add_argument("--hoja", action="store_true", help="además, una lámina de control")
    args = ap.parse_args()

    if not os.path.exists(args.pdf):
        sys.exit(f"Falta {args.pdf}. Se baja del release `catalogos`: el comando "
                 "está en el encabezado de scripts/leer_pistones_persan.py")

    del_numero = codigos_por_numero()
    dibujos, sin_fila, vacias = {}, set(), []
    documento = pypdfium2.PdfDocument(args.pdf)
    with pdfplumber.open(args.pdf) as pdf:
        for indice, pagina in enumerate(pdf.pages):
            palabras = pagina.extract_words(x_tolerance=1.5, y_tolerance=2)
            if not es_pagina_de_tabla(palabras):
                continue
            filas = [(n, t) for n, t in numeros(palabras)
                     if n in del_numero and f"PS{n}" not in dibujos]
            if not filas:
                continue
            x0, x1 = columna_figura(pagina)
            rayas = separadores(pagina)
            imagen = documento[indice].render(scale=ESCALA).to_pil().convert("RGB")
            for numero, top in filas:
                arriba = [r for r in rayas if r <= top]
                abajo = [r for r in rayas if r > top]
                if not arriba or not abajo:
                    sin_fila.add(numero)
                    continue
                caja = (x0 + ADENTRO, arriba[-1] + ADENTRO, x1 - ADENTRO, abajo[0] - ADENTRO)
                limpio = dibujo(imagen, pagina, caja)
                if limpio is None:
                    vacias.append(f"{numero} (pág. {indice + 1})")
                    continue
                dibujos[f"PS{numero}"] = (limpio, sorted(del_numero[numero]))
                sin_fila.discard(numero)

    os.makedirs(SALIDA, exist_ok=True)
    viejos = {f[:-4] for f in os.listdir(SALIDA) if re.fullmatch(r"PS\d+\.png", f)}
    for clave, (imagen, _) in dibujos.items():
        imagen.save(os.path.join(SALIDA, f"{clave}.png"), optimize=True)
    for sobrante in viejos - set(dibujos):
        os.remove(os.path.join(SALIDA, f"{sobrante}.png"))

    manifiesto = {codigo.replace(" ", ""): clave
                  for clave, (_, codigos) in dibujos.items() for codigo in codigos}
    with open(MANIFIESTO, "w", encoding="utf-8") as f:
        f.write("/* Generado por scripts/dibujos_pistones_persan.py — no editar a mano.\n"
                " *\n"
                " * Qué dibujo le toca a cada pistón de Persan: la clave es el código\n"
                " * del proveedor sin espacios y el valor, el archivo de /pistones/.\n"
                " * Las variantes del mismo número del catálogo son el mismo pistón y\n"
                " * apuntan al mismo PNG.\n"
                " *\n"
                " * Va aparte de dibujos-pistones.js (Mahle) y de dibujos-pistones-fm.js\n"
                " * (Federal Mogul) porque cada script reescribe entero el suyo. */\n")
        f.write("export const DIBUJOS_PERSAN = {\n")
        for codigo in sorted(manifiesto):
            f.write(f"  '{codigo}': '{manifiesto[codigo]}',\n")
        f.write("}\n")

    con_numero = sum(len(v) for v in del_numero.values())
    peso = sum(os.path.getsize(os.path.join(SALIDA, f"{c}.png")) for c in dibujos)
    print(f"✓ {len(dibujos)} dibujos · {len(manifiesto)} de {con_numero} fichas con número "
          f"del catálogo ({peso // 1024} KB en total)")
    faltan = sorted(set(del_numero) - {c[2:] for c in dibujos}, key=int)
    if faltan:
        print(f"   ⚠ {len(faltan)} números sin dibujo: {', '.join(faltan)}")
    if vacias:
        print(f"   ⚠ celdas vacías: {', '.join(vacias)}")

    if args.hoja:
        _lamina(dibujos)


def _lamina(dibujos, celda=200, columnas=10):
    """Todos los dibujos juntos, para mirar de un vistazo que ninguno salió mal."""
    from PIL import ImageDraw
    claves = sorted(dibujos, key=lambda c: int(c[2:]))
    filas = (len(claves) + columnas - 1) // columnas
    hoja = Image.new("RGB", (columnas * celda, filas * (celda + 16)), "white")
    dibujante = ImageDraw.Draw(hoja)
    for i, clave in enumerate(claves):
        im = dibujos[clave][0].copy()
        im.thumbnail((celda - 10, celda - 10))
        x, y = (i % columnas) * celda, (i // columnas) * (celda + 16)
        fondo = Image.new("RGB", im.size, "white")
        fondo.paste(im, mask=im.split()[3])
        hoja.paste(fondo, (x + (celda - im.size[0]) // 2, y + 5))
        dibujante.text((x + 5, y + celda + 2), clave, fill="black")
    ruta = "/tmp/dibujos-persan.png"
    hoja.save(ruta)
    print(f"   lámina de control → {ruta}")


if __name__ == "__main__":
    main()
