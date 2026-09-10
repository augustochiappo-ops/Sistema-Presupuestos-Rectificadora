#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Lee el catálogo Persan Edición 16 (enero 2026) y deja el TXT de pistones que
convierte `scripts/convertir_pistones_persan.py`.

    python3 scripts/leer_pistones_persan.py                  # reescribe el TXT del repo
    python3 scripts/leer_pistones_persan.py --salida x.txt
    python3 scripts/leer_pistones_persan.py --pagina 51      # mirar una sola, sin escribir

EL PDF NO ESTÁ EN EL REPO. Pesa 51 MB y el repo entero se copia a
PythonAnywhere en cada deploy, así que vive en el release `catalogos` de GitHub
(mismo criterio que el catálogo de Glyco, ver CRAC/tecnicos/CARGA-COJINETES.md).
Se baja una vez y queda en `CRAC/tecnicos/fuentes/`, que ya lo ignora el
`.gitignore`:

    curl -sSL -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/octet-stream" \
      -o CRAC/tecnicos/fuentes/persan_2026_ed16.pdf \
      "$(curl -sS -H "Authorization: Bearer $GITHUB_TOKEN" \
          https://api.github.com/repos/augustochiappo-ops/Sistema-Presupuestos-Rectificadora/releases/tags/catalogos \
          | jq -r '.assets[] | select(.name|startswith("PERSAN")) | .url')"

QUÉ MANDA: LA LISTA DEL PROVEEDOR. Los pistones son del grupo "sólo proveedor"
(ver CLAUDE.md, "Qué fichas entran al buscador por medidas"): una ficha existe
si el proveedor la vende. El TXT sale con una fila por código base de la lista
—no por registro del catálogo— y los registros del catálogo que el proveedor no
trabaja quedan afuera. Una base sin registro en el catálogo sale igual, con las
columnas técnicas vacías: el converter la carga y marca las medidas como
dudosas, porque el código y la descripción del proveedor siguen siendo datos
buenos.

CÓMO SE CRUZAN LOS DOS MUNDOS. El catálogo numera los pistones ("82") y el
proveedor los codifica ("P PS082PH"). El camino va de la lista al catálogo, que
es el fácil: de cada base se saca el número con `^P PS0*(\\d+)` y con ese número
se busca el registro. Un mismo número puede tener dos bases —`P PS161C` es la
versión de competición de `P PS161PH`— y las dos llevan los mismos datos
técnicos, que es lo que dice el catálogo.

POR QUÉ POR COORDENADAS Y NO CON TEXTO PLANO. Cada pistón ocupa cinco o seis
líneas y una lectura lineal las entrevera: la altura de compresión sale pegada
al primer aro. Cada valor se clasifica por la columna donde está DIBUJADO. Los
bordes son las líneas verticales de la tabla, que el PDF trae dibujadas y están
en el mismo x en las 186 páginas (medidos con `page.lines`):

    < 71,2   número del pistón
     71,2    aplicación: motor, cilindrada, R.C. y vehículos
    207,2    cantidad de cilindros
    235,6    figura del pistón y características
    288,0    diámetro mínimo del cilindro
    320,6    altura de compresión, "+ ó -" y largo total
    354,6    cámara de combustión
    382,9    perno (Ø y largo) y hermanado
    424,1    espesor de los aros
    452,7    huelgo pistón-cilindro y altura de medición
    496,4    medidas de fabricación

Los rótulos del encabezado NO sirven de ancla: se corren unos 11 puntos entre
página par e impar. Los datos, no.

LAS SEIS COSAS QUE NO SE VEN A SIMPLE VISTA:

1. La columna de la altura apila los valores de a TRES: altura de compresión,
   "+ ó -" y largo total. Un pistón con dos variantes de altura las apila dos
   veces (el 424 de Audi: 41,70 y 41,45). Se toma la primera terna, que es la
   que el catálogo lista como principal.
