#!/usr/bin/env python3
"""
Convierte los catálogos de válvulas de 3B (Basso) y de MAHLE al JSON que lee el
buscador por medidas.

    python3 scripts/convertir_valvulas.py

Se corre A MANO, cuando llega una tanda nueva de alguno de los dos catálogos.
La salida (CRAC/tecnicos/valvulas.json) se commitea: es lo que hace que
producción tenga los datos apenas hace `git pull`, igual que las otras seis
familias.

QUÉ ENTRA Y QUÉ NO
------------------
Solo las válvulas que **el proveedor trabaja** en esas dos marcas — pedido
explícito del dueño (2026-09-04). O sea: el universo NO es el catálogo, es la
lista del proveedor. Se toman sus códigos de categoría "V" (válvulas) con
marca "3B" o "BE" (Mahle), se agrupan por código base (sacando la sobremedida
del final) y a cada uno se le pega la ficha técnica del catálogo que
corresponda.

Por eso esta familia no lleva la casilla "Solo las que tiene el proveedor" que
tienen camisas, guías, asientos, pistones y bujes: acá **todas** las fichas son
del proveedor, así que la casilla no filtraría nada.

DE DÓNDE SALEN LOS DATOS
------------------------
De dos Excel del dueño, volcados tal cual a CSV en CRAC/tecnicos/fuentes/
(celda por celda, sin encabezado ni transformación). Para rehacer un volcado:

    import pandas as pd
    pd.read_excel(ORIGEN, sheet_name=HOJA, header=None, dtype=object) \\
      .to_csv(DESTINO, index=False, header=False)

    | archivo                          | Excel de origen      | hoja                          |
    |----------------------------------|----------------------|-------------------------------|
    | valvulas_3b_2025.csv             | Basso 2025 web (6)   | Hoja1 (única)                 |
    | valvulas_3b_equivalencias.csv    | Válvulas Mahle.xls   | Cross Reference (3BxMahle)    |
    | valvulas_mahle.csv               | Válvulas Mahle.xls   | Catálogo MAHLE Consolidado    |
    | valvulas_mahle_equivalencias.csv | Válvulas Mahle.xls   | Cross Reference (MahlexEdival)|

Los dos catálogos vienen además en PDF ("Basso 2025 web.pdf",
"Mahle-Válvulas, guías y asientos 2019.pdf"). No se usan para extraer datos:
los Excel traen las mismas filas ya en columnas, y leerlas de la tabla del PDF
solo agregaría los errores de lectura que ya costaron caro con los pistones de
Persan. El PDF sí sirvió para entender el formato (ver más abajo).

SEIS COSAS QUE ESTE SCRIPT RESUELVE, Y POR ESO EXISTE
-----------------------------------------------------
1. EL CÓDIGO DEL PROVEEDOR NO ES EL DEL CATÁLOGO. Hay que traducirlo, y cada
   marca a su manera:

       3B     0101-A         → catálogo "101-A"     (ceros de relleno adelante)
              3737ECB        → catálogo "3737-ECB"  (sin el guión)
       Mahle  010211A        → catálogo "VA0010211" (los seis o siete dígitos
                                                     con la función adelante:
                                                     A→VA, E→VE, AE→VC)

   El match es por número + letra de función (A de admisión, E de escape). Se
   intenta primero el código entero y, si no está, número + esa letra sola:
   el proveedor y el catálogo no siempre coinciden en el sufijo de variante
   ("0137-AC" contra "137-A"), pero **nunca** se cruza una de admisión con una
   de escape, que es el error que sí importaría.

2. LA SOBREMEDIDA VIVE EN EL CÓDIGO. En la lista del proveedor la misma válvula
   aparece una vez por sobremedida de vástago ("V 3B0110-A", "V 3B0110-A +3",
   "V 3B0110-A +5"), cada una con su precio. Se agrupan en una sola ficha y las
   medidas van todas en `codigos_crac`; el buscador elige en runtime cuál
   mostrar, igual que en camisas, subconjuntos y bujes.

3. EL Ø DE VÁSTAGO CAMBIA CON LA SOBREMEDIDA. El catálogo de 3B trae una fila
   por medida con su Ø real (7,912 la STD; 8,293 la de .015") y Mahle lo mismo
   con sus etiquetas en milímetros (0,076 / 0,127 / 0,254…). Esa lista va a
   `extra.sobremedidas` y el buscador la usa para el filtro "Ø vástago c/
   sobremedida": quien midió un vástago de 8,29 encuentra la válvula aunque su
   medida STD sea 7,91.

4. EL MOTOR ESTÁ PARTIDO EN VARIAS FILAS. Los dos catálogos escriben el motor
   una vez y lo dejan valiendo para las filas de abajo (la de admisión y la de
   escape del mismo motor son dos filas), y 3B además parte el texto del motor
   en renglones sueltos que continúan el de arriba. Se arma el bloque completo
   antes de emitir las fichas, y la marca del vehículo sale de las filas-título
   que separan los bloques ("ACURA", "ALFA ROMEO").

5. LO QUE EL CATÁLOGO NO TIENE NO SE INVENTA. Hay códigos del proveedor que no
   están en ninguno de los dos catálogos: son referencias viejas que 3B ya no
   publica, y unas pocas de Mahle. Esas fichas entran igual —el proveedor las
   vende— pero con las cuatro medidas en blanco, un "?" en pantalla y el motivo
   en el tooltip, que es la misma regla que se usó con los pistones de Persan.
   Su aplicación es la que dice la lista del proveedor.

6. LAS EQUIVALENCIAS ENTRE MARCAS. Las hojas de referencias cruzadas del Excel
   de Mahle dicen qué válvula 3B, Edival u original reemplaza a cuál. Se guarda
   una línea armada ("Mahle VA0250168 · Edival 1144 A") que va a la tabla: es
   lo que permite entrar con un número que no es del catálogo que uno tiene.

QUÉ SON LAS SOBREMEDIDAS "+04", "+08" Y "+1" DE MAHLE: son sobremedidas de la
ALTURA DE LA CABEZA, no de ningún diámetro. Lo explicó el dueño (2026-09-04) y
es lo que faltaba para entender por qué repiten las mismas tres medidas que la
STD, tanto en el Excel como en el PDF. En un motor diesel tiene que haber una
distancia entre la base de la válvula y la base de la tapa de cilindros, y esa
distancia se regula con estas sobremedidas: no cambian el Ø de cabeza ni el de
vástago. Cambiarían el largo, pero el catálogo no lo publica y no se inventa.

Por eso entran a la ficha con la etiqueta y **sin Ø** (`valor` en null y el
texto "altura"): repetir el Ø de la STD debajo de "+08" hacía leer dos medidas
donde hay una sola, y dejaba a esa fila apareciendo en el filtro de Ø de vástago
como si fuera un diámetro distinto. La etiqueta sola alcanza — quien cotiza ve
que esa válvula viene también en +08 y sabe para qué es.

NO se copia ningún precio: el precio y el stock los pone la base local, que se
actualiza todos los días con el Excel del proveedor.
"""
import csv
import json
import os
import re
import sys
from collections import OrderedDict
from difflib import SequenceMatcher

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUENTES = os.path.join(RAIZ, "CRAC", "tecnicos", "fuentes")
CSV_PROVEEDOR = os.path.join(RAIZ, "CRAC", "precio-stock.csv")
SALIDA = os.path.join(RAIZ, "CRAC", "tecnicos", "valvulas.json")

