import { Icon } from './Icon'

export function ErrorBanner({ message, onClose }) {
  if (!message) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
      background: 'var(--status-expired-bg)', color: 'var(--status-expired-fg)',
      borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
    }}>
      <Icon n="alert-triangle" s={16} />
      <span style={{ flex: 1 }}>{message}</span>
      {onClose && (
        <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', display: 'flex' }}>
          <Icon n="x" s={16} />
        </button>
      )}
    </div>
  )
}
