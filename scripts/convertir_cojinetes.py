#!/usr/bin/env python3
"""
Arma `CRAC/tecnicos/cojinetes_biela.json` y `cojinetes_bancada.json` leyendo los
cuatro catálogos de cojinetes que hay en `CRAC/tecnicos/fuentes/` y cruzándolos
contra la lista del proveedor.

POR QUÉ EXISTE
--------------
El proveedor vende 5.170 renglones de la categoría CA (biela) y 4.800 de la CB
(bancada), y de cada uno se sabe el precio y una descripción de una línea. Nada
más. No hay forma de encontrar un cojinete midiendo el muñón del cigüeñal, que es
exactamente lo que hace el rectificador cuando le entra un motor sin
identificar.

Los catálogos de los fabricantes sí traen esas medidas. Este script las saca de
los PDF y las pega al código del proveedor, que es el único que sirve para pedir
la pieza. El universo de la familia es la lista del proveedor: si el proveedor no
lo vende, no entra, por más que el catálogo lo traiga.

LAS DOS FAMILIAS
----------------
Biela y bancada son la misma tabla del mismo catálogo leyendo otra fila. Todo lo
que las diferencia está en `PIEZAS`, acá abajo: la categoría del proveedor, las
marcas que entran y cómo dice cada catálogo "esta fila es de bancada". Hoy biela
trae las tres marcas y bancada sólo Glyco, que es lo que pidió el dueño.

CÓMO SE LEEN LOS CATÁLOGOS
--------------------------
Está explicado en `CRAC/tecnicos/CARGA-COJINETES.md`, uno por uno.

Lo que hay que saber para leer este archivo:

* Los cuatro catálogos traen las mismas cinco columnas de medida, PERO EN
  DISTINTO ORDEN. Mahle y Glyco: Ø eje · Ø alojamiento · ancho · espesor · luz.
  Federal Mogul: Ø eje · Ø alojamiento · luz · espesor · ancho. Eso está en
  `ORDEN_COLUMNAS`.

* Una fila puede tener columnas vacías, y el texto del PDF no dice cuál falta:
  llegan tres números sueltos y hay que adivinar a qué columna va cada uno. Se
  resuelve con `asignar_columnas()`, que prueba las combinaciones que respetan el
  orden del catálogo y descarta las que dan valores imposibles (un espesor de
  cojinete de biela no mide 50 mm ni una luz de aceite mide 20). Cuando queda más
  de una combinación posible se toma la que llena las columnas de más a la
  izquierda y la ficha queda marcada en `extra.revisar`.

* Los números vienen partidos por la mitad ("2,159/2,1 72" es 2,159/2,172). Se
  arregla en `numeros()` con la regla de que los dos números de un rango tienen
  la misma cantidad de decimales.

USO
---
    .venv/bin/python scripts/convertir_cojinetes.py            # las tres familias
    .venv/bin/python scripts/convertir_cojinetes.py axial      # una sola

No pisa nada más que los JSON de las familias que rehace. Al final imprime, para cada familia, el
resumen: cuántas fichas por marca, cuántas quedaron con datos en duda y qué
códigos del proveedor no están en ningún catálogo. Tarda unos cinco minutos: el
catálogo de Glyco son 1.252 páginas y se lee dos veces, una por familia.
"""

from __future__ import annotations

import csv
import json
import re
import sys
import unicodedata
from itertools import combinations
from pathlib import Path

from pypdf import PdfReader

RAIZ = Path(__file__).resolve().parent.parent
FUENTES = RAIZ / "CRAC" / "tecnicos" / "fuentes"
TECNICOS = RAIZ / "CRAC" / "tecnicos"
PRECIO_STOCK = RAIZ / "CRAC" / "precio-stock.csv"


# ---------------------------------------------------------------------------
# Las dos familias que salen de estos mismos cuatro PDF.
#
# Biela y bancada son la misma tabla del mismo catálogo leyendo otra fila: lo
# único que cambia es cómo dice cada catálogo "esta fila es de bancada" y qué
# categoría les pone el proveedor. Por eso está acá arriba en una sola tabla y
# no desparramado en cuatro lectores.
# ---------------------------------------------------------------------------
PIEZAS = {
    "biela": {
        "categoria": "CA",
        "salida": "cojinetes_biela.json",
        "titulo": "cojinetes de biela",
        "forma": "cojinete",
        "marcas": ("BE", "F", "GL"),
        # Mahle no pone el tipo de pieza en la fila: lo dice la columna de
        # composición, que sí está en todos los renglones del juego.
        "mahle": ("BB", "SBB"),
        "fm": "biela",
    },
    "bancada": {
        "categoria": "CB",
        "salida": "cojinetes_bancada.json",
        "titulo": "cojinetes de bancada",
        "forma": "cojinete",
        # Las tres marcas, igual que biela (2026-09-07): entró primero sólo
        # Glyco y el mismo día se sumaron Mahle y Federal Mogul, que ya se
        # leían —es la misma tabla cambiando la columna de composición y la
        # palabra de la etiqueta—. Mahle resuelve 110 de sus 136 códigos y
        # Federal Mogul 63 de 134.
        "marcas": ("BE", "F", "GL"),
        "mahle": ("BC", "SBC"),
        "fm": "bancada",
    },
    # La tercera familia (2026-09-07) NO es un cojinete: es la semiarandela de
    # empuje, que no abraza un muñón sino que apoya contra el costado del
    # cigüeñal y le fija el juego axial. Sale de las mismas tablas de los mismos
    # cuatro catálogos, así que la lee el mismo script, pero se mide distinto —
    # Ø interior, Ø exterior y espesor— y las medidas del proveedor son
    # SOBREmedidas de espesor, no bajomedidas del muñón: cuando el cigüeñal se
    # rectifica en la cara de empuje hay que ponerle una arandela más gruesa.
    # Todo eso está en `forma`.
    "axial": {
        "categoria": "CF",
        "salida": "cojinetes_axiales.json",
        "titulo": "cojinetes axiales",
        "forma": "axial",
        "marcas": ("BE", "F", "GL"),
        # Arruela de encosto: los cuatro prefijos que usa Mahle en la columna de
        # composición (`AE-032-P`, `SAE-043-C`, `L-10`).
        "mahle": ("AE", "SAE", "L", "SL"),
        "fm": "axial",
    },
}


# ---------------------------------------------------------------------------
# Las dos formas de medir que hay en estos catálogos.
#
# La extracción trabaja siempre con los nombres del cojinete —son las mismas
# columnas del mismo PDF, en la misma posición— y recién la ficha les pone el
# nombre que corresponde a la pieza. En la semiarandela, la columna del Ø del
# eje trae el Ø INTERIOR y la del alojamiento, el Ø EXTERIOR.
#
# El primer campo de cada forma es el principal: el que decide si la ficha tiene
# medidas o no, y contra el que se restan (o suman) las medidas del proveedor.
# ---------------------------------------------------------------------------
CAMPOS = {
    "cojinete": {"diam_munon": "diam_munon", "diam_alojamiento": "diam_alojamiento",
                 "ancho": "ancho", "espesor": "espesor"},
    "axial": {"diam_int": "diam_munon", "diam_ext": "diam_alojamiento",
              "espesor": "espesor"},
}


# ---------------------------------------------------------------------------
# Las cinco columnas de medida y qué valores puede tomar cada una.
#
# Los rangos no son decorativos: son lo que permite saber qué columna quedó
# vacía cuando el PDF manda menos de cinco números. Salieron de mirar el mínimo y
# el máximo de cada columna en los cuatro catálogos, con aire a los dos lados.
# ---------------------------------------------------------------------------
RANGOS = {
    "diam_munon": (14.0, 145.0),
    "diam_alojamiento": (16.0, 155.0),
    "ancho": (6.5, 75.0),
    "espesor": (0.8, 6.5),
    "luz": (0.003, 0.6),
}

ORDEN_COLUMNAS = {
    # Mahle (2019 y Clevite): 7 Ø eje · 8 Ø alojamiento · 9 largura · 10 espessura · 11 folga
    "mahle": ["diam_munon", "diam_alojamiento", "ancho", "espesor", "luz"],
    # Federal Mogul: E Ø eje · F Ø alojamiento · G luz de aceite · H espesor · I ancho
    "fm": ["diam_munon", "diam_alojamiento", "luz", "espesor", "ancho"],
    # Glyco: 6 Ø eje · 7 Ø alojamiento · 8 ancho máximo · 9 espesor máximo · 10 luz
    # (la numeración es la de su propia página "HOW TO USE"). Coincide con la de
    # Mahle, pero va aparte porque son catálogos distintos y nada garantiza que
    # sigan coincidiendo en la próxima edición.
    "glyco": ["diam_munon", "diam_alojamiento", "ancho", "espesor", "luz"],
}


# ---------------------------------------------------------------------------
# Lectura del PDF: cada página como una lista de renglones, y cada renglón como
# una lista de (x, texto). pypdf entrega el texto en pedazos con su posición; los
# pedazos que están a la misma altura son un renglón de la tabla.
# ---------------------------------------------------------------------------
def paginas(pdf: Path) -> list[list[tuple[float, list[tuple[float, str]]]]]:
    reader = PdfReader(str(pdf))
    salida = []
    for pagina in reader.pages:
        pedazos: list[tuple[float, float, str]] = []

        def visitar(texto, cm, tm, fuente, tamano, _p=pedazos):
            limpio = texto.strip()
            if limpio:
                _p.append((round(tm[5], 1), round(tm[4], 1), limpio))

        pagina.extract_text(visitor_text=visitar)
        salida.append(agrupar_renglones(pedazos))
    return salida


def agrupar_renglones(pedazos, tolerancia=2.5):
    """Junta en un renglón los pedazos que están a la misma altura (±2,5 pt)."""
    pedazos = sorted(pedazos, key=lambda p: (-p[0], p[1]))
    renglones: list[tuple[float, list[tuple[float, str]]]] = []
    for y, x, texto in pedazos:
        if renglones and abs(renglones[-1][0] - y) <= tolerancia:
            renglones[-1][1].append((x, texto))
        else:
            renglones.append((y, [(x, texto)]))
    for _, celdas in renglones:
        celdas.sort()
    return renglones


def texto_entre(celdas, x0, x1) -> str:
    return " ".join(t for x, t in celdas if x0 <= x < x1).strip()


