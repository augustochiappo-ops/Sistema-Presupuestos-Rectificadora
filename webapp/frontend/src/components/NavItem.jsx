import React from 'react'

export function NavItem({ icon, children, active = false, style, ...rest }) {
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
      <span>{children}</span>
    </button>
  )
}