BASSO = os.path.join(FUENTES, "valvulas_3b_2025.csv")
BASSO_EQUIV = os.path.join(FUENTES, "valvulas_3b_equivalencias.csv")
MAHLE = os.path.join(FUENTES, "valvulas_mahle.csv")
MAHLE_EQUIV = os.path.join(FUENTES, "valvulas_mahle_equivalencias.csv")

SIN_FICHA = ("Este código no está en el catálogo de la marca: la aplicación es "
             "la que publica la lista del proveedor")

# La lista del proveedor escribe las sobremedidas de vástago de 3B en milésimas
# de pulgada sin la coma ("+15") y el catálogo con ella ('+.015"'). Es la misma
# medida: se traduce cuando la ficha tiene esa etiqueta (ver `main`).
MEDIDA_EN_PULGADAS = {
    "+3": '+.003"', "+5": '+.005"', "+10": '+.010"',
    "+15": '+.015"', "+20": '+.020"', "+30": '+.030"',
}

# Las sobremedidas de Mahle que son de ALTURA DE CABEZA y no de diámetro:
# "+04", "+08", "+1" (ver el encabezado). Se reconocen por la forma —un más y
# dígitos pelados, sin coma ni "mm" ni comillas— y van sin Ø.
RE_ALTURA_CABEZA = re.compile(r"^\+\d+$")
NOTA_ALTURA_CABEZA = (
    "Sobremedida de altura de cabeza, no de diámetro: regula la distancia entre "
    "la base de la válvula y la base de la tapa de cilindros. No cambia el Ø de "
    "cabeza ni el de vástago"
)


