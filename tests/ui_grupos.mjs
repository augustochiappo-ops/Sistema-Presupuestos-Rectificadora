/*
 * Verificación de la UI de grupos de repuestos, con Chromium headless contra
 * los dos dev servers (Vite en 5173 + Flask en 5000).
 *
 * Cómo se corre: ver tests/README.md. Resumen:
 *
 *     node tests/ui_grupos.mjs
 *
 * Requiere los dos servidores levantados y el backend apuntando a un DATA_DIR
 * descartable con los datos reales importados — la suite crea un presupuesto de
 * verdad. NUNCA correrla contra la base real ni contra producción.
 *
 * Las capturas quedan en tests/capturas/ (gitignoreado).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.dirname(AQUI)
// playwright-core viene de las dependencias del frontend; el Chromium ya está
// instalado en el entorno, no hace falta correr "playwright install".
const { chromium } = await import(
  path.join(RAIZ, 'webapp', 'frontend', 'node_modules', 'playwright-core', 'index.mjs')
)

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium'
const SHOT = path.join(AQUI, 'capturas')
// Mismo DATA_DIR con el que se levantó el backend: hace falta para simular a
// mano una actualización del catálogo del proveedor (subir un precio) y poder
// verificar el botón "Actualizar a precios de hoy".
const DATA_DIR = process.env.DATA_DIR || '/tmp/rect-ui'
const DB = path.join(DATA_DIR, 'presupuestos.db')
mkdirSync(SHOT, { recursive: true })
const fallos = []

// Corre python contra la base del backend, con la conexión ya abierta en `c`.
function py(codigo) {
  return execFileSync('python3', ['-c',
    `import sqlite3\nc=sqlite3.connect(${JSON.stringify(DB)})\n${codigo}\nc.commit()`,
  ], { encoding: 'utf8' }).trim()
}

function check(nombre, ok, detalle = '') {
  if (ok) console.log(`  OK   ${nombre}`)
  else { console.log(`  FALLA ${nombre} — ${detalle}`); fallos.push(nombre) }
}

const browser = await chromium.launch({ executablePath: CHROMIUM })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
page.on('pageerror', (e) => { console.log('  !! error de JS en la página:', e.message); fallos.push('JS: ' + e.message) })

async function esperar(ms) { await page.waitForTimeout(ms) }

// Estado limpio antes de empezar: la suite crea presupuestos, clientes y fichas
// de motor. Si quedaran de una corrida anterior, el wizard arrancaría
// precargado desde la ficha y las verificaciones de cantidades dejarían de
// medir lo que dicen medir. No toca motores, mano de obra ni catálogo.
py(`for t in ("presupuesto_items", "presupuesto_item_opciones", "presupuesto_pdfs",
             "presupuestos", "clientes", "motor_repuesto_opciones", "motor_repuesto_grupos"):
    c.execute("DELETE FROM " + t)`)

console.log('\n=== Login ===')
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.fill('input[autocomplete="username"]', 'admin')
await page.fill('input[type="password"]', 'test123')
await page.click('button[type="submit"]')
await page.waitForURL(/motores/, { timeout: 15000 })
check('login entra a motores', page.url().includes('motores'))

console.log('\n=== Wizard: agrupado automático ===')
await page.goto(`${BASE}/presupuestos/nuevo`, { waitUntil: 'networkidle' })
// Paso 1: cliente
await page.fill('input[placeholder*="Buscar cliente"]', 'Cliente Grupos UI')
await esperar(500)
// Solo aparece si el cliente es nuevo (hay que clasificarlo).
const btnMecanico = page.locator('button', { hasText: /^Mecánico$/ })
if (await btnMecanico.count()) { await btnMecanico.click(); await esperar(400) }
const btnSiguiente = page.locator('button', { hasText: /Siguiente|Continuar/i }).first()
await btnSiguiente.click()
await esperar(600)

// Paso 2: motor — buscar uno concreto
await page.fill('input[placeholder*="Buscar" i]', 'CITROEN')
await esperar(900)
await page.locator('table tbody tr').first().click()
await esperar(1200)
check('paso 3 es Servicios', (await page.locator('text=/Paso 3 de 4/').count()) > 0)

// Un ítem de mano de obra: hace falta después para verificar el aviso de "la
// lista de la Cámara cambió" al revalidar. El catálogo de servicios no es una
// tabla (son filas sueltas), así que se usa el "+" de cantidad de la primera.
await page.locator('.servicios-picker-grid button[title="Elegir cantidad"]').first().click()
await esperar(400)
await page.locator('body > div').last().locator('button', { hasText: /^4$/ }).click()
await esperar(700)
check('el servicio elegido aparece en la previsualización',
  (await page.locator('text=/Todavía no elegiste servicios/').count()) === 0)

const btnRepuestos = page.locator('button', { hasText: /Siguiente.*Repuestos/i }).first()
await btnRepuestos.click()
await esperar(1200)
check('paso 4 es Repuestos', (await page.locator('text=/Paso 4 de 4/').count()) > 0)

// Elegir la categoría "Cojinetes biela" en el rail
await page.locator('button', { hasText: /^Cojinetes biela$/ }).first().click()
await esperar(1400)
const filas = page.locator('.motor-selector-grid table tbody tr')
const nFilas = await filas.count()
check('el catálogo muestra cojinetes de biela', nFilas > 3, `filas=${nFilas}`)

// Agregar el primero con cantidad exacta 4 desde el menú "+"
await filas.nth(0).locator('button[title="Elegir cantidad"]').click()
await esperar(300)
await page.locator('body > div').last().locator('button', { hasText: /^4$/ }).click()
await esperar(1500)

// Agregar dos más de la MISMA categoría con click en la fila
await filas.nth(1).click()
await esperar(1200)
await filas.nth(2).click()
await esperar(1200)

await page.screenshot({ path: `${SHOT}/01-wizard-catalogo.png`, fullPage: false })

// Medidas automáticas: al agregar una pieza con medida, entran solas las
// hermanas que el proveedor tiene de verdad (CAAC02740 tiene 7).
await page.fill('input[placeholder="Código…"]', 'CAAC02740')
await esperar(1600)
const filasMedidas = page.locator('.motor-selector-grid table tbody tr')
const nMedidas = await filasMedidas.count()
check('el catálogo lista la familia CAAC02740', nMedidas >= 7, `filas=${nMedidas}`)
await filasMedidas.nth(0).click()
await esperar(2500)
const badgesCantidad = await page.locator('.motor-selector-grid table tbody tr').locator('text=/^×\\d+$/').count()
check('las 7 medidas hermanas se agregaron solas', badgesCantidad >= 7, `con ×N=${badgesCantidad}`)
await page.screenshot({ path: `${SHOT}/01b-medidas-automaticas.png`, fullPage: false })
await page.fill('input[placeholder="Código…"]', '')
await esperar(1400)

// Abrir el pop-up de repuestos
await page.locator('button', { hasText: /Ver repuestos/ }).click()
await esperar(900)
const modal = page.locator('text=Repuestos del presupuesto').locator('..').locator('..')
check('se abre el pop-up de repuestos', (await page.locator('text=Repuestos del presupuesto').count()) > 0)
check('hay un solo grupo (una categoría)', (await page.locator('text=/^Cojinetes biela$/').count()) >= 1)
check('el más caro está marcado', (await page.getByText('El más caro', { exact: true }).count()) === 1)

// La cantidad se heredó: las 3 opciones deben estar en 4
const inputsCantidad = page.locator('table input[type="number"]')
const cantidades = await inputsCantidad.evaluateAll((els) => els.map((e) => e.value))
check('la cantidad 4 se heredó a todo el grupo', cantidades.every((c) => c === '4'), JSON.stringify(cantidades))

await page.screenshot({ path: `${SHOT}/02-modal-grupos.png`, fullPage: false })

// Cambiar la cantidad de una opción → debe cambiar el más caro si corresponde
const subtotalesAntes = await page.locator('table tbody tr td:nth-last-child(2)').allTextContents()
await inputsCantidad.nth(2).fill('40')
await esperar(800)
const marcados = await page.getByText('El más caro', { exact: true }).count()
check('sigue habiendo exactamente un "más caro" tras cambiar cantidades', marcados === 1)
await page.screenshot({ path: `${SHOT}/03-modal-cantidad-cambiada.png`, fullPage: false })

// Chip de cantidad sospechosa: dejar una en 1 contra las otras en 4/40
await inputsCantidad.nth(1).fill('1')
await esperar(800)
const sospechosas = await page.locator('text=¿cantidad correcta?').count()
check('aparece el aviso "¿cantidad correcta?"', sospechosas >= 1, `n=${sospechosas}`)
await page.screenshot({ path: `${SHOT}/04-aviso-cantidad.png`, fullPage: false })

// Elección manual
const usarEste = page.locator('button', { hasText: /^Usar este$/ }).first()
if (await usarEste.count()) {
  await usarEste.click()
  await esperar(700)
  check('la elección manual queda marcada', (await page.getByText('Elegido a mano', { exact: true }).count()) === 1)
}
await page.screenshot({ path: `${SHOT}/05-elegido-a-mano.png`, fullPage: false })

// Cerrar el modal y confirmar el presupuesto
await page.locator('text=Repuestos del presupuesto').locator('xpath=../..').locator('button').last().click().catch(() => {})
await page.keyboard.press('Escape').catch(() => {})
await page.mouse.click(10, 10)
await esperar(600)

const totalTexto = await page.locator('text=Total').first().textContent().catch(() => '')
console.log('  (total en pantalla:', totalTexto, ')')

await page.locator('button', { hasText: /Confirmar presupuesto/ }).click()
await page.waitForURL(/presupuestos$/, { timeout: 20000 })
check('el presupuesto se confirma y vuelve al historial', page.url().endsWith('/presupuestos'))
await esperar(1200)
await page.screenshot({ path: `${SHOT}/06-historial.png`, fullPage: false })

console.log('\n=== Detalle: grupos, aprobar y pedido ===')
await page.locator('table tbody tr').first().click()
await page.waitForURL(/presupuestos\/\d+$/, { timeout: 15000 })
await esperar(1500)
check('el detalle muestra "Opciones guardadas"', (await page.locator('text=Opciones guardadas').count()) > 0)
check('marca cuál se cotizó', (await page.getByText('Elegido a mano', { exact: true }).count())
  + (await page.getByText('Cotizado', { exact: true }).count()) === 1)
await page.screenshot({ path: `${SHOT}/07-detalle-opciones.png`, fullPage: true })

// Aprobar
await page.locator('button', { hasText: /Marcar aprobado/ }).click()
await esperar(1200)
check('el presupuesto queda aprobado', (await page.locator('button', { hasText: /^Aprobado$/ }).count()) > 0)

// Pedido
await page.locator('button', { hasText: /Pedido de repuestos/ }).click()
await page.waitForURL(/pedido/, { timeout: 15000 })
await esperar(1500)
check('abre la pantalla de pedido', page.url().includes('/pedido'))
check('el pedido agrupa por marca', (await page.locator('text=desde').count()) > 0)
check('muestra la fecha del catálogo', (await page.locator('text=/Precios del proveedor actualizados/').count()) > 0)
check('muestra el cotizado y la diferencia', (await page.locator('text=Cotizado al cliente').count()) > 0
  && (await page.locator('text=Diferencia a favor').count()) > 0)
await page.screenshot({ path: `${SHOT}/08-pedido.png`, fullPage: true })

// Copiar códigos: se copian de a uno, para ir pegándolos en el sistema del
// proveedor y volver por el siguiente.
await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {})
const btnCopiar = page.locator('button', { hasText: /Copiar códigos/ })
check('hay botón de copiar códigos', (await btnCopiar.count()) > 0)

await btnCopiar.first().click()
await esperar(900)
check('el botón abre el pop-up de códigos', (await page.locator('text=Códigos para pedir').count()) > 0)
const botonesCopiar = page.locator('button', { hasText: /^Copiar$/ })
const nCodigos = await botonesCopiar.count()
check('cada código tiene su propio botón', nCodigos > 0, `botones=${nCodigos}`)
check('arranca sin nada copiado', (await page.locator('text=/0 de \\d+ copiados/').count()) > 0)

await botonesCopiar.first().click()
await esperar(700)
check('copiar uno avanza el contador', (await page.locator('text=/1 de \\d+ copiados/').count()) > 0)
check('el renglón copiado queda marcado',
  (await page.locator('button', { hasText: /^Copiado$/ }).count()) === 1)
// Lo que quedó en el portapapeles tiene que ser un código del pedido (no la
// lista entera): en headless puede no haber permiso, por eso no aborta.
const enPortapapeles = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null)
if (enPortapapeles !== null) {
  check('el portapapeles tiene un solo código',
    enPortapapeles.trim().length > 0 && !enPortapapeles.includes('\n'), JSON.stringify(enPortapapeles))
}
await page.screenshot({ path: `${SHOT}/08b-codigos-pedido.png`, fullPage: false })

await page.locator('button', { hasText: /Copiar todos/ }).click()
await esperar(700)
check('"Copiar todos" marca todos', (await page.locator(`text=/${nCodigos} de ${nCodigos} copiados/`).count()) > 0)
await page.locator('button', { hasText: /Reiniciar marcas/ }).click()
await esperar(500)
check('"Reiniciar marcas" vuelve a cero', (await page.locator('text=/0 de \\d+ copiados/').count()) > 0)

console.log('\n=== Actualizar a precios de hoy ===')
const pid = page.url().match(/presupuestos\/(\d+)/)[1]
await page.goto(`${BASE}/presupuestos/${pid}`, { waitUntil: 'networkidle' })
await esperar(1200)

check('sin cambios en el catálogo no hay banner de avisos',
  (await page.locator('text=/La lista de repuestos cambió/').count()) === 0)
await page.locator('button', { hasText: /Actualizar a precios de hoy/ }).first().click()
await esperar(1500)
check('avisa que los precios no cambiaron',
  (await page.locator('text=/Los precios no cambiaron/').count()) > 0)

// El proveedor actualiza su lista: sube un 50% lo de este presupuesto. Y la
// Cámara actualiza la mano de obra: se duplica el precio del servicio cotizado.
py(`pid = ${pid}
c.execute("UPDATE crac_repuestos SET precio = precio * 1.5 WHERE codigo IN (SELECT repuesto_codigo FROM presupuesto_item_opciones WHERE presupuesto_id = ?)", (pid,))
lista = c.execute("SELECT m.lista_num FROM presupuestos p JOIN motores m ON m.id = p.motor_id WHERE p.id = ?", (pid,)).fetchone()[0]
for (sid,) in c.execute("SELECT servicio_id FROM presupuesto_items WHERE presupuesto_id = ? AND servicio_id IS NOT NULL", (pid,)).fetchall():
    c.execute(f"UPDATE servicios SET l{lista} = l{lista} * 2 WHERE id = ?", (sid,))`)

await page.reload({ waitUntil: 'networkidle' })
await esperar(1500)
const totalAntes = await page.locator('text=/^\\$/').first().textContent().catch(() => '')
check('el detalle avisa que la lista cambió',
  (await page.locator('text=/La lista de repuestos cambió/').count()) > 0)

await page.locator('button', { hasText: /Actualizar a precios de hoy/ }).first().click()
await esperar(1800)
check('se abre el resumen de la revalidación',
  (await page.locator('text=/Repuestos — se van a actualizar/').count()) > 0)
check('el resumen avisa del cambio de mano de obra',
  (await page.locator('text=/Mano de obra — solo aviso/').count()) > 0)
check('el resumen muestra el total viejo y el nuevo',
  (await page.locator('text=/Total del presupuesto/').count()) > 0)
await page.screenshot({ path: `${SHOT}/09-revalidacion.png`, fullPage: false })

await page.locator('button', { hasText: /Actualizar y generar PDF/ }).click()
await esperar(2500)
check('confirma y avisa que generó el PDF nuevo',
  (await page.locator('text=/Actualizado a precios de hoy/').count()) > 0)
check('la tarjeta de PDF pasa a Versión 2',
  (await page.locator('text=/Versión 2/').count()) > 0)
const totalDespues = await page.locator('text=/^\\$/').first().textContent().catch(() => '')
check('el total del presupuesto cambió', totalDespues !== totalAntes, `${totalAntes} → ${totalDespues}`)
check('ya no queda el banner de avisos',
  (await page.locator('text=/La lista de repuestos cambió/').count()) === 0)
await page.screenshot({ path: `${SHOT}/10-revalidado.png`, fullPage: true })

// Segunda vez seguida: los repuestos ya están al día, pero la mano de obra
// sigue distinta (este botón no la toca a propósito). Tiene que abrir el
// resumen mostrando solo ese aviso y SIN botón de aplicar, porque no hay nada
// que aplicar.
await page.locator('button', { hasText: /Actualizar a precios de hoy/ }).first().click()
await esperar(1800)
check('la segunda vez dice que los repuestos ya están al día',
  (await page.locator('text=/Los precios de los repuestos no cambiaron/').count()) > 0)
check('pero sigue avisando por la mano de obra',
  (await page.locator('text=/Mano de obra — solo aviso/').count()) > 0)
check('sin nada que aplicar, no ofrece generar PDF',
  (await page.locator('button', { hasText: /Actualizar y generar PDF/ }).count()) === 0)
await page.locator('button', { hasText: /^Cerrar$/ }).click()
await esperar(800)
check('y no generó una Versión 3', (await page.locator('text=/Versión 3/').count()) === 0)

console.log('\n=== Duplicar presupuesto ===')
const filasAntes = await (async () => {
  await page.goto(`${BASE}/presupuestos`, { waitUntil: 'networkidle' })
  await esperar(1000)
  return page.locator('table tbody tr').count()
})()

// Desde el listado, con el icono de la fila.
await page.locator('button[title="Duplicar presupuesto"]').first().click()
await page.waitForURL(/duplicar=/, { timeout: 15000 })
await esperar(2000)
check('duplicar desde el listado abre el wizard',
  (await page.locator('text=/Copia del presupuesto/').count()) > 0)
check('la copia arranca en el paso Cliente', (await page.locator('text=/Paso 1 de 4/').count()) > 0)
await page.screenshot({ path: `${SHOT}/11-duplicar.png`, fullPage: false })

await page.fill('input[placeholder*="Buscar cliente"]', 'Cliente Copia UI')
await esperar(600)
const btnMecanico2 = page.locator('button', { hasText: /^Mecánico$/ })
if (await btnMecanico2.count()) { await btnMecanico2.click(); await esperar(400) }
await page.locator('button', { hasText: /Siguiente|Continuar/i }).first().click()
await esperar(1800)
check('saltea el selector de motor y va a Servicios',
  (await page.locator('text=/Paso 3 de 4/').count()) > 0)
const cantidadesCopiadas = await page.locator('.servicios-picker-grid table tbody tr').count()
check('el paso Servicios carga el catálogo del motor copiado', cantidadesCopiadas > 0)

await page.locator('button', { hasText: /Siguiente.*Repuestos/i }).first().click()
await esperar(1800)
check('los repuestos vienen copiados',
  (await page.locator('button', { hasText: /Ver repuestos \(\d+\)/ }).count()) > 0)
await page.screenshot({ path: `${SHOT}/12-duplicar-repuestos.png`, fullPage: false })

await page.locator('button', { hasText: /Confirmar presupuesto/ }).click()
await page.waitForURL(/presupuestos$/, { timeout: 20000 })
await esperar(1500)
const filasDespues = await page.locator('table tbody tr').count()
check('la copia queda guardada como presupuesto nuevo', filasDespues === filasAntes + 1,
  `${filasAntes} → ${filasDespues}`)
check('el original sigue en la lista', filasDespues > 1)

// Y desde el detalle, con el botón del header.
await page.locator('table tbody tr').first().click()
await page.waitForURL(/presupuestos\/\d+$/, { timeout: 15000 })
await esperar(1200)
await page.locator('button', { hasText: /^Duplicar$/ }).click()
await page.waitForURL(/duplicar=/, { timeout: 15000 })
await esperar(1500)
check('duplicar desde el detalle también abre el wizard cargado',
  (await page.locator('text=/Copia del presupuesto/').count()) > 0)

console.log('\n=== Ficha de repuestos del motor ===')
await page.goto(`${BASE}/motores`, { waitUntil: 'networkidle' })
await esperar(800)
await page.fill('input[placeholder*="Buscar" i]', 'CITROEN')
await esperar(900)
await page.locator('table tbody tr').first().click()
await esperar(1500)
check('el motor muestra la ficha de repuestos', (await page.locator('text=/Ficha de repuestos/').count()) > 0)
check('la ficha se cargó sola al presupuestar', (await page.locator('text=/1 grupo/').count()) > 0)
check('la ficha marca el más caro', (await page.locator('text=El más caro').count()) >= 1)
check('ya no está la sección vieja de sugerencias',
  (await page.locator('text=Repuestos usados en presupuestos anteriores').count()) === 0)
await page.screenshot({ path: `${SHOT}/09-ficha-motor.png`, fullPage: true })

// Copiar ficha desde otro motor
await page.locator('button', { hasText: /Copiar desde otro motor/ }).click()
await esperar(900)
check('abre el modal de copiar ficha', (await page.locator('text=/Elegí el motor del que querés traer/').count()) > 0)
await page.screenshot({ path: `${SHOT}/10-copiar-ficha.png`, fullPage: false })
await page.keyboard.press('Escape')
await esperar(400)

console.log('\n=== Actualizar Excel: fecha de catálogo y borrado ===')
await page.goto(`${BASE}/excel`, { waitUntil: 'networkidle' })
await esperar(1000)
check('muestra la última carga del catálogo', (await page.locator('text=/Última carga:/').count()) > 0)
check('tiene la sección de borrar datos de prueba', (await page.locator('text=Borrar datos de prueba').count()) > 0)
await page.screenshot({ path: `${SHOT}/11-excel.png`, fullPage: true })

console.log('\n=== Repuestos del motor separados por grupos ===')
// La ficha del motor quedó con un solo grupo; con uno solo el bloque arranca
// abierto a propósito, así que se le agrega otro por SQL para verificar el
// plegado de verdad.
const codigoAros = py(`
mid = c.execute("SELECT motor_id FROM presupuestos ORDER BY id LIMIT 1").fetchone()[0]
cod = c.execute("SELECT codigo FROM crac_repuestos WHERE cat_prefijo = 'AR' AND precio > 0 LIMIT 1").fetchone()[0]
c.execute("DELETE FROM motor_repuesto_grupos WHERE motor_id = ? AND categoria = 'Aros'", (mid,))
gid = c.execute("INSERT INTO motor_repuesto_grupos (motor_id, categoria, cat_prefijo) VALUES (?, 'Aros', 'AR')", (mid,)).lastrowid
c.execute("INSERT INTO motor_repuesto_opciones (grupo_id, repuesto_codigo, cantidad) VALUES (?, ?, 4)", (gid, cod))
print(cod)`)

await page.goto(`${BASE}/presupuestos/nuevo`, { waitUntil: 'networkidle' })
await esperar(800)
await page.fill('input[placeholder*="Buscar cliente"]', 'Cliente Grupos UI')
await esperar(600)
const btnMecanico3 = page.locator('button', { hasText: /^Mecánico$/ })
if (await btnMecanico3.count()) { await btnMecanico3.click(); await esperar(400) }
await page.locator('button', { hasText: /Siguiente|Continuar/i }).first().click()
await esperar(700)
await page.fill('input[placeholder*="Buscar" i]', 'CITROEN')
await esperar(1000)
await page.locator('table tbody tr').first().click()
await esperar(1200)
await page.locator('button', { hasText: /Siguiente.*Repuestos/i }).first().click()
await esperar(2000)

const cabeceras = page.locator('button[aria-expanded]')
check('los repuestos del motor salen separados por grupos', (await cabeceras.count()) === 2,
  `grupos=${await cabeceras.count()}`)
check('las categorías se ven como títulos de grupo',
  (await page.locator('button[aria-expanded]', { hasText: /Aros/ }).count()) === 1)
check('los grupos arrancan cerrados',
  (await page.locator('button[aria-expanded="true"]').count()) === 0)
check('con los ítems escondidos', (await page.getByText(codigoAros, { exact: true }).count()) === 0)
await page.screenshot({ path: `${SHOT}/13-grupos-cerrados.png`, fullPage: false })

await page.locator('button[aria-expanded]', { hasText: /Aros/ }).click()
await esperar(700)
check('la flechita despliega ese grupo',
  (await page.locator('button[aria-expanded="true"]').count()) === 1)
check('y muestra sus ítems', (await page.getByText(codigoAros, { exact: true }).count()) >= 1)
check('el otro grupo sigue cerrado',
  (await page.locator('button[aria-expanded="false"]').count()) === 1)
await page.screenshot({ path: `${SHOT}/14-grupo-abierto.png`, fullPage: false })

await page.locator('button', { hasText: /^Expandir todo$/ }).click()
await esperar(700)
check('"Expandir todo" abre los dos',
  (await page.locator('button[aria-expanded="true"]').count()) === 2)
await page.locator('button', { hasText: /^Colapsar todo$/ }).click()
await esperar(700)
check('"Colapsar todo" los cierra',
  (await page.locator('button[aria-expanded="true"]').count()) === 0)

console.log('\n=== Eliminar cliente ===')
// Un cliente sin presupuestos: en la app solo queda así después de borrarle los
// presupuestos, acá se inserta directo.
py("c.execute(\"INSERT INTO clientes (nombre) VALUES ('Cliente Borrable UI')\")")
await page.goto(`${BASE}/clientes`, { waitUntil: 'networkidle' })
await esperar(1200)
const filaBorrable = page.locator('table tbody tr', { hasText: 'Cliente Borrable UI' })
const filaConPresu = page.locator('table tbody tr', { hasText: 'Cliente Grupos UI' })
check('el cliente sin presupuestos se puede borrar',
  await filaBorrable.locator('button[title^="Eliminar"]').isEnabled())
check('el cliente con presupuestos tiene el tacho bloqueado',
  await filaConPresu.locator('button[title^="Tiene"]').isDisabled())
await page.screenshot({ path: `${SHOT}/15-clientes.png`, fullPage: false })

await filaBorrable.locator('button[title^="Eliminar"]').click()
await esperar(600)
check('pide confirmación antes de borrar',
  (await page.locator('text=/¿Eliminar cliente\\?/').count()) > 0)
await page.locator('button', { hasText: /^Eliminar$/ }).click()
await esperar(1200)
check('el cliente desaparece de la lista',
  (await page.locator('table tbody tr', { hasText: 'Cliente Borrable UI' }).count()) === 0)
check('sale el cartel de deshacer',
  (await page.locator('[data-testid="cartel-deshacer"]').count()) === 1)
check('y todavía no se borró en la base',
  py("print(c.execute(\"SELECT COUNT(*) FROM clientes WHERE nombre='Cliente Borrable UI'\").fetchone()[0])") === '1')
await page.screenshot({ path: `${SHOT}/20-cartel-deshacer.png`, fullPage: false })
await page.locator('[data-testid="cartel-deshacer"] button', { hasText: /Deshacer/ }).click()
await esperar(1000)
check('"Deshacer" devuelve el cliente a la lista',
  (await page.locator('table tbody tr', { hasText: 'Cliente Borrable UI' }).count()) === 1)
// Y ahora sí, borrarlo de verdad: el cartel se apaga solo y el DELETE sale.
await page.locator('table tbody tr', { hasText: 'Cliente Borrable UI' })
  .locator('button[title^="Eliminar"]').click()
await esperar(500)
await page.locator('button', { hasText: /^Eliminar$/ }).click()
await esperar(10000)
check('cuando se apaga el cartel el borrado sale de verdad',
  py("print(c.execute(\"SELECT COUNT(*) FROM clientes WHERE nombre='Cliente Borrable UI'\").fetchone()[0])") === '0')

// Desde la ficha del cliente: el botón existe y el bloqueo se explica.
await filaConPresu.first().click()
await page.waitForURL(/clientes\/\d+/, { timeout: 15000 })
await esperar(1000)
check('la ficha del cliente tiene botón Eliminar',
  (await page.locator('button', { hasText: /^Eliminar$/ }).count()) > 0)
await page.locator('button', { hasText: /^Eliminar$/ }).first().click()
await esperar(500)
// El diálogo de confirmación se monta al final del DOM: su botón es el último.
await page.locator('button', { hasText: /^Eliminar$/ }).last().click()
await esperar(1200)
check('avisa cuántos presupuestos hay que borrar primero',
  (await page.locator('text=/presupuesto.*Borralos primero/').count()) > 0)
check('y no se fue de la ficha', /clientes\/\d+/.test(page.url()))
await page.screenshot({ path: `${SHOT}/16-cliente-bloqueado.png`, fullPage: false })

console.log('\n=== Medidas: familia, notas de precio y papelera del motor ===')
// Bloque nuevo (2026-08-12). Arranca de cero con la ficha del motor: el resto de
// la suite la dejó cargada y acá se cuentan líneas.
py(`for t in ("motor_repuesto_opciones", "motor_repuesto_grupos", "motor_repuestos_papelera"):
    c.execute("DELETE FROM " + t)`)

const filasCatalogo = () => page.locator('.motor-selector-grid table tbody tr')
// Filas de opción del pop-up (los renglones de familia no tienen input de cantidad).
const filasModal = () => page.locator('table tbody tr td input[type="number"]')

async function irAlPasoRepuestos(nombreCliente) {
  await page.goto(`${BASE}/presupuestos/nuevo`, { waitUntil: 'networkidle' })
  await page.fill('input[placeholder*="Buscar cliente"]', nombreCliente)
  await esperar(600)
  const nuevo = page.locator('button', { hasText: /^Mecánico$/ })
  if (await nuevo.count()) { await nuevo.click(); await esperar(400) }
  await page.locator('button', { hasText: /Siguiente|Continuar/i }).first().click()
  await esperar(700)
  await page.fill('input[placeholder*="Buscar" i]', 'CITROEN')
  await esperar(1000)
  await page.locator('table tbody tr').first().click()
  await esperar(1200)
  await page.locator('button', { hasText: /Siguiente.*Repuestos/i }).first().click()
  await esperar(1500)
}
async function buscarCodigo(codigo) {
  const campo = page.locator('input[placeholder="Código…"]')
  await campo.fill('')
  await campo.fill(codigo)
  await esperar(1400)
}
async function abrirVerRepuestos() {
  await page.locator('button', { hasText: /Ver repuestos/ }).click()
  await esperar(700)
}
/* Las filas de una misma familia (mismas medidas de un repuesto) tienen que
   quedar pegadas: si entre dos de ellas aparece otra fila, la familia se partió
   y en pantalla se lee como si ese código fuera una medida más. */
