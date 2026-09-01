"""
Suite de verificación de la búsqueda por medidas (`app/tecnicos.py`), contra los
catálogos técnicos del repo (396 camisas, 915 guías, 1.108 asientos de válvulas,
201 subconjuntos, 128 conjuntos, 35 pistones y 190 bujes de biela) y los 64.250
repuestos del proveedor ya importados en la base.

Cómo se corre: ver tests/README.md. Resumen:

    DATA_DIR=/tmp/rect-test python tests/backend_medidas.py

No escribe nada: la búsqueda por medidas es de solo lectura. Igual DATA_DIR es
obligatorio, para no correr nunca contra la base real por descuido.
"""
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND = os.path.join(RAIZ, "webapp", "backend")
sys.path.insert(0, BACKEND)

if not os.environ.get("DATA_DIR"):
    sys.exit("Falta DATA_DIR: apuntalo a una carpeta descartable, nunca a la base real.")

os.environ["APP_USERNAME"] = os.environ.get("APP_USERNAME", "admin")
from werkzeug.security import generate_password_hash  # noqa: E402
CLAVE = os.environ.get("APP_PASSWORD") or "clave-descartable-de-la-suite"
os.environ["APP_PASSWORD_HASH"] = generate_password_hash(CLAVE)

from app import crac, db, tecnicos  # noqa: E402
from app import create_app  # noqa: E402

fallos = []


def check(nombre, condicion, detalle=""):
    if condicion:
        print(f"  OK   {nombre}")
    else:
        print(f"  FALLA {nombre} — {detalle}")
        fallos.append(nombre)


def codigos(resultado):
    return [r["codigo"] for r in resultado["resultados"]]


print("\n=== 0. Catálogos cargados ===")
db.init_db()
familias = {f["id"]: f for f in tecnicos.get_familias()}
check("están las siete familias",
      sorted(familias) == ["asientos", "bujes_biela", "camisas", "conjuntos", "guias", "pistones",
                           "subconjuntos"],
      list(familias))
check("396 camisas (secas y húmedas)",
      familias.get("camisas", {}).get("total") == 396, familias.get("camisas"))
check("915 guías (RYC + Indy + Nubo)", familias.get("guias", {}).get("total") == 915, familias.get("guias"))
check("1.108 asientos de válvulas (Indy + Nubo + RYC)",
      familias.get("asientos", {}).get("total") == 1108, familias.get("asientos"))
check("201 subconjuntos", familias.get("subconjuntos", {}).get("total") == 201, familias.get("subconjuntos"))
# Los conjuntos son los juegos de motor que trabaja el proveedor ("T BEK…"), y
# la ficha se arma desde su lista: hay uno por código, ni más ni menos.
check("128 conjuntos (los que trabaja el proveedor)",
      familias.get("conjuntos", {}).get("total") == 128, familias.get("conjuntos"))
check("35 pistones (Persan)", familias.get("pistones", {}).get("total") == 35, familias.get("pistones"))
check("190 bujes de biela (Indubrón)",
      familias.get("bujes_biela", {}).get("total") == 190, familias.get("bujes_biela"))
check("el catálogo del proveedor está importado", crac.get_info_catalogo()["total"] == 64250)
# La casilla "Solo las que tiene el proveedor" va en todas menos las dos
# familias de Mahle: los catálogos técnicos son los del fabricante y traen más
# de lo que se puede pedir, pero la ficha de Mahle se consulta igual aunque la
# pieza no se pueda pedir. En conjuntos la casilla además no filtraría nada:
# las 128 fichas salen de la lista del proveedor.
check("ofrecen el filtro del proveedor todas menos las dos de Mahle",
      {k for k, v in familias.items() if v["filtro_proveedor"]}
      == {"camisas", "guias", "asientos", "pistones", "bujes_biela"},
      {k: v.get("filtro_proveedor") for k, v in familias.items()})
