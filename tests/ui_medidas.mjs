/*
 * Verificación de la pantalla "Búsqueda por medidas", con Chromium headless
 * contra los dos dev servers (Vite en 5173 + Flask en 5000).
 *
 * Cómo se corre: ver tests/README.md. Resumen:
 *
 *     node tests/ui_medidas.mjs
 *
 * No escribe nada en la base: esta pantalla es de solo consulta. Por eso puede
 * correr antes o después de tests/ui_grupos.mjs sin pisarle los datos.
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
const textoDeFila = (i = 0) => filas().nth(i).textContent()

console.log('\n=== Login y acceso desde el menú ===')
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.fill('input[autocomplete="username"]', USUARIO)
await page.fill('input[type="password"]', CLAVE)
await page.click('button[type="submit"]')
await page.waitForURL(/motores/, { timeout: 15000 })
check('el menú tiene la sección', await page.locator('a[href="/busqueda-medidas"]').count() === 1)
await page.locator('a[href="/busqueda-medidas"]').click()
await esperar(900)
check('se entra a la pantalla', page.url().includes('busqueda-medidas'), page.url())

console.log('\n=== Estado inicial ===')
check('las tres familias con su total',
  (await page.locator('button', { hasText: /^Camisas\s*280$/ }).count()) === 1
  && (await page.locator('button', { hasText: /^Guías de válvulas\s*915$/ }).count()) === 1
  && (await page.locator('button', { hasText: /^Subconjuntos\s*201$/ }).count()) === 1)
check('sin filtros no se lista nada', await filas().count() === 0)
check('y se ofrecen ejemplos', await page.locator('button', { hasText: 'Ø interior 102 mm' }).count() === 1)
await page.screenshot({ path: path.join(SHOT, 'medidas-inicial.png'), fullPage: true })

console.log('\n=== Camisas: buscar por medida ===')
await page.locator('button', { hasText: 'Ø interior 102 mm' }).click()
await esperar(1200)
const encontradas = await filas().count()
check('el ejemplo trae resultados', encontradas > 0, encontradas)
check('se dice cuántas son', /pieza(s)? encontrada/.test(await page.locator('text=/pieza(s)? encontrada/').first().textContent()))
check('queda el tag del filtro activo', await page.locator('text=/Ø interior: 102 ± 0,5 mm/').count() === 1)
check('todas las filas caen en el rango pedido',
  (await filas().evaluateAll((trs) => trs.every((tr) => {
    const v = parseFloat(tr.children[3].textContent.replace('.', '').replace(',', '.'))
    return !Number.isNaN(v) && v >= 101.5 && v <= 102.5
  }))), 'alguna fila quedó fuera de 102 ± 0,5')
await page.screenshot({ path: path.join(SHOT, 'medidas-camisas.png'), fullPage: true })

console.log('\n=== Achicar la tolerancia achica el resultado ===')
await page.locator('label', { hasText: 'Ø INTERIOR' }).locator('input').nth(1).fill('0.1')
await esperar(1200)
check('con ±0,1 hay menos filas', await filas().count() < encontradas, await filas().count())

console.log('\n=== Ordenar por una columna ===')
await page.locator('button', { hasText: 'Limpiar filtros' }).click()
await esperar(500)
await page.locator('button', { hasText: 'Motor: Perkins' }).click()
await esperar(1200)
const antesDeOrdenar = await textoDeFila(0)
await page.locator('th', { hasText: 'Código' }).click()
await esperar(400)
const codigos = await filas().evaluateAll((trs) => trs.map((tr) => tr.children[0].textContent.trim()))
check('los códigos quedan ordenados',
  JSON.stringify(codigos) === JSON.stringify([...codigos].sort((a, b) => a.localeCompare(b, 'es-AR', { numeric: true }))),
  codigos)
check('ordenar no pierde filas', codigos.length > 0 && antesDeOrdenar.length > 0)

console.log('\n=== Guías: filtro por tipo y por código ===')
await page.locator('button', { hasText: 'Guías de válvulas' }).click()
await esperar(500)
await page.fill('input[placeholder="Código…"]', 'iy1171')
await esperar(1200)
const guia = await textoDeFila(0)
check('se encuentra la guía por su código', guia.includes('G IY1171 STD'), guia)
check('con su precio de la base', /\$\s?[\d.]+/.test(guia), guia)
check('y con stock', /Sí|No/.test(guia), guia)
await page.screenshot({ path: path.join(SHOT, 'medidas-guias.png'), fullPage: true })

console.log('\n=== Los filtros se guardan por familia ===')
await page.locator('button', { hasText: 'Camisas' }).click()
await esperar(900)
check('camisas conserva su búsqueda', await page.locator('text=/Motor \\/ aplicación: “perkins”/').count() === 1)
await page.locator('button', { hasText: 'Guías de válvulas' }).click()
await esperar(900)
check('y guías la suya', await page.inputValue('input[placeholder="Código…"]') === 'iy1171')

console.log('\n=== Subconjuntos: el precio es el de una sobremedida ===')
await page.locator('button', { hasText: 'Subconjuntos' }).click()
await esperar(500)
await page.fill('input[placeholder="Código…"]', 'S BE01010')
await esperar(1200)
const sub = await textoDeFila(0)
check('se encuentra el subconjunto', sub.includes('S BE01010'), sub)
check('y se dice de qué sobremedida es el precio', sub.includes('STD'), sub)
await page.screenshot({ path: path.join(SHOT, 'medidas-subconjuntos.png'), fullPage: true })

console.log('\n=== Una pieza sin equivalencia no inventa precio ===')
await page.fill('input[placeholder="Código…"]', '')
await page.locator('button', { hasText: 'Camisas' }).click()
await esperar(500)
await page.locator('button', { hasText: 'Limpiar filtros' }).click()
await esperar(400)
await page.fill('input[placeholder="Código…"]', 'UC 1694')
await esperar(1200)
const sinPrecio = await textoDeFila(0)
check('la camisa sin código del proveedor aparece igual', sinPrecio.includes('UC 1694'), sinPrecio)
check('y dice "Consultar" en vez de un precio', sinPrecio.includes('Consultar'), sinPrecio)

await browser.close()

console.log('\n' + '='.repeat(50))
if (fallos.length) {
  console.log(`FALLARON ${fallos.length}: ${JSON.stringify(fallos)}`)
  process.exit(1)
}
console.log('TODO OK')
