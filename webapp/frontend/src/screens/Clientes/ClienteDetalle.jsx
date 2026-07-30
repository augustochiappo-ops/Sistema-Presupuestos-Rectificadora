import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { PageHeader } from '../../components/PageHeader'
import { DataTable } from '../../components/DataTable'
import { Button } from '../../components/Button'
import { TextField } from '../../components/TextField'
import { Icon } from '../../components/Icon'
import { ErrorBanner } from '../../components/ErrorBanner'
import { formatPrecioARS, formatFechaAR } from '../../utils/format'

export default function ClienteDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [cliente, setCliente] = React.useState(null)
  const [presupuestos, setPresupuestos] = React.useState([])
  const [cargando, setCargando] = React.useState(true)
  const [editando, setEditando] = React.useState(false)
  const [nombreEdit, setNombreEdit] = React.useState('')
  const [notasEdit, setNotasEdit] = React.useState('')
  const [guardando, setGuardando] = React.useState(false)
  const [error, setError] = React.useState('')

  const cargar = React.useCallback(() => {
    setCargando(true)
    Promise.all([
      api.get(`/clientes/${id}`),
      api.get(`/clientes/${id}/presupuestos`),
    ])
      .then(([c, p]) => { setCliente(c); setPresupuestos(p) })
      .finally(() => setCargando(false))
  }, [id])

  React.useEffect(() => { cargar() }, [cargar])

  const empezarEdicion = () => {
    setNombreEdit(cliente?.nombre || '')
    setNotasEdit(cliente?.notas || '')
    setError('')
    setEditando(true)
  }

  const guardar = async (e) => {
    e.preventDefault()
    if (!nombreEdit.trim()) return
    setGuardando(true)
    setError('')
    try {
      const actualizado = await api.put(`/clientes/${id}`, { nombre: nombreEdit.trim(), notas: notasEdit })
      setCliente(actualizado)
      setEditando(false)
    } catch (err) {
      setError(err.message || 'No se pudo guardar el cliente')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageHeader
        title={cliente?.nombre || (cargando ? 'Cargando…' : 'Cliente')}
        subtitle={`${presupuestos.length} presupuesto${presupuestos.length === 1 ? '' : 's'}`}
        actions={
          <>
            {!editando && (
              <Button variant="secondary" iconLeft={<Icon n="pencil" s={16} />} onClick={empezarEdicion}>
                Editar
              </Button>
            )}
            <Button variant="secondary" iconLeft={<Icon n="arrow-left" s={16} />} onClick={() => navigate('/clientes')}>
              Volver a Clientes
            </Button>
          </>
        }
      />

      {editando ? (
        <form
          onSubmit={guardar}
          style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', background: 'var(--surface-card)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <ErrorBanner message={error} onClose={() => setError('')} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>Nombre</label>
            <TextField value={nombreEdit} onChange={(e) => setNombreEdit(e.target.value)} autoFocus />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
              Descripción interna
            </label>
            <TextField
              as="textarea"
              rows={3}
              value={notasEdit}
              onChange={(e) => setNotasEdit(e.target.value)}
              placeholder="Notas del taller sobre este cliente (no sale en el PDF)."
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button type="submit" variant="primary" disabled={!nombreEdit.trim() || guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        cliente?.notas && (
          <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', background: 'var(--surface-card)', padding: 16 }}>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 6 }}>
              Descripción interna
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-body)', whiteSpace: 'pre-wrap' }}>
              {cliente.notas}
            </div>
          </div>
        )
      )}

      <DataTable
        columns={[
          { key: 'id', header: 'Nº', strong: true, width: 80, render: (v) => `#${String(v).padStart(4, '0')}` },
          { key: 'fecha', header: 'Fecha', width: 130, render: formatFechaAR },
          { key: 'motor', header: 'Motor', wrap: true },
          { key: 'total', header: 'Total', align: 'right', width: 140, render: formatPrecioARS },
        ]}
        reorderKey="cliente-presupuestos"
        rows={presupuestos}
        onRowClick={(p) => navigate(`/presupuestos/${p.id}`)}
        emptyMessage={cargando ? 'Cargando…' : 'Este cliente no tiene presupuestos.'}
      />
    </div>
  )
}
