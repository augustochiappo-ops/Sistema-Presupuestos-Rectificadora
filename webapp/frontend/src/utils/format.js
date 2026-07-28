const ARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatPrecioARS(valor) {
  if (valor === null || valor === undefined || valor === '') return '—'
  const n = Number(valor)
  if (Number.isNaN(n)) return '—'
  return ARS.format(n).replace('ARS', '$').replace(/\s+/, ' ')
}

export function parsePrecioARS(texto) {
  if (typeof texto === 'number') return texto
  if (!texto) return null
  const limpio = String(texto).replace(/\$/g, '').trim().replace(/\./g, '').replace(',', '.')
  const n = parseFloat(limpio)
  return Number.isNaN(n) ? null : n
}

export function formatFechaAR(fechaIso) {
  if (!fechaIso) return '—'
  const [y, m, d] = fechaIso.split('-')
  if (!y || !m || !d) return fechaIso
  return `${d}/${m}/${y}`
}

// Un presupuesto es "vigente" 7 días desde su fecha de emisión (misma regla que el PDF).
export function estadoPresupuesto(fechaIso) {
  if (!fechaIso) return 'pending'
  const emitido = new Date(fechaIso + 'T00:00:00')
  const hoy = new Date()
  const dias = (hoy - emitido) / (1000 * 60 * 60 * 24)
  return dias <= 7 ? 'active' : 'expired'
}
