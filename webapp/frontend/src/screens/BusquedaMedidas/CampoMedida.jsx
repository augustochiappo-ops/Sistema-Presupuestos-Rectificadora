import { TextField } from '../../components/TextField'
import { TOLERANCIA_DEFECTO } from './familias'

/*
 * Una medida se busca con un valor y una tolerancia, nunca con un valor exacto:
 * el taller mide con calibre y una camisa de 56,50 puede dar 56,47. Por eso
 * cada campo son dos casilleros, y el de tolerancia arranca con ±0,5 mm puesto
 * (el mismo default que el backend aplica si llega vacío).
 */
export function CampoMedida({ label, valor, tolerancia, onValor, onTolerancia, ancho = 250 }) {
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
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>±</span>
        <TextField
          value={tolerancia}
          onChange={(e) => onTolerancia(e.target.value)}
          placeholder={TOLERANCIA_DEFECTO.replace('.', ',')}
          inputMode="decimal"
          aria-label={`Tolerancia de ${label}`}
          style={{ width: 62, flex: '0 0 62px', textAlign: 'right' }}
        />
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>mm</span>
      </div>
    </label>
  )
}
