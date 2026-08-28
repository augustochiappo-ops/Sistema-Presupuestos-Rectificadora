#!/usr/bin/env python3
"""
Convierte los tres catálogos de asientos de válvulas al JSON que lee el
buscador por medidas.

    python3 scripts/convertir_asientos.py

Se corre A MANO, cuando llega una tanda nueva de alguno de los tres catálogos.
La salida (CRAC/tecnicos/asientos.json) se commitea: es lo que hace que
producción tenga los datos apenas hace `git pull`, igual que las otras cinco
familias.

De dónde salen los datos: de tres Excel del dueño, volcados tal cual a CSV en
CRAC/tecnicos/fuentes/ (celda por celda, sin encabezado ni transformación). Se
vuelcan y no se versionan los Excel originales porque el de Nubo pesa 7,5 MB y
trae quince hojas de las que acá se usa una sola. Para rehacer un volcado:

    import pandas as pd
    pd.read_excel(ORIGEN, sheet_name=HOJA, header=None, dtype=object) \\
      .to_csv(DESTINO, index=False, header=False)

    | archivo                  | Excel de origen              | hoja                         |
    |--------------------------|------------------------------|------------------------------|
    | asientos_indy_2024.csv   | Indy Catálogo Interactivo    | Asientos-Seats - casquillos  |
    |                          | 2024 web.xls                 |                              |
    | asientos_nubo_2025.csv   | NUBO_2025.xlsx               | ASIENTOS                     |
    | asientos_ryc.csv         | CatalogoASIENTOS.xls (RYC)   | Asientos Pag.1 (única)       |

De cada catálogo se usa lo que pidió el dueño y nada más: tipo (admisión o
escape), Ø exterior, Ø interior, altura, ángulo y cantidad por juego. Lo demás
que traen las planillas (Nº Riosulense, material, cilindros) se lee para poder
identificar la fila, pero no se guarda salvo el Nº original, que queda en
`extra` sin columna en pantalla.

Cuatro cosas que este script resuelve, y por eso existe:

1. LA CANTIDAD POR JUEGO LA DA UN SOLO CATÁLOGO. La trae Indy; Nubo y RYC no.
   Las fichas de esos dos van con `cant_juego` en null, que la pantalla muestra
   como un guión: no se inventa ni se copia la de otra marca. En Indy, el 0 de
   esa columna (51 filas) también es un dato que falta, no un juego de cero
   piezas, así que entra como null.

2. EL MODELO NO ESTÁ EN TODAS LAS FILAS. Los tres catálogos escriben el motor
   una vez y lo dejan valiendo para las filas de abajo (el asiento de admisión
   y el de escape del mismo motor son dos filas). Se arrastra el último modelo
   visto, y la marca del vehículo sale de las filas-título que separan los
   bloques ("CHEVROLET", "CATERPILLAR").

   RYC además parte el modelo en varias líneas sueltas, sin código, que
   continúan el de arriba ("NT300-NT310…" debajo de "MOT.NH230-NH250…"). Esas
   se le suman al modelo de la última ficha emitida en vez de descartarse. En
   Nubo, en cambio, las filas sin código son productos sin código todavía, no
   continuaciones: se saltean enteras.

3. EL ÁNGULO VIENE ESCRITO DE SEIS MANERAS. "45º", "45°", "45ª", "45", "-" y
   vacío. Se guarda el número y nada más, para que el filtro de ángulo pueda
   comparar; el "º" lo pone la pantalla.

4. EL CÓDIGO DEL PROVEEDOR. En la lista del proveedor un asiento es
   "F IY 5000  005": categoría F (asientos / casquillos), marca (IY = Indy,
   NB = Nubo, R = RYC) y la sobremedida al final. Cada catálogo escribe su
   código a su manera y hay que llevarlo a esa forma:

       Indy   A5177   → F IY 5177     (se le saca la A del frente)
       Nubo   C105 A  → F NB 105A     (el número y la letra del tipo pegados)
       RYC    523     → F R 523T      (la letra final es del proveedor, no del
                                       catálogo: se matchea por el número)

   Un mismo código base tiene una fila por sobremedida (STD, 003, 005, 010…),
   todas con su precio: se guardan todas en `codigos_crac` y el buscador elige
   en runtime la que convenga mostrar, igual que en subconjuntos y bujes.

NO se copia ningún precio: el precio y el stock los pone la base local, que se
actualiza todos los días con el Excel del proveedor.
"""
import csv
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUENTES = os.path.join(RAIZ, "CRAC", "tecnicos", "fuentes")
CSV_PROVEEDOR = os.path.join(RAIZ, "CRAC", "precio-stock.csv")
SALIDA = os.path.join(RAIZ, "CRAC", "tecnicos", "asientos.json")

