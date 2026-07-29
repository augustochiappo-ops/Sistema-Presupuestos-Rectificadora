import React from 'react';

/**
 * A row in a compact list panel (e.g. "Pending Approvals"): leading logo/avatar,
 * title + timestamp, and a trailing slot (badge, menu…).
 */
export function ListItem({ leading, title, meta, trailing, style, ...rest }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '10px 4px', ...style,
      }}
      {...rest}
    >
      {leading && (
        <div style={{
          width: 40, height: 40, borderRadius: 'var(--radius-pill)', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--surface-sunken)', overflow: 'hidden',
        }}>{leading}</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-md)', color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        {meta && <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>{meta}</div>}
      </div>
      {trailing && <div style={{ flexShrink: 0 }}>{trailing}</div>}
    </div>
  );
}