# ── Utilidades ───────────────────────────────────────────────────────────────
def leer(path: str) -> list[list[str]]:
    """El volcado de la hoja como lista de filas de texto, sin tocar nada."""
    with open(path, encoding="utf-8", newline="") as f:
        filas = [[(c or "").strip() for c in fila] for fila in csv.reader(f)]
    if not filas:
        raise SystemExit(f"El volcado {path} está vacío")
    return filas


def celda(fila: list[str], i: int) -> str:
    return fila[i].strip() if i < len(fila) else ""


def numero(valor):
    """Una medida del catálogo, con coma o con punto decimal. Vacía es None."""
    valor = str(valor or "").strip().replace(",", ".")
    if not valor or valor in ("-", "nan"):
        return None
    try:
        return round(float(valor), 4)
    except ValueError:
        return None


def angulo(valor) -> tuple:
    """
    El ángulo del asiento en grados, y el reparo si lo hay. Los catálogos lo
    escriben "45º", "45°", "45" o con minutos ("44°30'"): se guarda el número
    —los minutos pasados a fracción de grado— y el "º" lo pone la pantalla.

    Dos filas de 3B lo tienen escrito "5º0", con el símbolo en el medio del
    número. Un asiento de 5º no existe y uno de 50º sí, así que se lee 50 y la
    ficha queda marcada: el número sirve para buscar y el "?" avisa de dónde
    salió.
    """
    texto = str(valor or "").strip()
    if not texto:
        return None, None
    m = re.match(r"^(\d+(?:[.,]\d+)?)\s*[º°ª]?\s*(?:(\d+)\s*'?)?", texto)
    if not m:
        return None, None
    grados = numero(m.group(1))
    if grados is None:
        return None, None
    if m.group(2) is None:
        return grados, None
    # Los dos números separados por el símbolo son grados y minutos… salvo
    # cuando no lo son: un asiento de 5º no existe y uno de 50º sí.
    if int(m.group(2)) <= 59 and 15 <= grados <= 75:
        return round(grados + int(m.group(2)) / 60, 4), None
    return float(m.group(1) + m.group(2)), (
        f'El catálogo escribe el ángulo "{texto}", con el símbolo en el medio '
        "del número; se leyó como los dígitos seguidos"
    )


def limpio(valor) -> str:
    texto = str(valor or "").strip()
    return "" if texto.lower() == "nan" else re.sub(r"\s+", " ", texto)


# ── El código del proveedor ──────────────────────────────────────────────────
# La sobremedida va al final del código, pegada o separada: "V 3B0110-A +3",
# "V BE010285ESTD". Solo cuenta como medida un "+número" o un "STD" — un "20"
# suelto es parte del código ("V 3B1374-ACB 20", que es la variante de 20º).
RE_MEDIDA = re.compile(r"\s*(\+\d+(?:[.,]\d+)?|STD)$", re.IGNORECASE)


# Mahle tiene un puñado de códigos con la sobremedida PEGADA al final, escrita
# con la numeración de Edival: "V BE430540A1" es la misma válvula que
# "V BE430540A" pero en 0,076, y "V BE430540A108" es esa misma en 0,076 con el
# "+08" encima. Sin esto, cada una entraría como una ficha aparte repitiendo las
# medidas de la STD, que es justo la medida que NO tienen.
RE_EDIVAL_PEGADO = re.compile(r"^(\d{6,7})([AEC]+?)(\d{1,3})$")


def base_y_medida(codigo: str) -> tuple:
    m = RE_MEDIDA.search(codigo)
    if m and m.start() > 4:
        return codigo[: m.start()].rstrip(), m.group(1).upper()
    if codigo.startswith("V BE"):
        pegado = RE_EDIVAL_PEGADO.match(codigo[4:].strip())
        if pegado:
            indice, sufijo = pegado.group(3), ""
            if len(indice) == 3:  # "108" es el índice 1 con el "+08" encima
                indice, sufijo = indice[0], "+" + indice[1:]
            return f"V BE{pegado.group(1)}{pegado.group(2)}", indice + sufijo
    return codigo, "STD"