for id_familia in familias:
    con = tecnicos.buscar(id_familia, {"aplicacion": "a"})
    sin = tecnicos.buscar(id_familia, {"aplicacion": "a", "solo_crac": "0"})
    if familias[id_familia]["filtro_proveedor"]:
        check(f"y en {id_familia} filtra de verdad",
              all(x["codigo_crac"] for x in con["resultados"]) and sin["total"] >= con["total"],
              (con["total"], sin["total"]))
    else:
        check(f"y en {id_familia} no esconde nada, ni pidiéndoselo",
              con["total"] == sin["total"] and con["sin_proveedor"] == 0,
              (con["total"], sin["total"]))

print("\n=== 1. Sin filtros no se devuelve el catálogo ===")
vacio = tecnicos.buscar("camisas", {})
check("sin ningún filtro no hay resultados", vacio["total"] == 0 and not vacio["capped"], vacio)
check("una familia que no existe tampoco explota", tecnicos.buscar("bielas", {"codigo": "x"})["total"] == 0)

print("\n=== 2. Valor ± tolerancia ===")
# UC 2112: Ø interior 56,5 — el filtro tiene que encontrarla pidiendo 56,5 y
# también 56,3 con ±0,5, y NO encontrarla con una tolerancia que no llega.
r = tecnicos.buscar("camisas", {"diam_int": "56.5", "tol_diam_int": "0"})
check("Ø interior exacto encuentra la camisa", "UC 2112" in codigos(r), codigos(r)[:5])
r = tecnicos.buscar("camisas", {"diam_int": "56.3", "tol_diam_int": "0.5"})
check("y con ±0,5 también", "UC 2112" in codigos(r), codigos(r)[:5])
r = tecnicos.buscar("camisas", {"diam_int": "56.3", "tol_diam_int": "0.1"})
check("con ±0,1 ya no", "UC 2112" not in codigos(r), codigos(r)[:5])

r = tecnicos.buscar("camisas", {"diam_int": "56.5"})
check("sin tolerancia escrita se usa ±0,5", "UC 2112" in codigos(r), codigos(r)[:5])

r = tecnicos.buscar("camisas", {"diam_int": "56,3", "tol_diam_int": "0,5"})
check("la coma decimal se acepta igual que el punto", "UC 2112" in codigos(r), codigos(r)[:5])

print("\n=== 3. Los filtros se acumulan ===")
solo_vastago = tecnicos.buscar("guias", {"diam_vastago": "11", "tol_diam_vastago": "0.1"})
con_largo = tecnicos.buscar("guias", {
    "diam_vastago": "11", "tol_diam_vastago": "0.1",
    "largo": "84.5", "tol_largo": "0.5",
})
# 24 y no 30: seis de esas guías están en el catálogo de RYC pero no en la lista
# del proveedor, y el filtro de "solo las que tiene" viene tildado.
check("Ø vástago 11 ±0,1 da 24 guías que se pueden pedir",
      solo_vastago["total"] == 24, solo_vastago["total"])
check("y 30 en el catálogo entero",
      tecnicos.buscar("guias", {"diam_vastago": "11", "tol_diam_vastago": "0.1",
                                "solo_crac": "0"})["total"] == 30)
check("sumar el largo achica el resultado", 0 < con_largo["total"] < solo_vastago["total"], con_largo["total"])
check("y la guía buscada sigue estando", "G IY1171 STD" in codigos(con_largo), codigos(con_largo))

print("\n=== 4. Precio y stock salen de la base, no del catálogo técnico ===")
guia = [r for r in con_largo["resultados"] if r["codigo"] == "G IY1171 STD"][0]
en_base = None
with db.get_connection() as conn:
    en_base = conn.execute(
        "SELECT precio, stock FROM crac_repuestos WHERE codigo = ?", (guia["codigo_crac"],)
    ).fetchone()
check("la guía trae el código exacto del proveedor", guia["codigo_crac"] == "G IY1171   STD", guia["codigo_crac"])
check("el precio es el de la base", guia["precio"] == en_base["precio"], (guia["precio"], en_base["precio"]))
check("el stock también", guia["stock"] == bool(en_base["stock"]), (guia["stock"], en_base["stock"]))

