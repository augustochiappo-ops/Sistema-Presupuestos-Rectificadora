/*
 * Las trece listas de la Cámara, para elegir cuál se está tarifando.
 *
 * Cada lista muestra cuántos motores la usan, y no es decoración: la 8 tiene 99
 * motores y la 11 tiene 5. Sin ese número, elegir entre trece cifras sueltas es
 * adivinar; con él, se ve de una cuál conviene tarifar primero.
 *
 * El punto al lado indica que esa lista ya tiene precios propios cargados, así
 * que se puede ver de un vistazo hasta dónde llegó el trabajo sin entrar a cada
 * una.
 */
export function SelectorLista({ listas, valor, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{
        fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
        letterSpacing: 'var(--tracking-eyebrow)', textTransform: 'uppercase',
        color: 'var(--text-faint)',
      }}>
        Lista de la Cámara
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {listas.map((l) => {
          const activa = l.lista_num === valor
          return (
            <button
              key={l.lista_num}
              onClick={() => onChange(l.lista_num)}
              title={`Lista ${l.lista_num} — ${l.motores} motor${l.motores === 1 ? '' : 'es'}`
                + (l.propios ? ` · ${l.propios} precio${l.propios === 1 ? '' : 's'} tuyo${l.propios === 1 ? '' : 's'}` : '')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                height: 40, padding: '0 14px', cursor: 'pointer',
                borderRadius: 'var(--radius-pill)',
                border: `1px solid ${activa ? 'var(--surface-inverse)' : 'var(--border-default)'}`,
                background: activa ? 'var(--surface-inverse)' : 'var(--surface-card)',
                color: activa ? 'var(--text-on-inverse)' : 'var(--text-strong)',
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                fontWeight: activa ? 600 : 500,
                boxShadow: activa ? 'var(--shadow-pill)' : 'var(--shadow-xs)',
              }}
            >
              <span>{l.lista_num}</span>
              <span style={{ fontSize: 12, opacity: activa ? .75 : 1, color: activa ? 'inherit' : 'var(--text-faint)' }}>
                {l.motores}
              </span>
              {l.propios > 0 && (
                <span
                  aria-hidden
                  style={{
                    width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                    background: activa ? 'var(--text-on-inverse)' : 'var(--status-active-fg)',
                  }}
                />
              )}
            </button>
          )
        })}
      </div>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-faint)' }}>
        El número chico es cuántos motores usan esa lista. El punto marca las que ya tienen precios tuyos.
      </div>
    </div>
  )
}
