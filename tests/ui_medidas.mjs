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
check('las cinco familias con su total',
  (await page.locator('button', { hasText: /^Camisas\s*396$/ }).count()) === 1
  && (await page.locator('button', { hasText: /^Guías de válvulas\s*915$/ }).count()) === 1
  && (await page.locator('button', { hasText: /^Subconjuntos\s*201$/ }).count()) === 1
  && (await page.locator('button', { hasText: /^Pistones\s*35$/ }).count()) === 1
  && (await page.locator('button', { hasText: /^Bujes de biela\s*190$/ }).count()) === 1)
check('en camisas el filtro se llama Ø exterior',
  await page.locator('label', { hasText: 'Ø EXTERIOR' }).count() === 1
  && await page.locator('label', { hasText: 'sobremedida' }).count() === 0)
check('sin filtros no se lista nada', await filas().count() === 0)
check('y se ofrecen ejemplos', await page.locator('button', { hasText: 'Ø interior 98,42 mm' }).count() === 1)
await page.screenshot({ path: path.join(SHOT, 'medidas-inicial.png'), fullPage: true })

console.log('\n=== Camisas: buscar por medida ===')
await page.locator('button', { hasText: 'Ø interior 98,42 mm' }).click()
await esperar(1200)
const encontradas = await filas().count()
check('el ejemplo trae resultados', encontradas > 0, encontradas)
check('se dice cuántas son', /pieza(s)? encontrada/.test(await page.locator('text=/pieza(s)? encontrada/').first().textContent()))
check('queda el tag del filtro activo', await page.locator('text=/Ø interior: 98.42 ± 0,5 mm/').count() === 1)
check('todas las filas caen en el rango pedido',
  (await filas().evaluateAll((trs) => trs.every((tr) => {
    // La columna 4 es el Ø interior (0 código, 1 marca, 2 aplicación, 3 tipo).
    const v = parseFloat(tr.children[4].textContent.replace('.', '').replace(',', '.'))
    return !Number.isNaN(v) && v >= 97.92 && v <= 98.92
  }))), 'alguna fila quedó fuera de 102 ± 0,5')
check('y la columna también', await page.locator('th', { hasText: 'Sobremedidas y Ø ext.' }).count() === 1)
await page.screenshot({ path: path.join(SHOT, 'medidas-camisas.png'), fullPage: true })

console.log('\n=== Camisas: la sobremedida se lee sin apoyar el mouse ===')
await page.locator('button', { hasText: 'Limpiar filtros' }).click()
await esperar(400)
await page.fill('input[placeholder="Código…"]', 'A 0069')
await esperar(1200)
const enPulgadas = await textoDeFila(0)
check('la etiqueta de cada sobremedida está escrita en la celda',
  ['-.060"', '-.030"', 'STD', '+.030"', '+.060"'].every((e) => enPulgadas.includes(e)), enPulgadas)
check('con su Ø exterior al lado', enPulgadas.includes('65,24') && enPulgadas.includes('68,28'), enPulgadas)
check('y el alto de pestaña es el del Excel, no el 4,00 de la página',
  enPulgadas.includes('4,76'), enPulgadas)

await page.fill('input[placeholder="Código…"]', 'UC 1902')
await esperar(1200)
const enMm = await textoDeFila(0)
check('una sobremedida en milímetros se muestra en milímetros',
  enMm.includes('+0,50 mm') && enMm.includes('+0,20 mm'), enMm)
check('y no disfrazada de pulgadas', !enMm.includes('+.020"'), enMm)

// La A 4601 no está en la lista del proveedor: para verla hay que destildar el
// filtro (que abajo tiene su propia sección).
await page.fill('input[placeholder="Código…"]', 'A 4601')
await page.locator('text=Solo las que tiene el proveedor').click()
await esperar(1200)
const dudosa = await textoDeFila(0)
check('un alto de pestaña dudoso se muestra con el signo de pregunta',
  dudosa.includes('4,00') && dudosa.includes('?'), dudosa)
const nota = await page.locator('td span[title]', { hasText: '4,00' }).first().getAttribute('title')
check('y al apoyar el mouse se explica por qué', (nota || '').includes('4,76'), nota)
await page.screenshot({ path: path.join(SHOT, 'medidas-camisas-sobremedidas.png'), fullPage: true })

