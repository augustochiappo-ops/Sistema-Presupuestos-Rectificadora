import React from 'react';

/**
 * Data table matching the presupuestos listings. Header row + zebra-free rows
 * with hover highlight and soft dividers. Columns declare align/width; rows are
 * arrays or objects keyed by column `key`.
 */
export function DataTable({ columns = [], rows = [], onRowClick, style, ...rest }) {
  const [hover, setHover] = React.useState(-1);
  return (
    <div style={{ overflow: 'hidden', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', background: 'var(--surface-card)', ...style }} {...rest}>
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
              key={ri}
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
                  whiteSpace: 'nowrap',
                }}>{c.render ? c.render(row[c.key], row) : row[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
