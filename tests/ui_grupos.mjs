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

/*
 * Desde el 2026-08-18 el wizard tiene un paso 5: "Revisar presupuesto" lleva a
 * la pantalla de revisión (mano de obra + repuestos, todavía sin guardar nada) y
 * recién "Confirmar y generar PDF" emite el presupuesto.
 */
async function irARevision() {
  await page.locator('button', { hasText: /Revisar presupuesto/ }).click()
  await esperar(1600)
}

async function confirmarEnRevision() {
  await page.locator('button', { hasText: /Confirmar y generar PDF/ }).click()
  await page.waitForURL(/presupuestos$/, { timeout: 20000 })
}

// Los montos de la barra oscura, en orden: los dos parciales y el total.
async function montosDeLaBarra() {
  const textos = await page.locator('text=/^\\$\\s?[\\d.,]+$/').allTextContents()
  // El formato ARS mete un espacio duro después del $; se normaliza para poder
  // comparar contra un literal.
  return textos.map((t) => t.replace(/\u00a0/g, ' ').trim())
}

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
check('paso 3 es Servicios', (await page.locator('text=/Paso 3 de 5/').count()) > 0)

// Un ítem de mano de obra: hace falta después para verificar el aviso de "la
// lista de la Cámara cambió" al revalidar. El catálogo de servicios no es una
// tabla (son filas sueltas), así que se usa el "+" de cantidad de la primera.
await page.locator('.servicios-picker-grid button[title="Elegir cantidad"]').first().click()
await esperar(400)
await page.locator('body > div').last().locator('button', { hasText: /^4$/ }).click()
await esperar(700)
check('el servicio elegido aparece en la previsualización',
  (await page.locator('text=/Todavía no elegiste servicios/').count()) === 0)

/* Precio unitario editable en la tabla de la derecha. Se pisa el precio, se
   verifica que el total lo tome (cantidad 4 × 1.000 = 4.000) y que el renglón
   de la izquierda quede marcado como editado; después el ↺ lo devuelve a la
   lista, que es como sigue el resto de la suite (el bloque de revalidar mide
   la mano de obra contra el precio de la Cámara). */
const precioEditable = page.locator('.servicios-picker-grid table tbody tr input').first()
check('el precio unitario de la previsualización es editable',
  (await precioEditable.count()) === 1)
await precioEditable.fill('1000')
await esperar(900)
const montosConPrecioPisado = await montosDeLaBarra()
check('el total toma el precio pisado (4 × $1.000)',
  montosConPrecioPisado[0] === '$ 4.000,00', JSON.stringify(montosConPrecioPisado))
check('el renglón de la izquierda queda marcado como editado',
  (await page.getByText('editado', { exact: true }).count()) === 1)
await page.screenshot({ path: `${SHOT}/00-servicios-precio-editado.png`, fullPage: false })
await page.locator('button[title="Volver al precio de la lista"]').click()
await esperar(900)
const montosRestaurados = await montosDeLaBarra()
check('el ↺ devuelve el precio de la lista',
  montosRestaurados[0] !== '$ 4.000,00', JSON.stringify(montosRestaurados))
check('y se va la marca de editado',
  (await page.getByText('editado', { exact: true }).count()) === 0)

/* Subtotal editable (2026-08-18): la casilla del unitario y la del subtotal son
   la misma cuenta vista de los dos lados — se escribe una y la otra se
   recalcula sola. */
const filaPreview = page.locator('.servicios-picker-grid table tbody tr').first()
check('la fila tiene dos casillas editables: unitario y subtotal',
  (await filaPreview.locator('input').count()) === 2)
await filaPreview.locator('input').nth(1).fill('8000')
await filaPreview.locator('input').nth(1).blur()
await esperar(900)
check('escribir el subtotal recalcula el precio unitario (8.000 ÷ 4)',
  (await filaPreview.locator('input').nth(0).inputValue()).includes('2.000'),
  await filaPreview.locator('input').nth(0).inputValue())
const montosConSubtotal = await montosDeLaBarra()
check('y el total toma ese subtotal', montosConSubtotal[0] === '$ 8.000,00',
  JSON.stringify(montosConSubtotal))

/* Caja de opcionales: lo que se manda ahí deja de sumar al total, pero sigue en
   el presupuesto. Se prueba con la flechita del renglón (el mismo camino que el
   arrastre, y el único que funciona en celular) y con un arrastre de verdad. */
await page.locator('button[title*="Pasar a opcionales"]').first().click()
await esperar(900)
const montosConOpcional = await montosDeLaBarra()
check('mandar la línea a opcionales la saca del total',
  montosConOpcional[0] === '$ 0,00', JSON.stringify(montosConOpcional))
check('la caja de opcionales muestra lo que quedó afuera',
  (await page.locator('text=/Si se hacen todos/').count()) === 1)
check('la barra de arriba avisa que están fuera del total',
  (await page.locator('text=/\\(fuera del total\\)/').count()) >= 1)
check('el renglón de la izquierda queda marcado como opcional',
  (await page.getByText('opcional', { exact: true }).count()) === 1)