console.log('\n=== Camisas: el filtro de lo que tiene el proveedor ===')
await page.locator('button', { hasText: 'Limpiar filtros' }).click()
await esperar(400)
check('viene tildado',
  await page.locator('label', { hasText: 'Solo las que tiene el proveedor' }).locator('input').isChecked())
await page.fill('input[placeholder="Motor / aplicación…"]', 'diesel')
await esperar(1200)
const conFiltro = await filas().count()
check('avisa cuántas quedaron afuera',
  await page.locator('text=/hay \\d+ más en el catálogo/').count() === 1)
await page.locator('text=/hay \\d+ más en el catálogo/').click()
await esperar(1200)
check('y al tocar el aviso aparecen', await filas().count() > conFiltro, [conFiltro, await filas().count()])
check('entre ellas hay camisas húmedas',
  (await filas().allTextContents()).some((t) => t.includes('Húmeda')))
await page.locator('button', { hasText: 'Limpiar filtros' }).click()
await esperar(400)
await page.locator('button', { hasText: 'Ø interior 98,42 mm' }).click()
await esperar(1200)

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

console.log('\n=== Subconjuntos: el dibujo del pistón ===')
// El dibujo del catálogo al lado del código: la forma de la cabeza y de la
// falda se reconocen de un vistazo, las medidas no.
check('la columna Dibujo está', await page.locator('th', { hasText: 'Dibujo' }).count() === 1)
await page.fill('input[placeholder="Código…"]', 'S BE25400')
await esperar(1200)
const mini = filas().nth(0).locator('img')
check('la fila trae su miniatura', await mini.count() === 1)
check('y el dibujo carga de verdad',
  await mini.evaluate((img) => img.complete && img.naturalWidth > 0),
  await mini.getAttribute('src'))
// Un subconjunto todavía sin foto no puede quedar con un cuadrito roto.
await page.fill('input[placeholder="Código…"]', 'S BE25127')
await esperar(1200)
check('el que no tiene dibujo va con un guión, sin imagen rota',
  await filas().nth(0).locator('img').count() === 0
  && (await textoDeFila(0)).includes('—'),
  await textoDeFila(0))

// Lo que pidió el dueño: que se vean TODOS del mismo tamaño. Los archivos
// tienen distinta cantidad de pixeles, así que lo que se mide es la caja en
// pantalla, no el PNG.
await page.fill('input[placeholder="Código…"]', '')
await page.fill('input[placeholder="Descripción…"]', 'fiat')
await esperar(1300)
const cajas = await page.locator('table tbody tr img').evaluateAll(
  (imgs) => imgs.map((i) => `${Math.round(i.getBoundingClientRect().width)}x${Math.round(i.getBoundingClientRect().height)}`),
)
check('todos los dibujos se ven del mismo tamaño',
  cajas.length >= 5 && new Set(cajas).size === 1, cajas.join(' '))
await page.screenshot({ path: path.join(SHOT, 'medidas-dibujos-piston.png'), fullPage: true })

console.log('\n=== El dibujo en grande ===')
await page.locator('table tbody tr img').first().click()
await esperar(600)
const grande = page.locator('[data-dibujo-piston] img')
check('se abre el dibujo en grande', await grande.count() === 1)
check('y es el del código de esa fila',
  await grande.getAttribute('src') === await page.locator('table tbody tr img').first().getAttribute('src'),
  await grande.getAttribute('src'))
check('en grande de verdad, no la miniatura estirada',
  await grande.evaluate((img) => img.getBoundingClientRect().height > 200),
  await grande.evaluate((img) => img.getBoundingClientRect().height))
await page.screenshot({ path: path.join(SHOT, 'medidas-dibujo-grande.png'), fullPage: true })
await page.mouse.click(20, 500)
await esperar(400)
check('y se cierra tocando afuera', await page.locator('[data-dibujo-piston]').count() === 0)
await page.fill('input[placeholder="Descripción…"]', '')
await esperar(600)

console.log('\n=== Pistones: el catálogo Persan, con lo que no se pudo leer marcado ===')
await page.fill('input[placeholder="Código…"]', '')
await page.locator('button', { hasText: 'Pistones' }).click()
await esperar(500)
await page.fill('input[placeholder="Código…"]', 'PS082PH')
await esperar(1200)
const pis = await textoDeFila(0)
check('se encuentra el pistón por su código', pis.includes('P PS082PH'), pis)
check('con las medidas del catálogo', pis.includes('62') && pis.includes('61,75'), pis)
check('y con precio de la base', /\$\s?[\d.]+/.test(pis), pis)
await page.screenshot({ path: path.join(SHOT, 'medidas-pistones.png'), fullPage: true })

