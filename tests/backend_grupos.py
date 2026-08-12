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
from datetime import date

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

# Las fichas de repuestos de los motores sobreviven al borrado de datos de
# prueba (a propósito: son trabajo cargado a mano). Para que dos corridas
# seguidas sobre el mismo DATA_DIR den lo mismo, acá se arranca sin ninguna.
with db.get_connection() as _conn:
    _conn.execute("DELETE FROM motor_repuesto_opciones")
    _conn.execute("DELETE FROM motor_repuesto_grupos")

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

print("\n=== 4b. Papelera de la ficha del motor ===")
# Todo lo que sale de la ficha queda recuperable: el tacho de una familia se
# lleva varias medidas de un click y hay que poder deshacerlo.
familia = crac.get_medidas_hermanas("CAAC02740  STD")
check("la familia trae base_codigo", all(f["base_codigo"] == "CAAC02740" for f in familia), familia[:1])
motor_pap = motores[2]
db.borrar_de_papelera(motor_pap["id"])
db.guardar_ficha_motor(motor_pap["id"], [{
    "categoria": familia[0]["categoria"],
    "cat_prefijo": familia[0]["cat_prefijo"],
    "opciones": [{"codigo": f["codigo"], "cantidad": 4} for f in familia],
}])
ficha_pap = db.get_ficha_motor(motor_pap["id"])
check("la ficha devuelve base_codigo por opción",
      all(o["base_codigo"] == "CAAC02740" for o in ficha_pap[0]["opciones"]))
check("papelera vacía mientras no se borre nada", db.get_papelera_motor(motor_pap["id"]) == [])

# Sacar toda la familia menos una
db.guardar_ficha_motor(motor_pap["id"], [{
    "categoria": familia[0]["categoria"],
    "cat_prefijo": familia[0]["cat_prefijo"],
    "opciones": [{"codigo": familia[0]["codigo"], "cantidad": 4}],
}])
papelera = db.get_papelera_motor(motor_pap["id"])
check("lo borrado va a la papelera", len(papelera) == len(familia) - 1, len(papelera))
check("la papelera guarda categoría y cantidad",
      all(p["categoria"] == familia[0]["categoria"] and p["cantidad"] == 4 for p in papelera))
check("la papelera se resuelve contra el catálogo",
      all(p["descripcion"] and p["marca"] and p["eliminado_en"] for p in papelera))

volver = papelera[0]["codigo"]
check("restaurar devuelve 1", db.restaurar_de_papelera(motor_pap["id"], [volver]) == 1)
codigos_ficha = {o["codigo"] for g in db.get_ficha_motor(motor_pap["id"]) for o in g["opciones"]}
check("el restaurado volvió a la ficha", volver in codigos_ficha)
check("y salió de la papelera", volver not in {p["codigo"] for p in db.get_papelera_motor(motor_pap["id"])})
check("restaurar respeta la cantidad que tenía",
      next(o for g in db.get_ficha_motor(motor_pap["id"]) for o in g["opciones"] if o["codigo"] == volver)["cantidad"] == 4)

# Volver a agregarlo a mano también lo saca de la papelera (no puede estar en los dos lados)
otro = db.get_papelera_motor(motor_pap["id"])[0]["codigo"]
db.fusionar_ficha_motor(motor_pap["id"], [{
    "categoria": familia[0]["categoria"], "cat_prefijo": None,
    "opciones": [{"codigo": otro, "cantidad": 8}],
}])
check("agregarlo de nuevo lo saca de la papelera",
      otro not in {p["codigo"] for p in db.get_papelera_motor(motor_pap["id"])})

# Copiar una ficha ajena no genera borrados falsos
antes_pap = len(db.get_papelera_motor(motor_pap["id"]))
db.copiar_ficha_motor(motor["id"], motor_pap["id"])
check("copiar ficha no manda nada a la papelera",
      len(db.get_papelera_motor(motor_pap["id"])) == antes_pap, antes_pap)

check("borrar de la papelera saca solo lo pedido",
      db.borrar_de_papelera(motor_pap["id"], [db.get_papelera_motor(motor_pap["id"])[0]["codigo"]]) == 1)
