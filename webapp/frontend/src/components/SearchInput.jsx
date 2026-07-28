import React from 'react'

export function SearchInput({
  placeholder = 'Buscar…',
  icon,
  value,
  onChange,
  width = 360,
  style,
  ...rest
}) {
  const [focused, setFocused] = React.useState(false)
  return (
    <div
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        width, height: 44, padding: '0 16px',
        background: 'var(--surface-card)',
        border: `1px solid ${focused ? 'var(--border-strong)' : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-pill)',
        boxShadow: focused ? '0 0 0 3px rgba(20,22,25,.05)' : 'var(--shadow-xs)',
        transition: 'box-shadow .15s ease, border-color .15s ease', ...style,
      }}
    >
      <span style={{ display: 'flex', color: 'var(--text-faint)' }}>{icon}</span>
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1, border: 'none', outline: 'none', background: 'transparent',
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
          color: 'var(--text-strong)', minWidth: 0,
        }}
        {...rest}
      />
    </div>
  )
}
