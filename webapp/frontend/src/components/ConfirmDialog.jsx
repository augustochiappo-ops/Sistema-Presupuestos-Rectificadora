import { Button } from './Button'

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false, onConfirm, onCancel }) {
  if (!open) return null
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(20,22,25,.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
      boxSizing: 'border-box',
    }}>
      <div style={{
        width: '100%', maxWidth: 380, background: 'var(--surface-card)', borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-lg)', padding: 24, boxSizing: 'border-box',
      }}>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-lg)', color: 'var(--text-strong)' }}>{title}</h3>
        <p style={{ margin: '10px 0 22px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{message}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Button variant="secondary" size="sm" onClick={onCancel}>{cancelLabel}</Button>
          <Button variant={danger ? 'danger' : 'primary'} size="sm" onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  )
}
