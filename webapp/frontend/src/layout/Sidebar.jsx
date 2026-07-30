import { NavLink } from 'react-router-dom'
import { NavItem } from '../components/NavItem'
import { Icon } from '../components/Icon'
import { useAuth } from '../context/AuthContext'

const ITEMS = [
  { to: '/motores', label: 'Listado de Motores', icon: 'wrench' },
  { to: '/excel', label: 'Actualizar Excel', icon: 'folder' },
  { to: '/presupuestos', label: 'Presupuestos', icon: 'file-text' },
  { to: '/precios', label: 'Editar Precios', icon: 'dollar-sign' },
  { to: '/clientes', label: 'Clientes', icon: 'users' },
  { to: '/repuestos', label: 'Repuestos', icon: 'package' },
]

export function Sidebar({ open = false, onClose }) {
  const { user, logout } = useAuth()

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--brand-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <Icon n="wrench" s={22} />
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, lineHeight: 1.15, color: 'var(--text-strong)' }}>
            Rectificaciones<br />Chiappo
          </span>
        </div>
        <button
          onClick={onClose}
          className="shell-topbar-toggle"
          aria-label="Cerrar menú"
          style={{ display: open ? 'flex' : 'none' }}
        >
          <Icon n="x" s={20} />
        </button>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        {ITEMS.map((it) => (
          <NavLink key={it.to} to={it.to} style={{ textDecoration: 'none' }} onClick={onClose}>
            {({ isActive }) => (
              <NavItem icon={<Icon n={it.icon} />} active={isActive}>{it.label}</NavItem>
            )}
          </NavLink>
        ))}
      </nav>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 8px', borderTop: '1px solid var(--border-subtle)' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14, color: 'var(--text-strong)' }}>{user}</div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-muted)' }}>Sesión activa</div>
        </div>
        <button
          onClick={logout}
          title="Cerrar sesión"
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 8 }}
        >
          <Icon n="log-out" s={18} />
        </button>
      </div>
    </aside>
  )
}
