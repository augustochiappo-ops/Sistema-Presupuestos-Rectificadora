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
  · Lo del celular (2026-10-02): el motor escrito a mano (sin motor de la
    lista), el "a cotizar" (total NULL, no $0) y el aprobar al guardar, que
    tiene que dejar el motor en el tablero del taller en el mismo paso.
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


print("\n=== 5. Desde el celular: el motor escrito a mano ===")


def texto_del_pdf(presupuesto_id):
    """El texto del último PDF del presupuesto, leído de verdad (no lo que se
    le pasó al generador). None si pypdf no está instalado."""
    try:
        from pypdf import PdfReader
    except ImportError:
        return None
    from app import config
    version = cliente.get(f"/api/presupuestos/{presupuesto_id}/pdfs").get_json()[0]
    lector = PdfReader(os.path.join(config.PDFS_DIR, version["pdf_path"]))
    return " ".join(pagina.extract_text() or "" for pagina in lector.pages)


MOTOR_ESCRITO = "FORD 292 V8 DEL CAMIÓN"
TELEFONO = "11 2345 6789"
r = cliente.post("/api/presupuestos", json={
    "cliente_nombre": f"{CLIENTE_PRUEBA} celular",
    "cliente_telefono": TELEFONO,
    # Con espacios de más, como sale escribiendo con el pulgar.
    "motor_texto": "  Ford   292 V8 del   camión ",
    "notas": "Trae la tapa de cilindros aparte",
    "total_manual": 900000,
    "items": [
        {"servicio_id": SID_A, "cantidad": 8},
        {"servicio_id": SID_B, "cantidad": 1},
        {"tipo": "repuesto", "descripcion": "Aros", "categoria": "Aros",
         "cantidad": 1, "precio_unitario": 0},
    ],
})
celular = r.get_json()
check("crear con el motor escrito responde 201", r.status_code == 201, celular)
pid_celular = celular["id"]
check("el motor es el texto escrito, en mayúsculas como los de la lista y sin espacios de más",
      celular["motor"] == MOTOR_ESCRITO, celular["motor"])
check("no queda colgado de ningún motor de la lista", celular["motor_id"] is None, celular["motor_id"])
check("el total es el escrito", celular["total"] == 900000, celular["total"])
check("las notas del mostrador quedan guardadas",
      celular["notas"] == "Trae la tapa de cilindros aparte", celular["notas"])
check("el teléfono queda en la ficha del cliente", celular["cliente_telefono"] == TELEFONO,
      celular["cliente_telefono"])

items_cel = cliente.get(f"/api/presupuestos/{pid_celular}/items").get_json()
servicios_cel = [it for it in items_cel if it["tipo"] != "repuesto"]
check("entraron los dos trabajos, aunque el motor no esté en la lista",
      len(servicios_cel) == 2, len(servicios_cel))
check("y van en $0: sin lista no hay de dónde sacar el precio, y el total es el escrito",
      all(it["precio_unitario"] == 0 for it in servicios_cel), servicios_cel)
check("la cantidad se respeta (×8)", sorted(it["cantidad"] for it in servicios_cel) == [1, 8])

fila = next((p for p in cliente.get("/api/presupuestos").get_json() if p["id"] == pid_celular), None)
check("el historial muestra el motor escrito", fila and fila["motor"] == MOTOR_ESCRITO, fila)
encontrados = cliente.get("/api/presupuestos?motor=ford%20camion").get_json()
check("el buscador por motor lo encuentra (sin acentos, en cualquier orden)",
      any(p["id"] == pid_celular for p in encontrados), [p["id"] for p in encontrados])

texto = texto_del_pdf(pid_celular)
if texto is None:
    print("  (pypdf no está instalado: no se lee el PDF)")
else:
    check("el PDF dice el motor escrito", "FORD 292 V8" in texto, texto[:300])
    check("y el total escrito", "900.000" in texto, texto[:300])