# ---------------------------------------------------------------------------
# Números
# ---------------------------------------------------------------------------
_NUM = re.compile(
    r"(?<![\d,.])(\d{1,3})[.,](\d{1,4})"                    # 49,992
    r"(?:\s*/\s*(\d{1,3})[.,]\s*(\d{1,4}))?"               # /50,000
)


def numeros(texto: str) -> list[float | list[float]]:
    """
    Los grupos numéricos de un texto, en orden. Un grupo es un número suelto
    (`24,70`) o un rango (`24,45/24,70`), y sale como float o como lista de dos.

    El PDF parte números por la mitad —"2,159/2,1 72" es 2,159/2,172—, siempre en
    el segundo número del rango. Se reconoce porque le quedan menos decimales que
    al primero, y los que faltan son los dígitos sueltos que vienen atrás.
    """
    salida = []
    for m in _NUM.finditer(texto):
        ent1, dec1, ent2, dec2 = m.groups()
        primero = float(f"{ent1}.{dec1}")
        if not ent2:
            salida.append(primero)
            continue
        if len(dec2) < len(dec1):
            cola = re.match(r"\s(\d{1,3})(?![\d,.])", texto[m.end():])
            if cola:
                dec2 = (dec2 + cola.group(1))[: len(dec1)]
        salida.append([primero, float(f"{ent2}.{dec2}")])
    return salida


def valor_representativo(grupo) -> float:
    return grupo[0] if isinstance(grupo, list) else grupo


def asignar_columnas(grupos, orden: list[str]) -> tuple[dict, bool]:
    """
    Reparte los grupos numéricos de una fila entre las columnas del catálogo.

    El PDF no dice qué columna quedó vacía: manda los números que hay y listo. Lo
    único seguro es que vienen en el orden del catálogo, así que se prueban las
    combinaciones de columnas de ese tamaño que respetan el orden y se descarta
    toda la que ponga un valor fuera del rango de su columna (`RANGOS`).

    Devuelve el reparto y si quedó dudoso (más de una combinación posible).
    """
    if not grupos or len(grupos) > len(orden):
        return {}, bool(grupos)

    validas = []
    for eleccion in combinations(range(len(orden)), len(grupos)):
        reparto = {}
        for grupo, idx in zip(grupos, eleccion):
            columna = orden[idx]
            minimo, maximo = RANGOS[columna]
            if not (minimo <= valor_representativo(grupo) <= maximo):
                break
            reparto[columna] = grupo
        else:
            # El alojamiento siempre es más grande que el muñón que abraza.
            munon = reparto.get("diam_munon")
            alojamiento = reparto.get("diam_alojamiento")
            if munon and alojamiento and valor_representativo(alojamiento) <= valor_representativo(munon):
                continue
            validas.append(reparto)

    if not validas:
        return {}, True
    return validas[0], len(validas) > 1


# ---------------------------------------------------------------------------
# Medidas (las bajomedidas: STD, 0,25, .010"…)
# ---------------------------------------------------------------------------
def etiquetas_medida(texto: str) -> list[str]:
    """
    Las bajomedidas que ofrece el juego, tal como las escribe el catálogo.

    Mahle las separa con barra ("STD/ 0,25/ 0,50") y Federal Mogul con guión
    ("STD-10-20-30" o "STD-0.25-0.50"). El sufijo "-S" de Mahle ("STD-S") es
    "semiterminado" y no es una bajomedida: se guarda aparte.
    """
    texto = texto.replace("S T D", "STD")
    partes = [p.strip() for p in re.split(r"[/\-–]", texto) if p.strip()]
    salida = []
    for parte in partes:
        parte = parte.strip().rstrip(".")
        if parte.upper() in ("S", "SEMI"):
            continue
        if parte.upper() == "STD":
            salida.append("STD")
        elif re.fullmatch(r"\d*[.,]?\d+", parte):
            salida.append(parte.replace(",", ".").lstrip("+"))
    # sin duplicados, conservando el orden
    vistas, unicas = set(), []
    for etiqueta in salida:
        if etiqueta not in vistas:
            vistas.add(etiqueta)
            unicas.append(etiqueta)
    return unicas


def bajomedida_mm(etiqueta: str, milesimas_de_pulgada: bool) -> float | None:
    """Cuánto se le sacó al muñón, en mm. 'STD' es cero; '.010"' son 0,254 mm."""
    if etiqueta == "STD":
        return 0.0
    try:
        valor = float(etiqueta)
    except ValueError:
        return None
    return round(valor * 0.0254, 4) if milesimas_de_pulgada else valor




# ===========================================================================
# Los dos catálogos de Mahle (2019 y Clevite 2014)
# ===========================================================================
#
# Comparten la misma grilla, así que los lee la misma función. Las columnas, con
# la numeración que el propio catálogo publica en su página de uso:
#
#   x  20..100  (1) Aplicação/Motor/Modelo
#   x 100..172  (2)(3) Nº de cilindros y Ø del cilindro × carrera
#   x 172..215  (4) Códigos: Metal Leve y MAHLE Original
#   x 215..260  (5) Composición: pares/piezas + código Clevite
#   x 260..310  (5)(6) Tipo (material) y Medidas (las bajomedidas del juego)
#   x 310..362  (7)  Ø standard del eje      ← muñón de biela
#   x 362..415  (8)  Ø standard del alojamiento
#   x 415..465  (9)  Ancho (largura)
#   x 465..512  (10) Espesor standard
#   x 512..580  (11) Luz vertical (folga)
#
# Las cinco columnas de medida están en posiciones FIJAS, y eso es lo que hace
# que se pueda saber cuál quedó vacía. En algunas páginas, sin embargo, el PDF
# manda las cinco juntas en un solo pedazo de texto; ahí no queda otra que
# repartirlas por tamaño con `asignar_columnas()`.
#
# Cuando el catálogo trae también las pulgadas, van en un renglón aparte debajo,
# en las mismas columnas. Se descartan: el sistema trabaja en milímetros.
#
# La letra con la que arranca el código MAHLE dice qué pieza es (B y SB son las
# de biela; M y SM las de bancada — ver CARGA-COJINETES.md). Pero el código va
# sólo en el PRIMER renglón de cada juego, y un juego puede ocupar varios (el
# semicojinete superior y el inferior, o una posición por muñón). Por eso el
# filtro se hace sobre la columna de composición, que sí está en todos los
# renglones: BB/SBB es biela, BC/SBC es bancada.
MAHLE_OFFSET_DERECHA = 595.5
MAHLE_COLS = {"aplic": (20, 100), "cil": (100, 172), "cod": (172, 215),
              "comp": (215, 260), "medidas": (260, 310)}
MAHLE_COLS_MEDIDA = [
    ("diam_munon", 310, 362),
    ("diam_alojamiento", 362, 415),
    ("ancho", 415, 465),
    ("espesor", 465, 512),
    ("luz", 512, 580),
]
MAHLE_COMPOSICION = re.compile(r"^\d*(?P<pieza>[A-Z]{1,4})-\d+(?:-[A-Z]+)?")
MAHLE_CODIGO = re.compile(r"^S?[BMGHL]\d{4,8}$")


def _media_pagina(renglones, offset):
    """Los renglones de una de las dos páginas impresas, con las x normalizadas."""
    salida = []
    for y, celdas in renglones:
        propias = [(x - offset, t) for x, t in celdas if 0 <= x - offset < 595]
        if propias:
            salida.append((y, propias))
    return salida


def leer_mahle(pdf: Path, catalogo: str, dos_por_hoja: bool,
               piezas: tuple[str, ...] = ("BB", "SBB"),
               corte: float = None) -> list[dict]:
    """
    Las filas de cojinete de biela de un catálogo de Mahle.

    `piezas` es lo único que hay que cambiar para leer bancada: ("BC", "SBC").
    """
    offsets = (0.0, MAHLE_OFFSET_DERECHA) if dos_por_hoja else (0.0,)
    filas = []
    for hoja, renglones in enumerate(paginas(pdf), 1):
        for offset in offsets:
            filas += _leer_pagina_mahle(
                _media_pagina(renglones, offset), hoja, catalogo, piezas, corte
            )
    return filas


def _leer_pagina_mahle(renglones, hoja, catalogo, piezas, corte=None):
    """
    Recorre la página de arriba abajo llevando dos cosas: el motor al que
    pertenecen las filas que van saliendo, y la fila abierta (la última fila de
    biela vista, que todavía puede recibir su código y el resto de sus medidas
    en los renglones de abajo).

    El motor va en un dict compartido con las filas y no como texto ya armado:
    su descripción sigue varios renglones MÁS ABAJO de la primera fila, así que
    cuando la fila se crea todavía está incompleta.
    """
    filas, motor, abierta = [], _motor_vacio(), None
    impresa = _pagina_impresa(renglones)

    for _y, celdas in renglones:
        cil = texto_entre(celdas, *MAHLE_COLS["cil"])
        aplic = texto_entre(celdas, *MAHLE_COLS["aplic"])
        comp = texto_entre(celdas, *MAHLE_COLS["comp"]).replace(" ", "")
        cod = texto_entre(celdas, *MAHLE_COLS["cod"]).replace(" ", "")
        medidas = texto_entre(celdas, *MAHLE_COLS["medidas"])

        # Las filas que continúan un juego no repiten el código, y el catálogo
        # les corre la composición hasta el margen izquierdo.
        if not comp and MAHLE_COMPOSICION.match(aplic.replace(" ", "")):
            comp, aplic = aplic.replace(" ", ""), ""

        if cil and re.match(r"^\d+(\s|$)", cil):
            partes = cil.split(None, 1)
            motor = _motor_vacio()
            motor["nro_cil"] = partes[0]
            motor["diam_x_carrera"] = partes[1] if len(partes) > 1 else None
            if aplic:
                motor["modelo"].append(aplic)
        elif aplic and not _es_pie_de_pagina(aplic):
            motor["modelo"].append(aplic)

        pieza = MAHLE_COMPOSICION.match(comp)
        if pieza and comp[pieza.end():]:
            # Hay renglones que el PDF manda enteros dentro de la columna de
            # composición, sin un solo espacio: "12BB-1053-CSTD55,992/56,008…".
            medidas = comp[pieza.end():] + " " + medidas
            comp = pieza.group(0)
        if pieza:
            abierta = None
            if pieza.group("pieza") in piezas:
                abierta = _fila_mahle(comp, cod, medidas, celdas, motor,
                                      impresa or hoja, catalogo, corte)
                filas.append(abierta)
            continue

        if abierta is None:
            continue
        if MAHLE_CODIGO.match(cod) and not abierta["codigo_fab"]:
            abierta["codigo_fab"] = cod
        # Las bajomedidas que no entraron en el ancho de la columna siguen abajo.
        # Lo que aparece en las columnas de medida es la fila en pulgadas: se tira.
        if medidas:
            abierta["medidas_txt"] += " " + medidas


    return [f for f in filas if f["codigo_fab"]]