async function familiaSinPartir() {
  const valores = await page.locator('table tbody tr[data-familia]')
    .evaluateAll((filas) => filas.map((f) => f.getAttribute('data-familia')))
  const ultima = new Map()
  let ok = true
  valores.forEach((v, i) => {
    if (!v) return
    if (ultima.has(v) && i - ultima.get(v) > 1) ok = false
    ultima.set(v, i)
  })
  return ok
}

async function cerrarModal() {
  const cerrar = page.locator('h3:has-text("Repuestos del presupuesto")').locator('xpath=../..').locator('button').last()
  if (await cerrar.count()) await cerrar.click()
  await esperar(500)
}

await irAlPasoRepuestos('Cliente Medidas UI')
await buscarCodigo('CAAC02740')
// La medida STD es la última por orden de código (…060, 60/, S60, STD). No sirve
// filtrar por el texto "STD": la aplicación de S60 dice "STD/060".
await filasCatalogo().last().click()
await esperar(2000)
await abrirVerRepuestos()
check('agregar una medida trae la familia entera', (await filasModal().count()) === 7,
  `filas=${await filasModal().count()}`)
check('el renglón de familia muestra el código base',
  (await page.locator('tr[data-familia="CAAC02740"] >> text=/7 medidas del mismo repuesto/').count()) > 0)
