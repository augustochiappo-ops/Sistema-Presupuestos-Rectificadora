import React from 'react';

/**
 * Quick-stat metric card. Icon chip on top, big number, caption below.
 * `active` inverts it to the black highlighted treatment.
 */
export function StatCard({ icon, value, label, active = false, corner, style, ...rest }) {
  const fg = active ? 'var(--text-on-inverse)' : 'var(--text-strong)';
  return (
    <div
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column',
        alignItems: 'center', textAlign: 'center', gap: 10,
        padding: '22px 16px 18px', minWidth: 120,
        background: active ? 'var(--surface-inverse)' : 'var(--surface-card)',
        border: `1px solid ${active ? 'var(--surface-inverse)' : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-lg)',
        boxShadow: active ? 'var(--shadow-md)' : 'var(--shadow-xs)', ...style,
      }}
      {...rest}
    >
      <div style={{
        width: 48, height: 48, borderRadius: 'var(--radius-pill)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? 'rgba(255,255,255,.14)' : 'var(--surface-sunken)',
        color: active ? '#fff' : 'var(--text-strong)',
      }}>{icon}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-3xl)', color: fg, lineHeight: 1 }}>{value}</div>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: active ? 'rgba(255,255,255,.7)' : 'var(--text-muted)', lineHeight: 1.3 }}>{label}</div>
      {corner && (
        <span style={{ position: 'absolute', bottom: 12, right: 14, color: active ? 'rgba(255,255,255,.7)' : 'var(--text-faint)' }}>{corner}</span>
      )}
    </div>
  );
}