# UC 1694 no está en la lista del proveedor: hay que destildar el filtro para
# verla (el filtro tiene su propia sección más abajo).
sin_equivalencia = tecnicos.buscar("camisas", {"codigo": "UC 1694", "solo_crac": "0"})
check("una ficha sin equivalencia igual aparece", sin_equivalencia["total"] == 1, codigos(sin_equivalencia))
if sin_equivalencia["total"]:
    ficha = sin_equivalencia["resultados"][0]
    check("y viene sin precio en vez de con precio inventado",
          ficha["precio"] is None and ficha["codigo_crac"] is None, ficha)

print("\n=== 5. Un subconjunto tiene un código por sobremedida ===")
sub = tecnicos.buscar("subconjuntos", {"codigo": "S BE01010"})
check("se encuentra por su código Mahle", codigos(sub) == ["S BE01010"], codigos(sub))
if sub["total"]:
    elegido = sub["resultados"][0]
    check("se muestra una sobremedida con stock", elegido["stock"] is True, elegido)
    check("y se dice cuál es", elegido["medida_crac"] == "STD", elegido["medida_crac"])
    check("el precio no es None", elegido["precio"] is not None, elegido["precio"])

print("\n=== 5 ter. Un conjunto es el juego del motor ===")
# El conjunto tiene UN código y UN precio, y se encuentra tanto por el código
# del proveedor como por el de Mahle: los dos van al mismo campo de búsqueda.
conj = tecnicos.buscar("conjuntos", {"codigo": "T BEK21540"})
check("se encuentra por el código del proveedor", codigos(conj) == ["T BEK21540"], codigos(conj))
por_mahle = tecnicos.buscar("conjuntos", {"codigo": "K21540"})
check("y por el código de Mahle", codigos(por_mahle) == ["T BEK21540"], codigos(por_mahle))
if conj["total"]:
    juego = conj["resultados"][0]
    check("trae el código de Mahle aparte", juego["codigo_fab"] == "K21540", juego["codigo_fab"])
    check("con precio de la lista del proveedor", juego["precio"] is not None, juego["precio"])
    check("y sin medida de sobremedida, porque tiene un solo código",
          juego["medida_crac"] is None, juego["medida_crac"])
    # Las medidas de este conjunto salieron de la ficha del subconjunto del
    # mismo número: es el mismo pistón, leído de la misma fila del catálogo.
    check("con las medidas del pistón cargadas",
          juego["medidas"].get("diam_piston") == 114, juego["medidas"])
    check("y diciendo de qué ficha salieron",
          juego["extra"].get("ficha_de") == "S BE21540", juego["extra"].get("ficha_de"))
# Un conjunto sin medidas todavía no se encuentra por medida —no tiene con qué
# matchear— pero sí por el motor, que es como se lo busca mientras tanto.
por_motor = tecnicos.buscar("conjuntos", {"descripcion": "scania 113h"})
check("los que esperan el catálogo se encuentran por el motor",
      len(por_motor["resultados"]) >= 2, codigos(por_motor))

print("\n=== 5 bis. Pistones ===")
# Los mismos tres filtros que subconjuntos, sobre el catálogo Persan.
pis = tecnicos.buscar("pistones", {"diam_piston": "98.42", "tol_diam_piston": "0.1"})
check("Ø pistón 98,42 ±0,1 encuentra los Chevrolet",
      {"P PS121PH", "P PS132PH", "P PS152PH"} <= set(codigos(pis)), codigos(pis))
uno = tecnicos.buscar("pistones", {"codigo": "PS082PH"})
check("se encuentra por su código", codigos(uno) == ["P PS082PH"], codigos(uno))
if uno["total"]:
    p82 = uno["resultados"][0]
    check("con las medidas del catálogo",
          p82["medidas"] == {"diam_piston": 62.0, "alt_piston": 61.75, "diam_perno": 20.0}, p82["medidas"])
    # Las sobremedidas salen de la lista viva del proveedor, no del TXT: el TXT
    # decía solo STD y 0.6 y el proveedor tiene además 1.0 y 1.5.
    check("y con precio del proveedor", p82["precio"] is not None and p82["codigo_crac"], p82["precio"])
    check("sin nada para revisar", not p82["extra"]["revisar"], p82["extra"]["revisar"])
r = tecnicos.buscar("pistones", {"aplicacion": "falcon"})
check("y por el motor", codigos(r) == ["P PS169PH"], codigos(r))