check('las 7 medidas quedan marcadas como una familia',
  (await page.locator('tr[data-familia="CAAC02740"]').count()) === 8,
  '7 filas + el renglón de la familia')
check('con todos los precios iguales no hay más que el chip de la que cotiza',
  (await page.getByText('El más caro', { exact: true }).count()) === 1)
await cerrarModal()

// Otra marca de la misma categoría: ahí sí hay más caro y más barato.
await buscarCodigo('')
await page.locator('button', { hasText: /^Cojinetes biela$/ }).first().click()
await esperar(1600)
await filasCatalogo().filter({ hasNotText: 'CAAC02740' }).first().click()
await esperar(2000)
await abrirVerRepuestos()
check('el chip "El más caro" queda en la fila que cotiza',
  (await page.getByText('El más caro', { exact: true }).count()) === 1)
check('la nota "El más barato" aparece una sola vez',
  (await page.getByText('El más barato', { exact: true }).count()) === 1)
check('la nota del más barato no dice nada más',
  (await page.getByText(/El más barato —/).count()) === 0)
await page.screenshot({ path: `${SHOT}/17-notas-cotiza.png`, fullPage: false })
await page.locator('button', { hasText: /^Usar este$/ }).first().click()
await esperar(700)
check('al elegir a mano aparece el chip "Elegido a mano"',
  (await page.getByText('Elegido a mano', { exact: true }).count()) === 1)
