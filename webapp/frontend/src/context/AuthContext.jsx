import React from 'react'
import { api } from '../api/client'

const AuthContext = React.createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = React.useState(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    api.get('/auth/session')
      .then((data) => setUser(data.usuario))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = async (usuario, password) => {
    const data = await api.post('/auth/login', { usuario, password })
    setUser(data.usuario)
  }

  const logout = async () => {
    await api.post('/auth/logout')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
