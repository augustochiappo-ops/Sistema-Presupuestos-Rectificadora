#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Arma las fichas de Federal Mogul de pistones, subconjuntos y conjuntos.

    python3 scripts/leer_pistones_fm2010.py          # primero: leer el catálogo
    python3 scripts/pistones_fm_desde_proveedor.py   # después: volcar las fichas

MEZCLA DOS FUENTES QUE SE MUEVEN A DISTINTO RITMO, igual que
`conjuntos_desde_proveedor.py`:

  * de la LISTA DEL PROVEEDOR (`CRAC/precio-stock.csv`) salen el código, la
    descripción y qué sobremedidas existen. Cambian todos los días.
  * del CATÁLOGO FEDERAL MOGUL 2010 (lo que dejó `leer_pistones_fm2010.py`)
    salen las medidas, los aros, el perno y para qué motor es. Se cargan una vez.

Correrlo dos veces no pisa trabajo hecho: lo que ya estaba verificado a mano se
conserva (`extra.verificado`), y una ficha que el proveedor dejó de traer se
avisa pero no se borra sola.

QUÉ FICHAS ENTRAN. Sólo las de los códigos que el proveedor VENDE (decisión del
dueño, 2026-09-07). El catálogo trae 293 códigos y el proveedor tiene 182: los
otros 111 son mayormente de la línea europea, con el formato "87-704500-00", que
por acá no se consigue. Cargarlos habría llenado la pantalla de fichas sin
precio que no se pueden pedir.

CÓMO SE CRUZA UN CÓDIGO CON EL OTRO. El número es el mismo y lo que cambia es el
envoltorio:

    P39493  → "P F 39493  STD" / "P F 39493  030" / "P F 39493  040"
    SC79793 → "S F 79793  STD" / "S F 79793  065"
    K10073  → "T F K10073"

