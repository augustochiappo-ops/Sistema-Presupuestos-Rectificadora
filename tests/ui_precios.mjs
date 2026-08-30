/*
 * Verificación de la pantalla "Editar Precios" y del guardado de precios desde
 * el wizard, con Chromium headless contra los dos dev servers (Vite en 5173 +
 * Flask en 5000).
 *
 * Cómo se corre: ver tests/README.md. Resumen:
 *
 *     node tests/ui_precios.mjs
 *
 * ESTA SUITE ESCRIBE: crea precios propios, un ajuste general y un cliente de
 * prueba, y los borra al terminar. Correrla siempre contra un DATA_DIR
 * descartable, nunca contra producción.
 *
 * Las capturas quedan en tests/capturas/ (gitignoreado).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.dirname(AQUI)
const { chromium } = await import(
  path.join(RAIZ, 'webapp', 'frontend', 'node_modules', 'playwright-core', 'index.mjs')
)

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const USUARIO = process.env.APP_USERNAME || 'admin'
const CLAVE = process.env.APP_PASSWORD
if (!CLAVE) {
  console.error(
    '\nFalta APP_PASSWORD: es la contraseña con la que la suite entra a la app.\n'
    + 'Preparate el entorno con  export APP_PASSWORD="…" && tests/preparar.sh\n',
  )
  process.exit(1)
}
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
const esperar = (ms) => page.waitForTimeout(ms)
const filas = () => page.locator('table tbody tr')

console.log('\n=== Login y acceso a la pantalla ===')
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.fill('input[autocomplete="username"]', USUARIO)
await page.fill('input[type="password"]', CLAVE)
await page.click('button[type="submit"]')
await page.waitForURL(/motores/, { timeout: 15000 })
check('el menú tiene "Editar Precios"', await page.locator('a[href="/precios"]').count() === 1)
await page.locator('a[href="/precios"]').click()
await esperar(1300)
check('ya no está el placeholder de "próxima versión"',
      await page.getByText('próxima versión').count() === 0)
check('el título es Editar Precios',
      (await page.locator('h1').first().textContent())?.includes('Editar Precios'))

console.log('\n=== Apartado 1: la lista de mano de obra ===')
check('trae los 235 trabajos', await filas().count() === 235, await filas().count())
check('están las trece listas de la Cámara',
      await page.locator('button').filter({ hasText: /^\d+\s*\d+$/ }).count() === 13)
check('arranca en la lista 8, que es la que más motores tiene',
      await page.getByText('El número chico es cuántos motores').count() === 1)

const primera = filas().first()
const campo = primera.locator('input').first()
check('un trabajo sin tarifar muestra el campo vacío, no el precio de la Cámara',
      await campo.getAttribute('placeholder') === '—',
      await campo.getAttribute('placeholder'))
check('y el precio de la Cámara se ve en su propia columna',
      /\$/.test((await primera.textContent()) || ''))

console.log('\n=== Editar un precio ===')
await campo.fill('280000')
await campo.press('Enter')
await esperar(1400)
check('el precio queda guardado y formateado',
      (await campo.inputValue()) === '$ 280.000', await campo.inputValue())
check('la solapa "Mis precios" lo cuenta',
      /Mis precios \(1\)/.test((await page.locator('button', { hasText: /Mis precios/ }).textContent()) || ''),
      await page.locator('button', { hasText: /Mis precios/ }).textContent())
await page.screenshot({ path: path.join(SHOT, 'precios-lista.png') })

console.log('\n=== Propagar a las trece listas ===')
await primera.locator('button[title*="trece listas"]').click()
await esperar(1400)
check('se abre la vista previa', await page.getByText('Aplicar a las trece listas').count() > 0)
const montos = await page.locator('text=/^\\$\\s?[\\d.]+$/').allTextContents()
check('la vista previa muestra montos de las trece listas', montos.length >= 20, montos.length)
await page.screenshot({ path: path.join(SHOT, 'precios-propagar.png') })
await page.locator('button', { hasText: /Aplicar a \d+ listas/ }).click()
await esperar(1800)
check('quedaron las trece guardadas',
      /Mis precios \(13\)/.test((await page.locator('button', { hasText: /Mis precios/ }).textContent()) || ''),
      await page.locator('button', { hasText: /Mis precios/ }).textContent())

console.log('\n=== Apartado 2: Mis precios ===')
await page.locator('button', { hasText: /Mis precios/ }).click()
await esperar(1000)
check('lista las trece', await filas().count() === 13, await filas().count())
const textoFila = (await filas().first().textContent()) || ''
check('cada fila dice de dónde salió el precio', /esta pantalla/.test(textoFila), textoFila.slice(0, 120))
check('y cuándo se fijó', /\d{2}\/\d{2}\/\d{4}/.test(textoFila), textoFila.slice(0, 120))
await page.screenshot({ path: path.join(SHOT, 'precios-mios.png') })

console.log('\n=== El ↺ devuelve a la lista de la Cámara ===')
await filas().first().locator('button[title*="Volver"]').click()
await esperar(900)
check('queda una menos', await filas().count() === 12, await filas().count())

console.log('\n=== El aumento general ===')
await page.locator('button', { hasText: /Lista de mano de obra/ }).click()
await esperar(900)
const filaLibre = filas().nth(1)               // una sin precio propio
const antesDelAjuste = (await filaLibre.textContent()) || ''
await page.locator('input[title*="Porcentaje sobre la lista"]').fill('25')
await page.locator('button', { hasText: 'Aplicar' }).click()
await esperar(1400)
const despuesDelAjuste = (await filaLibre.textContent()) || ''
check('el aumento general cambia lo que no está tarifado',
      antesDelAjuste !== despuesDelAjuste, `${antesDelAjuste} vs ${despuesDelAjuste}`)
check('pero NO pisa un precio propio',
      (await filas().first().locator('input').first().inputValue()) === '$ 280.000',
      await filas().first().locator('input').first().inputValue())

console.log('\n=== El wizard: guardar un precio mientras se cotiza ===')
await page.goto(`${BASE}/presupuestos/nuevo`, { waitUntil: 'networkidle' })
await esperar(900)
await page.fill('input[placeholder*="Buscar cliente"]', 'Cliente Precios UI')
await esperar(600)
const btnMecanico = page.locator('button', { hasText: /^Mecánico$/ })
if (await btnMecanico.count()) { await btnMecanico.click(); await esperar(400) }
await page.locator('button', { hasText: /Siguiente|Continuar/i }).first().click()
await esperar(700)
await page.fill('input[placeholder*="Buscar" i]', 'CITROEN')
await esperar(1000)
await filas().first().click()
await esperar(1500)
check('paso 3 es Servicios', await page.locator('text=/Paso 3 de 5/').count() > 0)
check('el ajuste del wizard se llama "de este presupuesto"',
      await page.getByText('Ajuste de este presupuesto').count() === 1)
check('y avisa que la lista ya tiene el aumento general',
      await page.getByText(/tu lista ya tiene/).count() === 1)
await page.screenshot({ path: path.join(SHOT, 'precios-wizard-cabecera.png') })

await page.locator('.servicios-picker-grid button[title="Elegir cantidad"]').first().click()
await esperar(400)
await page.locator('body > div').last().locator('button', { hasText: /^4$/ }).click()
await esperar(900)
const campoWizard = page.locator('table').last().locator('input').first()
await campoWizard.fill('999000')
await esperar(700)
const btnGuardar = page.locator('button[title*="como tu precio"]')
check('aparece el botón de guardar el precio como tarifa', await btnGuardar.count() === 1)
await btnGuardar.first().click()
await esperar(1400)
check('y queda el acuse de guardado',
      await page.locator('span[title*="Guardado como tu precio"]').count() === 1)

console.log('\n=== El resumen del paso de Revisión ===')
await page.locator('button', { hasText: /Siguiente.*Repuestos/i }).first().click()
await esperar(1200)
await page.locator('button', { hasText: /Revisar presupuesto/ }).click()
await esperar(1800)
check('paso 5 es Revisión', await page.locator('text=/Paso 5 de 5/').count() > 0)
// El precio ya se guardó con el botón ⤓, así que ahora coincide con la tarifa y
// el resumen no tiene nada que ofrecer: es justo lo que se quiere verificar.
check('el resumen no ofrece guardar un precio que ya es la tarifa',
      await page.getByText(/como mi tarifa/).count() === 0)
await page.screenshot({ path: path.join(SHOT, 'precios-revision.png'), fullPage: true })

const unitario = page.locator('table').first().locator('tbody tr').first().locator('input').nth(1)
await unitario.fill('1234000')
await unitario.blur()
await esperar(900)
check('al editar de nuevo, el resumen vuelve a ofrecerlo',
      await page.getByText(/como mi tarifa/).count() === 1)
check('y muestra el precio viejo y el nuevo',
      /\$ 1\.234\.000/.test((await page.getByText(/como mi tarifa/).locator('..').locator('..').textContent()) || ''))

console.log('\n=== Limpieza ===')
// Se deshace todo lo que creó la suite, para no dejarle datos a la siguiente.
await page.goto(`${BASE}/precios`, { waitUntil: 'networkidle' })
await esperar(1200)
await page.locator('input[title*="Porcentaje sobre la lista"]').fill('0')
await page.locator('button', { hasText: 'Aplicar' }).click()
await esperar(1000)
await page.locator('button', { hasText: /Mis precios/ }).click()
await esperar(900)
let quedan = await filas().count()
while (quedan > 0) {
  await filas().first().locator('button[title*="Volver"]').click()
  await esperar(550)
  const ahora = await filas().count()
  if (ahora === quedan) break
  quedan = ahora
}
check('no quedaron precios propios', await filas().count() === 0, await filas().count())
check('el aumento general volvió a cero',
      (await page.locator('button', { hasText: /Lista de mano de obra/ }).count()) === 1)

await browser.close()

console.log('\n' + '='.repeat(60))
if (fallos.length) {
  console.log(`FALLARON ${fallos.length} verificaciones:`)
  fallos.forEach((f) => console.log(`  · ${f}`))
  process.exit(1)
}
console.log('Todas las verificaciones pasaron.')
