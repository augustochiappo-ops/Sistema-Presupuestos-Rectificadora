#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Suma al buscador por medidas las guías de la hoja "Indy - Últimas
incorporaciones 2025".

    python3 scripts/convertir_guias_indy_2025.py --simular   # contar sin escribir
    python3 scripts/convertir_guias_indy_2025.py             # escribir guias.json

Se corre A MANO, cuando llega una hoja nueva de incorporaciones de Indy. La
salida (`CRAC/tecnicos/guias.json`) se commitea: es lo que hace que producción
tenga los datos apenas hace `git pull`.

QUÉ FICHAS ENTRAN. Todas, tengan o no renglón en la lista del proveedor. Las
guías son una de las cuatro familias del grupo "catálogo completo" (regla del
dueño, 2026-09-08; el detalle está en la cabecera de `ESPEC` en
`webapp/backend/app/tecnicos.py`): son piezas que el taller necesita
IDENTIFICAR por sus medidas cuando no sabe el código, y eso sirve igual si
después la consigue por otro lado. De estas 37, el proveedor trabaja UNA.

POR QUÉ ESTE SCRIPT EXISTE Y NO SE AGREGÓ LA HOJA A `convertir_tecnicos.js`.
Ese script es el que armó `guias.json` originalmente, leyendo el repo del
buscador web (`augustochiappo-ops/Chiappo-Repuestos-`), y en la misma corrida
reescribe también `camisas.json` y `subconjuntos.json`. Pero `subconjuntos.json`
hoy lo escribe otro script —`pistones_fm_desde_proveedor.py`, que le sumó las 83
fichas de Federal Mogul el 2026-09-08— así que correr el .js le pasaría el
trapo a esa tanda entera. Mientras siga así, la hoja nueva entra por acá.

Este script AGREGA, no regenera: lee `guias.json`, le suma lo que falta y lo
vuelve a escribir. Las fichas viejas quedan en su orden y las nuevas van al
final, igual que hace `pistones_fm_desde_proveedor.py` — reordenar el archivo
entero para meter 36 fichas convierte un diff de 36 en uno de 951 y no se puede
revisar. Correrlo dos veces no duplica nada: un código que ya está se saltea.

TRES COSAS QUE RESUELVE, Y POR ESO NO ES UN `pandas.to_json`:

1. EL CÓDIGO DEL PROVEEDOR. En la lista del proveedor una guía es
   "G IY3666B  003": categoría G, marca IY pegada al número, y la sobremedida al
   final. La hoja del fabricante trae el número pelado ("G3666B"), así que el
   cruce es "G3666B" → "G IY3666B". Un código base con varias sobremedidas es
   VARIAS fichas, una por sobremedida —así están las 155 guías de Indy que ya
   estaban, y la pantalla de guías no tiene columna de sobremedida donde
   mostrarlas juntas—. Sin renglón en la lista, la ficha sale con el código del
   fabricante y sin precio.

