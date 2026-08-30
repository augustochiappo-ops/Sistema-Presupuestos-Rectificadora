import React from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import { DataTable } from '../../components/DataTable'
import { Icon } from '../../components/Icon'
import { formatPrecioARS, formatFechaHoraAR } from '../../utils/format'

/*
 * Todo lo que tarifó el taller, en un solo lugar.
 *
 * Este apartado es lo que hace segura a toda la función. Un precio se puede
 * guardar al pasar, desde el wizard, mientras se arma un presupuesto — y eso es
 * justamente lo cómodo. Pero sin una vista que junte todos esos cambios, con su
 * fecha y de dónde salieron, serían cambios invisibles: dentro de seis meses
 * nadie podría decir por qué un trabajo cuesta lo que cuesta.
 *
 * Por eso cada fila dice de dónde vino (de la pantalla, o del presupuesto tal,
 * enlazado) y trae su ↺. Y las desfasadas —donde la Cámara se movió después de
 * que se fijó el precio— van arriba de todo: es lo que hay que repasar cada vez
 * que llega lista nueva.
 */
export function MisPrecios({ filas, onCambio, onError, onIrALista }) {
  const [borrando, setBorrando] = React.useState(null)

  const borrar = async (fila) => {
    setBorrando(`${fila.servicio_id}-${fila.lista_num}`)
    try {
      await api.del('/precios/mano-obra', {
        servicio_id: fila.servicio_id, lista_num: fila.lista_num,
      })
      onCambio()
    } catch (e) {
      onError(e.message)
    } finally {
      setBorrando(null)
    }
  }

  // Lo desfasado primero: es lo único de esta lista que pide una decisión.
  const ordenadas = React.useMemo(
    () => [...filas].sort((a, b) => Number(b.desfasado) - Number(a.desfasado)),
    [filas],
  )

  const columnas = [
    {
      key: 'descripcion',
      header: 'Trabajo',
      wrap: true,
      render: (v, f) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span
            aria-hidden
            style={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              background: f.desfasado ? 'var(--status-aviso-fg)' : 'var(--status-active-fg)',
            }}
          />
          <span>{v}</span>
        </span>
      ),
    },
    {
      key: 'lista_num',
      header: 'Lista',
      width: 84,
      align: 'center',
      render: (v) => (
        <button
          onClick={() => onIrALista(v)}
          title={`Ver la lista ${v} completa`}
          style={{
            border: '1px solid var(--border-default)', background: 'var(--surface-card)',
            borderRadius: 'var(--radius-pill)', padding: '3px 12px', cursor: 'pointer',
            fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-strong)',
          }}
        >
          {v}
        </button>
      ),
    },
    {
      key: 'precio_facra',
      header: 'Cámara hoy',
      align: 'right',
      width: 130,
      render: (v, f) => (
        <span style={{ color: f.desfasado ? 'var(--status-aviso-fg)' : 'var(--text-faint)' }}>
          {formatPrecioARS(v)}
        </span>
      ),
    },
    {
      key: 'precio',
      header: 'Mi precio',
      align: 'right',
      width: 130,
      render: (v) => (
        <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{formatPrecioARS(v)}</span>
      ),
    },
    {
      key: 'origen',
      header: 'Vino de',
      width: 190,
      wrap: true,
      render: (v, f) => (
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {v === 'presupuesto' && f.presupuesto_id ? (
            <>
              el{' '}
              <Link
                to={`/presupuestos/${f.presupuesto_id}`}
                style={{ color: 'var(--text-strong)', textDecoration: 'underline' }}
              >
                presupuesto #{f.presupuesto_id}
              </Link>
            </>
          ) : v === 'presupuesto' ? 'un presupuesto' : 'esta pantalla'}
          <br />
          <span style={{ color: 'var(--text-faint)' }}>{formatFechaHoraAR(f.actualizado_en)}</span>
        </span>
      ),
    },
    {
      key: 'acciones',
      header: '',
      width: 52,
      align: 'center',
      render: (_, f) => (
        <button
          type="button"
          onClick={() => borrar(f)}
          disabled={borrando === `${f.servicio_id}-${f.lista_num}`}
          title="Volver al precio de la Cámara"
          style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: 'var(--text-faint)', display: 'inline-flex', padding: 2,
          }}
        >
          <Icon n="rotate-cw" s={15} />
        </button>
      ),
    },
  ]

  const desfasadas = filas.filter((f) => f.desfasado).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {filas.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          padding: '56px 24px', textAlign: 'center',
          background: 'var(--surface-card)', border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-xl)',
        }}>
          <span style={{ color: 'var(--text-faint)' }}><Icon n="dollar-sign" s={26} /></span>
          <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--text-md)', color: 'var(--text-strong)' }}>
            Todavía no tarifaste ningún trabajo
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', maxWidth: 460 }}>
            Todo se está cobrando al precio de la Cámara. Cuando cargues un precio propio
            —acá o mientras armás un presupuesto— va a aparecer en esta lista, con la fecha
            y de dónde salió.
          </div>
        </div>
      ) : (
        <>
          {desfasadas > 0 && (
            <div style={{
              display: 'flex', gap: 10, padding: '12px 16px',
              background: 'var(--status-aviso-bg)', color: 'var(--status-aviso-fg)',
              borderRadius: 'var(--radius-md)',
              fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            }}>
              <span style={{ flexShrink: 0, display: 'flex' }}><Icon n="alert-triangle" s={16} /></span>
              <span>
                Los {desfasadas === 1 ? 'marcado' : `${desfasadas} marcados`} en ámbar se fijaron
                cuando la Cámara cobraba otra cosa. Tu precio sigue vigente tal cual lo dejaste
                —nada cambió solo—, pero conviene mirar si todavía te cierra.
              </span>
            </div>
          )}

          <DataTable
            columns={columnas}
            rows={ordenadas}
            reorderKey="precios-mios"
            emptyMessage="No hay precios propios."
            striped
          />

          <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.5 }}>
            El ↺ devuelve ese trabajo al precio de la Cámara en esa lista.
            Los presupuestos ya emitidos no cambian: sus precios quedaron congelados el día que se cotizaron.
          </div>
        </>
      )}
    </div>
  )
}
