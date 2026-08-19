/*
 * Contador − [n] + para la cantidad de una línea ya cargada en el presupuesto.
 *
 * Es el de menos ruido de los tres que hay, y por eso el que va donde se
 * REPASA lo cargado (el pop-up "Ver repuestos" y el paso de Revisión): ahí la
 * cantidad ya está elegida y lo único que se hace es corregirla de a uno.
 *
 * Los otros dos son para ELEGIR: ContadorServicio (mano de obra) suma de a 1/4/
 * 6/8 y SelectorCantidad (repuestos) despliega las cantidades típicas de un
 * motor. En una tabla de repaso esos atajos no entran y se leen como números
 * sueltos al lado de la cantidad.
 *
 * Cantidad 0 la maneja quien lo usa: en las dos pantallas saca la línea.
 */
const boton = {
  width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border-default)',
  background: 'var(--surface-card)', cursor: 'pointer', fontSize: 15, lineHeight: 1,
  color: 'var(--text-strong)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
}

export function ContadorCantidad({ cantidad, onChange }) {
  const actual = Number(cantidad) || 0
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={(e) => e.stopPropagation()}>
      <button type="button" style={boton} onClick={() => onChange(Math.max(0, actual - 1))}>−</button>
      <input
        type="number" min="0" step="1"
        value={cantidad}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{
          width: 56, height: 28, textAlign: 'center', borderRadius: 8,
          border: `1px solid ${actual > 0 ? 'var(--border-default)' : 'var(--status-expired-fg)'}`,
          background: 'var(--surface-card)', color: 'var(--text-strong)',
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
        }}
      />
      <button type="button" style={boton} onClick={() => onChange(actual + 1)}>+</button>
    </span>
  )
}
