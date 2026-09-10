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
 * editable a mano + una tira de atajos.
 *
 * Tiene dos modos, porque las dos pantallas que lo usan quieren cosas
 * distintas del mismo control:
 *
 *   - modo "sumar" (el de siempre, y el default): los botones SUMAN a la
 *     cantidad actual — tocar "8" dos veces deja 16, "6" dos veces deja 12.
 *     Así funcionan el paso Servicios del wizard y la edición del detalle.
 *   - modo "fijar": el botón PONE ese número, sin importar lo que hubiera.
 *     Es lo que pide el presupuesto rápido, donde tildar un trabajo ya lo deja
 *     en 1 y tocar "6" quiere decir "son seis", no "seis más el que había".
 *
 * `opciones` permite cambiar los atajos (el rápido los deriva de los cilindros
 * del motor: 1 / N / N×2 / N×4). Cantidad 0 (o vacía) = el servicio no está
 * incluido en el presupuesto.
 */
export function ContadorServicio({ cantidad, onChange, disabled, opciones = CANTIDADES_SERVICIO, modo = 'sumar' }) {
  const tocar = (e, n) => {
    e.stopPropagation()
    if (disabled) return
    onChange(modo === 'fijar' ? n : (cantidad || 0) + n)
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
      {opciones.map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={(e) => tocar(e, n)}
          title={modo === 'fijar' ? `Poner ${n}` : `Sumar ${n}`}
          style={{
            ...botonCantidad,
            // En modo "fijar" el botón que coincide con la cantidad actual queda
            // marcado: dice de un vistazo en qué quedó el renglón.
            ...(modo === 'fijar' && cantidad === n
              ? { background: 'var(--surface-inverse)', color: '#fff', borderColor: 'var(--surface-inverse)' }
              : null),
          }}
        >
          {n}
        </button>
      ))}
    </span>
  )
}
