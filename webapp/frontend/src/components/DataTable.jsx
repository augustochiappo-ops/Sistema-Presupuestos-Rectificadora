import React from 'react'

export function DataTable({ columns = [], rows = [], onRowClick, emptyMessage = 'No hay datos para mostrar.', style, ...rest }) {
  const [hover, setHover] = React.useState(-1)

  if (rows.length === 0) {
    return (
      <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', background: 'var(--surface-card)', padding: '48px 20px', textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-faint)', ...style }}>
        {emptyMessage}
      </div>
    )
  }

  return (
    <div style={{ overflow: 'auto', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', background: 'var(--surface-card)', ...style }} {...rest}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-body)' }}>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} style={{
                textAlign: c.align || 'left', padding: '16px 20px',
                fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)',
                color: 'var(--text-muted)', borderBottom: '1px solid var(--border-default)',
                width: c.width, whiteSpace: 'nowrap',
              }}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={row.id ?? ri}
              onMouseEnter={() => setHover(ri)}
              onMouseLeave={() => setHover(-1)}
              onClick={() => onRowClick && onRowClick(row, ri)}
              style={{
                background: hover === ri ? 'var(--surface-sunken)' : 'transparent',
                cursor: onRowClick ? 'pointer' : 'default',
                transition: 'background .12s ease',
              }}
            >
              {columns.map((c, ci) => (
                <td key={ci} style={{
                  textAlign: c.align || 'left', padding: '15px 20px',
                  fontSize: 'var(--text-sm)', color: c.strong ? 'var(--text-strong)' : 'var(--text-body)',
                  fontWeight: c.strong ? 'var(--weight-semibold)' : 'var(--weight-regular)',
                  borderBottom: ri < rows.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  whiteSpace: c.wrap ? 'normal' : 'nowrap',
                }}>{c.render ? c.render(row[c.key], row) : row[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
