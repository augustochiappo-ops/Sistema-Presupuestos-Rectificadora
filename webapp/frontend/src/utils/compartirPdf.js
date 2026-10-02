/*
 * Compartir el PDF de un presupuesto (WhatsApp, mail…) con el menú de
 * compartir del teléfono. Lo usan el detalle del presupuesto y el presupuesto
 * rápido: es la misma acción en las dos pantallas y tiene que fallar igual.
 *
 * El PDF se baja ANTES del click y queda guardado: navigator.share() exige el
 * gesto del usuario, y si el fetch se hace recién dentro del click el navegador
 * (iOS sobre todo) considera vencida la interacción y lo rechaza. Por eso hay
 * dos funciones: bajarPdf, que se llama apenas se sabe qué PDF es, y
 * compartirPdf, que se llama en el click con lo que ya se bajó.
 */

export function nombreArchivoPdf(id, cliente) {
  return `Presupuesto ${String(id).padStart(4, '0')} - ${cliente || 'cliente'}.pdf`
}

/** El PDF como blob, o null si no se pudo bajar. */
export function bajarPdf(id, version) {
  return fetch(`/api/presupuestos/${id}/pdf/${version}`, { credentials: 'include' })
    .then((res) => (res.ok ? res.blob() : null))
    .catch(() => null)
}

/**
 * Abre el menú de compartir con el PDF adjunto. Sin Web Share (Firefox de
 * escritorio, navegadores viejos) lo descarga, y desde la carpeta de descargas
 * se puede pegar en WhatsApp.
 *
 * Devuelve el aviso que hay que mostrar, o '' si salió bien (o si el usuario
 * cerró el menú de compartir, que no es un error).
 */
export async function compartirPdf({ blob, nombre, urlDescarga }) {
  const archivo = blob ? new File([blob], nombre, { type: 'application/pdf' }) : null

  if (archivo && navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: nombre })
    } catch (err) {
      if (err?.name !== 'AbortError') return 'No se pudo abrir el menú de compartir. Probá descargando el PDF.'
    }
    return ''
  }

  const enlace = document.createElement('a')
  enlace.href = blob ? URL.createObjectURL(blob) : urlDescarga
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  document.body.removeChild(enlace)
  if (blob) setTimeout(() => URL.revokeObjectURL(enlace.href), 10000)
  return 'Este navegador no permite compartir archivos: se descargó el PDF. Copialo desde la carpeta Descargas y pegalo en WhatsApp.'
}