db.borrar_de_papelera(motor_pap["id"])
check("vaciar la papelera la deja vacía", db.get_papelera_motor(motor_pap["id"]) == [])
db.guardar_ficha_motor(motor_pap["id"], [])
db.borrar_de_papelera(motor_pap["id"])

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

# El PUT anterior dejó la ficha con un solo código (el que pasó a "Aros"): los
# otros dos del grupo original tienen que estar en la papelera, recuperables por
# HTTP. El que siguió en la ficha NO está en la papelera: si está cargado, no
# está eliminado.
r = cliente.get(f"/api/motores/{motor['id']}/repuestos-eliminados")
eliminados = r.get_json()
check("GET repuestos-eliminados lista lo que salió de la ficha",
      r.status_code == 200 and len(eliminados) == 2, eliminados)
check("el código que siguió en la ficha no aparece como eliminado",
      codigos[0] not in {e["codigo"] for e in eliminados})
r = cliente.post(f"/api/motores/{motor['id']}/repuestos-eliminados/restaurar",
                 json={"codigos": [eliminados[0]["codigo"]]})
check("POST restaurar devuelve ficha y papelera",
      r.status_code == 200 and r.get_json()["restaurados"] == 1 and len(r.get_json()["papelera"]) == 1,
      r.get_json())
r = cliente.post(f"/api/motores/{motor['id']}/repuestos-eliminados/restaurar", json={"codigos": []})
check("restaurar sin códigos da 400", r.status_code == 400)
r = cliente.delete(f"/api/motores/{motor['id']}/repuestos-eliminados")
check("DELETE vacía la papelera", r.status_code == 200 and r.get_json()["papelera"] == [])
r = cliente.get("/api/motores/999999/repuestos-eliminados")
check("papelera de motor inexistente da 404", r.status_code == 404)

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
# Encabezado del PDF: el nombre del taller y el renglón de abajo, tal como los
# pidió el dueño (antes decían "Chicappo" y "Taller de rectificación…").
# El título entra en dos renglones, así que se compara sobre el texto con los
# saltos de línea colapsados.
texto_plano = " ".join(texto.split())
check("el PDF dice Rectificaciones Chiappo", "Rectificaciones Chiappo" in texto_plano, texto_plano[:200])
check("el PDF no dice Chicappo", "Chicappo" not in texto_plano)
check("el PDF dice Rectificación de motores", "Rectificación de motores" in texto_plano, texto_plano[:200])
check("el PDF no dice Taller de", "Taller de" not in texto_plano)

print("\n=== 11. Actualizar a precios de hoy (revalidar) ===")


def _sql(query, params=()):
    with db.get_connection() as conn:
        return conn.execute(query, params).fetchall()


def _precio_catalogo(codigo):
    return _sql("SELECT precio FROM crac_repuestos WHERE codigo = ?", (codigo,))[0][0]


# El catálogo y la lista de mano de obra se dejan como estaban al terminar el
# bloque: la suite reusa la misma base entre corridas y el bloque 0 verifica los
# conteos y los datos reales importados.
precios_catalogo_originales = {c: _precio_catalogo(c) for c in codigos[:2]}
# Un servicio con precio en la lista de este motor: los hay con la celda vacía.
servicio_rev = next(s for s in servicios if s["precio"])
col_lista = "l%d" % motor["lista_num"]
precio_servicio_original = _sql(f"SELECT {col_lista} FROM servicios WHERE id = ?",
                                (servicio_rev["id"],))[0][0]

# Precios conocidos para poder afirmar diferencias exactas.
_sql("UPDATE crac_repuestos SET precio = 1000 WHERE codigo = ?", (codigos[0],))
_sql("UPDATE crac_repuestos SET precio = 800 WHERE codigo = ?", (codigos[1],))

