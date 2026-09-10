"""
Suite de verificación del PRESUPUESTO RÁPIDO: el atajo donde se tilda el motor,
la mano de obra y las categorías de repuestos, y el total lo escribe el dueño.

Cómo se corre: ver tests/README.md. Resumen:

    DATA_DIR=/tmp/rect-test python tests/backend_rapido.py

DATA_DIR es obligatorio y tiene que apuntar a una carpeta descartable: la suite
crea presupuestos y los borra al terminar. NUNCA apuntarla a la base real ni
correrla contra producción.

Qué cubre, y por qué cada cosa:

  · Que el total guardado sea EXACTAMENTE el número escrito y no la suma de los
    renglones. Es lo único que el cliente lee del presupuesto: si el backend
    recalculara, el papel diría otro precio que el que se acordó.
  · Que un repuesto tildado por categoría —sin código y sin precio— entre como
    línea válida y llegue al PDF con el nombre de la categoría. El PDF no
    imprime precios por renglón, así que la categoría es TODO lo que se ve.
  · Que editar el presupuesto después no convierta el total escrito en una suma.
    Es la forma más fácil de perder el número sin que nadie se entere: se corrige
    una descripción y el total cambia solo.
  · Que un presupuesto normal (sin total escrito) siga sumando como siempre.
"""
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND = os.path.join(RAIZ, "webapp", "backend")
sys.path.insert(0, BACKEND)

if not os.environ.get("DATA_DIR"):
    sys.exit("Falta DATA_DIR: apuntalo a una carpeta descartable, nunca a la base real.")

# config lee el entorno al importarse, así que esto va antes de tocar `app`.
# Misma regla que las otras suites: la clave sale de APP_PASSWORD si está, y si
# no de una descartable — acá se habla por el test client de Flask, no hay
# servidor con el que coincidir.
os.environ["APP_USERNAME"] = os.environ.get("APP_USERNAME", "admin")
from werkzeug.security import generate_password_hash  # noqa: E402
CLAVE = os.environ.get("APP_PASSWORD") or "clave-descartable-de-la-suite"
os.environ["APP_PASSWORD_HASH"] = generate_password_hash(CLAVE)

from app import create_app, db, facra  # noqa: E402
from app.routes.presupuestos import _items_para_pdf  # noqa: E402

NOMENCLADOR = os.path.join(RAIZ, "Excel", "Facra", "nomenclador_1779985703.xls")
LISTA_MO = os.path.join(RAIZ, "Excel", "Facra", "lista_orientadora_de_mano_de_obra_1779985697.xls")

CLIENTE_PRUEBA = "Suite Rapido"
CATEGORIAS = ["Aros", "Cojinetes de biela", "Cojinetes de bancada"]
TOTAL_ESCRITO = 1500000

fallos = []


def check(nombre, condicion, detalle=""):
    if condicion:
        print(f"  OK   {nombre}")
    else:
        print(f"  FALLA {nombre} — {detalle}")
        fallos.append(nombre)


def limpiar():
    """Deja la base sin lo que crea esta suite (y sin lo que dejó una corrida anterior)."""
    with db.get_connection() as conn:
        ids = [r[0] for r in conn.execute(
            "SELECT p.id FROM presupuestos p JOIN clientes c ON c.id = p.cliente_id "
            "WHERE c.nombre LIKE ?", (f"{CLIENTE_PRUEBA}%",))]
    for pid in ids:
        db.eliminar_presupuesto(pid)
    with db.get_connection() as conn:
        conn.execute("DELETE FROM clientes WHERE nombre LIKE ?", (f"{CLIENTE_PRUEBA}%",))


print("\n=== 0. Preparar la base de prueba ===")
db.init_db()
if not facra.get_motores():
    print("  importando FACRA…")
    print("   ", facra.importar_nomenclador(NOMENCLADOR)[1])
    print("   ", facra.importar_lista_orientadora(LISTA_MO)[1])
limpiar()
check("motores cargados", len(facra.get_motores()) == 491)