await page.fill('input[placeholder="Código…"]', 'PS171PH')
await esperar(1200)
const dudoso = await filas().nth(0)
check('el pistón con datos dudosos aparece igual',
  (await dudoso.textContent()).includes('P PS171PH'), await dudoso.textContent())
check('y las medidas que no se pudieron leer van con "?"',
  (await dudoso.locator('td', { hasText: /^\?$/ }).count()) >= 3,
  await dudoso.textContent())

console.log('\n=== Guías: la forma, con su dibujo ===')
// El código de forma del catálogo (F, A-1, P-3-6…) estaba en los datos pero no
// se mostraba, y es lo primero que se mira para saber si una guía reemplaza a
// otra. Va con el dibujo recortado de la lámina del catálogo: la letra sola no
// se la acuerda nadie.
await page.fill('input[placeholder="Código…"]', '')
await page.locator('button', { hasText: 'Guías de válvulas' }).click()
await esperar(500)
await page.fill('input[placeholder="Código…"]', '3084')
await esperar(1200)
check('la columna Forma está', await page.locator('th', { hasText: 'Forma' }).count() === 1)
const guiaForma = await textoDeFila(0)
check('y trae la forma de la guía', /8,02.*13,08.*40,5.*F.*Fundición Gris/.test(guiaForma), guiaForma)
const dibujo = filas().nth(0).locator('img')
check('con el dibujo al lado del código', await dibujo.count() === 1)
check('y el dibujo carga de verdad',
  await dibujo.evaluate((img) => img.complete && img.naturalWidth > 0),
  await dibujo.getAttribute('src'))

console.log('\n=== Filtrar por la forma del cuerpo ===')
await page.fill('input[placeholder="Código…"]', '')
await esperar(400)
const chips = page.locator('button[aria-pressed]')
check('están las nueve formas del catálogo', await chips.count() === 9, await chips.count())
check('todos los dibujos del filtro cargan',
  await page.locator('button[aria-pressed] img').evaluateAll(
    (imgs) => imgs.every((i) => i.complete && i.naturalWidth > 0),
  ),
  'alguna forma no tiene su PNG')
// La "N" no está en la lámina de RYC: su dibujo se recortó de la referencia de
// Nubo, así que ahora las nueve del filtro tienen el suyo y ninguna queda con
// la letra sola.
check('la N ya tiene su dibujo', await page.locator('button[aria-pressed] img').count() === 9)

await chips.first().click()
await esperar(1300)
const formas = await filas().evaluateAll((trs) => trs.map((tr) => tr.children[7].textContent.trim()))
check('filtra por la letra del cuerpo', formas.length > 0 && formas.every((f) => f.startsWith('A')), formas.slice(0, 5))
check('con su tag', await page.locator('text=/Forma del cuerpo: Cuerpo A/').count() === 1)
await page.screenshot({ path: path.join(SHOT, 'medidas-formas.png'), fullPage: true })

// Volver a tocar la misma forma la saca.
await chips.first().click()
await esperar(1300)
check('tocarla de nuevo saca el filtro', await page.locator('text=/Forma del cuerpo:/').count() === 0)

console.log('\n=== La lámina de formas ===')
await page.locator('button', { hasText: 'Ver la lámina' }).click()
await esperar(600)
check('se abre la lámina', await page.locator('text=/Formas de guía del catálogo/').count() === 1)
const lamina = page.locator('[data-lamina="formas"]')
check('con las diez formas y las cuatro figuras de detalles',
  await lamina.locator('img[alt^="Forma "]').count() === 10
  && await lamina.locator('img[alt^="Detalles"]').count() === 4,
  `${await lamina.locator('img').count()} dibujos en total`)
check('y explica cómo se lee el código',
  await page.locator('text=/es el cuerpo A con los detalles 1 y 6/').count() === 1)
check('con el nombre de cada detalle',
  await lamina.locator('li').count() === 8
  && await lamina.locator('text=/Agujero para lubricación/').count() === 1,
  await lamina.locator('li').count())
