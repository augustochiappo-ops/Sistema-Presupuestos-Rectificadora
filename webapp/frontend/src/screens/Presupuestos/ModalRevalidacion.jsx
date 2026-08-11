import { Modal } from '../../components/Modal'
import { Button } from '../../components/Button'
import { StatusBadge } from '../../components/StatusBadge'
import { formatPrecioARS, formatFechaHoraAR } from '../../utils/format'

const celda = {
  padding: '10px 12px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
  color: 'var(--text-body)', borderBottom: '1px solid var(--border-subtle)', verticalAlign: 'middle',
}

const encabezado = {
  padding: '8px 12px', fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
  letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-faint)',
  textAlign: 'left', borderBottom: '1px solid var(--border-default)',
}

const titulo = {
  fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, letterSpacing: '.08em',
  textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 8,
}

// Una diferencia siempre se lee igual en todo el pop-up: rojo si sube (le sale
// más caro al taller), verde si baja, gris si no se movió.
function Diferencia({ valor, style }) {
  const color = valor > 0 ? 'var(--status-expired-fg)'
    : valor < 0 ? 'var(--status-active-fg)'
      : 'var(--text-faint)'
  return (
    <span style={{ fontWeight: 600, color, ...style }}>
      {valor > 0 ? '+' : ''}{formatPrecioARS(valor)}
    </span>
  )
}

function describirOpcion(op) {
  if (!op) return '—'
  return [op.marca, op.medida].filter(Boolean).join(' ') || op.repuesto_codigo || '—'
}

/*
 * Previsualización de "Actualizar a precios de hoy". Muestra qué cambiaría antes
 * de tocar nada — es plata, así que nunca se aplica sin que el dueño lo vea.
 *
 * Dos secciones bien separadas a propósito: los repuestos SÍ se actualizan (el
 * proveedor cambia su lista todos los días), la mano de obra solo se informa
 * porque cambiar un precio de mano de obra es una decisión del taller.
 */
