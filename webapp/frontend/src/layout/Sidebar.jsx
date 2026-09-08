import React from 'react'
import { NavLink } from 'react-router-dom'
import { NavItem } from '../components/NavItem'
import { Icon } from '../components/Icon'
import { useAuth } from '../context/AuthContext'
import { api } from '../api/client'

// El menú depende del rol. La oficina ve todo (y "Taller" al principio, porque
// es donde mira cómo viene el trabajo del día); el taller ve solamente su panel.
const ITEMS_OFICINA = [
  { to: '/taller', label: 'Taller', icon: 'hard-hat' },
  { to: '/motores', label: 'Listado de Motores', icon: 'wrench' },
  { to: '/excel', label: 'Actualizar Excel', icon: 'folder' },
  { to: '/presupuestos', label: 'Presupuestos', icon: 'file-text' },
  { to: '/precios', label: 'Editar Precios', icon: 'dollar-sign' },
  { to: '/clientes', label: 'Clientes', icon: 'users' },
  { to: '/repuestos', label: 'Repuestos', icon: 'package' },
  { to: '/busqueda-medidas', label: 'Búsqueda por medidas', icon: 'ruler' },
]

const ITEMS_TALLER = [
  { to: '/taller', label: 'Trabajos del taller', icon: 'hard-hat' },
]

function horaVencimiento(venceTs) {
  if (!venceTs) return 'Sesión activa'
  const hora = new Date(venceTs * 1000).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `Sesión hasta las ${hora}`
}

export function Sidebar({ open = false, onClose }) {
  const { user, rol, esTaller, logout, venceTs } = useAuth()
  const [conteo, setConteo] = React.useState(null)

  // Cuántos trabajos hay en cada estado. La oficina lo usa para saber, sin
  // entrar, que hay motores terminados esperando que se llame al cliente; el
  // taller, para ver cuántos tiene para empezar.
  React.useEffect(() => {
    let vivo = true
    const traer = () => api.get('/taller/resumen').then((d) => { if (vivo) setConteo(d) }).catch(() => {})
    traer()
    const t = setInterval(traer, 60000)
    const alCambiar = () => traer()
    window.addEventListener('trabajos-cambiaron', alCambiar)
    return () => { vivo = false; clearInterval(t); window.removeEventListener('trabajos-cambiaron', alCambiar) }
  }, [])

  const items = esTaller ? ITEMS_TALLER : ITEMS_OFICINA
  // La oficina cuenta lo terminado (hay que avisarle al cliente); el taller
  // cuenta lo que tiene para empezar y lo que ya tiene en la máquina.
  const pendiente = esTaller
    ? (conteo?.aprobado || 0) + (conteo?.en_proceso || 0)
    : (conteo?.terminado || 0)

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
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} style={{ textDecoration: 'none' }} onClick={onClose}>
            {({ isActive }) => (
              <NavItem
                icon={<Icon n={it.icon} />}
                active={isActive}
                badge={it.to === '/taller' && pendiente > 0 ? pendiente : null}
              >
                {it.label}
              </NavItem>
            )}
          </NavLink>
        ))}
      </nav>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 8px', borderTop: '1px solid var(--border-subtle)' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14, color: 'var(--text-strong)' }}>
            {user}
            <span style={{ fontWeight: 500, fontSize: 12, color: 'var(--text-muted)' }}>
              {rol ? ` · ${esTaller ? 'Taller' : 'Oficina'}` : ''}
            </span>
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-muted)' }}>{horaVencimiento(venceTs)}</div>
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
