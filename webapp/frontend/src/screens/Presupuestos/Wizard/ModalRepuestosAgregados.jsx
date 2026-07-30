import React from 'react'
import { TextField } from '../../../components/TextField'
import { StatusBadge } from '../../../components/StatusBadge'
import { Icon } from '../../../components/Icon'
import { formatPrecioARS } from '../../../utils/format'

const COLUMNAS = [
  { key: 'categoria', header: 'Categoría' },
  { key: 'repuesto_codigo', header: 'Código' },
  { key: 'descripcion', header: 'Descripción' },
  { key: 'marca', header: 'Marca' },
  { key: 'precio_unitario', header: 'P. unitario', align: 'right' },
  { key: 'cantidad', header: 'Cantidad', align: 'right' },
  { key: 'subtotal', header: 'Subtotal', align: 'right' },
]

// Valor comparable para cada columna: texto en minúscula para las de texto,
// número para las numéricas (subtotal se deriva, no está en el objeto).
function valorOrden(item, key) {
  switch (key) {
    case 'subtotal': return (item.precio_unitario || 0) * (item.cantidad || 0)
    case 'precio_unitario': return item.precio_unitario || 0
    case 'cantidad': return item.cantidad || 0
    case 'categoria': return (item.categoria || item.descripcion || '').toLowerCase()
    case 'repuesto_codigo': return (item.repuesto_codigo || '').toLowerCase()
    case 'marca': return (item.marca || '').toLowerCase()
    default: return (item.descripcion || '').toLowerCase()
  }
}

const botonCantidad = {
  width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border-default)',
  background: 'var(--surface-card)', cursor: 'pointer', fontSize: 15, lineHeight: 1,
  color: 'var(--text-strong)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
}

const celda = {
  padding: '10px 12px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
  color: 'var(--text-body)', borderBottom: '1px solid var(--border-subtle)', verticalAlign: 'middle',
}

/*
 * Pop-up "Ver repuestos": reemplaza a la vieja sección "Repuestos agregados"
 * del paso Repuestos del wizard. Editable (cantidad, precio unitario) +
 * eliminar, con columnas ordenables por clic en el encabezado.
 */
export function ModalRepuestosAgregados({ open, items, onCambiarCantidad, onCambiarPrecio, onQuitar, onClose }) {
  const [sortKey, setSortKey] = React.useState(null)
  const [sortDir, setSortDir] = React.useState('asc')

  const filas = React.useMemo(() => {
    if (!sortKey) return items
    return [...items].sort((a, b) => {
      const va = valorOrden(a, sortKey)
      const vb = valorOrden(b, sortKey)
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [items, sortKey, sortDir])

  if (!open) return null

  const ordenarPor = (key) => {
    if (sortKey === key) { setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); return }
    setSortKey(key)
    setSortDir('asc')
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,22,25,.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
        boxSizing: 'border-box',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 1140, maxHeight: '86vh', background: 'var(--surface-card)',
          borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--border-subtle)' }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-lg)', color: 'var(--text-strong)' }}>
            Repuestos agregados
          </h3>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }}>
            <Icon n="x" s={20} />
          </button>
        </div>

        <div style={{ overflow: 'auto', padding: items.length === 0 ? '0 22px 22px' : '0' }}>
          {items.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-faint)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
              Todavía no agregaste repuestos.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {COLUMNAS.map((c) => (
                    <th
                      key={c.key}
                      onClick={() => ordenarPor(c.key)}
                      title="Ordenar"
                      style={{
                        textAlign: c.align || 'left', padding: '12px', whiteSpace: 'nowrap',
                        fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600,
                        color: 'var(--text-muted)', borderBottom: '1px solid var(--border-default)',
                        cursor: 'pointer', userSelect: 'none', background: 'var(--surface-card)',
                        position: 'sticky', top: 0,
                      }}
                    >
                      {c.header}{sortKey === c.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                  ))}
                  <th style={{ width: 40, borderBottom: '1px solid var(--border-default)', background: 'var(--surface-card)', position: 'sticky', top: 0 }} />
                </tr>
              </thead>
              <tbody>
                {filas.map((it) => (
                  <tr key={it.key}>
                    <td style={celda}>{it.categoria || it.descripcion}</td>
                    <td style={{ ...celda, whiteSpace: 'nowrap' }}>{it.repuesto_codigo || '—'}</td>
                    <td style={{ ...celda, minWidth: 200 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{it.descripcion}</span>
                        {it.stock === 0 && <StatusBadge status="expired">Sin stock — sujeto a disponibilidad</StatusBadge>}
                      </div>
                    </td>
                    <td style={{ ...celda, whiteSpace: 'nowrap' }}>{it.marca || '—'}</td>
                    <td style={{ ...celda, textAlign: 'right' }}>
                      <TextField
                        placeholder="Precio unit."
                        value={it.precioTexto}
                        onChange={(e) => onCambiarPrecio(it.key, e.target.value)}
                        style={{ width: 120, borderColor: it.precio_unitario === null ? 'var(--status-expired-fg)' : undefined }}
                      />
                    </td>
                    <td style={{ ...celda, textAlign: 'right' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <button style={botonCantidad} onClick={() => onCambiarCantidad(it.key, Math.max(0, (it.cantidad || 0) - 1))}>−</button>
                        <input
                          type="number" min="0" step="1" value={it.cantidad}
                          onChange={(e) => onCambiarCantidad(it.key, parseFloat(e.target.value))}
                          style={{
                            width: 56, height: 28, textAlign: 'center', borderRadius: 8,
                            border: `1px solid ${it.cantidad > 0 ? 'var(--border-default)' : 'var(--status-expired-fg)'}`,
                            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', background: 'var(--surface-card)', color: 'var(--text-strong)',
                          }}
                        />
                        <button style={botonCantidad} onClick={() => onCambiarCantidad(it.key, (it.cantidad || 0) + 1)}>+</button>
                      </span>
                    </td>
                    <td style={{ ...celda, textAlign: 'right', fontWeight: 700, color: 'var(--text-strong)', whiteSpace: 'nowrap' }}>
                      {formatPrecioARS((it.precio_unitario || 0) * (it.cantidad || 0))}
                    </td>
                    <td style={{ ...celda, textAlign: 'center' }}>
                      <button onClick={() => onQuitar(it.key)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }}>
                        <Icon n="trash" s={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
