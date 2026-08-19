#!/usr/bin/env node
/*
 * Convierte los catálogos técnicos del repo del buscador web
 * (augustochiappo-ops/Chiappo-Repuestos-) a los JSON que lee este sistema.
 *
 *     node scripts/convertir_tecnicos.js /ruta/al/clon/de/Chiappo-Repuestos-
 *
 * Se corre A MANO, solo cuando allá se procesa un catálogo nuevo. La salida
 * (CRAC/tecnicos/*.json) se commitea: es lo que hace que producción tenga los
 * datos apenas hace `git pull`, sin ningún paso de importación.
 *
 * Lo que este script resuelve —y por eso existe— es el CÓDIGO DEL PROVEEDOR.
 * En la lista del proveedor los códigos vienen alineados con relleno
 * ("G IY1171   STD", "S BE01010  0.4") y en los catálogos técnicos van con un
 * solo espacio ("G IY1171 STD"). Sin resolverlo acá, Indy y Nubo no matchean
 * ni una fila. Se resuelve contra CRAC/precio-stock.csv, que es la lista del
 * proveedor de ESTE sistema, así el JSON sale con el código exacto y en
 * runtime la búsqueda de precio es una comparación directa.
 *
 * NO se copia ningún precio: el precio y el stock los pone la base local, que
 * se actualiza todos los días con el Excel del proveedor.
 */
const fs = require('fs')
const path = require('path')

const RAIZ = path.dirname(__dirname)
const SALIDA = path.join(RAIZ, 'CRAC', 'tecnicos')
const CSV_PROVEEDOR = path.join(RAIZ, 'CRAC', 'precio-stock.csv')

const origen = process.argv[2]
if (!origen) {
  console.error('Uso: node scripts/convertir_tecnicos.js /ruta/al/clon/de/Chiappo-Repuestos-')
  process.exit(1)
}
const datos = (...p) => path.join(origen, 'api', '_data', ...p)

// ── Índice de códigos del proveedor ──────────────────────────────────────────
// normalizado (un solo espacio) → código tal cual figura en la lista.
function normCod(s) {
  return (s || '').toString().replace(/\s+/g, ' ').trim().toUpperCase()
}

function indiceProveedor() {
  const idx = new Map()
  const lineas = fs.readFileSync(CSV_PROVEEDOR, 'utf8').split('\n')
  for (const linea of lineas) {
    const m = linea.match(/^"([^"]*)"/)
    if (!m) continue
    const codigo = m[1]
    const clave = normCod(codigo)
    // Dos códigos distintos que normalizan igual serían ambiguos: se avisa y
    // se queda el primero, que es el orden de la lista.
    if (idx.has(clave) && idx.get(clave) !== codigo) {
      console.warn(`  ⚠ colisión al normalizar: "${idx.get(clave)}" y "${codigo}"`)
      continue
    }
    idx.set(clave, codigo)
  }
  return idx
}

const PROVEEDOR = indiceProveedor()

/** Devuelve el código exacto del proveedor, o null si esa pieza no está en la lista. */
function resolver(codigo) {
  if (!codigo) return null
  return PROVEEDOR.get(normCod(codigo)) || null
}

const num = (v) => (v === null || v === undefined || v === '' || isNaN(parseFloat(v)) ? null : parseFloat(v))

// ── Camisas (Fadecya) ────────────────────────────────────────────────────────
function camisas() {
  const catalogo = require(datos('camisas', 'Fadecya_camisas'))
  const mapa = require(datos('camisas', 'Fadecya_crac_map'))

  return catalogo.map((r) => {
    const crac = resolver(mapa[r.codigo])
    return {
      codigo: r.codigo,
      codigo_fab: r.codigo,
      marca: r.marca || 'FADECYA',
      aplicacion: r.aplicacion || null,
      descripcion: r.desc_crac || null,
      medidas: {
        diam_int: num(r.diam_int),
        diam_ext_cil: num(r.diam_ext_cil),
        alt_pest: num(r.alt_pest),
        largo: num(r.largo),
      },
      extra: {
        sobremedidas: Array.isArray(r.sobremedidas) ? r.sobremedidas : [],
      },
      codigos_crac: crac ? [{ codigo: crac, medida: null }] : [],
    }
  })
}

