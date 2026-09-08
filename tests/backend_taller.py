"""
Suite de verificación del PANEL DEL TALLER: los dos roles, los cuatro estados y
—lo más importante— que al taller no le llegue ningún precio.

Cómo se corre: ver tests/README.md. Resumen:

    DATA_DIR=/tmp/rect-test python tests/backend_taller.py

DATA_DIR es obligatorio y tiene que apuntar a una carpeta descartable: la suite
crea clientes y presupuestos, y los borra al terminar. NUNCA apuntarla a la base
real ni correrla contra producción.

Qué cubre, y por qué cada cosa:

  · Que la cuenta del taller NO alcance ningún endpoint con precios. Es la razón
    de ser de todo esto: si el corte no está en el servidor, esconder los
    precios en la interfaz no sirve de nada — basta con abrir /api/presupuestos
    en otra pestaña. Se prueba endpoint por endpoint, y además con la regla
    general (cualquier cosa fuera de /api/taller da 403), que es la que protege
    los endpoints que se agreguen en el futuro.
  · Que lo que SÍ devuelve /api/taller no traiga un precio ni por accidente. No
    se revisan campos de a uno: se recorre el JSON entero buscando cualquier
    clave que hable de plata.
  · Que un presupuesto sin aprobar no aparezca como trabajo, y que aprobarlo lo
    haga aparecer. Es la puerta de entrada al panel.
  · Los cuatro estados, para adelante y para atrás, movidos por los dos roles.
  · Que las cosas de la oficina (marcar urgente, poner fecha de entrega) le den
    403 al taller aun estando dentro de /api/taller.
"""
import json
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND = os.path.join(RAIZ, "webapp", "backend")
sys.path.insert(0, BACKEND)

if not os.environ.get("DATA_DIR"):
    sys.exit("Falta DATA_DIR: apuntalo a una carpeta descartable, nunca a la base real.")

os.environ["APP_USERNAME"] = os.environ.get("APP_USERNAME", "admin")
os.environ["TALLER_USERNAME"] = os.environ.get("TALLER_USERNAME", "taller")
from werkzeug.security import generate_password_hash  # noqa: E402
CLAVE = os.environ.get("APP_PASSWORD") or "clave-descartable-de-la-suite"
os.environ["APP_PASSWORD_HASH"] = generate_password_hash(CLAVE)
os.environ["TALLER_PASSWORD_HASH"] = generate_password_hash(CLAVE)

from app import create_app, db, facra  # noqa: E402

NOMENCLADOR = os.path.join(RAIZ, "Excel", "Facra", "nomenclador_1779985703.xls")
LISTA_MO = os.path.join(RAIZ, "Excel", "Facra", "lista_orientadora_de_mano_de_obra_1779985697.xls")

MARCA = "Suite Taller"

fallos = []


def check(nombre, condicion, detalle=""):
    if condicion:
        print(f"  OK   {nombre}")
    else:
        print(f"  FALLA {nombre} — {detalle}")
        fallos.append(nombre)


def limpiar():
    with db.get_connection() as conn:
        ids = [r[0] for r in conn.execute(
            "SELECT p.id FROM presupuestos p JOIN clientes c ON c.id = p.cliente_id "
            "WHERE c.nombre LIKE ?", (f"{MARCA}%",))]
    for pid in ids:
        db.eliminar_presupuesto(pid)
    with db.get_connection() as conn:
        conn.execute("DELETE FROM clientes WHERE nombre LIKE ?", (f"{MARCA}%",))


# Cualquier clave del JSON que hable de plata. Si alguna aparece en lo que se le
# manda al taller, es un fallo — no importa qué valor traiga.
CLAVES_DE_PLATA = (
    "precio", "precios", "precio_unitario", "precio_aplicado", "precio_actual",
    "precio_facra", "subtotal", "subtotal_hoy", "precio_hoy", "total",
    "total_cotizado", "importe", "monto", "ajuste_pct", "ahorro",
)


def buscar_plata(dato, camino="raiz"):
    """Recorre el JSON entero y devuelve los caminos donde asoma un precio."""
    encontrados = []
    if isinstance(dato, dict):
        for clave, valor in dato.items():
            if clave in CLAVES_DE_PLATA:
                encontrados.append(f"{camino}.{clave}")
            encontrados.extend(buscar_plata(valor, f"{camino}.{clave}"))
    elif isinstance(dato, list):
        for i, valor in enumerate(dato):
            encontrados.extend(buscar_plata(valor, f"{camino}[{i}]"))
    return encontrados


