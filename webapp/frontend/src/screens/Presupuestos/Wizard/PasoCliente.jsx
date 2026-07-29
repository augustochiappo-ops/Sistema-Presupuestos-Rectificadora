import React from 'react'
import { api } from '../../../api/client'
import { TextField } from '../../../components/TextField'
import { Button } from '../../../components/Button'
import { formatearNombreTitulo } from '../../../utils/format'

export function PasoCliente({ valorInicial, onSiguiente }) {
  const [nombre, setNombre] = React.useState(valorInicial || '')
  const [nombres, setNombres] = React.useState([])
  const [mostrarSugerencias, setMostrarSugerencias] = React.useState(false)

  React.useEffect(() => {
    api.get('/clientes/nombres').then(setNombres).catch(() => {})
  }, [])

  const sugerencias = nombre
    ? nombres.filter((n) => n.toLowerCase().includes(nombre.toLowerCase())).slice(0, 8)
    : []

  const confirmar = (e) => {
    e?.preventDefault()
    // Solo feedback visual: el backend normaliza igual al guardar.
    if (nombre.trim()) onSiguiente(formatearNombreTitulo(nombre.trim()))
  }

  return (
    <form onSubmit={confirmar} style={{ maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-strong)' }}>
        Nombre del cliente
      </label>
      <div style={{ position: 'relative' }}>
        <TextField
          value={nombre}
          autoFocus
          onChange={(e) => { setNombre(e.target.value); setMostrarSugerencias(true) }}
          onFocus={() => setMostrarSugerencias(true)}
          onBlur={() => setTimeout(() => setMostrarSugerencias(false), 120)}
          placeholder="Ej: Juan García"
        />
        {mostrarSugerencias && sugerencias.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 10,
            background: 'var(--surface-card)', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
          }}>
            {sugerencias.map((n) => (
              <div
                key={n}
                onMouseDown={() => { setNombre(n); setMostrarSugerencias(false) }}
                style={{ padding: '10px 14px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', cursor: 'pointer', color: 'var(--text-body)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-sunken)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                {n}
              </div>
            ))}
          </div>
        )}
      </div>
      <Button type="submit" variant="primary" disabled={!nombre.trim()} style={{ marginTop: 16, alignSelf: 'flex-start' }}>
        Siguiente
      </Button>
    </form>
  )
}
