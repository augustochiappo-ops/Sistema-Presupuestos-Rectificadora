/*
 * WhatsApp, sin integraciones: un link a wa.me con el texto ya escrito.
 *
 * Abre la app de WhatsApp (en el celular) o WhatsApp Web (en la compu) en el
 * chat del cliente, con el mensaje listo para mandar. No hay cuenta de empresa
 * ni API de por medio: sale desde el WhatsApp del que toca el botón, que es
 * desde donde el cliente está acostumbrado a recibirlo.
 *
 * El número tiene que ir en formato internacional y sin signos. En Argentina un
 * celular es 54 + 9 + la característica sin el 0 + el número sin el 15:
 * "11 2345-6789" → 5491123456789. Si el número que quedó cargado no se puede
 * pasar a ese formato con seguridad, el link abre WhatsApp SIN número y el chat
 * se elige a mano: mandar a un número adivinado sería peor.
 */

/** El número para wa.me, o null si no se puede armar con seguridad. */
export function numeroWhatsApp(telefono) {
  let d = String(telefono || '').replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('00')) d = d.slice(2)          // 0054… (prefijo internacional)
  if (d.startsWith('549') && d.length === 13) return d
  if (d.startsWith('54') && d.length === 12) return `549${d.slice(2)}`
  if (d.startsWith('0')) d = d.slice(1)           // 011… → 11…
  // Con el 15 adentro ("223 15 512-3456"): son 12 dígitos y el 15 va justo
  // después de la característica, que tiene de 2 a 4 cifras.
  if (d.length === 12) {
    for (const largo of [2, 3, 4]) {
      if (d.slice(largo, largo + 2) === '15') {
        d = d.slice(0, largo) + d.slice(largo + 2)
        break
      }
    }
  }
  // Diez dígitos es característica + número. Si arranca con 15 le falta la
  // característica ("15 2345-6789"): no hay forma de saber cuál es.
  if (d.length === 10 && !d.startsWith('15')) return `549${d}`
  return null
}

/** Link a wa.me con el texto escrito; con el chat del cliente si se puede. */
export function enlaceWhatsApp(telefono, texto) {
  const numero = numeroWhatsApp(telefono)
  const consulta = `text=${encodeURIComponent(texto)}`
  return numero ? `https://wa.me/${numero}?${consulta}` : `https://wa.me/?${consulta}`
}

/** "Hola Juan!" — o "Hola!" si el cliente quedó como "Consumidor final". */
export function saludo(cliente) {
  const nombre = String(cliente || '').trim()
  if (!nombre || /^consumidor final$/i.test(nombre)) return 'Hola!'
  return `Hola ${nombre.split(/\s+/)[0]}!`
}
