import React from 'react'
import { api } from '../../api/client'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { ErrorBanner } from '../../components/ErrorBanner'
import { formatPrecioARS } from '../../utils/format'

/*
 * Llevar un precio a las trece listas de la Cámara, manteniendo la curva del
 * ítem.
 *
 * Un servicio no tiene un precio: tiene trece, uno por lista, y cada servicio
 * escala distinto entre ellas (el ratio l8/l1 va de 1,0 a 4,2 según el ítem).
 * Por eso no se propaga con un factor único sino con la proporción que la
 * Cámara ya le dio a ESE servicio: precio_n = precio × (l_n / l_k). Así se
 * conserva la lógica de tamaño de motor que la lista ya trae pensada.
 *
 * Los trece montos se muestran ANTES de confirmar. Cambiar de un click lo que
 * se cobra en 491 motores no puede pasar a ciegas: el dueño tiene que poder
 * mirar la columna y decir "sí, es eso".
 *
 * Las listas donde la Cámara no tiene precio para este servicio salen con "—"
 * y no se tocan: el sistema no inventa un número donde no hay con qué calcularlo.
 */
export function ModalPropagar({ open, servicio, listaNum, precio, onCerrar, onListo }) {
  const [filas, setFilas] = React.useState(null)
  const [error, setError] = React.useState('')
  const [guardando, setGuardando] = React.useState(false)

  React.useEffect(() => {
    if (!open || !servicio) { setFilas(null); return undefined }
    let vigente = true
    setError('')
    const params = new URLSearchParams({
      servicio_id: servicio.id, lista: listaNum, precio,
    })
    api.get(`/precios/mano-obra/propagacion?${params}`)
      .then((data) => { if (vigente) setFilas(data) })
      .catch((e) => { if (vigente) setError(e.message) })
    return () => { vigente = false }
  }, [open, servicio, listaNum, precio])

  const confirmar = async () => {
    setGuardando(true)
    setError('')
    try {
      await api.post('/precios/mano-obra', {
        servicio_id: servicio.id, lista_num: listaNum, precio, propagar: true,
      })
      onListo()
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  if (!servicio) return null

  const conPrecio = (filas || []).filter((f) => f.precio_propuesto !== null)
  const sinPrecio = (filas || []).filter((f) => f.precio_propuesto === null)

  return (
    <Modal open={open} title="Aplicar a las trece listas" onClose={onCerrar} maxWidth={640}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && <ErrorBanner message={error} />}

        <div>
          <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--text-md)', color: 'var(--text-strong)' }}>
            {servicio.descripcion}
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 4 }}>
            Estás cobrando {formatPrecioARS(precio)} en la lista {listaNum}. Estos serían
            los precios de las otras listas, manteniendo la proporción que la Cámara le da
            a este trabajo según el tamaño del motor.
          </div>
        </div>

        {filas === null && (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            Calculando…
          </div>
        )}

        {filas && (
          <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            {conPrecio.map((f, i) => {
              const esLaEditada = f.lista_num === Number(listaNum)
              return (
                <div
                  key={f.lista_num}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '9px 14px',
                    borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)',
                    background: esLaEditada ? 'var(--surface-sunken)' : 'transparent',
                    fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                  }}
                >
                  <span style={{ width: 76, color: 'var(--text-muted)', flexShrink: 0 }}>
                    Lista {f.lista_num}
                    {esLaEditada && <span style={{ color: 'var(--text-faint)' }}> ·</span>}
                  </span>
                  <span style={{ flex: 1, textAlign: 'right', color: 'var(--text-faint)' }}>
                    {formatPrecioARS(f.precio_facra)}
                  </span>
                  <span style={{ width: 22, textAlign: 'center', color: 'var(--text-faint)', flexShrink: 0 }}>→</span>
                  <span style={{
                    width: 130, textAlign: 'right', fontWeight: 600,
                    color: 'var(--text-strong)', flexShrink: 0,
                  }}>
                    {formatPrecioARS(f.precio_propuesto)}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {sinPrecio.length > 0 && (
          <div style={{
            display: 'flex', gap: 10, padding: 12,
            background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)',
            fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-muted)',
          }}>
            <span style={{ color: 'var(--text-faint)', flexShrink: 0 }}><Icon n="alert-triangle" s={15} /></span>
            <span>
              {sinPrecio.length === 1 ? 'La lista' : 'Las listas'}{' '}
              {sinPrecio.map((f) => f.lista_num).join(', ')}{' '}
              {sinPrecio.length === 1 ? 'no tiene' : 'no tienen'} precio de la Cámara para
              este trabajo, así que no hay proporción con la cual calcularlas.{' '}
              {sinPrecio.length === 1 ? 'Queda' : 'Quedan'} sin tocar.
            </span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Button variant="secondary" onClick={onCerrar}>Cancelar</Button>
          <Button
            onClick={confirmar}
            disabled={guardando || !filas || conPrecio.length === 0}
            iconLeft={<Icon n="check" s={16} />}
          >
            {guardando ? 'Guardando…' : `Aplicar a ${conPrecio.length} listas`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
