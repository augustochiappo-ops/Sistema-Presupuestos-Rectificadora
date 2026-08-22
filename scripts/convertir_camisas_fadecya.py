#!/usr/bin/env python3
"""
Genera CRAC/tecnicos/camisas.json a partir de las dos fuentes de Fadecya.

    pip install pandas openpyxl pdfplumber
    python3 scripts/convertir_camisas_fadecya.py

Se corre A MANO, cuando Fadecya publica un catálogo nuevo. La salida se
commitea: es lo que hace que producción tenga los datos con un `git pull`.

Por qué dos fuentes
───────────────────
1. `fuentes/fadecya_camisas_2019.xlsx` — la lista de precios/medidas de Fadecya.
   Es la fuente de TODOS los números (Ø interior, Ø y alto de pestaña, largo y
   los Ø exteriores de cada sobremedida). El dueño confía en el Excel por sobre
   la página, y el Excel trae también las camisas HÚMEDAS, que la página no.
2. `fuentes/fadecya_camisas_web.pdf` — la página de productos del sitio
   (https://www.fadecya-autopartes.com.ar/productos_camisas), impresa a PDF.
   Es la fuente que CONFIRMA las etiquetas de sobremedida, y la única que trae
   las camisas incorporadas después de 2019.

La etiqueta de cada sobremedida es el punto delicado. En el Excel, las nueve
columnas de "DIMENSIONES EXTERIORES INDICATIVAS" tienen DOS encabezados
superpuestos: uno en pulgadas (-.060", -.030", STD, +.030"…) y otro en
milímetros entre paréntesis ((+1,00), (+2,00), (+0,05)…). Cuál de los dos vale
lo dice la celda: **si el valor está entre paréntesis se lee con el encabezado
en milímetros, y si no, con el de pulgadas**. Sin esa regla una camisa "+0,50 mm"
se guarda como "+.020"" — que es otra medida. Cruzando las dos fuentes, la regla
acierta 361 de 366 valores que aparecen en las dos; los 5 restantes son celdas
con la etiqueta escrita adentro ("+.040"=") y se resuelven aparte, más abajo.

Lo que el catálogo trae y acá se descarta
─────────────────────────────────────────
- El asterisco de algunos valores ("81,76*"). Nadie en el taller sabe qué
  significa y un signo que no se puede explicar en pantalla es ruido.
- El "+" que llevan adelante muchos Ø exteriores de camisas húmedas
  ("+124,92"). Mismo motivo: el número se guarda, el signo no.

El alto de pestaña y el "?"
───────────────────────────
En la página, un alto de pestaña de 4,00 es casi siempre un 4,76 mal cargado
(dato del dueño). Como los números salen del Excel, esas 16 fichas ya quedan en
4,76. Las que dicen 4,00 **también en el Excel** se dejan en 4,00 y se marcan en
`extra.revisar`: la pantalla les pone un "?" al lado con la explicación.
"""
import json
import math
import os
import re
import sys
from collections import defaultdict

import pandas as pd

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUENTES = os.path.join(RAIZ, "CRAC", "tecnicos", "fuentes")
XLSX = os.path.join(FUENTES, "fadecya_camisas_2019.xlsx")
PDF = os.path.join(FUENTES, "fadecya_camisas_web.pdf")
CSV_PROVEEDOR = os.path.join(RAIZ, "CRAC", "precio-stock.csv")
SALIDA = os.path.join(RAIZ, "CRAC", "tecnicos", "camisas.json")

# Las nueve columnas de sobremedidas del Excel, con sus dos encabezados.
COLS = list(range(10, 19))
ETIQUETA_PULGADAS = {
    10: '-.060"', 11: '-.030"', 12: "STD", 13: '+.030"', 14: '+.060"',
    15: '+.002"', 16: '+.005"', 17: '+.010"', 18: '+.020"',
}
ETIQUETA_MM = {
    10: "+1.00MM", 11: "+2.00MM", 12: "STD", 13: "+0.05MM", 14: "+0.10MM",
    15: "+0.20MM", 16: "+0.25MM", 17: "+0.40MM", 18: "+0.50MM",
}

