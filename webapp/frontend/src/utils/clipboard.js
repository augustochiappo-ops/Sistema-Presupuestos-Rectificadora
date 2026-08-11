/*
 * Copiar al portapapeles con red de seguridad.
 *
 * `navigator.clipboard` solo existe en contextos seguros (https o localhost).
 * El sistema se usa desde el celular del taller y desde la PC, así que si por
 * lo que sea no está disponible se cae al método viejo (textarea oculto +
 * execCommand), que funciona en todos lados mientras sea dentro de un gesto
 * del usuario.
 *
 * Devuelve true/false en vez de tirar: quien llama decide qué mostrar.
 */
export async function copiarTexto(texto) {
  if (!texto) return false

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(texto)
      return true
    } catch {
      // Permiso denegado o contexto no seguro: seguimos con el fallback.
    }
  }

  try {
    const area = document.createElement('textarea')
    area.value = texto
    // Fuera de la vista pero enfocable: si no, el navegador no copia.
    area.style.position = 'fixed'
    area.style.top = '-1000px'
    area.setAttribute('readonly', '')
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}
