"""
Suite de verificación del backend de grupos de repuestos, contra los datos
reales del repo (491 motores y 235 servicios de FACRA, 296 prefijos y 64.250
repuestos del proveedor).

Cómo se corre: ver tests/README.md. Resumen:

    DATA_DIR=/tmp/rect-test python tests/backend_grupos.py

DATA_DIR es obligatorio y tiene que apuntar a una carpeta descartable: la suite
crea presupuestos, los borra y al final vacía presupuestos y clientes. NUNCA
apuntarla a la base real ni correrla contra producción.
"""
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND = os.path.join(RAIZ, "webapp", "backend")
sys.path.insert(0, BACKEND)

if not os.environ.get("DATA_DIR"):
    sys.exit("Falta DATA_DIR: apuntalo a una carpeta descartable, nunca a la base real.")

# config lee el entorno al importarse, así que esto va antes de tocar `app`.
os.environ["APP_USERNAME"] = "admin"
from werkzeug.security import generate_password_hash  # noqa: E402
os.environ["APP_PASSWORD_HASH"] = generate_password_hash("test123")

from app import db, crac, facra  # noqa: E402
from app.routes import presupuestos as rp  # noqa: E402

NOMENCLADOR = os.path.join(RAIZ, "Excel", "Facra", "nomenclador_1779985703.xls")
LISTA_MO = os.path.join(RAIZ, "Excel", "Facra", "lista_orientadora_de_mano_de_obra_1779985697.xls")
PREFIJOS = os.path.join(RAIZ, "CRAC", "prefijos_crac.csv")
PRECIO_STOCK = os.path.join(RAIZ, "CRAC", "precio-stock.csv")

fallos = []


def check(nombre, condicion, detalle=""):
    if condicion:
        print(f"  OK   {nombre}")
    else:
        print(f"  FALLA {nombre} — {detalle}")
        fallos.append(nombre)


print("\n=== 0. Preparar la base de prueba ===")
db.init_db()
if not facra.get_motores():
    print("  importando FACRA…")
    print("   ", facra.importar_nomenclador(NOMENCLADOR)[1])
    print("   ", facra.importar_lista_orientadora(LISTA_MO)[1])
if crac.get_info_catalogo()["total"] == 0:
    # ~30s: son 64.250 filas. Solo la primera vez sobre un DATA_DIR nuevo.
    print("  importando el catálogo del proveedor…")
    print("   ", crac.importar_prefijos(PREFIJOS)[1])
    print("   ", crac.importar_precio_stock(PRECIO_STOCK)[1])
check("motores cargados", len(facra.get_motores()) == 491)
check("catálogo cargado", crac.get_info_catalogo()["total"] == 64250)

print("\n=== 1. Medidas del catálogo ===")
familia = [r["medida"] for r in crac.get_medidas_hermanas("CAAC02740  STD")]
check("familia CAAC02740 completa", sorted(familia) == ["010", "020", "030", "040", "050", "060", "STD"], familia)
check("S60 y 60/ excluidos", "S60" not in familia and "60/" not in familia, familia)
check("ACAM 3066 (nro de parte) sin hermanas", crac.get_medidas_hermanas("ACAM 3066") == [])
check("catálogo con fecha de importación", crac.get_info_catalogo()["importado_en"] is not None)

print("\n=== 2. Elección de la opción más cara (por subtotal) ===")
# El caso exacto del dueño: juego de 8 a $1.000 (cant 1) vs blíster de 2 a $400 (cant 4).
grupo = {
    "categoria": "Cojinetes biela",
    "opciones": [
        {"descripcion": "Marca A juego de 8", "cantidad": 1, "precio_unitario": 1000},
        {"descripcion": "Marca B blister de 2", "cantidad": 4, "precio_unitario": 400},
        {"descripcion": "Marca C sin precio", "cantidad": 1, "precio_unitario": 0},
    ],
}
items, opciones, descartados = rp._resolver_grupos([grupo])
check("un solo ítem cotizado por grupo", len(items) == 1, items)
check("gana el de mayor subtotal ($1.600)", items[0]["precio_aplicado"] == 1600, items[0])
check("las 3 opciones quedan guardadas", len(opciones) == 3)
check("precio 0 no gana", not [o for o in opciones if o["elegida"] and o["precio_unitario"] == 0])
check("sin descartados", descartados == [], descartados)
check("categoría del grupo en todas las opciones",
      all(o["categoria"] == "Cojinetes biela" for o in opciones))