r = cliente.put(f"/api/presupuestos/{pid_celular}", json={
    "ajuste_pct": 0,
    "motor_texto": "Ford 292 V8",
    "items": [{"servicio_id": it["servicio_id"], "cantidad": it["cantidad"],
               "precio_unitario": it["precio_unitario"]} for it in servicios_cel],
})
check("el motor escrito se puede corregir al editar",
      r.status_code == 200 and r.get_json()["motor"] == "FORD 292 V8", r.get_json())
check("y corregirlo no toca el total", r.get_json()["total"] == 900000, r.get_json()["total"])

# El de la lista no se cambia por texto: de él cuelgan los precios y la ficha.
r = cliente.put(f"/api/presupuestos/{pid}", json={**payload_edicion, "motor_texto": "Otro motor"})
check("a un presupuesto con motor de la lista el texto no le cambia el motor",
      r.get_json()["motor"] == MOTOR, r.get_json()["motor"])

r = cliente.get("/api/servicios")
lista_entera = r.get_json()
check("GET /api/servicios trae la lista entera de la Cámara",
      r.status_code == 200 and len(lista_entera) == len(facra.get_servicios_para_lista(LISTA))
      and len(lista_entera) > 200,
      (r.status_code, len(lista_entera or [])))
check("sin precio (sin motor no hay de qué lista sacarlo)",
      all(s["precio"] is None for s in lista_entera))

r = cliente.post("/api/presupuestos", json={
    "cliente_nombre": f"{CLIENTE_PRUEBA} sin motor", "motor_texto": "   ",
    "total_manual": 1000, "items": [{"servicio_id": SID_A, "cantidad": 1}],
})
check("sin motor (ni de la lista ni escrito) da 400", r.status_code == 400, r.status_code)
r = cliente.post("/api/presupuestos", json={
    "cliente_nombre": f"{CLIENTE_PRUEBA} sin lista", "motor_texto": "Motor raro",
    "items": [{"servicio_id": SID_A, "cantidad": 1}],
})
check("un presupuesto que SUMA, con motor sin lista, avisa con 400 (no 500 ni $0 inventado)",
      r.status_code == 400 and "no se pudieron procesar" in (r.get_json() or {}).get("error", ""),
      (r.status_code, r.get_json()))


print("\n=== 6. Sin precio todavía: \"a cotizar\" ===")
r = cliente.post("/api/presupuestos", json={
    "cliente_nombre": f"{CLIENTE_PRUEBA} a cotizar",
    "motor_texto": "Perkins 4.203",
    "a_cotizar": True,
    "items": [{"servicio_id": SID_A, "cantidad": 4}],
})
cotizar = r.get_json()
check("guardar sin precio responde 201", r.status_code == 201, cotizar)
pid_cotizar = cotizar["id"]
check("el total queda vacío (no $0)", cotizar["total"] is None, cotizar["total"])
check("y sin total escrito", cotizar["total_manual"] is None, cotizar["total_manual"])
fila = next((p for p in cliente.get("/api/presupuestos").get_json() if p["id"] == pid_cotizar), None)
check("el historial lo trae con el total vacío", fila and fila["total"] is None, fila)
check("sale el PDF igual (qué se le va a hacer)",
      len(cliente.get(f"/api/presupuestos/{pid_cotizar}/pdfs").get_json()) == 1)
texto = texto_del_pdf(pid_cotizar)
if texto is not None:
    check("y en el total dice \"A confirmar\"", "A confirmar" in texto, texto[:300])
    check("sin la leyenda de los 7 días (no hay precio que venza)", "7 días" not in texto, texto[-200:])

item = cliente.get(f"/api/presupuestos/{pid_cotizar}/items").get_json()[0]
edicion_cotizar = {"ajuste_pct": 0, "notas": "Desarmado: hay que encamisar",
                   "items": [{"servicio_id": item["servicio_id"], "cantidad": 4,
                              "precio_unitario": item["precio_unitario"]}]}
