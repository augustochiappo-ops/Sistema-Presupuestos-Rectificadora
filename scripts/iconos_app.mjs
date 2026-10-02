/*
 * Los íconos de la app para el celular (2026-10-02): el que queda en la
 * pantalla de inicio cuando se "agrega a la pantalla principal", el de la
 * pestaña del navegador y el de la pantalla de arranque.
 *
 * Es la misma marca que el menú lateral: un cuadrado negro (--brand-ink) con
 * la llave inglesa blanca de Lucide, el mismo dibujo que usa <Icon n="wrench">.
 *
 * Se corre a mano, una sola vez (o si cambia la marca), y lo que produce se
 * versiona en webapp/frontend/public/icons/. No lo corre el build ni el deploy.
 *
 *   node scripts/iconos_app.mjs
 *
 * Usa el Chromium del entorno para pasar el SVG a PNG: es el único dibujador de
 * SVG que ya está instalado, y así el PNG sale igual al ícono de la pantalla.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const PUBLICO = path.join(RAIZ, 'webapp', 'frontend', 'public')
const DESTINO = path.join(PUBLICO, 'icons')
const { chromium } = await import(
  path.join(RAIZ, 'webapp', 'frontend', 'node_modules', 'playwright-core', 'index.mjs')
)

const TINTA = '#141619'
// lucide-react 1.27, icons/wrench.mjs: el mismo trazo que el ícono de la app.
const LLAVE = 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z'

/**
 * El ícono en un lienzo de 512: `redondeo` es el radio de las esquinas (0 =
 * cuadrado lleno) y `llave` cuánto ocupa la llave, en fracción del lado.
 */
function svg({ redondeo, llave }) {
  const escala = (512 * llave) / 24
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="${redondeo}" fill="${TINTA}"/>
  <g transform="translate(256 256) scale(${escala}) translate(-12 -12)">
    <path d="${LLAVE}" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`
}

// "any": esquinas redondeadas como la marca del menú, la llave bien grande.
// "maskable": cuadrado lleno y la llave más chica, adentro del círculo que
//   Android recorta (el 80 % del centro), para que no le coma las puntas.
// apple-touch-icon: cuadrado lleno; el iPhone le redondea las esquinas solo.
const ICONOS = [
  { archivo: 'icon-192.png', lado: 192, redondeo: 112, llave: 0.6 },
  { archivo: 'icon-512.png', lado: 512, redondeo: 112, llave: 0.6 },
  { archivo: 'icon-maskable-512.png', lado: 512, redondeo: 0, llave: 0.44 },
  { archivo: 'apple-touch-icon.png', lado: 180, redondeo: 0, llave: 0.54 },
]

fs.mkdirSync(DESTINO, { recursive: true })
const navegador = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' })
for (const { archivo, lado, redondeo, llave } of ICONOS) {
  const pagina = await navegador.newPage({ viewport: { width: lado, height: lado } })
  await pagina.setContent(
    `<html><body style="margin:0;background:transparent">
      <div style="width:${lado}px;height:${lado}px">${svg({ redondeo, llave }).replace('width="512" height="512"', `width="${lado}" height="${lado}"`)}</div>
    </body></html>`,
  )
  await pagina.screenshot({ path: path.join(DESTINO, archivo), omitBackground: true })
  await pagina.close()
  console.log(`  ${archivo} (${lado}×${lado})`)
}
await navegador.close()

// El de la pestaña del navegador va en SVG: se ve nítido en cualquier tamaño.
fs.writeFileSync(path.join(PUBLICO, 'favicon.svg'), svg({ redondeo: 112, llave: 0.6 }) + '\n')
console.log('  favicon.svg')
