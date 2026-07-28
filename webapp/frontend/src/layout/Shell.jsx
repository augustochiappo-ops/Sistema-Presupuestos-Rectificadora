import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'

export function Shell() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', padding: 24, boxSizing: 'border-box' }}>
      <div style={{
        maxWidth: 1360, margin: '0 auto', background: 'var(--surface-shell)',
        borderRadius: 'var(--radius-2xl)', boxShadow: 'var(--shadow-lg)',
        display: 'flex', overflow: 'hidden', minHeight: 'calc(100vh - 48px)',
      }}>
        <Sidebar />
        <main style={{ flex: 1, padding: '28px 30px', overflow: 'auto', minWidth: 0 }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