# Sufijo del código del proveedor → etiqueta de sobremedida. El proveedor tiene
# un código por medida ("C CEA  055 STD", "C CEA  055 -30"), igual que en
# subconjuntos y pistones, así que cada sobremedida puede llevar su precio.
#
# El sufijo de tres dígitos es ambiguo: "050" es +.050" o +0,50 mm, y "100" es
# +.10" o +1,00 mm. Se resuelve contra las sobremedidas de la ficha —el catálogo
# ya dijo cuáles existen— y solo si ninguna coincide se usa la primera opción.
MEDIDA_PROVEEDOR = {
    "STD": ["STD"], "-30": ['-.030"'], "-60": ['-.060"'],
    "0.5": ["+0.50MM"], "1.0": ["+1.00MM"],
}


def medidas_posibles(sufijo: str) -> list[str]:
    if sufijo in MEDIDA_PROVEEDOR:
        return MEDIDA_PROVEEDOR[sufijo]
    if not re.match(r"^\d{3}$", sufijo):
        return []
    milesimas = int(sufijo)
    return [etiqueta_pulgadas(milesimas), etiqueta_mm(milesimas / 100)]

# Camisas que estaban en el catálogo anterior y que Fadecya sacó de la página
# (y nunca estuvieron en el Excel de 2019). Se mantienen porque el proveedor las
# sigue teniendo en su lista: la ficha es lo único que queda para encontrarlas.
HEREDADAS = [
    {"codigo": "A 0073", "marca": "USO", "diam_int": 106.36, "diam_ext_cil": None,
     "alt_pest": 4.76, "largo": 304.8, "sobremedidas": {'+.090"': 113.41}},
    {"codigo": "UC 2078", "marca": "ISUZU", "diam_int": 84.0, "diam_ext_cil": None,
     "alt_pest": None, "largo": None, "sobremedidas": {"STD": 87.2}},
]

def paso_de(label: str):
    """Cuánto crece el Ø exterior en esa sobremedida, en mm. None si no se sabe."""
    if label == "STD":
        return 0.0
    m = re.match(r'^([+-])\.(\d+)"$', label)
    if m:
        digitos = m.group(2)
        milesimas = int(digitos) * (10 ** (3 - len(digitos))) if len(digitos) < 3 else int(digitos)
        return (1 if m.group(1) == "+" else -1) * milesimas * 0.0254
    m = re.match(r"^([+-])([\d.]+)MM$", label)
    return (1 if m.group(1) == "+" else -1) * float(m.group(2)) if m else None


# Cuánto puede alejarse un Ø exterior de "STD + el paso de su medida" antes de
# considerarlo mal cargado. Un cuarto de milímetro es redondeo del catálogo (la
# página escribe 76,00 donde el Excel pone 76,24); un milímetro ya no.
TOLERANCIA_PASO = 1.0

NOTA_ALTO_PESTANA = (
    "El catálogo de Fadecya dice 4,00. En la página, los 4,00 son casi siempre "
    "un 4,76 mal cargado, pero acá el Excel también dice 4,00: medir la pieza "
    "antes de pedirla."
)


# ── Utilidades ───────────────────────────────────────────────────────────────
def texto(valor) -> str:
    if valor is None or (isinstance(valor, float) and math.isnan(valor)):
        return ""
    return str(valor).strip()


def numero(valor):
    """El número de una celda que ES un número, o None.

    Tiene que ser estricto: "Ref. #C76050" no es un Ø exterior, y una versión
    laxa que se quedara con los dígitos lo leía como 0,76 mm. Se aceptan la coma
    decimal, el paréntesis y el "+" de adelante, que son notación del catálogo.
    """
    m = re.match(r"^\(?\s*[+-]?\s*(\d{1,4}(?:[.,]\d+)?)\s*\)?$", texto(valor))
    return round(float(m.group(1).replace(",", ".")), 2) if m else None


