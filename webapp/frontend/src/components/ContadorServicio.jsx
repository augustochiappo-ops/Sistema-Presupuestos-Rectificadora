import React from 'react'

const CANTIDADES_SERVICIO = [1, 4, 6, 8]

const botonCantidad = {
  minWidth: 30, height: 30, padding: '0 6px', borderRadius: 8, border: '1px solid var(--border-default)',
  background: 'var(--surface-card)', cursor: 'pointer', fontSize: 13, fontWeight: 600, lineHeight: 1,
  color: 'var(--text-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'var(--font-body)',
}

/*
 * Contador de cantidad para ítems de mano de obra (servicios): un recuadro
 * editable a mano + atajos 1/4/6/8. A diferencia de SelectorCantidad
 * (repuestos), que fija la cantidad final elegida, acá los botones SUMAN a la
 * cantidad actual — tocar "8" dos veces deja 16, "6" dos veces deja 12.
 * Cantidad 0 (o vacía) = el servicio no está incluido en el presupuesto.
 */
export function ContadorServicio({ cantidad, onChange, disabled }) {
  const sumar = (e, n) => {
    e.stopPropagation()
    if (disabled) return
    onChange((cantidad || 0) + n)
  }

  const escribir = (e) => {
    e.stopPropagation()
    const val = parseFloat(e.target.value)
    onChange(Number.isNaN(val) ? 0 : Math.max(0, val))
  }

  return (
    <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <input
        type="number" min="0" step="1" value={cantidad || 0}
        disabled={disabled}
        onChange={escribir}
        style={{
          width: 44, height: 30, textAlign: 'center', borderRadius: 8,
          border: `1px solid ${cantidad > 0 ? 'var(--border-default)' : 'var(--border-strong)'}`,
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', background: 'var(--surface-card)', color: 'var(--text-strong)',
        }}
      />
      {CANTIDADES_SERVICIO.map((n) => (
        <button key={n} type="button" disabled={disabled} onClick={(e) => sumar(e, n)} style={botonCantidad}>
          {n}
        </button>
      ))}
    </span>
  )
}
