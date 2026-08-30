"""
Suite de verificación de los PRECIOS PROPIOS de mano de obra: la capa del taller
sobre la lista de la Cámara (app/precios.py + la pantalla "Editar Precios").

Cómo se corre: ver tests/README.md. Resumen:

    DATA_DIR=/tmp/rect-test python tests/backend_precios.py

DATA_DIR es obligatorio y tiene que apuntar a una carpeta descartable: la suite
crea presupuestos y precios propios, y los borra al terminar. NUNCA apuntarla a
la base real ni correrla contra producción.

Qué cubre, y por qué cada cosa:

  · Un precio propio pisa a la Cámara en las TRES rutas de lectura (los
    servicios de un motor, el armado del presupuesto y la recotización). Son
    tres porque `get_servicios_para_lista` es el único punto de enganche: si
    alguna se saltara la capa, el sistema cotizaría con dos precios distintos
    según de qué pantalla venga.
  · Las dos reglas de los porcentajes: el ajuste general NO pisa un precio
    propio, y el ajuste del presupuesto SÍ se le aplica encima. Son la parte más
    fácil de romper sin darse cuenta, y romperlas cambia lo que se cobra.
  · Que reimportar FACRA no se lleve puesto un precio del taller. La lista de la
    Cámara se reimporta cada una o dos semanas: si esto falla, el precio
    desaparece en silencio en medio de una importación de rutina.
  · Que un presupuesto ya emitido conserve su total exacto pase lo que pase con
    la tarifa.
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

from app import create_app, db, facra, precios  # noqa: E402
from app.helpers import pesos  # noqa: E402
from app.routes.presupuestos import _resolver_items  # noqa: E402

NOMENCLADOR = os.path.join(RAIZ, "Excel", "Facra", "nomenclador_1779985703.xls")
LISTA_MO = os.path.join(RAIZ, "Excel", "Facra", "lista_orientadora_de_mano_de_obra_1779985697.xls")

fallos = []


def check(nombre, condicion, detalle=""):
    if condicion:
        print(f"  OK   {nombre}")
    else:
        print(f"  FALLA {nombre} — {detalle}")
        fallos.append(nombre)


def limpiar():
    """Deja la base como estaba: sin precios propios, sin ajuste y sin lo creado."""
    with db.get_connection() as conn:
        ids = [r[0] for r in conn.execute(
            "SELECT p.id FROM presupuestos p JOIN clientes c ON c.id = p.cliente_id "
            "WHERE c.nombre LIKE 'Suite Precios%'")]
    for pid in ids:
        db.eliminar_presupuesto(pid)
    with db.get_connection() as conn:
        conn.execute("DELETE FROM clientes WHERE nombre LIKE 'Suite Precios%'")
        conn.execute("DELETE FROM precios_mano_obra")
        conn.execute("DELETE FROM precios_mano_obra_historial")
        conn.execute("DELETE FROM servicios WHERE item_num = 99999")
        conn.execute("DELETE FROM app_meta WHERE clave = 'ajuste_mano_obra_pct'")


print("\n=== 0. Preparar la base de prueba ===")
db.init_db()
if not facra.get_motores():
    print("  importando FACRA…")
    print("   ", facra.importar_nomenclador(NOMENCLADOR)[1])
    print("   ", facra.importar_lista_orientadora(LISTA_MO)[1])
limpiar()
check("motores cargados", len(facra.get_motores()) == 491)
check("servicios cargados", len(facra.get_servicios_para_lista(8)) == 235)

with db.get_connection() as conn:
    MOTOR_ID, MOTOR, LISTA = conn.execute(
        "SELECT id, motor, lista_num FROM motores WHERE lista_num = 8 LIMIT 1").fetchone()
SERVICIOS = {s["id"]: s for s in facra.get_servicios_para_lista(LISTA)}
SID = next(i for i, s in SERVICIOS.items() if s["precio"])
FACRA_8 = SERVICIOS[SID]["precio_facra"]
print(f"  motor de prueba: {MOTOR} (lista {LISTA})")
print(f"  servicio de prueba: #{SID} {SERVICIOS[SID]['descripcion']} — Cámara {pesos(FACRA_8)}")


print("\n=== 1. Sin nada configurado, manda la Cámara ===")
fila = SERVICIOS[SID]
check("el precio es el de la Cámara", fila["precio"] == pesos(FACRA_8), f"{fila['precio']} != {pesos(FACRA_8)}")
check("es_propio en False", fila["es_propio"] is False)
check("desfasado en False", fila["desfasado"] is False)
check("precio_facra viaja junto al precio", fila["precio_facra"] == FACRA_8)


print("\n=== 2. Un precio propio pisa a la Cámara ===")
precios.guardar(SID, LISTA, 280000, origen="pantalla")
fila = {s["id"]: s for s in facra.get_servicios_para_lista(LISTA)}[SID]
check("el precio pasa a ser el propio", fila["precio"] == 280000, fila["precio"])
check("es_propio en True", fila["es_propio"] is True)
check("el de la Cámara se sigue viendo", fila["precio_facra"] == FACRA_8)
otra = {s["id"]: s for s in facra.get_servicios_para_lista(3)}[SID]
check("no se filtra a otra lista", otra["es_propio"] is False)


print("\n=== 3. Los dos porcentajes ===")
precios.set_ajuste_general_pct(25)
filas = {s["id"]: s for s in facra.get_servicios_para_lista(LISTA)}
check("el ajuste general NO pisa un precio propio", filas[SID]["precio"] == 280000, filas[SID]["precio"])
sin_propio = next(s for s in filas.values() if not s["es_propio"] and s["precio_facra"])
check("el ajuste general SÍ aplica donde no hay precio propio",
      sin_propio["precio"] == pesos(sin_propio["precio_facra"] * 1.25),
      f"{sin_propio['precio']} vs {pesos(sin_propio['precio_facra'] * 1.25)}")
precios.set_ajuste_general_pct(0)

# El ajuste del presupuesto es otra cosa: es la palanca de UNA cotización, y sí
# alcanza a los precios propios (si no, un descuento a un cliente dejaría afuera
# justo los renglones que el taller tarifó).
res, descartados = _resolver_items([{"servicio_id": SID, "cantidad": 1}], LISTA, ajuste_pct=10)
check("sin ítems descartados", not descartados, descartados)
check("el ajuste del presupuesto SÍ se aplica sobre un precio propio",
      res[0]["precio_aplicado"] == pesos(280000 * 1.10), res[0]["precio_aplicado"])

res, _ = _resolver_items(
    [{"servicio_id": SID, "cantidad": 1, "precio_unitario": 123456}], LISTA, ajuste_pct=10)
check("un precio pisado en ESE presupuesto ignora el ajuste",
      res[0]["precio_aplicado"] == 123456, res[0]["precio_aplicado"])

res, _ = _resolver_items([{"servicio_id": SID, "cantidad": 3}], LISTA, ajuste_pct=0)
check("la cantidad multiplica el precio propio",
      res[0]["precio_aplicado"] == 280000 * 3, res[0]["precio_aplicado"])


print("\n=== 4. Propagación proporcional a las trece listas ===")
with db.get_connection() as conn:
    crudos = precios._precios_facra(conn, SID)
prev = precios.previsualizar_propagacion(SID, LISTA, 280000)
check("devuelve las trece listas", len(prev) == 13, len(prev))
check("la lista editada queda con el precio exacto",
      next(f for f in prev if f["lista_num"] == LISTA)["precio_propuesto"] == 280000)
proporcionales = all(
    f["precio_propuesto"] == pesos(280000 * (crudos[f["lista_num"]] / crudos[LISTA]))
    for f in prev if f["precio_propuesto"] is not None and crudos.get(f["lista_num"])
)
check("cada lista mantiene la proporción de la Cámara para ESE servicio", proporcionales)
check("previsualizar no escribe nada",
      len(precios.get_propios(1)) == 0, "la lista 1 no debería tener precio propio todavía")

precios.guardar(SID, LISTA, 280000, propagar=True)
propagadas = sum(1 for n in precios.LISTAS if SID in precios.get_propios(n))
check("propagar escribe las trece", propagadas == 13, propagadas)

# Un servicio al que le falta la lista de referencia no se puede propagar: el
# sistema no inventa un número donde no hay proporción con la cual calcularlo.
with db.get_connection() as conn:
    huerfano = conn.execute("SELECT id FROM servicios WHERE l1 IS NULL OR l1 = 0 LIMIT 1").fetchone()
if huerfano:
    prev_h = precios.previsualizar_propagacion(huerfano[0], 1, 50000)
    sin_precio = [f for f in prev_h if f["precio_propuesto"] is None]
    check("sin precio de referencia no se propaga (queda en None, no inventa)",
          len(sin_precio) == 12, len(sin_precio))
else:
    print("  ..   no hay servicios sin l1 en esta base; caso borde no verificado")

precios.borrar(SID)
check("↺ sin lista borra las trece", precios.listar_propios() == [])


print("\n=== 5. Un presupuesto emitido no cambia nunca ===")
precios.guardar(SID, LISTA, 200000)
pid = db.guardar_presupuesto(
    cliente_nombre="Suite Precios Cliente", motor_id=MOTOR_ID,
    items=[{"servicio_id": SID, "descripcion_custom": None,
            "precio_aplicado": 200000, "cantidad": 1}])
total_emitido = db.get_presupuesto_detalle(pid)["total"]
precios.guardar(SID, LISTA, 777777)          # la tarifa cambia DESPUÉS de emitir
precios.set_ajuste_general_pct(50)
detalle = db.get_presupuesto_detalle(pid)
items = db.get_presupuesto_items_full(pid)
check("el total sigue siendo el emitido", detalle["total"] == total_emitido == 200000,
      f"{detalle['total']} vs {total_emitido}")
check("la línea conserva su precio congelado", pesos(items[0]["precio_aplicado"]) == 200000,
      items[0]["precio_aplicado"])
precios.set_ajuste_general_pct(0)


print("\n=== 6. Reimportar FACRA no se lleva puesto un precio del taller ===")
with db.get_connection() as conn:
    conn.execute("INSERT INTO servicios (item_num, descripcion) VALUES (99999, 'TRABAJO QUE SALE DE LA LISTA')")
    fantasma = conn.execute("SELECT id FROM servicios WHERE item_num = 99999").fetchone()[0]
precios.guardar(fantasma, LISTA, 55000)
n, msg = facra.importar_lista_orientadora(LISTA_MO)
check("la reimportación no falla", n > 0, msg)
with db.get_connection() as conn:
    sigue = conn.execute("SELECT 1 FROM servicios WHERE id = ?", (fantasma,)).fetchone()
check("un servicio con precio propio sobrevive a la reimportación", bool(sigue))
check("y su precio propio sigue ahí", fantasma in precios.get_propios(LISTA))

# La regla vieja tiene que seguir viva: sin precio propio ni presupuesto, el
# servicio que ya no viene en la lista se borra como siempre.
precios.borrar(fantasma)
n, msg = facra.importar_lista_orientadora(LISTA_MO)
check("la reimportación no falla (segunda)", n > 0, msg)
with db.get_connection() as conn:
    sigue = conn.execute("SELECT 1 FROM servicios WHERE id = ?", (fantasma,)).fetchone()
check("sin precio propio, el servicio huérfano se borra como siempre", not sigue)

check("los precios propios sobreviven a la reimportación",
      SID in precios.get_propios(LISTA), "se perdió el precio del servicio de prueba")


print("\n=== 7. Desfasaje: la Cámara se movió después de fijar el precio ===")
with db.get_connection() as conn:
    conn.execute("UPDATE precios_mano_obra SET precio_facra_al_fijar = 1 WHERE servicio_id = ?", (SID,))
fila = {s["id"]: s for s in facra.get_servicios_para_lista(LISTA)}[SID]
check("la fila se marca desfasada", fila["desfasado"] is True)
check("y 'Mis precios' también lo marca", any(p["desfasado"] for p in precios.listar_propios()))
check("el precio propio NO cambia solo", fila["precio"] == 777777, fila["precio"])


print("\n=== 8. Historial: todo cambio queda registrado ===")
with db.get_connection() as conn:
    hist = conn.execute(
        "SELECT precio_antes, precio_despues FROM precios_mano_obra_historial "
        "WHERE servicio_id = ? AND lista_num = ? ORDER BY id", (SID, LISTA)).fetchall()
check("el primer alta va con precio_antes NULL", hist[0][0] is None, hist[0])
check("hay un renglón por cada cambio", len(hist) >= 3, len(hist))
precios.borrar(SID, LISTA)
with db.get_connection() as conn:
    ultimo = conn.execute(
        "SELECT precio_antes, precio_despues FROM precios_mano_obra_historial "
        "WHERE servicio_id = ? AND lista_num = ? ORDER BY id DESC LIMIT 1", (SID, LISTA)).fetchone()
check("volver a la Cámara queda registrado con precio_despues NULL",
      ultimo[0] == 777777 and ultimo[1] is None, ultimo)


print("\n=== 9. La API por HTTP ===")
app = create_app()
c = app.test_client()

check("401 sin sesión (mano-obra)", c.get("/api/precios/mano-obra?lista=8").status_code == 401)
check("401 sin sesión (mios)", c.get("/api/precios/mios").status_code == 401)
check("401 sin sesión (guardar)",
      c.post("/api/precios/mano-obra", json={"servicio_id": SID, "lista_num": 8, "precio": 1}).status_code == 401)

login = c.post("/api/auth/login", json={"usuario": os.environ["APP_USERNAME"], "password": CLAVE})
check("login", login.status_code == 200, login.status_code)

r = c.get(f"/api/precios/mano-obra?lista={LISTA}").get_json()
check("la lista trae los 235 trabajos", len(r["servicios"]) == 235, len(r["servicios"]))
check("y el ajuste general", r["ajuste_general_pct"] == 0)

listas = c.get("/api/precios/listas").get_json()
check("las trece listas con sus motores", len(listas) == 13 and sum(l["motores"] for l in listas) == 491)
check("la lista 8 es la que más motores tiene",
      max(listas, key=lambda l: l["motores"])["lista_num"] == 8)

check("400 sin lista", c.get("/api/precios/mano-obra").status_code == 400)
check("400 con lista fuera de rango", c.get("/api/precios/mano-obra?lista=14").status_code == 400)
check("400 con lista no numérica", c.get("/api/precios/mano-obra?lista=ocho").status_code == 400)
check("400 con precio negativo",
      c.post("/api/precios/mano-obra", json={"servicio_id": SID, "lista_num": LISTA, "precio": -5}).status_code == 400)
check("400 con precio cero",
      c.post("/api/precios/mano-obra", json={"servicio_id": SID, "lista_num": LISTA, "precio": 0}).status_code == 400)
check("404 con servicio inexistente",
      c.post("/api/precios/mano-obra", json={"servicio_id": 987654, "lista_num": LISTA, "precio": 100}).status_code == 404)
check("400 con % desmedido", c.put("/api/precios/ajuste-general", json={"pct": 9999}).status_code == 400)
check("400 con % no numérico", c.put("/api/precios/ajuste-general", json={"pct": "mucho"}).status_code == 400)

check("guardar por HTTP",
      c.post("/api/precios/mano-obra",
             json={"servicio_id": SID, "lista_num": LISTA, "precio": 300000}).status_code == 200)
mios = c.get("/api/precios/mios").get_json()
check("aparece en 'Mis precios'", len(mios) == 1 and mios[0]["precio"] == 300000, mios)
check("con su origen", mios[0]["origen"] == "pantalla", mios[0]["origen"])

# El lote es lo que manda el wizard al confirmar con el tilde puesto.
r = c.post("/api/precios/mano-obra/lote", json={
    "lista_num": LISTA, "origen": "presupuesto", "presupuesto_id": pid,
    "precios": [{"servicio_id": SID, "precio": 320000}]})
check("el lote guarda", r.status_code == 200 and r.get_json()["guardados"][0]["precio"] == 320000)
mios = c.get("/api/precios/mios").get_json()
check("el lote deja registrado de qué presupuesto salió",
      mios[0]["origen"] == "presupuesto" and mios[0]["presupuesto_id"] == pid, mios[0])
check("el lote rechaza la tanda entera si un renglón es inválido",
      c.post("/api/precios/mano-obra/lote", json={
          "lista_num": LISTA,
          "precios": [{"servicio_id": SID, "precio": 1000}, {"servicio_id": SID, "precio": -1}],
      }).status_code == 400)
check("y no guardó nada de esa tanda",
      c.get("/api/precios/mios").get_json()[0]["precio"] == 320000)
check("400 con lote vacío",
      c.post("/api/precios/mano-obra/lote", json={"lista_num": LISTA, "precios": []}).status_code == 400)

prev = c.get(f"/api/precios/mano-obra/propagacion?servicio_id={SID}&lista={LISTA}&precio=320000").get_json()
check("la vista previa devuelve trece filas", len(prev) == 13, len(prev))
check("404 de propagación con servicio inexistente",
      c.get(f"/api/precios/mano-obra/propagacion?servicio_id=987654&lista={LISTA}&precio=1").status_code == 404)

check("el ↺ por HTTP",
      c.delete("/api/precios/mano-obra", json={"servicio_id": SID, "lista_num": LISTA}).status_code == 200)
check("y 'Mis precios' queda vacío", c.get("/api/precios/mios").get_json() == [])
check("404 del ↺ con servicio inexistente",
      c.delete("/api/precios/mano-obra", json={"servicio_id": 987654}).status_code == 404)

check("GET del ajuste general", c.get("/api/precios/ajuste-general").get_json()["pct"] == 0)
check("PUT del ajuste general", c.put("/api/precios/ajuste-general", json={"pct": 15}).get_json()["pct"] == 15)
check("y se lee de vuelta", c.get("/api/precios/ajuste-general").get_json()["pct"] == 15)


print("\n=== 10. Limpieza ===")
limpiar()
check("no quedaron precios propios", precios.listar_propios() == [])
check("el ajuste general volvió a 0", precios.get_ajuste_general_pct() == 0)
with db.get_connection() as conn:
    check("no quedaron presupuestos de la suite",
          conn.execute("SELECT COUNT(*) FROM presupuestos p JOIN clientes c ON c.id = p.cliente_id "
                       "WHERE c.nombre LIKE 'Suite Precios%'").fetchone()[0] == 0)
check("los 235 servicios de FACRA siguen enteros", len(facra.get_servicios_para_lista(8)) == 235)


print("\n" + "=" * 60)
if fallos:
    print(f"FALLARON {len(fallos)} verificaciones:")
    for f in fallos:
        print(f"  · {f}")
    sys.exit(1)
print("Todas las verificaciones pasaron.")