INDY = os.path.join(FUENTES, "asientos_indy_2024.csv")
NUBO = os.path.join(FUENTES, "asientos_nubo_2025.csv")
RYC = os.path.join(FUENTES, "asientos_ryc.csv")


# ── Lectura de los volcados ──────────────────────────────────────────────────
def leer(path: str) -> list[list[str]]:
    """El volcado de la hoja como lista de filas de texto, sin tocar nada."""
    with open(path, encoding="utf-8", newline="") as f:
        filas = [[(c or "").strip() for c in fila] for fila in csv.reader(f)]
    if not filas:
        raise SystemExit(f"El volcado {path} está vacío")
    return filas


def celda(fila: list[str], i: int) -> str:
    return fila[i].strip() if i < len(fila) else ""


def numero(valor: str):
    """Una medida del catálogo, con coma o con punto decimal. Vacía es None."""
    valor = (valor or "").strip().replace(",", ".")
    if not valor or valor == "-":
        return None
    try:
        return round(float(valor), 4)
    except ValueError:
        return None


def angulo(valor: str):
    """
    El ángulo del asiento, en grados. Los catálogos lo escriben "45º", "45°",
    "45ª", "45" o "-"; se guarda el número pelado y la pantalla le pone el "º".
    """
    limpio = re.sub(r"[^\d.,]", "", (valor or "").strip())
    return numero(limpio)


def texto(valor: str):
    return (valor or "").strip() or None


def juntar(*partes) -> str:
    """
    Marca del vehículo y modelo en una sola línea, sin repetir la marca cuando
    el catálogo ya la escribió adentro del modelo ("ASIENTO VALV. AUDI ESC…").
    """
    salida: list[str] = []
    for parte in partes:
        limpio = re.sub(r"\s+", " ", str(parte or "")).strip(" -")
        if not limpio:
            continue
        if any(limpio.upper() in y.upper() for y in salida):
            continue
        salida.append(limpio)
    return " ".join(salida)


TIPOS = {
    "A": "A", "ADM": "A", "ADM.": "A",
    "E": "E", "ESC": "E", "ESC.": "E",
    "AE": "AE", "A-E": "AE", "A/E": "AE", "ADM/ESC": "AE",
}


def tipo(valor: str):
    """
    Admisión, escape o indistinta. Cada catálogo lo escribe a su manera ("ADM",
    "A", "A / E"); lo que no se entienda queda en None, que la pantalla muestra
    como un guión — mejor eso que adivinar.
    """
    clave = re.sub(r"\s+", "", (valor or "").upper())
    return TIPOS.get(clave)


# ── La lista del proveedor ───────────────────────────────────────────────────
# "F IY 5000  005" / "F NB 105A" / "F R 523T   STD": categoría F, marca, código
# y —cuando la hay— la sobremedida al final.
MEDIDA = re.compile(r"^(?:STD|\d{2,3})$")


def indice_proveedor() -> dict[str, list[dict]]:
    """
    {código base normalizado: [{codigo del proveedor, medida}]}, con el código
    tal cual figura en la lista (relleno de espacios incluido), que es como hay
    que buscarlo después en `crac_repuestos`.
    """
    indice: dict[str, list[dict]] = {}
    with open(CSV_PROVEEDOR, encoding="latin-1") as f:
        for fila in csv.reader(f, delimiter=";"):
            if not fila or not fila[0].startswith("F "):
                continue
            partes = fila[0].split()
            if len(partes) >= 4 and MEDIDA.match(partes[-1]):
                base, medida = " ".join(partes[:-1]), partes[-1]
            else:
                # Un código sin sobremedida escrita es el estándar: el
                # proveedor lo lista pelado ("F IY 5000") y con medida
                # ("F IY 5000  005") en filas aparte.
                base, medida = " ".join(partes), "STD"
            indice.setdefault(base.upper(), []).append({"codigo": fila[0], "medida": medida})
    return indice


PROVEEDOR = {}


