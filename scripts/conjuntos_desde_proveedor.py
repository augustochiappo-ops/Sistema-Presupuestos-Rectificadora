#!/usr/bin/env python3
"""
Arma las fichas de CONJUNTOS a partir de la lista del proveedor.

    python3 scripts/conjuntos_desde_proveedor.py                  # crea y refresca
    python3 scripts/conjuntos_desde_proveedor.py --desde-subconjuntos

Un conjunto es el JUEGO COMPLETO del motor: los pistones de todos los cilindros
con sus aros y pernos. En la lista del proveedor son los códigos "T BEK…" —
categoría T (Conjuntos), marca BE (Mahle) y después el código de kit del
catálogo, "K21540"—. Son 128 y no están en ningún catálogo técnico que podamos
convertir, así que la ficha ARRANCA por la lista del proveedor y las medidas se
completan después, leyéndolas del catálogo de Mahle.

POR QUÉ UN SCRIPT Y NO EDITAR EL JSON A MANO. Porque hay dos fuentes y se
mueven a distinto ritmo: el código, la descripción y el precio son del
proveedor y cambian todos los días; las medidas y el dibujo son del catálogo de
Mahle y se cargan una vez. Este script MEZCLA: refresca lo del proveedor y no
toca nada de lo que ya se cargó del catálogo. Correrlo dos veces no pisa
trabajo hecho.

`--desde-subconjuntos` rellena las medidas de los conjuntos cuyo número ya
tiene ficha de subconjunto: son el mismo pistón ("T BEK21540" y "S BE21540"
salen de la misma fila del catálogo), así que el dato ya está y no hace falta
volver a leerlo. Solo completa fichas vacías: nunca pisa una medida cargada.
"""
import argparse
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROVEEDOR = os.path.join(RAIZ, "CRAC", "precio-stock.csv")
CONJUNTOS = os.path.join(RAIZ, "CRAC", "tecnicos", "conjuntos.json")
SUBCONJUNTOS = os.path.join(RAIZ, "CRAC", "tecnicos", "subconjuntos.json")

# "T BEK21540" → categoría T (Conjuntos) + marca BE (Mahle) + código de kit.
PREFIJO = "T BE"


def numero(codigo):
    """El número del código, que es lo que comparten el conjunto y el subconjunto."""
    m = re.search(r"(\d+)", codigo)
    return int(m.group(1)) if m else None


def del_proveedor():
    """Los conjuntos Mahle de la lista del proveedor: [(código, descripción)]."""
    filas = []
    with open(PROVEEDOR, encoding="latin-1") as f:
        for linea in f:
            m = re.match(r'^"([^"]*)";"(.*)";([^;]*);"(si|no)"\s*$', linea.strip())
            if m and m.group(1).startswith(PREFIJO):
                filas.append((m.group(1), m.group(2)))
    return sorted(filas)


def leer(path):
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def escribir(fichas):
    with open(CONJUNTOS, "w", encoding="utf-8") as f:
        json.dump(fichas, f, ensure_ascii=False, indent=1)
        f.write("\n")


def refrescar():
    """
    Deja una ficha por código del proveedor. Lo que ya estaba cargado del
    catálogo (aplicación, medidas, extra) se conserva tal cual.
    """
    previas = {ficha["codigo"]: ficha for ficha in leer(CONJUNTOS)}
    fichas, nuevas = [], []
    for codigo, descripcion in del_proveedor():
        ficha = previas.pop(codigo, None)
        if ficha is None:
            nuevas.append(codigo)
            ficha = {"aplicacion": None, "medidas": {}, "extra": {}}
        ficha.update({
            "codigo": codigo,
            # El código como lo escribe el catálogo de Mahle: sin la categoría
            # ni la marca del proveedor. Es el que se busca en el PDF.
            "codigo_fab": codigo[len(PREFIJO):].strip(),
            "marca": "MAHLE",
            "descripcion": descripcion,
            # Un conjunto tiene UN código y un precio: no se pide por
            # sobremedida como el subconjunto, así que la medida va vacía y la
            # pantalla no muestra la columna "Precio de".
            "codigos_crac": [{"codigo": codigo, "medida": None}],
        })
        fichas.append({k: ficha[k] for k in
                       ("codigo", "codigo_fab", "marca", "aplicacion",
                        "descripcion", "medidas", "extra", "codigos_crac")})
    return fichas, nuevas, sorted(previas)


def desde_subconjuntos(fichas):
    """
    Completa las medidas de los conjuntos que comparten número con un
    subconjunto ya cargado: es el mismo pistón, leído de la misma fila del
    catálogo. Solo toca las fichas que todavía no tienen medidas.
    """
    subs = {numero(s["codigo"]): s for s in leer(SUBCONJUNTOS)}
    completadas = []
    for ficha in fichas:
        if ficha["medidas"]:
            continue
        sub = subs.get(numero(ficha["codigo"]))
        if not sub:
            continue
        ficha["aplicacion"] = sub.get("aplicacion")
        ficha["medidas"] = dict(sub.get("medidas") or {})
        ficha["extra"] = dict(sub.get("extra") or {})
        # De dónde salió el dato, para no confundirlo con uno leído del
        # catálogo para este conjunto: es la ficha del subconjunto del mismo
        # número, que es el mismo pistón.
        ficha["extra"]["ficha_de"] = sub["codigo"]
        completadas.append(f'{ficha["codigo"]} ← {sub["codigo"]}')
    return completadas


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--desde-subconjuntos", action="store_true",
                        help="completa las medidas con la ficha del subconjunto del mismo número")
    args = parser.parse_args()

    fichas, nuevas, sobrantes = refrescar()
    completadas = desde_subconjuntos(fichas) if args.desde_subconjuntos else []
    escribir(fichas)

    con_medidas = sum(1 for f in fichas if f["medidas"])
    print(f"✓ {len(fichas)} conjuntos → {os.path.relpath(CONJUNTOS, RAIZ)}")
    print(f"  {con_medidas} con medidas cargadas, {len(fichas) - con_medidas} esperando el catálogo")
    if nuevas:
        print(f"  + {len(nuevas)} nuevos: {', '.join(nuevas[:8])}{' …' if len(nuevas) > 8 else ''}")
    for c in completadas:
        print(f"  ↳ medidas tomadas del subconjunto: {c}")
    for c in sobrantes:
        # Un conjunto que estaba en el JSON y ya no está en la lista del
        # proveedor: se fue con su ficha. Se avisa porque puede ser que el
        # proveedor lo haya dado de baja o que la lista del día viniera corta.
        print(f"  ⚠ {c}: ya no está en la lista del proveedor, se sacó")
    return 0


if __name__ == "__main__":
    sys.exit(main())
