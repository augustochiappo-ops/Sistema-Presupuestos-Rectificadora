#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Arma la familia de PERNOS DE PISTÓN del buscador por medidas, con el catálogo de
Talleres Metalúrgicos Pescara.

    python3 scripts/convertir_pernos_pescara.py --ver       # contar sin escribir
    python3 scripts/convertir_pernos_pescara.py             # escribir pernos.json

Se corre A MANO, cuando llega una edición nueva del catálogo. La salida
(`CRAC/tecnicos/pernos.json`) se commitea: es lo que hace que producción tenga
los datos apenas hace `git pull`, igual que las otras once familias.

QUÉ FICHAS ENTRAN. Sólo los códigos que el proveedor VENDE. Los pernos son del
grupo "sólo proveedor" (regla del dueño, 2026-09-08; el detalle está en la
cabecera de `ESPEC` en `webapp/backend/app/tecnicos.py`): un perno que no se
puede pedir no le resuelve nada al taller, y el catálogo trae 332 códigos contra
los 305 de la lista. De los 305 del proveedor, 252 tienen ficha en el catálogo;
los otros 53 son posteriores a esta edición (es de 2018) y se listan al final de
la corrida para poder pedirlos cuando salga una edición nueva.

MEZCLA DOS FUENTES QUE SE MUEVEN A DISTINTO RITMO, como los otros scripts de
catálogo:

  * de la LISTA DEL PROVEEDOR (`CRAC/precio-stock.csv`) salen el código, la
    descripción y qué sobremedidas existen. Cambia todos los días.
  * del CATÁLOGO PESCARA (`Pescara 2018web.pdf`, páginas 4 a 7) salen el
    diámetro exterior, el largo y para qué marcas sirve. Se carga una vez.

DE DÓNDE SALE CADA DATO. El catálogo tiene dos tablas y esta carga usa la
primera, el "LISTADO DE PERNOS SEGÚN DIÁMETRO EXTERIOR" de las páginas 4 a 7:
código, aplicación orientativa, Ø exterior y largo, una fila por marca. Es la
tabla que ya viene ordenada por la medida con la que se busca, y sus 452 filas
dan 332 códigos con UN solo par (Ø, largo) cada uno — se verifica en cada
corrida, porque si un día un código apareciera con dos medidas distintas la ficha
estaría mintiendo y hay que mirarlo a mano.

LA SEGUNDA TABLA (páginas 8 a 28) QUEDÓ PARA OTRA TANDA, a propósito. Trae más:
el modelo y el motor de cada vehículo, la cantidad de cilindros, el Ø del
cilindro y el "Gpo" (A o C), que es el que dice qué sobremedidas acepta cada
perno —grupo A: STD, +1/2", +1", 005"; grupo C: STD, 1° sm, 2° sm—. Pero ahí las
columnas salen del PDF pegadas y sin separador ("3028 38.10 93.50A4111.12830" es
código 3028, Ø 38.10, largo 93.50, grupo A, 4 cilindros, Ø de cilindro 111.12 y
modelo 830), así que partirlas exige leer las coordenadas x de cada fragmento
—como hace `convertir_cojinetes.py`— y un corte mal puesto le cuelga a un perno
el Ø de cilindro del vecino. Se hace aparte, con su propia verificación.

LAS SOBREMEDIDAS SE GUARDAN COMO LAS ESCRIBE EL PROVEEDOR, sin traducir a
milímetros. El catálogo explica dos escalas —deslizante en la biela (+1/2" =
0,012 mm, +1" = 0,025 mm, 005" = 0,125 mm) y fijo en la biela (1ra = 0,010 mm,
2da = 0,015 mm)— pero la lista del proveedor las etiqueta "003", "005", "010",
"020", "1/2", "+1", "1SM", "2SM" y "3SM", y cuál es cuál NO está escrito en
ninguna de las dos fuentes. Adivinar la equivalencia pondría un Ø falso en una
ficha de perno, que es peor que no ponerlo: por eso el filtro de esta familia es
por el Ø de la medida STD y por el largo, y las sobremedidas se muestran con su
etiqueta para que el taller pida la que quiere.