await page.screenshot({ path: `${SHOT}/00b-servicios-opcionales.png`, fullPage: false })

await page.locator('button[title*="Volver al presupuesto"]').first().click()
await esperar(900)
check('volver al presupuesto lo hace sumar de nuevo',
  (await montosDeLaBarra())[0] === '$ 8.000,00')
check('y la caja de opcionales vuelve a estar vacía',
  (await page.locator('text=/Arrastrá acá los servicios o repuestos/').count()) === 1)

// Arrastre real (HTML5 drag & drop): la fila del presupuesto a la caja de abajo.
await page.locator('.servicios-picker-grid table tbody tr').first().dragTo(
  page.locator('text=/Arrastrá acá los servicios o repuestos/'),
)
await esperar(900)
check('arrastrar la fila a la caja también la saca del total',
  (await montosDeLaBarra())[0] === '$ 0,00', JSON.stringify(await montosDeLaBarra()))
await page.locator('button[title*="Volver al presupuesto"]').first().click()
await esperar(900)

// El precio vuelve al de la lista: el bloque de revalidar mide la mano de obra
// contra el precio de la Cámara.
await page.locator('button[title="Volver al precio de la lista"]').click()
await esperar(900)

/* Buscador sin acentos y por palabras sueltas (2026-08-18). */
const buscadorMO = page.locator('.servicios-picker-grid input[placeholder*="Buscar por número"]')
await buscadorMO.fill('valvulas')
await esperar(700)
check('el buscador de mano de obra encuentra "válvulas" sin acento',
  (await page.locator('.servicios-picker-grid').getByText(/válvulas/i).count()) > 0)
await buscadorMO.fill('valvulas asientos')
await esperar(700)
check('y encuentra las palabras en cualquier orden',
  (await page.locator('.servicios-picker-grid').getByText(/asientos de válvulas/i).count()) > 0)
await buscadorMO.fill('valvulas mercedes')
await esperar(700)
check('una palabra que no está deja la lista vacía',
  (await page.locator('text=/No se encontraron servicios/').count()) === 1)
await buscadorMO.fill('')
await esperar(600)

const btnRepuestos = page.locator('button', { hasText: /Siguiente.*Repuestos/i }).first()
await btnRepuestos.click()
await esperar(1200)
check('paso 4 es Repuestos', (await page.locator('text=/Paso 4 de 5/').count()) > 0)

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
// Desde el 2026-08-14 las hermanas NO entran al presupuesto: quedan marcadas
// como repuestos del motor (círculo en contorno) y se cotiza solo la elegida.
const badgesCantidad = await page.locator('.motor-selector-grid table tbody tr').locator('text=/^×\\d+$/').count()
check('al presupuesto entra solo la medida elegida', badgesCantidad === 1, `con ×N=${badgesCantidad}`)
const marcadasEnMotor = await page.locator('.motor-selector-grid table tbody tr button[data-estado="motor"]').count()
check('las 6 medidas hermanas quedan marcadas en el motor', marcadasEnMotor === 6, `marcadas=${marcadasEnMotor}`)
await page.screenshot({ path: `${SHOT}/01b-medidas-automaticas.png`, fullPage: false })
await page.fill('input[placeholder="Código…"]', '')
await esperar(1400)

// Abrir el pop-up de repuestos
await page.locator('button', { hasText: /Ver repuestos/ }).click()
await esperar(900)
const modal = page.locator('text=Repuestos del presupuesto').locator('..').locator('..')
check('se abre el pop-up de repuestos', (await page.locator('text=Repuestos del presupuesto').count()) > 0)
check('hay un solo grupo (una categoría)', (await page.locator('text=/^Cojinetes biela$/').count()) >= 1)
// Desde el 2026-08-18 no hay ninguna opción "elegida": cotiza todo lo cargado
// y la columna que decía "Cotiza" es ahora la casilla "Opcional".
check('la columna Opcional reemplazó a la de cotizar',
  (await page.locator('text=/^Opcional$/').count()) >= 1)
check('ya no se marca ningún "más caro"',
  (await page.getByText('El más caro', { exact: true }).count()) === 0)

// La cantidad se heredó: las 3 opciones deben estar en 4
const inputsCantidad = page.locator('table input[type="number"]')
const cantidades = await inputsCantidad.evaluateAll((els) => els.map((e) => e.value))
check('la cantidad 4 se heredó a todo el grupo', cantidades.every((c) => c === '4'), JSON.stringify(cantidades))

await page.screenshot({ path: `${SHOT}/02-modal-grupos.png`, fullPage: false })

// Cambiar la cantidad de una opción cambia solo su subtotal: ya no hay ninguna
// elección automática que se pueda mover de lugar.
const subtotalesAntes = await page.locator('table tbody tr td:nth-last-child(2)').allTextContents()
await inputsCantidad.nth(2).fill('40')
await esperar(800)
check('cambiar la cantidad no elige nada por su cuenta',
  (await page.getByText('El más caro', { exact: true }).count()) === 0)
await page.screenshot({ path: `${SHOT}/03-modal-cantidad-cambiada.png`, fullPage: false })

