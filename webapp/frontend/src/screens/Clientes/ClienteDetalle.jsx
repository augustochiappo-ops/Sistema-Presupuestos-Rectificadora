import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { PageHeader } from '../../components/PageHeader'
import { DataTable } from '../../components/DataTable'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { formatPrecioARS, formatFechaAR } from '../../utils/format'

export default function ClienteDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [presupuestos, setPresupuestos] = React.useState([])
  const [cargando, setCargando] = React.useState(true)

  React.useEffect(() => {
    setCargando(true)
    api.get(`/clientes/${id}/presupuestos`).then(setPresupuestos).finally(() => setCargando(false))
  }, [id])

  const nombreCliente = presupuestos[0]?.cliente || 'Cliente'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageHeader
        title={nombreCliente}
        subtitle={`${presupuestos.length} presupuesto${presupuestos.length === 1 ? '' : 's'}`}
        actions={
          <Button variant="secondary" iconLeft={<Icon n="arrow-left" s={16} />} onClick={() => navigate('/clientes')}>
            Volver a Clientes
          </Button>
        }
      />
      <DataTable
        columns={[
          { key: 'id', header: 'Nº', strong: true, width: 80, render: (v) => `#${String(v).padStart(4, '0')}` },
          { key: 'fecha', header: 'Fecha', width: 130, render: formatFechaAR },
          { key: 'motor', header: 'Motor', wrap: true },
          { key: 'total', header: 'Total', align: 'right', width: 140, render: formatPrecioARS },
        ]}
        rows={presupuestos}
        onRowClick={(p) => navigate(`/presupuestos/${p.id}`)}
        emptyMessage={cargando ? 'Cargando…' : 'Este cliente no tiene presupuestos.'}
      />
    </div>
  )
}