def partes(codigo_sin_prefijo) -> tuple[str, str]:
    """
    Un código de catálogo o de proveedor partido en (número, letras), que es lo
    único con lo que se puede cruzar una lista contra la otra: "0137-AC" y
    "137-A" son el mismo 137 de admisión escrito por dos.
    """
    texto = re.sub(r"[^A-Z0-9]", "", str(codigo_sin_prefijo or "").upper())
    m = re.match(r"^(\d+)([A-Z]*)", texto)
    if not m:
        return texto, ""
    return m.group(1).lstrip("0") or "0", m.group(2)


def tipo_desde_descripcion(texto: str):
    """
    Admisión o escape leídos de lo que dice la lista del proveedor. Sirve para
    los códigos que no están en el catálogo y no llevan la letra en el número:
    los juegos de moto ("HONDA CG 150 (KIT A/E)") y las de Perkins a GLP
    ("PERKINS 4.236 GLP ADM.").
    """
    t = " " + str(texto or "").upper() + " "
    if "KIT A/E" in t or "KIT AE" in t:
        return "AE"
    if " ADM" in t:
        return "A"
    if " ESC" in t:
        return "E"
    return None


def funcion(letras: str):
    """Admisión, escape o indistinta, leída de las letras del código."""
    if letras.startswith("AE") or letras.startswith("C"):
        return "AE"
    if letras.startswith("A"):
        return "A"
    if letras.startswith("E"):
        return "E"
    return None


# ── Catálogo 3B (Basso) ──────────────────────────────────────────────────────
# Columnas del volcado, en el orden en que las escribe la planilla.
B_MOTOR, B_APLIC, B_CIL, B_DG, B_COD, B_SUP = 0, 1, 2, 3, 4, 5
B_VAST, B_CAB, B_LARGO, B_ANG, B_CHAV, B_FORMA = 6, 7, 8, 9, 10, 11
B_OE = range(12, 18)
B_MORESA, B_EDIVAL = 18, 19

COMBUSTIBLE = {"D": "Diesel", "G": "Nafta", "N": "GNC",
               "GAS": "GNC", "GAS NATURAL": "GNC"}


def etiqueta_3b(sup: str) -> str:
    """
    Cómo se escribe una sobremedida de 3B en pantalla. El catálogo mezcla dos
    sistemas y hay que respetarlos: las de pulgada van sin el cero adelante
    (".015") y las métricas con él ("0.8"). Confundirlas es pedir la válvula
    equivocada, así que la unidad va siempre escrita.
    """
    texto = limpio(sup).upper().rstrip(".")
    if not texto or texto in ("STD", "SDT"):
        return "STD"
    valor = numero(texto)
    if valor is None:
        return texto
    if texto.startswith("."):
        return '+.' + texto.lstrip(".").ljust(3, "0")[:3] + '"'
    return ("+%.2f" % valor).replace(".", ",") + " mm"