// Chip de cantidad sospechosa: dejar una en 1 contra las otras en 4/40
await inputsCantidad.nth(1).fill('1')
await esperar(800)
const sospechosas = await page.locator('text=¿cantidad correcta?').count()
check('aparece el aviso "¿cantidad correcta?"', sospechosas >= 1, `n=${sospechosas}`)
await page.screenshot({ path: `${SHOT}/04-aviso-cantidad.png`, fullPage: false })

// Marcar una línea como opcional: sale del total pero queda guardada.
check('ya no está el botón "Usar este"',
  (await page.locator('button', { hasText: /^Usar este$/ }).count()) === 0)
const totalModalAntes = await page.locator('text=/^Total \\$/').first().textContent().catch(() => '')
const casillasOpcional = page.locator('table tbody input[type="checkbox"]')
check('cada repuesto tiene su casilla de opcional', (await casillasOpcional.count()) >= 3)
await casillasOpcional.nth(2).check()
await esperar(700)
check('la línea queda marcada como opcional',
  (await page.locator('table tbody tr[data-opcional="1"]').count()) === 1)
check('el encabezado avisa cuánto quedó fuera del total',
  (await page.locator('text=/Opcionales .* \\(fuera del total\\)/').count()) >= 1)
const totalModalDespues = await page.locator('text=/^Total \\$/').first().textContent().catch(() => '')
check('el total del pop-up baja al marcar un opcional',
  totalModalAntes !== totalModalDespues, `${totalModalAntes} vs ${totalModalDespues}`)
await page.screenshot({ path: `${SHOT}/05-opcional-marcado.png`, fullPage: false })
// Se destilda: el resto de la suite trabaja con las tres cotizando.
await casillasOpcional.nth(2).uncheck()
await esperar(500)

// Cerrar el modal y confirmar el presupuesto
await page.locator('text=Repuestos del presupuesto').locator('xpath=../..').locator('button').last().click().catch(() => {})
await page.keyboard.press('Escape').catch(() => {})
await page.mouse.click(10, 10)
await esperar(600)

const totalTexto = await page.locator('text=Total').first().textContent().catch(() => '')
console.log('  (total en pantalla:', totalTexto, ')')

const montosEnRepuestos = await montosDeLaBarra()
await irARevision()
check('paso 5 es Revisión', (await page.locator('text=/Paso 5 de 5/').count()) > 0)
check('la revisión muestra la mano de obra',
  (await page.locator('text=/^Mano de obra$/').count()) > 0)
check('la revisión muestra los repuestos',
  (await page.locator('text=/^Repuestos$/').count()) > 0)
const filasRevision = await page.locator('table tbody tr').count()
check('las dos tablas de la revisión traen renglones', filasRevision >= 2, `filas=${filasRevision}`)
check('la revisión trae una fila por repuesto cargado',
  (await page.locator('text=/^Repuesto$/').count()) >= 1)
check('la revisión tiene la caja de opcionales',
  (await page.locator('text=/^Opcionales$/').count()) >= 1)
check('la caja de opcionales explica para qué es',
  (await page.locator('text=/Arrastrá acá los servicios o repuestos/').count()) === 1)
const montosEnRevision = await montosDeLaBarra()
check('el total de la revisión es el mismo que traía el paso Repuestos',
  montosEnRevision[2] === montosEnRepuestos[2],
  `${JSON.stringify(montosEnRepuestos)} vs ${JSON.stringify(montosEnRepuestos)}`)
await page.screenshot({ path: `${SHOT}/05b-revision.png`, fullPage: true })

/* En la revisión también se puede sacar algo del total: se arrastra (o se toca
   la flechita) hacia la caja de opcionales, y vale tanto para mano de obra como
   para repuestos. */
await page.locator('button[title*="Pasar a opcionales"]').first().click()
await esperar(900)
const montosSinManoObra = await montosDeLaBarra()
check('mover mano de obra a opcionales baja el total de la revisión',
  montosSinManoObra[2] !== montosEnRevision[2],
  `${JSON.stringify(montosEnRevision)} vs ${JSON.stringify(montosSinManoObra)}`)
check('el opcional aparece en su caja con el detalle',
  (await page.locator('text=/^Mano de obra$/').count()) >= 2)
// Un repuesto al mismo lugar: la caja acepta las dos cosas.
const flechaRepuesto = page.locator('button[title*="Pasar a opcionales"]').last()
await flechaRepuesto.click()
await esperar(900)
check('también acepta repuestos',
  (await page.locator('text=/Si se hacen todos/').count()) === 1)
await page.screenshot({ path: `${SHOT}/05c-revision-opcionales.png`, fullPage: true })
// Todo vuelve al presupuesto: el resto de la suite mide contra el total entero.
while (await page.locator('button[title*="Volver al presupuesto"]').count()) {
  await page.locator('button[title*="Volver al presupuesto"]').first().click()
  await esperar(600)
}
check('devolver todo deja el total como estaba',
  (await montosDeLaBarra())[2] === montosEnRevision[2],
  JSON.stringify(await montosDeLaBarra()))