# Rangos con los que se descarta un número imposible leído de la página: la
# tabla del sitio tiene alguna fila donde las celdas se solapan y sale un largo
# de 16.020 mm. En el Excel no hace falta, pero un dato inventado es peor que
# ninguno.
RANGOS = {
    "diam_int": (20, 250), "diam_ext_cil": (20, 300),
    "alt_pest": (0.5, 30), "largo": (40, 500),
}


def pestana_creible(diam_ext_cil, diam_int) -> bool:
    """El Ø de pestaña tiene que ser mayor que el interior: la pestaña sobresale."""
    if diam_ext_cil is None:
        return False
    return diam_int is None or diam_ext_cil > diam_int


def creible(campo: str, valor):
    if valor is None:
        return None
    minimo, maximo = RANGOS[campo]
    return valor if minimo <= valor <= maximo else None


def normalizar_codigo(codigo: str) -> str:
    return " ".join(str(codigo).split()).upper()


def clave_codigo(codigo: str):
    """('A', 69) para "A 0069" — así se cruzan las tres fuentes, que escriben el
    mismo código con distinto relleno ("A 0069", "A  069", "A 69")."""
    m = re.match(r"^([A-Z]+)\s*0*(\d+)$", normalizar_codigo(codigo))
    return (m.group(1), int(m.group(2))) if m else None


# Secciones del Excel que no son una marca sino un rubro: ahí la marca sale de
# la página, que sí la trae ("YAMAHA" y no "MOTOS Y CICLOMOTORES").
SECCIONES_SIN_MARCA = {"MOTOS Y CICLOMOTORES", "COMPRESORES DE AIRE"}


def limpiar_marca(seccion) -> str | None:
    """La marca sale del título de sección del Excel, que a veces sigue en otra
    página ("PERKINS ( continuacion )")."""
    if not seccion:
        return None
    # El título de sección a veces trae, entre paréntesis, una aclaración
    # técnica ("diámetro y altura pestaña constante en las sobre medidas") o un
    # "(continuación)": la marca es lo que va antes.
    limpia = texto(seccion).split("(")[0]
    limpia = " ".join(limpia.upper().split()).replace("MERCEDES-BENZ", "MERCEDES BENZ")
    if not limpia or limpia in SECCIONES_SIN_MARCA:
        return None
    return limpia


def etiqueta_pulgadas(milesimas: float) -> str:
    """90 → '+.090"'; 100 → '+.10"'. Es como las escribe el catálogo."""
    signo = "-" if milesimas < 0 else "+"
    m = abs(milesimas)
    if m < 100:
        return f'{signo}.{int(round(m)):03d}"'
    return f'{signo}.{int(round(m / 10)):02d}"'


def etiqueta_mm(valor: float) -> str:
    return f"+{valor:.2f}MM"


def parsear_etiqueta(crudo: str):
    """La etiqueta que trae escrita una celda ('+.090"', '(+1,25)', '+0,05')."""
    s = texto(crudo).replace("''", '"').strip()
    if not s:
        return None
    if s.upper().startswith("STD"):
        return "STD"
    m = re.match(r'^\(?\s*([+-])\s*\.(\d+)\s*"?\s*\)?$', s)
    if m:
        signo = -1 if m.group(1) == "-" else 1
        digitos = m.group(2)
        milesimas = int(digitos) * (10 ** (3 - len(digitos))) if len(digitos) < 3 else int(digitos)
        return etiqueta_pulgadas(signo * milesimas)
    m = re.match(r"^\(?\s*\+\s*(\d+[.,]\d+)\s*\)?\s*(MM)?$", s, re.I)
    if m:
        return etiqueta_mm(float(m.group(1).replace(",", ".")))
    return None