def leer_basso() -> dict:
    """
    Las fichas del catálogo de 3B indexadas por (número, letras) del código.
    Cada una junta todas sus filas: una por sobremedida de vástago.
    """
    filas = leer(BASSO)[2:]  # las dos primeras son el título y el encabezado

    # Primera pasada: partir la planilla en bloques. Un bloque empieza donde la
    # columna "Cil" tiene algo (es la fila que abre un motor) y sigue hasta el
    # próximo, arrastrando las filas de continuación —las que solo agregan un
    # renglón más de texto al motor o una válvula más del mismo motor—.
    bloques, marca_motor, actual = [], "", None
    for fila in filas:
        cod, cil = celda(fila, B_COD), celda(fila, B_CIL)
        aplic, motor = celda(fila, B_APLIC), celda(fila, B_MOTOR)
        if not cod and not motor and not cil and aplic:
            marca_motor, actual = aplic, None  # fila-título: "ACURA"
            continue
        if not cod and not motor and not aplic:
            continue
        if cil or actual is None:
            actual = {"marca_motor": marca_motor, "motor": [], "aplic": [],
                      "filas": [], "cil": cil, "dg": celda(fila, B_DG)}
            bloques.append(actual)
        if motor:
            actual["motor"].append(motor)
        if aplic:
            actual["aplic"].append(aplic)
        if cod:
            actual["filas"].append(fila)

    catalogo: dict = {}
    for bloque in bloques:
        texto_motor = " / ".join(dict.fromkeys(limpio(t) for t in bloque["motor"]))
        texto_aplic = " / ".join(dict.fromkeys(limpio(t) for t in bloque["aplic"]))
        for fila in bloque["filas"]:
            codigo = limpio(celda(fila, B_COD))
            clave = partes(codigo)
            ficha = catalogo.get(clave)
            if ficha is None:
                ficha = catalogo[clave] = {
                    "codigo_fab": codigo,
                    "marca_motor": bloque["marca_motor"],
                    "motor": texto_motor,
                    "aplicacion": texto_aplic,
                    "nro_cil": limpio(bloque["cil"]).replace(" ", "") or None,
                    "combustible": COMBUSTIBLE.get(limpio(bloque["dg"]).upper()),
                    "tipo": funcion(clave[1]),
                    "material": None,
                    "chavetero": limpio(celda(fila, B_CHAV)) or None,
                    "forma_cabeza": limpio(celda(fila, B_FORMA)).upper() or None,
                    "sobremedidas": OrderedDict(),
                    "originales": [],
                    "moresa": limpio(celda(fila, B_MORESA)) or None,
                    "edival": limpio(celda(fila, B_EDIVAL)) or None,
                }
            else:
                # El mismo código puede aparecer en varios motores: se suman las
                # aplicaciones en vez de quedarse con la primera.
                for campo, texto in (("motor", texto_motor), ("aplicacion", texto_aplic)):
                    if texto and texto not in ficha[campo]:
                        ficha[campo] = f"{ficha[campo]} / {texto}" if ficha[campo] else texto
            for i in B_OE:
                oe = limpio(celda(fila, i))
                if oe and oe not in ficha["originales"]:
                    ficha["originales"].append(oe)
            etiqueta = etiqueta_3b(celda(fila, B_SUP))
            grados, reparo = angulo(celda(fila, B_ANG))
            ficha["sobremedidas"].setdefault(etiqueta, {
                "label": etiqueta,
                "edival_suf": None,
                "valor": numero(celda(fila, B_VAST)),
                "diam_cabeza": numero(celda(fila, B_CAB)),
                "largo": numero(celda(fila, B_LARGO)),
                "angulo": grados,
                "angulo_reparo": reparo,
            })
    return catalogo


# ── Catálogo Mahle ───────────────────────────────────────────────────────────
M_FABR, M_MOTOR, M_CIL, M_TIPO, M_COD = 0, 1, 2, 3, 4
M_EDIVAL, M_MEDIDAS, M_MATERIAL, M_ANG, M_CHAV, M_FORMA = 5, 6, 7, 8, 9, 10

RE_COD_MAHLE = re.compile(r"^V([AEC])(\d{7})\s*(.*)$")
TIPO_MAHLE = {"IN": "A", "EX": "E", "IN - EX": "AE"}
LETRA_MAHLE = {"A": "A", "E": "E", "C": "AE"}


def etiqueta_mahle(sufijo: str) -> str:
    """
    Mahle rotula las sobremedidas de vástago en milímetros ("0,076") y tiene
    además tres etiquetas propias ("+04", "+08", "+1") que el catálogo no
    explica. Las primeras se escriben con su unidad; las otras, tal cual. Las
    dos cosas pueden venir juntas ("0,076+08") y entonces se escriben juntas.
    """
    texto = limpio(sufijo)
    if not texto:
        return "STD"
    mm, resto = re.match(r"^([\d,.]*)\s*(.*)$", texto).groups()
    valor = numero(mm)
    if valor is None:
        return texto
    etiqueta = ("+%.3f" % valor).replace(".", ",").rstrip("0").rstrip(",") + " mm"
    return f"{etiqueta} {resto}".strip()


def sufijo_edival(codigo_edival: str) -> str:
    """
    Lo que el número de Edival escribe DESPUÉS de la letra de función: "3033 A1"
    → "1", "3033 A1+08" → "1+08", "3033 A" → "". Es lo que permite entender los
    códigos del proveedor que traen la sobremedida pegada ("V BE430540A1"): el
    catálogo de Mahle publica las dos numeraciones en la misma fila.
    """
    m = re.match(r"^\d+\s*[AEC]+\s*(.*)$", limpio(codigo_edival).upper())
    return re.sub(r"\s+", "", m.group(1)) if m else ""