# Elección manual pisa al más caro.
grupo_manual = dict(grupo, elegida_a_mano=None)
codigo_b = None
items2, opciones2, _ = rp._resolver_grupos([grupo_manual])
elegida_auto = [o for o in opciones2 if o["elegida"]][0]
check("sin override gana la de $1.600", elegida_auto["subtotal"] == 1600)

print("\n=== 3. Ciclo completo de un presupuesto con grupos ===")
motores = facra.get_motores()
motor = motores[0]
print(f"  motor de prueba: {motor['motor']} (id {motor['id']})")

cojinetes = crac.get_repuestos(categoria="CA", limite=6)
codigos = [c["codigo"] for c in cojinetes[:3]]
print(f"  códigos: {codigos}")

payload_grupo = {
    "categoria": cojinetes[0]["categoria"],
    "opciones": [
        {"repuesto_codigo": codigos[0], "cantidad": 1},
        {"repuesto_codigo": codigos[1], "cantidad": 2},
        {"repuesto_codigo": codigos[2], "cantidad": 1},
    ],
}
items_g, opciones_g, _ = rp._resolver_grupos([payload_grupo])
pid = db.guardar_presupuesto("Cliente Prueba Grupos", motor["id"], items_g, opciones=opciones_g)
db.fusionar_ficha_motor(motor["id"], rp._grupos_para_ficha(opciones_g))

detalle = db.get_presupuesto_detalle(pid)
items_guardados = db.get_presupuesto_items_full(pid)
repuestos_guardados = [i for i in items_guardados if i["tipo"] == "repuesto"]
check("solo la elegida como línea del presupuesto", len(repuestos_guardados) == 1, repuestos_guardados)
check("total = subtotal de la elegida", round(detalle["total"], 2) == round(repuestos_guardados[0]["precio_aplicado"], 2))
check("la línea tiene grupo_num", repuestos_guardados[0]["grupo_num"] == 1)

grupos_db = db.get_grupos_presupuesto(pid)
check("el grupo guardó sus 3 opciones", len(grupos_db) == 1 and len(grupos_db[0]["opciones"]) == 3)
check("exactamente una elegida", sum(1 for o in grupos_db[0]["opciones"] if o["elegida"]) == 1)
subtotales = [o["subtotal"] for o in grupos_db[0]["opciones"]]
elegida_db = [o for o in grupos_db[0]["opciones"] if o["elegida"]][0]
check("la elegida es la de mayor subtotal", elegida_db["subtotal"] == max(subtotales), subtotales)
check("las opciones guardan marca", all(o["marca"] for o in grupos_db[0]["opciones"]))

print("\n=== 4. Ficha del motor ===")
ficha = db.get_ficha_motor(motor["id"])
check("la ficha se creó sola al presupuestar", len(ficha) == 1, ficha)
check("la ficha tiene las 3 opciones", len(ficha[0]["opciones"]) == 3)
check("la ficha resuelve precio de hoy", all(o["precio_actual"] is not None for o in ficha[0]["opciones"]))
check("la ficha marca la más cara", ficha[0]["elegida_codigo"] is not None)
check("la ficha respeta la cantidad cargada",
      sorted(o["cantidad"] for o in ficha[0]["opciones"]) == [1, 1, 2])

otro_motor = motores[1]
db.copiar_ficha_motor(motor["id"], otro_motor["id"])
ficha_copiada = db.get_ficha_motor(otro_motor["id"])
check("copiar ficha a otro motor", len(ficha_copiada) == 1 and len(ficha_copiada[0]["opciones"]) == 3)