await confirmarEnRevision()
check('el presupuesto se confirma y vuelve al historial', page.url().endsWith('/presupuestos'))
await esperar(1200)
await page.screenshot({ path: `${SHOT}/06-historial.png`, fullPage: false })

console.log('\n=== Detalle: grupos, aprobar y pedido ===')
await page.locator('table tbody tr').first().click()
await page.waitForURL(/presupuestos\/\d+$/, { timeout: 15000 })
await esperar(1500)
check('el detalle muestra los repuestos por categoría',
  (await page.locator('text=Repuestos por categoría').count()) > 0)
// Todas las opciones del grupo cotizan: ninguna quedó de alternativa guardada.
const chipsCotiza = await page.getByText('Cotiza', { exact: true }).count()
const chipsOpcional = await page.getByText('Opcional', { exact: true }).count()
check('marca que todas cotizan', chipsCotiza >= 3, String(chipsCotiza))
check('y ninguna quedó como opcional', chipsOpcional === 0, String(chipsOpcional))
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
  (await page.locator('text=/Hay repuestos más caros/').count()) === 0)
await page.locator('button', { hasText: /Actualizar a precios de hoy/ }).first().click()
await esperar(1500)
check('avisa que los precios no cambiaron',
  (await page.locator('text=/Los precios no cambiaron/').count()) > 0)

// El proveedor actualiza su lista: sube un 50% lo de este presupuesto. Y la
// Cámara actualiza la mano de obra: se duplica el precio del servicio cotizado.
// Antes de tocar nada se anota cómo estaban el catálogo y la lista de la
// Cámara: al final del bloque se restauran. Sin esto cada corrida dejaba los
// precios inflados un 50% más que la anterior, y la base de prueba dejaba de
// parecerse a la real.
const preciosOriginales = JSON.parse(py(`import json
pid = ${pid}
filas = c.execute("SELECT codigo, precio FROM crac_repuestos WHERE codigo IN (SELECT repuesto_codigo FROM presupuesto_item_opciones WHERE presupuesto_id = ?)", (pid,)).fetchall()
print(json.dumps(filas))`))
const serviciosOriginales = JSON.parse(py(`import json
pid = ${pid}
lista = c.execute("SELECT m.lista_num FROM presupuestos p JOIN motores m ON m.id = p.motor_id WHERE p.id = ?", (pid,)).fetchone()[0]
sids = [r[0] for r in c.execute("SELECT servicio_id FROM presupuesto_items WHERE presupuesto_id = ? AND servicio_id IS NOT NULL", (pid,)).fetchall()]
print(json.dumps([[lista] + [sid, c.execute(f"SELECT l{lista} FROM servicios WHERE id = ?", (sid,)).fetchone()[0]] for sid in sids]))`))

py(`pid = ${pid}
c.execute("UPDATE crac_repuestos SET precio = precio * 1.5 WHERE codigo IN (SELECT repuesto_codigo FROM presupuesto_item_opciones WHERE presupuesto_id = ?)", (pid,))
lista = c.execute("SELECT m.lista_num FROM presupuestos p JOIN motores m ON m.id = p.motor_id WHERE p.id = ?", (pid,)).fetchone()[0]
for (sid,) in c.execute("SELECT servicio_id FROM presupuesto_items WHERE presupuesto_id = ? AND servicio_id IS NOT NULL", (pid,)).fetchall():
    c.execute(f"UPDATE servicios SET l{lista} = l{lista} * 2 WHERE id = ?", (sid,))`)

await page.reload({ waitUntil: 'networkidle' })
await esperar(1500)
const totalAntes = await page.locator('text=/^\\$/').first().textContent().catch(() => '')
check('el detalle avisa que hay repuestos más caros',
  (await page.locator('text=/Hay repuestos más caros/').count()) > 0)

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
  (await page.locator('text=/Hay repuestos más caros/').count()) === 0)
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

// Precios que BAJAN: el cartel rojo no tiene que aparecer (pedido del dueño).
// El presupuesto emitido sigue cubriendo el trabajo, así que no hay nada que
// corregir; el botón del encabezado sigue estando por si igual se quiere bajar.
py(`pid = ${pid}
c.execute("UPDATE crac_repuestos SET precio = precio * 0.5 WHERE codigo IN (SELECT repuesto_codigo FROM presupuesto_item_opciones WHERE presupuesto_id = ?)", (pid,))`)
await page.reload({ waitUntil: 'networkidle' })
await esperar(1500)
check('si los precios BAJAN no aparece el cartel',
  (await page.locator('text=/Hay repuestos más caros/').count()) === 0)
check('el botón para actualizar igual sigue estando',
  (await page.locator('button', { hasText: /Actualizar a precios de hoy/ }).count()) >= 1)
await page.locator('button', { hasText: /Actualizar a precios de hoy/ }).first().click()
await esperar(1800)
check('el resumen aclara que ninguno subió',
  (await page.locator('text=/Ningún repuesto subió de precio/').count()) > 0)