check('y la nota sigue marcando cuál era el más caro',
  (await page.getByText('El más caro', { exact: true }).count()) === 1)
// El bug de los aros (2026-08-12): con la elección a mano cambiando el orden,
// un código sin familia se colaba entre las medidas de otro y parecía una
// medida más. Las filas de una familia tienen que quedar SIEMPRE pegadas.
check('la familia no se parte al elegir otra opción a mano',
  await familiaSinPartir())
await page.locator('button', { hasText: /^Usar este$/ }).first().click()
await esperar(700)
// Sacar la opción de la otra marca: queda solo la familia
const tachoSuelto = page.locator('table tbody tr').filter({ hasNotText: 'CAAC02740' })
  .locator('button[title="Quitar"]').first()
if (await tachoSuelto.count()) { await tachoSuelto.click(); await esperar(600) }

check('hay un tacho para toda la familia',
  (await page.locator('button[title*="Quitar las 7 medidas"]').count()) === 1)
await page.locator('button[title*="Quitar las 7 medidas"]').click()
await esperar(700)
check('el tacho de la familia se lleva las 7',
  (await page.locator('text=/Todavía no agregaste ningún repuesto/').count()) === 1)
await cerrarModal()

// El bug de 2026-08-12: después de borrarlas, volver a cargar una medida tiene
// que traer otra vez a sus hermanas (antes entraba sola).
await buscarCodigo('CAAC02740')
await filasCatalogo().last().click()
await esperar(2000)
await abrirVerRepuestos()
check('volver a cargarla trae de nuevo las 7 medidas', (await filasModal().count()) === 7,
  `filas=${await filasModal().count()}`)