print("\n=== 5. Pedido de repuestos ===")
from app import create_app  # noqa: E402
app = create_app()
cliente = app.test_client()

check("ruta protegida sin login da 401", cliente.get(f"/api/presupuestos/{pid}/pedido").status_code == 401)
r = cliente.post("/api/auth/login", json={"usuario": "admin", "password": "test123"})
check("login OK", r.status_code == 200, r.get_json())

r = cliente.get(f"/api/presupuestos/{pid}/pedido")
pedido = r.get_json()
check("pedido responde 200", r.status_code == 200)
check("el pedido trae el grupo", len(pedido["grupos"]) == 1)
g = pedido["grupos"][0]
check("las opciones vienen agrupadas por marca", len(g["marcas"]) >= 1, g["marcas"])
check("el pedido usa precios de hoy", all(
    m["medidas"][0]["precio_hoy"] is not None for m in g["marcas"]))
check("total cotizado coincide con el presupuesto",
      round(pedido["total_cotizado"], 2) == round(detalle["total"], 2))
check("el pedido informa la fecha del catálogo", pedido["catalogo"]["importado_en"] is not None)
check("total más barato <= cotizado", pedido["total_mas_barato_con_stock"] <= pedido["total_cotizado"] + 0.01)

print("\n=== 6. Aprobar ===")
r = cliente.post(f"/api/presupuestos/{pid}/aprobar", json={"aprobado": True})
check("aprobar devuelve fecha", r.get_json()["aprobado_en"] is not None)
check("el detalle refleja aprobado", cliente.get(f"/api/presupuestos/{pid}").get_json()["aprobado_en"] is not None)
r = cliente.post(f"/api/presupuestos/{pid}/aprobar", json={"aprobado": False})
check("desaprobar limpia la fecha", r.get_json()["aprobado_en"] is None)

print("\n=== 7. Endpoints nuevos por HTTP ===")
r = cliente.get(f"/api/repuestos/medidas?codigo={codigos[0]}")
check("GET /repuestos/medidas responde", r.status_code == 200)
r = cliente.get("/api/repuestos/catalogo-info")
check("GET /repuestos/catalogo-info responde", r.status_code == 200 and r.get_json()["total"] == 64250)
r = cliente.get(f"/api/motores/{motor['id']}/ficha-repuestos")
check("GET ficha-repuestos responde", r.status_code == 200 and len(r.get_json()) == 1)
r = cliente.get("/api/motores/999999/ficha-repuestos")
check("ficha de motor inexistente da 404", r.status_code == 404)
r = cliente.post(f"/api/motores/{motor['id']}/ficha-repuestos/copiar-de/{motor['id']}")
check("copiar ficha del mismo motor da 400", r.status_code == 400)
r = cliente.put(f"/api/motores/{motor['id']}/ficha-repuestos", json={"grupos": [
    {"categoria": "Aros", "opciones": [{"codigo": codigos[0], "cantidad": 4}]}
]})
check("PUT ficha reemplaza", r.status_code == 200 and len(r.get_json()) == 1 and r.get_json()[0]["categoria"] == "Aros")

print("\n=== 8. Presupuesto completo por HTTP (crear con grupos) ===")
servicios = facra.get_servicios_para_lista(motor.get("lista_num"))
body = {
    "cliente_nombre": "juan perez",
    "motor_id": motor["id"],
    "items": [{"servicio_id": servicios[0]["id"], "cantidad": 4}] if servicios else [],
    "grupos_repuestos": [{
        "categoria": "Cojinetes biela",
        "opciones": [
            {"repuesto_codigo": codigos[0], "cantidad": 1},
            {"repuesto_codigo": codigos[1], "cantidad": 2},
        ],
    }],
}
r = cliente.post("/api/presupuestos", json=body)
check("POST /presupuestos con grupos da 201", r.status_code == 201, r.get_json())
pid2 = r.get_json()["id"]
grupos2 = cliente.get(f"/api/presupuestos/{pid2}/grupos").get_json()
check("el presupuesto nuevo tiene su grupo", len(grupos2) == 1 and len(grupos2[0]["opciones"]) == 2)
items2 = cliente.get(f"/api/presupuestos/{pid2}/items").get_json()
reps2 = [i for i in items2 if i["tipo"] == "repuesto"]
check("una sola línea de repuesto cotizada", len(reps2) == 1)
total_calculado = sum(i["precio_aplicado"] for i in items2)
check("total = suma de líneas (alternativas no suman)",
      round(cliente.get(f"/api/presupuestos/{pid2}").get_json()["total"], 2) == round(total_calculado, 2))

