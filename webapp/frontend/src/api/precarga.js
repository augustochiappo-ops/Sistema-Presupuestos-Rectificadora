import { precargar, cuandoQuieto, estaQuieto } from './client'

/* La cola de precarga (2026-10-05): con la primera pestaña ya en pantalla, va
   trayendo de a una las demás —el código de cada pantalla y sus datos de
   entrada— para que después entrar a cualquiera sea instantáneo.

   Nunca le compite a la pantalla: antes de cada paso espera a que no haya
   ningún pedido de la pantalla en curso (más un respiro, por si la pantalla
   encadena otro). Si se entra a una pestaña que todavía no se precargó, lo de
   esa pestaña sale primero y la cola sigue atrás.

   Vuelve a dar una vuelta —sólo por lo que falte o esté viejo— después de cada
   escritura (lo guardado ensucia el caché, ver client.js) y al volver a la
   pestaña del navegador después de un rato. */

const RESPIRO_MS = 150
const ESPERA_TRAS_ESCRITURA_MS = 2500
const AUSENCIA_LARGA_MS = 5 * 60 * 1000

let tareas = []
let activa = false
let corriendo = false
let otraVuelta = false
let timerEscritura = null
let ocultaDesde = null

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

/** Espera a que la pantalla no esté pidiendo nada. */
export async function esperarTurno() {
  for (;;) {
    await cuandoQuieto()
    await dormir(RESPIRO_MS)
    if (estaQuieto()) return
  }
}

async function correr() {
  if (corriendo) { otraVuelta = true; return }
  corriendo = true
  try {
    do {
      otraVuelta = false
      for (const tarea of tareas) {
        if (!activa) return
        await esperarTurno()
        if (!activa) return
        try {
          await (typeof tarea === 'string' ? precargar(tarea) : tarea())
        } catch {
          // Lo que falle acá se pide igual al entrar a la pestaña: no es un error.
        }
      }
    } while (otraVuelta && activa)
  } finally {
    corriendo = false
  }
}

function alEscribir() {
  clearTimeout(timerEscritura)
  timerEscritura = setTimeout(() => { if (activa) correr() }, ESPERA_TRAS_ESCRITURA_MS)
}

function alCambiarVisibilidad() {
  if (document.hidden) { ocultaDesde = Date.now(); return }
  if (ocultaDesde && Date.now() - ocultaDesde > AUSENCIA_LARGA_MS && activa) correr()
  ocultaDesde = null
}

/** Arranca la cola con la lista de tareas: paths de la API o funciones que devuelven una promesa. */
export function iniciarPrecarga(lista) {
  tareas = lista
  if (!activa) {
    activa = true
    window.addEventListener('datos-cambiaron', alEscribir)
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
  }
  correr()
}

export function detenerPrecarga() {
  activa = false
  tareas = []
  clearTimeout(timerEscritura)
  window.removeEventListener('datos-cambiaron', alEscribir)
  document.removeEventListener('visibilitychange', alCambiarVisibilidad)
}