await cerrarModal()
// Y bajar la cantidad a cero saca la línea, en vez de dejarla cargada en cero.
await filasCatalogo().last().locator('button', { hasText: '−' }).click()
await esperar(800)
await abrirVerRepuestos()
check('bajar a cero saca la línea', (await filasModal().count()) === 6, `filas=${await filasModal().count()}`)
check('no quedan líneas en cero',
  (await page.locator('table tbody tr td input[type="number"][value="0"]').count()) === 0)
await cerrarModal()
await filasCatalogo().last().click()
await esperar(1500)
check('"Confirmar presupuesto" queda habilitado',
  await page.locator('button', { hasText: /Confirmar presupuesto/ }).isEnabled())
await page.locator('button', { hasText: /Confirmar presupuesto/ }).click()
await page.waitForURL(/presupuestos$/, { timeout: 20000 })
await esperar(1200)
check('la ficha del motor guardó las 7 opciones',
  py('print(c.execute("SELECT COUNT(*) FROM motor_repuesto_opciones").fetchone()[0])') === '7')

// Sacar del registro del motor desde un presupuesto nuevo
await irAlPasoRepuestos('Cliente Medidas UI')
check('el paso arranca con los repuestos del motor',
  (await page.locator('text=/Repuestos de este motor/').count()) === 1)
