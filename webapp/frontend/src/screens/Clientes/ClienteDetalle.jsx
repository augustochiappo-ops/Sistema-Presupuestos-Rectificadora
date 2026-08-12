import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { PageHeader } from '../../components/PageHeader'
import { DataTable } from '../../components/DataTable'
import { Button } from '../../components/Button'
import { TextField } from '../../components/TextField'
import { StatusBadge } from '../../components/StatusBadge'
import { Icon } from '../../components/Icon'
import { ErrorBanner } from '../../components/ErrorBanner'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { formatPrecioARS, formatFechaAR } from '../../utils/format'
import { useUndo } from '../../context/UndoContext'

const TIPO_LABEL = { mecanico: 'Mecánico', dueno: 'Dueño del vehículo' }

export default function ClienteDetalle() {
  const { id } = useParams()
  const { borrarConDeshacer } = useUndo()
  const navigate = useNavigate()
  const [cliente, setCliente] = React.useState(null)
  const [presupuestos, setPresupuestos] = React.useState([])
  const [cargando, setCargando] = React.useState(true)
  const [editando, setEditando] = React.useState(false)
  const [nombreEdit, setNombreEdit] = React.useState('')
  const [notasEdit, setNotasEdit] = React.useState('')
  const [tipoEdit, setTipoEdit] = React.useState('')
  const [guardando, setGuardando] = React.useState(false)
  const [error, setError] = React.useState('')
  const [confirmarEliminar, setConfirmarEliminar] = React.useState(false)

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
    setTipoEdit(cliente?.tipo || '')
    setError('')
    setEditando(true)
  }

  const guardar = async (e) => {
    e.preventDefault()
    if (!nombreEdit.trim()) return
    setGuardando(true)
    setError('')
    try {
      const actualizado = await api.put(`/clientes/${id}`, { nombre: nombreEdit.trim(), notas: notasEdit, tipo: tipoEdit || null })
      setCliente(actualizado)
      setEditando(false)
    } catch (err) {
      setError(err.message || 'No se pudo guardar el cliente')
    } finally {
      setGuardando(false)
    }
  }

  // El borrado se bloquea si el cliente aparece en algún presupuesto (propio o
  // como contraparte). Los presupuestos ya están listados abajo en esta misma
  // pantalla, así que el aviso alcanza para saber qué hay que borrar antes.
  const eliminar = async () => {
    setConfirmarEliminar(false)
    // El borrado es diferido (quedan unos segundos para deshacerlo), así que el
    // bloqueo del servidor —un cliente que figura en algún presupuesto no se
    // puede borrar— se chequea ANTES de salir de la pantalla: si no, el aviso
    // llegaría con la ficha ya cerrada. Es la misma cuenta que hace el backend
    // (presupuestos propios + aquellos donde figura como contraparte).
    try {
      const ps = await api.get(`/clientes/${id}/presupuestos`)
      if (ps.length) {
        setError(`Este cliente tiene ${ps.length} presupuesto${ps.length === 1 ? '' : 's'}. `
          + 'Borralos primero y después vas a poder borrar el cliente.')
        return
      }
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el cliente')
      return
    }
    borrarConDeshacer({
      mensaje: `Se eliminó a ${cliente?.nombre || 'el cliente'}.`,
      clave: `cliente:${id}`,
      ejecutar: () => api.del(`/clientes/${id}`),
    })
    navigate('/clientes')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageHeader
        title={cliente?.nombre || (cargando ? 'Cargando…' : 'Cliente')}
        subtitle={cliente && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {`${presupuestos.length} presupuesto${presupuestos.length === 1 ? '' : 's'}`}
            <StatusBadge status={cliente.tipo || 'sin_clasificar'} />
          </span>
        )}
        actions={
          <>
            {!editando && (
              <Button variant="secondary" iconLeft={<Icon n="pencil" s={16} />} onClick={empezarEdicion}>
                Editar
              </Button>
            )}
            {!editando && cliente && (
              <Button variant="danger" iconLeft={<Icon n="trash" s={16} />} onClick={() => { setError(''); setConfirmarEliminar(true) }}>
                Eliminar
              </Button>
            )}
            <Button variant="secondary" iconLeft={<Icon n="arrow-left" s={16} />} onClick={() => navigate('/clientes')}>
              Volver a Clientes
            </Button>
          </>
        }
      />

      {/* Fuera del formulario: los errores de borrado también tienen que verse
          cuando no se está editando. */}
      {!editando && <ErrorBanner message={error} onClose={() => setError('')} />}

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
            <label style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>Tipo</label>
            <select
              value={tipoEdit}
              onChange={(e) => setTipoEdit(e.target.value)}
              style={{
                width: '100%', height: 42, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
                padding: '0 14px', background: 'var(--surface-card)', color: 'var(--text-strong)',
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', outline: 'none',
              }}
            >
              <option value="">Sin clasificar</option>
              <option value="mecanico">{TIPO_LABEL.mecanico}</option>
              <option value="dueno">{TIPO_LABEL.dueno}</option>
            </select>
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
          {
            key: 'cliente', header: 'Vínculo', width: 200, wrap: true,
            render: (v, row) => (row.rol === 'contacto' ? `Contraparte de ${v}` : '—'),
          },
          { key: 'total', header: 'Total', align: 'right', width: 140, render: formatPrecioARS },
        ]}
        reorderKey="cliente-presupuestos"
        rows={presupuestos}
        onRowClick={(p) => navigate(`/presupuestos/${p.id}`)}
        emptyMessage={cargando ? 'Cargando…' : 'Este cliente no tiene presupuestos.'}
      />

      <ConfirmDialog
        open={confirmarEliminar}
        title="¿Eliminar cliente?"
        message={`Se va a eliminar a ${cliente?.nombre || 'este cliente'} de la lista. Vas a tener unos segundos para deshacerlo.`}
        confirmLabel="Eliminar"
        danger
        onCancel={() => setConfirmarEliminar(false)}
        onConfirm={eliminar}
      />
    </div>
  )
}
