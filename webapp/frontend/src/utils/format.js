/*
 * Plata en pesos ENTEROS (2026-08-19, pedido del dueño).
 *
 * El sistema no maneja centavos: el taller cobra en pesos redondos y los
 * decimales que arrastra el catálogo del proveedor (,51 / ,83) solo ensuciaban
 * pantalla y PDF. La regla es **redondeo siempre hacia arriba**: si hay que
 * elegir, el taller no cobra de menos.
 *
 * El redondeo vive acá, en el formateo y el parseo, y no en la importación del
 * catálogo: los datos crudos del proveedor se guardan como vienen. Así los
 * presupuestos ya emitidos —guardados con centavos— se ven redondeados sin
 * tocar nada de lo que quedó grabado.
 */
const ARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/** Pesos enteros hacia arriba. Es la única función que redondea plata. */
export function aPesos(valor) {
  const n = Number(valor)
  return Number.isNaN(n) ? null : Math.ceil(n)
}

export function formatPrecioARS(valor) {
  if (valor === null || valor === undefined || valor === '') return '—'
  const n = aPesos(valor)
  if (n === null) return '—'
  return ARS.format(n).replace('ARS', '$').replace(/\s+/, ' ')
}

export function parsePrecioARS(texto) {
  if (typeof texto === 'number') return aPesos(texto)
  if (!texto) return null
  const limpio = String(texto).replace(/\$/g, '').trim().replace(/\./g, '').replace(',', '.')
  const n = parseFloat(limpio)
  return Number.isNaN(n) ? null : Math.ceil(n)
}

// Title Case por palabra para nombres de cliente: "juan garcia" o
// "JUAN GARCIA" -> "Juan Garcia". Es solo feedback visual antes de confirmar
// — el backend normaliza igual al guardar, que es la fuente de verdad.
export function formatearNombreTitulo(texto) {
  return texto.replace(/\S+/g, (palabra) => palabra[0].toUpperCase() + palabra.slice(1).toLowerCase())
}

export function formatFechaAR(fechaIso) {
  if (!fechaIso) return '—'
  const [y, m, d] = fechaIso.split('-')
  if (!y || !m || !d) return fechaIso
  return `${d}/${m}/${y}`
}

// Fecha con hora, como la guarda app_meta para la importación del catálogo.
export function formatFechaHoraAR(iso) {
  if (!iso) return '—'
  const [fecha, hora] = iso.split('T')
  return `${formatFechaAR(fecha)}${hora ? ` a las ${hora.slice(0, 5)}` : ''}`
}

// Un presupuesto es "vigente" 7 días desde su fecha de emisión (misma regla que el PDF).
export function estadoPresupuesto(fechaIso) {
  if (!fechaIso) return 'pending'
  const emitido = new Date(fechaIso + 'T00:00:00')
  const hoy = new Date()
  const dias = (hoy - emitido) / (1000 * 60 * 60 * 24)
  return dias <= 7 ? 'active' : 'expired'
}