def leer_mahle() -> dict:
    catalogo: dict = {}
    fabricante = motor = cil = ""
    for fila in leer(MAHLE):
        codigo = limpio(celda(fila, M_COD))
        if celda(fila, M_FABR):
            fabricante = celda(fila, M_FABR)
        if celda(fila, M_MOTOR):
            motor = limpio(celda(fila, M_MOTOR))
        if celda(fila, M_CIL):
            cil = celda(fila, M_CIL)
        m = RE_COD_MAHLE.match(codigo)
        if not m:
            continue
        letra, digitos, sufijo = m.group(1), m.group(2), m.group(3)
        clave = (digitos.lstrip("0") or "0", letra)
        medidas = [numero(v) for v in limpio(celda(fila, M_MEDIDAS)).split("x")]
        medidas += [None] * (3 - len(medidas))
        ficha = catalogo.get(clave)
        if ficha is None:
            ficha = catalogo[clave] = {
                "codigo_fab": "V" + letra + digitos,
                "marca_motor": fabricante,
                "motor": motor,
                "aplicacion": "",
                "nro_cil": cil.replace(" ", "") or None,
                "combustible": None,
                "tipo": TIPO_MAHLE.get(celda(fila, M_TIPO), LETRA_MAHLE.get(letra)),
                "material": limpio(celda(fila, M_MATERIAL)) or None,
                "chavetero": limpio(celda(fila, M_CHAV)) or None,
                "forma_cabeza": limpio(celda(fila, M_FORMA)).upper() or None,
                "sobremedidas": OrderedDict(),
                "originales": [],
                "moresa": None,
                "edival": limpio(celda(fila, M_EDIVAL)) or None,
            }
        elif motor and motor not in ficha["motor"]:
            ficha["motor"] = f"{ficha['motor']} / {motor}" if ficha["motor"] else motor
        # Mahle escribe el combustible pegado al final del texto del motor.
        for palabra, valor in (("diesel", "Diesel"), ("nafta", "Nafta"),
                               ("alcohol", "Alcohol")):
            if ficha["combustible"] is None and palabra in ficha["motor"].lower():
                ficha["combustible"] = valor
        etiqueta = etiqueta_mahle(sufijo)
        grados, reparo = angulo(celda(fila, M_ANG))
        ficha["sobremedidas"].setdefault(etiqueta, {
            "label": etiqueta,
            "edival_suf": sufijo_edival(celda(fila, M_EDIVAL)),
            "valor": medidas[1],
            "diam_cabeza": medidas[0],
            "largo": medidas[2],
            "angulo": grados,
            "angulo_reparo": reparo,
        })
    return catalogo


# ── Equivalencias entre marcas ───────────────────────────────────────────────
def leer_equivalencias() -> tuple:
    """
    Dos diccionarios —uno por marca, indexados igual que los catálogos— con la
    línea de equivalencias ya armada para la pantalla.
    """
    def armar(pares):
        return " · ".join(f"{etiqueta} {valor}" for etiqueta, valor in pares if valor)

    de_mahle = {}
    for fila in leer(MAHLE_EQUIV)[1:]:
        m = RE_COD_MAHLE.match(limpio(celda(fila, 0)))
        if not m:
            continue
        clave = (m.group(2).lstrip("0") or "0", m.group(1))
        de_mahle.setdefault(clave, armar([
            ("Edival", limpio(celda(fila, 1))), ("3B", limpio(celda(fila, 2))),
            ("Original", limpio(celda(fila, 3))),
        ]))

    de_3b = {}
    for fila in leer(BASSO_EQUIV)[1:]:
        codigo = limpio(celda(fila, 0))
        if not codigo:
            continue
        de_3b.setdefault(partes(codigo), armar([
            ("Mahle", limpio(celda(fila, 1))), ("Edival", limpio(celda(fila, 2))),
            ("Original", limpio(celda(fila, 3))),
        ]))
    return de_3b, de_mahle


