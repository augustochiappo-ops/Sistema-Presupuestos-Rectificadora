import React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../../api/client'
import { PageHeader } from '../../components/PageHeader'
import { DataTable } from '../../components/DataTable'
import { StatusBadge } from '../../components/StatusBadge'
import { Button } from '../../components/Button'
import { TextField } from '../../components/TextField'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ErrorBanner } from '../../components/ErrorBanner'
import { formatPrecioARS, formatFechaAR, estadoPresupuesto } from '../../utils/format'

// Filtros que viven en la URL (?repuesto=...&motor=...&cliente=...&desde=...&hasta=...):
// así el estado del filtro es explícito y sobrevive un refresh de página.
function filtrosDesdeUrl(params) {
  return {
    repuesto: params.get('repuesto') || '',
    motor: params.get('motor') || '',
    cliente: params.get('cliente') || '',
    desde: params.get('desde') || '',
    hasta: params.get('hasta') || '',
  }
}

function hayFiltrosActivos(f) {
  return Boolean(f.repuesto || f.motor || f.cliente || f.desde || f.hasta)
}

function BuscarPresupuestosModal({ open, valorInicial, onCerrar, onBuscar }) {
  const [cliente, setCliente] = React.useState(valorInicial.cliente)
  const [repuesto, setRepuesto] = React.useState(valorInicial.repuesto)
  const [motor, setMotor] = React.useState(valorInicial.motor)
  const [desde, setDesde] = React.useState(valorInicial.desde)
  const [hasta, setHasta] = React.useState(valorInicial.hasta)

  React.useEffect(() => {
    if (open) {
      setCliente(valorInicial.cliente)
      setRepuesto(valorInicial.repuesto)
      setMotor(valorInicial.motor)
      setDesde(valorInicial.desde)
      setHasta(valorInicial.hasta)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const buscar = (e) => {
    e.preventDefault()
    onBuscar({ cliente: cliente.trim(), repuesto: repuesto.trim(), motor: motor.trim(), desde, hasta })
  }

  return (
    <Modal open={open} title="Buscar presupuestos" onClose={onCerrar} maxWidth={480}>
      <form onSubmit={buscar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
            Cliente (nombre o descripción interna)
          </label>
          <TextField value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Ej: Juan García" autoFocus />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
            Repuesto (código, categoría o descripción)
          </label>
          <TextField value={repuesto} onChange={(e) => setRepuesto(e.target.value)} placeholder="Ej: aros" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
            Motor
          </label>
          <TextField value={motor} onChange={(e) => setMotor(e.target.value)} placeholder="Ej: Citroen 3 CV" />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
            <label style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>Desde</label>
            <TextField type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
            <label style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>Hasta</label>
            <TextField type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
          <Button type="button" variant="secondary" onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" variant="primary" iconLeft={<Icon n="search" s={16} />}>Buscar</Button>
        </div>
      </form>
    </Modal>
  )
}

export default function HistorialPresupuestos() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filtros = filtrosDesdeUrl(searchParams)
  const filtrando = hayFiltrosActivos(filtros)

  const [presupuestos, setPresupuestos] = React.useState([])
  const [cargando, setCargando] = React.useState(true)
  const [aEliminar, setAEliminar] = React.useState(null)
  const [eliminando, setEliminando] = React.useState(false)
  const [error, setError] = React.useState('')
  const [modalBusqueda, setModalBusqueda] = React.useState(false)
  const navigate = useNavigate()

  React.useEffect(() => {
    setCargando(true)
    const params = new URLSearchParams()
    if (filtros.repuesto) params.set('repuesto', filtros.repuesto)
    if (filtros.motor) params.set('motor', filtros.motor)
    if (filtros.cliente) params.set('cliente', filtros.cliente)
    if (filtros.desde) params.set('desde', filtros.desde)
    if (filtros.hasta) params.set('hasta', filtros.hasta)
    api.get(`/presupuestos?${params.toString()}`).then(setPresupuestos).finally(() => setCargando(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros.repuesto, filtros.motor, filtros.cliente, filtros.desde, filtros.hasta])

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

  const aplicarBusqueda = (nuevos) => {
    const params = new URLSearchParams()
    if (nuevos.repuesto) params.set('repuesto', nuevos.repuesto)
    if (nuevos.motor) params.set('motor', nuevos.motor)
    if (nuevos.cliente) params.set('cliente', nuevos.cliente)
    if (nuevos.desde) params.set('desde', nuevos.desde)
    if (nuevos.hasta) params.set('hasta', nuevos.hasta)
    setSearchParams(params)
    setModalBusqueda(false)
  }

  const quitarFiltros = () => setSearchParams(new URLSearchParams())

  const descripcionFiltro = [
    filtros.cliente && `cliente "${filtros.cliente}"`,
    filtros.repuesto && `repuesto "${filtros.repuesto}"`,
    filtros.motor && `motor "${filtros.motor}"`,
    (filtros.desde || filtros.hasta) && `del ${filtros.desde ? formatFechaAR(filtros.desde) : '…'} al ${filtros.hasta ? formatFechaAR(filtros.hasta) : '…'}`,
  ].filter(Boolean).join(' · ')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageHeader
        title="Presupuestos"
        subtitle={`${presupuestos.length} presupuesto${presupuestos.length === 1 ? '' : 's'}`}
        actions={
          <>
            <Button variant="secondary" iconLeft={<Icon n="search" s={16} />} onClick={() => setModalBusqueda(true)}>
              Buscar
            </Button>
            <Button variant="success" iconLeft={<Icon n="plus" s={16} />} onClick={() => navigate('/presupuestos/nuevo')}>
              Nuevo Presupuesto
            </Button>
          </>
        }
      />
      <ErrorBanner message={error} onClose={() => setError('')} />

      {filtrando && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          padding: '10px 14px', background: 'var(--status-active-bg)', color: 'var(--status-active-fg)',
          borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
        }}>
          <span><strong>Filtrado</strong> por {descripcionFiltro}</span>
          <button
            onClick={quitarFiltros}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--status-active-fg)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, textDecoration: 'underline' }}
          >
            Quitar filtros
          </button>
        </div>
      )}

      <DataTable
        columns={[
          { key: 'id', header: 'Nº', strong: true, width: 80, render: (v) => `#${String(v).padStart(4, '0')}` },
          { key: 'fecha', header: 'Fecha', width: 120, render: formatFechaAR },
          { key: 'cliente', header: 'Cliente', width: 180 },
          { key: 'cliente_tipo', header: 'Tipo de cliente', width: 220, render: (v) => <StatusBadge status={v || 'sin_clasificar'} /> },
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
        emptyMessage={cargando ? 'Cargando…' : (filtrando ? 'Ningún presupuesto coincide con la búsqueda.' : 'Todavía no hay presupuestos.')}
      />

      <BuscarPresupuestosModal
        open={modalBusqueda}
        valorInicial={filtros}
        onCerrar={() => setModalBusqueda(false)}
        onBuscar={aplicarBusqueda}
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