# Las filas que el PDF dejó corridas de columna no cargan medidas inventadas:
# van sin dato y con el motivo en `extra.revisar` (la pantalla las muestra "?").
dudoso = tecnicos.buscar("pistones", {"codigo": "PS171PH"})["resultados"][0]
check("un pistón con columnas corridas no trae medidas",
      all(v is None for v in dudoso["medidas"].values()), dudoso["medidas"])
check("pero sí el motivo para revisarlo",
      set(dudoso["extra"]["revisar"]) >= {"diam_piston", "alt_piston", "diam_perno"}, dudoso["extra"]["revisar"])
check("y el precio del proveedor igual está", dudoso["precio"] is not None, dudoso["precio"])

print("\n=== 5 ter. Bujes de biela (Indubrón) ===")
# El mismo buje puede estar listado bajo dos marcas (el I-115 es el del Corsa
# 1.7 D y el del Isuzu 4EE1): son dos fichas, no una repetida por error.
uno = tecnicos.buscar("bujes_biela", {"codigo": "I-115"})
check("se encuentra por su código", codigos(uno) == ["I-115", "I-115"], codigos(uno))
check("y aparece bajo sus dos marcas",
      [x["marca"] for x in uno["resultados"]] == ["CHEVROLET", "ISUZU"],
      [x["marca"] for x in uno["resultados"]])
if uno["total"]:
    b115 = uno["resultados"][0]
    check("con las medidas del catálogo",
          b115["medidas"] == {"diam_perno": 25.0, "diam_int": 24.5, "ancho": 24.0}, b115["medidas"])
    check("el STD y las siete sobremedidas",
          [x["label"] for x in b115["extra"]["sobremedidas"]]
          == ["STD", "003", "005", "010", "015", "020", "030", "040"],
          b115["extra"]["sobremedidas"])
    check("el Ø exterior STD conserva su banda de tolerancia",
          b115["extra"]["sobremedidas"][0]["valor"] == [28.15, 28.18], b115["extra"]["sobremedidas"][0])
    check("y trae precio del proveedor",
          b115["codigo_crac"] == "B I I-115  STD" and b115["precio"] is not None, b115["codigo_crac"])

r = tecnicos.buscar("bujes_biela", {"diam_perno": "25", "tol_diam_perno": "0.1"})
check("el Ø del perno filtra", "I-115" in codigos(r) and r["total"] > 1, r["total"])

# El Ø exterior se busca contra el STD y contra todas las sobremedidas, como en
# camisas: 29,14 es la sobremedida 040 del I-115.
r = tecnicos.buscar("bujes_biela", {"diam_sobremedida": "29.14", "tol_diam_sobremedida": "0.01"})
check("el Ø exterior encuentra por una sobremedida", "I-115" in codigos(r), codigos(r)[:5])
if "I-115" in codigos(r):
    ficha = [x for x in r["resultados"] if x["codigo"] == "I-115"][0]
    check("y dice cuál matcheó",
          [x["label"] for x in ficha["sobremedidas_match"]] == ["040"], ficha["sobremedidas_match"])

# I-143X es trapezoidal: 14,60 de un lado y 20,20 del otro. Tiene los dos
# anchos, no los 17 que quedarían de promediarlos. No está en la lista del
# proveedor, así que estas búsquedas van con el filtro destildado.
todo = {"solo_crac": "0"}
r = tecnicos.buscar("bujes_biela", {**todo, "ancho": "14.6", "tol_ancho": "0.05"})
check("un buje escalonado aparece por su ancho chico", "I-143X" in codigos(r), codigos(r)[:5])
r = tecnicos.buscar("bujes_biela", {**todo, "ancho": "20.2", "tol_ancho": "0.05"})
check("y también por el grande", "I-143X" in codigos(r), codigos(r)[:5])
r = tecnicos.buscar("bujes_biela", {**todo, "ancho": "17", "tol_ancho": "0.05"})
check("pero no por un ancho que no tiene", "I-143X" not in codigos(r), codigos(r)[:5])

r = tecnicos.buscar("bujes_biela", {"aplicacion": "corsa"})
check("se busca por marca y modelo juntos", "I-115" in codigos(r), codigos(r))

