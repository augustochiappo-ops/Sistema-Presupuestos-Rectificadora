import React from 'react'
import { Icon } from '../../../components/Icon'
import { formatPrecioARS, formatFechaAR } from '../../../utils/format'
import { coincideBusqueda, normalizarTexto } from '../../../utils/texto'

const titulo = {
  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
  letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-faint)',
}

const chip = {
  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
  color: 'var(--text-muted)', background: 'var(--surface-sunken)',
  borderRadius: 'var(--radius-pill)', padding: '1px 8px', whiteSpace: 'nowrap',
}

/*
 * El desplegable del disquete, al lado del buscador del paso Servicios
 * (pedido del dueño, 2026-10-16).
 *
 * Son los trabajos que NO están en la lista de la Cámara, que alguna vez se
 * escribieron a mano en un presupuesto y se guardaron con el disquete de su
 * renglón. Tocar uno lo agrega al presupuesto con el precio guardado; el tacho
 * lo saca de esta lista (no de los presupuestos donde se usó).
 *
 * Debajo de cada uno van los precios con que se cobró en presupuestos
 * anteriores, del más nuevo al más viejo: es lo que el dueño quiere tener a la
 * vista para decidir cuánto cobrar esta vez.
 *
 * Filtra con el mismo buscador de la lista de la Cámara: lo que se escribe ahí
 * busca en los dos lados.
 */
export function ServiciosGuardados({ guardados, cargando, busqueda, enPresupuesto, onAgregar, onBorrar }) {
  const visibles = (guardados || []).filter((g) => coincideBusqueda([g.descripcion], busqueda))

  return (
    <div
      style={{
        border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)',
        background: 'var(--surface-card)', padding: '12px 0 6px', maxHeight: 380, overflow: 'auto',
      }}
    >
      <div style={{ ...titulo, display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 8px' }}>
        <Icon n="save" s={14} />
        Trabajos guardados
        {guardados?.length > 0 && <span style={{ color: 'var(--text-muted)' }}>({guardados.length})</span>}
      </div>

      {cargando && !guardados && (
        <div style={{ padding: '14px 16px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
          Cargando…
        </div>
      )}

      {guardados && guardados.length === 0 && (
        <div style={{ padding: '10px 16px 14px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
          Todavía no guardaste ningún trabajo. Escribí uno a mano en el renglón en blanco del
          presupuesto y tocá su disquete: queda acá para los próximos.
        </div>
      )}

      {guardados && guardados.length > 0 && visibles.length === 0 && (
        <div style={{ padding: '10px 16px 14px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
          Ningún trabajo guardado coincide con «{busqueda}».
        </div>
      )}

      {visibles.map((g) => (
        <div
          key={g.id}
          role="button"
          tabIndex={0}
          onClick={() => onAgregar(g)}
          onKeyDown={(e) => { if (e.key === 'Enter') onAgregar(g) }}
          title="Agregar este trabajo al presupuesto"
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 16px',
            cursor: 'pointer', borderTop: '1px solid var(--border-subtle)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-sunken)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-strong)', fontWeight: 600 }}>
                {g.descripcion}
              </span>
              {enPresupuesto.has(normalizarTexto(g.descripcion)) && <span style={chip}>en el presupuesto</span>}
            </div>
            {/* Los precios de antes. Si nunca se usó (se guardó y no se emitió
                el presupuesto todavía) se dice, para que el renglón no parezca
                roto. */}
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {g.usos.length === 0 ? (
                <span style={{ color: 'var(--text-faint)' }}>Todavía no se usó en ningún presupuesto emitido.</span>
              ) : (
                <>
                  <span style={{ color: 'var(--text-faint)' }}>Cobrado antes: </span>
                  {g.usos.map((u, i) => (
                    <span key={`${u.presupuesto_id}-${i}`} title={`Presupuesto Nº ${u.presupuesto_id}${u.cantidad > 1 ? ` · cantidad ${u.cantidad}` : ''}`}>
                      {i > 0 && <span style={{ color: 'var(--text-faint)' }}> · </span>}
                      <strong style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{formatPrecioARS(u.precio)}</strong>
                      {' '}{formatFechaAR(u.fecha)}{u.cliente ? ` (${u.cliente})` : ''}
                    </span>
                  ))}
                </>
              )}
            </div>
          </div>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-strong)', whiteSpace: 'nowrap', paddingTop: 1 }}>
            {formatPrecioARS(g.precio)}
          </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onBorrar(g) }}
            title="Sacar de los trabajos guardados (los presupuestos donde se usó no cambian)"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex', padding: 2 }}
          >
            <Icon n="trash" s={15} />
          </button>
        </div>
      ))}
    </div>
  )
}
