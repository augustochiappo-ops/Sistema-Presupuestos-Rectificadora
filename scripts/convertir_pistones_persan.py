#!/usr/bin/env python3
"""
Convierte el TXT de pistones Persan × CRAC al JSON que lee el buscador por
medidas.

    python3 scripts/convertir_pistones_persan.py

Se corre A MANO, cuando se procesa una tanda nueva del catálogo Persan (la
skill `datos-persan` genera el TXT). La salida (CRAC/tecnicos/pistones.json) se
commitea: es lo que hace que producción tenga los datos apenas hace `git pull`,
igual que las otras tres familias (ver scripts/convertir_tecnicos.js).

Dos cosas que este script resuelve y por eso existe:

1. EL CÓDIGO DEL PROVEEDOR. En la lista del proveedor el código y la
   sobremedida comparten un campo de ancho fijo (14), así que el separador se
   come los espacios y a veces un dígito: "P PS082PH  0.6" pero también
   "P PS140PH/1STD" y "P PS136PH/10.4" (ese ".4" es un "0.4" recortado). Sin
   resolverlo acá no matchea ni el precio ni el stock. Las sobremedidas salen
   de la lista del proveedor —no del TXT— porque la lista es la que está viva:
   el TXT es una foto del día que se procesó el catálogo y ya viene corta
   (PS082PH: el TXT dice STD y 0.6, la lista tiene además 1.0 y 1.5).

2. LOS DATOS QUE NO SE PUEDEN CREER. El TXT sale de leer tablas de un PDF y
   algunas filas salieron corridas de columna. Esos campos NO se cargan con lo
   que dice el TXT ni se cargan como "vacío": van a `extra.revisar`, que la
   pantalla muestra como "?" — un dato que falta y un dato que hay que
   verificar no son lo mismo, y un pistón con el Ø equivocado en el buscador es
   peor que un pistón sin Ø.

NO se copia ningún precio: el precio y el stock los pone la base local, que se
actualiza todos los días con el Excel del proveedor.
"""
import csv
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TXT = os.path.join(RAIZ, "CRAC", "tecnicos", "fuentes", "persan_pistones.txt")
CSV_PROVEEDOR = os.path.join(RAIZ, "CRAC", "precio-stock.csv")
SALIDA = os.path.join(RAIZ, "CRAC", "tecnicos", "pistones.json")


# ── El TXT ───────────────────────────────────────────────────────────────────
def leer_tabla(path: str) -> list[dict]:
    """
    Las filas de la tabla pipe del TXT. Una fila puede ocupar varias líneas
    (las celdas con varios valores, como CILINDROS "4\\n6"), y lo que las
    separa son las líneas de "+---+---+": se junta todo lo que hay entre dos
    separadores y recién ahí se parte por "|".
    """
    bloques: list[list[str]] = []
    buffer: list[str] = []
    with open(path, encoding="utf-8") as f:
        for linea in f:
            linea = linea.rstrip("\n")
            if linea.startswith("+--"):
                if buffer:
                    bloques.append(buffer)
                    buffer = []
                continue
            if linea.startswith("|") or (buffer and linea.strip()):
                buffer.append(linea)
    if buffer:
        bloques.append(buffer)

    if not bloques:
        raise SystemExit(f"No se encontró ninguna tabla en {path}")

    def celdas(bloque):
        return [c.strip() for c in " ".join(bloque).strip().strip("|").split("|")]

    cabecera = celdas(bloques[0])
    filas = []
    for bloque in bloques[1:]:
        valores = celdas(bloque)
        if len(valores) != len(cabecera):
            raise SystemExit(f"Fila con {len(valores)} celdas y no {len(cabecera)}: {valores[:3]}")
        filas.append(dict(zip(cabecera, valores)))
    return filas


def numero(valor: str):
    """"- 4,50" → -4.5. Vacío o ilegible → None."""
    if not valor:
        return None
    limpio = valor.replace(" ", "").replace(",", ".")
    try:
        return float(limpio)
    except ValueError:
        return None


def texto(valor: str) -> str | None:
    return valor.strip() or None


# ── La lista del proveedor ───────────────────────────────────────────────────
# Lo que puede venir pegado al código como sobremedida: "STD", "0.6", "030" y
# los recortes por ancho de campo (".4" es "0.4" al que se le comió el 0).
MEDIDA_RE = re.compile(r"^(STD|\d*\.\d+|\d{2,3})$")


def sin_espacios(codigo: str) -> str:
    return codigo.replace(" ", "").upper()


def indice_proveedor() -> list[tuple[str, str]]:
    """(código sin espacios, código tal cual) de todos los pistones de la lista."""
    codigos = []
    with open(CSV_PROVEEDOR, encoding="latin-1") as f:
        for fila in csv.reader(f, delimiter=";"):
            if fila and fila[0].startswith("P PS"):
                codigos.append((sin_espacios(fila[0]), fila[0]))
    return codigos


def codigos_crac(base: str, indice) -> list[dict]:
    """
    Los códigos del proveedor de este pistón, uno por sobremedida. Se matchea
    por prefijo y se exige que lo que sobra sea una sobremedida válida: sin eso,
    la base "P PS161C" se llevaría puesto al "P PS161C /10.4", que es otro
    producto.
    """
    clave = sin_espacios(base)
    encontrados = []
    for normalizado, crudo in indice:
        if not normalizado.startswith(clave):
            continue
        resto = normalizado[len(clave):]
        if not MEDIDA_RE.match(resto):
            continue
        medida = f"0{resto}" if resto.startswith(".") else resto
        encontrados.append({"codigo": crudo, "medida": medida})
    # STD primero y después por número: es el orden en que las mira el taller.
    encontrados.sort(key=lambda c: (c["medida"] != "STD", c["medida"]))
    return encontrados