await page.locator('button[title*="Sacar las 7 medidas"]').click()
await esperar(1500)
check('avisa dónde recuperarlo', (await page.locator('text=/Repuestos eliminados/').count()) > 0)
check('se vació la ficha del motor',
  py('print(c.execute("SELECT COUNT(*) FROM motor_repuesto_opciones").fetchone()[0])') === '0')
check('y las 7 quedaron en la papelera',
  py('print(c.execute("SELECT COUNT(*) FROM motor_repuestos_papelera").fetchone()[0])') === '7')
await abrirVerRepuestos()
check('también salieron del presupuesto en curso',
  (await page.locator('text=/Todavía no agregaste ningún repuesto/').count()) === 1)
await cerrarModal()

// Papelera en la pantalla del motor
await page.goto(`${BASE}/motores`, { waitUntil: 'networkidle' })
await page.fill('input[placeholder*="Buscar" i]', 'CITROEN')
await esperar(1000)
await page.locator('table tbody tr').first().click()
await esperar(1500)
check('el motor muestra "Repuestos eliminados (7)"',
  (await page.locator('button', { hasText: /Repuestos eliminados \(7\)/ }).count()) === 1)
await page.locator('button', { hasText: /Repuestos eliminados \(7\)/ }).click()
await esperar(800)
check('la papelera lista los 7 códigos',
  (await page.locator('button', { hasText: /^Restaurar$/ }).count()) === 7)
