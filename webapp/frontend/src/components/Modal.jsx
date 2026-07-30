import { Icon } from './Icon'

// Popup genérico que se superpone a toda la app (fondo oscuro + tarjeta
// centrada), para contenido que no amerita navegar a una pantalla nueva.
export function Modal({ open, title, onClose, children, maxWidth = 760 }) {
  if (!open) return null
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,22,25,.45)', zIndex: 1000,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '40px 16px', boxSizing: 'border-box', overflow: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth, background: 'var(--surface-card)', borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-lg)', boxSizing: 'border-box', maxHeight: 'calc(100vh - 80px)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          padding: '18px 22px', borderBottom: '1px solid var(--border-default)', flexShrink: 0,
        }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-lg)', color: 'var(--text-strong)' }}>
            {title}
          </h3>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex', padding: 4 }}
          >
            <Icon n="x" s={20} />
          </button>
        </div>
        <div style={{ padding: 20, overflow: 'auto' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
