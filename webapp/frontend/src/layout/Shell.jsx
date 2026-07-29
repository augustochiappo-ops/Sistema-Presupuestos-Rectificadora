import React from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Icon } from '../components/Icon'

export function Shell() {
  const [sidebarOpen, setSidebarOpen] = React.useState(false)

  return (
    <div className="shell-outer">
      <div className="shell-inner">
        <div className="shell-topbar">
          <button className="shell-topbar-toggle" onClick={() => setSidebarOpen(true)} aria-label="Abrir menú">
            <Icon n="menu" s={22} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 'var(--radius-md)', background: 'var(--brand-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <Icon n="wrench" s={16} />
            </div>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--text-strong)' }}>Rectifi</span>
          </div>
        </div>

        <div className={`sidebar-backdrop ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} />
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <main className="shell-main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