# "I-143" (Citroën) e "I-143X" (el trapezoidal) son dos productos: el precio de
# uno no se le puede poner al otro.
trap = tecnicos.buscar("bujes_biela", {"codigo": "I-143X", "solo_crac": "0"})["resultados"][0]
check("el trapezoidal no se lleva el código del recto",
      trap["codigo_crac"] is None and trap["precio"] is None, trap["codigo_crac"])

print("\n=== 5 quinquies. Asientos de válvulas (Indy + Nubo + RYC) ===")
por_marca = {}
for f in tecnicos._catalogo("asientos"):
    por_marca[f["marca"]] = por_marca.get(f["marca"], 0) + 1
check("los tres catálogos, cada uno con sus fichas",
      por_marca == {"INDY": 559, "NUBO": 277, "RYC": 272}, por_marca)
check("326 asientos se pueden pedir hoy",
      sum(1 for f in tecnicos._catalogo("asientos") if f["codigos_crac"]) == 326)

# La cantidad por juego la publica UN catálogo: en los otros dos es un dato que
# falta (null → guión en pantalla), nunca un número copiado del vecino.
check("la cantidad por juego solo la traen los Indy",
      {f["extra"]["cant_juego"] for f in tecnicos._catalogo("asientos") if f["marca"] != "INDY"} == {None})
check("y ningún Indy la trae en 0",
      all(f["extra"]["cant_juego"] != "0" for f in tecnicos._catalogo("asientos")))


# El código del catálogo se cruza con el del proveedor, que es el que se pide.
def asiento(codigo):
    r = tecnicos.buscar("asientos", {"codigo": codigo, "solo_crac": "0"})
    iguales = [x for x in r["resultados"] if x["codigo_fab"] == codigo]
    return iguales[0] if iguales else None


indy = asiento("A5000")
check("un asiento Indy se muestra con el código del proveedor",
      indy["codigo"] == "F IY 5000" and indy["codigo_crac"] == "F IY 5000", indy["codigo_crac"])
check("con las cuatro medidas del catálogo",
      indy["medidas"] == {"diam_ext": 45.07, "diam_int": 37.0, "altura": 8.3, "angulo": 45.0},
      indy["medidas"])
check("y con precio y stock de la base", indy["precio"] is not None and indy["stock"] is True, indy["precio"])

nubo = asiento("C105")
check("un Nubo se cruza por número y letra del tipo",
      nubo["codigo"] == "F NB 105A" and nubo["precio"] is not None, nubo["codigo_crac"])
ryc = asiento("523")
check("y un RYC por el número, que el proveedor escribe con una letra al final",
      ryc["codigo"] == "F R 523T" and ryc["codigo_crac"] == "F R 523T   STD", ryc["codigo_crac"])
check("la sobremedida del precio que se muestra va dicha", ryc["medida_crac"] == "STD", ryc["medida_crac"])

sin_cruce = asiento("A5232")
check("el que no está en la lista queda con su código de catálogo y sin precio",
      sin_cruce["codigo"] == "A5232" and sin_cruce["precio"] is None, sin_cruce)

# El ángulo es una medida más, con tolerancia, y no una lista de valores fijos:
# el catálogo tiene diez asientos de ángulos raros que una lista dejaría afuera.
r = tecnicos.buscar("asientos", {"angulo": "45", "tol_angulo": "0"})
check("el ángulo filtra", r["total"] > 0 and all(x["medidas"]["angulo"] == 45 for x in r["resultados"]))
r = tecnicos.buscar("asientos", {"angulo": "44.3", "tol_angulo": "0"})
check("y llega hasta los ángulos raros", codigos(r) == ["F IY 5139"], codigos(r))

r = tecnicos.buscar("asientos", {"aplicacion": "corsa", "tipo": "E"})
check("el tipo separa admisión de escape",
      r["total"] > 0 and all(x["tipo"] == "E" for x in r["resultados"]), codigos(r))
r = tecnicos.buscar("asientos", {"diam_ext": "45", "tol_diam_ext": "0.5", "angulo": "30"})
check("las medidas y el ángulo se acumulan",
      r["total"] > 0 and all(x["medidas"]["angulo"] == 30 for x in r["resultados"]), codigos(r))

