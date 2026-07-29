import React from 'react'
import { TextField } from './TextField'
import { useCategorias } from '../hooks/useCategorias'

let contador = 0

/*
 * Categoría de un repuesto cargado a mano. Es texto libre con sugerencias del
 * catálogo (datalist) y no un <select>: un repuesto fuera de catálogo puede ser
 * de algo que el proveedor no vende. Es el nombre que ve el cliente en el PDF.
 */
export function CategoriaField({ value, onChange, style, placeholder = 'Categoría (ej. Aros)' }) {
  const categorias = useCategorias()
  const [listId] = React.useState(() => `categorias-${++contador}`)

  return (
    <>
      <TextField
        list={listId}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={style}
      />
      <datalist id={listId}>
        {categorias.map((c) => <option key={c.prefijo} value={c.nombre} />)}
      </datalist>
    </>
  )
}