def _motor_vacio():
    return {"fabricante": "", "modelo": [], "nro_cil": None,
            "diam_x_carrera": None, "cilindrada": None}


def _es_pie_de_pagina(texto: str) -> bool:
    return "MAHLE 20" in texto or "sob consulta" in texto


def _pagina_impresa(renglones):
    """
    El número de página IMPRESO, que es el que sirve para volver a mirar la
    fila en el catálogo. No coincide con el del PDF: el de Mahle 2019 trae dos
    páginas impresas por hoja. Sale del pie ("342 | © MAHLE 2019/2020").
    """
    for _y, celdas in renglones[-6:]:
        texto = " ".join(t for _x, t in celdas)
        numero = re.search(r"(\d{1,3})\s*\|\s*©|©[^|]*\|\s*(\d{1,3})", texto)
        if numero:
            return int(numero.group(1) or numero.group(2))
    return None


# Dónde empieza la primera columna de medida en cada familia. En el cojinete es
# el Ø del muñón, que nunca baja de 14 mm; en la semiarandela, el espesor, que
# no baja de 1,5 mm. El corte tiene que quedar por debajo de la medida más chica
# y por encima de la medida del juego más grande (una bajomedida de cojinete
# llega a 1,00 mm y una sobremedida de arandela, a 0,50), y 1,2 cumple las dos.
CORTE = {"cojinete": RANGOS["diam_munon"][0], "axial": 1.2}


def corte_de_medidas(texto: str, minimo: float = None) -> int:
    """
    Dónde termina la lista de medidas del juego y empieza la primera columna de
    medida.

    No se puede cortar por la barra, porque las medidas del juego también van
    separadas con barra ("STD/ 0,25/ 0,50"). Se corta por el tamaño, que no se
    pisa (ver `CORTE`).
    """
    minimo = CORTE["cojinete"] if minimo is None else minimo
    for m in re.finditer(r"(?<![\d,.])(\d{1,3})[.,]\d", texto):
        if float(m.group(0).replace(",", ".")) >= minimo:
            return m.start()
    return len(texto)


def _fila_mahle(comp, cod, medidas, celdas, motor, hoja, catalogo, minimo=None):
    # Hay páginas que mandan las cinco columnas de medida pegadas al final de la
    # columna de bajomedidas, en un solo pedazo de texto.
    corte = corte_de_medidas(medidas, minimo)
    medidas, sueltos = medidas[:corte], numeros(medidas[corte:])
    grupos_por_columna = {}
    for columna, x0, x1 in MAHLE_COLS_MEDIDA:
        grupos = numeros(texto_entre(celdas, x0, x1))
        if len(grupos) == 1 and not sueltos:
            grupos_por_columna[columna] = grupos[0]
        elif grupos:
            # Varias columnas en un pedazo solo: no hay posición que valga y hay
            # que repartirlas por tamaño.
            sueltos += grupos

    dudoso = False
    if sueltos:
        grupos_por_columna, dudoso = asignar_columnas(
            list(grupos_por_columna.values()) + sueltos, ORDEN_COLUMNAS["mahle"]
        )

    tipo = re.match(r"^\s*([A-Z]{1,3})\b", medidas)
    return {
        "catalogo": catalogo,
        "hoja_pdf": hoja,
        "codigo_fab": cod if MAHLE_CODIGO.match(cod) else "",
        "codigo_metal_leve": None if MAHLE_CODIGO.match(cod) else (cod or None),
        "composicion": comp,
        "tipo_material": tipo.group(1) if tipo else None,
        "medidas_txt": medidas[tipo.end():] if tipo else medidas,
        "columnas": grupos_por_columna,
        "dudoso": dudoso,
        "motor": motor,
        "pulgadas": False,
    }


# ===========================================================================
# Federal Mogul
# ===========================================================================
#
# Otra grilla y otro orden de columnas. Las letras son las que el propio
# catálogo usa en su página de instrucciones:
#
#   x  40.. 62  fabricante del vehículo, y debajo el número de grupo + modelos
#   x  62..145  B  pieza (Biela / Bancada / Axial / Levas / Buje) y
#               C  número de juego + sufijo de material
#   x 145..250  D  medidas (las bajomedidas del juego) y las columnas E a I:
#               E Ø estándar del eje · F Ø del alojamiento · G luz de aceite ·
#               H espesor máximo · I ancho total
#   x 250..     la misma fila en pulgadas (se descarta) y notas sueltas
#
# Ojo con dos cosas:
#
# * El orden de las columnas NO es el de Mahle: acá la luz de aceite va tercera,
#   entre el alojamiento y el espesor. Por eso `ORDEN_COLUMNAS` tiene dos
#   entradas.
# * El dígito adelante del número de juego es la cantidad de pares de
#   semicojinetes ("4-1490" son cuatro pares), no parte del número. El proveedor
#   lo tira: vende "F 1490".
# * Las últimas páginas, las de vehículos europeos, usan numeración GLYCO
#   ("01-3841/6", "71-3728/4") en vez de la de Federal Mogul. Glyco es marca de
#   Federal-Mogul y el proveedor los lista aparte, con el prefijo GL.
# Este catálogo NO se lee por posición como los de Mahle: el margen izquierdo se
# corre de una página a otra (76 pt en unas, 45 en otras) y la columna de medidas
# con él, así que una x fija manda la mitad de las filas a la columna equivocada.
# Se lee por contenido: se junta el renglón entero y se lo parte por lo que dice.
FM_ETIQUETA = re.compile(r"\b(?P<pieza>Bielas?|Bancadas?|Axial|Levas|Bujes?)\b", re.I)
FM_JUEGO = re.compile(r"^(?P<pares>\d{1,2})-(?P<numero>\d{3,6})\s*(?P<sufijo>[A-Z]{1,3})?$")
# El juego de bancada no lleva los pares adelante: se escribe "7108 M", donde la
# "M" es lo que dice que es de bancada. El proveedor lo vende como "7108".
FM_BANCADA = re.compile(r"^(?P<numero>\d{3,6})\s*(?P<sufijo>M)$")
# Un renglón de medidas de verdad trae siempre un rango ("69.837/69.850"). Es lo
# que lo distingue del Ø x carrera del motor ("98.43 x 82.55"), que también tiene
# números con coma y se cuela cuando se busca la continuación de una fila.
FM_RANGO = re.compile(r"\d+[.,]\d+\s*/\s*\d+[.,]\d+")
FM_GLYCO = re.compile(r"^(?P<numero>\d{2}-\d{3,4}(?:/\d+)?)\s*(?P<sufijo>[A-Z]{1,3})?$")
# La semiarandela tampoco lleva los pares adelante ni la "M" de bancada: se
# escribe "66326 AF", número y sufijo de material, que es como la vende el
# proveedor ("66326").
FM_AXIAL = re.compile(r"^(?P<numero>\d{3,6})\s*(?P<sufijo>[A-Z]{1,3})?$")


def leer_federal_mogul(pdf: Path, pieza: str, corte: float = None) -> list[dict]:
    filas = []
    for hoja, renglones in enumerate(paginas(pdf), 1):
        filas += _leer_pagina_fm(renglones, hoja, pieza, corte)
    return filas


def _leer_pagina_fm(renglones, hoja, pieza, corte=None):
    filas, motor, primera_del_grupo = [], _fm_motor_vacio(), False
    cortada = ""

    for _y, celdas in renglones:
        texto = " ".join(t for x, t in celdas if x < 600).strip()
        if not texto:
            continue
        # El Ø del cilindro, la carrera y la cilindrada están desparramados por
        # los renglones del grupo, incluida la fila en pulgadas.
        _fm_datos_del_motor(texto, motor)
        if "”" in texto or '"' in texto:
            continue                      # la misma fila en pulgadas

        etiqueta = FM_ETIQUETA.search(texto)
        tiene_medida = corte_de_medidas(texto, corte) < len(texto)

        # El renglón del juego de bancada a veces trae sólo el número y las
        # bajomedidas ("Bancadas 4124 M STD-10-20-30-40-50") y las medidas
        # aparecen en el de abajo, con la posición del muñón adelante y sin
        # etiqueta. Se guarda la cabeza y se le pega el renglón siguiente.
        rango = FM_RANGO.search(texto) if cortada and not etiqueta else None
        if rango:
            # Del renglón de abajo sirve de la primera medida en adelante: lo que
            # viene antes es la columna del motor ("98.43 x 82.55"), la posición
            # del muñón y la referencia del componente, y si se pegan tal cual
            # entran como si fueran columnas de medida.
            texto = cortada + " " + texto[rango.start():]
            etiqueta, cortada = FM_ETIQUETA.search(cortada), ""
        elif cortada and not etiqueta:
            continue                      # todavía no llegó el renglón bueno
        elif etiqueta and not tiene_medida and _fm_es_la_pieza(etiqueta, pieza):
            cortada = texto
            primera_del_grupo = False
            continue
        elif etiqueta or tiene_medida:
            cortada = ""

        if not etiqueta and not tiene_medida:
            if FM_DATOS_MOTOR.match(texto):
                pass                      # "1351 c.c.", "80 X 67.2": ya se guardó
            elif FM_GRUPO.match(texto):   # "12 Palio, Siena, EL/HL 1.7"
                motor["modelo"].append(FM_GRUPO.match(texto).group(1))
            elif re.match(r"^[A-Za-zÀ-ÿ]", texto):
                if not motor["fabricante"]:
                    motor["fabricante"] = texto
                elif _fm_arranca_grupo(texto, motor):
                    motor = _fm_motor_vacio()
                    motor["fabricante"] = texto
                else:
                    motor["modelo"].append(texto)
            primera_del_grupo = True
            continue

        fila = _fila_fm(texto, etiqueta, motor, hoja, primera_del_grupo, pieza, corte)
        if fila is not None:
            filas.append(fila)
        primera_del_grupo = False

    return filas