print("\n=== 5 quater. Tolerancia con signo: ese valor o más / o menos ===")
# Lo que pidió el dueño: una guía de 40 de largo entra donde va una de 50, así
# que "40 y para arriba" tiene que encontrarlas a las dos.
base = {"diam_vastago": "8", "tol_diam_vastago": "0"}
solo = tecnicos.buscar("guias", {**base, "largo": "40.5", "tol_largo": "0"})
mas = tecnicos.buscar("guias", {**base, "largo": "40.5", "tol_largo": "+"})
menos = tecnicos.buscar("guias", {**base, "largo": "40.5", "tol_largo": "-"})
check("con + entran las más largas", mas["total"] > solo["total"], (solo["total"], mas["total"]))
check("con − entran las más cortas", menos["total"] > solo["total"], (solo["total"], menos["total"]))
largos_mas = [x["medidas"]["largo"] for x in mas["resultados"]]
largos_menos = [x["medidas"]["largo"] for x in menos["resultados"]]
check("+ no trae ninguna más corta que el valor", all(l >= 40.5 for l in largos_mas), sorted(largos_mas)[:3])
check("− no trae ninguna más larga", all(l <= 40.5 for l in largos_menos), sorted(largos_menos)[-3:])
check("el valor exacto entra en los dos",
      set(codigos(solo)) <= set(codigos(mas)) and set(codigos(solo)) <= set(codigos(menos)))

# Con número, el signo acota de un solo lado: "+2" es de 40,5 a 42,5.
acotado = tecnicos.buscar("guias", {**base, "largo": "40.5", "tol_largo": "+2"})
check("con +2 el rango tiene tope",
      all(40.5 <= x["medidas"]["largo"] <= 42.5 for x in acotado["resultados"]),
      [x["medidas"]["largo"] for x in acotado["resultados"]])
check("y es menos que sin tope", acotado["total"] <= mas["total"], (acotado["total"], mas["total"]))

con_signo = tecnicos.buscar("bujes_biela", {"diam_perno": "45", "tol_diam_perno": "+"})
check("el signo también sirve en bujes", con_signo["total"] > 0, con_signo["total"])
check("y ningún perno es menor al pedido",
      all(x["medidas"]["diam_perno"] >= 45 for x in con_signo["resultados"]),
      [x["medidas"]["diam_perno"] for x in con_signo["resultados"]][:5])

print("\n=== 6. Filtros de texto ===")
r = tecnicos.buscar("guias", {"aplicacion": "fiat tractor"})
check("la aplicación busca por palabras sueltas y en cualquier orden", r["total"] > 0, r["total"])
check("y encuentra la guía del tractor Fiat", "G IY1171 STD" in codigos(r), codigos(r)[:5])
r = tecnicos.buscar("guias", {"aplicacion": "VÁLVULA"})
check("ignora acentos y mayúsculas", r["total"] > 0, r["total"])
r = tecnicos.buscar("guias", {"codigo": "iy1171"})
check("el código se busca por fragmento", "G IY1171 STD" in codigos(r), codigos(r))

print("\n=== 7. Filtros propios de cada familia ===")
r = tecnicos.buscar("guias", {"tipo": "A"})
check("tipo de guía (admisión)", r["capped"] and all(x["tipo"] == "A" for x in r["resultados"]))
r = tecnicos.buscar("camisas", {"diam_sobremedida": "64.15", "tol_diam_sobremedida": "0.1"})
check("Ø de sobremedida encuentra la camisa", "UC 2112" in codigos(r), codigos(r))
if r["total"]:
    ficha = [x for x in r["resultados"] if x["codigo"] == "UC 2112"][0]
    check("y dice qué sobremedida matcheó",
          [s["label"] for s in ficha["sobremedidas_match"]] == ["STD"], ficha["sobremedidas_match"])

print("\n=== 7 ter. Camisas: etiquetas de sobremedida, húmedas y filtro del proveedor ===")
# El error que motivó rehacer el catálogo: las etiquetas salían corridas, y toda
# camisa empezaba en -.060" tuviera la medida que tuviera. La etiqueta ahora es
# la del catálogo, y las métricas se guardan como métricas.
def camisa(codigo):
    r = tecnicos.buscar("camisas", {"codigo": codigo, "solo_crac": "0"})
    return r["resultados"][0] if r["total"] else None