# ── Fuente 1: el Excel ───────────────────────────────────────────────────────
def leer_excel() -> list[dict]:
    hoja = pd.read_excel(XLSX, sheet_name=0, header=None)
    fichas: list[dict] = []
    marca = None
    nota_seccion = None
    # Etiquetas que una fila dejó escritas para la fila de abajo. Pasa en un
    # solo bloque del catálogo (UC 1278), que trae su propio encabezado y sus
    # valores en las filas siguientes, sin repetir el código.
    etiquetas_pendientes: dict[int, str] = {}

    for i in range(5, len(hoja)):
        fila = hoja.iloc[i]
        codigo = texto(fila[3])
        if codigo in ("CODIGO", "ARTIC."):
            continue

        hay_datos = any(texto(fila[c]) for c in range(5, 19))
        if not codigo and not hay_datos:
            # Encabezado de sección: la marca del vehículo, que en el Excel es
            # el único lugar donde figura.
            titulo = texto(fila[2])
            if titulo and "NOTA:" not in titulo.upper():
                marca = titulo
                # La aclaración entre paréntesis del título vale para todas las
                # camisas de esa sección: se les guarda como nota.
                entre = re.search(r"\((.+)\)", titulo)
                aclaracion = (entre.group(1).strip() if entre else "")
                nota_seccion = aclaracion if aclaracion and "continuaci" not in aclaracion.lower() else None
            continue

        if codigo:
            ficha = {
                "aplicaciones": [texto(fila[2])] if texto(fila[2]) else [],
                "codigo": normalizar_codigo(codigo),
                "marca": marca,
                "humeda": texto(fila[4]).upper() == "H",
                "bocas": texto(fila[6]) or None,
                "diam_int": numero(fila[5]),
                "diam_ext_cil": numero(fila[7]),
                "alt_pest": numero(fila[8]),
                "largo": numero(fila[9]),
                "sobremedidas": {},
                "notas": [nota_seccion] if nota_seccion else [],
                "fila": i,
            }
            fichas.append(ficha)
        elif fichas:
            # Fila de continuación: los valores son del último código.
            ficha = fichas[-1]
            if texto(fila[2]):
                ficha["aplicaciones"].append(texto(fila[2]))
        else:
            continue

        etiquetas_fila = dict(etiquetas_pendientes)
        etiquetas_pendientes = {}
        etiqueta_a_la_espera = None

        for col in COLS:
            crudo = texto(fila[col]).replace("*", "").strip()
            if not crudo:
                continue

            # "+.040"=" — la etiqueta está en esta celda y el valor en la
            # siguiente que tenga número.
            if crudo.endswith("="):
                etiqueta_a_la_espera = parsear_etiqueta(crudo[:-1])
                continue

            # "+.090"= 104,05" — etiqueta y valor en la misma celda.
            m = re.match(r"^(.+?)\s*=\s*([\d.,]+)$", crudo)
            if m and parsear_etiqueta(m.group(1)) and numero(m.group(2)):
                ficha["sobremedidas"][parsear_etiqueta(m.group(1))] = numero(m.group(2))
                continue

            sola = parsear_etiqueta(crudo)
            valor = numero(crudo)
            # Una etiqueta suelta ("+1,25") se distingue de un Ø exterior
            # porque ninguna camisa mide menos de 10 mm.
            if sola and (valor is None or valor < 10):
                etiquetas_pendientes[col] = sola
                continue

            if valor is None:
                ficha["notas"].append(crudo)
                continue

            if etiqueta_a_la_espera:
                ficha["sobremedidas"][etiqueta_a_la_espera] = valor
                etiqueta_a_la_espera = None
                continue

            etiqueta = etiquetas_fila.get(col)
            if not etiqueta:
                entre_parentesis = "(" in texto(fila[col])
                etiqueta = (ETIQUETA_MM if entre_parentesis else ETIQUETA_PULGADAS)[col]
            ficha["sobremedidas"][etiqueta] = valor

    for f in fichas:
        f.pop("fila", None)
    return fichas