FM_DATOS_MOTOR = re.compile(r"^\(?\d+(?:[.,]\d+)?\s*(?:[xX]\s*\d|c\.?\s?c\.?|\"\)?$)")
FM_GRUPO = re.compile(r"^\d{1,2}\s+(\S.*)$")


def _fm_arranca_grupo(texto, motor) -> bool:
    """Un renglón de una sola palabra repitiendo la marca abre un grupo nuevo."""
    return texto == motor["fabricante"] or (
        len(texto.split()) <= 3 and bool(motor["modelo"]))


def _fm_motor_vacio():
    return _motor_vacio()


def _fm_datos_del_motor(texto, motor):
    medida = re.search(r"\d+(?:[.,]\d+)?\s*[xX]\s*\d+(?:[.,]\d+)?", texto)
    if medida and not motor["diam_x_carrera"]:
        motor["diam_x_carrera"] = medida.group(0)
    cilindrada = re.search(r"(\d{3,5})\s*c\.?\s?c\.?", texto)
    if cilindrada and not motor["cilindrada"]:
        motor["cilindrada"] = cilindrada.group(1)


def _fm_limpiar_cabecera(texto: str) -> str:
    """
    Deja sólo el número de juego y su sufijo.

    El catálogo mete la cilindrada en el mismo renglón, y a veces de los dos
    lados de la etiqueta ("2364 c.c. Bancadas 4222 M 2364 c.c STD-10-20-30-40"),
    y le cuelga llamadas al pie ("Bancada (1) 4592 M"). Con eso pegado, el número
    del juego no matchea y la fila se pierde entera.
    """
    texto = re.sub(r"\d+(?:[.,]\d+)?\s*c\.?\s?c\.?", " ", texto)
    texto = re.sub(r"\(\d+\)", " ", texto)
    texto = re.sub(r"\d+(?:[.,]\d+)?\s*[xX]\s*\d+(?:[.,]\d+)?", " ", texto)
    return re.sub(r"\s+\d+\s*$", "", " ".join(texto.split())).strip()


def _fm_solo_bajomedidas(texto: str) -> str:
    """
    La lista de bajomedidas termina donde aparece la primera palabra que no es
    una: en bancada, después del "STD-10-20-30-40-50" viene la posición del muñón
    y la referencia del componente ("1 62086 RA"), que no son bajomedidas.
    """
    partes = []
    for parte in texto.replace("S T D", "STD").split():
        # La lista viene pegada con guiones ("STD-10-20-30", "0.75-1.00"): un
        # número suelto ya es la posición del muñón, no una bajomedida más.
        if not re.fullmatch(r"STD[\d.,\-–]*|[\d.,]+[\-–][\d.,\-–]*", parte):
            break
        partes.append(parte)
    return " ".join(partes)


def _fm_es_la_pieza(etiqueta, pieza) -> bool:
    return etiqueta.group("pieza").lower().startswith(PIEZAS[pieza]["fm"])


def _fila_fm(texto, etiqueta, motor, hoja, primera_del_grupo, pieza, minimo=None):
    if etiqueta:
        if not _fm_es_la_pieza(etiqueta, pieza):
            return None
        cabeza = texto[:etiqueta.start()]
        texto = texto[etiqueta.end():]
    elif primera_del_grupo and pieza == "biela":
        # La primera fila del grupo siempre es la de biela, y hay páginas donde
        # el catálogo no le pone la etiqueta. La de bancada nunca va sin
        # etiqueta: siempre viene después de la de biela.
        cabeza, texto = "", texto
    else:
        return None

    cilindros = re.match(r"^\s*(\d+)\s*$", cabeza)
    if cilindros and not motor["nro_cil"]:
        motor["nro_cil"] = cilindros.group(1)

    corte = corte_de_medidas(texto, minimo)
    if corte == len(texto):
        return None                        # fila sin ninguna medida
    cabecera, cola = texto[:corte], texto[corte:]

    # Lo que hay antes de las bajomedidas: número de cilindros, número de juego y
    # sufijo de material. El número de cilindros sólo hay que sacarlo cuando la
    # fila viene sin etiqueta —si la tiene, los cilindros quedaron del otro lado,
    # en `cabeza`—: si no, en bancada se come el número del juego, que es lo
    # único que hay ahí ("7108 M").
    if not etiqueta:
        cabecera = re.sub(r"^\s*(\d+)\s+(?=[\dA-Z])", "", cabecera, count=1)
    medidas_txt = ""
    marcador = re.search(r"\bS\s?T\s?D\b|\bSTD\b", cabecera)
    if marcador:
        medidas_txt, cabecera = cabecera[marcador.start():], cabecera[:marcador.start()]
        medidas_txt = _fm_solo_bajomedidas(medidas_txt)
    cabecera = _fm_limpiar_cabecera(cabecera)

    juego = FM_JUEGO.match(cabecera) or (
        FM_BANCADA.match(cabecera) if pieza == "bancada" else None) or (
        FM_AXIAL.match(cabecera) if pieza == "axial" else None)
    glyco = FM_GLYCO.match(cabecera)
    # "01-3841/6" y "71-3728/4" son códigos GLYCO, no juegos de Federal Mogul.
    # Se los distingue porque el número de pares de un juego no pasa de 12 y no
    # se escribe con cero adelante.
    es_glyco = bool(glyco) and (
        not juego or cabecera.startswith("0")
        or int(juego.groupdict().get("pares") or 0) > 12
    )
    juego = glyco if es_glyco else juego
    if not juego:
        return None
    # La "M" del final marca el juego de bancada o el de levas. En biela sobra;
    # en bancada es justamente lo que hay que agarrar, y el proveedor no la
    # escribe (vende "7108", no "7108 M"), así que tampoco es sufijo de material.
    sufijo = juego.groupdict().get("sufijo") or ""
    if sufijo == "M" and pieza != "bancada":
        return None

    columnas, dudoso = asignar_columnas(numeros(cola), ORDEN_COLUMNAS["fm"])
    return {
        "catalogo": "Federal Mogul",
        "hoja_pdf": hoja,
        "marca": "GLYCO" if es_glyco else "FEDERAL MOGUL",
        "codigo_fab": juego.group("numero") + (
            " " + juego.group("sufijo") if juego.groupdict().get("sufijo") else ""),
        "numero": juego.group("numero"),
        # La "M" de bancada no es sufijo de material ni desempata nada: el
        # proveedor no la escribe y todos los juegos de bancada la llevan.
        "sufijo": None if sufijo == "M" else (sufijo or None),
        "pares": juego.groupdict().get("pares"),
        "tipo_material": None if sufijo == "M" else (sufijo or None),
        "medidas_txt": medidas_txt,
        "columnas": columnas,
        "dudoso": dudoso,
        "motor": motor,
        "pulgadas": True,
    }


# ===========================================================================
# Glyco — glyco_cojinetes_2023.pdf
# ===========================================================================
#
# El más prolijo de los cuatro, y el único que publica la leyenda de sus
# columnas en la misma página que la tabla ("HOW TO USE", páginas VI-XXI). No
# hace falta adivinar nada: cada fila dice de qué pieza es.
#
#     BE/PL 4 01-4116/4 STD 0.25 0.50 1015RA 37.998/38.008 41.128/41.140 …
#     └───┘ │ └───────┘ └────────────┘ └────┘ └────────────────────────┘
#       │   │     │            │         │      las cinco columnas de medida
#       │   │     │            │         └───── referencia del componente
#       │   │     │            └─────────────── bajomedidas del juego
#       │   │     └──────────────────────────── código Glyco del JUEGO
#       │   └────────────────────────────────── composición (pares o piezas)
#       └────────────────────────────────────── tipo de cojinete
#
# El tipo es lo que separa biela de bancada, y por eso este catálogo sirve para
# las dos familias sin cambiarle nada al lector:
#
#     BE/PL  Pleuellager    cojinete de BIELA
#     MB/HL  Hauptlager     cojinete de BANCADA
#     TW/A   Anlaufscheibe  semiarandela de empuje (categoría CF)
#     SE/PB · CB/NWB · CS/NWL · BU   bujes y cojinetes de levas
#
# Un juego de bancada ocupa varias filas, una por posición de muñón: la primera
# trae el código del juego y las siguientes sólo la posición y su componente. El
# lector arrastra el código hacia abajo, igual que hace el de Mahle con la
# composición.
GLYCO_TIPOS = {
    "BE/PL": "biela", "MB/HL": "bancada", "TW/A": "axial", "SE/PB": "perno",
    "CB/NWB": "buje_levas", "CS/NWL": "cojinete_levas", "BU": "buje",
}
# Tres decimales es lo que separa una medida de una bajomedida: el catálogo
# escribe las medidas con tres ("19.000", "1.549") y las bajomedidas con dos
# ("0.25", "0.50"). Sin esa diferencia el "STD 0.25 0.50" del final de una fila
# cortada se lee como si fueran las dos últimas columnas de medida.
GLYCO_DECIMAL = re.compile(r"^\d+\.\d{3}$")
GLYCO_RANGO = re.compile(r"^(\d+\.\d{2,3})/(\d+\.\d{2,3})$")
GLYCO_BAJA = re.compile(r"^(?:STD|\d\.\d{2})$")
GLYCO_JUEGO = re.compile(r"^[A-Z]{0,2}\d{2,4}(?:-\d{3,4})?[A-Z]{0,3}(?:/\d{1,2})?$")
GLYCO_MATERIAL = re.compile(r"^[A-Z]{1,2}(?:-LF)?$")
GLYCO_CONTINUA = re.compile(r"^\d{1,2}$")
# La cabecera de cada panel: número de panel, el símbolo de diámetro y el Ø del
# cilindro ("5 Ĭ 70.00"). El símbolo sale distinto según la fuente del PDF.
GLYCO_PANEL = re.compile(r"^\d{1,3}\s+\S{1,2}\s+(\d{2,3}\.\d{2})$")
GLYCO_MOTOR = re.compile(r"(\d+)\s*cyl\.\s+(\d+)cc")
# El período de fabricación ("03/85ﬂ10/95"): es lo que delata un renglón de
# modelo de vehículo entre todos los renglones sueltos de la página.
GLYCO_MODELO = re.compile(r"\d{2}/\d{2}")
GLYCO_PIE = re.compile(r"^\d{1,4}$")

