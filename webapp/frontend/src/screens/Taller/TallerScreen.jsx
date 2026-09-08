import React from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { PageHeader } from '../../components/PageHeader'
import { SearchInput } from '../../components/SearchInput'
import { ErrorBanner } from '../../components/ErrorBanner'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { formatFechaAR } from '../../utils/format'
import { normalizarTexto } from '../../utils/texto'
import { ESTADOS, haceCuanto, diasParaEntrega, estaDemorado } from './estados'

/**
 * El tablero del taller: una columna por estado, un motor por tarjeta.
 *
 * Es la pantalla que se mira parado y de lejos, así que la tarjeta pone el
 * motor primero y grande, y todo lo demás abajo y chico. Los dos roles ven el
 * mismo tablero: la oficina para saber cómo viene el día, el taller para
 * trabajar. Lo que no hay, en ninguno de los dos casos, es un precio.
 */
export default function TallerScreen() {
  const navigate = useNavigate()
  const { esTaller } = useAuth()
  const [trabajos, setTrabajos] = React.useState([])
  const [busqueda, setBusqueda] = React.useState('')
  const [verEntregados, setVerEntregados] = React.useState(false)
  const [cargando, setCargando] = React.useState(true)
  const [error, setError] = React.useState('')
  const [moviendo, setMoviendo] = React.useState(null)

  const traer = React.useCallback(() => {
    return api.get('/taller/trabajos')
      .then((d) => setTrabajos(d.trabajos))
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false))
  }, [])

  React.useEffect(() => { traer() }, [traer])

  const mover = async (trabajo, estado) => {
    setMoviendo(trabajo.id)
    try {
      await api.post(`/taller/trabajos/${trabajo.id}/estado`, { estado })
      setTrabajos((prev) => prev.map((t) => (
        t.id === trabajo.id ? { ...t, estado_trabajo: estado, desde: new Date().toISOString() } : t
      )))
      // El contador del menú se entera sin tener que esperar al refresco.
      window.dispatchEvent(new CustomEvent('trabajos-cambiaron'))
    } catch (e) {
      setError(e.message)
    } finally {
      setMoviendo(null)
    }
  }

  const filtrados = React.useMemo(() => {
    const q = normalizarTexto(busqueda.trim())
    return trabajos.filter((t) => {
      if (!verEntregados && t.estado_trabajo === 'entregado') return false
      if (!q) return true
      return [t.motor, t.cliente, `#${String(t.id).padStart(4, '0')}`, String(t.id)]
        .some((campo) => normalizarTexto(campo || '').includes(q))
    })
  }, [trabajos, busqueda, verEntregados])

  const columnas = React.useMemo(() => (
    ESTADOS
      .filter((e) => verEntregados || e.id !== 'entregado')
      .map((e) => ({ ...e, trabajos: filtrados.filter((t) => t.estado_trabajo === e.id) }))
  ), [filtrados, verEntregados])

  const demorados = filtrados.filter(estaDemorado).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Trabajos del taller"
        subtitle={
          cargando
            ? 'Cargando…'
            : `${filtrados.length} ${filtrados.length === 1 ? 'motor' : 'motores'}` +
              (demorados ? ` · ${demorados} con demora` : '')
        }
        actions={
          <>
            <SearchInput
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Motor, cliente o número…"
              icon={<Icon n="search" s={18} />}
              width={280}
            />
            <Button
              variant={verEntregados ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setVerEntregados((v) => !v)}
              iconLeft={<Icon n="truck" s={16} />}
            >
              Entregados
            </Button>
          </>
        }
      />

      <ErrorBanner message={error} onClose={() => setError('')} />

      {!cargando && filtrados.length === 0 && (
        <div style={vacioGeneral}>
          {busqueda
            ? 'Ningún motor coincide con la búsqueda.'
            : 'No hay trabajos. Cuando la oficina apruebe un presupuesto, el motor aparece acá.'}
        </div>
      )}

      <div className={`taller-tablero ${verEntregados ? '' : 'tres'}`}>
        {columnas.map((col) => (
          <section key={col.id} className="taller-columna">
            <header style={{ ...cabeceraColumna, background: col.bg, color: col.fg }}>
              <Icon n={col.icono} s={16} />
              <span style={{ flex: 1 }}>{col.titulo}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{col.trabajos.length}</span>
            </header>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {col.trabajos.length === 0 && <p style={vacioColumna}>Nada acá.</p>}
              {col.trabajos.map((t) => (
                <TarjetaTrabajo
                  key={t.id}
                  trabajo={t}
                  ocupado={moviendo === t.id}
                  esTaller={esTaller}
                  onAbrir={() => navigate(`/taller/${t.id}`)}
                  onMover={(estado) => mover(t, estado)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function TarjetaTrabajo({ trabajo, ocupado, esTaller, onAbrir, onMover }) {
  const indice = ESTADOS.findIndex((e) => e.id === trabajo.estado_trabajo)
  const siguiente = ESTADOS[indice + 1]
  const anterior = ESTADOS[indice - 1]
  const atraso = diasParaEntrega(trabajo.entrega_prometida)
  const demorado = estaDemorado(trabajo)

  return (
    <article
      style={{
        ...tarjeta,
        borderColor: trabajo.prioridad ? 'var(--trabajo-urgente-fg)' : 'var(--border-default)',
      }}
    >
      <button onClick={onAbrir} style={cuerpoTarjeta} title="Ver la orden de trabajo">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={numeroTarjeta}>#{String(trabajo.id).padStart(4, '0')}</span>
          {!!trabajo.prioridad && (
            <span style={chipUrgente}><Icon n="flame" s={12} /> Urgente</span>
          )}
        </div>
        <h3 style={motorTarjeta}>{trabajo.motor}</h3>
        <p style={clienteTarjeta}>{trabajo.cliente}</p>

        <div style={metaTarjeta}>
          <span>
            {trabajo.tareas} {trabajo.tareas === 1 ? 'trabajo' : 'trabajos'} ·{' '}
            {trabajo.repuestos} {trabajo.repuestos === 1 ? 'repuesto' : 'repuestos'}
          </span>
          {haceCuanto(trabajo.desde) && <span>Acá desde {haceCuanto(trabajo.desde)}</span>}
          {trabajo.entrega_prometida && (
            <span style={{ color: atraso !== null && atraso < 0 ? 'var(--trabajo-urgente-fg)' : undefined }}>
              <Icon n="calendar" s={12} style={{ display: 'inline-block', verticalAlign: '-2px', marginRight: 4 }} />
              Entrega {formatFechaAR(trabajo.entrega_prometida)}
              {atraso !== null && atraso < 0 ? ` · ${-atraso} ${-atraso === 1 ? 'día' : 'días'} tarde` : ''}
            </span>
          )}
          {!!trabajo.notas_taller && (
            <span style={{ color: 'var(--trabajo-proceso-fg)' }}>
              <Icon n="message-square" s={12} style={{ display: 'inline-block', verticalAlign: '-2px', marginRight: 4 }} />
              Con nota del taller
            </span>
          )}
          {demorado && !trabajo.prioridad && (
            <span style={{ color: 'var(--trabajo-urgente-fg)' }}>Hace rato que no se mueve</span>
          )}
        </div>
      </button>

      <div style={pieTarjeta}>
        {anterior && (
          <button
            onClick={() => onMover(anterior.id)}
            disabled={ocupado}
            title={anterior.accion}
            style={botonVolver}
          >
            <Icon n="arrow-left" s={14} />
          </button>
        )}
        {siguiente ? (
          <Button
            size="sm"
            variant={siguiente.id === 'terminado' ? 'success' : 'primary'}
            disabled={ocupado}
            onClick={() => onMover(siguiente.id)}
            iconLeft={<Icon n={siguiente.icono} s={15} />}
            style={{ flex: 1 }}
          >
            {siguiente.accion}
          </Button>
        ) : (
          <span style={{ flex: 1, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
            {esTaller ? 'Entregado.' : 'Entregado. Nada pendiente.'}
          </span>
        )}
      </div>
    </article>
  )
}

const cabeceraColumna = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '9px 12px', borderRadius: 'var(--radius-pill)',
  fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-semibold)',
  fontSize: 'var(--text-sm)', marginBottom: 12,
}

const tarjeta = {
  background: 'var(--surface-card)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  boxShadow: 'var(--shadow-xs)',
  overflow: 'hidden',
}

const cuerpoTarjeta = {
  display: 'block', width: '100%', textAlign: 'left',
  padding: '12px 14px 10px', border: 'none', background: 'transparent', cursor: 'pointer',
}

const numeroTarjeta = {
  fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
  fontWeight: 'var(--weight-semibold)', color: 'var(--text-muted)',
  fontVariantNumeric: 'tabular-nums',
}

const chipUrgente = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '2px 8px', borderRadius: 'var(--radius-pill)',
  background: 'var(--trabajo-urgente-bg)', color: 'var(--trabajo-urgente-fg)',
  fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)',
}

const motorTarjeta = {
  margin: '4px 0 2px', fontFamily: 'var(--font-display)', fontWeight: 700,
  fontSize: 'var(--text-lg)', lineHeight: 1.2, color: 'var(--text-strong)',
}

const clienteTarjeta = {
  margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-body)',
}

const metaTarjeta = {
  display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8,
  fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
}

const pieTarjeta = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '10px 14px', borderTop: '1px solid var(--border-subtle)',
  background: 'var(--surface-sunken)',
}

const botonVolver = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 34, height: 34, flexShrink: 0,
  border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
  background: 'var(--surface-card)', color: 'var(--text-muted)', cursor: 'pointer',
}

const vacioColumna = {
  margin: 0, padding: '10px 2px', fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-xs)', color: 'var(--text-faint)',
}

const vacioGeneral = {
  padding: '28px 20px', textAlign: 'center',
  background: 'var(--surface-card)', border: '1px dashed var(--border-default)',
  borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)', color: 'var(--text-muted)',
}
