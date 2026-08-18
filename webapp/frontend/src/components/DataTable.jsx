import React from 'react'

const PREFIJO_ORDEN = 'tabla-orden:'

function leerOrden(reorderKey) {
  if (!reorderKey) return null
  try {
    const guardado = JSON.parse(localStorage.getItem(PREFIJO_ORDEN + reorderKey))
    return Array.isArray(guardado) ? guardado : null
  } catch {
    return null
  }
}

function guardarOrden(reorderKey, keys) {
  try {
    if (keys) localStorage.setItem(PREFIJO_ORDEN + reorderKey, JSON.stringify(keys))
    else localStorage.removeItem(PREFIJO_ORDEN + reorderKey)
  } catch {
    // localStorage lleno o bloqueado: el orden vale solo para esta pantalla.
  }
}

/*
 * Aplica el orden guardado sin confiar en que coincida con las columnas de hoy:
 * se ignoran las keys que ya no existen y las columnas nuevas quedan al final,
 * así un cambio de columnas nunca deja la tabla rota ni vacía.
 */
function aplicarOrden(columns, orden) {
  if (!orden) return columns
  const porKey = new Map(columns.map((c) => [c.key, c]))
  // Sin keys únicas no se puede reordenar sin perder columnas (hay tablas que
  // muestran el mismo campo dos veces): se deja el orden original.
  if (porKey.size !== columns.length) return columns
  const ordenadas = orden.map((k) => porKey.get(k)).filter(Boolean)
  const yaPuestas = new Set(ordenadas.map((c) => c.key))
  return [...ordenadas, ...columns.filter((c) => !yaPuestas.has(c.key))]
}

/*
 * getRowProps(row): props extra para el <tr> de cada fila. Se usa para hacer
 * arrastrables las filas (los opcionales del presupuesto se mueven arrastrando
 * de una caja a la otra); la tabla no sabe nada de eso, solo las reparte.
 */
export function DataTable({ columns = [], rows = [], onRowClick, emptyMessage = 'No hay datos para mostrar.', style, striped = false, reorderKey, getRowBackground, getRowProps, ...rest }) {
  const [hover, setHover] = React.useState(-1)
  const [orden, setOrden] = React.useState(() => leerOrden(reorderKey))
  const [arrastrando, setArrastrando] = React.useState(null)
  const [destino, setDestino] = React.useState(null)

  React.useEffect(() => { setOrden(leerOrden(reorderKey)) }, [reorderKey])

  const cols = React.useMemo(() => aplicarOrden(columns, orden), [columns, orden])

  const soltar = (indiceDestino) => {
    setDestino(null)
    setArrastrando(null)
    if (arrastrando === null || arrastrando === indiceDestino) return
    const nuevas = [...cols]
    const [movida] = nuevas.splice(arrastrando, 1)
    nuevas.splice(indiceDestino, 0, movida)
    const keys = nuevas.map((c) => c.key)
    setOrden(keys)
    guardarOrden(reorderKey, keys)
  }

  const restablecer = () => {
    setOrden(null)
    guardarOrden(reorderKey, null)
  }

  if (rows.length === 0) {
    return (
      <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', background: 'var(--surface-card)', padding: '48px 20px', textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-faint)', ...style }}>
        {emptyMessage}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      {reorderKey && orden && (
        <button
          onClick={restablecer}
          style={{
            alignSelf: 'flex-end', border: 'none', background: 'transparent', cursor: 'pointer',
            padding: 0, fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-faint)',
          }}
        >
          ↺ Orden original de las columnas
        </button>
      )}

      <div style={{ overflow: 'auto', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', background: 'var(--surface-card)', ...style }} {...rest}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-body)', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              {cols.map((c, i) => (
                <th
                  key={i}
                  draggable={Boolean(reorderKey)}
                  onDragStart={reorderKey ? (e) => { setArrastrando(i); e.dataTransfer.effectAllowed = 'move' } : undefined}
                  onDragOver={reorderKey ? (e) => { e.preventDefault(); setDestino(i) } : undefined}
                  onDragEnd={reorderKey ? () => { setArrastrando(null); setDestino(null) } : undefined}
                  onDrop={reorderKey ? (e) => { e.preventDefault(); soltar(i) } : undefined}
                  title={reorderKey ? 'Arrastrá para mover la columna' : undefined}
                  style={{
                    textAlign: c.align || 'left', padding: '14px 14px',
                    fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)',
                    color: 'var(--text-muted)', borderBottom: '1px solid var(--border-default)',
                    width: c.width, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    cursor: reorderKey ? 'grab' : 'default',
                    opacity: arrastrando === i ? 0.4 : 1,
                    // Línea de inserción: a la izquierda si la columna viaja hacia
                    // atrás, a la derecha si viaja hacia adelante.
                    boxShadow: destino === i && arrastrando !== null && arrastrando !== i
                      ? (arrastrando > i ? 'inset 2px 0 0 var(--text-strong)' : 'inset -2px 0 0 var(--text-strong)')
                      : 'none',
                    userSelect: 'none',
                  }}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              // El style que venga en getRowProps se MEZCLA con el de la fila
              // (no lo pisa): así una fila arrastrable puede cambiar el cursor
              // sin perder el fondo de hover.
              const { style: styleFila, ...propsFila } = getRowProps?.(row) || {}
              return (
              <tr
                key={row.id ?? ri}
                {...propsFila}
                onMouseEnter={() => setHover(ri)}
                onMouseLeave={() => setHover(-1)}
                onClick={() => onRowClick && onRowClick(row, ri)}
                style={{
                  background: hover === ri
                    ? 'var(--surface-sunken)'
                    : (getRowBackground?.(row) || (striped && ri % 2 === 1 ? 'var(--surface-stripe)' : 'transparent')),
                  cursor: onRowClick ? 'pointer' : 'default',
                  transition: 'background .12s ease',
                  ...styleFila,
                }}
              >
                {cols.map((c, ci) => (
                  <td key={ci} style={{
                    textAlign: c.align || 'left', padding: '13px 14px',
                    fontSize: 'var(--text-sm)', color: c.strong ? 'var(--text-strong)' : 'var(--text-body)',
                    fontWeight: c.strong ? 'var(--weight-semibold)' : 'var(--weight-regular)',
                    borderBottom: ri < rows.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                    whiteSpace: c.wrap ? 'normal' : 'nowrap',
                    overflow: c.wrap ? 'visible' : 'hidden',
                    textOverflow: c.wrap ? 'clip' : 'ellipsis',
                    overflowWrap: c.wrap ? 'anywhere' : 'normal',
                  }}>{c.render ? c.render(row[c.key], row) : row[c.key]}</td>
                ))}
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
