import React from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { PageHeader } from '../../components/PageHeader'
import { DataTable } from '../../components/DataTable'
import { StatusBadge } from '../../components/StatusBadge'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ErrorBanner } from '../../components/ErrorBanner'
import { formatPrecioARS, formatFechaAR, estadoPresupuesto } from '../../utils/format'

export default function HistorialPresupuestos() {
  const [presupuestos, setPresupuestos] = React.useState([])
  const [cargando, setCargando] = React.useState(true)
  const [aEliminar, setAEliminar] = React.useState(null)
  const [eliminando, setEliminando] = React.useState(false)
  const [error, setError] = React.useState('')
  const navigate = useNavigate()

  React.useEffect(() => {
    api.get('/presupuestos').then(setPresupuestos).finally(() => setCargando(false))
  }, [])

  const confirmarEliminar = async () => {
    setEliminando(true)
    setError('')
    try {
      await api.del(`/presupuestos/${aEliminar.id}`)
      setPresupuestos((prev) => prev.filter((p) => p.id !== aEliminar.id))
      setAEliminar(null)
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el presupuesto')
    } finally {
      setEliminando(false)
    }
  }

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
      <ErrorBanner message={error} onClose={() => setError('')} />
      <DataTable
        columns={[
          { key: 'id', header: 'Nº', strong: true, width: 80, render: (v) => `#${String(v).padStart(4, '0')}` },
          { key: 'fecha', header: 'Fecha', width: 120, render: formatFechaAR },
          { key: 'cliente', header: 'Cliente', width: 180 },
          { key: 'motor', header: 'Motor', wrap: true },
          { key: 'total', header: 'Total', align: 'right', width: 140, render: formatPrecioARS },
          // key propia (no 'fecha' de nuevo): las columnas se identifican por key
          // para poder reordenarlas, así que no puede haber dos iguales.
          { key: 'estado', header: 'Estado', align: 'center', width: 110, render: (_, row) => <StatusBadge status={estadoPresupuesto(row.fecha)} /> },
          {
            key: 'acciones', header: '', align: 'center', width: 50,
            render: (_, row) => (
              <button
                onClick={(e) => { e.stopPropagation(); setAEliminar(row) }}
                title="Eliminar presupuesto"
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }}
              >
                <Icon n="trash" s={16} />
              </button>
            ),
          },
        ]}
        reorderKey="presupuestos"
        rows={presupuestos}
        onRowClick={(p) => navigate(`/presupuestos/${p.id}`)}
        emptyMessage={cargando ? 'Cargando…' : 'Todavía no hay presupuestos.'}
      />

      <ConfirmDialog
        open={!!aEliminar}
        title="¿Eliminar presupuesto?"
        message={aEliminar ? `Se va a eliminar el presupuesto #${String(aEliminar.id).padStart(4, '0')} de ${aEliminar.cliente} junto con sus PDFs. Esta acción no se puede deshacer.` : ''}
        confirmLabel={eliminando ? 'Eliminando…' : 'Eliminar'}
        danger
        onCancel={() => setAEliminar(null)}
        onConfirm={confirmarEliminar}
      />
    </div>
  )
}
