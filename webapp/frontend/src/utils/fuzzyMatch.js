// Búsqueda de clientes tolerante a nombres incompletos y errores de tipeo:
// "Dani Pascolo", "Dani Pasc" o "Daniel Pascoal" tienen que encontrar a
// "Daniel Pascolo". Se compara token por token (palabra por palabra): cada
// palabra de la búsqueda tiene que ser prefijo de alguna palabra del nombre,
// o estar a poca distancia de edición (para tolerar errores de tipeo).

const DIACRITICOS = /[\u0300-\u036f]/g

function normalizar(texto) {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD').replace(DIACRITICOS, '') // saca acentos
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function distanciaEdicion(a, b) {
  const filas = a.length + 1
  const cols = b.length + 1
  const d = Array.from({ length: filas }, (_, i) => [i, ...Array(cols - 1).fill(0)])
  for (let j = 0; j < cols; j++) d[0][j] = j
  for (let i = 1; i < filas; i++) {
    for (let j = 1; j < cols; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + costo)
    }
  }
  return d[filas - 1][cols - 1]
}

// Devuelve qué tan "lejos" está tokenBusqueda de tokenNombre (0 = prefijo
// exacto), o null si no se considera una coincidencia.
function distanciaToken(tokenBusqueda, tokenNombre) {
  if (tokenNombre.startsWith(tokenBusqueda)) return 0
  const distancia = distanciaEdicion(tokenBusqueda, tokenNombre)
  const umbral = Math.max(1, Math.floor(Math.max(tokenBusqueda.length, tokenNombre.length) / 3))
  return distancia <= umbral ? distancia : null
}

/**
 * Puntaje de coincidencia entre un nombre de cliente y una búsqueda (menor es
 * mejor). null si no coincide. Búsqueda vacía coincide con todo (puntaje 0).
 */
export function puntajeCoincidenciaCliente(nombreCliente, busqueda) {
  const tokensBusqueda = normalizar(busqueda).split(' ').filter(Boolean)
  if (tokensBusqueda.length === 0) return 0

  const tokensNombre = normalizar(nombreCliente).split(' ').filter(Boolean)
  let total = 0
  for (const tb of tokensBusqueda) {
    let mejor = null
    for (const tn of tokensNombre) {
      const d = distanciaToken(tb, tn)
      if (d !== null && (mejor === null || d < mejor)) mejor = d
    }
    if (mejor === null) return null
    total += mejor
  }
  return total
}

export function coincideCliente(nombreCliente, busqueda) {
  return puntajeCoincidenciaCliente(nombreCliente, busqueda) !== null
}

/** Filtra y ordena una lista de clientes ({nombre, ...}) por mejor coincidencia. */
export function filtrarClientesPorBusqueda(clientes, busqueda) {
  const q = (busqueda || '').trim()
  if (!q) return clientes
  return clientes
    .map((c) => ({ c, score: puntajeCoincidenciaCliente(c.nombre, q) }))
    .filter((x) => x.score !== null)
    .sort((a, b) => a.score - b.score)
    .map((x) => x.c)
}
