import { TextField } from '../../components/TextField'
import { TOLERANCIA_DEFECTO } from './familias'

/*
 * Una medida se busca con un valor y una tolerancia, nunca con un valor exacto:
 * el taller mide con calibre y una camisa de 56,50 puede dar 56,47. Por eso
 * cada campo son dos casilleros, y el de tolerancia arranca con ±0,5 mm puesto
 * (el mismo default que el backend aplica si llega vacío).
 *
 * La tolerancia además lleva signo, y el signo la hace de un solo lado:
 *
 *     ±  →  40 ± 0,5      lo de siempre
 *     +  →  40 o más      (y con número, "+2", de 40 a 42)
 *     −  →  40 o menos    (y con número, "-2", de 38 a 40)
 *
 * Sale de cómo se busca de verdad: una guía de 40 de largo entra donde va una
 * de 50, así que "40 y para arriba" encuentra en un intento lo que con ± exige
 * adivinar la tolerancia. El signo se cambia con el botón o escribiéndolo
 * adelante del número, que es lo que hace todo el mundo.
 */

const MODOS = [
  { signo: '', simbolo: '±', ayuda: 'Tolerancia hacia los dos lados' },
  { signo: '+', simbolo: '+', ayuda: 'Ese valor o más' },
  { signo: '-', simbolo: '−', ayuda: 'Ese valor o menos' },
]

function partir(tolerancia) {
  const texto = (tolerancia ?? '').toString()
  const signo = texto.startsWith('+') ? '+' : texto.startsWith('-') ? '-' : ''
  return { signo, magnitud: signo ? texto.slice(1) : texto }
}

export function CampoMedida({ label, valor, tolerancia, onValor, onTolerancia, ancho = 250, unidad = 'mm' }) {
  const { signo, magnitud } = partir(tolerancia)
  const modo = MODOS.find((m) => m.signo === signo) || MODOS[0]

  const cambiarModo = () => {
    const siguiente = MODOS[(MODOS.indexOf(modo) + 1) % MODOS.length]
    onTolerancia(`${siguiente.signo}${magnitud}`)
  }

  // Escribir "+" o "-" adelante mueve el signo al botón: el casillero queda
  // siempre con el número solo y los dos caminos terminan en el mismo estado.
  const cambiarMagnitud = (texto) => {
    const nuevo = partir(texto)
    onTolerancia(`${nuevo.signo || signo}${nuevo.magnitud}`)
  }

  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: `0 1 ${ancho}px`, minWidth: 0 }}>
      <span
        style={{
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-2xs)',
          fontWeight: 'var(--weight-semibold)', letterSpacing: '.12em',
          textTransform: 'uppercase', color: 'var(--text-faint)',
        }}
      >
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <TextField
          value={valor}
          onChange={(e) => onValor(e.target.value)}
          placeholder="—"
          inputMode="decimal"
          style={{ flex: '1 1 0', minWidth: 0, textAlign: 'right' }}
        />
        <button
          type="button"
          onClick={cambiarModo}
          title={`${modo.ayuda} — clic para cambiar`}
          aria-label={`Tolerancia de ${label}: ${modo.ayuda}`}
          style={{
            width: 28, height: 28, flex: '0 0 28px', padding: 0, cursor: 'pointer',
            borderRadius: 'var(--radius-pill)',
            border: `1px solid ${signo ? 'var(--surface-inverse)' : 'var(--border-default)'}`,
            background: signo ? 'var(--surface-inverse)' : 'var(--surface-card)',
            color: signo ? 'var(--text-on-inverse)' : 'var(--text-muted)',
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            fontWeight: 'var(--weight-semibold)', lineHeight: 1,
          }}
        >
          {modo.simbolo}
        </button>
        <TextField
          value={magnitud}
          onChange={(e) => cambiarMagnitud(e.target.value)}
          // Con signo y sin número no hay tope: el placeholder lo dice en vez
          // de sugerir un 0,5 que no se va a usar.
          placeholder={signo ? 'sin tope' : TOLERANCIA_DEFECTO.replace('.', ',')}
          inputMode="decimal"
          aria-label={`Tolerancia de ${label}`}
          style={{ width: 72, flex: '0 0 72px', textAlign: 'right' }}
        />
        {/* Casi todas las medidas son milímetros; el ángulo del asiento son
            grados, y decir "mm" ahí sería mentir. */}
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>{unidad}</span>
      </div>
    </label>
  )
}
