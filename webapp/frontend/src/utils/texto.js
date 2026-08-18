/*
 * Normalización de texto para TODOS los buscadores del sistema.
 *
 * Dos reglas, pedidas por el dueño (2026-08-18):
 *
 * 1. Ni los acentos ni las mayúsculas cuentan: "valvulas" tiene que encontrar
 *    "VÁLVULAS". Antes había que escribir el acento y la mayúscula exactos.
 * 2. El orden de las palabras tampoco: "fiat 2.8" tiene que encontrar
 *    "FIAT DUCATO 2.8TD". Cada palabra de la búsqueda se busca por separado y
 *    tiene que aparecer en algún lado del texto (fragmento, no palabra entera:
 *    "2.8" encuentra "2.8TD"); no importa en qué posición ni en qué orden.
 *
 * Los puntos se conservan porque separan decimales de cilindrada ("2.8"), que
 * es justo lo que el taller escribe para buscar un motor; la coma se pasa a
 * punto para que "2,8" busque lo mismo. Todo lo demás (guiones, barras,
 * paréntesis) se convierte en separador de palabras.
 *
 * El backend tiene la misma normalización en app/texto.py — las dos tienen que
 * dar el mismo resultado, porque parte de las búsquedas se resuelven en SQL.
 */

const DIACRITICOS = /[\u0300-\u036f]/g

export function normalizarTexto(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD').replace(DIACRITICOS, '')
    .replace(/,/g, '.')
    .replace(/[^a-z0-9.]+/g, ' ')
    .trim()
}

/** Las palabras de una búsqueda, ya normalizadas. Vacío = no filtra nada. */
export function palabrasBusqueda(busqueda) {
  return normalizarTexto(busqueda).split(' ').filter(Boolean)
}

/**
 * ¿El texto (o alguno de los textos) contiene TODAS las palabras de la
 * búsqueda? Se pueden pasar varios campos: "fiat" puede venir del motor y "2.8"
 * de la cilindrada, y la fila igual coincide.
 */
export function coincideBusqueda(campos, busqueda) {
  const palabras = palabrasBusqueda(busqueda)
  if (!palabras.length) return true
  const texto = (Array.isArray(campos) ? campos : [campos])
    .map(normalizarTexto)
    .filter(Boolean)
    .join(' ')
  return palabras.every((p) => texto.includes(p))
}