await page.locator('button', { hasText: /^Cancelar$/ }).click()
await esperar(600)
// El catálogo y la lista de la Cámara vuelven exactamente a como estaban: este
// bloque es el único que los toca, y la suite tiene que poder correrse dos
// veces seguidas dando lo mismo.
py(preciosOriginales.map(([codigo, precio]) =>
  `c.execute("UPDATE crac_repuestos SET precio = ? WHERE codigo = ?", (${precio}, ${JSON.stringify(codigo)}))`).join('\n'))
py(serviciosOriginales.map(([lista, sid, precio]) =>
  `c.execute("UPDATE servicios SET l${lista} = ? WHERE id = ?", (${precio}, ${sid}))`).join('\n'))
check('el catálogo quedó como estaba',
  Number(py(`print(c.execute("SELECT precio FROM crac_repuestos WHERE codigo = ?", (${JSON.stringify(preciosOriginales[0][0])},)).fetchone()[0])`))
  === preciosOriginales[0][1], String(preciosOriginales[0][1]))

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
check('la copia arranca en el paso Cliente', (await page.locator('text=/Paso 1 de 5/').count()) > 0)
await page.screenshot({ path: `${SHOT}/11-duplicar.png`, fullPage: false })

await page.fill('input[placeholder*="Buscar cliente"]', 'Cliente Copia UI')
await esperar(600)
const btnMecanico2 = page.locator('button', { hasText: /^Mecánico$/ })
if (await btnMecanico2.count()) { await btnMecanico2.click(); await esperar(400) }
await page.locator('button', { hasText: /Siguiente|Continuar/i }).first().click()
await esperar(1800)
check('saltea el selector de motor y va a Servicios',
  (await page.locator('text=/Paso 3 de 5/').count()) > 0)
const cantidadesCopiadas = await page.locator('.servicios-picker-grid table tbody tr').count()
check('el paso Servicios carga el catálogo del motor copiado', cantidadesCopiadas > 0)

await page.locator('button', { hasText: /Siguiente.*Repuestos/i }).first().click()
await esperar(1800)
check('los repuestos vienen copiados',
  (await page.locator('button', { hasText: /Ver repuestos \(\d+\)/ }).count()) > 0)
await page.screenshot({ path: `${SHOT}/12-duplicar-repuestos.png`, fullPage: false })

await irARevision()
await confirmarEnRevision()
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
check('la ficha ya no marca ningún "más caro"',
  (await page.locator('text=El más caro').count()) === 0)
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
check('el paso Repuestos arranca vacío',
  (await page.locator('button', { hasText: /^Ver repuestos$/ }).count()) === 1,
  'sin el (N) al lado')
await buscarCodigo('CAAC02740')
// La medida STD es la última por orden de código (…060, 60/, S60, STD). No sirve
// filtrar por el texto "STD": la aplicación de S60 dice "STD/060".
await filasCatalogo().last().click()
await esperar(2000)
await abrirVerRepuestos()
// Cambio de criterio (2026-08-14): las medidas hermanas NO entran al
// presupuesto. Entra la que se eligió; las otras quedan marcadas en el motor.
check('solo entra al presupuesto la medida elegida', (await filasModal().count()) === 1,
  `filas=${await filasModal().count()}`)
await cerrarModal()
check('la medida elegida queda con el círculo lleno',
  (await page.locator('button[data-estado="presupuesto"]').count()) === 1)
check('las otras 6 medidas quedan marcadas en el motor, sin cotizar',
  (await page.locator('button[data-estado="motor"]').count()) === 6,
  `marcadas=${await page.locator('button[data-estado="motor"]').count()}`)
await page.screenshot({ path: `${SHOT}/22-circulos-medidas.png`, fullPage: false })

// Con las 7 cargadas a mano se sigue viendo la familia como una unidad.
for (let i = 0; i < 6; i += 1) {
  await filasCatalogo().nth(i).click()
  await esperar(500)
}
await abrirVerRepuestos()
check('cargadas a mano, las 7 medidas entran al presupuesto', (await filasModal().count()) === 7,
  `filas=${await filasModal().count()}`)
check('el renglón de familia muestra el código base',
  (await page.locator('tr[data-familia="CAAC02740"] >> text=/7 medidas del mismo repuesto/').count()) > 0)
check('las 7 medidas quedan marcadas como una familia',
  (await page.locator('tr[data-familia="CAAC02740"]').count()) === 8,
  '7 filas + el renglón de la familia')
check('las 7 medidas cotizan, sin ninguna elegida por el sistema',
  (await page.getByText('El más caro', { exact: true }).count()) === 0)
await cerrarModal()

// Otra marca de la misma categoría: entra como una línea más del grupo y suma.
await buscarCodigo('')
await page.locator('button', { hasText: /^Cojinetes biela$/ }).first().click()
await esperar(1600)
await filasCatalogo().filter({ hasNotText: 'CAAC02740' }).first().click()
await esperar(2000)
await abrirVerRepuestos()
check('la otra marca entra al mismo grupo y cotiza',
  (await filasModal().count()) === 8, `filas=${await filasModal().count()}`)
