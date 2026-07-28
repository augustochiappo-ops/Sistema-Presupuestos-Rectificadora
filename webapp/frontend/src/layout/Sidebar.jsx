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
]

export function Sidebar() {
  const { user, logout } = useAuth()

  return (
    <aside style={{ width: 248, flexShrink: 0, padding: '28px 20px', display: 'flex', flexDirection: 'column', gap: 28, borderRight: '1px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 8px' }}>
        <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--brand-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
          <Icon n="wrench" s={22} />
        </div>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 19, color: 'var(--text-strong)' }}>Rectifi</span>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        {ITEMS.map((it) => (
          <NavLink key={it.to} to={it.to} style={{ textDecoration: 'none' }}>
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
