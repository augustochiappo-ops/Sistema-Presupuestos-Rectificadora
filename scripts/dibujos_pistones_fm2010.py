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
fila, siempre entre 11 y 35 puntos por debajo de donde arranca. Así que cada
FILA se queda con el primer dibujo que arranque debajo suyo, y no más de 60
puntos abajo (`LIMITE`). Las filas salen del JSON de
`leer_pistones_fm2010.py`, que ya las tiene con su página y su altura.

Se busca en ese sentido —la fila yendo a buscar su dibujo— porque al revés se
leía mal: el lector del catálogo no ve todas las filas, y el dibujo de una fila
que se salteó quedaba huérfano y se le colgaba a la fila detectada de más
arriba, aunque estuviera media página lejos. Cinco pistones estuvieron
mostrando el dibujo de otro hasta que se dio vuelta el recorrido.

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
import collections
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

# Dónde queda dibujada una imagen en la página: el nombre del recurso, la
# distancia al borde de arriba (como la mide pdfplumber, no como la cuenta el
# PDF, que va desde abajo) y el rectángulo, todo en puntos.
Puesta = collections.namedtuple("Puesta", "nombre top x ancho alto")

# El rectángulo donde entra un dibujo de pistón, en puntos. El grueso mide entre
# 43 × 79 y 73 × 95, pero hay dos formas raras que también son dibujos y por eso
# la caja es más grande que el grueso:
#
#   30,8 × 61,4 (página 88) — el pistón más angosto del catálogo, el VW 1.6 D de
#   76,5 mm. Con el mínimo en 35 de ancho quedaba afuera y su fila salía sin
#   dibujo.
#
#   58,1 × 45,5 + 58,1 × 42,2 (página 37) — el Ford Escort 1.6 CHT: el mismo
#   dibujo de siempre, pero partido en DOS imágenes, el corte arriba y el
#   círculo abajo. Cada mitad sola no llegaba al mínimo de 60 de alto. Se juntan
#   en `apilados`.
#
# Lo que la caja tiene que seguir dejando afuera: la banda del encabezado (419 a
# 431 de ancho), los dos iconos de la página (22 × 15 y 32 × 8). Se midió contra
# el catálogo entero: con estos límites entran exactamente esas cuatro imágenes
# nuevas y ninguna otra.
ANCHO = (28, 90)
ALTO = (38, 110)

# Cuánto más abajo que el arranque de su fila puede estar un dibujo. Los buenos
# están entre 11 y 35 puntos; el límite deja afuera los dibujos de las filas que
# el lector del catálogo no llegó a ver, que antes se le colgaban a la fila
# anterior —hasta 333 puntos más arriba— y le ponían a un pistón el dibujo de
# otro.
LIMITE = 60


# ─────────────────────────────────────────────────────────────────────────────
# Encontrar los dibujos en el PDF
# ─────────────────────────────────────────────────────────────────────────────

def imagenes(page, lector):
    """Las imágenes de la página que entran en la caja de un dibujo, de arriba abajo."""
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
                salida.append(Puesta(str(operandos[0]), ALTO_PAGINA - (ctm[5] + alto),
                                     ctm[4], ancho, alto))
    return sorted(salida, key=lambda p: p.top)


def de_esta_fila(fila, puestas):
    """
    Las imágenes que forman el dibujo de esta fila, de arriba abajo.

    EL DIBUJO ES EL DE MÁS ARRIBA DE LOS QUE ARRANCAN DEBAJO DE LA FILA, y no
    cualquiera de los que están debajo. La regla vieja —"la última fila que
    empieza por encima del dibujo"— leía bien mientras el catálogo estuviera
    entero, pero el lector no ve todas las filas: las que se saltea dejan su
    dibujo huérfano, y ese dibujo se le colgaba a la fila detectada de más
    arriba, que podía estar media página lejos. Así salieron cinco pistones con
    el dibujo de otro.

    Después del primero se suman los APILADOS: las imágenes que siguen pegadas
    abajo, a la misma altura de arranque y en la misma columna. El catálogo
    parte un dibujo en dos una sola vez (el Ford Escort 1.6 CHT de la página
    37), pero partido o entero es el mismo dibujo y va en un solo archivo.
    """
    cerca = [p for p in puestas if -2 <= p.top - fila["y"] <= LIMITE]
    if not cerca:
        return []
    grupo = [cerca[0]]
    for p in puestas:
        ultima = grupo[-1]
        if (p.top > ultima.top and abs(p.x - ultima.x) < 3
                and abs(p.top - (ultima.top + ultima.alto)) < 6):
            grupo.append(p)
    return grupo


def apilados(imagenes_pil, grupo):
    """
    Las imágenes de un dibujo partido, pegadas de vuelta en una sola.

    Se ubican con las coordenadas de la página —la distancia entre ellas y el
    corrimiento de una respecto de la otra son las del PDF, escaladas a los
    pixeles de la primera—, y no simplemente una encima de la otra: así el
    corte y el círculo quedan alineados como los dibuja el catálogo.
    """
    if len(imagenes_pil) == 1:
        return imagenes_pil[0]
    escala = imagenes_pil[0].size[0] / grupo[0].ancho
    cajas = []
    for im, p in zip(imagenes_pil, grupo):
        x = round((p.x - grupo[0].x) * escala)
        y = round((p.top - grupo[0].top) * escala)
        cajas.append((x, y, im))
    izq = min(c[0] for c in cajas)
    arr = min(c[1] for c in cajas)
    ancho = max(c[0] - izq + c[2].size[0] for c in cajas)
    alto = max(c[1] - arr + c[2].size[1] for c in cajas)
    hoja = Image.new("RGB", (ancho, alto), "white")
    for x, y, im in cajas:
        hoja.paste(im.convert("RGB"), (x - izq, y - arr))
    return hoja


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

    dibujos, sin_ficha, sin_dibujo = {}, 0, 0
    for pagina, filas_pag in sorted(por_pagina.items()):
        page = lector.pages[pagina - 1]
        recursos = page["/Resources"]["/XObject"]
        puestas = imagenes(page, lector)
        # Se recorren las FILAS y no las imágenes: cada fila va a buscar su
        # dibujo. Al revés —cada imagen buscándose una fila— las que sobran (las
        # de los bloques del catálogo que no se cargan) terminaban colgadas de
        # una fila que no era la suya.
        for fila in filas_pag:
            numeros = {c["numero"] for c in fila["codigos"]}
            usados = [n for n in numeros if n in del_codigo]
            if not usados:
                sin_ficha += 1
                continue
            clave = nombre_archivo(sorted(usados)[0])
            if clave in dibujos:
                continue
            grupo = de_esta_fila(fila, puestas)
            if not grupo:
                sin_dibujo += 1
                continue
            try:
                partes = [recursos[p.nombre].get_object().decode_as_image() for p in grupo]
            except Exception:
                continue
            limpio = limpiar(apilados(partes, grupo))
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
    if sin_ficha:
        # Son los bloques del catálogo que NO se cargan: los de la línea europea,
        # con códigos "87-704500-00" que el proveedor no trae. Tienen su dibujo
        # en la página pero ninguna ficha a la que colgárselo.
        print(f"   {sin_ficha} filas de bloques que no se cargan "
              f"(códigos que el proveedor no vende)")
    if sin_dibujo:
        # Ésta sí hay que mirarla: una ficha que se carga y se queda sin dibujo.
        print(f"   ⚠ {sin_dibujo} filas con ficha pero sin dibujo en la página")

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