# Los materiales, de la página de uso del catálogo. La primera letra es el
# respaldo y la capa de deslizamiento; "-LF" es libre de plomo (lead free).
MATERIAL_GLYCO = {
    "AL": "respaldo de acero con aluminio, bimetálico o trimetálico",
    "B": "bronce",
    "BB": "respaldo de acero con metal antifricción (babbit), bimetálico",
    "BC": "respaldo de acero con bronce fundido, sin capa de deslizamiento",
    "BS": "respaldo de acero con bronce sinterizado, sin capa de deslizamiento",
    "EC": "respaldo de acero con bronce fundido, capa electrodepositada",
    "SP": "respaldo de acero con bronce, capa sputter, trimetálico",
    "PC": "respaldo de acero con aluminio o bronce, capa de polímero",
}


def leer_glyco(pdf: Path, pieza: str) -> list[dict]:
    """
    Las filas de una pieza (`biela` o `bancada`) del catálogo de Glyco.

    Devuelve una fila por juego y por motor que lo usa, con la misma forma que
    las de Mahle y Federal Mogul, para que el cruce contra el proveedor sea el
    mismo para los cuatro catálogos.
    """
    if not pdf.exists():
        print(f"  ⚠ falta {pdf.name}: los códigos Glyco quedan sin medidas.\n"
              f"    Se baja del release 'catalogos' del repo (ver "
              f"CRAC/tecnicos/CARGA-COJINETES.md).", file=sys.stderr)
        return []

    filas = []
    for hoja, pagina in enumerate(PdfReader(str(pdf)).pages, start=1):
        try:
            texto = pagina.extract_text() or ""
        except Exception:                                  # noqa: BLE001
            continue
        filas += _leer_pagina_glyco(texto, hoja, pieza)
    return filas


def _leer_pagina_glyco(texto: str, hoja: int, pieza: str) -> list[dict]:
    renglones = texto.split("\n")
    fabricante = _glyco_fabricante(renglones)
    impresa = _glyco_pagina_impresa(renglones)

    filas, tipo, motor, juego = [], None, _motor_vacio(), None
    cortada: list[str] = []
    for renglon in renglones:
        campos = renglon.split()
        if not campos:
            continue
        # La cabecera del panel se mira ANTES que todo: empieza con un número
        # ("8 Ĭ 75.00") y si no, la toma la rama de las continuaciones y el Ø del
        # cilindro termina entrando como si fuera el Ø de un muñón.
        if GLYCO_PANEL.match(renglon.strip()):
            tipo, juego, cortada = None, None, []
            motor, _ = _glyco_panel(renglon, motor)
            continue
        if campos[0] in GLYCO_TIPOS:
            tipo, campos, cortada = GLYCO_TIPOS[campos[0]], campos[1:], []
        elif cortada:
            campos = cortada + campos              # la fila venía cortada
        elif tipo and GLYCO_CONTINUA.fullmatch(campos[0]):
            pass                                   # continuación del mismo tipo
        else:
            tipo = None
            motor, juego = _glyco_panel(renglon, motor)
            continue

        fila = _fila_glyco(campos)
        if fila is None:
            # Cuando la lista de bajomedidas no entra en la celda, el PDF parte
            # la fila en dos o tres renglones y las medidas llegan recién en el
            # último. Se guarda lo leído y se le pega el renglón de abajo.
            cortada = campos if (tipo and len(cortada) < 3 * len(campos)
                                 and any(GLYCO_BAJA.fullmatch(c) for c in campos)) else []
            continue
        cortada = []
        if fila["codigo_fab"]:
            juego = fila                           # arrastra el código hacia abajo
        elif juego is not None and tipo == pieza:
            fila = {**juego, **{k: v for k, v in fila.items() if v not in (None, {})}}
            fila["codigo_fab"] = juego["codigo_fab"]
        if tipo != pieza or not fila["codigo_fab"]:
            continue
        # Una fila de cojinete trae siempre el Ø del muñón y el del alojamiento.
        # Con menos que eso no es una fila de la tabla: es una llamada al pie o
        # un renglón de texto que quedó con un número suelto.
        if not {"diam_munon", "diam_alojamiento"} <= fila["columnas"].keys():
            continue
        filas.append({
            "catalogo": "Glyco 2023-2025",
            "hoja_pdf": impresa or hoja,
            "marca": "GLYCO",
            "codigo_fab": fila["codigo_fab"],
            "numero": fila["codigo_fab"].split("/")[0],
            "sufijo": None,
            "pares": fila["pares"],
            "tipo_material": fila["material"],
            "medidas_txt": "/".join(fila["bajas"]),
            "columnas": fila["columnas"],
            "dudoso": fila["dudoso"],
            "motor": {**motor, "fabricante": motor["fabricante"] or fabricante},
            "pulgadas": False,
        })
    return filas


def _fila_glyco(campos: list[str]) -> dict | None:
    """
    Una fila de la tabla: las medidas se leen desde la derecha.

    Se lee de atrás para adelante porque es el único extremo firme: el material
    cierra la fila y antes vienen las columnas de medida, todas con decimales.
    Por la izquierda, en cambio, la cantidad de campos cambia (hay llamadas al
    pie, posiciones de muñón, referencias de componente) y no se puede contar.
    """
    campos = list(campos)
    material = campos.pop() if campos and GLYCO_MATERIAL.fullmatch(campos[-1]) else None
    valores = []
    while campos and _glyco_medida(campos[-1]) is not None:
        valores.insert(0, _glyco_medida(campos.pop()))
    if not valores or len(campos) < 2:
        return None

    # Las bajomedidas son un dato del juego, no del componente: si la fila las
    # trae, es la fila que abre el juego y su segundo campo es el código.
    bajas = [c for c in campos if GLYCO_BAJA.fullmatch(c)]
    codigo = campos[1] if bajas and GLYCO_JUEGO.fullmatch(campos[1]) else None
    columnas, dudoso = asignar_columnas(valores, ORDEN_COLUMNAS["glyco"])
    return {"codigo_fab": codigo, "pares": campos[0] if codigo else None,
            "bajas": bajas, "material": material,
            "columnas": columnas, "dudoso": dudoso}


def _glyco_medida(campo: str):
    """Un valor de medida siempre lleva decimales; una posición de muñón, no."""
    rango = GLYCO_RANGO.fullmatch(campo)
    if rango:
        return [float(rango.group(1)), float(rango.group(2))]
    return float(campo) if GLYCO_DECIMAL.fullmatch(campo) else None


def _glyco_panel(renglon: str, motor: dict) -> tuple[dict, None]:
    """
    Los renglones de arriba de la tabla describen el motor.

    La cabecera ("5 Ĭ 70.00") abre un panel nuevo y trae el Ø del cilindro —sin
    la carrera, así que no hay dónde guardarlo: el JSON tiene `diam_x_carrera` y
    poner ahí un número solo sería mentir—. Después vienen los códigos de motor,
    que se reconocen por los cilindros y la cilindrada ("4cyl. 903cc"), y por
    último los modelos de vehículo, que se reconocen por los períodos de
    fabricación ("Y10 1.0 03/85-10/95").

    Esa fecha es lo que separa un modelo del resto de los renglones sueltos de la
    página: llamadas al pie, leyendas en cinco idiomas y el nombre del fabricante
    del pie, que si no se cuela al final de la aplicación.
    """
    panel = GLYCO_PANEL.match(renglon.strip())
    if panel:
        return _motor_vacio(), None

    datos = GLYCO_MOTOR.search(renglon)
    if datos:
        motor["nro_cil"] = motor["nro_cil"] or datos.group(1)
        motor["cilindrada"] = motor["cilindrada"] or datos.group(2)
    elif GLYCO_MODELO.search(renglon) and len(motor["modelo"]) < 3:
        # El PDF separa las dos fechas del período con la ligadura "ﬂ" (U+FB02),
        # que es la que le tocó al glifo de la flecha en esa fuente.
        motor["modelo"].append(renglon.strip().replace("ﬂ", "–"))
    return motor, None


def _glyco_fabricante(renglones: list[str]) -> str:
    """El fabricante va al pie de la página, en mayúsculas y solo."""
    for renglon in reversed(renglones[-4:]):
        texto = renglon.strip()
        if 2 < len(texto) < 30 and texto == texto.upper() and texto[0].isalpha():
            return texto.title()
    return ""


def _glyco_pagina_impresa(renglones: list[str]) -> int | None:
    """El número impreso, que es el que sirve para volver a mirar la fila."""
    for renglon in reversed(renglones[-4:]):
        if GLYCO_PIE.fullmatch(renglon.strip()):
            return int(renglon.strip())
    return None

# ===========================================================================
# La lista del proveedor
# ===========================================================================
#
# El código del proveedor tiene ancho fijo, 14 caracteres, y se lee siempre
# igual: categoría(2) + marca(2) + código(7) + medida(3).
#
#     C A B E 0 1 4 7 2 _ _ 0 2 5
#     └─┘ └─┘ └───────────┘ └───┘
#      │   │        │         └── medida: STD, 025, 050, 10, 20, 30…
#      │   │        └──────────── código del fabricante, alineado a la izquierda
#      │   └───────────────────── marca: BE Mahle · "F " Federal Mogul · GL Glyco
#      └───────────────────────── categoría: CA biela · CB bancada · CF axial
#
# De ahí sale la regla del universo: una ficha existe si el proveedor la vende.
MARCAS = {"BE": "MAHLE", "F": "FEDERAL MOGUL", "GL": "GLYCO"}


def leer_proveedor(categoria: str, marcas: tuple[str, ...]) -> dict[tuple[str, str], dict]:
    """
    Los cojinetes que vende el proveedor en esa categoría (`CA` biela, `CB`
    bancada) y de esas marcas, agrupados por (marca, código). Cada entrada trae
    la descripción, el precio y la lista de medidas que hay.
    """
    articulos: dict[tuple[str, str], dict] = {}
    with PRECIO_STOCK.open(encoding="latin-1", newline="") as archivo:
        for fila in csv.reader(archivo, delimiter=";"):
            if len(fila) < 4 or fila[0][:2] != categoria:
                continue
            if fila[0][2:4].strip() not in marcas:
                continue
            marca = MARCAS.get(fila[0][2:4].strip())
            if not marca:
                continue
            codigo, medida = fila[0][4:11].strip(), fila[0][11:14].strip()
            entrada = articulos.setdefault(
                (marca, codigo),
                {"marca": marca, "codigo": codigo, "descripcion": fila[1].strip(),
                 "precio": _numero(fila[2]), "medidas": []},
            )
            entrada["medidas"].append({"codigo": fila[0], "medida": medida or None})
    return articulos