with db.get_connection() as conn:
    MOTOR_ID, MOTOR, LISTA = conn.execute(
        "SELECT id, motor, lista_num FROM motores WHERE lista_num = 8 LIMIT 1").fetchone()
SERVICIOS = [s for s in facra.get_servicios_para_lista(LISTA) if s["precio"]]
SID_A, SID_B = SERVICIOS[0]["id"], SERVICIOS[1]["id"]
SUMA_MANO_OBRA = SERVICIOS[0]["precio"] * 2 + SERVICIOS[1]["precio"]
print(f"  motor de prueba: {MOTOR} (lista {LISTA})")
print(f"  la mano de obra tildada suma {SUMA_MANO_OBRA} según la lista")

app = create_app()
cliente = app.test_client()
r = cliente.post("/api/auth/login", json={"usuario": os.environ["APP_USERNAME"], "password": CLAVE})
check("login OK", r.status_code == 200, r.get_json())


def cuerpo_rapido(total_manual=TOTAL_ESCRITO, nombre=CLIENTE_PRUEBA):
    """El payload que manda la pantalla del presupuesto rápido."""
    return {
        "cliente_nombre": nombre,
        "motor_id": MOTOR_ID,
        "ajuste_pct": 0,
        "total_manual": total_manual,
        "items": [
            {"servicio_id": SID_A, "cantidad": 2},
            {"servicio_id": SID_B, "cantidad": 1},
            # Los repuestos del rápido: categoría, sin código y sin precio.
            *[{"tipo": "repuesto", "descripcion": c, "categoria": c,
               "cantidad": 1, "precio_unitario": 0} for c in CATEGORIAS],
        ],
    }


print("\n=== 1. Se emite con el total escrito a mano ===")
r = cliente.post("/api/presupuestos", json=cuerpo_rapido())
check("crear responde 201", r.status_code == 201, r.get_json())
detalle = r.get_json()
pid = detalle["id"]
check("el total es EXACTAMENTE el escrito", detalle["total"] == TOTAL_ESCRITO, detalle["total"])
check("y no la suma de los renglones", SUMA_MANO_OBRA != TOTAL_ESCRITO, "elegí otro número de prueba")
check("queda marcado como escrito a mano", detalle["total_manual"] == TOTAL_ESCRITO, detalle["total_manual"])
check("el GET del detalle devuelve el mismo total",
      cliente.get(f"/api/presupuestos/{pid}").get_json()["total"] == TOTAL_ESCRITO)


print("\n=== 2. Los repuestos tildados por categoría ===")
items = cliente.get(f"/api/presupuestos/{pid}/items").get_json()
repuestos = [it for it in items if it["tipo"] == "repuesto"]
servicios = [it for it in items if it["tipo"] != "repuesto"]
check("entraron los tres repuestos", len(repuestos) == 3, len(repuestos))
check("entraron los dos servicios", len(servicios) == 2, len(servicios))
check("cada repuesto conserva su categoría",
      sorted(it["categoria"] for it in repuestos) == sorted(CATEGORIAS),
      [it["categoria"] for it in repuestos])
check("van sin código del proveedor", all(it["repuesto_codigo"] is None for it in repuestos))
check("y sin precio", all((it["precio_unitario"] or 0) == 0 for it in repuestos))
check("la mano de obra sí toma el precio de la lista",
      all(it["precio_unitario"] for it in servicios), servicios)

pdf_servicios, pdf_repuestos, pdf_opcionales = _items_para_pdf(pid)
check("el PDF lista los dos trabajos", len(pdf_servicios) == 2, len(pdf_servicios))
check("el PDF lista las tres categorías, con su nombre",
      sorted(x["descripcion"] for x in pdf_repuestos) == sorted(CATEGORIAS),
      [x["descripcion"] for x in pdf_repuestos])
check("sin caja de opcionales", pdf_opcionales == [], pdf_opcionales)
check("la cantidad del trabajo llega al PDF (para el ×N)",
      sorted(x["cantidad"] for x in pdf_servicios) == [1, 2],
      [x["cantidad"] for x in pdf_servicios])