# ── Fuente 2: la página ──────────────────────────────────────────────────────
def leer_pagina() -> list[dict]:
    import pdfplumber

    # Los bordes de las ocho columnas de la tabla del sitio, en puntos. Son los
    # mismos en las doce páginas.
    verticales = [52, 114, 161, 223, 287, 349, 493, 637, 781]
    filas = []
    with pdfplumber.open(PDF) as pdf:
        for pagina in pdf.pages:
            tops = sorted({
                round(e["top"], 1) for e in pagina.edges
                if e["orientation"] == "h" and (e["x1"] - e["x0"]) > 100 and 40 < e["x0"] and e["x1"] < 800
            })
            horizontales: list[float] = []
            for t in tops:
                # Cada línea se dibuja como dos bordes a 0,75 pt: se colapsan.
                if not horizontales or t - horizontales[-1] > 2:
                    horizontales.append(t)
            if len(horizontales) < 3:
                continue
            tabla = pagina.extract_table({
                "vertical_strategy": "explicit", "horizontal_strategy": "explicit",
                "explicit_vertical_lines": verticales, "explicit_horizontal_lines": horizontales,
            }) or []
            for celdas in tabla:
                c = [(x or "").strip() for x in celdas] + [""] * 8
                if not re.match(r"^\d+([.,]\d+)?$", c[0]):
                    continue
                filas.append({
                    "codigo": normalizar_codigo(c[4]),
                    "diam_int": creible("diam_int", numero(c[0])),
                    "largo": creible("largo", numero(c[1])),
                    "diam_ext_cil": creible("diam_ext_cil", numero(c[2])),
                    "alt_pest": creible("alt_pest", numero(c[3])),
                    "valores": [numero(v) for v in c[5].split()],
                    "etiquetas": [parsear_etiqueta(e) or e for e in c[6].split()],
                    "marca": " ".join(c[7].split()) or None,
                })
    return filas


# ── Fuente 3: la lista del proveedor ─────────────────────────────────────────
def indice_proveedor() -> dict:
    """('A', 55) → [{'codigo': 'C CEA  055 STD', 'medida': 'STD', 'desc': …}, …]

    El código del proveedor es de ancho fijo: "C CE" + 3 para las letras + 4
    para el número + la medida.
    """
    indice = defaultdict(list)
    with open(CSV_PROVEEDOR, encoding="latin-1") as f:
        for linea in f:
            m = re.match(r'^"([^"]*)";"([^"]*)"', linea)
            if not m:
                continue
            codigo, descripcion = m.group(1), m.group(2)
            if not codigo.startswith("C CE"):
                continue
            letras, numero_, medida = codigo[4:7].strip(), codigo[7:11].strip(), codigo[11:].strip()
            if not letras or not numero_.isdigit():
                continue
            indice[(letras, int(numero_))].append({
                "codigo": codigo,
                "medidas": medidas_posibles(medida),
                "descripcion": descripcion,
            })
    return indice


