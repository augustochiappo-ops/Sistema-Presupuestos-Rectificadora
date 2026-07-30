import React from 'react'
import ReactDOM from 'react-dom'
import { Icon } from './Icon'

// Cantidades del menú "+". No incluye 1: para eso está el recuadro manual.
const MENU = [4, 6, 8, 12, 16]

const botonCantidad = {
  minWidth: 30, height: 30, padding: '0 6px', borderRadius: 8, border: '1px solid var(--border-default)',
  background: 'var(--surface-card)', cursor: 'pointer', fontSize: 13, fontWeight: 600, lineHeight: 1,
  color: 'var(--text-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'var(--font-body)',
}

/*
 * Selector de cantidad para un ítem de mano de obra: recuadro editable a mano +
 * botón "+" que despliega [4,6,8,12,16] (en un portal, porque la lista vive en
 * un contenedor con overflow) + dos recuadros adaptativos que repiten el par
 * más elegido en el presupuesto (4/8 o 6/12 — lo calcula el padre).
 *
 * A diferencia de ContadorServicio, elegir un número del menú o de los
 * recuadros adaptativos FIJA la cantidad (no suma) — mismo criterio que
 * SelectorCantidad (repuestos).
 */
export function SelectorCantidadServicio({ cantidad, par, onElegir, onEscribir, disabled }) {
  const [pos, setPos] = React.useState(null)
  const botonRef = React.useRef(null)
  const panelRef = React.useRef(null)

  const abrir = (e) => {
    e.stopPropagation()
    if (disabled) return
    if (pos) { setPos(null); return }
    const r = botonRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 6, left: r.left })
  }

  React.useEffect(() => {
    if (!pos) return undefined
    const cerrarSiEsAfuera = (e) => {
      if (panelRef.current?.contains(e.target) || botonRef.current?.contains(e.target)) return
      setPos(null)
    }
    const cerrarConEsc = (e) => { if (e.key === 'Escape') setPos(null) }
    const cerrar = () => setPos(null)
    document.addEventListener('mousedown', cerrarSiEsAfuera)
    document.addEventListener('keydown', cerrarConEsc)
    window.addEventListener('resize', cerrar)
    // capture: el scroll de la lista de servicios no burbujea hasta window.
    window.addEventListener('scroll', cerrar, true)
    return () => {
      document.removeEventListener('mousedown', cerrarSiEsAfuera)
      document.removeEventListener('keydown', cerrarConEsc)
      window.removeEventListener('resize', cerrar)
      window.removeEventListener('scroll', cerrar, true)
    }
  }, [pos])

  const elegir = (e, n) => {
    e.stopPropagation()
    setPos(null)
    onElegir(n)
  }

  const escribir = (e) => {
    e.stopPropagation()
    const val = parseFloat(e.target.value)
    onEscribir(Number.isNaN(val) ? 0 : Math.max(0, val))
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

      <button ref={botonRef} type="button" disabled={disabled} onClick={abrir} title="Elegir cantidad" style={botonCantidad}>
        <Icon n="plus" s={16} />
      </button>

      {pos && ReactDOM.createPortal(
        <div
          ref={panelRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed', top: pos.top, left: pos.left,
            zIndex: 60, display: 'flex', gap: 6, padding: 8,
            background: 'var(--surface-card)', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
          }}
        >
          {MENU.map((n) => (
            <button key={n} type="button" onClick={(e) => elegir(e, n)} style={botonCantidad}>{n}</button>
          ))}
        </div>,
        document.body,
      )}

      {par.map((n) => (
        <button key={n} type="button" disabled={disabled} onClick={(e) => elegir(e, n)} style={botonCantidad} title={`Poner ${n}`}>
          {n}
        </button>
      ))}
    </span>
  )
}