await page.screenshot({ path: path.join(SHOT, 'medidas-lamina.png'), fullPage: true })
// Se cierra tocando fuera de la tarjeta, que es lo que hace cualquiera.
await page.mouse.click(20, 500)
await esperar(400)
check('y se cierra tocando afuera', await page.locator('text=/Formas de guía del catálogo/').count() === 0)

console.log('\n=== Bujes de biela (Indubrón) ===')
await page.fill('input[placeholder="Código…"]', '')
await page.locator('button', { hasText: 'Bujes de biela' }).click()
await esperar(500)
await page.fill('input[placeholder="Código…"]', 'I-115')
await esperar(1200)
check('el mismo código aparece bajo sus dos marcas', await filas().count() === 2, await filas().count())
const buje = await textoDeFila(0)
check('con las medidas del catálogo', buje.includes('I-115') && buje.includes('CHEVROLET') && buje.includes('24,5'), buje)
check('el Ø exterior STD conserva su banda', buje.includes('28,15/18'), buje)
check('y las siete sobremedidas', buje.includes('28,26') && buje.includes('29,14'), buje)
check('con precio de la base', /\$\s?[\d.]+/.test(buje), buje)
await page.screenshot({ path: path.join(SHOT, 'medidas-bujes.png'), fullPage: true })

console.log('\n=== Tolerancia con signo: ese valor o más / o menos ===')
// Vaciar el código ya deja la pantalla sin filtros; el botón "Limpiar filtros"
// desaparece cuando no queda ninguno, así que acá no hay nada que apretar.
await page.fill('input[placeholder="Código…"]', '')
await esperar(400)
const perno = page.locator('label', { hasText: 'Ø PERNO' })
const signo = perno.locator('button')
const pernos = () => filas().evaluateAll((trs) => trs.map(
  (tr) => parseFloat(tr.children[3].textContent.replace('.', '').replace(',', '.')),
))
await perno.locator('input').nth(0).fill('45')
await esperar(1200)
const conTolerancia = await pernos()
check('el botón arranca en ±', (await signo.textContent()).trim() === '±')
check('con ±0,5 solo salen los de 45', conTolerancia.every((v) => v >= 44.5 && v <= 45.5), conTolerancia)

await signo.click()
await esperar(1200)
const conMas = await pernos()
check('un clic lo pasa a +', (await signo.textContent()).trim() === '+')
check('y trae también los más gruesos',
  conMas.length > conTolerancia.length && conMas.every((v) => v >= 45), conMas)
check('el tag lo dice con palabras', await page.locator('text=/Ø perno: 45 mm o más/').count() === 1)

await signo.click()
await esperar(1200)
const conMenos = await pernos()
check('otro clic lo pasa a −', (await signo.textContent()).trim() === '−')
check('y trae los más finos', conMenos.every((v) => v <= 45) && conMenos.length > conTolerancia.length, conMenos.slice(0, 5))
check('con su tag', await page.locator('text=/Ø perno: 45 mm o menos/').count() === 1)

// Escribir el signo en el casillero es lo que hace todo el mundo: tiene que
// terminar en el mismo estado que apretar el botón.
await signo.click()
await perno.locator('input').nth(1).fill('+2')
await esperar(1200)
check('escribir "+2" mueve el signo al botón',
  (await signo.textContent()).trim() === '+' && await perno.locator('input').nth(1).inputValue() === '2')
check('y el rango queda acotado de un lado',
  (await pernos()).every((v) => v >= 45 && v <= 47), await pernos())
check('con el tag del rango', await page.locator('text=/Ø perno: 45 a 47 mm/').count() === 1)
await page.screenshot({ path: path.join(SHOT, 'medidas-signo.png'), fullPage: true })

console.log('\n=== Una pieza sin equivalencia no inventa precio ===')
await page.fill('input[placeholder="Código…"]', '')
await page.locator('button', { hasText: 'Camisas' }).click()
await esperar(500)
await page.locator('button', { hasText: 'Limpiar filtros' }).click()
await esperar(400)
await page.fill('input[placeholder="Código…"]', 'UC 1694')
await esperar(1200)
check('con el filtro del proveedor tildado no aparece', await filas().count() === 0, await filas().count())
await page.locator('text=Solo las que tiene el proveedor').click()
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
