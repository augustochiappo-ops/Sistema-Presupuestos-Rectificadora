#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Lee del PDF de Mahle las filas de los conjuntos que todavia no tienen medidas.

    python3 scripts/leer_conjuntos_mahle.py --listar
    python3 scripts/leer_conjuntos_mahle.py --pdf-2019 RUTA --pdf-clevite RUTA             --desde 1 --hasta 50 --salida /tmp/filas.json

QUE RESUELVE. Los dos catalogos usan la MISMA grilla de columnas, pero leerla
con `pdftotext -layout` miente: cuando una celda tiene dos valores apilados el
texto plano los intercala con los de las columnas vecinas y no hay forma de
saber cual es cual. Por eso todo esto va por coordenadas (`pdfplumber`).

LAS CUATRO TRAMPAS QUE COSTARON UNA SESION (2026-09-04):

1. Caterpillar y Cummins NO estan en el catalogo 2019: estan en el Clevite.
2. En el Clevite cada columna de la fila lleva SU PROPIO codigo: A21510,
   E21450, S21450, C21510 y K21450 conviven en el mismo renglon. Hay que
   buscar el K##### en la columna del kit, nunca el numero suelto.
3. El codigo del catalogo puede llevar un cero que el del proveedor no tiene
   ("T BEK211000" es K0211000), y el sufijo WS del proveedor no existe alla.
4. En el 2019 cada celda tiene DOS lineas: arriba el codigo de la pieza suelta
   (K0866) y abajo el del conjunto (K18730). Y una misma fila puede apilar
   varias variantes de motor repitiendo el N de cilindros, que por eso no
   alcanza como ancla de fila: hace falta que el perno este a la misma altura.

