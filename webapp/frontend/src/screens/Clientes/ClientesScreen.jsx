import React from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { PageHeader } from '../../components/PageHeader'
import { DataTable } from '../../components/DataTable'
import { formatFechaAR } from '../../utils/format'

export default function ClientesScreen() {
  const [clientes, setClientes] = React.useState([])
  const [cargando, setCargando] = React.useState(true)
  const navigate = useNavigate()

  React.useEffect(() => {
    api.get('/clientes').then(setClientes).finally(() => setCargando(false))
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageHeader title="Clientes" subtitle={`${clientes.length} cliente${clientes.length === 1 ? '' : 's'}`} />
      <DataTable
        columns={[
          { key: 'nombre', header: 'Nombre', strong: true },
          { key: 'total_presupuestos', header: 'Presupuestos', align: 'center', width: 130 },
          { key: 'ultimo_presupuesto', header: 'Último presupuesto', align: 'right', width: 160, render: formatFechaAR },
        ]}
        rows={clientes}
        onRowClick={(c) => navigate(`/clientes/${c.id}`)}
        emptyMessage={cargando ? 'Cargando…' : 'Todavía no hay clientes. Se crean automáticamente al hacer un presupuesto.'}
      />
    </div>
  )
}