# ── La lista del proveedor ───────────────────────────────────────────────────
def leer_proveedor() -> dict:
    """
    Los códigos de válvula de 3B y de Mahle agrupados por código base. Cada
    grupo trae sus medidas (una por precio) y la descripción que publica la
    lista, que para las fichas sin catálogo es la única aplicación que hay.
    """
    grupos: dict = OrderedDict()
    with open(CSV_PROVEEDOR, encoding="latin-1", newline="") as f:
        for fila in csv.reader(f, delimiter=";"):
            if len(fila) < 2:
                continue
            codigo = (fila[0] or "").strip()
            if not codigo.startswith(("V 3B", "V BE")):
                continue
            base, medida = base_y_medida(codigo)
            grupo = grupos.setdefault(base, {
                "marca": "3B" if base.startswith("V 3B") else "MAHLE",
                "resto": base[4:].strip(),
                "descripcion": "",
                "codigos": [],
            })
            grupo["codigos"].append({"codigo": codigo, "medida": medida})
            descripcion = re.sub(r"\s+", " ", (fila[1] or "").strip())
            if len(descripcion) > len(grupo["descripcion"]):
                grupo["descripcion"] = descripcion
    return grupos


# ── Armado de las fichas ─────────────────────────────────────────────────────
def buscar_ficha(catalogo: dict, clave: tuple):
    """
    La ficha del catálogo para un código del proveedor. Primero el código
    entero; si no está, el número con la letra de función sola —el proveedor y
    el catálogo no siempre coinciden en el sufijo de variante—. Con dos
    candidatas se elige la del código más parecido, que es lo que separa una
    "-ACB 30" de una "-ACB 45".
    """
    numero_, letras = clave
    if clave in catalogo:
        return catalogo[clave]
    if not letras:
        return None
    candidatas = [f for (n, l), f in catalogo.items()
                  if n == numero_ and l[:1] == letras[:1]]
    if not candidatas:
        return None
    if len(candidatas) == 1:
        return candidatas[0]
    objetivo = numero_ + letras
    return max(candidatas, key=lambda f: SequenceMatcher(
        None, objetivo, "".join(partes(f["codigo_fab"]))).ratio())


def _sobremedida(s: dict) -> dict:
    """
    Una sobremedida como la lee la pantalla. Las de altura de cabeza van sin Ø
    —la palabra "altura" en su lugar— porque el suyo es el mismo que el de la
    STD: repetirlo hacía leer dos medidas donde hay una sola, y las metía en el
    filtro de Ø de vástago como si fueran un diámetro distinto.
    """
    if RE_ALTURA_CABEZA.match(s["label"]):
        return {"label": s["label"], "valor": None,
                "texto": "altura", "nota": NOTA_ALTURA_CABEZA}
    salida = {"label": s["label"], "valor": s["valor"]}
    # La sobremedida que trae las dos cosas (vástago y altura de cabeza) sí
    # lleva su Ø, y la aclaración al lado.
    if re.search(r"\+\d+$", s["label"]):
        salida["nota"] = NOTA_ALTURA_CABEZA
    return salida


