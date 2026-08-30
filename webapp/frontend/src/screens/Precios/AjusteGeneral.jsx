import React from 'react'
import { api } from '../../api/client'
import { TextField } from '../../components/TextField'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'

/*
 * Aumento general sobre toda la lista de la Cámara.
 *
 * Es el atajo para "la Cámara viene atrasada, cobro un 25% más que la lista":
 * un número y listo, en vez de tarifar los 235 trabajos a mano.
 *
 * **No pisa los precios propios.** Donde el dueño puso su precio manda el suyo,
 * y el % se aplica sobre todo lo demás. Si fuera al revés, mover este número le
 * cambiaría en silencio justo los precios que decidió fijar — que son los que
 * más le importan.
 *
 * Ojo con el otro porcentaje: el wizard tiene un "ajuste de este presupuesto",
 * que es una palanca de negociación de UNA cotización ("a este cliente -10%").
 * Este de acá es parte de la tarifa y vale para todos. Se llaman distinto a
 * propósito, y el del wizard avisa cuando este está puesto, para que nadie los
 * aplique dos veces sin darse cuenta.
 */
export function AjusteGeneral({ pct, onGuardado, onError }) {
  const [texto, setTexto] = React.useState(String(pct ?? 0))
  const [guardando, setGuardando] = React.useState(false)

  // El valor de afuera manda mientras no se esté editando: al recargar la
  // pantalla o cambiar de lista, el recuadro tiene que mostrar lo guardado.
  React.useEffect(() => { setTexto(String(pct ?? 0)) }, [pct])

  const valor = parseFloat(String(texto).replace(',', '.'))
  const valido = !Number.isNaN(valor) && valor >= -90 && valor <= 500
  const cambio = valido && valor !== Number(pct)

  const guardar = async () => {
    if (!cambio) return
    setGuardando(true)
    try {
      await api.put('/precios/ajuste-general', { pct: valor })
      onGuardado()
    } catch (e) {
      onError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  const activo = Number(pct) !== 0

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      padding: 16, background: 'var(--surface-card)',
      border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 34, height: 34, borderRadius: 'var(--radius-md)', flexShrink: 0,
          background: activo ? 'var(--status-active-bg)' : 'var(--surface-sunken)',
          color: activo ? 'var(--status-active-fg)' : 'var(--text-faint)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon n="dollar-sign" s={17} />
        </span>
        <div>
          <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>
            Aumento general sobre la lista de la Cámara
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Se aplica a todos los trabajos que no tarifaste vos. Donde pusiste tu precio, manda el tuyo.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
        <TextField
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') guardar() }}
          inputMode="decimal"
          title="Porcentaje sobre la lista de la Cámara. Puede ser negativo."
          style={{
            width: 96, textAlign: 'right', fontWeight: 600,
            borderColor: valido ? undefined : 'var(--status-expired-fg)',
          }}
        />
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>%</span>
        <Button
          size="sm"
          variant={cambio ? 'primary' : 'secondary'}
          onClick={guardar}
          disabled={!cambio || guardando}
          iconLeft={<Icon n="check" s={15} />}
        >
          {guardando ? 'Guardando…' : 'Aplicar'}
        </Button>
      </div>

      {!valido && (
        <div style={{ width: '100%', fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--status-expired-fg)' }}>
          Tiene que ser un número entre −90 y 500.
        </div>
      )}
    </div>
  )
}
