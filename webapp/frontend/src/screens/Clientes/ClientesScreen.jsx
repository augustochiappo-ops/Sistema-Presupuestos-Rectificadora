import React from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { PageHeader } from '../../components/PageHeader'
import { DataTable } from '../../components/DataTable'
import { SearchInput } from '../../components/SearchInput'
import { StatusBadge } from '../../components/StatusBadge'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ErrorBanner } from '../../components/ErrorBanner'
import { formatFechaAR } from '../../utils/format'
import { puntajeCoincidenciaCliente } from '../../utils/fuzzyMatch'
import { useUndo } from '../../context/UndoContext'

const FILTROS_TIPO = [
  { key: 'todos', label: 'Todos' },
  { key: 'mecanico', label: 'Mecánicos' },
  { key: 'dueno', label: 'Dueños de vehículo' },
]

export default function ClientesScreen() {
  const [clientes, setClientes] = React.useState([])
  const [cargando, setCargando] = React.useState(true)
  const [busqueda, setBusqueda] = React.useState('')
  const [filtroTipo, setFiltroTipo] = React.useState('todos')
  const [aEliminar, setAEliminar] = React.useState(null)
  const [error, setError] = React.useState('')
  const navigate = useNavigate()
  const { borrarConDeshacer, estaPendiente } = useUndo()

  React.useEffect(() => {
    api.get('/clientes').then(setClientes).finally(() => setCargando(false))
  }, [])

  // Lo que está esperando el "Deshacer" no se muestra (tampoco si la lista se
  // vuelve a pedir al servidor mientras el cartel sigue arriba).
  const visibles = clientes.filter((c) => !estaPendiente(`cliente:${c.id}`))

  const porTipo = React.useMemo(
    () => (filtroTipo === 'todos' ? visibles : visibles.filter((c) => c.tipo === filtroTipo)),
    [visibles, filtroTipo],
  )

  // Busca tanto en el nombre como en la descripción interna (notas) del
  // cliente, con el mismo matcher tolerante a nombres incompletos/errores de
  // tipeo que ya usa el paso Cliente del wizard.
  const filtrados = React.useMemo(() => {
    const q = busqueda.trim()
    if (!q) return porTipo
    return porTipo
      .map((c) => ({ c, score: puntajeCoincidenciaCliente(`${c.nombre} ${c.notas || ''}`, q) }))
      .filter((x) => x.score !== null)
      .sort((a, b) => a.score - b.score)
      .map((x) => x.c)
  }, [porTipo, busqueda])

  /* El cliente no se puede recuperar una vez borrado, así que el DELETE sale
     recién cuando se apaga el cartel de "Deshacer": hasta entonces la fila
     simplemente no se muestra. */
  const eliminar = () => {
    if (!aEliminar) return
    const c = aEliminar
    setAEliminar(null)
    setError('')
    borrarConDeshacer({
      mensaje: `Se eliminó a ${c.nombre}.`,
      clave: `cliente:${c.id}`,
      ejecutar: () => api.del(`/clientes/${c.id}`),
      onError: (err) => setError(err.message || 'No se pudo eliminar el cliente'),
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageHeader title="Clientes" subtitle={`${visibles.length} cliente${visibles.length === 1 ? '' : 's'}`} />

      <ErrorBanner message={error} onClose={() => setError('')} />

      <div style={{ display: 'flex', gap: 8 }}>
        {FILTROS_TIPO.map((f) => (
          <Button
            key={f.key}
            type="button"
            size="sm"
            variant={filtroTipo === f.key ? 'primary' : 'secondary'}
            onClick={() => setFiltroTipo(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <SearchInput
        icon={<Icon n="search" s={16} />}
        placeholder="Buscar por nombre o descripción interna…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />
      <DataTable
        columns={[
          { key: 'nombre', header: 'Nombre', strong: true },
          { key: 'tipo', header: 'Tipo', width: 220, render: (v) => <StatusBadge status={v || 'sin_clasificar'} /> },
          { key: 'total_presupuestos', header: 'Presupuestos', align: 'center', width: 130 },
          { key: 'ultimo_presupuesto', header: 'Último presupuesto', align: 'right', width: 160, render: formatFechaAR },
          {
            // El tacho queda deshabilitado si el cliente aparece en algún
            // presupuesto: el dato ya viene en la lista, así que el bloqueo se
            // ve antes de tocar nada (el servidor igual lo rechaza).
            key: '_eliminar', header: '', align: 'center', width: 60,
            render: (_, row) => {
              const bloqueado = row.total_presupuestos > 0
              return (
                <button
                  title={bloqueado
                    ? `Tiene ${row.total_presupuestos} presupuesto${row.total_presupuestos === 1 ? '' : 's'}: borralos primero`
                    : `Eliminar a ${row.nombre}`}
                  disabled={bloqueado}
                  onClick={(e) => { e.stopPropagation(); setError(''); setAEliminar(row) }}
                  style={{
                    border: 'none', background: 'transparent', padding: 4,
                    cursor: bloqueado ? 'not-allowed' : 'pointer',
                    color: bloqueado ? 'var(--border-default)' : 'var(--status-expired-fg)',
                    display: 'inline-flex',
                  }}
                >
                  <Icon n="trash" s={16} />
                </button>
              )
            },
          },
        ]}
        reorderKey="clientes"
        rows={filtrados}
        onRowClick={(c) => navigate(`/clientes/${c.id}`)}
        emptyMessage={cargando ? 'Cargando…' : (busqueda.trim() ? 'Ningún cliente coincide con la búsqueda.' : 'Todavía no hay clientes. Se crean automáticamente al hacer un presupuesto.')}
      />

      <ConfirmDialog
        open={Boolean(aEliminar)}
        title="¿Eliminar cliente?"
        message={`Se va a eliminar a ${aEliminar?.nombre || ''} de la lista. Vas a tener unos segundos para deshacerlo.`}
        confirmLabel="Eliminar"
        danger
        onCancel={() => setAEliminar(null)}
        onConfirm={eliminar}
      />
    </div>
  )
}
