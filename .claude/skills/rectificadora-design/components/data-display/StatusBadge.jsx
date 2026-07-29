import React from 'react';

const MAP = {
  pending: { bg: 'var(--status-pending-bg)', fg: 'var(--status-pending-fg)', label: 'Pending' },
  active: { bg: 'var(--status-active-bg)', fg: 'var(--status-active-fg)', label: 'Active' },
  expired: { bg: 'var(--status-expired-bg)', fg: 'var(--status-expired-fg)', label: 'Expired' },
};

/**
 * Small status pill used in tables and lists (Pending / Active / Expired).
 * Pass `children` to override the default label text.
 */
export function StatusBadge({ status = 'pending', children, style, ...rest }) {
  const s = MAP[status] || MAP.pending;
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
  );
}