print("\n=== 0. Preparar la base de prueba ===")
db.init_db()
if not facra.get_motores():
    print("  importando FACRA…")
    print("   ", facra.importar_nomenclador(NOMENCLADOR)[1])
    print("   ", facra.importar_lista_orientadora(LISTA_MO)[1])
limpiar()

with db.get_connection() as conn:
    MOTOR_ID, MOTOR, LISTA = conn.execute(
        "SELECT id, motor, lista_num FROM motores WHERE lista_num = 8 LIMIT 1").fetchone()
SERVICIOS = facra.get_servicios_para_lista(LISTA)
SID = next(s["id"] for s in SERVICIOS if s["precio"])

PID = db.guardar_presupuesto(
    cliente_nombre=f"{MARCA} Cliente", motor_id=MOTOR_ID,
    items=[
        {"servicio_id": SID, "descripcion_custom": None, "precio_aplicado": 150000, "cantidad": 1},
        {"tipo": "repuesto", "servicio_id": None, "descripcion_custom": "JUEGO DE AROS",
         "repuesto_codigo": "SUITE-TALLER-1", "cantidad": 1, "precio_unitario": 90000,
         "precio_aplicado": 90000, "categoria": "Aros"},
    ])
print(f"  motor de prueba: {MOTOR} · presupuesto #{PID}")
check("el presupuesto se creó con su total", db.get_presupuesto_detalle(PID)["total"] > 0)


print("\n=== 1. Sin aprobar no es un trabajo ===")
check("no aparece en el tablero", all(t["id"] != PID for t in db.get_trabajos()))
check("no tiene orden de trabajo", db.get_orden_trabajo(PID) is None)
check("no se le puede cambiar el estado",
      db.cambiar_estado_trabajo(PID, db.ESTADO_EN_PROCESO) is None)


print("\n=== 2. Aprobarlo lo manda al taller ===")
db.aprobar_presupuesto(PID, True, "admin")
trabajo = next((t for t in db.get_trabajos() if t["id"] == PID), None)
check("aparece en el tablero", trabajo is not None)
check("entra en 'Para hacer'", trabajo and trabajo["estado_trabajo"] == db.ESTADO_APROBADO,
      trabajo and trabajo["estado_trabajo"])
check("con su motor y su cliente", trabajo and trabajo["motor"] == MOTOR)
check("cuenta 1 trabajo y 1 repuesto",
      trabajo and (trabajo["tareas"], trabajo["repuestos"]) == (1, 1),
      trabajo and (trabajo["tareas"], trabajo["repuestos"]))
check("el movimiento quedó anotado", len(db.get_historial_trabajo(PID)) == 1)


print("\n=== 3. Los cuatro estados, para adelante y para atrás ===")
for estado in (db.ESTADO_EN_PROCESO, db.ESTADO_TERMINADO, db.ESTADO_ENTREGADO):
    movido = db.cambiar_estado_trabajo(PID, estado, "taller")
    check(f"pasa a {estado}", movido and movido["estado_trabajo"] == estado, movido)
check("volver atrás también se puede",
      db.cambiar_estado_trabajo(PID, db.ESTADO_EN_PROCESO, "admin")["desde"] == db.ESTADO_ENTREGADO)
try:
    db.cambiar_estado_trabajo(PID, "cualquier-cosa")
    check("un estado inventado se rechaza", False, "no lanzó ValueError")
except ValueError:
    check("un estado inventado se rechaza", True)
check("el historial guarda los cinco movimientos", len(db.get_historial_trabajo(PID)) == 5,
      len(db.get_historial_trabajo(PID)))
check("el conteo por estado cuadra", db.contar_trabajos_por_estado()[db.ESTADO_EN_PROCESO] >= 1)