2. La columna del perno y la del hermanado comparten hueco. Se separan por
   contenido y no por posición, que ahí es de siete puntos: los números son el
   perno (arriba el Ø, abajo el largo), la letra suelta A/B/C es el hermanado y
   la "x" del medio es el separador que dibuja el catálogo, no un dato.
3. En la columna del huelgo pasa lo mismo: el primer número es el huelgo
   pistón-cilindro y el segundo la altura de medición.
4. La cantidad de cilindros son dígitos ("4", "6", "V8"). Un decimal ahí es un
   valor de otra columna que el catálogo dibujó fuera de lugar: pasa una sola
   vez en las 186 páginas, en el pistón 149 de John Deere, donde el largo total
   (121,22) está dibujado en el hueco de los cilindros y el espesor del aro
   (6,35) en el de la altura. Se realinean los dos; sin esto el 149 entra con
   un largo total de 6,35 mm contra una altura de compresión de 70,42.
5. La marca del vehículo está sólo en el encabezado de la página, no en la
   fila. Se lee de la banda de arriba (top 45-70, x 70-205) y sale limpia en
   las 186 páginas. En la 188 hay DOS marcas encimadas —TOYOTA debajo y WABCO
   arriba, que quedó de una edición anterior—: gana la que se dibuja última,
   igual que con los títulos pisados del catálogo de Federal Mogul. WABCO es
   además la que corresponde por orden alfabético (va entre VOLVO y
   WESTINGHOUSE) y por contenido: los dos pistones de esa página son de
   compresor.
6. Un mismo pistón aparece en el catálogo bajo cada marca que lo usa: el 460
   está en cinco páginas. Los datos técnicos coinciden casi siempre; cuando no,
   uno de los registros se leyó mal. Se elige el registro con más campos
   completos, penalizando los que no pasan las dos guardas de plausibilidad
   (largo total mayor que la altura de compresión, largo del perno mayor que su
   diámetro). Así el 171 entra con el perno de 62,00 mm de la página de Renault
   y no con el 2,00 de la de Dacia. La MARCA del TXT, en cambio, las lista a
   todas: es el único lugar donde se ve que el 460 sirve para cinco marcas.

