// Los cuatro estados de un trabajo, en el orden en que los recorre un motor.
// Es la misma lista que db.ESTADOS_TRABAJO del backend; si se agrega uno, hay
// que tocar los dos lados.
export const ESTADOS = [
  {
    id: 'aprobado',
    titulo: 'Para hacer',
    corto: 'Para hacer',
    // Lo que dice el botón que LLEVA a este estado (o sea, el que lo devuelve
    // para atrás cuando algo se marcó de más).
    accion: 'Volver a "Para hacer"',
    icono: 'clock',
    bg: 'var(--trabajo-aprobado-bg)',
    fg: 'var(--trabajo-aprobado-fg)',
    ayuda: 'Aprobado por el cliente. Todavía no se empezó.',
  },
  {
    id: 'en_proceso',
    titulo: 'En proceso',
    corto: 'En proceso',
    accion: 'Empezar',
    icono: 'play',
    bg: 'var(--trabajo-proceso-bg)',
    fg: 'var(--trabajo-proceso-fg)',
    ayuda: 'Se está trabajando en el motor.',
  },
  {
    id: 'terminado',
    titulo: 'Terminado',
    corto: 'Terminado',
    accion: 'Marcar terminado',
    icono: 'check',
    bg: 'var(--trabajo-terminado-bg)',
    fg: 'var(--trabajo-terminado-fg)',
    ayuda: 'Listo. Falta entregarlo.',
  },
  {
    id: 'entregado',
    titulo: 'Entregado',
    corto: 'Entregado',
    accion: 'Marcar entregado',
    icono: 'truck',
    bg: 'var(--trabajo-entregado-bg)',
    fg: 'var(--trabajo-entregado-fg)',
    ayuda: 'El motor ya se fue del taller.',
  },
]

export const POR_ID = Object.fromEntries(ESTADOS.map((e) => [e.id, e]))

export function estadoDe(id) {
  return POR_ID[id] || POR_ID.aprobado
}

/** Hace cuántos días está el trabajo donde está. `desde` es un ISO con hora. */
export function diasDesde(desde) {
  if (!desde) return null
  const t = new Date(desde).getTime()
  if (Number.isNaN(t)) return null
  return Math.floor((Date.now() - t) / 86400000)
}

/** "hoy", "ayer", "hace 4 días". Null cuando no hay dato. */
export function haceCuanto(desde) {
  const dias = diasDesde(desde)
  if (dias === null) return null
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'ayer'
  return `hace ${dias} días`
}

/**
 * Cuántos días faltan para la fecha prometida (negativo = ya se pasó).
 * `fechaIso` es 'YYYY-MM-DD'; se compara a mediodía para que el cambio de día
 * no dependa de la hora en que se mira la pantalla.
 */
export function diasParaEntrega(fechaIso) {
  if (!fechaIso) return null
  const t = new Date(`${fechaIso}T12:00:00`).getTime()
  if (Number.isNaN(t)) return null
  const hoy = new Date()
  hoy.setHours(12, 0, 0, 0)
  return Math.round((t - hoy.getTime()) / 86400000)
}

/** Avisa cuando el trabajo lleva demasiado tiempo quieto en el mismo estado. */
export function estaDemorado(trabajo) {
  if (trabajo.estado_trabajo === 'entregado') return false
  const atraso = diasParaEntrega(trabajo.entrega_prometida)
  if (atraso !== null && atraso < 0) return true
  const dias = diasDesde(trabajo.desde)
  // Una semana quieto en el mismo estado es mucho para un motor: se muestra
  // para que alguien lo mire, no para retar a nadie.
  return dias !== null && dias >= 7
}
