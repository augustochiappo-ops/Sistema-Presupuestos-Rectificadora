"""
Suite de verificación de la búsqueda por medidas (`app/tecnicos.py`), contra los
catálogos técnicos del repo (280 camisas, 915 guías y 201 subconjuntos) y los
64.250 repuestos del proveedor ya importados en la base.

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
check("están las tres familias", sorted(familias) == ["camisas", "guias", "subconjuntos"], list(familias))
check("280 camisas", familias.get("camisas", {}).get("total") == 280, familias.get("camisas"))
check("915 guías (RYC + Indy + Nubo)", familias.get("guias", {}).get("total") == 915, familias.get("guias"))
check("201 subconjuntos", familias.get("subconjuntos", {}).get("total") == 201, familias.get("subconjuntos"))
check("el catálogo del proveedor está importado", crac.get_info_catalogo()["total"] == 64250)

print("\n=== 1. Sin filtros no se devuelve el catálogo ===")
vacio = tecnicos.buscar("camisas", {})
check("sin ningún filtro no hay resultados", vacio["total"] == 0 and not vacio["capped"], vacio)
check("una familia que no existe tampoco explota", tecnicos.buscar("pistones", {"codigo": "x"})["total"] == 0)

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
check("Ø vástago 11 ±0,1 da 30 guías", solo_vastago["total"] == 30, solo_vastago["total"])
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

sin_equivalencia = tecnicos.buscar("camisas", {"codigo": "UC 1694"})
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
          [s["label"] for s in ficha["sobremedidas_match"]] == ['-.060"'], ficha["sobremedidas_match"])

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
check("con sesión, las familias", resp.status_code == 200 and len(resp.get_json()) == 3, resp.get_json())
resp = cliente.get("/api/tecnicos/buscar?familia=camisas&diam_int=56.5&tol_diam_int=0")
datos = resp.get_json()
check("y la búsqueda", resp.status_code == 200 and "UC 2112" in [r["codigo"] for r in datos["resultados"]], datos)

print("\n" + "=" * 50)
if fallos:
    print(f"FALLARON {len(fallos)}: {fallos}")
    sys.exit(1)
print("TODO OK")
