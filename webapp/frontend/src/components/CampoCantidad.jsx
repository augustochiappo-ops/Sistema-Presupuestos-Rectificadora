import React from 'react'
import { TextField } from './TextField'

/*
 * Cantidad de una línea, escrita en la tabla de la derecha del paso Servicios
 * (pedido del dueño, 2026-10-16: "que se pueda modificar la cantidad desde el
 * panel que está a la derecha").
 *
 * Mismo truco que CampoMonto: mientras el recuadro está enfocado manda un
 * borrador local con lo tecleado, y hacia arriba sólo se avisa un número mayor
 * que cero. Así, para cambiar un 4 por un 6 se puede borrar el 4 sin que el
 * renglón desaparezca a mitad de camino (cantidad 0 = fuera del presupuesto).
 * Si al salir quedó vacío o en cero, vuelve a verse la cantidad que tenía:
 * sacar una línea es la ✕ del renglón, no un recuadro mal borrado.
 */
export function CampoCantidad({ cantidad, onCambiar, onFocus, onBlur, ...rest }) {
  const [borrador, setBorrador] = React.useState(null)

  return (
    <TextField
      inputMode="decimal"
      {...rest}
      value={borrador ?? (cantidad ?? '')}
      onChange={(e) => {
        const texto = e.target.value
        setBorrador(texto)
        const n = parseFloat(texto.replace(',', '.'))
        if (n > 0) onCambiar(n)
      }}
      onFocus={(e) => { setBorrador(e.target.value); onFocus?.(e) }}
      onBlur={(e) => { setBorrador(null); onBlur?.(e) }}
    />
  )
}
