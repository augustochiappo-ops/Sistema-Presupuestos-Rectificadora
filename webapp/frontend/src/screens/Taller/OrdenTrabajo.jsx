import React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { PageHeader } from '../../components/PageHeader'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { ErrorBanner } from '../../components/ErrorBanner'
import { CodigoRepuesto } from '../../components/CodigoRepuesto'
import { formatFechaAR, formatFechaHoraAR } from '../../utils/format'
import { ESTADOS, estadoDe, haceCuanto, diasParaEntrega } from './estados'

/**
 * La orden de trabajo de un motor: todo lo que hay que hacerle y nada más.
 *
 * Acá no hay precios, y no es que estén escondidos: el backend nunca los manda
 * a esta pantalla (/api/taller no los consulta). Sirve igual para los dos
 * roles; la oficina ve además los botones de urgente y fecha de entrega.
 */
export default function OrdenTrabajo() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { esTaller } = useAuth()
  const [orden, setOrden] = React.useState(null)
  const [cargando, setCargando] = React.useState(true)
  const [error, setError] = React.useState('')
  const [guardando, setGuardando] = React.useState(false)
  const [notas, setNotas] = React.useState('')
  const [notasGuardadas, setNotasGuardadas] = React.useState('')

  React.useEffect(() => {
    setCargando(true)
    api.get(`/taller/trabajos/${id}`)
      .then((d) => {
        setOrden(d)
        setNotas(d.notas_taller || '')
        setNotasGuardadas(d.notas_taller || '')
      })
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false))
  }, [id])

  const mover = async (estado) => {
    setGuardando(true)
    try {
      await api.post(`/taller/trabajos/${id}/estado`, { estado })
      const historial = [
        ...(orden.historial || []),
        { estado, usuario: null, fecha_hora: new Date().toISOString().slice(0, 19) },
      ]
      setOrden((prev) => ({ ...prev, estado_trabajo: estado, historial }))
      window.dispatchEvent(new CustomEvent('trabajos-cambiaron'))
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  const guardarNotas = async () => {
    setGuardando(true)
    try {
      const { notas_taller: guardado } = await api.put(`/taller/trabajos/${id}/notas`, { notas_taller: notas })
      setNotasGuardadas(guardado || '')
      setNotas(guardado || '')
      setOrden((prev) => ({ ...prev, notas_taller: guardado }))
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  const marcarUrgente = async () => {
    try {
      const { prioridad } = await api.post(`/taller/trabajos/${id}/prioridad`, { prioridad: !orden.prioridad })
      setOrden((prev) => ({ ...prev, prioridad }))
    } catch (e) {
      setError(e.message)
    }
  }

  const cambiarEntrega = async (valor) => {
    try {
      const { entrega_prometida: fecha } = await api.put(`/taller/trabajos/${id}/entrega`, { entrega_prometida: valor })
      setOrden((prev) => ({ ...prev, entrega_prometida: fecha }))
    } catch (e) {
      setError(e.message)
    }
  }

  if (cargando) return <p style={{ fontFamily: 'var(--font-body)', color: 'var(--text-muted)' }}>Cargando…</p>
  if (!orden) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start' }}>
        <ErrorBanner message={error || 'Ese trabajo no existe.'} />
        <Button variant="secondary" onClick={() => navigate('/taller')} iconLeft={<Icon n="arrow-left" s={16} />}>
          Volver al tablero
        </Button>
      </div>
    )
  }

  const estado = estadoDe(orden.estado_trabajo)
  const indice = ESTADOS.findIndex((e) => e.id === orden.estado_trabajo)
  const atraso = diasParaEntrega(orden.entrega_prometida)
  const notasCambiadas = notas !== notasGuardadas

  const tareas = orden.tareas.filter((t) => !t.opcional)
  const tareasOpcionales = orden.tareas.filter((t) => t.opcional)
  const repuestos = orden.repuestos.filter((r) => !r.opcional)
  const repuestosOpcionales = orden.repuestos.filter((r) => r.opcional)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Button variant="ghost" size="sm" onClick={() => navigate('/taller')} iconLeft={<Icon n="arrow-left" s={16} />} style={{ alignSelf: 'flex-start', paddingLeft: 0 }}>
        Volver al tablero
      </Button>

      <PageHeader
        title={orden.motor}
        subtitle={`Orden #${String(orden.id).padStart(4, '0')} · ${orden.cliente}${orden.contacto ? ` · trajo: ${orden.contacto}` : ''}`}
        actions={
          <>
            {!esTaller && (
              <Button
                variant={orden.prioridad ? 'danger' : 'secondary'}
                size="sm"
                onClick={marcarUrgente}
                iconLeft={<Icon n="flame" s={16} />}
              >
                {orden.prioridad ? 'Urgente' : 'Marcar urgente'}
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.open(`/api/taller/trabajos/${orden.id}/orden.pdf`, '_blank')}
              iconLeft={<Icon n="printer" s={16} />}
            >
              Imprimir orden
            </Button>
          </>
        }
      />

      <ErrorBanner message={error} onClose={() => setError('')} />

      {/* La botonera de estado: en qué está y a dónde puede ir. */}
      <section style={{ ...panel, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ ...chipEstado, background: estado.bg, color: estado.fg }}>
            <Icon n={estado.icono} s={14} /> {estado.titulo}
          </span>
          {haceCuanto(orden.historial?.[orden.historial.length - 1]?.fecha_hora) && (
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              desde {haceCuanto(orden.historial[orden.historial.length - 1].fecha_hora)}
            </span>
          )}
          {orden.prioridad && (
            <span style={{ ...chipEstado, background: 'var(--trabajo-urgente-bg)', color: 'var(--trabajo-urgente-fg)' }}>
              <Icon n="flame" s={14} /> Urgente
            </span>
          )}
        </div>

        <p style={{ margin: '10px 0 12px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          {estado.ayuda}
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {ESTADOS.map((e, i) => (
            <Button
              key={e.id}
              size="sm"
              disabled={guardando || i === indice}
              variant={i === indice + 1 ? (e.id === 'terminado' ? 'success' : 'primary') : 'secondary'}
              onClick={() => mover(e.id)}
              iconLeft={<Icon n={e.icono} s={15} />}
            >
              {i === indice ? e.titulo : (i > indice ? e.accion : `Volver a "${e.titulo}"`)}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <span style={etiqueta}>Entrega prometida</span>
          {esTaller ? (
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: atraso !== null && atraso < 0 ? 'var(--trabajo-urgente-fg)' : 'var(--text-body)' }}>
              {orden.entrega_prometida ? formatFechaAR(orden.entrega_prometida) : 'Sin fecha'}
              {atraso !== null && atraso < 0 ? ` · ${-atraso} ${-atraso === 1 ? 'día' : 'días'} tarde` : ''}
            </span>
          ) : (
            <input
              type="date"
              value={orden.entrega_prometida || ''}
              onChange={(e) => cambiarEntrega(e.target.value)}
              style={campoFecha}
            />
          )}
        </div>
      </section>

      <div className="taller-orden-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Lista
            titulo="Qué hay que hacerle al motor"
            icono="list-checks"
            vacio="No hay mano de obra cargada en este presupuesto."
            filas={tareas}
            render={(t) => (
              <>
                {t.item_num ? <span style={numeroItem}>{t.item_num}</span> : null}
                <span style={{ flex: 1 }}>{t.descripcion}</span>
                {t.cantidad && Number(t.cantidad) !== 1 && <span style={cantidadItem}>×{Number(t.cantidad)}</span>}
              </>
            )}
          />

          {tareasOpcionales.length > 0 && (
            <Lista
              titulo="Puede llegar a hacer falta"
              icono="alert-triangle"
              nota="Todavía no está confirmado. Antes de hacerlo, avisar a la oficina."
              filas={tareasOpcionales}
              render={(t) => (
                <>
                  {t.item_num ? <span style={numeroItem}>{t.item_num}</span> : null}
                  <span style={{ flex: 1 }}>{t.descripcion}</span>
                </>
              )}
            />
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Lista
            titulo="Repuestos pedidos"
            icono="package"
            vacio="Este trabajo no lleva repuestos."
            filas={repuestos}
            render={(r) => <FilaRepuesto r={r} />}
          />

          {repuestosOpcionales.length > 0 && (
            <Lista
              titulo="Repuestos opcionales"
              icono="alert-triangle"
              nota="Cotizados por las dudas. No están confirmados."
              filas={repuestosOpcionales}
              render={(r) => <FilaRepuesto r={r} />}
            />
          )}
        </div>
      </div>

      {orden.notas && (
        <section style={panel}>
          <h2 style={tituloPanel}><Icon n="file-text" s={16} /> Notas de la oficina</h2>
          <p style={{ margin: 0, padding: '0 16px 16px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-body)', whiteSpace: 'pre-wrap' }}>
            {orden.notas}
          </p>
        </section>
      )}

      <section style={panel}>
        <h2 style={tituloPanel}><Icon n="message-square" s={16} /> Notas del taller</h2>
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            Lo que se escriba acá lo lee la oficina en el presupuesto. Sirve para lo que aparece
            con el motor abierto: una medida que hubo que cambiar, algo que falta, un aviso.
          </p>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={4}
            placeholder="Ej.: el cigüeñal va a 0,25 · falta la junta de tapa"
            style={campoNotas}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" disabled={!notasCambiadas || guardando} onClick={guardarNotas} iconLeft={<Icon n="save" s={15} />}>
              Guardar nota
            </Button>
            {notasCambiadas && (
              <Button size="sm" variant="ghost" onClick={() => setNotas(notasGuardadas)}>Deshacer</Button>
            )}
          </div>
        </div>
      </section>

      {orden.historial?.length > 0 && (
        <section style={panel}>
          <h2 style={tituloPanel}><Icon n="history" s={16} /> Cómo vino este motor</h2>
          <ol style={{ listStyle: 'none', margin: 0, padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {orden.historial.map((h, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-body)' }}>
                <span style={{ ...chipEstado, background: estadoDe(h.estado).bg, color: estadoDe(h.estado).fg }}>
                  {estadoDe(h.estado).corto}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                  {formatFechaHoraAR(h.fecha_hora)}{h.usuario ? ` · ${h.usuario}` : ''}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}

function FilaRepuesto({ r }) {
  const detalle = [r.marca, r.medida].filter(Boolean).join(' · ')
  return (
    <>
      <span style={cantidadItem}>{Number(r.cantidad) || 1}</span>
      <span style={{ flex: 1 }}>
        {r.descripcion || r.categoria || '—'}
        {detalle && <span style={{ color: 'var(--text-muted)' }}> — {detalle}</span>}
      </span>
      {r.codigo ? <CodigoRepuesto size={12}>{r.codigo}</CodigoRepuesto> : <span style={{ color: 'var(--text-faint)' }}>—</span>}
    </>
  )
}

function Lista({ titulo, icono, filas, render, vacio, nota }) {
  return (
    <section style={panel}>
      <h2 style={tituloPanel}><Icon n={icono} s={16} /> {titulo} <span style={contadorPanel}>{filas.length}</span></h2>
      {nota && (
        <p style={{ margin: 0, padding: '0 16px 10px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{nota}</p>
      )}
      {filas.length === 0 ? (
        <p style={{ margin: 0, padding: '0 16px 16px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>{vacio}</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {filas.map((f) => (
            <li key={f.id} style={filaLista}>{render(f)}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

const panel = {
  background: 'var(--surface-card)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  boxShadow: 'var(--shadow-xs)',
}

const tituloPanel = {
  display: 'flex', alignItems: 'center', gap: 8, margin: 0, padding: 16,
  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-md)',
  color: 'var(--text-strong)',
}

const contadorPanel = {
  marginLeft: 'auto', padding: '2px 9px', borderRadius: 'var(--radius-pill)',
  background: 'var(--surface-sunken)', color: 'var(--text-muted)',
  fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontVariantNumeric: 'tabular-nums',
}

const filaLista = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '11px 16px', borderTop: '1px solid var(--border-subtle)',
  fontFamily: 'var(--font-body)', fontSize: 'var(--text-md)', color: 'var(--text-body)',
}

const numeroItem = {
  minWidth: 30, fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
  fontVariantNumeric: 'tabular-nums',
}

const cantidadItem = {
  minWidth: 30, textAlign: 'center', padding: '2px 6px', borderRadius: 'var(--radius-sm)',
  background: 'var(--surface-sunken)', color: 'var(--text-strong)',
  fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)',
  fontVariantNumeric: 'tabular-nums',
}

const chipEstado = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '5px 12px', borderRadius: 'var(--radius-pill)',
  fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-semibold)',
  fontSize: 'var(--text-xs)', whiteSpace: 'nowrap',
}

const etiqueta = {
  fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
  fontWeight: 'var(--weight-semibold)', color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '.04em',
}

const campoFecha = {
  height: 36, padding: '0 10px', border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)', background: 'var(--surface-card)',
  fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-strong)',
}

const campoNotas = {
  width: '100%', boxSizing: 'border-box', padding: 12, resize: 'vertical',
  border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
  background: 'var(--surface-card)', fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)', color: 'var(--text-strong)', outline: 'none',
}
