import React from 'react'
import { api } from '../../../api/client'
import { SearchInput } from '../../../components/SearchInput'
import { TextField } from '../../../components/TextField'
import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import { formatearNombreTitulo, formatFechaAR } from '../../../utils/format'
import { filtrarClientesPorBusqueda } from '../../../utils/fuzzyMatch'

const TIPO_LABEL = { mecanico: 'Mecánico', dueno: 'Dueño del vehículo' }
const TIPO_OPUESTO = { mecanico: 'dueno', dueno: 'mecanico' }

const labelStyle = {
  fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-strong)',
}

// Muestra el listado completo de clientes (igual que la pantalla Clientes) con
// un buscador tolerante a nombres incompletos y errores de tipeo ("Dani Pasc"
// o "Daniel Pascoal" encuentran a "Daniel Pascolo"): así no hace falta
// retipear el nombre completo de un cliente que ya existe. Elegir una fila de
// la lista avanza directo; si el nombre no está en la lista, se puede tipear
// uno nuevo y confirmar con el botón — se crea recién al guardar el presupuesto.
//
// Cada cliente se clasifica como mecánico o dueño del vehículo (quien trajo el
// motor al taller). Si el nombre tipeado no coincide con un cliente ya
// clasificado, hay que elegir el tipo antes de avanzar; una vez elegido (o si
// ya se conocía), se abre al lado un campo opcional para cargar el nombre de
// la contraparte (la otra persona involucrada: el mecánico si el cliente
// principal es el dueño, o viceversa), que también queda guardada como
// cliente propio con el tipo inverso.
export function PasoCliente({ valorInicial, onSiguiente }) {
  const [busqueda, setBusqueda] = React.useState(valorInicial || '')
  const [clientes, setClientes] = React.useState([])
  const [cargando, setCargando] = React.useState(true)
  const [tipoElegido, setTipoElegido] = React.useState(null)
  const [contactoNombre, setContactoNombre] = React.useState('')
  const [contactoVisible, setContactoVisible] = React.useState(false)
  const [filaHover, setFilaHover] = React.useState(null)
  const [filaContactoAbierta, setFilaContactoAbierta] = React.useState(null)
  const [contactoInline, setContactoInline] = React.useState('')

  React.useEffect(() => {
    api.get('/clientes').then(setClientes).finally(() => setCargando(false))
  }, [])

  const filtrados = React.useMemo(
    () => filtrarClientesPorBusqueda(clientes, busqueda).slice(0, 30),
    [clientes, busqueda],
  )

  const coincidenciaExacta = React.useMemo(
    () => clientes.find((c) => c.nombre.trim().toLowerCase() === busqueda.trim().toLowerCase()),
    [clientes, busqueda],
  )
  const tipoConocido = coincidenciaExacta?.tipo || null
  const tipoEfectivo = tipoConocido || tipoElegido
  const necesitaClasificar = Boolean(busqueda.trim()) && !tipoEfectivo

  // Anima la apertura del campo de contraparte con una transición corta y
  // sutil (opacity + translate), consistente con el resto del sistema, que no
  // usa animaciones de entrada llamativas.
  React.useEffect(() => {
    if (!tipoEfectivo) { setContactoVisible(false); return }
    const t = setTimeout(() => setContactoVisible(true), 10)
    return () => clearTimeout(t)
  }, [tipoEfectivo])

  const confirmar = (e) => {
    e?.preventDefault()
    if (!busqueda.trim() || !tipoEfectivo) return
    onSiguiente({
      nombre: formatearNombreTitulo(busqueda.trim()),
      tipo: tipoEfectivo,
      contacto: contactoNombre.trim() ? formatearNombreTitulo(contactoNombre.trim()) : null,
    })
  }

  const confirmarInline = (c) => {
    onSiguiente({ nombre: c.nombre, tipo: c.tipo, contacto: contactoInline.trim() ? formatearNombreTitulo(contactoInline.trim()) : null })
  }

  const tipoContactoInput = tipoEfectivo ? TIPO_OPUESTO[tipoEfectivo] : null

  return (
    <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <form onSubmit={confirmar} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={labelStyle}>{tipoEfectivo ? TIPO_LABEL[tipoEfectivo] : 'Cliente'}</label>
          <SearchInput
            icon={<Icon n="search" s={16} />}
            value={busqueda}
            autoFocus
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar cliente o escribir uno nuevo…"
            style={{ width: '100%' }}
          />
        </div>

        {tipoContactoInput && (
          <div
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', gap: 6,
              opacity: contactoVisible ? 1 : 0,
              transform: contactoVisible ? 'translateX(0)' : 'translateX(-6px)',
              transition: 'opacity .18s ease, transform .18s ease',
            }}
          >
            <label style={labelStyle}>{TIPO_LABEL[tipoContactoInput]} <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>(opcional)</span></label>
            <TextField
              value={contactoNombre}
              onChange={(e) => setContactoNombre(e.target.value)}
              placeholder={`Nombre del ${TIPO_LABEL[tipoContactoInput].toLowerCase()}…`}
            />
          </div>
        )}

        <Button type="submit" variant="primary" disabled={!busqueda.trim() || !tipoEfectivo}>
          Siguiente
        </Button>
      </form>

      {necesitaClasificar && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            ¿Es mecánico o dueño del vehículo?
          </span>
          <Button type="button" variant="secondary" size="sm" onClick={() => setTipoElegido('mecanico')}>
            Mecánico
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setTipoElegido('dueno')}>
            Dueño del vehículo
          </Button>
        </div>
      )}

      <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', background: 'var(--surface-card)', maxHeight: 360, overflow: 'auto' }}>
        {filtrados.map((c) => (
          <div
            key={c.id}
            onClick={() => onSiguiente({ nombre: c.nombre, tipo: c.tipo, contacto: null })}
            style={{
              display: 'flex', flexDirection: 'column', gap: 8,
              padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-sunken)'; setFilaHover(c.id) }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; setFilaHover(null) }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-strong)' }}>
                {c.nombre}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                  {c.total_presupuestos} presupuesto{c.total_presupuestos === 1 ? '' : 's'}
                  {c.ultimo_presupuesto ? ` · último ${formatFechaAR(c.ultimo_presupuesto)}` : ''}
                </span>
                {c.tipo && filaHover === c.id && (
                  <button
                    type="button"
                    title={`Agregar ${TIPO_LABEL[TIPO_OPUESTO[c.tipo]].toLowerCase()}`}
                    onClick={(e) => { e.stopPropagation(); setContactoInline(''); setFilaContactoAbierta(c.id) }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 26, height: 26, borderRadius: 'var(--radius-pill)',
                      border: '1px solid var(--border-default)', background: 'var(--surface-card)',
                      color: 'var(--text-body)', cursor: 'pointer', padding: 0,
                    }}
                  >
                    <Icon n="plus" s={14} />
                  </button>
                )}
              </div>
            </div>

            {c.tipo && filaContactoAbierta === c.id && (
              <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: 8 }}>
                <TextField
                  autoFocus
                  value={contactoInline}
                  onChange={(e) => setContactoInline(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmarInline(c) } }}
                  placeholder={`Nombre del ${TIPO_LABEL[TIPO_OPUESTO[c.tipo]].toLowerCase()}…`}
                  style={{ height: 34, fontSize: 'var(--text-sm)' }}
                />
                <Button type="button" size="sm" variant="primary" onClick={() => confirmarInline(c)}>
                  <Icon n="check" s={14} />
                </Button>
              </div>
            )}
          </div>
        ))}
        {filtrados.length === 0 && (
          <div style={{ padding: '20px 16px', textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
            {cargando
              ? 'Cargando…'
              : busqueda.trim()
                ? 'Ningún cliente existente coincide — tocá "Siguiente" para crearlo como nuevo.'
                : 'Todavía no hay clientes cargados.'}
          </div>
        )}
      </div>
    </div>
  )
}
