import React from 'react'
import { api } from '../api/client'

// La lista de categorías cambia solo cuando se reimporta el catálogo, y la piden
// varios componentes a la vez (el rail lateral y cada campo de categoría manual).
// Va por el caché de api/client.js: los pedidos simultáneos se comparten, y si
// la precarga ya la trajo aparece al instante.

/** Categorías del catálogo del proveedor: rail lateral y <datalist> manuales. */
export function useCategorias() {
  const [categorias, setCategorias] = React.useState([])

  React.useEffect(() => {
    let vigente = true
    const poner = (data) => { if (vigente) setCategorias(data) }
    api.get('/repuestos/categorias', { alActualizar: poner }).then(poner).catch(() => {})
    return () => { vigente = false }
  }, [])

  return categorias
}