export function ModalRevalidacion({ open, resumen, aplicando, onConfirmar, onClose }) {
  if (!open || !resumen) return null

  const { repuestos, mano_obra: manoObra } = resumen
  const lineasRepuestos = [
    ...repuestos.grupos.map((g) => ({
      key: `g-${g.grupo_num}`,
      descripcion: g.categoria,
      subtotal_antes: g.subtotal_antes,
      subtotal_ahora: g.subtotal_ahora,
      diferencia: g.diferencia,
      avisos: g.avisos,
      cambio: g.cambio_de_opcion
        ? `Ahora cotiza ${describirOpcion(g.elegida_ahora)} en vez de ${describirOpcion(g.elegida_antes)}`
        : null,
    })),
    ...repuestos.sueltos.map((s) => ({
      key: `s-${s.repuesto_codigo || s.descripcion}`,
      descripcion: s.descripcion,
      subtotal_antes: s.subtotal_antes,
      subtotal_ahora: s.subtotal_ahora,
      diferencia: s.diferencia,
      avisos: s.avisos,
      cambio: null,
    })),
  ]

  return (
    <Modal open={open} title="Actualizar a precios de hoy" onClose={onClose} maxWidth={900}>
      {resumen.hay_cambios_repuestos ? (
        <div style={{ marginBottom: 24 }}>
          <div style={titulo}>Repuestos — se van a actualizar</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
              <thead>
                <tr>
                  <th style={encabezado}>Repuesto</th>
                  <th style={{ ...encabezado, width: 155, textAlign: 'right' }}>Cotizado</th>
                  <th style={{ ...encabezado, width: 155, textAlign: 'right' }}>Hoy</th>
                  <th style={{ ...encabezado, width: 155, textAlign: 'right' }}>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {lineasRepuestos.map((l) => (
                  <tr key={l.key}>
                    <td style={celda}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                        <span style={{ fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)' }}>{l.descripcion}</span>
                        {l.cambio && <StatusBadge status="aviso">{l.cambio}</StatusBadge>}
                        {(l.avisos || []).map((a) => (
                          <span key={a} style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a}</span>
                        ))}
                      </div>
                    </td>
                    <td style={{ ...celda, textAlign: 'right' }}>{formatPrecioARS(l.subtotal_antes)}</td>
                    <td style={{ ...celda, textAlign: 'right', fontWeight: 600, color: 'var(--text-strong)' }}>
                      {formatPrecioARS(l.subtotal_ahora)}
                    </td>
                    <td style={{ ...celda, textAlign: 'right' }}><Diferencia valor={l.diferencia} /></td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...celda, fontWeight: 600, color: 'var(--text-strong)' }}>Total repuestos</td>
                  <td style={{ ...celda, textAlign: 'right' }}>{formatPrecioARS(repuestos.subtotal_antes)}</td>
                  <td style={{ ...celda, textAlign: 'right', fontWeight: 600, color: 'var(--text-strong)' }}>
                    {formatPrecioARS(repuestos.subtotal_ahora)}
                  </td>
                  <td style={{ ...celda, textAlign: 'right' }}><Diferencia valor={repuestos.diferencia} /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={{
          marginBottom: 24, padding: '12px 14px', borderRadius: 'var(--radius-md)',
          background: 'var(--surface-stripe)', fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-sm)', color: 'var(--text-muted)',
        }}>
          Los precios de los repuestos no cambiaron desde que se emitió el presupuesto.
        </div>
      )}

      {resumen.hay_cambios_mano_obra && (
        <div style={{ marginBottom: 24 }}>
          <div style={titulo}>Mano de obra — solo aviso, no se modifica</div>
          <div style={{
            padding: '10px 14px', marginBottom: 10, borderRadius: 'var(--radius-md)',
            background: 'var(--status-aviso-bg)', color: 'var(--status-aviso-fg)',
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
          }}>
            La lista de la Cámara cambió. Este botón no la toca: si querés trasladar
            el aumento, entrá a <strong>Editar</strong> y usá el ajuste %.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
              <thead>
                <tr>
                  <th style={encabezado}>Mano de obra</th>
                  <th style={{ ...encabezado, width: 70, textAlign: 'center' }}>Cant.</th>
                  <th style={{ ...encabezado, width: 155, textAlign: 'right' }}>Cotizado</th>
                  <th style={{ ...encabezado, width: 155, textAlign: 'right' }}>Hoy</th>
                  <th style={{ ...encabezado, width: 155, textAlign: 'right' }}>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {manoObra.lineas.map((l) => (
                  <tr key={l.descripcion}>
                    <td style={celda}>{l.descripcion}</td>
                    <td style={{ ...celda, textAlign: 'center' }}>{l.cantidad}</td>
                    <td style={{ ...celda, textAlign: 'right' }}>{formatPrecioARS(l.precio_antes)}</td>
                    <td style={{ ...celda, textAlign: 'right' }}>{formatPrecioARS(l.precio_ahora)}</td>
                    <td style={{ ...celda, textAlign: 'right' }}><Diferencia valor={l.diferencia} /></td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...celda, fontWeight: 600, color: 'var(--text-strong)' }} colSpan={2}>
                    Total mano de obra de lista
                  </td>
                  <td style={{ ...celda, textAlign: 'right' }}>{formatPrecioARS(manoObra.subtotal_antes)}</td>
                  <td style={{ ...celda, textAlign: 'right' }}>{formatPrecioARS(manoObra.subtotal_ahora)}</td>
                  <td style={{ ...celda, textAlign: 'right' }}><Diferencia valor={manoObra.diferencia} /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        flexWrap: 'wrap', paddingTop: 16, borderTop: '1px solid var(--border-default)',
      }}>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          Total del presupuesto{' '}
          <strong style={{ color: 'var(--text-strong)' }}>{formatPrecioARS(resumen.total_antes)}</strong>
          {' → '}
          <strong style={{ color: 'var(--text-strong)' }}>{formatPrecioARS(resumen.total_nuevo)}</strong>
          {'  '}
          <Diferencia valor={resumen.diferencia} style={{ marginLeft: 6 }} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {resumen.hay_cambios_repuestos ? 'Cancelar' : 'Cerrar'}
          </Button>
          {/* Si lo único que cambió fue la mano de obra no hay nada que aplicar:
              este botón solo toca los repuestos. */}
          {resumen.hay_cambios_repuestos && (
            <Button variant="success" size="sm" disabled={aplicando} onClick={onConfirmar}>
              {aplicando ? 'Actualizando…' : 'Actualizar y generar PDF'}
            </Button>
          )}
        </div>
      </div>

      {resumen.catalogo?.importado_en && (
        <div style={{
          marginTop: 12, fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-faint)',
        }}>
          Lista del proveedor cargada el {formatFechaHoraAR(resumen.catalogo.importado_en)}.
        </div>
      )}
    </Modal>
  )
}
