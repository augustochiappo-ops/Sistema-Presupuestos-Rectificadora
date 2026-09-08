/*
 * El test corto: el que se corre en CADA cambio.
 *
 *     node tests/humo.mjs          # o, mejor, tests/rapido.sh
 *
 * Tarda alrededor de un minuto. NO reemplaza a las suites de UI —esas siguen
 * corriendo enteras los miércoles y los viernes— y a propósito no intenta.
 *
 * QUÉ BUSCA. Lo que se rompe cuando uno toca el frontend y no se da cuenta:
 * una pantalla que no abre, una tabla que queda vacía, una columna nueva que
 * empuja a las otras y deja las celdas cortadas. Son fallas caras porque llegan
 * a producción sin hacer ruido, y son baratas de detectar: alcanza con abrir
 * cada pantalla y mirar.
 *
 * QUÉ NO BUSCA. Todo lo demás: que el precio sea el correcto, que el agrupado
 * de repuestos haga lo que tiene que hacer, que el PDF salga bien, que un
 * filtro con tolerancia devuelva las piezas que corresponden. Eso lo cubren
 * `ui_medidas.mjs`, `ui_grupos.mjs` y `ui_precios.mjs`, que son 380 checks y
 * veinte minutos.
 *
 * DÓNDE ESTÁ EL LÍMITE, dicho claro: si este test pasa, NO está verificado que
 * el cambio esté bien. Está verificado que la app no se cayó. Un cambio que
 * toca cómo se calcula algo se prueba con la suite que corresponde antes de
 * pushearlo, no con esto.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
    '\nFalta APP_PASSWORD: es la contraseña con la que el test entra a la app.\n'
    + 'Preparate el entorno con  export APP_PASSWORD="…" && tests/preparar.sh\n',
  )
  process.exit(1)
}
const CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium'

const fallos = []
function check(nombre, ok, detalle = '') {
  if (ok) console.log(`  OK   ${nombre}`)
  else { console.log(`  FALLA ${nombre} — ${detalle}`); fallos.push(nombre) }
}

const browser = await chromium.launch({ executablePath: CHROMIUM })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
// Un error de JavaScript en la página es una falla aunque todo lo demás pase:
// la pantalla puede verse bien y tener media mitad muerta.
page.on('pageerror', (e) => { console.log('  !! error de JS:', e.message); fallos.push('JS: ' + e.message) })
const esperar = (ms) => page.waitForTimeout(ms)

console.log('\n=== Entrar ===')
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.fill('input[autocomplete="username"]', USUARIO)
await page.fill('input[type="password"]', CLAVE)
await page.click('button[type="submit"]')
await page.waitForURL(/motores/, { timeout: 15000 })
check('el login entra', page.url().includes('motores'))

// ─────────────────────────────────────────────────────────────────────────────
// Cada pantalla abre y trae datos
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== Cada pantalla abre y trae datos ===')
for (const [ruta, nombre] of [
  ['/motores', 'Motores'],
  ['/clientes', 'Clientes'],
  ['/presupuestos', 'Presupuestos'],
  ['/precios', 'Precios'],
  ['/repuestos', 'Repuestos'],
  ['/busqueda-medidas', 'Búsqueda por medidas'],
  ['/excel', 'Actualizar Excel'],
]) {
  await page.goto(BASE + ruta, { waitUntil: 'networkidle' })
  await esperar(700)
  // "Abre" quiere decir que el menú sigue estando y que la pantalla pintó algo
  // suyo: una tabla, una lista o al menos un encabezado. Una pantalla que
  // explota deja el Shell vacío, y eso es lo que se busca.
  const vivo = await page.locator('nav, aside').count() > 0
  const contenido = await page.locator('table, h1, h2').count() > 0
  check(`${nombre} abre`, vivo && contenido, page.url())
}

// ─────────────────────────────────────────────────────────────────────────────
// La tabla de búsqueda por medidas, familia por familia
// ─────────────────────────────────────────────────────────────────────────────
// Es la pantalla con más columnas del sistema y la que más se toca: agregar una
// columna empuja a las de al lado y las deja cortadas sin que nadie lo note.
// El check es el mismo de ui_medidas.mjs y es el que encontró que "FEDERAL
// MOGUL" no entraba en la columna Marca.
console.log('\n=== Ninguna celda de la tabla queda cortada ===')
await page.goto(BASE + '/busqueda-medidas', { waitUntil: 'networkidle' })
await esperar(900)

const filas = () => page.locator('table tbody tr')
const cortadas = () => page.evaluate(() => {
  const encabezados = [...document.querySelectorAll('table thead th')].map((th) => th.innerText.trim())
  const fuera = []
  const revisar = (el, ci) => {
    if (el.scrollWidth > el.clientWidth + 1) {
      fuera.push(`${encabezados[ci] || ci}: «${el.innerText.replace(/\n/g, ' ⏎ ').slice(0, 40)}»`)
    }
  }
  document.querySelectorAll('table thead th').forEach(revisar)
  document.querySelectorAll('table tbody tr').forEach((tr) => [...tr.children].forEach(revisar))
  return [...new Set(fuera)]
})

for (const [pestana, ejemplo] of [
  ['Camisas', 'Ø interior 98,42 mm'],
  ['Válvulas', null],
  ['Guías de válvulas', null],
  ['Asientos de válvulas', null],
  ['Subconjuntos', null],
  ['Conjuntos', null],
  ['Pistones', null],
  ['Cojinetes de biela', 'Ø muñón 50 mm'],
  ['Cojinetes de bancada', 'Ø muñón 54 mm'],
  ['Cojinetes axiales', 'Espesor 2,5 mm'],
  ['Bujes de biela', null],
]) {
  await page.locator('button', { hasText: new RegExp(`^${pestana}\\s*\\d`) }).click()
  await esperar(400)
  const limpiar = page.locator('button', { hasText: 'Limpiar filtros' })
  if (await limpiar.count()) { await limpiar.click(); await esperar(300) }
  const chip = ejemplo
    ? page.locator('button', { hasText: ejemplo })
    : page.locator('button').filter({ hasText: /^(Ø|Motor|Alto|Muñón|Código)/ }).first()
  await chip.click()
  await esperar(1100)
  const fuera = await cortadas()
  check(`${pestana}: trae filas y ninguna celda cortada`,
    (await filas().count()) > 0 && fuera.length === 0, fuera)
}

await browser.close()

console.log('\n' + '='.repeat(50))
if (fallos.length) {
  console.log(`FALLARON ${fallos.length}: ${JSON.stringify(fallos)}`)
  process.exit(1)
}
console.log('TODO OK')
