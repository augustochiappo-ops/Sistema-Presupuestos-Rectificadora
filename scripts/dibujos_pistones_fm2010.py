#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Saca del catálogo Federal Mogul 2010 el dibujo de cada pistón.

    python3 scripts/leer_pistones_fm2010.py          # primero: leer el catálogo
    python3 scripts/dibujos_pistones_fm2010.py       # después: los dibujos
    python3 scripts/dibujos_pistones_fm2010.py --hoja  # + lámina de control

Deja los PNG en `webapp/frontend/public/pistones/` y el manifiesto en
`webapp/frontend/src/screens/BusquedaMedidas/dibujos-pistones-fm.js`. La salida
se commitea.

POR QUÉ ESTE ES MUCHO MÁS CORTO QUE `recortar_pistones_mahle.py`. Porque acá el
dibujo NO hay que encontrarlo. En el catálogo de Mahle las fotos son recortes a
ojo de la página, con rayas de la grilla y números de la fila adentro, y ese
script se pasa cuatrocientas líneas separando el pistón de la basura que lo
rodea. En este PDF cada dibujo es una IMAGEN SUELTA embebida: se saca entera y
ya viene limpia, con el corte del pistón arriba y la vista de abajo abajo.

CÓMO SE ENCUENTRA. Recorriendo el flujo de instrucciones de la página
(`q` / `Q` / `cm` / `Do`) para saber en qué rectángulo se dibuja cada imagen. Se
quedan las que midan entre 35 y 90 puntos de ancho y entre 60 y 110 de alto: ese
filtro deja afuera la banda de encabezado de la página (423 puntos de ancho) y
los dos iconitos de 22 y 32 puntos que la acompañan.

A QUÉ FICHA LE TOCA CADA UNA. El dibujo va en la columna 2, a la altura de su
fila, siempre unos 20 puntos por debajo de donde arranca la fila. Así que a cada
imagen le corresponde la última fila que empieza por encima de ella. Las filas
salen del JSON de `leer_pistones_fm2010.py`, que ya las tiene con su página y su
altura.

UN DIBUJO, HASTA TRES CÓDIGOS. El pistón suelto ("P39493"), el subconjunto
("SC39493") y el conjunto ("K39493") de una misma fila son el mismo pistón
dibujado una sola vez. El archivo se guarda una vez y el manifiesto apunta los
tres códigos —los del PROVEEDOR, que son los que la pantalla tiene a mano— al
mismo PNG.