QUE NO HACE. No escribe `conjuntos.json`. Deja un JSON con las filas leidas y
las verificaciones automaticas hechas (el diametro contra la descripcion del
proveedor, GL > KH, el perno coherente con el piston). Cargar la ficha y
mirarla contra el PDF sigue siendo trabajo de la sesion.
"""

import argparse
import json
import os
import re
import sys

import pdfplumber


# La grilla es la misma en los dos catalogos; en el 2019 cada hoja PDF trae dos
# paginas impresas, asi que la de la derecha va con offset +595.
COLS = [("motor", 22, 140), ("cil", 140, 158), ("diam", 158, 190),
        ("khgl", 190, 245), ("perno", 245, 276), ("aros", 276, 322),
        ("juego", 322, 352), ("juego2", 352, 380), ("E", 382, 425),
        ("S", 425, 470), ("camisa", 470, 521), ("K", 521, 580)]
ANCHO_HOJA = 595.0


def reglas(page, off):
    """
    Donde empieza cada fila de la tabla.

    Los renglones dibujados no sirven de ancla en el 2019: hay filas sin linea
    y lineas que no son filas. La columna "N de cilindros" trae un valor por
    fila y esta en su primer renglon, PERO una fila puede apilar varias
    variantes de motor y repetir ahi el numero de cilindros (pagina 58: un solo
    juego E26040/K26040 cubre el OHV 3201, el 4256 y el 4269). Esos numeros
    repetidos no abren fila.

    Lo que si abre fila es el diametro del perno, que va una sola vez por fila
    y en su primer renglon. Asi que se ancla en el N de cilindros y se exige
    que el perno (o, si la fila no lo trae, el codigo de aros) este a la misma
    altura.
    """
    ca, cb = COLS[1][1], COLS[1][2]      # N de cilindros
    pa, pb = COLS[4][1], COLS[4][2]      # perno
    aa, ab = COLS[5][1], COLS[5][2]      # aros
    PIE = 760.0                          # abajo de esto ya es el pie de pagina
    cil, perno, aros = [], [], []
    for w in page.extract_words():
        x = (w["x0"] + w["x1"]) / 2 - off
        y = round(w["top"], 1)
        if not (108 < y < PIE):
            continue
        if ca <= x < cb and re.fullmatch(r"\d+(/\d+)?", w["text"]):
            cil.append(y)
        elif pa <= x < pb and re.fullmatch(r"\d+[,.]\d+", w["text"]):
            perno.append(y)
        elif aa <= x < ab and re.fullmatch(r"[A-Z]{1,4}\.\d+|A0?\d{4,6}", w["text"]):
            aros.append(y)
    def cerca(y, ys):
        return any(abs(y - o) <= 3.5 for o in ys)
    ys = sorted({y for y in cil if cerca(y, perno) or cerca(y, aros)})
    out = []
    for y in ys:
        if not out or y - out[-1] > 6:
            out.append(y - 3.0)
    return out + [PIE]

def celdas(page, off, y0, y1):
    out = {n: [] for n, a, b in COLS}
    for w in page.extract_words():
        x = (w["x0"] + w["x1"]) / 2 - off
        if not (y0 + 1 < w["top"] < y1 - 1):
            continue
        for n, a, b in COLS:
            if a <= x < b:
                out[n].append((round(w["top"], 1), round(w["x0"] - off, 1), w["text"]))
                break
    for n in out:
        out[n].sort(key=lambda t: (t[0], t[1]))
    return out


def renglones(cel):
    """Agrupa las palabras de una celda en renglones visuales."""
    ls, cur, ly = [], [], None
    for y, x, t in cel:
        if ly is not None and y - ly > 2.5:
            ls.append(cur); cur = []
        cur.append((x, t)); ly = y
    if cur:
        ls.append(cur)
    return [" ".join(t for x, t in l) for l in ls]


def buscar(pdf_path, objetivos, paginas=None, off_der=True):
    """{codigo K: fila} para los codigos pedidos."""
    enc = {}
    with pdfplumber.open(pdf_path) as pdf:
        rango = paginas or range(1, len(pdf.pages) + 1)
        for pno in rango:
            page = pdf.pages[pno - 1]
            offs = [0.0]
            if off_der and page.width > 900:
                offs.append(ANCHO_HOJA)
            for off in offs:
                rs = reglas(page, off)
                for y0, y1 in zip(rs, rs[1:]):
                    if y1 - y0 < 6:
                        continue
                    c = celdas(page, off, y0, y1)
                    ks = [t for y, x, t in c["K"] if re.fullmatch(r'K0?\d{4,6}(WS)?', t)]
                    for k in ks:
                        if k in objetivos:
                            enc.setdefault(k, {
                                "pagina_pdf": pno,
                                "hoja": "der" if off else "izq",
                                "y": [y0, y1],
                                **{n: renglones(c[n]) for n, a, b in COLS}})
    return enc


NUM = r"\d+(?:[.,]\d+)?"

def f(s):
    return float(s.replace(".", "").replace(",", ".")) if s.count(",") else float(s)

def coma(x, d=2):
    return f"{x:.{d}f}".replace(".", ",")

def parse_diam(ls):
    vals = [t for t in ls if re.fullmatch(NUM, t)]
    return vals

def parse_khgl(ls):
    """
    KH, el rebaje, GL y las medidas disponibles, que van apilados en la misma
    celda.

    El caso que rompe la lectura ingenua: cuando el piston tiene DOS fresados
    el catalogo escribe "73,91 -6,68 -" y sigue "14,22" en el renglon de abajo,
    justo donde normalmente va GL. Si no se mira que el primer renglon termina
    cortado con un guion, se toma el segundo rebaje por la altura total.
    """
    kh = gl = None
    rebajes, medidas = [], []
    corte = ls and ls[0].rstrip().endswith("-")
    for i, l in enumerate(ls):
        s = l.strip()
        if i == 0:
            nums = [t for t in s.split() if re.fullmatch(r"[+-]?" + NUM, t)]
            if nums:
                kh = f(nums[0].lstrip("+-"))
            rebajes += [t for t in nums[1:] if t.startswith(("+", "-"))]
        elif i == 1 and corte:
            rebajes.append(("-" if rebajes and rebajes[-1].startswith("-") else "+") + s)
        elif gl is None and re.fullmatch(r"[+-]?" + NUM, s):
            if s.startswith(("+", "-")):
                rebajes.append(s)
            else:
                gl = f(s)
        else:
            medidas.append(s)
    return kh, gl, rebajes, " ".join(medidas).strip()

def parse_perno(ls):
    nums = [t for l in ls for t in l.split() if re.fullmatch(NUM, t)]
    letra = next((t for l in ls for t in l.split() if t in ("F", "O")), None)
    d = f(nums[0]) if nums else None
    lar = f(nums[1]) if len(nums) > 1 else None
    return d, lar, letra

def parse_aros(ls):
    tol = cod = None; med = []
    for l in ls:
        s = l.replace(" ", "")
        if tol is None and re.fullmatch(r"[A-Z]{1,4}\.\d+", s):
            tol = s
        elif cod is None and re.fullmatch(r"A0?\d{4,6}", s):
            cod = s
        elif re.fullmatch(r"\d+-" + NUM + r"T?", s) or re.fullmatch(r'\d+-\d+/\d+"', s):
            med.append(s)
    return tol, cod, (" / ".join(med) or None)

def parse_camisa(ls):
    cod = None; dims = []; extra = []
    for l in ls:
        s = l.replace(" ", "")
        if re.fullmatch(r"C0?\d{4,6}", s):
            if cod is None or len(s) > len(cod):
                cod = s                     # el largo es el del conjunto, no el del piston suelto
        elif re.fullmatch(r"[ABCL]=" + NUM, s):
            dims.append(s.replace(".", ",") if s.count(".") == 1 and "," not in s else s)
        elif s in ("STD",) or re.fullmatch(r"(SA|S/SA|A/M|M|S)", s):
            extra.append(s)
    return cod, (" / ".join(dims) or None), extra

def numero_desc(desc):
    """El diametro que dice la descripcion del proveedor, que va al final."""
    m = re.findall(r"(\d+(?:[.,]\d+)?)\s*mm", desc)
    if m:
        return f(m[-1])
    m = re.findall(r"(\d+(?:[.,]\d+)?)\s*$", desc.strip())
    return f(m[-1]) if m else None


RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONJUNTOS = os.path.join(RAIZ, "CRAC", "tecnicos", "conjuntos.json")


def sin_medidas():
    with open(CONJUNTOS, encoding="utf-8") as fh:
        return [x for x in json.load(fh) if not x["medidas"]]


def variantes(codigo_fab):
    """Como puede aparecer en el catalogo el codigo que arma el proveedor."""
    base = codigo_fab[:-2] if codigo_fab.endswith("WS") else codigo_fab
    return [base, "K0" + base[1:]]


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--listar", action="store_true", help="que conjuntos esperan el catalogo")
    ap.add_argument("--pdf-2019")
    ap.add_argument("--pdf-clevite")
    ap.add_argument("--desde", type=int, default=1)
    ap.add_argument("--hasta", type=int, default=50)
    ap.add_argument("--salida", default="filas-mahle.json")
    args = ap.parse_args()

    faltan = sin_medidas()
    if args.listar:
        print(f"{len(faltan)} conjuntos esperando el catalogo\n")
        for i, x in enumerate(faltan, 1):
            print(f"{i:>3}. {x['codigo']:<15} {x['codigo_fab']:<12} {x['descripcion']}")
        return 0

    if not (args.pdf_2019 or args.pdf_clevite):
        ap.error("hace falta --pdf-2019 y/o --pdf-clevite (o usar --listar)")

    quiero = faltan[args.desde - 1:args.hasta]
    buscados = {v for x in quiero for v in variantes(x["codigo_fab"])}
    filas = {}
    for ruta, nombre in ((args.pdf_2019, "Mahle 2019"), (args.pdf_clevite, "Mahle Clevite")):
        if not ruta:
            continue
        print(f"leyendo {nombre}…", flush=True)
        for k, v in buscar(ruta, buscados).items():
            v["catalogo"] = nombre
            filas.setdefault(k, v)

    salida, sin_fila = {}, []
    for x in quiero:
        k = next((v for v in variantes(x["codigo_fab"]) if v in filas), None)
        if not k:
            sin_fila.append(x["codigo"])
            continue
        salida[x["codigo"]] = dict(filas[k], codigo_catalogo=k, descripcion=x["descripcion"])
    with open(args.salida, "w", encoding="utf-8") as fh:
        json.dump(salida, fh, ensure_ascii=False, indent=1)
    print(f"\n{len(salida)} filas → {args.salida}")
    if sin_fila:
        print(f"{len(sin_fila)} sin fila en ningun catalogo: {', '.join(sin_fila)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