def _numero(texto):
    try:
        return float(texto.replace(".", "").replace(",", "."))
    except (ValueError, AttributeError):
        return None


# ---------------------------------------------------------------------------
# Cruce catálogo ↔ proveedor
# ---------------------------------------------------------------------------
def clave_mahle(codigo: str) -> str:
    """
    'B01472' y 'SB48135' del catálogo son '01472' y '48135' en el proveedor.

    La letra de adelante dice qué pieza es —`B` biela, `M` bancada, `L`
    arruela de encosto— y el proveedor no la escribe: la tira toda.
    """
    return re.sub(r"^S?[BML]", "", codigo).lstrip("0") or "0"


def clave_fm(codigo: str) -> str:
    """El proveedor pega el sufijo y los pares al número ('1245CP', '1645-4')."""
    numero = re.match(r"\d+", codigo.replace(" ", ""))
    return numero.group(0).lstrip("0") if numero else codigo


def clave_glyco(codigo: str) -> str:
    """Del lado del proveedor el código se usa tal cual: es el que manda."""
    return codigo.strip()


def claves_glyco(codigo: str, pares: str | None = None) -> list[str]:
    """
    Todas las formas en que el proveedor puede escribir un código Glyco.

    Su campo tiene siete caracteres y el código no siempre entra, así que lo
    recorta —y no de una sola manera—:

        H982/5     entra entero
        01-3040/4  pierde el prefijo de dos dígitos      → '3040/4'
        01-3841/6  pierde los pares                      → '01-3841'
        71-3850A   pierde el guión                       → '713850A'
        71-2834    gana la composición que el catálogo
                   escribe en la columna de al lado      → '2834/1'

    No hay una regla que las cubra a todas, así que se generan todas las
    variantes y gana la que exista en la lista del proveedor. Un mismo juego
    puede quedar bajo dos códigos distintos ('3572/4' y '71-3572'), y está bien:
    el proveedor los vende como dos artículos.
    """
    base = codigo.split("/")[0].strip()
    sin_prefijo = re.sub(r"^\d{2}-", "", codigo)
    variantes = {codigo, base, sin_prefijo, sin_prefijo.split("/")[0],
                 codigo.replace("-", ""), base.replace("-", "")}
    if "/" not in codigo and pares and pares.isdigit():
        variantes.add(f"{sin_prefijo}/{pares}")
    return sorted(variantes | {v[:7] for v in variantes})


CLAVES = {"MAHLE": clave_mahle, "FEDERAL MOGUL": clave_fm, "GLYCO": clave_glyco}


def indexar(filas: list[dict]) -> dict[tuple[str, str], list[dict]]:
    indice: dict[tuple[str, str], list[dict]] = {}
    for fila in filas:
        marca = fila.get("marca", "MAHLE")
        if marca == "GLYCO":
            claves = claves_glyco(fila["codigo_fab"], fila.get("pares"))
        else:
            claves = [CLAVES[marca](fila["codigo_fab"])]
        for clave in claves:
            indice.setdefault((marca, clave), []).append(fila)
    return indice


def elegir_fila(filas: list[dict], codigo_proveedor: str) -> tuple[dict, str | None]:
    """
    Cuál de las filas del catálogo corresponde al código del proveedor.

    Un mismo juego aparece muchas veces en el catálogo, una por cada motor que lo
    usa, y casi siempre con las mismas medidas: eso no es ambigüedad y se
    resuelve solo. Quedan dos casos que sí lo son:

    * El juego se compone de dos semicojinetes, el inferior (-I) y el superior
      (-S), y a veces tienen espesores distintos. El proveedor vende el juego
      completo, así que se toma el reparto de medidas MÁS REPETIDO y la ficha
      queda marcada.
    * El mismo número existe con varios sufijos de material ("1245 CP" y
      "1245 RA") y el proveedor a veces lo aclara ("F 1245CP"). Cuando lo aclara
      se usa ése.
    """
    filas = _catalogo_de_la_marca(filas)
    if len(filas) == 1:
        return filas[0], None

    # El proveedor pega los pares al final del código ("2015A-4"): eso no es
    # sufijo de material.
    sufijo = re.sub(r"-\d+$", "", codigo_proveedor.replace(" ", ""))
    sufijo = re.sub(r"^\d+", "", sufijo).strip("-")
    if sufijo:
        for fila in filas:
            if (fila.get("sufijo") or "") == sufijo:
                return fila, None

    repartos: dict[str, list[dict]] = {}
    for fila in filas:
        repartos.setdefault(json.dumps(fila["columnas"], sort_keys=True), []).append(fila)
    if len(repartos) == 1:
        return filas[0], None

    ordenados = sorted(repartos.values(), key=len, reverse=True)
    elegida = ordenados[0][0]
    return elegida, (
        "el catálogo trae este juego con más de un reparto de medidas y no son "
        f"iguales: {_diferencias(ordenados)}. Se tomó el primero, que es el que "
        f"más se repite ({len(ordenados[0])} filas del catálogo contra "
        f"{', '.join(str(len(g)) for g in ordenados[1:])})"
    )


def _catalogo_de_la_marca(filas: list[dict]) -> list[dict]:
    """
    Cuando un código está en dos catálogos, manda el de su propia marca.

    Pasa sólo con Glyco: sus últimas páginas están también dentro del catálogo de
    Federal Mogul (es la misma empresa) y ahí las filas salen peor. Poniéndolas
    una al lado de la otra, los Ø, el ancho y el espesor coinciden en los doce
    códigos que están en los dos; lo que cambia es que el de Federal Mogul trae
    erratas que el de Glyco no tiene —`51.995/51.965`, `48.917/48.987`,
    `48.984/50.000`, con el segundo valor incoherente con el primero— y alguna
    luz de aceite corrida en la última cifra.

    El de Federal Mogul sigue haciendo falta igual: es el único que trae los ocho
    códigos Glyco viejos que la edición 2023-2025 ya no lista.
    """
    propios = [f for f in filas if f["catalogo"].startswith("Glyco")]
    return propios or filas


def _diferencias(grupos: list[list[dict]]) -> str:
    """Qué columnas difieren entre los repartos, para poder revisarlo a ojo."""
    columnas = sorted({c for grupo in grupos for c in grupo[0]["columnas"]})
    partes = []
    for columna in columnas:
        valores = [grupo[0]["columnas"].get(columna) for grupo in grupos]
        if len({json.dumps(v) for v in valores}) > 1:
            partes.append(columna + " " + " contra ".join(_texto(v) for v in valores))
    return "; ".join(partes) or "las columnas que trae cada fila"


def _texto(valor):
    if valor is None:
        return "vacío"
    return "/".join(str(v) for v in valor) if isinstance(valor, list) else str(valor)


# ===========================================================================
# Las bajomedidas
# ===========================================================================
#
# Un cojinete de biela se pide por su BAJOMEDIDA: cuánto se le rectificó al
# muñón del cigüeñal. Los catálogos las escriben en dos sistemas y el proveedor
# en un tercero:
#
#   catálogo, milímetros ....... "STD/ 0,25/ 0,50/ 0,75"   ó  "STD-0.25-0.50"
#   catálogo, pulgadas ......... "STD-10-20-30-40"         ó  "STD-.010-.020"
#   proveedor .................. "STD" "025" "050" "10" "20" "030"
#
# El del proveedor es ambiguo mirándolo solo: "030" pueden ser 0,30 mm o 30
# milésimas de pulgada (0,762 mm), que no es lo mismo ni parecido. Se resuelve
# con el catálogo: se calculan las dos lecturas posibles y se elige la que cae
# sobre una bajomedida que el catálogo declara para ESE juego. Si ninguna cae,
# el token queda como está y la ficha se marca en `extra.revisar`.
PULGADA_MM = 25.4


def bajomedidas_del_catalogo(medidas_txt: str) -> list[tuple[str, float]]:
    """
    Las bajomedidas que declara el catálogo, como (etiqueta legible, mm).

    Cómo se decide el sistema: si algún valor viene con punto o coma y es de
    0,2 mm o más, la lista es métrica ("0,25"). Si son enteros pelados, son
    milésimas de pulgada ("10" es .010"). Y los ".010" con punto adelante son
    pulgadas siempre. Un entero suelto dentro de una lista métrica es centésima
    de milímetro: el catálogo escribe "100" donde quiso decir "1.00".
    """
    etiquetas = etiquetas_medida(medidas_txt)
    decimales = [e for e in etiquetas if e != "STD" and "." in e]
    metrico = any(float(e) >= 0.2 for e in decimales)

    salida = []
    for etiqueta in etiquetas:
        if etiqueta == "STD":
            salida.append(("STD", 0.0))
            continue
        valor = float(etiqueta)
        if "." in etiqueta and valor < 0.2:                    # ".010"
            salida.append((f'-{etiqueta.lstrip("0")}"', round(valor * PULGADA_MM, 4)))
        elif "." in etiqueta or (metrico and valor <= 2.5):    # "0.25"
            salida.append((_mm(valor), valor))
        elif metrico:                                          # "100" = 1,00 mm
            salida.append((_mm(valor / 100), valor / 100))
        else:                                                  # "10" = .010"
            salida.append((f'-.{int(valor):03d}"', round(valor / 1000 * PULGADA_MM, 4)))

    vistas, unicas = set(), []
    for etiqueta, mm in salida:
        if etiqueta not in vistas:
            vistas.add(etiqueta)
            unicas.append((etiqueta, mm))
    return unicas


def _mm(valor: float, signo: str = "-") -> str:
    return signo + f"{valor:.3f}".rstrip("0").rstrip(".").replace(".", ",") + " mm"