await page.screenshot({ path: `${SHOT}/18-papelera-motor.png`, fullPage: false })
await page.locator('button', { hasText: /^Restaurar$/ }).first().click()
await esperar(1200)
check('restaurar uno lo devuelve a la ficha',
  py(`print(c.execute("SELECT COUNT(*) FROM motor_repuesto_opciones").fetchone()[0],
            c.execute("SELECT COUNT(*) FROM motor_repuestos_papelera").fetchone()[0])`) === '1 6')
await page.locator('button', { hasText: /Restaurar todo/ }).click()
await esperar(1500)
check('"Restaurar todo" devuelve el resto',
  py(`print(c.execute("SELECT COUNT(*) FROM motor_repuesto_opciones").fetchone()[0],
            c.execute("SELECT COUNT(*) FROM motor_repuestos_papelera").fetchone()[0])`) === '7 0')
check('el botón desaparece con la papelera vacía',
  (await page.locator('button', { hasText: /Repuestos eliminados/ }).count()) === 0)

// La categoría entera sí pregunta antes
await page.locator('button', { hasText: /^Editar$/ }).first().click()
await esperar(600)
await page.locator('button[title*="Sacar toda la categoría"]').click()
await esperar(600)
check('sacar la categoría entera pide confirmación',
  (await page.locator('text=/¿Sacar 7 opciones de la ficha\\?/').count()) === 1)
