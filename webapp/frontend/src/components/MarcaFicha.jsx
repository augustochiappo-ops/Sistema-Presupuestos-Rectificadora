import React from 'react'

/*
 * El círculo que dice en qué nivel está un repuesto. Reemplaza a los chips de
 * texto ("En el motor" / "En el presupuesto"), que ocupaban media tabla:
 *
 *   ◯  contorno verde  → está en la ficha del motor (sirve para este motor),
 *                        pero NO se está cotizando en este presupuesto.
 *   ⬤  verde sólido    → además entra en el presupuesto que se está armando.
 *   ◌  gris vacío      → no está en ninguno de los dos.
 *
 * Es un control, no un cartel: clickearlo marca o desmarca la pertenencia al
 * motor. Poner una cantidad lo llena solo (esa parte la maneja quien lo usa).
 *
 * El color no alcanza como única señal — pantalla al sol, impresión, daltonismo —
 * así que el estado también viaja en el `title` y en `aria-checked`, y las
 * pantallas siguen mostrando el ×N al lado.
 */

const VERDE = 'var(--status-active-fg)'

export function MarcaFicha({ estado = 'fuera', onToggle, descripcion = '', size = 18, disabled = false }) {
  const enMotor = estado === 'motor' || estado === 'presupuesto'
  const lleno = estado === 'presupuesto'

  const titulo = {
    presupuesto: 'En el presupuesto (y guardado en este motor) — click para sacarlo',
    motor: 'Guardado en este motor, sin cotizar — click para sacarlo',
    fuera: 'Guardar como repuesto de este motor',
  }[estado]

  const radio = (size - 4) / 2

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={enMotor}
      aria-label={`${titulo}${descripcion ? `: ${descripcion}` : ''}`}
      title={titulo}
      data-estado={estado}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); if (!disabled) onToggle?.(estado) }}
      style={{
        border: 'none', background: 'transparent', padding: 2, lineHeight: 0,
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radio}
          fill={lleno ? VERDE : 'none'}
          stroke={enMotor ? VERDE : 'var(--border-default)'}
          strokeWidth="2"
        />
      </svg>
    </button>
  )
}