body_rev = {
    "cliente_nombre": "cliente revalidar",
    "motor_id": motor["id"],
    "ajuste_pct": 10,
    "items": [{"servicio_id": servicio_rev["id"], "cantidad": 2}],
    "grupos_repuestos": [{
        "categoria": "Cojinetes biela",
        "opciones": [
            {"repuesto_codigo": codigos[0], "cantidad": 1},
            {"repuesto_codigo": codigos[1], "cantidad": 1},
        ],
    }, {
        # Repuesto con un código que no existe en el catálogo: al revalidar tiene
        # que conservar su precio y avisar, no desaparecer del presupuesto.
        "categoria": "Junta inexistente",
        "opciones": [
            {"repuesto_codigo": "NO-EXISTE-999", "descripcion": "Junta vieja",
             "cantidad": 1, "precio_unitario": 500},
        ],
    }],
}
r = cliente.post("/api/presupuestos", json=body_rev)
check("presupuesto para revalidar creado", r.status_code == 201, r.get_json())
pid3 = r.get_json()["id"]
detalle3 = cliente.get(f"/api/presupuestos/{pid3}").get_json()
total_inicial = detalle3["total"]
unitario_servicio_congelado = [
    i for i in cliente.get(f"/api/presupuestos/{pid3}/items").get_json() if i["servicio_id"]
][0]["precio_unitario"]

# Las notas se cargan directo por SQL: el POST no las acepta (solo el PUT) y lo
# que importa acá es que revalidar no las pise.
_sql("UPDATE presupuestos SET notas = ? WHERE id = ?", ("no perder esto", pid3))
cliente.post(f"/api/presupuestos/{pid3}/aprobar", json={"aprobado": True})

r = cliente.get(f"/api/presupuestos/{pid3}/revalidacion")
base = r.get_json()
check("GET /revalidacion responde 200", r.status_code == 200, base)
check("recién creado no detecta cambios", base["hay_cambios"] is False, base)
check("el resumen informa la fecha del catálogo", base["catalogo"]["importado_en"] is not None)
check("revalidación de presupuesto inexistente da 404",
      cliente.get("/api/presupuestos/999999/revalidacion").status_code == 404)

# El proveedor sube el precio de la que está cotizada: 1000 → 1500.
_sql("UPDATE crac_repuestos SET precio = 1500 WHERE codigo = ?", (codigos[0],))
res = cliente.get(f"/api/presupuestos/{pid3}/revalidacion").get_json()
grupo_cojinetes = [g for g in res["repuestos"]["grupos"] if g["categoria"] == "Cojinetes biela"][0]
check("detecta el aumento", res["hay_cambios_repuestos"] is True)
check("diferencia exacta del grupo", grupo_cojinetes["diferencia"] == 500, grupo_cojinetes)
check("sigue cotizando la misma opción", grupo_cojinetes["cambio_de_opcion"] is False)
check("el aviso muestra el precio viejo y el nuevo",
      any("→" in a for a in grupo_cojinetes["avisos"]), grupo_cojinetes["avisos"])
check("el total nuevo sube lo mismo que los repuestos",
      round(res["total_nuevo"] - res["total_antes"], 2) == 500, res)

grupo_fuera = [g for g in res["repuestos"]["grupos"] if g["categoria"] == "Junta inexistente"][0]
check("el código fuera de catálogo conserva su precio",
      grupo_fuera["elegida_ahora"]["precio_unitario"] == 500, grupo_fuera)
check("y avisa que ya no está",
      any("catálogo" in a for a in grupo_fuera["avisos"]), grupo_fuera["avisos"])
check("el fuera de catálogo no cuenta como diferencia", grupo_fuera["diferencia"] == 0)

# Ahora la otra opción del grupo pasa a ser la más cara: tiene que cambiar sola.
_sql("UPDATE crac_repuestos SET precio = 5000 WHERE codigo = ?", (codigos[1],))
res = cliente.get(f"/api/presupuestos/{pid3}/revalidacion").get_json()
grupo_cojinetes = [g for g in res["repuestos"]["grupos"] if g["categoria"] == "Cojinetes biela"][0]
check("cambia la opción cotizada", grupo_cojinetes["cambio_de_opcion"] is True, grupo_cojinetes)
check("ahora cotiza la que pasó a ser más cara",
      grupo_cojinetes["elegida_ahora"]["repuesto_codigo"] == codigos[1], grupo_cojinetes)
check("con el subtotal nuevo", grupo_cojinetes["subtotal_ahora"] == 5000)

# La mano de obra cambia, pero este botón no la toca.
_sql(f"UPDATE servicios SET {col_lista} = ? WHERE id = ?",
     (precio_servicio_original * 2, servicio_rev["id"]))