def resolver(base: str) -> list[dict]:
    """Todas las sobremedidas del proveedor para ese código base, o []."""
    return list(PROVEEDOR.get((base or "").upper(), []))


def indice_ryc() -> dict[str, str]:
    """
    {número del catálogo RYC: código base del proveedor}. El proveedor le
    agrega una letra al número ("F R 523T", "F R 100N") que el catálogo no
    tiene, así que el cruce va por el número.
    """
    mapa = {}
    for base in PROVEEDOR:
        m = re.match(r"^F R (\d+)[A-Z]*$", base)
        if m:
            mapa[m.group(1)] = base
    return mapa


# ── La ficha ─────────────────────────────────────────────────────────────────
def ficha(*, codigo_fab, marca, aplicacion, tipo_val, diam_ext, diam_int,
          altura, angulo_val, cant_juego, nro_original, base_crac) -> dict:
    """
    Una ficha como la lee `app/tecnicos.py`. El código que se muestra es el del
    proveedor cuando la pieza se puede pedir —es el que el taller escribe en el
    pedido— y el del catálogo cuando no.
    """
    codigos_crac = resolver(base_crac)
    return {
        "codigo": base_crac if codigos_crac else codigo_fab,
        "codigo_fab": codigo_fab,
        "marca": marca,
        "aplicacion": aplicacion or None,
        "descripcion": None,
        "tipo": tipo_val,
        "medidas": {
            "diam_ext": diam_ext,
            "diam_int": diam_int,
            "altura": altura,
            "angulo": angulo_val,
        },
        "extra": {
            "cant_juego": cant_juego,
            "nro_original": nro_original,
        },
        "codigos_crac": codigos_crac,
    }


# ── Indy ─────────────────────────────────────────────────────────────────────
# Marca/Make | Motor/Engine | Nº Original | N°300-INDY | A/E | D.E | D.I | H |
# µ (ángulo) | Cant. por juego.
def indy() -> list[dict]:
    fichas = []
    for fila in leer(INDY):
        codigo = celda(fila, 3).upper()
        if not re.match(r"^A[\dA-Z\-]+$", codigo):
            continue  # encabezados, títulos y filas vacías
        cantidad = celda(fila, 9)
        fichas.append(ficha(
            codigo_fab=codigo,
            marca="INDY",
            aplicacion=juntar(celda(fila, 0), celda(fila, 1)),
            tipo_val=tipo(celda(fila, 4)),
            diam_ext=numero(celda(fila, 5)),
            diam_int=numero(celda(fila, 6)),
            altura=numero(celda(fila, 7)),
            angulo_val=angulo(celda(fila, 8)),
            # El 0 de esta columna es un dato que falta, no un juego vacío.
            cant_juego=cantidad if cantidad and cantidad != "0" else None,
            nro_original=texto(celda(fila, 2)),
            base_crac="F IY " + codigo[1:],
        ))
    return fichas


# ── Nubo ─────────────────────────────────────────────────────────────────────
# Código NUBO | Nº Riosulense | Nº Original | Marca y Modelo | Tipo | Ø ext |
# Ø int | Altura | Ángulo.
CODIGO_NUBO = re.compile(r"^C ?(\d+) ?([AE])?$")


def nubo() -> list[dict]:
    fichas = []
    marca_vehiculo = ""
    modelo = ""
    for fila in leer(NUBO):
        codigo = celda(fila, 0).upper()
        m = CODIGO_NUBO.match(codigo)
        if not m:
            # Fila-título de marca: la única sin código, sin tipo y sin ninguna
            # medida. Las demás sin código son productos que el catálogo
            # todavía no numeró, y se saltean.
            titulo = celda(fila, 3)
            if titulo and not any(celda(fila, i) for i in (0, 1, 2, 4, 5, 6, 7, 8)):
                marca_vehiculo, modelo = titulo, ""
            continue

        if celda(fila, 3):
            modelo = celda(fila, 3)

        tipo_val = tipo(celda(fila, 4))
        # La letra del código manda sobre la columna Tipo: es la que usa el
        # proveedor para armar el suyo ("C351A" → "F NB 351A").
        letra = m.group(2) or (tipo_val if tipo_val in ("A", "E") else "")
        fichas.append(ficha(
            codigo_fab=codigo,
            marca="NUBO",
            aplicacion=juntar(marca_vehiculo, modelo),
            tipo_val=tipo_val,
            diam_ext=numero(celda(fila, 5)),
            diam_int=numero(celda(fila, 6)),
            altura=numero(celda(fila, 7)),
            angulo_val=angulo(celda(fila, 8)),
            cant_juego=None,  # Nubo no la publica
            nro_original=texto(celda(fila, 2)),
            base_crac=f"F NB {m.group(1)}{letra}",
        ))
    return fichas