NO se copia ningún precio: el precio y el stock los pone la base local, que se
actualiza todos los días con el Excel del proveedor.
"""
import argparse
import csv
import json
import os
import re
import sys

from pypdf import PdfReader

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUENTES = os.path.join(RAIZ, "CRAC", "tecnicos", "fuentes")
CSV_PROVEEDOR = os.path.join(RAIZ, "CRAC", "precio-stock.csv")
SALIDA = os.path.join(RAIZ, "CRAC", "tecnicos", "pernos.json")
CATALOGO = os.path.join(FUENTES, "Pescara 2018web.pdf")

MARCA = "PESCARA"

# Una fila del listado por diámetro: código, aplicación orientativa, Ø ext y
# largo, los dos con dos decimales siempre.
FILA = re.compile(r"^(\d{3,4})\s+(.*?)\s+(\d+\.\d{2})\s+(\d+\.\d{2})$")

# Un código del proveedor: "PEPE3008   STD". Lo que va después de los dígitos es
# la sobremedida; sin nada, es la estándar. Los códigos de fabricación especial
# traen el Ø y el largo metidos adentro ("PEPE1190088STD", "PEPE19X63  STD") y
# NO son códigos de catálogo: no matchean y quedan afuera, que es lo correcto.
CODIGO_PROVEEDOR = re.compile(r"^PEPE(\d{3,4})(?:\s+(\S+))?$")


def del_catalogo(pdf: str) -> dict[str, dict]:
    """
    {código: {"diam_ext", "largo", "marcas", "paginas"}} del listado por
    diámetro. Las páginas de la segunda tabla se saltean por su encabezado, así
    que si el catálogo cambia de paginación esto sigue apuntando a la tabla
    correcta y no a un número de página fijo.
    """
    codigos: dict[str, dict] = {}
    for nro, pagina in enumerate(PdfReader(pdf).pages, start=1):
        texto = pagina.extract_text() or ""
        if "APLICACIÓN ORIENTATIVA" in texto:
            continue  # la segunda tabla, la de aplicaciones por vehículo
        for linea in texto.split("\n"):
            m = FILA.match(linea.strip())
            if not m:
                continue
            codigo, marca, diam_ext, largo = m.groups()
            ficha = codigos.setdefault(codigo, {
                "diam_ext": float(diam_ext), "largo": float(largo),
                "marcas": [], "paginas": [],
            })
            # Un código con dos medidas distintas sería un dato contradictorio y
            # la ficha quedaría mintiendo: se avisa y se deja la primera.
            if (ficha["diam_ext"], ficha["largo"]) != (float(diam_ext), float(largo)):
                print(f"  ⚠ el código {codigo} figura con dos medidas: "
                      f"{ficha['diam_ext']}×{ficha['largo']} y {diam_ext}×{largo} "
                      f"(pág. {nro}); se deja la primera")
                continue
            marca = re.sub(r"\s+", " ", marca).strip()
            if marca and marca not in ficha["marcas"]:
                ficha["marcas"].append(marca)
            if nro not in ficha["paginas"]:
                ficha["paginas"].append(nro)
    return codigos


def del_proveedor() -> tuple[dict[str, list[dict]], int]:
    """
    {código: [{codigo del proveedor, medida, descripcion}]} y cuántos renglones
    de fabricación especial se saltearon.
    """
    lista: dict[str, list[dict]] = {}
    especiales = 0
    with open(CSV_PROVEEDOR, encoding="latin-1") as f:
        for fila in csv.reader(f, delimiter=";"):
            if not fila or not fila[0].startswith("PEPE"):
                continue
            m = CODIGO_PROVEEDOR.match(fila[0].strip())
            if not m:
                especiales += 1
                continue
            codigo, medida = m.group(1), m.group(2) or "STD"
            lista.setdefault(codigo, []).append({
                "codigo": fila[0],
                "medida": medida,
                "descripcion": (fila[1] if len(fila) > 1 else "").strip() or None,
            })
    return lista, especiales


def ficha(codigo: str, catalogo: dict, renglones: list[dict]) -> dict:
    """Una ficha como la lee `app/tecnicos.py`."""
    # La descripción del proveedor suele decir más que la marca sola del catálogo
    # ("BEDFORD 350" contra "BEDFORD"): se muestra la primera que traiga texto.
    descripcion = next((r["descripcion"] for r in renglones if r["descripcion"]), None)
    return {
        # El código que se muestra es el del proveedor sin la sobremedida, que es
        # lo que el taller escribe en el pedido.
        "codigo": "PEPE" + codigo,
        "codigo_fab": codigo,
        "marca": MARCA,
        # El catálogo la llama "aplicación orientativa" y es eso: las marcas de
        # motor donde entra, no el modelo. Un mismo perno sirve para varias.
        "aplicacion": " / ".join(catalogo["marcas"]) or None,
        "descripcion": descripcion,
        "medidas": {
            "diam_ext": catalogo["diam_ext"],
            "largo": catalogo["largo"],
        },
        "extra": {
            # Con su etiqueta tal cual la escribe el proveedor: la equivalencia
            # en milímetros no está en ninguna de las dos fuentes.
            "sobremedidas": [r["medida"] for r in renglones],
            "catalogo": "Pescara 2018",
            "pagina": catalogo["paginas"][0] if catalogo["paginas"] else None,
        },
        "codigos_crac": [{"codigo": r["codigo"], "medida": r["medida"]} for r in renglones],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ver", action="store_true", help="contar sin escribir el .json")
    args = ap.parse_args()

    if not os.path.exists(CATALOGO):
        sys.exit(f"Falta {CATALOGO}")

    catalogo = del_catalogo(CATALOGO)
    lista, especiales = del_proveedor()
    print(f"  catálogo: {len(catalogo)} códigos con Ø y largo")
    print(f"  proveedor: {len(lista)} códigos base, "
          f"{sum(len(v) for v in lista.values())} renglones "
          f"(+{especiales} de fabricación especial, con el Ø y el largo en el código)")

    fichas, sin_catalogo = [], []
    for codigo in sorted(lista):
        if codigo not in catalogo:
            sin_catalogo.append(codigo)
            continue
        fichas.append(ficha(codigo, catalogo[codigo], lista[codigo]))

    renglones = sum(len(f["codigos_crac"]) for f in fichas)
    print(f"  → {len(fichas)} fichas, que cubren {renglones} renglones de la lista de precios")
    if sin_catalogo:
        print(f"  {len(sin_catalogo)} códigos del proveedor sin ficha en esta edición del "
              f"catálogo (es de 2018): no se cargan.")
        if args.ver:
            print("     " + ", ".join(sin_catalogo))
    sin_medidas = [f["codigo_fab"] for f in fichas if not all(f["medidas"].values())]
    if sin_medidas:
        print(f"  ⚠ {len(sin_medidas)} sin Ø o sin largo: {', '.join(sin_medidas)}")

    if args.ver:
        print("  (--ver: no se escribió nada)")
        return 0

    with open(SALIDA, "w", encoding="utf-8") as f:
        json.dump(fichas, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"  → {SALIDA}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
