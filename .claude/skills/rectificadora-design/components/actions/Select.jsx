import React from 'react';

/**
 * Lightweight dropdown trigger (e.g. the "Status ▾" filter). Presentational —
 * renders the current label and a chevron; wire onClick to your own menu.
 */
export function Select({ label = 'Status', open = false, icon, style, ...rest }) {
  return (
    <button
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 10, height: 42,
        padding: '0 16px', background: 'var(--surface-card)',
        border: '1px solid var(--border-default)', borderRadius: 'var(--radius-pill)',
        fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-medium)',
        fontSize: 'var(--text-sm)', color: 'var(--text-strong)', cursor: 'pointer',
        boxShadow: 'var(--shadow-xs)', ...style,
      }}
      {...rest}
    >
      {icon}
      <span>{label}</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
        style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease' }}>
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}
