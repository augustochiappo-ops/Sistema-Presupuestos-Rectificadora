import React from 'react';

/**
 * Minimal monochrome bar chart (thin bars, two series). Purely visual — feed it
 * `data` of { label, a, b } where `a` is the primary (black) series and `b` the
 * secondary (gray). No axis library.
 */
export function BarChart({ data = [], max, height = 220, style, ...rest }) {
  const peak = max || Math.max(1, ...data.flatMap((d) => [d.a || 0, d.b || 0]));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'clamp(6px,2%,18px)', height, ...style }} {...rest}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 4, width: '100%', justifyContent: 'center' }}>
            <span style={{ width: 7, borderRadius: 'var(--radius-pill)', background: 'var(--chart-bar)', height: `${((d.a || 0) / peak) * 100}%` }} />
            {d.b != null && <span style={{ width: 7, borderRadius: 'var(--radius-pill)', background: 'var(--chart-bar-alt)', height: `${(d.b / peak) * 100}%` }} />}
          </div>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}
