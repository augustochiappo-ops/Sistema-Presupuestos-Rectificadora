import React from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { PageHeader } from '../../components/PageHeader'
import { DataTable } from '../../components/DataTable'
import { SearchInput } from '../../components/SearchInput'
import { Icon } from '../../components/Icon'
import { formatFechaAR } from '../../utils/format'
import { puntajeCoincidenciaCliente } from '../../utils/fuzzyMatch'

export default function ClientesScreen() {
  const [clientes, setClientes] = React.useState([])
  const [cargando, setCargando] = React.useState(true)
  const [busqueda, setBusqueda] = React.useState('')
  const navigate = useNavigate()

  React.useEffect(() => {
    api.get('/clientes').then(setClientes).finally(() => setCargando(false))
  }, [])

  // Busca tanto en el nombre como en la descripción interna (notas) del
  // cliente, con el mismo matcher tolerante a nombres incompletos/errores de
  // tipeo que ya usa el paso Cliente del wizard.
  const filtrados = React.useMemo(() => {
    const q = busqueda.trim()
    if (!q) return clientes
    return clientes
      .map((c) => ({ c, score: puntajeCoincidenciaCliente(`${c.nombre} ${c.notas || ''}`, q) }))
      .filter((x) => x.score !== null)
      .sort((a, b) => a.score - b.score)
      .map((x) => x.c)
  }, [clientes, busqueda])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageHeader title="Clientes" subtitle={`${clientes.length} cliente${clientes.length === 1 ? '' : 's'}`} />
      <SearchInput
        icon={<Icon n="search" s={16} />}
        placeholder="Buscar por nombre o descripción interna…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />
      <DataTable
        columns={[
          { key: 'nombre', header: 'Nombre', strong: true },
          { key: 'total_presupuestos', header: 'Presupuestos', align: 'center', width: 130 },
          { key: 'ultimo_presupuesto', header: 'Último presupuesto', align: 'right', width: 160, render: formatFechaAR },
        ]}
        reorderKey="clientes"
        rows={filtrados}
        onRowClick={(c) => navigate(`/clientes/${c.id}`)}
        emptyMessage={cargando ? 'Cargando…' : (busqueda.trim() ? 'Ningún cliente coincide con la búsqueda.' : 'Todavía no hay clientes. Se crean automáticamente al hacer un presupuesto.')}
      />
    </div>
  )
}
