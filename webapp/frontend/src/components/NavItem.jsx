import React from 'react'

// compacto: el menú lateral plegado. Queda sólo el ícono (el nombre sale al
// pasar el mouse, en el title del link) y el número del taller pasa a ser un
// puntito arriba del ícono.
export function NavItem({ icon, children, active = false, badge = null, compacto = false, style, ...rest }) {
  const [hover, setHover] = React.useState(false)
  return (
    <button
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, width: '100%',
        justifyContent: compacto ? 'center' : 'flex-start',
        padding: compacto ? '12px 0' : '12px 16px', position: 'relative', border: 'none', textAlign: 'left', cursor: 'pointer',
        borderRadius: 'var(--radius-pill)',
        background: active ? 'var(--surface-inverse)' : hover ? 'var(--surface-sunken)' : 'transparent',
        color: active ? 'var(--text-on-inverse)' : 'var(--text-body)',
        boxShadow: active ? 'var(--shadow-pill)' : 'none',
        fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-semibold)',
        fontSize: 'var(--text-md)', transition: 'background .15s ease', ...style,
      }}
      {...rest}
    >
      <span style={{ display: 'flex', width: 22, justifyContent: 'center', color: active ? '#fff' : 'var(--text-muted)' }}>{icon}</span>
      {!compacto && <span style={{ flex: 1 }}>{children}</span>}
      {compacto && badge != null && (
        <span
          aria-label={`${badge} pendientes`}
          style={{
            position: 'absolute', top: 6, right: 10, minWidth: 16, height: 16, padding: '0 4px',
            borderRadius: 'var(--radius-pill)', background: 'var(--status-active-fg)', color: '#fff',
            fontSize: 10, fontWeight: 'var(--weight-semibold)', lineHeight: '16px', textAlign: 'center',
          }}
        >
          {badge}
        </span>
      )}
      {!compacto && badge != null && (
        <span
          style={{
            minWidth: 22, padding: '2px 7px', borderRadius: 'var(--radius-pill)',
            background: active ? 'rgba(255,255,255,.22)' : 'var(--status-active-bg)',
            color: active ? '#fff' : 'var(--status-active-fg)',
            fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)',
            textAlign: 'center', lineHeight: 1.5,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  )
}
