import React from 'react'

export function NavItem({ icon, children, active = false, badge = null, style, ...rest }) {
  const [hover, setHover] = React.useState(false)
  return (
    <button
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, width: '100%',
        padding: '12px 16px', border: 'none', textAlign: 'left', cursor: 'pointer',
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
      <span style={{ flex: 1 }}>{children}</span>
      {badge != null && (
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