def sobremedidas(codigo):
    return [(s["label"], s["valor"]) for s in camisa(codigo)["extra"]["sobremedidas"]]


check("una camisa en pulgadas trae las cinco medidas del catálogo",
      sobremedidas("A 0069") == [('-.060"', 65.24), ('-.030"', 66.0), ("STD", 66.76),
                                 ('+.030"', 67.52), ('+.060"', 68.28)],
      sobremedidas("A 0069"))
check("una camisa en milímetros NO se guarda como si fuera en pulgadas",
      sobremedidas("UC 1902") == [("STD", 96.08), ("+0.20MM", 96.28), ("+0.50MM", 96.58)],
      sobremedidas("UC 1902"))
check("y la de +2,00 mm tampoco",
      sobremedidas("AE 1776") == [("STD", 79.5), ("+2.00MM", 81.5)], sobremedidas("AE 1776"))
check("la camisa con las doce medidas métricas está completa",
      [l for l, _ in sobremedidas("UC 1278")]
      == ['-.030"', "STD", "+0.05MM", "+0.10MM", "+0.20MM", "+0.25MM", "+0.50MM",
          "+0.75MM", "+1.00MM", "+1.25MM", "+1.50MM", "+2.00MM"],
      sobremedidas("UC 1278"))

# El alto de pestaña: la página dice 4,00 donde el Excel dice 4,76.
check("el alto de pestaña sale del Excel y no de la página",
      camisa("A 0069")["medidas"]["alt_pest"] == 4.76, camisa("A 0069")["medidas"])
dudosa = camisa("A 4601")
check("cuando el Excel también dice 4,00 se deja el 4,00",
      dudosa["medidas"]["alt_pest"] == 4.0, dudosa["medidas"])
check("y queda marcado para que la pantalla le ponga el signo de pregunta",
      "alt_pest" in (dudosa["extra"]["revisar"] or {}), dudosa["extra"]["revisar"])

# Cada sobremedida tiene su código en la lista del proveedor, como en
# subconjuntos: así el precio es el de la medida que se está mirando.
codigos_a55 = camisa("A 0055")["extra"]
medidas_a55 = tecnicos.buscar("camisas", {"codigo": "A 0055"})["resultados"][0]
check("la camisa trae el código del proveedor de la STD",
      medidas_a55["codigo_crac"] == "C CEA  055 STD" and medidas_a55["medida_crac"] == "STD",
      (medidas_a55["codigo_crac"], medidas_a55["medida_crac"]))
check("con precio de la base", medidas_a55["precio"] is not None, medidas_a55["precio"])

humeda = camisa("UCO 4661")
check("las camisas húmedas están en el catálogo",
      humeda is not None and humeda["extra"]["tipo_camisa"] == "Húmeda", humeda)

# El filtro nuevo: por defecto solo lo que el proveedor tiene.
con_filtro = tecnicos.buscar("camisas", {"aplicacion": "diesel"})
sin_filtro = tecnicos.buscar("camisas", {"aplicacion": "diesel", "solo_crac": "0"})
check("por defecto se muestran solo las que el proveedor tiene",
      all(x["codigo_crac"] for x in con_filtro["resultados"]), codigos(con_filtro))
check("destildando el filtro aparecen todas",
      sin_filtro["total"] > con_filtro["total"], (con_filtro["total"], sin_filtro["total"]))
check("y se avisa cuántas quedaron afuera",
      con_filtro["sin_proveedor"] == sin_filtro["total"] - con_filtro["total"],
      (con_filtro["sin_proveedor"], con_filtro["total"], sin_filtro["total"]))
check("sin el filtro no se cuenta ninguna afuera",
      sin_filtro["sin_proveedor"] == 0, sin_filtro["sin_proveedor"])

