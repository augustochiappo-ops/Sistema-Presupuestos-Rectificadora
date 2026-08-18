import React from 'react'
import { Icon } from './Icon'
import { formatPrecioARS } from '../utils/format'

const titulo = {
  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
  letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-faint)',
}

/*
 * La caja de OPCIONALES: lo que puede llegar a hacer falta y no se cobra.
 *
 * De acá salió la idea: "yo voy a poner una bomba de aceite por las dudas de
 * que esa bomba no funcione; no la pongo en el presupuesto, pero hay que
 * tenerla en cuenta". Un servicio o un repuesto se arrastra de la caja del
 * presupuesto a ésta (o se toca la flechita de su renglón) y deja de sumar al
 * total, pero sigue guardado y sale en el PDF en su propia caja, con precio.
 *
 * Es una zona de drop: recibe `propsZona(true)` del hook useArrastreOpcionales
 * y dibuja el borde punteado. `children` es la tabla con las líneas opcionales.
 */
export function CajaOpcionales({
  children, total = 0, cantidad = 0, activa = false, dropProps = {}, nota,
}) {
  return (
    <div
      {...dropProps}
      style={{
        display: 'flex', flexDirection: 'column', gap: 10, padding: 14,
        border: `2px dashed ${activa ? 'var(--text-strong)' : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-xl)',
        background: activa ? 'var(--surface-sunken)' : 'transparent',
        transition: 'background .12s ease, border-color .12s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ ...titulo, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Icon n="layers" s={14} />
          Opcionales
          {cantidad > 0 && <span style={{ color: 'var(--text-muted)' }}>({cantidad})</span>}
        </span>
        {cantidad > 0 && (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            Si se hacen todos <strong style={{ color: 'var(--text-strong)' }}>{formatPrecioARS(total)}</strong>
          </span>
        )}
      </div>

      {cantidad === 0 ? (
        <div style={{
          padding: '22px 12px', textAlign: 'center', fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-sm)', color: 'var(--text-faint)',
        }}>
          Arrastrá acá los servicios o repuestos que quedan fuera del total.
          <br />
          Salen en el PDF con su precio, aparte, para tenerlos en cuenta por si hacen falta.
        </div>
      ) : children}

      {cantidad > 0 && (
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-faint)' }}>
          {nota || 'No suman al total. En el PDF van en su propia caja, con el precio de cada uno.'}
        </div>
      )}
    </div>
  )
}

/** Flechita de cada renglón: hace lo mismo que arrastrar, para poder usarlo en
 *  el celular (donde arrastrar no funciona). */
export function BotonOpcional({ opcional, onClick }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick() }}
      title={opcional ? 'Volver al presupuesto (vuelve a sumar)' : 'Pasar a opcionales (deja de sumar)'}
      style={{
        border: 'none', background: 'transparent', cursor: 'pointer',
        color: 'var(--text-faint)', display: 'flex', padding: 2,
      }}
    >
      <Icon n={opcional ? 'arrow-up' : 'arrow-down'} s={15} />
    </button>
  )
}