res = cliente.get(f"/api/presupuestos/{pid3}/revalidacion").get_json()
check("informa el cambio de mano de obra", res["hay_cambios_mano_obra"] is True, res["mano_obra"])
check("una línea de mano de obra cambiada", len(res["mano_obra"]["lineas"]) == 1, res["mano_obra"])
check("la mano de obra NO entra en el total nuevo",
      round(res["total_nuevo"], 2) == round(res["total_antes"] + res["repuestos"]["diferencia"], 2), res)

pdfs_antes = len(db.get_pdfs_presupuesto(pid3))
r = cliente.post(f"/api/presupuestos/{pid3}/revalidar")
aplicado = r.get_json()
check("POST /revalidar responde 200", r.status_code == 200, aplicado)
check("aplicó cambios", aplicado["sin_cambios"] is False)

detalle3 = cliente.get(f"/api/presupuestos/{pid3}").get_json()
items3 = cliente.get(f"/api/presupuestos/{pid3}/items").get_json()
grupos3b = cliente.get(f"/api/presupuestos/{pid3}/grupos").get_json()
elegida_final = [o for o in
                 [g for g in grupos3b if g["categoria"] == "Cojinetes biela"][0]["opciones"]
                 if o["elegida"]][0]
check("quedó cotizada la más cara de hoy", elegida_final["repuesto_codigo"] == codigos[1], elegida_final)
check("el precio guardado es el de hoy", elegida_final["precio_unitario"] == 5000)
check("el total guardado coincide con el previsualizado",
      round(detalle3["total"], 2) == round(aplicado["resumen"]["total_nuevo"], 2), detalle3["total"])
check("el total subió respecto del original", detalle3["total"] > total_inicial)
check("la fecha pasa a hoy", detalle3["fecha"] == date.today().isoformat(), detalle3["fecha"])
check("las notas sobreviven", detalle3["notas"] == "no perder esto", detalle3["notas"])
check("el ajuste % sobrevive", detalle3["ajuste_pct"] == 10, detalle3["ajuste_pct"])
check("sigue aprobado", detalle3["aprobado_en"] is not None)
check("la mano de obra NO se tocó",
      [i for i in items3 if i["servicio_id"]][0]["precio_unitario"] == unitario_servicio_congelado)
check("el repuesto fuera de catálogo sigue en el presupuesto",
      any(i["repuesto_codigo"] == "NO-EXISTE-999" for i in items3), items3)
check("se generó una sola versión nueva de PDF",
      len(db.get_pdfs_presupuesto(pid3)) == pdfs_antes + 1)

# Idempotencia: sin cambios en el catálogo, tocar el botón de nuevo no hace nada.
pdfs_despues = len(db.get_pdfs_presupuesto(pid3))
r = cliente.post(f"/api/presupuestos/{pid3}/revalidar")
check("segunda revalidación no encuentra cambios", r.get_json()["sin_cambios"] is True, r.get_json())
check("y no acumula versiones de PDF", len(db.get_pdfs_presupuesto(pid3)) == pdfs_despues)

# Se restaura el catálogo y la lista de mano de obra.
for codigo, precio in precios_catalogo_originales.items():
    _sql("UPDATE crac_repuestos SET precio = ? WHERE codigo = ?", (precio, codigo))
_sql(f"UPDATE servicios SET {col_lista} = ? WHERE id = ?",
     (precio_servicio_original, servicio_rev["id"]))
check("el catálogo quedó como estaba", _precio_catalogo(codigos[0]) == precios_catalogo_originales[codigos[0]])