await page.locator('button', { hasText: /Cancelar/ }).click()
await esperar(500)
check('cancelar no borra nada',
  py('print(c.execute("SELECT COUNT(*) FROM motor_repuesto_opciones").fetchone()[0])') === '7')
await page.screenshot({ path: `${SHOT}/19-confirmacion-categoria.png`, fullPage: false })

console.log('\n=== Cerrar grupos y deshacer en el pop-up de repuestos ===')
await irAlPasoRepuestos('Cliente Deshacer UI')
await esperar(2000)
// Un repuesto fuera de catálogo con otra categoría: así hay dos grupos y
// aparece el "Colapsar todo" del encabezado.
await page.fill('input[placeholder="Descripción"]', 'Repuesto de prueba UI')
await page.fill('input[placeholder="Categoría (ej. Aros)"]', 'Prueba UI')
await page.fill('input[placeholder="Precio unit."]', '1000')
await page.locator('button', { hasText: /^Agregar$/ }).click()
await esperar(800)
await abrirVerRepuestos()
check('el pop-up abre con los dos grupos desplegados',
  (await filasModal().count()) === 8, `filas=${await filasModal().count()}`)
check('la familia entra entera y sin partirse', await familiaSinPartir())
await page.screenshot({ path: `${SHOT}/21-grupos-pop-up.png`, fullPage: false })

await page.locator('button[title="Cerrar el grupo"]', { hasText: 'Cojinetes biela' }).click()
await esperar(500)
check('la flechita cierra ese grupo', (await filasModal().count()) === 1)
check('y el otro grupo sigue abierto',
  (await page.locator('button[title="Cerrar el grupo"]').count()) === 1
  && (await page.locator('button[title="Abrir el grupo"]').count()) === 1)
await page.locator('button', { hasText: /^Colapsar todo$/ }).click()
await esperar(500)
check('"Colapsar todo" cierra los dos', (await filasModal().count()) === 0)
await page.locator('button', { hasText: /^Expandir todo$/ }).click()
await esperar(500)
check('"Expandir todo" los abre de nuevo', (await filasModal().count()) === 8)

await page.locator('button[title^="Quitar solo la medida"]').first().click()
await esperar(600)
check('quitar una medida saca la fila', (await filasModal().count()) === 7)
check('y deja el cartel de deshacer',
  (await page.locator('[data-testid="cartel-deshacer"]').count()) === 1)
await page.locator('[data-testid="cartel-deshacer"] button', { hasText: /Deshacer/ }).click()
await esperar(600)
check('"Deshacer" devuelve la medida', (await filasModal().count()) === 8)

await page.locator('button[title*="Quitar las 7 medidas"]').click()
await esperar(600)
check('el tacho de la familia se lleva las 7 de una', (await filasModal().count()) === 1)
await page.locator('[data-testid="cartel-deshacer"] button', { hasText: /Deshacer/ }).click()
await esperar(600)
check('"Deshacer" devuelve la familia entera', (await filasModal().count()) === 8)
await cerrarModal()

console.log('\n' + '='.repeat(50))
if (fallos.length) { console.log(`FALLARON ${fallos.length}: ${JSON.stringify(fallos, null, 1)}`) }
else console.log('TODO OK')

await browser.close()
process.exit(fallos.length ? 1 : 0)
