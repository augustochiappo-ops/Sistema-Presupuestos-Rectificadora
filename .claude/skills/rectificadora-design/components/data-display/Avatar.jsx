import React from 'react';

/**
 * Circular avatar with optional image and a small notification count badge
 * (as seen on the sidebar profile).
 */
export function Avatar({ src, name = '', size = 44, badge, style, ...rest }) {
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div style={{ position: 'relative', width: size, height: size, ...style }} {...rest}>
      <div style={{
        width: size, height: size, borderRadius: 'var(--radius-pill)', overflow: 'hidden',
        background: 'var(--surface-sunken)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-body)',
        fontWeight: 'var(--weight-semibold)', fontSize: size * 0.36,
        border: '1px solid var(--border-default)',
      }}>
        {src ? <img src={src} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
      </div>
      {badge != null && (
        <span style={{
          position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20, padding: '0 5px',
          borderRadius: 'var(--radius-pill)', background: 'var(--surface-inverse)',
          color: 'var(--text-on-inverse)', fontFamily: 'var(--font-body)', fontWeight: 700,
          fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '2px solid var(--surface-card)',
        }}>{badge}</span>
      )}
    </div>
  );
}
