const MAP = {
  pending: { bg: 'var(--status-pending-bg)', fg: 'var(--status-pending-fg)', label: 'Pendiente' },
  active: { bg: 'var(--status-active-bg)', fg: 'var(--status-active-fg)', label: 'Vigente' },
  expired: { bg: 'var(--status-expired-bg)', fg: 'var(--status-expired-fg)', label: 'Vencido' },
  mecanico: { bg: 'var(--tag-mecanico-bg)', fg: 'var(--tag-mecanico-fg)', label: 'Mecánico' },
  dueno: { bg: 'var(--tag-dueno-bg)', fg: 'var(--tag-dueno-fg)', label: 'Dueño del vehículo' },
  sin_clasificar: { bg: 'var(--status-pending-bg)', fg: 'var(--status-pending-fg)', label: 'Sin clasificar' },
}

export function StatusBadge({ status = 'pending', children, style, ...rest }) {
  const s = MAP[status] || MAP.pending
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        padding: '5px 12px', borderRadius: 'var(--radius-pill)',
        background: s.bg, color: s.fg, fontFamily: 'var(--font-body)',
        fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-xs)',
        lineHeight: 1, whiteSpace: 'nowrap', ...style,
      }}
      {...rest}
    >
      {children || s.label}
    </span>
  )
}