NO SE COPIA NINGÚN PRECIO: el precio y el stock los pone la base local, que se
actualiza todos los días con el Excel del proveedor. Las sobremedidas tampoco
salen de acá — las pone el converter desde la lista, que es la que está viva.
"""
import argparse
import collections
import csv
import os
import re
import sys

try:
    import pdfplumber
except ImportError:
    sys.exit("Falta pdfplumber. Instalalo con: .venv/bin/pip install pdfplumber")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = os.path.join(RAIZ, "CRAC", "tecnicos", "fuentes", "persan_2026_ed16.pdf")
CSV_PROVEEDOR = os.path.join(RAIZ, "CRAC", "precio-stock.csv")
SALIDA = os.path.join(RAIZ, "CRAC", "tecnicos", "fuentes", "persan_pistones.txt")

# Bordes de columna, en puntos y absolutos (ver el encabezado). El nombre i es
# el de la columna que termina en BORDES[i].
BORDES = [71.2, 207.2, 235.6, 288.0, 320.6, 354.6, 382.9, 424.1, 452.7, 496.4]
COLUMNAS = ["nro", "texto", "cilindros", "caract", "diam", "altcomp",
            "camara", "perno", "aros", "huelgo", "medidas"]

# La banda del encabezado donde el catálogo imprime la marca del vehículo.
MARCA_TOP = (45, 70)
MARCA_X = (70, 205)
# El área de datos: arriba está el encabezado, abajo la leyenda de las
# referencias, y las dos cruzan las columnas.
DATOS_TOP = (112, 755)

NUMERO = re.compile(r"^-?\d+(?:,\d+)?$")
CILINDROS = re.compile(r"^V?\d{1,2}$")
CILINDRADA = re.compile(r"^(.*?C\.C\.)\s*[-–]\s*R\.?C\.?:?\s*(.+)$")
BASE_NUMERO = re.compile(r"^P PS0*(\d+)")


# ── El PDF ───────────────────────────────────────────────────────────────────
def _columna(x: float) -> str:
    for i, borde in enumerate(BORDES):
        if x < borde:
            return COLUMNAS[i]
    return COLUMNAS[-1]


def _es_pagina_de_tabla(palabras) -> bool:
    return any(p["text"] == "NÚMERO" and 40 < p["x0"] < 70 and 50 < p["top"] < 70
               for p in palabras)


def _marca(palabras) -> str | None:
    banda = [p for p in palabras
             if MARCA_TOP[0] < p["top"] < MARCA_TOP[1] and MARCA_X[0] < p["x0"] < MARCA_X[1]]
    if not banda:
        return None
    # Dos marcas encimadas: gana la que se dibuja última (ver el punto 5).
    ultimo = max(p["top"] for p in banda)
    if ultimo - min(p["top"] for p in banda) > 1.0:
        banda = [p for p in banda if abs(p["top"] - ultimo) < 1.0]
    return " ".join(p["text"] for p in sorted(banda, key=lambda p: p["x0"]))


def _lineas(palabras) -> list[dict]:
    """Las palabras del área de datos agrupadas por renglón y por columna."""
    utiles = [p for p in palabras
              if DATOS_TOP[0] < p["top"] < DATOS_TOP[1] and p["x0"] > 20 and p["upright"]]
    utiles.sort(key=lambda p: (p["top"], p["x0"]))
    renglones: list[list] = []
    for p in utiles:
        # El interlineado del catálogo es de 9,6 puntos; 3 separa renglones
        # distintos sin partir uno cuyas celdas no están perfectamente alineadas.
        if renglones and abs(p["top"] - renglones[-1][0]) < 3:
            renglones[-1][1].append(p)
        else:
            renglones.append([p["top"], [p]])
    salida = []
    for _, grupo in renglones:
        celdas = collections.defaultdict(list)
        for p in sorted(grupo, key=lambda p: p["x0"]):
            celdas[_columna(p["x0"])].append(p["text"])
        salida.append({k: " ".join(v) for k, v in celdas.items()})
    return salida


def _realinear(linea: dict) -> dict:
    """
    Un decimal en la columna de los cilindros es un valor de otra columna que el
    catálogo dibujó fuera de lugar (ver el punto 4). Se corre cada uno un lugar
    a la derecha: el decimal pasa a ser el de la altura, y el que estaba ahí, el
    del aro.
    """
    sueltos = [t for t in linea.get("cilindros", "").split() if "," in t]
    if not sueltos:
        return linea
    linea = dict(linea)
    linea["cilindros"] = " ".join(t for t in linea["cilindros"].split() if "," not in t)
    if not linea["cilindros"]:
        linea.pop("cilindros")
    anterior = linea.get("altcomp")
    linea["altcomp"] = " ".join(sueltos)
    if anterior:
        linea["aros"] = f"{linea['aros']} {anterior}" if linea.get("aros") else anterior
    return linea


def registros_del_pdf(path: str, solo_pagina: int | None = None) -> list[dict]:
    registros = []
    with pdfplumber.open(path) as pdf:
        for numero_pagina, pagina in enumerate(pdf.pages, start=1):
            if solo_pagina and numero_pagina != solo_pagina:
                continue
            palabras = pagina.extract_words(x_tolerance=1.5, y_tolerance=2)
            if not _es_pagina_de_tabla(palabras):
                continue
            marca = _marca(palabras)
            actual = None
            for linea in _lineas(palabras):
                linea = _realinear(linea)
                if re.fullmatch(r"\d{1,5}", linea.get("nro", "")):
                    actual = {"pagina": numero_pagina, "marca": marca,
                              "nro": linea["nro"].lstrip("0"), "lineas": []}
                    registros.append(actual)
                if actual is not None:
                    actual["lineas"].append({k: v for k, v in linea.items() if k != "nro"})
    return registros


# ── De las líneas a los campos ───────────────────────────────────────────────
def _numero(valor: str):
    try:
        return float(valor.replace(" ", "").replace(",", "."))
    except (ValueError, AttributeError):
        return None


def _celdas(lineas, columna) -> list[str]:
    return [l[columna] for l in lineas if l.get(columna)]


def _altura_y_largo(lineas) -> tuple[str, str, str]:
    """
    (altura de compresión, "+ ó -", largo total) de la primera variante.

    La columna apila los tres, y con dos variantes los apila dos veces, pero NO
    siempre son tres por variante: hay pistones sin largo total y otros con dos
    valores de "+ ó -". Contar posiciones falla en 100 de los 807 registros, así
    que se separa por lo que el valor ES. El "+ ó -" viene con signo dibujado
    aparte ("- 1,60") o vale 0,00; la altura y el largo van sin signo. De lo que
    queda, el primero es la altura y el largo es el primero que la supera, que
    es la misma condición que el converter le exige después: un largo total
    menor que la altura de compresión es una celda mal leída. Cuando ninguno la
    supera se devuelve igual el que sigue, para que el converter lo marque con
    "?" en vez de dejar la ficha muda.
    """
    valores: list[str] = []
    for celda in _celdas(lineas, "altcomp"):
        for token in celda.split():
            if token in ("-", "+"):
                valores.append(token)
            elif valores and valores[-1] in ("-", "+"):
                valores[-1] += token
            else:
                valores.append(token)

    con_signo = [v for v in valores if v[:1] in "+-" or _numero(v) == 0]
    sueltos = [v for v in valores if v not in con_signo]
    mas_menos = con_signo[0] if con_signo else ""
    if not sueltos:
        return "", mas_menos, ""
    altura = sueltos[0]
    referencia = _numero(altura)
    largo = ""
    for v in sueltos[1:]:
        n = _numero(v)
        if n is not None and referencia is not None and n > referencia:
            largo = v
            break
    if not largo and len(sueltos) > 1:
        largo = sueltos[1]
    return altura, mas_menos, largo


def campos(registro: dict) -> dict:
    lineas = registro["lineas"]
    textos = [l.get("texto", "").strip() for l in lineas]

    motor = textos[0] if textos else ""
    cilindrada = compresion = ""
    aplicacion = []
    for t in textos[1:]:
        if not t:
            continue
        m = CILINDRADA.match(t)
        if m and not cilindrada:
            cilindrada, compresion = m.group(1).strip(), m.group(2).strip()
        else:
            aplicacion.append(t)

    diametros = _celdas(lineas, "diam")
    alt_comp, mas_menos, largo = _altura_y_largo(lineas)

    camara = " ".join(_celdas(lineas, "camara")).split()
    perno, hermanado = [], ""
    for celda in _celdas(lineas, "perno"):
        for token in celda.split():
            if NUMERO.match(token):
                perno.append(token)
            elif token in ("A", "B", "C"):
                hermanado = token
    huelgo = [t for celda in _celdas(lineas, "huelgo") for t in celda.split() if NUMERO.match(t)]
    cilindros = " ".join(_celdas(lineas, "cilindros"))
    # "V 8" es una configuración y no dos valores: el catálogo dibuja la V un
    # poco separada del número.
    cilindros = re.sub(r"\bV\s+(\d)", r"V\1", cilindros)
    cilindros = [t for t in cilindros.split() if CILINDROS.match(t)]

    return {
        "MARCA": registro["marca"] or "",
        "Nº PISTÓN": registro["nro"],
        "MOTOR": motor,
        "CILINDRADA": cilindrada,
        "R. COMPRESIÓN": compresion,
        "APLICACIÓN": " ".join(aplicacion),
        "CILINDROS": " ".join(cilindros),
        "CARACTERÍSTICAS": " ".join(_celdas(lineas, "caract")),
        "DIÁM. CIL. (mm)": diametros[0] if diametros else "",
        "ALT. COMP. (mm)": alt_comp,
        "+ó- (mm)": mas_menos,
        "LARGO TOT. (mm)": largo,
        "CÁM. DIÁM. (mm)": " ".join(v for v in camara if not v.startswith("-")),
        "CÁM. PROF. (mm)": " ".join(v for v in camara if v.startswith("-")),
        "PERNO D. (mm)": perno[0] if perno else "",
        "PERNO L. (mm)": perno[1] if len(perno) > 1 else "",
        "HERMANADO": hermanado,
        "AROS (mm)": " / ".join(_celdas(lineas, "aros")),
        "HUELGO (mm)": huelgo[0] if huelgo else "",
        "ALT. MEDIC. (mm)": huelgo[1] if len(huelgo) > 1 else "",
        "MEDIDAS DISP.": " / ".join(_celdas(lineas, "medidas")),
    }


def puntaje(fila: dict) -> int:
    """
    Cuántos datos trae la fila, castigando los que no pasan las guardas de
    plausibilidad. Decide cuál de los registros repetidos de un mismo pistón se
    queda (ver el punto 6).
    """
    tecnicos = ["DIÁM. CIL. (mm)", "ALT. COMP. (mm)", "LARGO TOT. (mm)", "CÁM. DIÁM. (mm)",
                "PERNO D. (mm)", "PERNO L. (mm)", "HERMANADO", "AROS (mm)", "HUELGO (mm)",
                "ALT. MEDIC. (mm)", "CILINDROS", "MEDIDAS DISP."]
    valor = sum(1 for c in tecnicos if fila[c])
    alt = _numero(fila["ALT. COMP. (mm)"])
    largo = _numero(fila["LARGO TOT. (mm)"])
    perno_d = _numero(fila["PERNO D. (mm)"])
    perno_l = _numero(fila["PERNO L. (mm)"])
    if largo is None or largo <= 0 or (alt is not None and largo < alt):
        valor -= 5
    if perno_d and perno_l and perno_l <= perno_d:
        valor -= 5
    return valor


# ── La lista del proveedor ───────────────────────────────────────────────────
def bases_del_proveedor() -> list[tuple[str, str, list[str]]]:
    """
    (base, descripción, medidas) de cada pistón Persan que vende el proveedor.

    El código tiene ancho fijo de 14: los tres últimos caracteres son la medida
    y lo de antes es la base (ver CRAC/tecnicos/CARGA-COJINETES.md, "El código
    del proveedor").
    """
    filas = collections.OrderedDict()
    with open(CSV_PROVEEDOR, encoding="latin-1") as f:
        for fila in csv.reader(f, delimiter=";"):
            if not fila or not fila[0].startswith("P PS"):
                continue
            base, medida = fila[0][:11].rstrip(), fila[0][11:].strip()
            descripcion = fila[1].strip() if len(fila) > 1 else ""
            if base not in filas:
                filas[base] = [descripcion, []]
            if medida:
                filas[base][1].append(medida)
            if descripcion and not filas[base][0]:
                filas[base][0] = descripcion
    return [(b, d, m) for b, (d, m) in filas.items()]


# ── El TXT ───────────────────────────────────────────────────────────────────
CABECERA = ["MARCA", "Nº PISTÓN", "MOTOR", "CILINDRADA", "R. COMPRESIÓN", "APLICACIÓN",
            "CILINDROS", "CARACTERÍSTICAS", "DIÁM. CIL. (mm)", "ALT. COMP. (mm)", "+ó- (mm)",
            "LARGO TOT. (mm)", "CÁM. DIÁM. (mm)", "CÁM. PROF. (mm)", "PERNO D. (mm)",
            "PERNO L. (mm)", "HERMANADO", "AROS (mm)", "HUELGO (mm)", "ALT. MEDIC. (mm)",
            "MEDIDAS DISP.", "CÓDIGO CRAC", "DESCRIPCIÓN CRAC", "MEDIDAS CRAC"]

PIE = [
    "HERMANADO: A = Calentando pistón 60/90°C | B = Suave o Calentando | C = Suave a temperatura 20/30°C",
    "MEDIDAS DISP.: Std. = Estándar | +0,XX = Sobremedida en mm",
    "CARACTERÍSTICAS: (1)=Inserto 1ª ranura | (2)=Canal refrigeración | (3)=Expansión controlada | (4)=Anodizado duro cabeza | (5)=Rebaje inyector aceite",
    "CÁM. DIÁM./PROF.: valores positivos = diámetro | valor negativo = profundidad",
]


def escribir_txt(filas: list[dict], path: str) -> None:
    anchos = [max(len(f[c]) for f in filas + [{c: c for c in CABECERA}]) for c in CABECERA]
    regla = "+" + "+".join("-" * (a + 2) for a in anchos) + "+"

    def renglon(fila):
        return "| " + " | ".join(fila[c].ljust(a) for c, a in zip(CABECERA, anchos)) + " |"

    with open(path, "w", encoding="utf-8") as f:
        f.write("CATÁLOGO PERSAN × CRAC — Pistones\n")
        f.write("=" * 60 + "\n\n")
        f.write(regla + "\n")
        f.write(renglon({c: c for c in CABECERA}) + "\n")
        for fila in filas:
            f.write(regla + "\n")
            f.write(renglon(fila) + "\n")
        f.write(regla + "\n\n")
        f.write("-" * 60 + "\n")
        for linea in PIE:
            f.write(linea + "\n")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--salida", default=SALIDA)
    ap.add_argument("--pagina", type=int, help="mirar una sola página, sin escribir el TXT")
    args = ap.parse_args()

    if not os.path.exists(PDF):
        sys.exit(f"Falta el PDF: {os.path.relpath(PDF, RAIZ)}\n"
                 "Bajalo del release `catalogos` (el comando está en el encabezado de este script).")

    registros = registros_del_pdf(PDF, args.pagina)
    if args.pagina:
        for r in registros:
            print(r["nro"], r["marca"])
            for c, v in campos(r).items():
                if v:
                    print(f"    {c}: {v}")
        return 0

    por_numero = collections.defaultdict(list)
    for r in registros:
        por_numero[r["nro"]].append(r)

    filas, sin_ficha = [], []
    for base, descripcion, medidas in bases_del_proveedor():
        m = BASE_NUMERO.match(base)
        candidatos = por_numero.get(m.group(1)) if m else None
        if candidatos:
            fila = max((campos(r) for r in candidatos), key=puntaje)
            # La marca las lista a todas: es el único lugar donde se ve que un
            # mismo pistón sirve para varias.
            fila["MARCA"] = " / ".join(dict.fromkeys(r["marca"] for r in candidatos if r["marca"]))
        else:
            # Todas las columnas del catálogo vacías, el número de pistón
            # incluido: así el converter reconoce la fila como "sin datos en el
            # catálogo Persan" y marca las ocho medidas con "?" en vez de
            # cargarlas como si no existieran.
            fila = {c: "" for c in CABECERA}
            sin_ficha.append(base)
        fila["CÓDIGO CRAC"] = base
        fila["DESCRIPCIÓN CRAC"] = descripcion
        fila["MEDIDAS CRAC"] = " - ".join(medidas)
        filas.append({c: " ".join(fila.get(c, "").replace("|", "/").split()) for c in CABECERA})

    escribir_txt(filas, args.salida)
    print(f"✓ {len(filas)} pistones del proveedor → {os.path.relpath(args.salida, RAIZ)}")
    print(f"  {len(registros)} registros leídos del catálogo, {len(por_numero)} números distintos")
    if sin_ficha:
        print(f"  ⚠ sin ficha en el catálogo ({len(sin_ficha)}): {', '.join(sin_ficha)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