print("\n=== 4. Desaprobar lo saca del panel, sin perder el historial ===")
db.aprobar_presupuesto(PID, False, "admin")
check("sale del tablero", all(t["id"] != PID for t in db.get_trabajos()))
check("el historial sigue estando", len(db.get_historial_trabajo(PID)) == 5)
db.aprobar_presupuesto(PID, True, "admin")
check("al volver a aprobarlo arranca en 'Para hacer'",
      db.get_orden_trabajo(PID)["estado_trabajo"] == db.ESTADO_APROBADO)


print("\n=== 5. La orden de trabajo no trae un solo precio ===")
orden = db.get_orden_trabajo(PID)
sobra = buscar_plata(orden)
check("ni un campo de plata en la orden", not sobra, sobra)
check("trae la mano de obra", len(orden["tareas"]) == 1, orden["tareas"])
check("trae el repuesto con su código",
      orden["repuestos"][0]["codigo"] == "SUITE-TALLER-1", orden["repuestos"])
check("y con su categoría", orden["repuestos"][0]["categoria"] == "Aros")

sobra = buscar_plata(db.get_trabajos())
check("ni un campo de plata en el tablero", not sobra, sobra)


print("\n=== 6. Notas, urgente y fecha de entrega ===")
check("la nota del taller se guarda",
      db.set_notas_taller(PID, "  el cigüeñal va a 0,25  ") == "el cigüeñal va a 0,25")
check("y la lee la oficina en el presupuesto",
      db.get_presupuesto_detalle(PID)["notas_taller"] == "el cigüeñal va a 0,25")
check("vaciarla la deja en None", db.set_notas_taller(PID, "   ") is None)
db.set_notas_taller(PID, "el cigüeñal va a 0,25")
check("urgente se marca", db.set_prioridad(PID, True) is True)
check("la fecha de entrega se guarda", db.set_entrega_prometida(PID, "2026-12-24") == "2026-12-24")
check("y se puede sacar", db.set_entrega_prometida(PID, "") is None)
db.set_entrega_prometida(PID, "2026-12-24")
trabajo = next(t for t in db.get_trabajos() if t["id"] == PID)
check("el tablero muestra urgente y fecha",
      trabajo["prioridad"] == 1 and trabajo["entrega_prometida"] == "2026-12-24", trabajo)


print("\n=== 7. Por HTTP: la oficina entra a todo ===")
app = create_app()
oficina = app.test_client()
check("401 sin sesión", oficina.get("/api/taller/trabajos").status_code == 401)
r = oficina.post("/api/auth/login", json={"usuario": os.environ["APP_USERNAME"], "password": CLAVE})
check("login de oficina", r.status_code == 200, r.status_code)
check("y viene con su rol", r.get_json()["rol"] == "oficina", r.get_json())
check("ve el tablero", oficina.get("/api/taller/trabajos").status_code == 200)
check("ve los presupuestos", oficina.get("/api/presupuestos").status_code == 200)
check("ve los precios", oficina.get("/api/precios/mios").status_code == 200)


print("\n=== 8. Por HTTP: al taller le llega SOLO su parte ===")
taller = app.test_client()
r = taller.post("/api/auth/login", json={"usuario": os.environ["TALLER_USERNAME"], "password": CLAVE})
check("login de taller", r.status_code == 200, r.status_code)
check("y viene con su rol", r.get_json()["rol"] == "taller", r.get_json())

# Endpoint por endpoint: todos los que muestran plata o dejan tocar el catálogo.
CERRADOS = [
    ("GET", f"/api/presupuestos/{PID}"),
    ("GET", f"/api/presupuestos/{PID}/items"),
    ("GET", f"/api/presupuestos/{PID}/grupos"),
    ("GET", f"/api/presupuestos/{PID}/pedido"),
    ("GET", "/api/presupuestos"),
    ("GET", "/api/precios/mios"),
    ("GET", "/api/precios/mano-obra?lista=8"),
    ("GET", "/api/motores"),
    ("GET", "/api/repuestos?q=aro"),
    ("GET", "/api/clientes"),
    ("GET", "/api/servicios"),
    ("GET", "/api/tecnicos/catalogos"),
    ("GET", "/api/backup/estado"),
    ("POST", f"/api/presupuestos/{PID}/aprobar"),
    ("DELETE", f"/api/presupuestos/{PID}"),
]
for metodo, ruta in CERRADOS:
    r = taller.open(ruta, method=metodo, json={} if metodo != "GET" else None)
    check(f"403 en {metodo} {ruta}", r.status_code == 403, r.status_code)