# ── RYC ──────────────────────────────────────────────────────────────────────
# Modelo y Tipo | Cil. | Nro. Original | código | AE | Ext | In | Alt | Grados |
# Material.
def ryc() -> list[dict]:
    mapa = indice_ryc()
    fichas = []
    marca_vehiculo = ""
    modelo = ""
    # Las fichas del bloque de modelos que se está leyendo: cuando aparece una
    # línea más de modelo, se les corrige la aplicación a todas, porque el
    # bloque vale para el asiento de admisión y para el de escape por igual.
    bloque: list[dict] = []

    def sumar_al_bloque(linea: str):
        nonlocal modelo
        modelo = juntar(modelo, linea)
        for f in bloque:
            f["aplicacion"] = juntar(marca_vehiculo, modelo)

    for fila in leer(RYC):
        crudo = celda(fila, 3)
        titulo = celda(fila, 0)
        if titulo.startswith("Modelo y Tipo"):
            continue  # el encabezado, repetido una vez por página

        if not crudo:
            if not titulo:
                continue
            # Sin código: o es la marca (un título sin números: "CATERPILLAR")
            # o es la segunda línea del modelo de arriba ("NT300-NT310-NT335"),
            # que le pertenece al bloque que se está leyendo.
            if re.search(r"\d", titulo):
                sumar_al_bloque(titulo)
            else:
                marca_vehiculo, modelo, bloque = titulo, "", []
            continue

        try:
            codigo = str(int(float(crudo)))
        except ValueError:
            continue

        tipo_val = tipo(celda(fila, 4))
        if titulo:
            # El asiento de escape de un motor va debajo del de admisión y
            # comparte el bloque de modelos, que el catálogo sigue escribiendo
            # en la fila de abajo ("697N-180NC-300PC" debajo de "MOT.8210
            # 02-619N1-691-693T"). Cuando el de escape trae texto propio es la
            # continuación del de admisión —lo es en 26 de las 27 filas donde
            # pasa, y en la que queda son dos modelos de la misma marca— y no
            # un motor nuevo.
            if tipo_val == "E" and bloque and bloque[-1]["tipo"] == "A":
                sumar_al_bloque(titulo)
            else:
                modelo, bloque = titulo, []

        actual = ficha(
            codigo_fab=codigo,
            marca="RYC",
            aplicacion=juntar(marca_vehiculo, modelo),
            tipo_val=tipo_val,
            diam_ext=numero(celda(fila, 5)),
            diam_int=numero(celda(fila, 6)),
            altura=numero(celda(fila, 7)),
            angulo_val=angulo(celda(fila, 8)),
            cant_juego=None,  # RYC no la publica
            nro_original=texto(celda(fila, 2)),
            base_crac=mapa.get(codigo, ""),
        )
        fichas.append(actual)
        bloque.append(actual)
    return fichas


# ── Salida ───────────────────────────────────────────────────────────────────
def main() -> int:
    global PROVEEDOR
    PROVEEDOR = indice_proveedor()
    print(f"  {len(PROVEEDOR)} códigos base de asientos en la lista del proveedor")

    fichas = []
    for nombre, leer_catalogo in (("Indy", indy), ("Nubo", nubo), ("RYC", ryc)):
        parcial = leer_catalogo()
        con_crac = sum(1 for f in parcial if f["codigos_crac"])
        print(f"  {nombre}: {len(parcial)} asientos, {con_crac} en la lista del proveedor")
        fichas.extend(parcial)

    sin_medidas = [f["codigo_fab"] for f in fichas if not any(f["medidas"].values())]
    if sin_medidas:
        print(f"  ⚠ {len(sin_medidas)} sin ninguna medida cargada: {', '.join(sin_medidas[:8])}…")

    with open(SALIDA, "w", encoding="utf-8") as f:
        json.dump(fichas, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"  → {SALIDA} ({len(fichas)} fichas)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