La medida va al final del código del proveedor, pero NO siempre separada por un
espacio: hay 1.822 códigos en la lista que la traen pegada ("S F 75297BC0.5").
Por eso el cruce no parte el código del proveedor en dos: busca los que EMPIECEN
con el número del catálogo y comprueba que lo que sobra sea una medida válida
—vacío, "STD", "030" o "0.5"—. Partirlo primero dejaba afuera esas 1.822.
"""
import argparse
import csv
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROVEEDOR = os.path.join(RAIZ, "CRAC", "precio-stock.csv")
TECNICOS = os.path.join(RAIZ, "CRAC", "tecnicos")
CATALOGO = "/tmp/fm2010.json"

MARCA = "FEDERAL MOGUL"

# Qué categoría de la lista del proveedor le toca a cada familia, y cómo se
# escribe el número del catálogo dentro del código del proveedor. El conjunto es
# el único que se lleva la "K" puesta: "K10073" → "T F K10073".
FAMILIAS = {
    "pistones": {"cat": "P", "prefijo_num": ""},
    "subconjuntos": {"cat": "S", "prefijo_num": ""},
    "conjuntos": {"cat": "T", "prefijo_num": "K"},
}

# Lo que puede quedar después del número: nada, "STD", una sobremedida en
# milésimas de pulgada ("030") o en milímetros ("0.5", "1,00").
RE_MEDIDA = re.compile(r"^(|STD|\d{2,3}|\d[.,]\d+)$", re.IGNORECASE)


def coma(valor, decimales=2):
    """2.5 → "2,50". Los números de las fichas se escriben como los lee el taller."""
    if valor is None:
        return None
    return f"{valor:.{decimales}f}".replace(".", ",")


def del_proveedor():
    """
    La lista del proveedor, por categoría: {cat: [(resto_sin_espacios, código, descripción)]}.

    Se lee con el módulo `csv` y no con una expresión regular a propósito: el
    archivo escapa las comillas duplicándolas y hay descripciones con medidas en
    pulgadas ('FORD FALCON 188-221 B/C 3.680""'). Partido a mano, ese código
    quedaba con la comilla doble metida en la ficha.
    """
    filas = {c["cat"]: [] for c in FAMILIAS.values()}
    with open(PROVEEDOR, encoding="latin-1", newline="") as f:
        for campos in csv.reader(f, delimiter=";", quotechar='"'):
            if len(campos) < 2:
                continue
            codigo, descripcion = campos[0], campos[1]
            d = re.match(r"^([SPT])\s+(FM?)\s*(.+)$", codigo)
            if not d or d.group(1) not in filas:
                continue
            filas[d.group(1)].append((d.group(3).replace(" ", ""), codigo, descripcion))
    return filas


def buscar(lista, numero):
    """
    Los códigos del proveedor de este número del catálogo.

    Se compara por PREFIJO y se valida la cola (ver el encabezado): así entran
    tanto "S F 79793  STD" como "S F 75297BC0.5", que tiene la medida pegada.
    """
    salida = []
    for resto, codigo, descripcion in lista:
        if not resto.startswith(numero):
            continue
        cola = resto[len(numero):]
        if RE_MEDIDA.match(cola):
            salida.append((codigo, descripcion, cola or None))
    return sorted(salida)


def extra_de(fila, medidas):
    """
    Lo que se muestra al lado de las medidas.

    Los nombres son los que ya usan las otras fichas —`alt_compresion`,
    `perno_str`, `medidas_dispon`— para que la pantalla no tenga que saber de
    qué catálogo salió cada una.
    """
    aros = " / ".join(coma(a) for a in fila["aros"]) or None
    perno = None
    if fila["diam_perno"] and fila["largo_perno"]:
        perno = f"∅{coma(fila['diam_perno'])} × {coma(fila['largo_perno'])}"
    dispon = " / ".join(m for m in medidas if m) or None
    return {
        "fabricante": fila.get("titulo"),
        "motor": fila.get("motor"),
        "nro_cil": fila.get("nro_cil"),
        "combustible": fila.get("combustible"),
        "cilindrada": fila.get("cilindrada"),
        "r_compresion": fila.get("r_compresion"),
        "anios": fila.get("anios"),
        "alt_compresion": fila.get("alt_compresion"),
        # La cabeza del pistón: el diámetro de la cámara y su profundidad, que es
        # negativa cuando es un rebaje. Los mismos nombres que en las fichas de
        # Persan, que traen lo mismo.
        "cam_diam": fila.get("cam_diam"),
        "cam_prof": fila.get("cam_prof"),
        "aros": aros,
        "largo_perno": fila.get("largo_perno"),
        "perno_str": perno,
        "huelgo": fila.get("huelgo"),
        "alt_medicion": fila.get("alt_medicion"),
        "posicion_block": fila.get("posicion_block"),
        # Las dos familias que se piden por sobremedida usan cada una su nombre
        # en la pantalla: `diams_dispon` en subconjuntos y conjuntos,
        # `medidas_dispon` en pistones. Se escriben las dos y cada tabla lee la
        # suya, que es más barato que tocar las tres tablas.
        "diams_dispon": dispon,
        "medidas_dispon": dispon,
        "codigo_aros": None,
        # Un conjunto de Mahle avisa con el sufijo "WS" si trae los orings de
        # camisa. Federal Mogul no usa esa marca, así que acá no se sabe: va en
        # blanco y no en "no", que sería afirmar algo que el catálogo no dice.
        "oring": None,
        "pagina": fila.get("pagina"),
        # Una ficha nueva no está verificada hasta que el dueño la mire contra el
        # PDF. Lo dice la columna "Verif." de la pantalla.
        "verificado": False,
    }


def armar(catalogo, proveedor):
    """Las fichas nuevas por familia, y los códigos del catálogo que nadie vende."""
    fichas = {f: {} for f in FAMILIAS}
    sin_proveedor = []
    for fila in catalogo:
        for cod in fila["codigos"]:
            familia = cod["familia"]
            spec = FAMILIAS[familia]
            numero = spec["prefijo_num"] + cod["numero"]
            encontrados = buscar(proveedor[spec["cat"]], numero)
            if not encontrados:
                sin_proveedor.append(cod["codigo"])
                continue

            codigo = f"{spec['cat']} F {numero}"
            medidas = [m for _, _, m in encontrados]
            ficha = {
                "codigo": codigo,
                # El código como lo escribe el catálogo: es el que se busca en el
                # PDF cuando hay que verificar la ficha.
                "codigo_fab": cod["codigo"],
                "marca": MARCA,
                # Los vehículos de la columna 1; si la fila no los trae —pasa
                # con los motores industriales— vale el título del bloque, que
                # es lo que se lee en la página ("FORD TRANSIT - MOTOR 2.5
                # DIESEL"). Dejarla vacía sacaba la ficha del filtro por motor.
                "aplicacion": fila.get("aplicacion") or fila.get("titulo"),
                "descripcion": encontrados[0][1],
                "medidas": {k: fila[k] for k in ("diam_piston", "alt_piston", "diam_perno")
                            if fila.get(k) is not None},
                "extra": extra_de(fila, medidas),
                "codigos_crac": [{"codigo": c, "medida": m} for c, _, m in encontrados],
            }
            fichas[familia][codigo] = ficha
    return fichas, sorted(set(sin_proveedor))


def fusionar(previas, nuevas):
    """
    Las fichas viejas con las nuevas encima, sin pisar lo verificado a mano.

    La lista de fichas NO se puede indexar por código: `subconjuntos.json` tiene
    nueve códigos repetidos a propósito —"S BE 48520" son tres fichas, tres
    variantes de motor del mismo código— y un diccionario se habría comido dos
    de cada tres sin decir nada. Se recorre la lista y se reemplaza en el lugar.

    Una ficha que el dueño ya miró (`extra.verificado`) conserva sus medidas: si
    corrigió un número contra el PDF, la próxima corrida del extractor no se lo
    puede llevar puesto. Lo que sí se refresca siempre es lo del proveedor.
    """
    salida = list(previas)
    donde = {}
    for i, ficha in enumerate(salida):
        if (ficha.get("marca") or "") == MARCA:
            donde.setdefault(ficha["codigo"], i)

    agregadas, refrescadas = [], []
    for codigo, ficha in nuevas.items():
        i = donde.get(codigo)
        if i is None:
            salida.append(ficha)
            agregadas.append(codigo)
            continue
        vieja = salida[i]
        if (vieja.get("extra") or {}).get("verificado"):
            vieja["descripcion"] = ficha["descripcion"]
            vieja["codigos_crac"] = ficha["codigos_crac"]
        else:
            salida[i] = ficha
        refrescadas.append(codigo)
    return salida, agregadas, refrescadas


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--catalogo", default=CATALOGO,
                    help="el JSON que deja leer_pistones_fm2010.py")
    ap.add_argument("--simular", action="store_true",
                    help="contar sin escribir los .json")
    args = ap.parse_args()

    if not os.path.exists(args.catalogo):
        sys.exit(f"Falta {args.catalogo}. Corré antes: "
                 f"python3 scripts/leer_pistones_fm2010.py")

    catalogo = json.load(open(args.catalogo, encoding="utf-8"))
    proveedor = del_proveedor()
    nuevas, sin_proveedor = armar(catalogo, proveedor)

    for familia in FAMILIAS:
        destino = os.path.join(TECNICOS, f"{familia}.json")
        previas = json.load(open(destino, encoding="utf-8")) if os.path.exists(destino) else []
        fichas, agregadas, refrescadas = fusionar(previas, nuevas[familia])
        # Las viejas quedan en su orden y las nuevas se agregan al final. Es a
        # propósito: reordenar el archivo entero para meter 83 fichas convierte
        # un diff de 83 fichas en uno de 284 y no se puede revisar.
        orden = fichas
        if not args.simular:
            with open(destino, "w", encoding="utf-8") as f:
                json.dump(orden, f, ensure_ascii=False, indent=1)
                f.write("\n")
        print(f"{familia:14s} {len(orden):4d} fichas  "
              f"(+{len(agregadas)} nuevas de Federal Mogul)")

    print(f"\n{len(sin_proveedor)} códigos del catálogo sin código en la lista del "
          f"proveedor: no se cargan.")
    if args.simular:
        print("(--simular: no se escribió nada)")


if __name__ == "__main__":
    main()