// ── Guías de válvulas (RYC + Indy + Nubo) ────────────────────────────────────
function guias() {
  const ryc = require(datos('guias', 'Ryc_guias'))
  const indy = require(datos('guias', 'Indy_guias'))
  const nubo = require(datos('guias', 'Nubo_guias'))
  const mapaRyc = require(datos('guias', 'Ryc_crac_map'))

  const ficha = (r, codigoMostrado, cracCrudo) => {
    const crac = resolver(cracCrudo)
    return {
      // RYC trae códigos pelados ("3084"); lo que se muestra es el código del
      // proveedor, que es el que el taller pide. Indy y Nubo ya lo traen.
      codigo: codigoMostrado,
      codigo_fab: r.codigo,
      marca: r.marca || null,
      aplicacion: r.aplicacion || null,
      descripcion: r.desc_crac || null,
      tipo: r.tipo || null,
      medidas: {
        diam_vastago: num(r.diam_vastago),
        diam_ext: num(r.diam_ext),
        largo: num(r.largo),
      },
      extra: {
        forma: r.forma ?? null,
        material: r.material ?? null,
        sobremedida: r.sobremedida ?? null,
        nro_original: r.nro_original ?? null,
        cant_juego: r.cant_juego ?? null,
      },
      codigos_crac: crac ? [{ codigo: crac, medida: r.sobremedida || null }] : [],
    }
  }

  return [
    ...ryc.map((r) => {
      const entrada = mapaRyc[r.codigo]
      return ficha(r, entrada ? entrada.base : r.codigo, entrada ? entrada.key : null)
    }),
    ...indy.map((r) => ficha(r, r.codigo, r.codigo)),
    ...nubo.map((r) => ficha(r, r.codigo, r.codigo)),
  ]
}

// ── Subconjuntos (Mahle) ─────────────────────────────────────────────────────
// Un código Mahle no tiene UN código del proveedor sino uno por sobremedida
// ("S BE01010  STD", "S BE01010  0.4", …). Se guardan todos los que existan y
// el precio se resuelve en runtime eligiendo el mejor disponible.
function normSobremedida(s) {
  if (!s || s === 'STD') return 'STD'
  const v = parseFloat(s.toString().replace(',', '.'))
  return isNaN(v) ? s : v.toFixed(1)
}

function subconjuntos() {
  const catalogo = require(datos('subconjuntos', 'Mahle_subconjuntos'))

  return catalogo.map((r) => {
    const sobres = Array.isArray(r.sobremedidas) && r.sobremedidas.length ? r.sobremedidas : ['STD']
    const codigos = []
    for (const s of sobres) {
      const medida = normSobremedida(s)
      const crac = resolver(r.codigo.padEnd(11) + medida)
      if (crac) codigos.push({ codigo: crac, medida })
    }
    return {
      codigo: r.codigo,
      codigo_fab: r.codigo,
      marca: r.marca || 'MAHLE',
      aplicacion: r.aplicacion || null,
      descripcion: r.descripcion || null,
      medidas: {
        diam_piston: num(r.diam_piston),
        alt_piston: num(r.alt_piston),
        diam_perno: num(r.diam_perno),
      },
      extra: {
        fabricante: r.fabricante ?? null,
        motor: r.motor ?? null,
        nro_cil: r.nro_cil ?? null,
        diam_cilindro: r.diam_cilindro ?? null,
        alt_compresion: r.alt_compresion ?? null,
        prof_rebaje: r.prof_rebaje ?? null,
        diams_dispon: r.diams_dispon ?? null,
        largo_perno: r.largo_perno ?? null,
        perno_str: r.perno_str ?? null,
        juego_montaje: r.juego_montaje ?? null,
        codigo_aros: r.codigo_aros ?? null,
        medida_aros: r.medida_aros ?? null,
        tipo_camisa: r.tipo_camisa ?? null,
        dim_camisa: r.dim_camisa ?? null,
        codigo_camisa: r.codigo_camisa ?? null,
        sobremedidas: sobres,
      },
      codigos_crac: codigos,
    }
  })
}

// ── Escritura ────────────────────────────────────────────────────────────────
fs.mkdirSync(SALIDA, { recursive: true })

for (const [nombre, fichas] of [
  ['camisas', camisas()],
  ['guias', guias()],
  ['subconjuntos', subconjuntos()],
]) {
  const conCrac = fichas.filter((f) => f.codigos_crac.length).length
  fs.writeFileSync(path.join(SALIDA, `${nombre}.json`), JSON.stringify(fichas, null, 1) + '\n')
  console.log(`✓ ${nombre}: ${fichas.length} fichas · ${conCrac} con código del proveedor`)
}
