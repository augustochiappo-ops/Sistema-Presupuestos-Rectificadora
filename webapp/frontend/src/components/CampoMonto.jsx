import React from 'react'
import { TextField } from './TextField'

/*
 * Recuadro de un monto DERIVADO — hoy, el subtotal de una línea.
 *
 * El problema que resuelve (bug reportado el 2026-08-19): el recuadro del
 * subtotal mostraba siempre el valor recalculado y formateado
 * (`textoSubtotal(unitario, cantidad)`), así que en cada tecla React reescribía
 * el input entero. Escribir "5" devolvía "$ 5" y el cursor se iba al final; con
 * centavos, además, aparecían de la nada. El recuadro del precio unitario nunca
 * tuvo el problema porque guarda el texto TAL CUAL se tipea.
 *
 * La solución es esa misma idea, pero sin tener que persistir el texto de un
 * valor que se calcula: mientras el campo está enfocado manda un borrador local
 * con lo tipeado letra por letra (el cursor no se mueve, no se reformatea
 * nada); al salir, el borrador se descarta y vuelve a verse el valor derivado
 * ya formateado. El total sigue actualizándose en vivo porque cada tecla avisa
 * igual hacia arriba.
 */
export function CampoMonto({ valor, onEscribir, onFocus, onBlur, ...rest }) {
  const [borrador, setBorrador] = React.useState(null)

  return (
    <TextField
      {...rest}
      value={borrador ?? valor ?? ''}
      onChange={(e) => {
        setBorrador(e.target.value)
        onEscribir(e.target.value)
      }}
      onFocus={(e) => { setBorrador(e.target.value); onFocus?.(e) }}
      onBlur={(e) => { setBorrador(null); onBlur?.(e) }}
    />
  )
}
