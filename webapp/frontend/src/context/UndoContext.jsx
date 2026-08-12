import React from 'react'
import { Icon } from '../components/Icon'

/*
 * Deshacer, para toda la app.
 *
 * Cada vez que se borra algo aparece un cartel en la esquina inferior izquierda
 * con el botón "Deshacer". Hay dos formas de usarlo, según se pueda revertir el
 * borrado o no:
 *
 *  - `avisarBorrado({ mensaje, onDeshacer })` — el borrado YA se hizo y se puede
 *    revertir (estado en pantalla, o algo que el servidor sabe restaurar, como
 *    la papelera de la ficha del motor). "Deshacer" llama a `onDeshacer`.
 *
 *  - `borrarConDeshacer({ mensaje, clave, ejecutar, onError })` — el borrado NO
 *    se puede revertir (un presupuesto con sus PDFs, un cliente). Entonces no se
 *    ejecuta todavía: la pantalla esconde lo borrado mirando `estaPendiente(clave)`
 *    y el borrado de verdad sale recién cuando se apaga el cartel. "Deshacer"
 *    lo cancela y no se llega a tocar nada en el servidor.
 *
 * El caso peor del borrado diferido es que la app se cierre dentro de esos
 * segundos y el borrado no llegue a salir: se pierde el borrado, nunca el dato.
 * Es a propósito, y es el lado seguro para equivocarse.
 */

const UndoContext = React.createContext(null)

const DURACION_MS = 8000

export function useUndo() {
  const ctx = React.useContext(UndoContext)
  // Sin provider (algún test que monte una pantalla suelta) el borrado se
  // comporta como antes: se ejecuta y no hay cartel.
  if (!ctx) {
    return {
      avisarBorrado: () => {},
      borrarConDeshacer: ({ ejecutar }) => { ejecutar?.() },
      estaPendiente: () => false,
    }
  }
  return ctx
}

export function UndoProvider({ children }) {
  const [cartel, setCartel] = React.useState(null)
  const [pendientes, setPendientes] = React.useState([])
  // El cartel también se lee fuera del render (timers, callbacks), donde el
  // estado de React llegaría viejo.
  const cartelRef = React.useRef(null)
  const timerRef = React.useRef(null)

  const cerrarTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
  }

  /* Cierra el cartel dando el borrado por bueno: si era diferido, sale ahora. */
  const confirmar = React.useCallback(() => {
    const actual = cartelRef.current
    cerrarTimer()
    cartelRef.current = null
    setCartel(null)
    if (!actual?.ejecutar) return
    setPendientes((prev) => prev.filter((c) => c !== actual.clave))
    Promise.resolve()
      .then(() => actual.ejecutar())
      .catch((err) => {
        actual.onError?.(err)
        mostrarRef.current({ mensaje: err?.message || 'No se pudo borrar.', soloAviso: true })
      })
  }, [])

  const mostrar = React.useCallback((entrada) => {
    // Si había otro borrado esperando, este cartel lo reemplaza: se da por bueno
    // el anterior antes de perderlo de vista.
    confirmar()
    const nuevo = { ...entrada, id: Date.now() + Math.random() }
    cartelRef.current = nuevo
    setCartel(nuevo)
    if (nuevo.clave) setPendientes((prev) => [...prev, nuevo.clave])
    timerRef.current = setTimeout(confirmar, DURACION_MS)
  }, [confirmar])

  // Para poder avisar del error desde dentro de `confirmar` sin ciclo de deps.
  const mostrarRef = React.useRef(mostrar)
  React.useEffect(() => { mostrarRef.current = mostrar }, [mostrar])

  const deshacer = React.useCallback(() => {
    const actual = cartelRef.current
    cerrarTimer()
    cartelRef.current = null
    setCartel(null)
    if (!actual) return
    if (actual.clave) setPendientes((prev) => prev.filter((c) => c !== actual.clave))
    actual.onDeshacer?.()
  }, [])

  React.useEffect(() => () => cerrarTimer(), [])

  const valor = React.useMemo(() => ({
    avisarBorrado: ({ mensaje, onDeshacer }) => mostrar({ mensaje, onDeshacer }),
    borrarConDeshacer: ({ mensaje, clave, ejecutar, onDeshacer, onError }) => mostrar({
      mensaje, clave, ejecutar, onDeshacer, onError,
    }),
    estaPendiente: (clave) => pendientes.includes(clave),
  }), [mostrar, pendientes])

  return (
    <UndoContext.Provider value={valor}>
      {children}
      <CartelDeshacer cartel={cartel} onDeshacer={deshacer} onCerrar={confirmar} />
    </UndoContext.Provider>
  )
}

function CartelDeshacer({ cartel, onDeshacer, onCerrar }) {
  if (!cartel) return null
  return (
    <div
      role="status"
      data-testid="cartel-deshacer"
      style={{
        position: 'fixed', left: 16, bottom: 16, zIndex: 2000, maxWidth: 'min(460px, calc(100vw - 32px))',
        display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px',
        background: 'var(--surface-inverse)', color: 'var(--text-on-inverse)',
        borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
        fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
      }}
    >
      <Icon n="trash" s={16} />
      <span style={{ flex: 1, minWidth: 0 }}>{cartel.mensaje}</span>
      {!cartel.soloAviso && (
        <button
          onClick={onDeshacer}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
            border: '1px solid rgba(255,255,255,.35)', background: 'transparent',
            color: 'var(--text-on-inverse)', borderRadius: 'var(--radius-pill)',
            padding: '6px 14px', cursor: 'pointer',
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600,
          }}
        >
          <Icon n="rotate-cw" s={14} />
          Deshacer
        </button>
      )}
      <button
        onClick={onCerrar}
        title="Cerrar"
        style={{ border: 'none', background: 'transparent', color: 'rgba(255,255,255,.6)', cursor: 'pointer', display: 'flex', padding: 0, flexShrink: 0 }}
      >
        <Icon n="x" s={16} />
      </button>
    </div>
  )
}
