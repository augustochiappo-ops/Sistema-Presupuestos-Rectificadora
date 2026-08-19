/*
 * Precio unitario y subtotal, editables los dos.
 *
 * Regla del dueño (2026-08-18): "el que se edita manda". Si escribo el unitario,
 * el subtotal se recalcula (unitario × cantidad); si escribo el subtotal, el que
 * se recalcula es el unitario (subtotal ÷ cantidad). No hay un campo maestro
 * fijo: manda el último que se tocó.
 *
 * Cambiar la CANTIDAD siempre deja fijo el unitario y recalcula el subtotal, que
 * es lo que uno espera al poner "×4": el precio de la pieza no cambia porque
 * lleve cuatro.
 *
 * Las dos funciones devuelven { valor, texto } listo para guardar en el estado
 * de la pantalla: `texto` es lo que se ve en el recuadro (se guarda tal cual se
 * tipea, para no pelearle al cursor mientras se escribe) y `valor` el número
 * parseado, o null si lo tipeado no se entiende — ahí la pantalla pinta el
 * recuadro en rojo y no deja avanzar.
 */

import { formatPrecioARS, parsePrecioARS, aPesos } from './format'

/** Lo tipeado en el recuadro del unitario. */
export function desdeUnitario(texto) {
  return { valor: parsePrecioARS(texto), texto }
}

/**
 * Lo tipeado en el recuadro del subtotal, convertido a unitario.
 * Con cantidad 0 no se puede repartir (division por cero): se devuelve el
 * subtotal como valor inválido para que la pantalla lo marque en vez de
 * inventar un número.
 *
 * Desde que la plata va en pesos enteros, un subtotal que no es múltiplo exacto
 * de la cantidad sube al múltiplo siguiente: 5.001 entre 4 da un unitario de
 * 1.251 y el subtotal queda en 5.004. Es la regla del dueño (redondeo hacia
 * arriba) aplicada al reparto; la pantalla lo aclara debajo de la tabla.
 */
export function unitarioDesdeSubtotal(textoSubtotal, cantidad) {
  const subtotal = parsePrecioARS(textoSubtotal)
  const cant = Number(cantidad)
  if (subtotal === null || !(cant > 0)) return { valor: null, texto: textoSubtotal }
  const unitario = aPesos(subtotal / cant)
  return { valor: unitario, texto: formatPrecioARS(unitario) }
}

/**
 * Subtotal de una línea. Es la fuente única de la cuenta: la usan el paso
 * Servicios, el pop-up de repuestos, la revisión y la edición del detalle.
 */
export function subtotalDeLinea(precioUnitario, cantidad) {
  if (precioUnitario === null || precioUnitario === undefined) return null
  const cant = Number(cantidad)
  if (Number.isNaN(cant)) return null
  return aPesos(precioUnitario * cant)
}

/** Texto que muestra el recuadro del subtotal mientras no se esté editando. */
export function textoSubtotal(precioUnitario, cantidad) {
  const subtotal = subtotalDeLinea(precioUnitario, cantidad)
  return subtotal === null ? '' : formatPrecioARS(subtotal)
}
