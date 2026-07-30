import React from 'react'
import { api } from '../../../api/client'
import { SearchInput } from '../../../components/SearchInput'
import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import { formatearNombreTitulo, formatFechaAR } from '../../../utils/format'
import { filtrarClientesPorBusqueda } from '../../../utils/fuzzyMatch'

// Muestra el listado completo de clientes (igual que la pantalla Clientes) con
// un buscador tolerante a nombres incompletos y errores de tipeo ("Dani Pasc"
// o "Daniel Pascoal" encuentran a "Daniel Pascolo"): así no hace falta
// retipear el nombre completo de un cliente que ya existe. Elegir una fila de
// la lista avanza directo; si el nombre no está en la lista, se puede tipear
// uno nuevo y confirmar con el botón — se crea recién al guardar el presupuesto.
export function PasoCliente({ valorInicial, onSiguiente }) {
  const [busqueda, setBusqueda] = React.useState(valorInicial || '')
  const [clientes, setClientes] = React.useState([])
  const [cargando, setCargando] = React.useState(true)

  React.useEffect(() => {
    api.get('/clientes').then(setClientes).finally(() => setCargando(false))
  }, [])

  const filtrados = React.useMemo(
    () => filtrarClientesPorBusqueda(clientes, busqueda).slice(0, 30),
    [clientes, busqueda],
  )

  const confirmar = (e) => {
    e?.preventDefault()
    // Solo feedback visual: el backend normaliza igual al guardar.
    if (busqueda.trim()) onSiguiente(formatearNombreTitulo(busqueda.trim()))
  }

  return (
    <div style={{ maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <label style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-strong)' }}>
        Cliente
      </label>
      <form onSubmit={confirmar} style={{ display: 'flex', gap: 10 }}>
        <SearchInput
          icon={<Icon n="search" s={16} />}
          value={busqueda}
          autoFocus
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar cliente o escribir uno nuevo…"
          style={{ flex: 1 }}
        />
        <Button type="submit" variant="primary" disabled={!busqueda.trim()}>
          Siguiente
        </Button>
      </form>

      <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', background: 'var(--surface-card)', maxHeight: 360, overflow: 'auto' }}>
        {filtrados.map((c) => (
          <div
            key={c.id}
            onClick={() => onSiguiente(c.nombre)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-sunken)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-strong)' }}>
              {c.nombre}
            </span>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
              {c.total_presupuestos} presupuesto{c.total_presupuestos === 1 ? '' : 's'}
              {c.ultimo_presupuesto ? ` · último ${formatFechaAR(c.ultimo_presupuesto)}` : ''}
            </span>
          </div>
        ))}
        {filtrados.length === 0 && (
          <div style={{ padding: '20px 16px', textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
            {cargando
              ? 'Cargando…'
              : busqueda.trim()
                ? 'Ningún cliente existente coincide — tocá "Siguiente" para crearlo como nuevo.'
                : 'Todavía no hay clientes cargados.'}
          </div>
        )}
      </div>
    </div>
  )
}
