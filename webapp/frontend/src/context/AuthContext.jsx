import React from 'react'
import { api } from '../api/client'

const AuthContext = React.createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = React.useState(null)
  // 'oficina' | 'taller'. Decide qué menú se ve y a qué rutas se llega; el corte
  // de verdad está en el backend (el taller no alcanza ningún endpoint con precios).
  const [rol, setRol] = React.useState(null)
  const [venceTs, setVenceTs] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [avisoSesion, setAvisoSesion] = React.useState('')

  React.useEffect(() => {
    api.get('/auth/session')
      .then((data) => { setUser(data.usuario); setRol(data.rol); setVenceTs(data.vence_ts) })
      .catch(() => { setUser(null); setRol(null) })
      .finally(() => setLoading(false))
  }, [])

  // La sesión dura 8 horas desde el login: si vence mientras se está usando el
  // sistema, cualquier request devuelve 401 y volvemos a la pantalla de ingreso.
  React.useEffect(() => {
    const alVencer = () => {
      setUser(null)
      setRol(null)
      setVenceTs(null)
      setAvisoSesion('Tu sesión venció. Ingresá la contraseña de nuevo para seguir.')
    }
    window.addEventListener('sesion-vencida', alVencer)
    return () => window.removeEventListener('sesion-vencida', alVencer)
  }, [])

  const login = async (usuario, password) => {
    const data = await api.post('/auth/login', { usuario, password })
    setAvisoSesion('')
    setVenceTs(data.vence_ts)
    setRol(data.rol)
    setUser(data.usuario)
  }

  const logout = async () => {
    await api.post('/auth/logout')
    setAvisoSesion('')
    setVenceTs(null)
    setRol(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, rol, esTaller: rol === 'taller', loading, login, logout, avisoSesion, venceTs }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