print("\n=== 12. Duplicar presupuesto ===")
# El wizard duplicado arma el mismo payload de creación con lo que devuelven
# /items y /grupos del original, pero a precios de hoy.
items_orig = cliente.get(f"/api/presupuestos/{pid3}/items").get_json()
grupos_orig = cliente.get(f"/api/presupuestos/{pid3}/grupos").get_json()
body_dup = {
    "cliente_nombre": "otro cliente",
    "motor_id": detalle3["motor_id"],
    "ajuste_pct": detalle3["ajuste_pct"],
    "items": [
        {"servicio_id": i["servicio_id"], "cantidad": i["cantidad"]}
        for i in items_orig if i["servicio_id"]
    ],
    "grupos_repuestos": [{
        "categoria": g["categoria"],
        "opciones": [{
            "repuesto_codigo": o["repuesto_codigo"],
            "descripcion": o["descripcion"],
            "cantidad": o["cantidad"],
            # precio de HOY cuando el código sigue en el catálogo
            "precio_unitario": o["precio_actual"] if o["stock_actual"] is not None else o["precio_unitario"],
        } for o in g["opciones"]],
    } for g in grupos_orig],
}
r = cliente.post("/api/presupuestos", json=body_dup)
check("la copia se crea", r.status_code == 201, r.get_json())
pid_dup = r.get_json()["id"]
check("la copia es un presupuesto distinto", pid_dup != pid3)
detalle_dup = cliente.get(f"/api/presupuestos/{pid_dup}").get_json()
check("la copia mantiene el motor", detalle_dup["motor_id"] == detalle3["motor_id"])
check("la copia mantiene el ajuste %", detalle_dup["ajuste_pct"] == detalle3["ajuste_pct"])
check("la copia va al cliente nuevo", detalle_dup["cliente"] == "Otro Cliente", detalle_dup["cliente"])
check("la copia tiene fecha de hoy", detalle_dup["fecha"] == date.today().isoformat())
grupos_dup = cliente.get(f"/api/presupuestos/{pid_dup}/grupos").get_json()
check("la copia trae los mismos grupos", len(grupos_dup) == len(grupos_orig), grupos_dup)
opciones_dup = [g for g in grupos_dup if g["categoria"] == "Cojinetes biela"][0]["opciones"]
check("la copia cotiza a precios de hoy",
      all(o["precio_unitario"] == _precio_catalogo(o["repuesto_codigo"]) for o in opciones_dup),
      opciones_dup)
check("el original queda intacto",
      cliente.get(f"/api/presupuestos/{pid3}").get_json()["total"] == detalle3["total"])
check("la copia genera su propio PDF", len(db.get_pdfs_presupuesto(pid_dup)) == 1)

print("\n=== 13. Borrar un cliente ===")
# Regla: solo se borra el cliente que no aparece en ningún presupuesto, ni como
# principal ni como contraparte. Un presupuesto ya cotizado (con su PDF en manos
# del cliente) no se pierde de rebote por borrar una ficha.
cliente_con_presu = cliente.get(f"/api/presupuestos/{pid2}").get_json()["cliente_id"]
r = cliente.delete(f"/api/clientes/{cliente_con_presu}")
check("borrar un cliente con presupuestos da 409", r.status_code == 409, r.get_json())
check("el 409 dice cuántos presupuestos tiene", r.get_json().get("presupuestos", 0) > 0, r.get_json())
check("el cliente sigue existiendo", cliente.get(f"/api/clientes/{cliente_con_presu}").status_code == 200)

# Cliente suelto (sin presupuestos): en la app solo puede quedar así después de
# borrarle los presupuestos, acá se simula insertándolo directo.
_sql("INSERT INTO clientes (nombre) VALUES ('Cliente Sin Presupuestos')")
id_suelto = _sql("SELECT id FROM clientes WHERE nombre = 'Cliente Sin Presupuestos'")[0][0]
r = cliente.delete(f"/api/clientes/{id_suelto}")
check("borrar un cliente sin presupuestos da 204", r.status_code == 204, r.status_code)
check("el cliente desapareció", cliente.get(f"/api/clientes/{id_suelto}").status_code == 404)

# Contraparte: el mecánico que trajo el auto de un dueño también queda bloqueado.
r = cliente.post("/api/presupuestos", json={
    "cliente_nombre": "dueno con mecanico",
    "contacto_nombre": "mecanico contraparte",
    "motor_id": motor["id"],
    "items": [{"descripcion_custom": "Trabajo suelto", "precio_aplicado": 1000, "cantidad": 1}],
})
check("presupuesto con contraparte creado", r.status_code == 201, r.get_json())
id_contacto = [c["id"] for c in db.get_clientes_lista() if c["nombre"] == "Mecanico Contraparte"][0]
r = cliente.delete(f"/api/clientes/{id_contacto}")
check("la contraparte tampoco se puede borrar", r.status_code == 409, r.get_json())

check("borrar un cliente inexistente da 404", cliente.delete("/api/clientes/999999").status_code == 404)

print("\n=== 14. Borrar datos de prueba ===")
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