check('no aparece ninguna nota de más caro ni más barato',
  (await page.getByText('El más caro', { exact: true }).count())
  + (await page.getByText('El más barato', { exact: true }).count()) === 0)
await page.screenshot({ path: `${SHOT}/17-notas-cotiza.png`, fullPage: false })
// El bug de los aros (2026-08-12): un código sin familia se colaba entre las
// medidas de otro y parecía una medida más. Las filas de una familia tienen
// que quedar SIEMPRE pegadas.
check('la familia no se parte con otra marca en el mismo grupo',
  await familiaSinPartir())
// Marcarla como opcional tampoco puede partir la familia ni cambiar el orden.
await page.locator('table tbody input[type="checkbox"]').first().check()
await esperar(700)
check('la familia sigue entera con una línea marcada opcional',
  await familiaSinPartir())
await page.locator('table tbody input[type="checkbox"]').first().uncheck()
await esperar(500)
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
// que volver a marcar a sus hermanas en el motor (antes entraba sola).
await buscarCodigo('CAAC02740')
await filasCatalogo().last().click()
await esperar(2000)
check('volver a cargarla vuelve a marcar las 6 hermanas',
  (await page.locator('button[data-estado="motor"]').count()) === 6,
  `marcadas=${await page.locator('button[data-estado="motor"]').count()}`)
await abrirVerRepuestos()
check('y al presupuesto entra una sola', (await filasModal().count()) === 1,
  `filas=${await filasModal().count()}`)
await cerrarModal()
// Y bajar la cantidad a cero saca la línea, en vez de dejarla cargada en cero.
await filasCatalogo().last().locator('button', { hasText: '−' }).click()
await esperar(800)
check('bajar a cero saca la línea del presupuesto',
  (await page.locator('button', { hasText: /^Ver repuestos$/ }).count()) === 1)
// El tilde de esa medida lo había puesto la propia cantidad, así que se va con
// ella; los de las hermanas los puso la carga y también, porque nunca se
// guardaron. Lo que estaba en la ficha de antes no se toca (se prueba abajo).
check('no quedan líneas en cero',
  (await page.locator('table tbody tr td input[type="number"][value="0"]').count()) === 0)
await filasCatalogo().last().click()
await esperar(1500)
check('"Revisar presupuesto" queda habilitado',
  await page.locator('button', { hasText: /Revisar presupuesto/ }).isEnabled())
await irARevision()
await confirmarEnRevision()
await esperar(1200)
check('la ficha del motor guardó las 7 opciones',
  py('print(c.execute("SELECT COUNT(*) FROM motor_repuesto_opciones").fetchone()[0])') === '7')

// Sacar del registro del motor desde un presupuesto nuevo
await irAlPasoRepuestos('Cliente Medidas UI')
check('el segundo presupuesto del motor lista sus repuestos',
  (await page.locator('text=/Repuestos de este motor/').count()) === 1)
// Lo que más se pidió de todo este cambio: la ficha es de dónde elegir, no la
// selección hecha. El presupuesto nuevo arranca en cero aunque el motor tenga
// 7 repuestos cargados.
check('pero el presupuesto arranca en cero igual',
  (await page.locator('button', { hasText: /^Ver repuestos$/ }).count()) === 1)
/* La regla de la cantidad recordada, verificada en los dos sentidos: lo que
   tiene cantidad en la ficha es exactamente lo que alguna vez se cotizó en un
   presupuesto de este motor; lo que solo quedó marcado no tiene cantidad. */
const USADO = 'SELECT o.repuesto_codigo FROM presupuesto_item_opciones o JOIN presupuestos p ON p.id = o.presupuesto_id WHERE p.motor_id = g.motor_id AND o.cantidad > 0'
const coherencia = py(`print(c.execute("SELECT COUNT(*) FROM motor_repuesto_opciones mro JOIN motor_repuesto_grupos g ON g.id = mro.grupo_id WHERE mro.cantidad > 0 AND mro.repuesto_codigo NOT IN (${USADO})").fetchone()[0], c.execute("SELECT COUNT(*) FROM motor_repuesto_opciones mro JOIN motor_repuesto_grupos g ON g.id = mro.grupo_id WHERE mro.cantidad = 0 AND mro.repuesto_codigo IN (${USADO})").fetchone()[0])`)
check('la cantidad la tienen solo los repuestos que se cotizaron alguna vez',
  coherencia === '0 0', `con cantidad sin uso / usados sin cantidad = ${coherencia}`)
const sinCantidad = py('print(c.execute("SELECT COUNT(*) FROM motor_repuesto_opciones WHERE cantidad = 0").fetchone()[0])')
check('las medidas hermanas quedaron marcadas sin cantidad',
  Number(sinCantidad) >= 4, `sin cantidad = ${sinCantidad}`)
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
// La familia se carga a mano: desde el 2026-08-14 el paso arranca vacío y las
// medidas hermanas se marcan en el motor en vez de entrar al presupuesto.
await buscarCodigo('CAAC02740')
// El filtro por código trae más que la familia (…060, 60/, S60, STD): las 7
// medidas son las 6 primeras más la última. `60/` y `S60` son otros productos.
for (let i = 0; i < 6; i += 1) {
  await filasCatalogo().nth(i).click()
  await esperar(450)
}
await filasCatalogo().last().click()
await esperar(450)
await buscarCodigo('')
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