MANIFIESTO PROPIO, Y NO EL DE MAHLE. `dibujos-pistones.js` lo reescribe entero
`recortar_pistones_mahle.py` en cada corrida: si estos códigos se escribieran
ahí, la próxima corrida de aquel script se los llevaría puestos sin que nadie se
entere. Cada script es dueño de su archivo y la pantalla junta los dos mapas.
"""
import argparse
import json
import os
import re
import sys

import numpy as np
from PIL import Image
from pypdf import PdfReader
from pypdf.generic import ContentStream

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recortar_pistones_mahle import MARGEN, Pedazo, TINTA, encuadrar, recortar  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = os.path.join(RAIZ, "CRAC", "tecnicos", "fuentes", "federal_mogul_pistones_2010.pdf")
CATALOGO = "/tmp/fm2010.json"
FICHAS = {f: os.path.join(RAIZ, "CRAC", "tecnicos", f"{f}.json")
          for f in ("pistones", "subconjuntos", "conjuntos")}
SALIDA = os.path.join(RAIZ, "webapp", "frontend", "public", "pistones")
MANIFIESTO = os.path.join(RAIZ, "webapp", "frontend", "src", "screens",
                          "BusquedaMedidas", "dibujos-pistones-fm.js")

ALTO_PAGINA = 842.0

# El rectángulo donde entra un dibujo de pistón, en puntos. Los medidos van de
# 46 × 84 a 61 × 90; la banda del encabezado mide 423 de ancho y los iconos de
# la página, 22 y 32.
ANCHO = (35, 90)
ALTO = (60, 110)


# ─────────────────────────────────────────────────────────────────────────────
# Encontrar los dibujos en el PDF
# ─────────────────────────────────────────────────────────────────────────────

def imagenes(page, lector):
    """
    Dónde queda dibujada cada imagen de la página: [(nombre, top, alto)].

    `top` es la distancia desde el borde de arriba, como la mide pdfplumber, y
    no la del PDF, que cuenta desde abajo. Las dos conviven en este proyecto y
    mezclarlas manda todos los dibujos a la fila de al lado.
    """
    try:
        flujo = ContentStream(page.get_contents(), lector)
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
            if ANCHO[0] < ancho < ANCHO[1] and ALTO[0] < alto < ALTO[1]:
                salida.append((str(operandos[0]), ALTO_PAGINA - (ctm[5] + alto), alto))
    return salida


def de_que_fila(top, filas):
    """La última fila que empieza por encima de este dibujo."""
    candidatas = [f for f in filas if f["y"] <= top + 2]
    return max(candidatas, key=lambda f: f["y"]) if candidatas else None


# ─────────────────────────────────────────────────────────────────────────────
# Limpiar el dibujo
# ─────────────────────────────────────────────────────────────────────────────

def limpiar(im):
    """
    El dibujo negro sobre transparente, recortado a su tinta.

    La imagen del PDF viene con margen blanco y a veces con un resto de la línea
    de la grilla en el borde. Se toma la caja de todo lo que sea más oscuro que
    el papel y se recorta ahí; el contraste y el alfa los pone `recortar`, que
    es el mismo que usa el catálogo de Mahle para que los dibujos de las dos
    marcas se vean igual de firmes en la tabla.
    """
    fondo = Image.new("RGB", im.size, "white")
    fondo.paste(im.convert("RGBA"), mask=im.convert("RGBA").split()[3])
    gris = np.asarray(fondo.convert("L")).astype(np.float32)
    mascara = gris < TINTA
    if not mascara.any():
        return None
    ys, xs = np.where(mascara)
    caja = Pedazo(int(ys.min()), int(ys.max()), int(xs.min()), int(xs.max()),
                  int(mascara.sum()))
    return encuadrar(recortar(gris, mascara, caja))


# ─────────────────────────────────────────────────────────────────────────────
# Cruzar con las fichas
# ─────────────────────────────────────────────────────────────────────────────

def codigos_por_numero():
    """
    Qué códigos del proveedor tiene cada número del catálogo.

    La llave es el número tal como lo escribe el catálogo ("39493", "10091/1"),
    que es lo que comparten el pistón, el subconjunto y el conjunto de una misma
    fila. Sólo entran las fichas de Federal Mogul: las de Mahle tienen su propio
    dibujo y su propio manifiesto.
    """
    mapa = {}
    for familia, ruta in FICHAS.items():
        if not os.path.exists(ruta):
            continue
        for ficha in json.load(open(ruta, encoding="utf-8")):
            if (ficha.get("marca") or "") != "FEDERAL MOGUL":
                continue
            m = re.match(r"^(?:P|SC|K)(\d{4,7}(?:/\d{1,2})?(?:BC|AC)?)$",
                         ficha.get("codigo_fab") or "")
            if m:
                mapa.setdefault(m.group(1), []).append(ficha["codigo"])
    return mapa


def nombre_archivo(numero):
    """El número, sin la barra de las variantes: "10091/1" → "FM10091-1"."""
    return "FM" + numero.replace("/", "-")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--catalogo", default=CATALOGO)
    ap.add_argument("--pdf", default=PDF)
    ap.add_argument("--hoja", action="store_true", help="además, una lámina de control")
    args = ap.parse_args()

    if not os.path.exists(args.catalogo):
        sys.exit("Falta el JSON del catálogo. Corré antes: "
                 "python3 scripts/leer_pistones_fm2010.py")

    filas = json.load(open(args.catalogo, encoding="utf-8"))
    por_pagina = {}
    for f in filas:
        por_pagina.setdefault(f["pagina"], []).append(f)

    del_codigo = codigos_por_numero()
    lector = PdfReader(args.pdf)

    dibujos, sin_fila, sin_ficha = {}, 0, 0
    for pagina, filas_pag in sorted(por_pagina.items()):
        page = lector.pages[pagina - 1]
        recursos = page["/Resources"]["/XObject"]
        for nombre, top, _ in imagenes(page, lector):
            fila = de_que_fila(top, filas_pag)
            if fila is None:
                sin_fila += 1
                continue
            numeros = {c["numero"] for c in fila["codigos"]}
            usados = [n for n in numeros if n in del_codigo]
            if not usados:
                sin_ficha += 1
                continue
            clave = nombre_archivo(sorted(usados)[0])
            if clave in dibujos:
                continue
            try:
                imagen = recursos[nombre].get_object().decode_as_image()
            except Exception:
                continue
            limpio = limpiar(imagen)
            if limpio is not None:
                dibujos[clave] = (limpio, sorted({c for n in usados for c in del_codigo[n]}))

    os.makedirs(SALIDA, exist_ok=True)
    viejos = {f[:-4] for f in os.listdir(SALIDA) if f.startswith("FM") and f.endswith(".png")}
    for clave, (imagen, _) in dibujos.items():
        imagen.save(os.path.join(SALIDA, f"{clave}.png"))
    for sobrante in viejos - set(dibujos):
        # Un dibujo que ya no sale del catálogo: si se queda, el manifiesto no lo
        # nombra y el archivo pesa de gusto.
        os.remove(os.path.join(SALIDA, f"{sobrante}.png"))

    manifiesto = {}
    for clave, (_, codigos) in dibujos.items():
        for codigo in codigos:
            manifiesto[codigo.replace(" ", "")] = clave

    with open(MANIFIESTO, "w", encoding="utf-8") as f:
        f.write("/* Generado por scripts/dibujos_pistones_fm2010.py — no editar a mano.\n"
                " *\n"
                " * Qué dibujo le toca a cada código de Federal Mogul: la clave es el\n"
                " * código del proveedor sin espacios y el valor, el archivo de\n"
                " * /pistones/. El pistón, el subconjunto y el conjunto del mismo número\n"
                " * son el mismo pistón, dibujado una sola vez en el catálogo, así que\n"
                " * los tres apuntan al mismo PNG.\n"
                " *\n"
                " * Va aparte de dibujos-pistones.js (el de Mahle) porque aquel archivo\n"
                " * lo reescribe entero su propio script en cada corrida. */\n")
        f.write("export const DIBUJOS_FM = {\n")
        for codigo in sorted(manifiesto):
            f.write(f"  '{codigo}': '{manifiesto[codigo]}',\n")
        f.write("}\n")

    peso = sum(os.path.getsize(os.path.join(SALIDA, f"{c}.png")) for c in dibujos)
    print(f"✓ {len(dibujos)} dibujos · {len(manifiesto)} códigos apuntados "
          f"({peso // 1024} KB en total)")
    if sin_fila or sin_ficha:
        # Los dos casos son los bloques del catálogo que NO se cargan: los de la
        # línea europea, con códigos "87-704500-00" que el proveedor no trae.
        # Tienen su dibujo en la página pero ninguna ficha a la que colgárselo.
        print(f"   {sin_fila + sin_ficha} dibujos de bloques que no se cargan "
              f"(códigos que el proveedor no vende)")

    if args.hoja:
        _lamina(dibujos)


def _lamina(dibujos, celda=200, columnas=8):
    """Todos los dibujos juntos, para mirar de un vistazo que ninguno salió mal."""
    from PIL import ImageDraw
    claves = sorted(dibujos)
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
    ruta = "/tmp/dibujos-fm.png"
    hoja.save(ruta)
    print(f"   lámina de control → {ruta}")


if __name__ == "__main__":
    main()