2. LA MULETILLA DE LA COLUMNA DEL MOTOR. Veinte de las 37 filas empiezan con
   "GUIA VALVULA" o "GUIA DE VALV.", que no dice nada —toda la pestaña son guías
   de válvula— y varias repiten la marca adentro del texto ("HYUNDAI GUIA
   VALVULA HYUNDAI 2021-2023 …"). Se saca la muletilla y se descarta la
   repetición, que es la misma limpieza que se le hizo a los asientos de Indy el
   2026-08-28 y por el mismo motivo. Las 155 guías de Indy que ya estaban NO
   están limpias: vienen del otro repo y este script no las toca.

3. LA CANTIDAD POR JUEGO NO SIEMPRE ES UN NÚMERO. Hay guías que sirven para
   motores de 4 y de 6 cilindros y ahí la hoja pone "4/6" o "3/4". Se guarda tal
   cual, como texto: es lo que dice el catálogo. Vacío queda en null, que la
   pantalla muestra como un guión.

NO se copia ningún precio: el precio y el stock los pone la base local, que se
actualiza todos los días con el Excel del proveedor.
"""
import argparse
import csv
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUENTES = os.path.join(RAIZ, "CRAC", "tecnicos", "fuentes")
CSV_PROVEEDOR = os.path.join(RAIZ, "CRAC", "precio-stock.csv")
SALIDA = os.path.join(RAIZ, "CRAC", "tecnicos", "guias.json")
ORIGEN = os.path.join(FUENTES, "guias_indy_2025.csv")

MARCA = "INDY"

# Marca/Make | Motor/Engine | Nº Original | Nº 300 INDY | A/E | D.E | D.I | L |
# Mat | Shape | Cant. por juego.
COL_MARCA, COL_MOTOR, COL_OEM, COL_CODIGO = 0, 1, 2, 3
COL_TIPO, COL_DIAM_EXT, COL_DIAM_INT, COL_LARGO = 4, 5, 6, 7
COL_MATERIAL, COL_FORMA, COL_CANT = 8, 9, 10

CODIGO = re.compile(r"^G[\dA-Z\-]+$")
MEDIDA = re.compile(r"^(?:STD|\d{2,3})$")

# Cómo escribe la hoja el tipo, y cómo lo guarda el JSON. Lo que no esté acá
# queda en None: la pantalla muestra un guión, que es mejor que adivinar.
TIPOS = {
    "A": "A", "ADM": "A", "ADM.": "A",
    "E": "E", "ESC": "E", "ESC.": "E",
    "AE": "AE", "A-E": "AE", "A/E": "AE", "ADM/ESC": "AE",
}

# La hoja abrevia el material; el JSON lo tiene escrito.
MATERIALES = {"B": "Bronce", "FG": "Fundición Gris"}

# Lo que se le saca al texto del motor: no dice nada y ocupa la columna.
MULETILLA = re.compile(r"^GUIAS?\s+(?:DE\s+)?VALV(?:ULA|\.)?S?\b[\s:.\-]*", re.I)


def celda(fila: list[str], i: int) -> str:
    return fila[i].strip() if i < len(fila) else ""


def numero(valor: str):
    """Una medida de la hoja, con coma o con punto. Vacía o "-" es None."""
    valor = (valor or "").strip().replace(",", ".")
    if not valor or valor == "-":
        return None
    try:
        return round(float(valor), 4)
    except ValueError:
        return None


def texto(valor: str):
    valor = (valor or "").strip()
    return valor or None


def aplicacion(marca: str, motor: str):
    """
    La marca del vehículo y el motor, sin la muletilla y sin repetir la marca.
    """
    motor = MULETILLA.sub("", (motor or "").strip())
    marca = (marca or "").strip()
    if marca and motor.upper().startswith(marca.upper()):
        motor = motor[len(marca):].lstrip(" .-:")
    partes = [p for p in (marca, motor) if p]
    return re.sub(r"\s+", " ", " ".join(partes)).strip() or None


def cant_juego(valor: str):
    """
    Tal cual lo escribe la hoja. La mayoría son un número, pero una guía que
    sirve para 4 y 6 cilindros viene como "4/6". El 0 es un dato que falta.
    """
    valor = (valor or "").strip()
    if not valor or valor == "0":
        return None
    return int(valor) if valor.isdigit() else valor


def sin_medida(codigo) -> str:
    """
    El código sin la sobremedida del final y sin espacios, para poder comparar
    una guía contra otra. Hace falta porque la MISMA guía está escrita de tres
    maneras distintas según de dónde venga: la hoja del fabricante la llama
    "G3666B", la lista del proveedor "G IY3666B  003", y las 155 guías de Indy
    que ya estaban en el JSON se guardaron con esa segunda forma —sobremedida
    incluida—, así que un código base es varias fichas. Comparar los strings
    pelados daba que G3666B no estaba cargada cuando sí lo estaba, y la habría
    cargado de nuevo.
    """
    partes = str(codigo or "").upper().split()
    if len(partes) >= 2 and MEDIDA.match(partes[-1]):
        partes = partes[:-1]
    return "".join(partes)


def indice_proveedor() -> dict[str, list[dict]]:
    """
    {código base normalizado: [{codigo del proveedor, medida}]}. El código va
    tal cual figura en la lista —relleno de espacios incluido—, que es como hay
    que buscarlo después en `crac_repuestos`.
    """
    indice: dict[str, list[dict]] = {}
    with open(CSV_PROVEEDOR, encoding="latin-1") as f:
        for fila in csv.reader(f, delimiter=";"):
            if not fila or not fila[0].startswith("G "):
                continue
            partes = fila[0].split()
            if len(partes) >= 3 and MEDIDA.match(partes[-1]):
                base, medida = " ".join(partes[:-1]), partes[-1]
            else:
                # Un código sin sobremedida escrita es el estándar: el proveedor
                # lo lista pelado y con medida en filas aparte.
                base, medida = " ".join(partes), "STD"
            indice.setdefault(base.upper(), []).append({"codigo": fila[0], "medida": medida})
    return indice


def ficha(fila: list[str], codigo_crac: dict | None) -> dict:
    """
    Una ficha como la lee `app/tecnicos.py`. El código que se muestra es el del
    proveedor cuando la pieza se puede pedir —es el que el taller escribe en el
    pedido— y el del fabricante cuando no.
    """
    codigo_fab = celda(fila, COL_CODIGO).upper()
    material = MATERIALES.get(celda(fila, COL_MATERIAL).upper())
    return {
        "codigo": codigo_crac["codigo"] if codigo_crac else codigo_fab,
        "codigo_fab": codigo_fab,
        "marca": MARCA,
        "aplicacion": aplicacion(celda(fila, COL_MARCA), celda(fila, COL_MOTOR)),
        "descripcion": None,
        "tipo": TIPOS.get(re.sub(r"\s+", "", celda(fila, COL_TIPO).upper())),
        "medidas": {
            "diam_vastago": numero(celda(fila, COL_DIAM_INT)),
            "diam_ext": numero(celda(fila, COL_DIAM_EXT)),
            "largo": numero(celda(fila, COL_LARGO)),
        },
        "extra": {
            "forma": texto(celda(fila, COL_FORMA)),
            "material": material,
            "sobremedida": codigo_crac["medida"] if codigo_crac else None,
            "nro_original": texto(celda(fila, COL_OEM)),
            "cant_juego": cant_juego(celda(fila, COL_CANT)),
        },
        "codigos_crac": [codigo_crac] if codigo_crac else [],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--simular", action="store_true", help="contar sin escribir el .json")
    args = ap.parse_args()

    if not os.path.exists(ORIGEN):
        sys.exit(f"Falta {ORIGEN}. Se vuelca de la hoja GUIAS del Excel de Indy:\n"
                 "  pandas.read_excel(…, sheet_name='GUIAS', header=None, dtype=object)\n"
                 "    .to_csv(destino, index=False, header=False)")

    proveedor = indice_proveedor()
    print(f"  {len(proveedor)} códigos base de guías en la lista del proveedor")

    previas = json.load(open(SALIDA, encoding="utf-8"))
    ya = {sin_medida(f.get("codigo_fab")) for f in previas}
    ya |= {sin_medida(f.get("codigo")) for f in previas}
    ya.discard("")

    with open(ORIGEN, encoding="utf-8", newline="") as f:
        filas = [[(c or "").strip() for c in fila] for fila in csv.reader(f)]

    nuevas, repetidas, sin_proveedor = [], [], []
    for fila in filas:
        codigo_fab = celda(fila, COL_CODIGO).upper()
        if not CODIGO.match(codigo_fab):
            continue  # encabezado y filas vacías
        base = "G IY" + codigo_fab[1:]
        del_proveedor = proveedor.get(base.upper(), [])
        if sin_medida(codigo_fab) in ya or sin_medida(base) in ya:
            repetidas.append(codigo_fab)
            continue
        if not del_proveedor:
            sin_proveedor.append(codigo_fab)
            nuevas.append(ficha(fila, None))
            continue
        # Una ficha por sobremedida, como las guías de Indy que ya estaban.
        for codigo_crac in del_proveedor:
            nuevas.append(ficha(fila, codigo_crac))

    sin_medidas = [f["codigo_fab"] for f in nuevas if not any(f["medidas"].values())]
    salida = previas + nuevas

    print(f"  {len(nuevas)} fichas nuevas de la hoja 2025 "
          f"({len(nuevas) - len(sin_proveedor)} con código del proveedor)")
    if repetidas:
        print(f"  {len(repetidas)} ya estaban cargadas, se saltean: {', '.join(repetidas)}")
    if sin_proveedor:
        print(f"  {len(sin_proveedor)} sin renglón en la lista del proveedor: entran igual, "
              f"son del grupo \"catálogo completo\"")
    if sin_medidas:
        print(f"  ⚠ {len(sin_medidas)} sin ninguna medida cargada: {', '.join(sin_medidas)}")

    if args.simular:
        print(f"  (--simular: no se escribió nada; quedarían {len(salida)} fichas)")
        return 0

    with open(SALIDA, "w", encoding="utf-8") as f:
        json.dump(salida, f, ensure_ascii=False, indent=1)
        f.write("\n")
    con_crac = sum(1 for x in salida if x["codigos_crac"])
    print(f"  → {SALIDA} ({len(salida)} fichas, {con_crac} con código del proveedor)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
