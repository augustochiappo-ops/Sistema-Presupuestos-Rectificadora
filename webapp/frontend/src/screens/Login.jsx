import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/Button'
import { TextField } from '../components/TextField'
import { ErrorBanner } from '../components/ErrorBanner'
import { Icon } from '../components/Icon'

export default function Login() {
  const { login, avisoSesion } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [usuario, setUsuario] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState('')
  const [cargando, setCargando] = React.useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setCargando(true)
    try {
      await login(usuario, password)
      const destino = location.state?.from || '/motores'
      navigate(destino, { replace: true })
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <form onSubmit={submit} style={{
        width: '100%', maxWidth: 380, background: 'var(--surface-card)', borderRadius: 'var(--radius-2xl)',
        boxShadow: 'var(--shadow-lg)', padding: '36px 32px', display: 'flex', flexDirection: 'column', gap: 18,
        boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginBottom: 8 }}>
          <div style={{ width: 52, height: 52, borderRadius: 'var(--radius-md)', background: 'var(--brand-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <Icon n="wrench" s={28} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: 'var(--text-strong)' }}>Sistema de Presupuestos</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-muted)' }}>Rectificadora</div>
          </div>
        </div>

        <ErrorBanner message={error || avisoSesion} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>Usuario</label>
          <TextField value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus autoComplete="username" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>Contraseña</label>
          <TextField type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </div>

        <Button type="submit" variant="primary" fullWidth disabled={cargando || !usuario || !password} style={{ marginTop: 8 }}>
          {cargando ? 'Ingresando…' : 'Ingresar'}
        </Button>
      </form>
    </div>
  )
}