def sobremedidas_del_catalogo(medidas_txt: str) -> list[tuple[str, float]]:
    """
    Lo mismo que `bajomedidas_del_catalogo`, para la semiarandela de empuje.

    Cambian dos cosas, y por eso es otra función y no un parámetro:

    * **Suman, no restan.** La arandela se pone MÁS GRUESA cuando la cara de
      empuje del cigüeñal se rectifica, así que la etiqueta va con "+".
    * **El corte entre milímetros y pulgadas es otro.** En el cojinete la
      bajomedida métrica más chica es 0,25; en la arandela, 0,12. Acá no sirve
      mirar el tamaño: lo que distingue los dos sistemas es **el cero adelante**,
      que es como los escriben los catálogos — Mahle pone "0,127" y "0,19"
      (milímetros) y Federal Mogul, "STD-5-10" (milésimas de pulgada, sin punto
      ni cero). Un ".010" con punto adelante y sin cero es pulgadas, igual que
      en el cojinete.
    """
    salida = []
    for etiqueta in etiquetas_medida(medidas_txt):
        if etiqueta == "STD":
            salida.append(("STD", 0.0))
            continue
        valor = float(etiqueta)
        if etiqueta.startswith("."):                           # ".010"
            salida.append((f'+{etiqueta}"', round(valor * PULGADA_MM, 4)))
        elif "." in etiqueta:                                  # "0,127", "0,25"
            salida.append((_mm(valor, "+"), valor))
        else:                                                  # "5" = .005"
            salida.append((f'+.{int(valor):03d}"', round(valor / 1000 * PULGADA_MM, 4)))

    vistas, unicas = set(), []
    for etiqueta, mm in salida:
        if etiqueta not in vistas:
            vistas.add(etiqueta)
            unicas.append((etiqueta, mm))
    return unicas


def leer_medida_axial(token: str, catalogo: list[tuple[str, float]]):
    """
    A qué sobremedida corresponde el sufijo del proveedor, en la semiarandela.

    Mismo mecanismo que en el cojinete —primero se busca entre las que el
    catálogo declara para ese juego— con un tercer candidato más: el proveedor
    escribe las sobremedidas de la arandela en **milésimas de milímetro**
    ("127" es 0,127 mm), además de en centésimas ("025" es 0,25) y en milésimas
    de pulgada ("5" es .005"). Son todas chicas y no se pisan: ninguna
    sobremedida de arandela llega a 0,6 mm.
    """
    if not token or token.upper() == "STD":
        return "STD", 0.0, True
    digitos = re.fullmatch(r"0*(\d+)", token)
    if not digitos:
        return None
    numero = int(digitos.group(1))
    candidatos = [numero / 100, numero / 1000, round(numero / 1000 * PULGADA_MM, 4)]
    for etiqueta, mm in catalogo:
        if any(abs(mm - c) < 0.02 for c in candidatos):
            return etiqueta, mm, True

    # El proveedor la vende y el catálogo no la lista: se la interpreta con el
    # sistema del catálogo, y de los dos tamaños métricos posibles se toma el
    # que puede ser una arandela (0,127 y no 1,27).
    metrico = any(e.endswith("mm") for e, _mm in catalogo) or not catalogo
    if metrico:
        valor = numero / 100 if numero / 100 <= 0.6 else numero / 1000
        return _mm(valor, "+"), valor, False
    return f'+.{numero:03d}"', round(numero / 1000 * PULGADA_MM, 4), False


def leer_medida_proveedor(token: str, catalogo: list[tuple[str, float]]):
    """
    A qué bajomedida corresponde el sufijo de medida del proveedor.

    Devuelve (etiqueta, mm, si el catálogo la declara). Primero se busca la
    bajomedida entre las que el catálogo declara para ese juego, que es lo que
    saca la ambigüedad entre los dos sistemas. La tolerancia de 0,02 mm es a
    propósito: 0,25 mm y .010" son 0,25 y 0,254, y en el taller son la misma
    pieza; lo mismo 0,50 con .020" y 0,75 con .030".

    Si el proveedor vende una medida que el catálogo no lista —pasa seguido: el
    catálogo llega hasta 0,75 y el proveedor tiene también la de 1,00— se la
    interpreta con el sistema que usa ese catálogo (métrico o pulgadas) y se
    devuelve marcada como no declarada, para que la ficha lo avise.

    Los "S60" y "60/" del proveedor son juegos que traen dos medidas a la vez
    (STD y 060) y no se pueden apuntar a una sola: quedan sin resolver.
    """
    if not token or token.upper() == "STD":
        return "STD", 0.0, True
    digitos = re.fullmatch(r"0*(\d+)", token)
    if not digitos:
        return None
    numero = int(digitos.group(1))
    candidatos = [numero / 100, round(numero / 1000 * PULGADA_MM, 4)]
    for etiqueta, mm in catalogo:
        if any(abs(mm - c) < 0.02 for c in candidatos):
            return etiqueta, mm, True

    metrico = any(e.endswith("mm") for e, _mm in catalogo)
    if metrico:
        return _mm(numero / 100), numero / 100, False
    return f'-.{numero:03d}"', round(numero / 1000 * PULGADA_MM, 4), False


# ===========================================================================
# La ficha
# ===========================================================================
MATERIAL_FM = {
    "AP": "respaldo de acero, revestimiento de aleación aluminio-cadmio con "
          "película base plomo-estaño",
    "AT": "aleación de aluminio con 6 % de estaño",
    "B": "respaldo de bronce, revestimiento Babbit",
    "CA": "respaldo de acero, revestimiento de aleación cobre-plomo",
    "CP": "respaldo de acero, revestimiento de aleación cobre-plomo con película "
          "base plomo-estaño",
    "RA": "respaldo de acero, revestimiento de aleación de aluminio con 20 % de estaño",
    "SA": "respaldo de acero, revestimiento Babbit",
}


def material_fm(sufijo: str | None) -> str | None:
    """
    Qué material es, según la tabla de sufijos de la página de instrucciones del
    catálogo. Las variantes con letra de más (APA, CAA, CAB, RAA, SBI…) son el
    mismo material, así que se busca por el prefijo más largo que esté en tabla.
    """
    if not sufijo:
        return None
    for largo in (3, 2, 1):
        if sufijo[:largo] in MATERIAL_FM:
            return MATERIAL_FM[sufijo[:largo]]
    return None


def armar_ficha(articulo: dict, fila: dict | None, aviso: str | None,
                config: dict) -> dict:
    """
    Una ficha del catálogo técnico: lo que el proveedor vende, con las medidas
    que le puso el catálogo del fabricante.

    Cuando no hay fila de catálogo (`fila is None`) la ficha se arma igual, con
    la aplicación y el precio del proveedor y las medidas vacías: así se la
    encuentra buscando por código o por aplicación, y `extra.revisar` explica por
    qué no tiene medidas. Lo que no puede pasar nunca es que aparezca en una
    búsqueda por medidas, y no aparece porque `_en_rango` descarta los nulos.
    """
    marca = articulo["marca"]
    categoria = config["categoria"]
    # Los nombres que llevan las medidas en esta familia y de qué columna de la
    # extracción sale cada una (ver `CAMPOS`). El primero es el principal.
    campos = CAMPOS[config["forma"]]
    principal = next(iter(campos))
    revisar: dict[str, str] = {}
    medidas = {c: None for c in campos}
    extra: dict = {
        "fabricante_motor": None, "motor": None, "nro_cil": None,
        "diam_x_carrera": None, "cilindrada": None, "pares": None,
        "tipo_material": None, "material": None, "luz_aceite": None,
        "composicion": None, "codigo_metal_leve": None,
        "catalogo": None, "pagina_catalogo": None,
        "sobremedidas": [], "revisar": None,
    }

    if fila is None:
        catalogos = {"MAHLE": "Mahle 2019 y Clevite 2014",
                     "FEDERAL MOGUL": "Federal Mogul",
                     "GLYCO": "Glyco 2023-2025 y Federal Mogul"}[marca]
        for campo in medidas:
            revisar[campo] = (
                "Este código no está en ninguno de los catálogos que tenemos "
                f"({catalogos}): la aplicación es la que publica la lista del "
                "proveedor"
            )
        aplicacion = articulo["descripcion"]
        codigo_fab = None
    else:
        medidas.update({campo: fila["columnas"][interno]
                        for campo, interno in campos.items()
                        if interno in fila["columnas"]})
        aplicacion = _aplicacion(fila)
        codigo_fab = fila["codigo_fab"]
        extra.update({
            "fabricante_motor": fila["motor"].get("fabricante") or None,
            "motor": " ".join(fila["motor"].get("modelo", [])).strip() or None,
            "nro_cil": fila["motor"].get("nro_cil"),
            "diam_x_carrera": fila["motor"].get("diam_x_carrera"),
            "cilindrada": fila["motor"].get("cilindrada"),
            "pares": fila.get("pares"),
            "tipo_material": fila.get("tipo_material"),
            "material": _material(marca, fila),
            "luz_aceite": fila["columnas"].get("luz"),
            "composicion": fila.get("composicion"),
            "codigo_metal_leve": fila.get("codigo_metal_leve"),
            "catalogo": fila["catalogo"],
            "pagina_catalogo": fila["hoja_pdf"],
        })
        if aviso:
            revisar["codigo"] = aviso
        if fila["dudoso"]:
            revisar[principal] = (
                "el PDF mandó las medidas sin separar las columnas y faltaba "
                "alguna: el reparto entre columnas es el más probable, no el seguro"
            )
        for campo, valor in list(medidas.items()):
            if isinstance(valor, list) and valor[1] < valor[0]:
                revisar[campo] = (
                    f"el catálogo trae {valor[0]}/{valor[1]}, con el segundo valor "
                    "más chico que el primero: hay un error de imprenta en el PDF"
                )
        if medidas[principal] is None:
            revisar[principal] = "la fila del catálogo trae esta columna vacía"

    extra["sobremedidas"], codigos, sin_listar, combinadas = _sobremedidas(
        articulo, fila, medidas, config)
    axial = config["forma"] == "axial"
    nombre = "sobremedidas" if axial else "bajomedidas"
    resultado = "el espesor de la arandela" if axial else "el Ø del muñón rectificado"
    avisos = []
    if sin_listar and fila is not None:
        avisos.append(
            f"el proveedor vende {nombre} que el catálogo no lista para este "
            f"juego ({', '.join(sorted(set(sin_listar)))}): {resultado} "
            "sale de aplicar el sistema de medidas del catálogo"
        )
    if combinadas and fila is not None:
        avisos.append(
            f"el proveedor vende juegos combinados ({', '.join(sorted(set(combinadas)))}), "
            f"que traen dos {nombre} a la vez: no se los puede apuntar a un solo "
            "valor, así que se los lista sin valor"
        )
    if avisos:
        revisar["sobremedidas"] = "; y ".join(avisos)
    extra["revisar"] = revisar or None

    return {
        "codigo": f"{categoria}{_marca_crac(marca)}{articulo['codigo']}",
        "codigo_fab": codigo_fab,
        "marca": marca,
        "aplicacion": aplicacion,
        "descripcion": articulo["descripcion"],
        "medidas": medidas,
        "extra": extra,
        "codigos_crac": codigos,
    }