r = cliente.put(f"/api/presupuestos/{pid_cotizar}", json=edicion_cotizar)
check("editarlo sin poner precio lo deja a cotizar (no lo pasa a $0)",
      r.status_code == 200 and r.get_json()["total"] is None, r.get_json())
r = cliente.put(f"/api/presupuestos/{pid_cotizar}", json={**edicion_cotizar, "total_manual": 780000})
check("escribirle el precio después lo cotiza", r.get_json()["total"] == 780000, r.get_json()["total"])
check("y queda como total escrito a mano", r.get_json()["total_manual"] == 780000)
r = cliente.put(f"/api/presupuestos/{pid_cotizar}", json=edicion_cotizar)
check("una vez cotizado, editar sin hablar del total no lo vuelve a vaciar",
      r.get_json()["total"] == 780000, r.get_json()["total"])


print("\n=== 7. El cliente ya aprobó: entra derecho al taller ===")
r = cliente.post("/api/presupuestos", json={
    "cliente_nombre": f"{CLIENTE_PRUEBA} aprobado",
    "cliente_telefono": "2235 123456",
    "motor_texto": "Mercedes OM 352",
    "a_cotizar": True,
    "aprobado": True,
    "urgente": True,
    "entrega_prometida": "2026-10-15",
    "items": [{"servicio_id": SID_A, "cantidad": 6}],
})
aprobado = r.get_json()
check("crear aprobado responde 201", r.status_code == 201, aprobado)
pid_aprobado = aprobado["id"]
check("queda aprobado hoy", bool(aprobado["aprobado_en"]), aprobado["aprobado_en"])
check("en \"Para hacer\"", aprobado["estado_trabajo"] == "aprobado", aprobado["estado_trabajo"])
check("marcado urgente", aprobado["prioridad"] == 1, aprobado["prioridad"])
check("con la fecha prometida", aprobado["entrega_prometida"] == "2026-10-15", aprobado["entrega_prometida"])
tablero = cliente.get("/api/taller/trabajos").get_json()["trabajos"]
trabajo = next((t for t in tablero if t["id"] == pid_aprobado), None)
check("aparece en el tablero del taller, con el motor escrito",
      trabajo and trabajo["motor"] == "MERCEDES OM 352", trabajo)
orden = cliente.get(f"/api/taller/trabajos/{pid_aprobado}").get_json()
check("la orden de trabajo trae el teléfono (para avisarle)", orden.get("telefono") == "2235 123456", orden)
check("y el movimiento de \"aprobado\" queda en el historial (el panel cuenta los días desde ahí)",
      [h["estado"] for h in orden.get("historial", [])] == ["aprobado"], orden.get("historial"))

r = cliente.post("/api/presupuestos", json={
    "cliente_nombre": f"{CLIENTE_PRUEBA} fecha mala", "motor_texto": "X", "a_cotizar": True,
    "entrega_prometida": "15/10", "items": [{"servicio_id": SID_A, "cantidad": 1}],
})
check("una fecha de entrega que no se entiende da 400", r.status_code == 400, r.status_code)

cid = aprobado["cliente_id"]
r = cliente.put(f"/api/clientes/{cid}", json={"nombre": f"{CLIENTE_PRUEBA} aprobado", "notas": "x"})
check("editar el cliente sin mandar el teléfono lo conserva",
      r.get_json().get("telefono") == "2235 123456", r.get_json())
r = cliente.put(f"/api/clientes/{cid}", json={"nombre": f"{CLIENTE_PRUEBA} aprobado", "telefono": "11 5555 0000"})
check("y mandándolo lo cambia", r.get_json().get("telefono") == "11 5555 0000", r.get_json())


print("\n=== 8. Borrar lo de la prueba ===")
limpiar()
check("no quedan presupuestos de la suite", not [
    p for p in db.get_presupuestos() if str(p.get("cliente") or "").startswith(CLIENTE_PRUEBA)])

print("\n" + "=" * 50)
if fallos:
    print(f"FALLARON {len(fallos)}: {fallos}")
    sys.exit(1)
print("TODO OK")