pdfs = cliente.get(f"/api/presupuestos/{pid}/pdfs").get_json()
check("se generó el PDF", len(pdfs) == 1, pdfs)


print("\n=== 3. Editarlo no se lleva puesto el total ===")
payload_edicion = {
    "notas": "Una nota agregada después",
    "ajuste_pct": 0,
    "items": [
        {"servicio_id": it["servicio_id"], "descripcion_custom": it["descripcion_custom"],
         "cantidad": it["cantidad"], "precio_unitario": it["precio_unitario"],
         "opcional": bool(it["opcional"])}
        for it in servicios
    ] + [
        {"tipo": "repuesto", "repuesto_codigo": None, "descripcion": it["descripcion_custom"],
         "categoria": it["categoria"], "cantidad": it["cantidad"],
         "precio_unitario": it["precio_unitario"] or 0, "opcional": bool(it["opcional"])}
        for it in repuestos
    ],
}
# Sin total_manual en el payload: es lo que manda cualquier pantalla vieja o
# cualquier edición que no hable del total. El número escrito tiene que quedar.
r = cliente.put(f"/api/presupuestos/{pid}", json=payload_edicion)
check("editar responde 200", r.status_code == 200, r.get_json())
check("el total sigue siendo el escrito", r.get_json()["total"] == TOTAL_ESCRITO, r.get_json()["total"])
check("y sigue marcado como escrito a mano", r.get_json()["total_manual"] == TOTAL_ESCRITO)

r = cliente.put(f"/api/presupuestos/{pid}", json={**payload_edicion, "total_manual": 1750000})
check("escribir un total nuevo lo cambia", r.get_json()["total"] == 1750000, r.get_json()["total"])
check("el detalle guardado también",
      cliente.get(f"/api/presupuestos/{pid}").get_json()["total"] == 1750000)

r = cliente.put(f"/api/presupuestos/{pid}", json={**payload_edicion, "total_manual": "mil quinientos"})
check("un total que no es número da 400", r.status_code == 400, r.status_code)
check("y no toca el presupuesto",
      cliente.get(f"/api/presupuestos/{pid}").get_json()["total"] == 1750000)


print("\n=== 4. El presupuesto normal no cambia ===")
r = cliente.post("/api/presupuestos", json={
    "cliente_nombre": f"{CLIENTE_PRUEBA} normal",
    "motor_id": MOTOR_ID,
    "ajuste_pct": 0,
    "items": [{"servicio_id": SID_A, "cantidad": 2}, {"servicio_id": SID_B, "cantidad": 1}],
})
normal = r.get_json()
check("crear responde 201", r.status_code == 201, normal)
check("el total es la suma de los renglones", normal["total"] == SUMA_MANO_OBRA, normal["total"])
check("no queda marcado como escrito a mano", normal["total_manual"] is None, normal["total_manual"])

r = cliente.post("/api/presupuestos", json={
    **cuerpo_rapido(total_manual="dos millones", nombre=f"{CLIENTE_PRUEBA} invalido")})
check("un total que no es número da 400 al crear", r.status_code == 400, r.status_code)
r = cliente.post("/api/presupuestos", json={
    **cuerpo_rapido(total_manual=-5, nombre=f"{CLIENTE_PRUEBA} negativo")})
check("un total negativo da 400", r.status_code == 400, r.status_code)
r = cliente.post("/api/presupuestos", json={
    "cliente_nombre": f"{CLIENTE_PRUEBA} vacio", "motor_id": MOTOR_ID,
    "items": [], "total_manual": TOTAL_ESCRITO,
})
check("un rápido sin un solo tilde da 400", r.status_code == 400, r.status_code)


print("\n=== 5. Borrar lo de la prueba ===")
limpiar()
check("no quedan presupuestos de la suite", not [
    p for p in db.get_presupuestos() if str(p.get("cliente") or "").startswith(CLIENTE_PRUEBA)])

print("\n" + "=" * 50)
if fallos:
    print(f"FALLARON {len(fallos)}: {fallos}")
    sys.exit(1)
print("TODO OK")
