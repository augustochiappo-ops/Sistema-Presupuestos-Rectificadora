import React from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { PageHeader } from '../../components/PageHeader'
import { DataTable } from '../../components/DataTable'
import { StatusBadge } from '../../components/StatusBadge'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { formatPrecioARS, formatFechaAR, estadoPresupuesto } from '../../utils/format'

export default function HistorialPresupuestos() {
  const [presupuestos, setPresupuestos] = React.useState([])
  const [cargando, setCargando] = React.useState(true)
  const navigate = useNavigate()

  React.useEffect(() => {
    api.get('/presupuestos').then(setPresupuestos).finally(() => setCargando(false))
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageHeader
        title="Presupuestos"
        subtitle={`${presupuestos.length} presupuesto${presupuestos.length === 1 ? '' : 's'}`}
        actions={
          <Button variant="success" iconLeft={<Icon n="plus" s={16} />} onClick={() => navigate('/presupuestos/nuevo')}>
            Nuevo Presupuesto
          </Button>
        }
      />
      <DataTable
        columns={[
          { key: 'id', header: 'Nº', strong: true, width: 80, render: (v) => `#${String(v).padStart(4, '0')}` },
          { key: 'fecha', header: 'Fecha', width: 120, render: formatFechaAR },
          { key: 'cliente', header: 'Cliente', width: 180 },
          { key: 'motor', header: 'Motor', wrap: true },
          { key: 'total', header: 'Total', align: 'right', width: 140, render: formatPrecioARS },
          { key: 'fecha', header: 'Estado', align: 'center', width: 110, render: (v) => <StatusBadge status={estadoPresupuesto(v)} /> },
        ]}
        rows={presupuestos}
        onRowClick={(p) => navigate(`/presupuestos/${p.id}`)}
        emptyMessage={cargando ? 'Cargando…' : 'Todavía no hay presupuestos.'}
      />
    </div>
  )
}