// El título tiene que ser exacto: el bloque "Repuestos de este motor" tiene su
// propio tacho de familia ("Sacar las 7 medidas … de este motor"), que es otra
// cosa — ese saca del motor, éste solo del presupuesto.
const tachoFamilia = page.locator('button[title="Quitar las 7 medidas de CAAC02740"]')
check('el pop-up tiene el tacho de la familia', (await tachoFamilia.count()) === 1)
await tachoFamilia.click()
await esperar(600)
check('el tacho de la familia se lleva las 7 de una', (await filasModal().count()) === 1)
await page.locator('[data-testid="cartel-deshacer"] button', { hasText: /Deshacer/ }).click()
await esperar(600)
check('"Deshacer" devuelve la familia entera', (await filasModal().count()) === 8)
await cerrarModal()

console.log('\n=== Buscador del catálogo: sin acentos y por palabras sueltas ===')
/*
 * El pedido del dueño: "quiero poner Fiat 2.8 y que encuentre FIAT DUCATO
 * 2.8TD" — que el orden y la posición de las palabras no cambien el resultado.
 */
await page.goto(`${BASE}/repuestos`, { waitUntil: 'networkidle' })
await esperar(800)
const buscadorDesc = page.locator('input[placeholder="Filtrar por descripción…"]')
await buscadorDesc.fill('fiat 2.8')
await esperar(1400)
const filasFiat = await page.locator('table tbody tr').count()
check('encuentra por dos palabras sueltas', filasFiat > 0, `filas=${filasFiat}`)
check('los resultados son los que tienen las dos palabras',
  (await page.locator('table tbody').getByText(/DUCATO 2\.8/i).count()) > 0)
await page.screenshot({ path: `${SHOT}/24-buscador-repuestos.png`, fullPage: false })
await buscadorDesc.fill('2.8 fiat')
await esperar(1400)
check('el orden de las palabras no cambia el resultado',
  (await page.locator('table tbody tr').count()) === filasFiat)
await buscadorDesc.fill('FIAT 2.8')
await esperar(1400)
check('las mayúsculas tampoco',
  (await page.locator('table tbody tr').count()) === filasFiat)
await buscadorDesc.fill('fiat 2.8 mercedes')
await esperar(1400)
check('agregar una palabra que no está deja la tabla vacía',
  (await page.locator('table tbody tr').count()) === 0)
await buscadorDesc.fill('')
await esperar(800)

console.log('\n=== Círculo del motor y "Repuestos ya utilizados" ===')
/*
 * El bloque del cambio del 2026-08-14: los dos ejes separados (cantidad = va en
 * este presupuesto; círculo = sirve para este motor) y el atajo para traer
 * repuestos de un presupuesto anterior.
 */
await irAlPasoRepuestos('Cliente Circulo UI')

// 1. Marcar a mano NO cotiza, y se guarda en el motor en el momento.
// El código sale de la base y no de la pantalla: este motor ya tiene ficha de
// los bloques anteriores, y hay que agarrar uno que todavía NO sea del motor.
// (Leer el código de la celda no sirve: la columna corta y mete espacios.)
// ORDER BY codigo: el mismo orden con el que la API devuelve el catálogo, así
// el código que se elige acá es el primero libre que se ve en pantalla.
const codigoLibre = py("print(c.execute(\"SELECT codigo FROM crac_repuestos WHERE codigo LIKE 'CAAC02740%' AND codigo NOT IN (SELECT repuesto_codigo FROM motor_repuesto_opciones) ORDER BY codigo LIMIT 1\").fetchone()[0])")
// Se busca la familia entera y se agarra la primera fila que todavía no es del
// motor: buscar el código completo no sirve para identificar una sola fila
// —desde el 2026-08-18 los buscadores separan por palabras, así que "60/" trae
// también "060" y "S60"—, y esa tolerancia es justamente lo que se pidió.
await buscarCodigo(codigoLibre.split(/\s+/)[0])
// El índice se resuelve UNA vez: en cuanto se toca el círculo la fila deja de
// estar "fuera", y un locator filtrado por ese estado pasaría a apuntar a otra.
const indiceLibre = await (async () => {
  const total = await filasCatalogo().count()
  for (let i = 0; i < total; i += 1) {
    if (await filasCatalogo().nth(i).locator('button[data-estado="fuera"]').count()) return i
  }
  return 0
})()
const filaLibre = filasCatalogo().nth(indiceLibre)
const opcionesAntes = Number(py('print(c.execute("SELECT COUNT(*) FROM motor_repuesto_opciones").fetchone()[0])'))
await filaLibre.locator('button[data-estado="fuera"]').click()
await esperar(1800)
check('marcar a mano no agrega nada al presupuesto',
  (await page.locator('button', { hasText: /^Ver repuestos$/ }).count()) === 1)
