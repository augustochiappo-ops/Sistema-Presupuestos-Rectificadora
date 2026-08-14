import React from 'react'
import { api } from '../../../api/client'
import { Modal } from '../../../components/Modal'
import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import { StatusBadge } from '../../../components/StatusBadge'
import { CodigoRepuesto } from '../../../components/CodigoRepuesto'
import { formatPrecioARS, formatFechaAR } from '../../../utils/format'

/*
 * "Repuestos ya utilizados" — el atajo para no volver a armar a mano lo que ya
 * se armó una vez para este motor.
 *
 * Dos pantallas: la lista de presupuestos anteriores del motor, y adentro de
 * cada uno, sus repuestos con la cantidad que llevaron. Nada entra solo: todo
 * arranca destildado y se agrega lo que se elige. Se pueden abrir varios
 * presupuestos seguidos e ir sumando de a poco.
 *
 * Los precios que se muestran (y los que se agregan) son los de HOY, no los que
 * tenía aquel presupuesto: éste es un presupuesto nuevo. Lo que cambió respecto
 * de aquel día se avisa por renglón.
 */
export function ModalRepuestosUsados({ open, motorId, onClose, onAgregar }) {
  const [presupuestos, setPresupuestos] = React.useState(null)
  const [abierto, setAbierto] = React.useState(null)   // { id, fecha, cliente }
  const [grupos, setGrupos] = React.useState(null)
  const [elegidos, setElegidos] = React.useState([])
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    if (!open || !motorId) return
    setAbierto(null)
    setGrupos(null)
    setElegidos([])
    setError('')
    api.get(`/motores/${motorId}/presupuestos-repuestos`)
      .then(setPresupuestos)
      .catch(() => setError('No se pudieron cargar los presupuestos anteriores'))
  }, [open, motorId])

  const abrirPresupuesto = async (p) => {
    setAbierto(p)
    setGrupos(null)
    setElegidos([])
    try {
      setGrupos(await api.get(`/presupuestos/${p.id}/grupos`))
    } catch {
      setError('No se pudo abrir ese presupuesto')
    }
  }

  // Una fila por opción congelada, con el precio y el stock de hoy al lado.
  const filas = React.useMemo(() => (grupos || []).flatMap((g) => g.opciones.map((o) => {
    const enCatalogo = o.stock_actual !== null && o.stock_actual !== undefined
    return {
      codigo: o.repuesto_codigo,
      descripcion: o.descripcion,
      categoria: g.categoria,
      marca: o.marca,
      medida: o.medida,
      base_codigo: o.base_codigo,
      cantidad: o.cantidad,
      precioCotizado: o.precio_unitario,
      precioHoy: enCatalogo ? o.precio_actual : o.precio_unitario,
      stockHoy: enCatalogo ? o.stock_actual : null,
      enCatalogo,
    }
  })).filter((f) => f.codigo), [grupos])

  const alternar = (codigo) => setElegidos((actual) => (
    actual.includes(codigo) ? actual.filter((c) => c !== codigo) : [...actual, codigo]
  ))

  const agregar = () => {
    const seleccion = filas.filter((f) => elegidos.includes(f.codigo))
    if (!seleccion.length) return
    onAgregar(seleccion)
    setElegidos([])
  }

  const volverALista = () => { setAbierto(null); setGrupos(null); setElegidos([]) }

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth={1000}
      title={abierto
        ? `Presupuesto #${String(abierto.id).padStart(4, '0')} — ${abierto.cliente}`
        : 'Repuestos ya utilizados en este motor'}
    >
      {error && (
        <div style={{ marginBottom: 12, color: 'var(--status-expired-fg)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
          {error}
        </div>
      )}

      {!abierto && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {presupuestos === null && !error && (
            <div style={{ fontFamily: 'var(--font-body)', color: 'var(--text-faint)' }}>Cargando…</div>
          )}
          {presupuestos?.length === 0 && (
            <div style={{ fontFamily: 'var(--font-body)', color: 'var(--text-faint)' }}>
              Este motor todavía no tiene presupuestos con repuestos. Cargalos desde el catálogo y la próxima
              vez van a aparecer acá.
            </div>
          )}
          {(presupuestos || []).map((p) => (
            <button
              key={p.id}
              onClick={() => abrirPresupuesto(p)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                padding: '12px 14px', border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)', background: 'var(--surface-card)', cursor: 'pointer',
                fontFamily: 'var(--font-body)', color: 'var(--text-strong)',
              }}
            >
              <span style={{ fontWeight: 'var(--weight-bold)', minWidth: 68 }}>
                #{String(p.id).padStart(4, '0')}
              </span>
              <span style={{ minWidth: 100, color: 'var(--text-muted)' }}>{formatFechaAR(p.fecha)}</span>
              <span style={{ flex: 1, minWidth: 0 }}>{p.cliente}</span>
              <StatusBadge status="pending">
                {p.repuestos} repuesto{p.repuestos === 1 ? '' : 's'}
              </StatusBadge>
              {p.aprobado_en && <StatusBadge status="active">Aprobado</StatusBadge>}
              <span style={{ fontWeight: 600, minWidth: 120, textAlign: 'right' }}>
                {formatPrecioARS(p.total)}
              </span>
              <Icon n="chevron-right" s={16} />
            </button>
          ))}
        </div>
      )}

      {abierto && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Button variant="secondary" iconLeft={<Icon n="arrow-left" s={16} />} onClick={volverALista}>
              Ver otros presupuestos
            </Button>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              {formatFechaAR(abierto.fecha)} · precios de hoy · elegí lo que quieras traer
            </span>
            {filas.length > 0 && (
              <button
                onClick={() => setElegidos(elegidos.length === filas.length ? [] : filas.map((f) => f.codigo))}
                style={{
                  marginLeft: 'auto', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
                  fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
                }}
              >
                {elegidos.length === filas.length ? 'Destildar todos' : 'Seleccionar todos'}
              </button>
            )}
          </div>

          {grupos === null && !error && (
            <div style={{ fontFamily: 'var(--font-body)', color: 'var(--text-faint)' }}>Cargando…</div>
          )}

          {filas.map((f) => {
            const elegido = elegidos.includes(f.codigo)
            const cambioPrecio = f.enCatalogo && f.precioHoy !== f.precioCotizado
            return (
              <label
                key={f.codigo}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                  borderRadius: 'var(--radius-md)', cursor: 'pointer',
                  background: elegido ? 'var(--surface-sunken)' : 'transparent',
                }}
              >
                <input type="checkbox" checked={elegido} onChange={() => alternar(f.codigo)} />
                <span style={{ width: 140, flexShrink: 0 }}>
                  <CodigoRepuesto size={12}>{f.codigo}</CodigoRepuesto>
                </span>
                <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>
                  <span style={{ fontWeight: 'var(--weight-bold)' }}>{f.descripcion}</span>
                  <span style={{ color: 'var(--text-faint)' }}>
                    {' · '}{f.categoria}{f.marca ? ` · ${f.marca}` : ''}
                  </span>
                </span>
                {f.medida && <StatusBadge status="pending">{f.medida}</StatusBadge>}
                <StatusBadge status="active">×{f.cantidad}</StatusBadge>
                {!f.enCatalogo && <StatusBadge status="aviso">Ya no está en el catálogo</StatusBadge>}
                {f.stockHoy === 0 && <StatusBadge status="expired">Sin stock</StatusBadge>}
                {cambioPrecio && (
                  <StatusBadge status="aviso" title={`Se cotizó a ${formatPrecioARS(f.precioCotizado)}`}>
                    Cambió el precio
                  </StatusBadge>
                )}
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, width: 110, textAlign: 'right' }}>
                  {f.precioHoy ? formatPrecioARS(f.precioHoy) : '—'}
                </span>
              </label>
            )
          })}

          {grupos !== null && filas.length === 0 && (
            <div style={{ fontFamily: 'var(--font-body)', color: 'var(--text-faint)' }}>
              Ese presupuesto no tiene repuestos de catálogo.
            </div>
          )}

          {filas.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
              <Button variant="primary" disabled={!elegidos.length} onClick={agregar}>
                Agregar los seleccionados{elegidos.length ? ` (${elegidos.length})` : ''}
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
