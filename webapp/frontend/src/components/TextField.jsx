export function TextField({ as = 'input', style, onFocus, onBlur, ...rest }) {
  const Tag = as
  return (
    <Tag
      style={{
        width: '100%', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
        padding: as === 'textarea' ? '12px 14px' : '0 14px',
        height: as === 'textarea' ? undefined : 42,
        background: 'var(--surface-card)', color: 'var(--text-strong)',
        fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', outline: 'none',
        resize: as === 'textarea' ? 'vertical' : undefined,
        transition: 'border-color .15s ease, box-shadow .15s ease',
        ...style,
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(20,22,25,.05)'; onFocus?.(e) }}
      onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.boxShadow = 'none'; onBlur?.(e) }}
      {...rest}
    />
  )
}