check('el círculo queda en contorno (en el motor, sin cotizar)',
  (await filaLibre.locator('button[data-estado="motor"]').count()) === 1,
  `codigo=${codigoLibre}`)
check('y se guarda en el motor en el momento, sin confirmar el presupuesto',
  Number(py('print(c.execute("SELECT COUNT(*) FROM motor_repuesto_opciones").fetchone()[0])')) === opcionesAntes + 1)
check('se guarda sin cantidad',
  py(`print(c.execute("SELECT cantidad FROM motor_repuesto_opciones WHERE repuesto_codigo = ?", ("${codigoLibre}",)).fetchone()[0])`) === '0.0')
await page.screenshot({ path: `${SHOT}/23-circulo-en-el-motor.png`, fullPage: false })

// 2. Poner cantidad llena el círculo solo.
await filaLibre.click()
await esperar(1000)
check('poner cantidad llena el círculo solo',
  (await filaLibre.locator('button[data-estado="presupuesto"]').count()) === 1)

// 3. Sacar la cantidad de algo que YA estaba en el motor no lo saca del motor.
const codigoPrevio = py('print(c.execute("SELECT repuesto_codigo FROM motor_repuesto_opciones WHERE cantidad > 0 LIMIT 1").fetchone()[0])')
await buscarCodigo(codigoPrevio)
await filasCatalogo().first().click()
await esperar(900)
check('un repuesto que ya era del motor se puede cotizar',
  (await filasCatalogo().first().locator('button[data-estado="presupuesto"]').count()) === 1)
// Hasta sacarlo del todo: el motor recuerda la cantidad, así que puede haber
// entrado con más de uno y un solo "−" no lo saca.
for (let i = 0; i < 20; i += 1) {
  if (!(await filasCatalogo().first().locator('text=/^×\\d+$/').count())) break
  await filasCatalogo().first().locator('button', { hasText: '−' }).click()
  await esperar(500)
}
check('sacarle la cantidad lo deja marcado en el motor (venía de antes)',
  (await filasCatalogo().first().locator('button[data-estado="motor"]').count()) === 1)
check('y sigue en la ficha del motor en la base',
  py(`print(c.execute("SELECT COUNT(*) FROM motor_repuesto_opciones WHERE repuesto_codigo = ?", ("${codigoPrevio}",)).fetchone()[0])`) === '1')

// 4. Destildar a mano sí lo saca del motor (y va a la papelera).
await filasCatalogo().first().locator('button[data-estado="motor"]').click()
await esperar(1500)
check('destildar a mano lo saca del motor',
  py(`print(c.execute("SELECT COUNT(*) FROM motor_repuesto_opciones WHERE repuesto_codigo = ?", ("${codigoPrevio}",)).fetchone()[0])`) === '0')
check('avisa dónde recuperarlo',
  (await page.locator('text=/Repuestos eliminados/').count()) > 0)
check('y queda en la papelera del motor',
  py(`print(c.execute("SELECT COUNT(*) FROM motor_repuestos_papelera WHERE repuesto_codigo = ?", ("${codigoPrevio}",)).fetchone()[0])`) === '1')

// 5. "Repuestos ya utilizados": lista los presupuestos del motor y trae lo elegido.
await page.locator('button', { hasText: /Repuestos ya utilizados/ }).click()
await esperar(1500)
check('abre la lista de presupuestos anteriores del motor',
  (await page.locator('text=/Repuestos ya utilizados en este motor/').count()) === 1)
const filasPresupuestos = page.locator('button', { hasText: /^#\d{4}/ })
check('hay al menos un presupuesto anterior con repuestos',
  (await filasPresupuestos.count()) >= 1, `filas=${await filasPresupuestos.count()}`)
await page.screenshot({ path: `${SHOT}/24-repuestos-ya-utilizados.png`, fullPage: false })
await filasPresupuestos.first().click()
await esperar(1500)
const casillasUsados = page.locator('input[type="checkbox"]')
check('el detalle lista los repuestos de ese presupuesto',
  (await casillasUsados.count()) >= 1, `casillas=${await casillasUsados.count()}`)
check('arrancan todos destildados',
  (await page.locator('input[type="checkbox"]:checked').count()) === 0)
check('el botón de agregar arranca apagado',
  !(await page.locator('button', { hasText: /Agregar los seleccionados/ }).isEnabled()))
await casillasUsados.first().click()
await esperar(400)
check('al tildar uno se habilita el botón',
  await page.locator('button', { hasText: /Agregar los seleccionados \(1\)/ }).isEnabled())
await page.locator('button', { hasText: /Agregar los seleccionados/ }).click()
await esperar(1200)
check('lo elegido entra al presupuesto',
  (await page.locator('text=/Se agregaron 1 repuesto al presupuesto/').count()) === 1)

console.log('\n' + '='.repeat(50))
if (fallos.length) { console.log(`FALLARON ${fallos.length}: ${JSON.stringify(fallos, null, 1)}`) }
else console.log('TODO OK')

await browser.close()
process.exit(fallos.length ? 1 : 0)