print("\n=== 7 bis. La forma de la guía ===")
# "A-1-6" es el cuerpo A con los detalles 1 y 6. Algunas fichas venían sin los
# guiones o con dos detalles pegados, y se normalizan al cargar el catálogo.
# Se busca en el catálogo entero: acá se verifica el dato, no si se consigue.
r = tecnicos.buscar("guias", {"codigo": "NB059B", "solo_crac": "0"})
check("una forma sin guiones se normaliza",
      {x["extra"]["forma"] for x in r["resultados"]} == {"A-1"},
      [x["extra"]["forma"] for x in r["resultados"]])
r = tecnicos.buscar("guias", {"codigo": "R 3173", "solo_crac": "0"})
check("y dos detalles pegados se separan",
      r["resultados"][0]["extra"]["forma"] == "P-3-6", r["resultados"][0]["extra"]["forma"])
check("la forma de siempre no se toca",
      tecnicos.buscar("guias", {"codigo": "3084", "solo_crac": "0"})["resultados"][0]["extra"]["forma"] == "F")

r = tecnicos.buscar("guias", {"forma": "A"})
check("se puede filtrar por la letra del cuerpo",
      r["total"] == 100 and all(x["extra"]["forma"].startswith("A") for x in r["resultados"]),
      [x["extra"]["forma"] for x in r["resultados"]][:5])
r = tecnicos.buscar("guias", {"forma": "B"})
check("una forma con pocas guías las trae todas",
      0 < r["total"] < 100 and all(x["extra"]["forma"].startswith("B") for x in r["resultados"]),
      r["total"])
r = tecnicos.buscar("guias", {"forma": "A", "diam_vastago": "8", "tol_diam_vastago": "0.1"})
check("y se combina con las medidas",
      r["total"] > 0 and all(x["extra"]["forma"].startswith("A") for x in r["resultados"]),
      r["total"])
check("la forma no existe como filtro en otras familias",
      tecnicos.buscar("camisas", {"forma": "A"})["total"] == 0)

# Cada letra que ofrece el filtro tiene que tener su dibujo recortado, o la
# pantalla muestra un cuadrito roto.
FORMAS_DIR = os.path.join(RAIZ, "webapp", "frontend", "public", "formas")
faltan = [f"{l}.png" for l in "ABCEFGLMP" if not os.path.exists(os.path.join(FORMAS_DIR, f"{l}.png"))]
faltan += [f"{d}.png" for d in ("detalle-1-2", "detalle-3-6", "detalle-7", "detalle-8")
           if not os.path.exists(os.path.join(FORMAS_DIR, f"{d}.png"))]
check("están los trece dibujos de la lámina", not faltan, faltan)

print("\n=== 8. El tope de 100 se avisa ===")
r = tecnicos.buscar("guias", {"aplicacion": "guia"})
check("se devuelven 100 como mucho", r["total"] == 100, r["total"])
check("y se avisa que hay más", r["capped"] is True)

print("\n=== 9. Los endpoints ===")
app = create_app()
cliente = app.test_client()
check("sin sesión no se entra", cliente.get("/api/tecnicos/familias").status_code == 401)
cliente.post("/api/auth/login", json={"usuario": os.environ["APP_USERNAME"], "password": CLAVE})
resp = cliente.get("/api/tecnicos/familias")
check("con sesión, las familias", resp.status_code == 200 and len(resp.get_json()) == 7, resp.get_json())
resp = cliente.get("/api/tecnicos/buscar?familia=camisas&diam_int=56.5&tol_diam_int=0")
datos = resp.get_json()
check("y la búsqueda", resp.status_code == 200 and "UC 2112" in [r["codigo"] for r in datos["resultados"]], datos)
# El "+" viaja como %2B: si se escapara mal llegaría un espacio, la tolerancia
# se caería al ±0,5 de siempre y nadie se enteraría.
resp = cliente.get("/api/tecnicos/buscar?familia=bujes_biela&diam_perno=45&tol_diam_perno=%2B")
datos = resp.get_json()
check("y el signo + llega entero por la URL",
      resp.status_code == 200 and datos["total"] > 0
      and all(r["medidas"]["diam_perno"] >= 45 for r in datos["resultados"]), datos["total"])

print("\n" + "=" * 50)
if fallos:
    print(f"FALLARON {len(fallos)}: {fallos}")
    sys.exit(1)
print("TODO OK")
