import React from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Icon } from '../components/Icon'
import { useAuth } from '../context/AuthContext'
import { iniciarPrecarga, detenerPrecarga } from '../api/precarga'
import { PRECARGA_OFICINA, PRECARGA_TALLER } from '../pantallas'

// Mientras baja el código de una pantalla que la precarga todavía no trajo.
function CargandoPantalla() {
  return (
    <div style={{ padding: 32, color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
      Cargando…
    </div>
  )
}

// Va al lado de la pantalla, dentro del mismo Suspense: su efecto corre recién
// cuando la primera pestaña ya está en pantalla y largó sus pedidos, así la
// precarga de las otras arranca detrás y no adelante.
function ArrancarPrecarga() {
  const { esTaller } = useAuth()
  React.useEffect(() => {
    iniciarPrecarga(esTaller ? PRECARGA_TALLER : PRECARGA_OFICINA)
  }, [esTaller])
  React.useEffect(() => () => detenerPrecarga(), [])
  return null
}

// El menú lateral plegado (sólo íconos) se recuerda en este navegador. Si el
// navegador no deja guardar, arranca abierto y listo.
const CLAVE_MENU = 'menu-lateral-plegado'
const ANCHO_CELULAR = '(max-width: 860px)'

function leerPlegado() {
  try { return window.localStorage.getItem(CLAVE_MENU) === '1' } catch { return false }
}

// En el celular el menú no se pliega: se esconde entero y sale con el botón de
// la barra de arriba, como siempre. El plegado es cosa de la pantalla grande.
function useEnCelular() {
  const [en, setEn] = React.useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(ANCHO_CELULAR).matches)
  React.useEffect(() => {
    const mq = window.matchMedia?.(ANCHO_CELULAR)
    if (!mq) return undefined
    const cambio = () => setEn(mq.matches)
    mq.addEventListener('change', cambio)
    return () => mq.removeEventListener('change', cambio)
  }, [])
  return en
}

export function Shell() {
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const [plegado, setPlegado] = React.useState(leerPlegado)
  const enCelular = useEnCelular()
  const compacto = plegado && !enCelular

  const alternarPlegado = () => {
    setPlegado((p) => {
      try { window.localStorage.setItem(CLAVE_MENU, p ? '0' : '1') } catch { /* sin guardar */ }
      return !p
    })
  }

  return (
    <div className={`shell-outer ${compacto ? 'menu-plegado' : ''}`}>
      <div className="shell-inner">
        <div className="shell-topbar">
          <button className="shell-topbar-toggle" onClick={() => setSidebarOpen(true)} aria-label="Abrir menú">
            <Icon n="menu" s={22} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 'var(--radius-md)', background: 'var(--brand-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <Icon n="wrench" s={16} />
            </div>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, lineHeight: 1.15, color: 'var(--text-strong)' }}>
              Rectificaciones<br />Chiappo
            </span>
          </div>
        </div>

        <div className={`sidebar-backdrop ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} />
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} compacto={compacto} onPlegar={alternarPlegado} />

        <main className="shell-main">
          <React.Suspense fallback={<CargandoPantalla />}>
            <Outlet />
            <ArrancarPrecarga />
          </React.Suspense>
        </main>
      </div>
    </div>
  )
}
