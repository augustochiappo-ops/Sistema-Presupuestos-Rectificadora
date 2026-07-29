import React from 'react'
import { api } from '../api/client'

// La lista de categorías cambia solo cuando se reimporta el catálogo, y la piden
// varios componentes a la vez (el rail lateral y cada campo de categoría manual):
// se pide una sola vez por sesión y todos comparten la misma promesa.
let promesaCategorias = null

/** Categorías del catálogo del proveedor: rail lateral y <datalist> manuales. */
export function useCategorias() {
  const [categorias, setCategorias] = React.useState([])

  React.useEffect(() => {
    let vigente = true
    if (!promesaCategorias) {
      promesaCategorias = api.get('/repuestos/categorias').catch(() => {
        promesaCategorias = null   // que un error no deje la lista vacía para siempre
        return []
      })
    }
    promesaCategorias.then((data) => { if (vigente) setCategorias(data) })
    return () => { vigente = false }
  }, [])

  return categorias
}
