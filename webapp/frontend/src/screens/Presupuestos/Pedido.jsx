import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { PageHeader } from '../../components/PageHeader'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { StatusBadge } from '../../components/StatusBadge'
import { formatPrecioARS, formatFechaAR } from '../../utils/format'

/*
 * "Pedido de repuestos": qué hay que ir a comprar una vez que el cliente aprobó.
 *
 * A diferencia del presupuesto, que congela los precios al cotizar, acá todo se
 * muestra con el precio y el stock de HOY — es el momento de decidir a quién se
 * le compra. Cada grupo lista todas las marcas que sirven para ese motor, con
 * las medidas debajo, de la más barata a la más cara.
 *
 * Pantalla interna: el cliente nunca la ve, así que acá sí aparecen códigos,
 * marcas y precios de costo.
 */
export default function PedidoRepuestos() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [datos, setDatos] = React.useState(null)
  const [error, setError] = React.useState('')
  const [elegidas, setElegidas] = React.useState({})   // grupo_num → código a pedir
  const [copiado, setCopiado] = React.useState(false)

  React.useEffect(() => {
    api.get(`/presupuestos/${id}/pedido`)
      .then((d) => {
        setDatos(d)
        // Arranca preseleccionado lo más barato con stock de cada grupo: es lo
        // que uno pediría por defecto. Se cambia con un click.
        const inicial = {}
        d.grupos.forEach((g) => { if (g.mas_barata_codigo) inicial[g.grupo_num] = g.mas_barata_codigo })
        setElegidas(inicial)
      })
      .catch((err) => setError(err.message || 'No se pudo cargar el pedido'))
  }, [id])

  const codigosAPedir = React.useMemo(() => {
    if (!datos) return []
    return datos.grupos
      .map((g) => elegidas[g.grupo_num])
      .filter(Boolean)
  }, [datos, elegidas])

  const copiarCodigos = async () => {
    const texto = codigosAPedir.join('\n')
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      setError('No se pudieron copiar los códigos. Seleccionalos a mano de la lista.')
    }
  }

  const totalAPedir = React.useMemo(() => {
    if (!datos) return 0
    return datos.grupos.reduce((acc, g) => {
      const codigo = elegidas[g.grupo_num]
      const opcion = g.marcas.flatMap((m) => m.medidas).find((o) => o.repuesto_codigo === codigo)
      return acc + (opcion?.subtotal_hoy || 0)
    }, 0)
  }, [datos, elegidas])

  if (error && !datos) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontFamily: 'var(--font-body)', color: 'var(--status-expired-fg)' }}>{error}</div>
        <Button variant="secondary" onClick={() => navigate(-1)}>Volver</Button>
      </div>
    )
  }
  if (!datos) return <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Cargando…</div>

  const p = datos.presupuesto
  const sinRepuestos = datos.grupos.length === 0
  const gruposSinStock = datos.grupos.filter((g) => g.sin_stock_total)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Pedido de repuestos"
        subtitle={`Presupuesto #${String(p.id).padStart(4, '0')} · ${p.cliente} · ${p.motor}`}
        actions={
          <>
            <Button variant="secondary" iconLeft={<Icon n="arrow-left" s={16} />} onClick={() => navigate(`/presupuestos/${id}`)}>
              Volver al presupuesto
            </Button>
            <Button
              variant="primary"
              iconLeft={<Icon n="copy" s={16} />}
              disabled={!codigosAPedir.length}
              onClick={copiarCodigos}
            >
              {copiado ? '¡Copiado!' : `Copiar códigos (${codigosAPedir.length})`}
            </Button>
          </>
        }
      />

      {error && (
        <div style={{ padding: '10px 14px', background: 'var(--status-expired-bg)', color: 'var(--status-expired-fg)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
          {error}
        </div>
      )}

      {/* Números de la operación. El margen real sale de comparar lo que se
          cotizó (siempre el más caro) contra lo que se va a pagar de verdad. */}
      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', padding: '18px 22px', background: 'var(--surface-inverse)', borderRadius: 'var(--radius-xl)' }}>
        <Cifra label="Cotizado al cliente" valor={formatPrecioARS(datos.total_cotizado)} />
        <Cifra label="Comprando lo elegido" valor={formatPrecioARS(totalAPedir)} />
        <Cifra
          label="Diferencia a favor"
          valor={formatPrecioARS(Math.max(0, datos.total_cotizado - totalAPedir))}
          destacado
        />
        <div style={{ marginLeft: 'auto', alignSelf: 'flex-end', fontFamily: 'var(--font-body)', fontSize: 12, color: 'rgba(255,255,255,.6)' }}>
          {datos.catalogo.importado_en
            ? `Precios del proveedor actualizados el ${formatFechaHora(datos.catalogo.importado_en)}`
            : 'Todavía no se cargó la lista del proveedor'}
        </div>
      </div>

      {gruposSinStock.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
          background: 'var(--status-expired-bg)', color: 'var(--status-expired-fg)',
          borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
        }}>
          <Icon n="alert-triangle" s={16} />
          <span>
            <strong>Sin stock en ninguna marca:</strong> {gruposSinStock.map((g) => g.categoria).join(' · ')}.
            Hay que conseguirlos por otro lado.
          </span>
        </div>
      )}

      {sinRepuestos && (
        <div style={{ padding: '18px 22px', background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
          Este presupuesto no tiene grupos de repuestos cargados.
        </div>
      )}

      {datos.grupos.map((g) => (
        <GrupoPedido
          key={g.grupo_num}
          grupo={g}
          elegida={elegidas[g.grupo_num]}
          onElegir={(codigo) => setElegidas((prev) => ({ ...prev, [g.grupo_num]: codigo }))}
        />
      ))}
    </div>
  )
}

