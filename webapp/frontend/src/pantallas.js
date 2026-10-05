import React from 'react'
import { precargar } from './api/client'
import { esperarTurno } from './api/precarga'

/* Cada pantalla es un archivo aparte del build (code splitting): la primera
   pestaña abre sin esperar el código de las otras nueve, y la cola de precarga
   (api/precarga.js) las va bajando después. Los cargadores están acá, en un
   solo lugar, para que App.jsx y la cola pidan exactamente el mismo archivo. */

// Si un deploy cambió los nombres de los archivos mientras la app estaba
// abierta, el pedido del código viejo da 404: se recarga la página una vez
// (con el index.html nuevo) en vez de dejar la pantalla en blanco.
function conReintento(cargar) {
  return () => cargar().catch((e) => {
    let yaRecargo = false
    try { yaRecargo = sessionStorage.getItem('recargo-por-deploy') === '1' } catch { /* sin storage */ }
    if (!yaRecargo) {
      try { sessionStorage.setItem('recargo-por-deploy', '1') } catch { /* sin storage */ }
      window.location.reload()
      return new Promise(() => {})
    }
    throw e
  }).then((m) => {
    try { sessionStorage.removeItem('recargo-por-deploy') } catch { /* sin storage */ }
    return m
  })
}

export const cargar = {
  taller: conReintento(() => import('./screens/Taller/TallerScreen')),
  ordenTrabajo: conReintento(() => import('./screens/Taller/OrdenTrabajo')),
  rapido: conReintento(() => import('./screens/Presupuestos/PresupuestoRapido')),
  motores: conReintento(() => import('./screens/Motores/MotoresScreen')),
  excel: conReintento(() => import('./screens/Excel/ExcelScreen')),
  historial: conReintento(() => import('./screens/Presupuestos/Historial')),
  wizard: conReintento(() => import('./screens/Presupuestos/Wizard/WizardPresupuesto')),
  detalle: conReintento(() => import('./screens/Presupuestos/Detalle')),
  pedido: conReintento(() => import('./screens/Presupuestos/Pedido')),
  precios: conReintento(() => import('./screens/Precios/PreciosScreen')),
  clientes: conReintento(() => import('./screens/Clientes/ClientesScreen')),
  clienteDetalle: conReintento(() => import('./screens/Clientes/ClienteDetalle')),
  repuestos: conReintento(() => import('./screens/Repuestos/RepuestosScreen')),
  medidas: conReintento(() => import('./screens/BusquedaMedidas/BusquedaMedidasScreen')),
}

export const Pantalla = Object.fromEntries(
  Object.entries(cargar).map(([k, fn]) => [k, React.lazy(fn)]),
)

// Precios abre en la lista que más motores usa (PreciosScreen): para traer
// esa lista hay que saber primero cuál es.
async function precargarPrecios() {
  const listas = await precargar('/precios/listas')
  const masUsada = [...(listas || [])].sort((a, b) => b.motores - a.motores)[0]
  await esperarTurno()
  await precargar(`/precios/mano-obra?lista=${masUsada ? masUsada.lista_num : 1}`)
}

/* Qué se precarga, en el orden del menú. Los paths son exactamente los que
   pide cada pantalla al abrirse: uno distinto (otro parámetro, otra barra) no
   lo encontraría en el caché. */
export const PRECARGA_OFICINA = [
  cargar.taller, '/taller/trabajos',
  cargar.rapido, '/servicios', '/servicios/favoritos', '/repuestos/categorias/favoritos', '/repuestos/categorias',
  cargar.motores, '/motores/marcas', '/motores?',
  cargar.excel, '/repuestos/catalogo-info',
  cargar.historial, '/presupuestos?',
  cargar.precios, precargarPrecios, '/precios/mios',
  cargar.clientes, '/clientes',
  cargar.repuestos, '/repuestos/marcas?',
  cargar.medidas, '/tecnicos/familias',
  // Las que se abren desde otra pantalla, sólo el código.
  cargar.wizard, cargar.detalle, cargar.clienteDetalle, cargar.pedido, cargar.ordenTrabajo,
]

export const PRECARGA_TALLER = [
  cargar.taller, '/taller/trabajos', cargar.ordenTrabajo,
]
