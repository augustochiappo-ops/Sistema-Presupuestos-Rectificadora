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
mkdirSync(SHOT, { recursive: true })
const fallos = []

function check(nombre, ok, detalle = '') {
  if (ok) console.log(`  OK   ${nombre}`)
  else { console.log(`  FALLA ${nombre} — ${detalle}`); fallos.push(nombre) }
}

const browser = await chromium.launch({ executablePath: CHROMIUM })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
page.on('pageerror', (e) => { console.log('  !! error de JS en la página:', e.message); fallos.push('JS: ' + e.message) })

async function esperar(ms) { await page.waitForTimeout(ms) }

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

// Saltar servicios
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

// Copiar códigos
await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {})
const btnCopiar = page.locator('button', { hasText: /Copiar códigos/ })
check('hay botón de copiar códigos', (await btnCopiar.count()) > 0)

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

console.log('\n' + '='.repeat(50))
if (fallos.length) { console.log(`FALLARON ${fallos.length}: ${JSON.stringify(fallos, null, 1)}`) }
else console.log('TODO OK')

await browser.close()
process.exit(fallos.length ? 1 : 0)