check("el presupuesto sigue existiendo después de todo eso",
      db.get_presupuesto_detalle(PID) is not None)

# Y la regla general, que es la que cubre lo que se agregue mañana.
r = taller.get("/api/una-ruta-que-no-existe")
check("403 (no 404) en cualquier /api desconocido: la lista es blanca", r.status_code == 403, r.status_code)


print("\n=== 9. Por HTTP: lo que el taller SÍ puede hacer ===")
r = taller.get("/api/taller/trabajos")
check("ve el tablero", r.status_code == 200, r.status_code)
sobra = buscar_plata(r.get_json())
check("y el tablero no trae plata", not sobra, sobra)

r = taller.get(f"/api/taller/trabajos/{PID}")
check("ve la orden de trabajo", r.status_code == 200, r.status_code)
sobra = buscar_plata(r.get_json())
check("y la orden no trae plata", not sobra, sobra)

r = taller.post(f"/api/taller/trabajos/{PID}/estado", json={"estado": "en_proceso"})
check("mueve el trabajo a en_proceso", r.status_code == 200 and r.get_json()["estado_trabajo"] == "en_proceso",
      r.get_json())
r = taller.post(f"/api/taller/trabajos/{PID}/estado", json={"estado": "volar"})
check("un estado inventado da 400", r.status_code == 400, r.status_code)

r = taller.put(f"/api/taller/trabajos/{PID}/notas", json={"notas_taller": "falta la junta"})
check("escribe su nota", r.status_code == 200 and r.get_json()["notas_taller"] == "falta la junta", r.get_json())

r = taller.get(f"/api/taller/trabajos/{PID}/orden.pdf")
check("baja la orden en PDF", r.status_code == 200 and r.data[:4] == b"%PDF", r.status_code)

r = taller.get("/api/taller/resumen")
check("ve el resumen por estado", r.status_code == 200 and "terminado" in r.get_json(), r.get_json())


print("\n=== 10. Lo de la oficina le sigue estando cerrado al taller ===")
r = taller.post(f"/api/taller/trabajos/{PID}/prioridad", json={"prioridad": True})
check("403 al marcar urgente", r.status_code == 403, r.status_code)
r = taller.put(f"/api/taller/trabajos/{PID}/entrega", json={"entrega_prometida": "2027-01-01"})
check("403 al poner la fecha de entrega", r.status_code == 403, r.status_code)
check("la oficina sí puede marcar urgente",
      oficina.post(f"/api/taller/trabajos/{PID}/prioridad", json={"prioridad": False}).status_code == 200)
check("y sí puede poner la fecha",
      oficina.put(f"/api/taller/trabajos/{PID}/entrega", json={"entrega_prometida": "2027-01-01"}).status_code == 200)


print("\n=== 11. Sin la cuenta del taller configurada, el sistema anda igual ===")
guardado = os.environ.pop("TALLER_PASSWORD_HASH")
try:
    from app import config as _config
    _config.TALLER_PASSWORD_HASH = None
    solo = create_app().test_client()
    check("la oficina entra lo mismo",
          solo.post("/api/auth/login",
                    json={"usuario": os.environ["APP_USERNAME"], "password": CLAVE}).status_code == 200)
    check("y el taller no existe",
          solo.post("/api/auth/login",
                    json={"usuario": os.environ["TALLER_USERNAME"], "password": CLAVE}).status_code == 401)
finally:
    os.environ["TALLER_PASSWORD_HASH"] = guardado
    _config.TALLER_PASSWORD_HASH = guardado


print("\n=== 12. Limpieza ===")
limpiar()
check("no quedaron trabajos de la suite", all(not str(t["cliente"]).startswith(MARCA) for t in db.get_trabajos()))
with db.get_connection() as conn:
    check("ni movimientos huérfanos en el historial",
          conn.execute("SELECT COUNT(*) FROM trabajo_historial WHERE presupuesto_id = ?", (PID,)).fetchone()[0] == 0)


print("\n" + "=" * 60)
if fallos:
    print(f"FALLARON {len(fallos)} verificaciones:")
    for f in fallos:
        print(f"  · {f}")
    sys.exit(1)
print("Todas las verificaciones pasaron.")