function Cifra({ label, valor, destacado }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,.6)' }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'var(--font-display)', fontSize: destacado ? 'var(--text-xl)' : 'var(--text-lg)',
        fontWeight: 700, color: '#fff', marginTop: 2,
      }}>
        {valor}
      </div>
    </div>
  )
}

function GrupoPedido({ grupo, elegida, onElegir }) {
  return (
    <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', background: 'var(--surface-card)', overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: '14px 18px', background: 'var(--surface-sunken)', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--text-strong)' }}>
            {grupo.categoria}
          </span>
          {grupo.sin_stock_total && <StatusBadge status="expired">Sin stock en ninguna marca</StatusBadge>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
          <span style={{ color: 'var(--text-muted)' }}>
            Cotizado <strong style={{ color: 'var(--text-strong)' }}>{formatPrecioARS(grupo.cotizado)}</strong>
          </span>
          {grupo.ahorro > 0 && (
            <span style={{ color: 'var(--status-active-fg)' }}>
              Ahorro potencial <strong>{formatPrecioARS(grupo.ahorro)}</strong>
            </span>
          )}
        </div>
      </div>

      <div style={{ padding: '6px 0' }}>
        {grupo.marcas.map((marca) => (
          <div key={marca.marca} style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px 4px',
              fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-strong)',
            }}>
              {marca.marca}
              {!marca.hay_stock && <StatusBadge status="expired">Sin stock</StatusBadge>}
              {marca.tiene_elegida && <StatusBadge status="pending">Es la que se cotizó</StatusBadge>}
              <span style={{ marginLeft: 'auto', fontWeight: 400, color: 'var(--text-faint)', fontSize: 12 }}>
                desde {marca.desde ? formatPrecioARS(marca.desde) : '—'}
              </span>
            </div>

            {marca.medidas.map((op) => {
              const seleccionada = elegida === op.repuesto_codigo
              return (
                <button
                  key={op.repuesto_codigo || op.descripcion}
                  onClick={() => onElegir(op.repuesto_codigo)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                    padding: '8px 18px', border: 'none', cursor: 'pointer',
                    background: seleccionada ? 'var(--status-active-bg)' : 'transparent',
                    fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-body)',
                  }}
                >
                  <span style={{
                    width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${seleccionada ? 'var(--status-active-fg)' : 'var(--border-default)'}`,
                    background: seleccionada ? 'var(--status-active-fg)' : 'transparent',
                  }} />
                  <span style={{ width: 70, flexShrink: 0, fontWeight: 600, color: 'var(--text-strong)' }}>
                    {op.medida || '—'}
                  </span>
                  <span style={{ width: 150, flexShrink: 0, color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>
                    {op.repuesto_codigo}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>{op.descripcion}</span>
                  {!op.en_catalogo && <StatusBadge status="expired">Ya no está en la lista</StatusBadge>}
                  {op.en_catalogo && (
                    <StatusBadge status={op.hay_stock ? 'active' : 'expired'}>
                      {op.hay_stock ? 'Con stock' : 'Sin stock'}
                    </StatusBadge>
                  )}
                  <span style={{ width: 70, textAlign: 'right', flexShrink: 0, color: 'var(--text-faint)' }}>
                    ×{op.cantidad}
                  </span>
                  <span style={{ width: 130, textAlign: 'right', flexShrink: 0, fontWeight: 600, color: 'var(--text-strong)' }}>
                    {op.subtotal_hoy ? formatPrecioARS(op.subtotal_hoy) : '—'}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// El backend guarda un ISO con hora; en pantalla alcanza fecha y hora corta.
function formatFechaHora(iso) {
  if (!iso) return '—'
  const [fecha, hora] = iso.split('T')
  return `${formatFechaAR(fecha)}${hora ? ` a las ${hora.slice(0, 5)}` : ''}`
}