# ── Conversión ───────────────────────────────────────────────────────────────
def ficha(fila: dict, indice) -> dict:
    revisar: dict[str, str] = {}

    def dudoso(campos: list[str], motivo: str):
        for campo in campos:
            revisar[campo] = motivo

    diam = numero(fila["DIÁM. CIL. (mm)"])
    alt_comp = numero(fila["ALT. COMP. (mm)"])
    largo = numero(fila["LARGO TOT. (mm)"])
    perno_d = numero(fila["PERNO D. (mm)"])
    perno_l = numero(fila["PERNO L. (mm)"])

    # Fila entera sin datos técnicos: el número de pistón no apareció en el
    # catálogo. Se carga igual —el código y la descripción del proveedor son
    # datos buenos— pero las medidas quedan para verificar.
    tecnicos = [fila[c] for c in fila if c not in ("CÓDIGO CRAC", "DESCRIPCIÓN CRAC", "MEDIDAS CRAC")]
    if not any(v.strip() for v in tecnicos):
        dudoso(
            ["diam_piston", "alt_piston", "diam_perno", "perno_str", "nro_cil",
             "alt_compresion", "aros", "medidas_dispon"],
            "sin datos en el catálogo Persan",
        )
        diam = alt_comp = largo = perno_d = perno_l = None

    # Fila corrida de columna: el Ø terminó en ALT. COMP. y el perno en AROS.
    # Se detecta porque no hay Ø pero sí hay altura de compresión.
    elif diam is None and alt_comp is not None:
        dudoso(
            ["diam_piston", "alt_piston", "diam_perno", "perno_str", "alt_compresion",
             "camara", "aros", "huelgo", "medidas_dispon"],
            "columnas corridas en el TXT de origen",
        )
        alt_comp = largo = perno_d = perno_l = None

    # El largo total tiene que ser un número positivo y mayor que la altura de
    # compresión: cuando no lo es, la celda del PDF se leyó mal (queda vacía, o
    # negativa, o con el "+ó-" adentro) y el dato no sirve para filtrar.
    if "alt_piston" not in revisar and (largo is None or largo <= 0 or (alt_comp and largo < alt_comp)):
        largo = None
        revisar["alt_piston"] = "el largo total del TXT no es creíble"

    perno_str = None
    if perno_d and perno_l:
        perno_str = f"∅{fila['PERNO D. (mm)']} × {fila['PERNO L. (mm)']}"

    base = fila["CÓDIGO CRAC"].strip()
    return {
        "codigo": base,
        "codigo_fab": texto(fila["Nº PISTÓN"]),
        "marca": texto(fila["MARCA"]),
        "aplicacion": texto(fila["APLICACIÓN"]),
        "descripcion": texto(fila["DESCRIPCIÓN CRAC"]),
        "medidas": {
            "diam_piston": diam,
            "alt_piston": largo,
            "diam_perno": perno_d,
        },
        "extra": {
            "motor": texto(fila["MOTOR"]),
            "cilindrada": texto(fila["CILINDRADA"]),
            "r_compresion": texto(fila["R. COMPRESIÓN"]),
            "nro_cil": texto(fila["CILINDROS"]),
            "caracteristicas": texto(fila["CARACTERÍSTICAS"]),
            "alt_compresion": alt_comp,
            "cam_diam": texto(fila["CÁM. DIÁM. (mm)"]) if "camara" not in revisar else None,
            "cam_prof": texto(fila["CÁM. PROF. (mm)"]) if "camara" not in revisar else None,
            "largo_perno": perno_l,
            "perno_str": perno_str,
            "hermanado": texto(fila["HERMANADO"]) if perno_str else None,
            "aros": texto(fila["AROS (mm)"]) if "aros" not in revisar else None,
            "huelgo": numero(fila["HUELGO (mm)"]) if "huelgo" not in revisar else None,
            "alt_medicion": numero(fila["ALT. MEDIC. (mm)"]) if "huelgo" not in revisar else None,
            "medidas_dispon": texto(fila["MEDIDAS DISP."]) if "medidas_dispon" not in revisar else None,
            "revisar": revisar or None,
        },
        "codigos_crac": codigos_crac(base, indice),
    }


def main():
    filas = leer_tabla(TXT)
    indice = indice_proveedor()
    fichas = [ficha(f, indice) for f in filas]

    with open(SALIDA, "w", encoding="utf-8") as f:
        json.dump(fichas, f, ensure_ascii=False, indent=1)
        f.write("\n")

    sin_codigo = [f["codigo"] for f in fichas if not f["codigos_crac"]]
    a_revisar = [f["codigo"] for f in fichas if (f["extra"] or {}).get("revisar")]
    print(f"✓ {len(fichas)} pistones → {os.path.relpath(SALIDA, RAIZ)}")
    print(f"  {sum(len(f['codigos_crac']) for f in fichas)} códigos del proveedor cruzados")
    if sin_codigo:
        print(f"  ⚠ sin código en la lista del proveedor ({len(sin_codigo)}): {', '.join(sin_codigo)}")
    if a_revisar:
        print(f"  ⚠ con datos a verificar ({len(a_revisar)}): {', '.join(a_revisar)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