# ── Armado ───────────────────────────────────────────────────────────────────
def combinar() -> list[dict]:
    excel = leer_excel()
    pagina = leer_pagina()
    proveedor = indice_proveedor()

    por_pagina = defaultdict(list)
    for f in pagina:
        if clave_codigo(f["codigo"]):
            por_pagina[clave_codigo(f["codigo"])].append(f)

    fichas: dict[tuple, dict] = {}
    orden: list[tuple] = []

    def registrar(clave, base):
        if clave not in fichas:
            fichas[clave] = base
            orden.append(clave)
            return fichas[clave]
        # El mismo código aparece más de una vez en el Excel (una por sección
        # de marca). Se completa lo que falte en vez de duplicar la ficha.
        vieja = fichas[clave]
        for campo in ("diam_int", "diam_ext_cil", "alt_pest", "largo", "bocas", "marca"):
            if vieja.get(campo) in (None, "") and base.get(campo) not in (None, ""):
                vieja[campo] = base[campo]
        # El mismo código puede venir con dos Ø de pestaña distintos y uno de los
        # dos imposible: la A 1166 figura con 61,70 bajo HONDA (menos que su Ø
        # interior de 62,50) y con 68,85 bajo motos. Gana el que puede ser.
        if (
            not pestana_creible(vieja.get("diam_ext_cil"), vieja.get("diam_int"))
            and pestana_creible(base.get("diam_ext_cil"), base.get("diam_int") or vieja.get("diam_int"))
        ):
            vieja["diam_ext_cil"] = base["diam_ext_cil"]
        for etiqueta, valor in base["sobremedidas"].items():
            vieja["sobremedidas"].setdefault(etiqueta, valor)
        for nota in base["notas"]:
            if nota not in vieja["notas"]:
                vieja["notas"].append(nota)
        for aplicacion in base.get("aplicaciones") or []:
            if aplicacion not in vieja["aplicaciones"]:
                vieja["aplicaciones"].append(aplicacion)
        return vieja

    for f in excel:
        clave = clave_codigo(f["codigo"])
        if not clave:
            continue
        registrar(clave, f)

    # Las camisas que la página tiene y el Excel de 2019 no: entran con los
    # datos de la página, que es lo único que hay de ellas.
    for clave, filas in por_pagina.items():
        if clave in fichas:
            continue
        f = filas[0]
        registrar(clave, {
            "codigo": f["codigo"], "marca": f["marca"], "aplicacion": None,
            "aplicaciones": [], "humeda": False, "bocas": None,
            "diam_int": f["diam_int"], "diam_ext_cil": f["diam_ext_cil"],
            "alt_pest": f["alt_pest"], "largo": f["largo"],
            "sobremedidas": {}, "notas": [], "solo_pagina": True,
        })

    for h in HEREDADAS:
        registrar(clave_codigo(h["codigo"]), {
            **h, "aplicaciones": [], "humeda": False, "bocas": None, "notas": [],
        })

    salida = []
    for clave in orden:
        f = fichas[clave]
        sobremedidas = dict(f["sobremedidas"])
        de_pagina = por_pagina.get(clave) or []

        for p in de_pagina:
            if len(p["etiquetas"]) == len(p["valores"]):
                for etiqueta, valor in zip(p["etiquetas"], p["valores"]):
                    if valor is None or not etiqueta:
                        continue
                    # Un valor que ya está (con cualquier etiqueta) no se toca:
                    # el Excel manda. Solo se agregan las medidas nuevas.
                    if any(v is not None and abs(v - valor) <= 0.03 for v in sobremedidas.values()):
                        continue
                    sobremedidas.setdefault(etiqueta, valor)
            # La página a veces publica la medida sin el Ø exterior ("STD" y
            # nada más). Igual se guarda: dice que esa medida existe.
            for etiqueta in p["etiquetas"]:
                if etiqueta:
                    sobremedidas.setdefault(etiqueta, None)

        if f.get("solo_pagina") and not f["alt_pest"]:
            f["alt_pest"] = de_pagina[0]["alt_pest"] if de_pagina else None

        # Sin dato en el Excel se completa con la página, que es mejor que nada.
        if de_pagina:
            for campo in ("diam_int", "diam_ext_cil", "alt_pest", "largo"):
                if f.get(campo) is None and de_pagina[0].get(campo) is not None:
                    f[campo] = de_pagina[0][campo]
            # Y si el Ø de pestaña del Excel es imposible pero el de la página
            # cierra, se usa el de la página en vez de publicar un número que
            # no puede ser.
            if not pestana_creible(f.get("diam_ext_cil"), f.get("diam_int")) and pestana_creible(
                de_pagina[0].get("diam_ext_cil"), f.get("diam_int")
            ):
                f["diam_ext_cil"] = de_pagina[0]["diam_ext_cil"]

        revisar = {}
        if f["alt_pest"] == 4:
            revisar["alt_pest"] = NOTA_ALTO_PESTANA
        # Una sobremedida tiene que caer donde su nombre dice: la +.030" es la
        # STD más 0,76 mm. La que no cierra está mal cargada en el catálogo
        # (la UC 0817 repite ahí el Ø de pestaña), y se marca en vez de
        # corregirla a ojo.
        std = sobremedidas.get("STD")
        if std is not None:
            descolgadas = [
                etiqueta for etiqueta, valor in sobremedidas.items()
                if valor is not None and paso_de(etiqueta) is not None
                and abs(std + paso_de(etiqueta) - valor) > TOLERANCIA_PASO
            ]
            if descolgadas:
                revisar["sobremedidas"] = (
                    "El catálogo da un Ø exterior que no coincide con la medida: "
                    + ", ".join(descolgadas)
                    + " tendría que estar cerca de la STD ("
                    + f"{std:.2f}".replace(".", ",")
                    + " mm) más esa sobremedida. Confirmar antes de pedirla."
                )
        if f["diam_ext_cil"] and not pestana_creible(f["diam_ext_cil"], f["diam_int"]):
            revisar["diam_ext_cil"] = (
                "El catálogo da un Ø de pestaña menor que el Ø interior, que no "
                "puede ser: está mal cargado en el catálogo."
            )

        # Las que no tienen Ø publicado van al final, sin fingir un orden.
        lista = sorted(sobremedidas.items(), key=lambda kv: (kv[1] is None, kv[1] or 0))
        codigos_proveedor = []
        for c in proveedor.get(clave) or []:
            posibles = [m for m in c["medidas"] if m in sobremedidas] or c["medidas"]
            codigos_proveedor.append({
                "codigo": c["codigo"],
                "medida": posibles[0] if posibles else None,
                "descripcion": c["descripcion"],
            })
        # STD primero: es el precio que se muestra cuando hay varios.
        codigos_proveedor.sort(key=lambda c: (c["medida"] != "STD", c["medida"] or ""))
        descripcion = codigos_proveedor[0]["descripcion"] if codigos_proveedor else None

        aplicaciones = [a for a in (f.get("aplicaciones") or []) if a]
        marca_pagina = de_pagina[0]["marca"] if de_pagina else None

        salida.append({
            "codigo": f["codigo"],
            "codigo_fab": f["codigo"],
            # La sección del Excel primero: es siempre una marca sola, mientras
            # que la columna de la página a veces trae dos ("KIA MAZDA").
            "marca": limpiar_marca(f.get("marca")) or limpiar_marca(marca_pagina) or "FADECYA",
            "aplicacion": " / ".join(dict.fromkeys(aplicaciones)) or None,
            "descripcion": descripcion,
            "medidas": {
                "diam_int": f["diam_int"],
                "diam_ext_cil": f["diam_ext_cil"],
                "alt_pest": f["alt_pest"],
                "largo": f["largo"],
            },
            "extra": {
                "tipo_camisa": "Húmeda" if f.get("humeda") else "Seca",
                "bocas": f.get("bocas"),
                "notas": f.get("notas") or [],
                "sobremedidas": [{"label": etiqueta, "valor": valor} for etiqueta, valor in lista],
                "revisar": revisar or None,
            },
            "codigos_crac": [
                {"codigo": c["codigo"], "medida": c["medida"]} for c in codigos_proveedor
            ],
        })
    return salida


def main():
    for ruta in (XLSX, PDF, CSV_PROVEEDOR):
        if not os.path.exists(ruta):
            sys.exit(f"falta {ruta}")

    fichas = combinar()
    with open(SALIDA, "w", encoding="utf-8") as f:
        json.dump(fichas, f, ensure_ascii=False, indent=1)
        f.write("\n")

    con_proveedor = sum(1 for x in fichas if x["codigos_crac"])
    humedas = sum(1 for x in fichas if x["extra"]["tipo_camisa"] == "Húmeda")
    sobremedidas = sum(len(x["extra"]["sobremedidas"]) for x in fichas)
    dudosas = sum(len(x["extra"]["revisar"] or {}) for x in fichas)
    print(f"✓ camisas: {len(fichas)} fichas ({humedas} húmedas) · "
          f"{con_proveedor} con código del proveedor · {sobremedidas} sobremedidas · "
          f"{dudosas} medidas marcadas para verificar")


if __name__ == "__main__":
    main()
