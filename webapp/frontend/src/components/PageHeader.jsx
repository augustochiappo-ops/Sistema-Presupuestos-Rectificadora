export function PageHeader({ title, subtitle, actions, style, ...rest }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', ...style }} {...rest}>
      <div>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-2xl)', color: 'var(--text-strong)', letterSpacing: 'var(--tracking-tight)', lineHeight: 1.1 }}>{title}</h1>
        {subtitle && <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{subtitle}</p>}
      </div>
      {/* flexWrap + maxWidth: en el celular los botones bajan de renglón en vez
          de empujar la pantalla de costado. En la compu entran en una fila y
          no cambia nada. */}
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap', maxWidth: '100%' }}>{actions}</div>}
    </div>
  )
}
