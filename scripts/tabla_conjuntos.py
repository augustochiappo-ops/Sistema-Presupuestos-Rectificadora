#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
La tabla de los conjuntos, completa, para verificar contra el catálogo.

    python3 scripts/tabla_conjuntos.py                      # a conjuntos.csv
    python3 scripts/tabla_conjuntos.py --salida /tmp/x.csv
    python3 scripts/tabla_conjuntos.py --sin-verificar      # solo las pendientes

Esta es **la tabla definitiva**: cada tanda nueva de códigos que se cargue se
entrega así, con estas mismas columnas, ni una menos. Lo pidió el dueño el
2026-09-04 después de verificar las primeras 67, y la razón es simple: verificar
contra el catálogo se hace de una sentada, con la tabla al lado del PDF, y una
tabla a la que le falta una columna obliga a volver al JSON.

El CSV sale con `;` y en UTF-8 con BOM, que es como lo abre Excel sin pelear, y
con dos columnas vacías al final —"OK / corregir" y "Notas"— para marcar
mientras se verifica.
"""
import argparse
import csv
import io
import json
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONJUNTOS = os.path.join(RAIZ, "CRAC", "tecnicos", "conjuntos.json")


def texto(v):
    if v is None:
        return ""
    if isinstance(v, bool):
        return "si" if v else "no"
    if isinstance(v, list):
        return " / ".join(str(i) for i in v)
    if isinstance(v, float):
        return f"{v}".replace(".", ",")
    return str(v)


def campo(clave):
    return lambda x: x["extra"].get(clave)


def medida(clave):
    return lambda x: x["medidas"].get(clave)


COLUMNAS = [
    ("Código proveedor", lambda x: x["codigo"]),
    ("Cód. Mahle (prov.)", lambda x: x["codigo_fab"]),
    ("Cód. en el catálogo", campo("codigo_catalogo")),
    ("Catálogo", campo("catalogo")),
    ("Pág. PDF", campo("pagina_catalogo")),
    ("Verificado", campo("verificado")),
    ("Sale de", campo("ficha_de")),
    ("Descripción proveedor", lambda x: x["descripcion"]),
    ("Motor (catálogo)", campo("motor")),
    ("Aplicación", lambda x: x.get("aplicacion")),
    ("Fabricante", campo("fabricante")),
    ("Nº cil.", campo("nro_cil")),
    ("Ø pistón", medida("diam_piston")),
    # El segundo número de la celda del catálogo es la CARRERA, no otro
    # diámetro. Se leyó como "Ø cilindro" hasta que el dueño lo corrigió
    # (2026-09-04): en K01050, "94,40 / 100,00" es Ø 94,40 y carrera 100,00.
    ("Carrera", campo("carrera")),
    ("KH alt. compresión", campo("alt_compresion")),
    ("GL alt. total", medida("alt_piston")),
    ("Prof. rebaje válv.", campo("prof_rebaje")),
    ("Ø perno", medida("diam_perno")),
    ("Largo perno", campo("largo_perno")),
    ("Perno", campo("perno_str")),
    ("Tipo perno", campo("tipo_perno")),
    ("Juego montaje", campo("juego_montaje")),
    ("Sobremedidas", campo("diams_dispon")),
    ("Cód. aros", campo("codigo_aros")),
    # El código de arriba de la celda de aros es el de Metal Leve (la marca de
    # Mahle en Brasil). Se llamó "tolerancia" por error hasta el 2026-09-04.
    ("Cód. Metal Leve", campo("codigo_metal_leve")),
    ("Aros Clevite", campo("codigo_aros_clevite")),
    ("Aros original", campo("codigo_aros_oem")),
    ("Medida de aros", campo("medida_aros")),
    ("Cód. camisa", campo("codigo_camisa")),
    ("Camisa Clevite", campo("codigo_camisa_clevite")),
    ("Camisa original", campo("codigo_camisa_oem")),
    ("Tipo camisa", campo("tipo_camisa")),
    ("Dimensiones camisa", campo("dim_camisa")),
    ("Cód. conjunto (E)", campo("codigo_conjunto")),
    ("Conjunto Clevite", campo("codigo_conjunto_clevite")),
    ("Conjunto original", campo("codigo_conjunto_oem")),
    ("Cód. subconjunto (S)", campo("codigo_subconjunto")),
    ("Kit Clevite", campo("codigo_kit_clevite")),
    ("Kit original", campo("codigo_kit_oem")),
    ("Oring", campo("oring")),
    ("A revisar", lambda x: "; ".join(f"{k}: {v}" for k, v in (x["extra"].get("revisar") or {}).items())),
]


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--salida", default=os.path.join(RAIZ, "conjuntos.csv"))
    ap.add_argument("--sin-verificar", action="store_true",
                    help="solo las fichas que todavía nadie cruzó contra el catálogo")
    args = ap.parse_args()

    with io.open(CONJUNTOS, encoding="utf-8") as fh:
        fichas = [x for x in json.load(fh) if x["medidas"]]
    if args.sin_verificar:
        fichas = [x for x in fichas if not x["extra"].get("verificado")]
    # Primero lo que falta verificar, agrupado por catálogo: así la tanda nueva
    # queda arriba y no hay que buscarla entre lo ya revisado.
    fichas.sort(key=lambda x: (x["extra"].get("verificado", False),
                               x["extra"].get("catalogo") or "zz", x["codigo"]))

    with io.open(args.salida, "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh, delimiter=";")
        w.writerow([c for c, _ in COLUMNAS] + ["OK / corregir", "Notas"])
        for x in fichas:
            w.writerow([texto(f(x)) for _, f in COLUMNAS] + ["", ""])

    print(f"✓ {len(fichas)} fichas → {args.salida}")
    print(f"  {len(COLUMNAS)} columnas, separador ';', UTF-8 con BOM (Excel lo abre directo)")


if __name__ == "__main__":
    raise SystemExit(main())