def _material(marca: str, fila: dict) -> str | None:
    """
    De qué está hecho el cojinete, en castellano.

    Cada catálogo lo codifica a su manera y sólo dos publican la tabla: Federal
    Mogul en su página de instrucciones y Glyco en la suya. La de Mahle (`P`,
    `SP`, `C`, `B`, `FT`) no está en las páginas de cojinetes que tenemos, así
    que ese código queda sin traducir en `extra.tipo_material`.
    """
    if marca == "MAHLE":
        return None
    if marca == "GLYCO":
        codigo = (fila.get("tipo_material") or "").split("-")[0]
        return MATERIAL_GLYCO.get(codigo)
    return material_fm(fila.get("sufijo"))


def _marca_crac(marca: str) -> str:
    return {"MAHLE": "BE", "FEDERAL MOGUL": "F ", "GLYCO": "GL"}[marca]


def _aplicacion(fila: dict) -> str:
    partes = [fila["motor"].get("fabricante") or ""] + fila["motor"].get("modelo", [])
    return re.sub(r"\s+", " ", " ".join(p for p in partes if p)).strip()


def _sobremedidas(articulo, fila, medidas, config):
    """
    Las medidas que ofrece este juego, cada una con el valor que le queda a la
    pieza. Es lo que hace que el filtro de la pantalla conteste la pregunta del
    taller.

    En el cojinete son BAJOmedidas y el valor es el Ø que le queda al muñón ya
    rectificado: medí un muñón de 49,75 — ¿qué cojinete le va? En la
    semiarandela son SOBREmedidas y el valor es el espesor de la arandela:
    rectifiqué la cara de empuje y necesito 0,25 mm más de espesor — ¿cuánto
    mide entonces la arandela?
    """
    axial = config["forma"] == "axial"
    tabla = sobremedidas_del_catalogo if axial else bajomedidas_del_catalogo
    leer = leer_medida_axial if axial else leer_medida_proveedor
    catalogo = tabla(fila["medidas_txt"]) if fila else []
    base = medidas.get("espesor" if axial else "diam_munon")
    signo = 1 if axial else -1

    entradas, codigos, sin_declarar, combinadas = [], [], [], []
    vistas = set()
    for item in sorted(articulo["medidas"], key=lambda m: (m["medida"] or "")):
        resuelta = leer(item["medida"], catalogo) if catalogo else None
        codigos.append({"codigo": item["codigo"], "medida": item["medida"]})
        if resuelta is None:
            if item["medida"]:
                combinadas.append(item["medida"])
            continue
        etiqueta, bajada, declarada = resuelta
        if not declarada:
            sin_declarar.append(item["medida"])
        if etiqueta in vistas:
            continue
        vistas.add(etiqueta)
        entrada = {"label": etiqueta, "valor": _aplicar(base, bajada, signo)}
        if entrada["valor"] is None:
            entrada["texto"] = "—"      # el catálogo no trae la medida de base
        entradas.append(entrada)

    orden = {etiqueta: i for i, (etiqueta, _mm) in enumerate(catalogo)}
    entradas.sort(key=lambda e: orden.get(e["label"], 99))
    return entradas, codigos, sin_declarar, combinadas


def _aplicar(base, medida, signo):
    """El valor que queda: el muñón MENOS la bajomedida, la arandela MÁS la sobremedida."""
    if base is None:
        return None
    if isinstance(base, list):
        return [round(v + signo * medida, 4) for v in base]
    return round(base + signo * medida, 4)


# ===========================================================================
# Main
# ===========================================================================
def main(argv: list[str] | None = None) -> int:
    """
    Sin argumentos rehace las tres familias. Con argumentos, sólo las que se
    nombren (`... convertir_cojinetes.py axial`): cada familia lee los cuatro
    catálogos de nuevo y son unos minutos, así que cuando se toca una sola no
    tiene sentido volver a escribir las otras dos.
    """
    piezas = argv if argv else list(PIEZAS)
    desconocidas = [p for p in piezas if p not in PIEZAS]
    if desconocidas:
        print(f"No existe la familia {', '.join(desconocidas)}. "
              f"Las que hay: {', '.join(PIEZAS)}.", file=sys.stderr)
        return 2
    for pieza in piezas:
        armar_familia(pieza)
    return 0


def armar_familia(pieza: str) -> None:
    config = PIEZAS[pieza]
    print(f"\n{'=' * 70}\n{config['titulo'].upper()}\n{'=' * 70}")

    # Sólo se abren los PDF de las marcas que entran en la familia: leer los
    # cuatro son cinco minutos, y para bancada hoy alcanza con el de Glyco.
    filas = []
    corte = CORTE[config["forma"]]
    if "BE" in config["marcas"]:
        filas += leer_mahle(FUENTES / "mahle_cojinetes_2019.pdf", "Mahle 2019",
                            dos_por_hoja=True, piezas=config["mahle"], corte=corte)
        filas += leer_mahle(FUENTES / "mahle_clevite_2014.pdf", "Mahle Clevite 2014",
                            dos_por_hoja=False, piezas=config["mahle"], corte=corte)
    if "F" in config["marcas"] or "GL" in config["marcas"]:
        # Los códigos Glyco viejos sólo están adentro del catálogo de Federal
        # Mogul, así que ese PDF hace falta también cuando la familia es
        # solamente de Glyco.
        filas += leer_federal_mogul(FUENTES / "federal_mogul_cojinetes.pdf", pieza, corte)
    if "GL" in config["marcas"]:
        filas += leer_glyco(FUENTES / "glyco_cojinetes_2023.pdf", pieza)

    for fila in filas:
        fila.setdefault("marca", "MAHLE")
    indice = indexar(filas)
    articulos = leer_proveedor(config["categoria"], config["marcas"])

    fichas, sin_catalogo = [], []
    for (marca, codigo), articulo in sorted(articulos.items()):
        candidatas = indice.get((marca, CLAVES[marca](codigo)), [])
        fila, aviso = elegir_fila(candidatas, codigo) if candidatas else (None, None)
        if fila is None:
            sin_catalogo.append(f"{marca} {codigo}")
        fichas.append(armar_ficha(articulo, fila, aviso, config))

    fichas.sort(key=lambda f: (f["marca"], f["codigo"]))
    salida = TECNICOS / config["salida"]
    salida.write_text(json.dumps(fichas, ensure_ascii=False, indent=1) + "\n",
                      encoding="utf-8")

    _resumen(salida, fichas, filas, sin_catalogo, config)


def _resumen(salida, fichas, filas, sin_catalogo, config):
    principal = next(iter(CAMPOS[config["forma"]]))
    print(f"\n{salida.relative_to(RAIZ)}: {len(fichas)} fichas\n")
    print(f"{'marca':16} {'fichas':>7} {'con medidas':>12} {'con dudas':>10}")
    for marca in sorted({f["marca"] for f in fichas}):
        propias = [f for f in fichas if f["marca"] == marca]
        con_medidas = [f for f in propias if f["medidas"][principal] is not None]
        con_dudas = [f for f in propias if f["extra"]["revisar"]]
        print(f"{marca:16} {len(propias):>7} {len(con_medidas):>12} {len(con_dudas):>10}")

    print(f"\nFilas leídas de los catálogos: {len(filas)}")
    for catalogo in sorted({f['catalogo'] for f in filas}):
        print(f"  {catalogo:22} {sum(f['catalogo'] == catalogo for f in filas):>4}")

    if sin_catalogo:
        print(f"\nSin ficha en ningún catálogo ({len(sin_catalogo)}), "
              "quedan con las medidas vacías y el cartel '?':")
        for i in range(0, len(sin_catalogo), 6):
            print("  " + "  ".join(f"{c:<22}" for c in sin_catalogo[i:i + 6]))

    dudas: dict[str, list[str]] = {}
    for ficha in fichas:
        for campo, motivo in (ficha["extra"]["revisar"] or {}).items():
            if ficha["medidas"][principal] is None and campo in ficha["medidas"]:
                continue                    # ya contado arriba
            dudas.setdefault(motivo.split("(")[0].strip(), []).append(ficha["codigo"])
    if dudas:
        print("\nFichas con datos en duda (van marcadas con '?' en la pantalla):")
        for motivo, codigos in sorted(dudas.items()):
            print(f"  · {motivo}")
            print(f"    {len(codigos)}: {', '.join(sorted(codigos)[:8])}"
                  + (" …" if len(codigos) > 8 else ""))

    _verificar(fichas, config)


def _verificar(fichas, config):
    """Chequeos de cordura: si alguno salta, es una columna mal leída."""
    campos = CAMPOS[config["forma"]]
    interior, exterior = list(campos)[0], list(campos)[1]
    problemas = []
    for ficha in fichas:
        medidas = ficha["medidas"]
        adentro = valor_representativo(medidas[interior]) if medidas[interior] else None
        afuera = (valor_representativo(medidas[exterior])
                  if medidas[exterior] else None)
        if adentro and afuera and afuera <= adentro:
            problemas.append(f"{ficha['codigo']}: {exterior} {afuera} ≤ {interior} {adentro}")
        for campo, interno in campos.items():
            valor = medidas[campo]
            if valor is None:
                continue
            minimo, maximo = RANGOS[interno]
            for v in (valor if isinstance(valor, list) else [valor]):
                if not (minimo <= v <= maximo):
                    problemas.append(f"{ficha['codigo']}: {campo} = {v} fuera de rango")
    print(f"\nChequeos de cordura: {len(problemas)} problemas")
    for problema in problemas[:20]:
        print("  ·", problema)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