print("\n=== 9. Editar preservando grupos ===")
payload_edicion = {
    "items": [{"servicio_id": servicios[0]["id"], "cantidad": 4,
               "precio_unitario": servicios[0]["precio"]}] if servicios else [],
    "notas": "editado",
    "grupos_repuestos": [{
        "categoria": "Cojinetes biela",
        "elegida_a_mano": codigos[1],
        "opciones": [
            {"repuesto_codigo": codigos[0], "cantidad": 1, "precio_unitario": 1000},
            {"repuesto_codigo": codigos[1], "cantidad": 2, "precio_unitario": 100},
        ],
    }],
}
r = cliente.put(f"/api/presupuestos/{pid2}", json=payload_edicion)
check("PUT con grupos responde 200", r.status_code == 200, r.get_json())
grupos3 = cliente.get(f"/api/presupuestos/{pid2}/grupos").get_json()
elegida3 = [o for o in grupos3[0]["opciones"] if o["elegida"]][0]
check("la elección manual pisa al más caro", elegida3["repuesto_codigo"] == codigos[1], elegida3)
check("queda marcada como elegida a mano", elegida3["elegida_a_mano"] == 1)

print("\n=== 10. PDF ===")
from pypdf import PdfReader  # noqa: E402
from app import config  # noqa: E402
pdfs = db.get_pdfs_presupuesto(pid2)
ruta_pdf = os.path.join(config.PDFS_DIR, pdfs[0]["pdf_path"])
texto = "".join(p.extract_text() for p in PdfReader(ruta_pdf).pages)
check("el PDF no tiene columna Cant. en repuestos", "Cant." not in texto, texto[:400])
check("el PDF dice Repuestos", "Repuestos" in texto)
check("el PDF no filtra códigos del proveedor", codigos[0] not in texto)
check("el PDF no nombra al proveedor", "CRAC" not in texto.upper())
check("el PDF muestra la categoría", "Cojinetes biela" in texto)

print("\n=== 11. Borrar datos de prueba ===")
motores_antes = len(facra.get_motores())
servicios_antes = len(facra.get_servicios_para_lista(motor.get("lista_num")))
catalogo_antes = crac.get_info_catalogo()["total"]
ficha_antes = len(db.get_ficha_motor(motor["id"]))

r = cliente.post("/api/mantenimiento/borrar-datos-prueba", json={})
check("sin confirmación da 400", r.status_code == 400)
r = cliente.post("/api/mantenimiento/borrar-datos-prueba", json={"confirmar": "BORRAR"})
check("con confirmación borra", r.status_code == 200, r.get_json())
check("no quedan presupuestos", db.get_presupuestos() == [])
check("no quedan clientes", db.get_clientes_lista() == [])
check("los motores siguen", len(facra.get_motores()) == motores_antes)
check("la mano de obra sigue", len(facra.get_servicios_para_lista(motor.get("lista_num"))) == servicios_antes)
check("el catálogo sigue", crac.get_info_catalogo()["total"] == catalogo_antes)
check("la ficha del motor sobrevive", len(db.get_ficha_motor(motor["id"])) == ficha_antes)

print("\n" + "=" * 50)
if fallos:
    print(f"FALLARON {len(fallos)}: {fallos}")
    sys.exit(1)
print("TODO OK")