def main() -> int:
    basso, mahle = leer_basso(), leer_mahle()
    equiv_3b, equiv_mahle = leer_equivalencias()
    grupos = leer_proveedor()

    fichas, sin_catalogo = [], []
    for base, grupo in grupos.items():
        es_3b = grupo["marca"] == "3B"
        numero_, letras = partes(grupo["resto"])
        if es_3b:
            ficha = buscar_ficha(basso, (numero_, letras))
            equivalencias = equiv_3b.get((numero_, letras)) if ficha else None
        else:
            # En el catálogo la válvula común (la que va de admisión y de
            # escape) es "VC"; el proveedor la escribe con una "C" sola o con
            # "AE" al final del número.
            letra = "C" if letras.startswith("C") or funcion(letras) == "AE" else \
                {"A": "A", "E": "E"}.get(funcion(letras) or "", "A")
            ficha = buscar_ficha(mahle, (numero_, letra))
            equivalencias = equiv_mahle.get((numero_, letra)) if ficha else None

        sobremedidas = list((ficha or {}).get("sobremedidas", {}).values())
        # La STD manda: es la medida con la que se identifica la válvula. Sin
        # STD (pasa en unas pocas fichas de 3B) vale la primera fila.
        principal = next((s for s in sobremedidas if s["label"] == "STD"), None) or \
            (sobremedidas[0] if sobremedidas else {})

        # Las medidas del proveedor y las del catálogo son la misma sobremedida
        # escrita de dos maneras, y en pantalla van una al lado de la otra (la
        # columna "Precio de" contra la de sobremedidas): si no se traducen,
        # esa fila dice "+30" a la izquierda y '+.030"' a la derecha, que
        # parecen dos medidas distintas. Se traduce solo cuando la etiqueta
        # existe en la ficha — nunca se inventa una sobremedida que el catálogo
        # no publica.
        etiquetas = {s["label"] for s in sobremedidas}
        por_edival = {s["edival_suf"]: s["label"] for s in sobremedidas if s.get("edival_suf")}
        for entrada in grupo["codigos"]:
            medida = entrada["medida"]
            if medida in por_edival:
                entrada["medida"] = por_edival[medida]
                continue
            en_pulgadas = MEDIDA_EN_PULGADAS.get(medida)
            if en_pulgadas in etiquetas:
                entrada["medida"] = en_pulgadas

        # La marca del vehículo, el motor y la aplicación, en ese orden y sin
        # repetirse: el catálogo de 3B tiene columnas donde el motor y la
        # aplicación dicen lo mismo ("Borgward VM 100 / 112 HP" en las dos), y
        # pegadas quedaban dos veces en la misma celda de la tabla.
        partes_aplicacion = []
        for texto in [(ficha or {}).get("marca_motor"), (ficha or {}).get("motor"),
                      (ficha or {}).get("aplicacion")]:
            if texto and not any(texto in previo for previo in partes_aplicacion):
                partes_aplicacion.append(texto)
        aplicacion = " ".join(partes_aplicacion).strip()

        fichas.append({
            "codigo": base,
            "codigo_fab": (ficha or {}).get("codigo_fab"),
            "marca": grupo["marca"],
            "aplicacion": aplicacion or grupo["descripcion"],
            "descripcion": grupo["descripcion"],
            "tipo": ((ficha or {}).get("tipo") or funcion(letras)
                     or tipo_desde_descripcion(grupo["descripcion"])),
            "medidas": {
                "diam_cabeza": principal.get("diam_cabeza"),
                "diam_vastago": principal.get("valor"),
                "largo": principal.get("largo"),
                "angulo": principal.get("angulo"),
            },
            "extra": {
                "fabricante_motor": (ficha or {}).get("marca_motor") or None,
                "motor": (ficha or {}).get("motor") or None,
                "nro_cil": (ficha or {}).get("nro_cil"),
                "combustible": (ficha or {}).get("combustible"),
                "material": (ficha or {}).get("material"),
                "chavetero": (ficha or {}).get("chavetero"),
                "forma_cabeza": (ficha or {}).get("forma_cabeza"),
                "equivalencias": equivalencias or None,
                "originales": (ficha or {}).get("originales") or [],
                # La aplicación que publica la lista del proveedor va debajo de
                # la del catálogo, en chico: son dos formas de nombrar el mismo
                # motor y a veces una dice lo que la otra se calla.
                "notas": [grupo["descripcion"]] if aplicacion and grupo["descripcion"] else [],
                "sobremedidas": [_sobremedida(s) for s in sobremedidas],
                "catalogo": "3B 2025" if es_3b else "Mahle 2019/2020",
                "revisar": {
                    campo: SIN_FICHA
                    for campo in ("diam_cabeza", "diam_vastago", "largo", "angulo")
                } if not ficha else (
                    {"angulo": principal["angulo_reparo"]}
                    if principal.get("angulo_reparo") else None
                ),
            },
            "codigos_crac": grupo["codigos"],
        })
        if not ficha:
            sin_catalogo.append(base)

    fichas.sort(key=lambda f: (f["marca"], f["codigo"]))
    with open(SALIDA, "w", encoding="utf-8") as f:
        json.dump(fichas, f, ensure_ascii=False, indent=1)

    por_marca: dict = {}
    for f in fichas:
        por_marca[f["marca"]] = por_marca.get(f["marca"], 0) + 1
    print(f"{len(fichas)} válvulas -> {os.path.relpath(SALIDA, RAIZ)}")
    print("  por marca: " + ", ".join(f"{k} {v}" for k, v in sorted(por_marca.items())))
    print(f"  códigos del proveedor: {sum(len(f['codigos_crac']) for f in fichas)}")
    print(f"  con ficha del catálogo: {len(fichas) - len(sin_catalogo)}")
    print(f"  sin ficha (van con '?'): {len(sin_catalogo)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
