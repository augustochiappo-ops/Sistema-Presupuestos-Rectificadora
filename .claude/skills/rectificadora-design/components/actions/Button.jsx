import React from 'react';

/**
 * Rectificadora primary action button. Monochrome: solid black (primary),
 * outline white (secondary), soft ghost, and a green success variant used
 * for creation actions ("Nuevo Presupuesto").
 */
export function Button({
  variant = 'primary',
  size = 'md',
  iconLeft,
  iconRight,
  disabled = false,
  fullWidth = false,
  children,
  style,
  ...rest
}) {
  const sizes = {
    sm: { h: 34, px: 14, fs: 'var(--text-sm)', gap: 6 },
    md: { h: 42, px: 18, fs: 'var(--text-md)', gap: 8 },
    lg: { h: 50, px: 24, fs: 'var(--text-md)', gap: 10 },
  }[size];

  const variants = {
    primary: { background: 'var(--surface-inverse)', color: 'var(--text-on-inverse)', border: '1px solid var(--surface-inverse)', boxShadow: 'var(--shadow-pill)' },
    secondary: { background: 'var(--surface-card)', color: 'var(--text-strong)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-xs)' },
    ghost: { background: 'transparent', color: 'var(--text-body)', border: '1px solid transparent', boxShadow: 'none' },
    success: { background: 'var(--status-active-fg)', color: '#fff', border: '1px solid var(--status-active-fg)', boxShadow: 'var(--shadow-sm)' },
  }[variant];

  return (
    <button
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        gap: sizes.gap, height: sizes.h, padding: `0 ${sizes.px}px`,
        width: fullWidth ? '100%' : 'auto',
        fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-semibold)',
        fontSize: sizes.fs, lineHeight: 1, borderRadius: 'var(--radius-md)',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
        transition: 'transform .12s ease, opacity .12s ease, box-shadow .12s ease',
        whiteSpace: 'nowrap', ...variants, ...style,
      }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = 'scale(.97)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      {...rest}
    >
      {iconLeft}{children}{iconRight}
    </button>
  );
}
