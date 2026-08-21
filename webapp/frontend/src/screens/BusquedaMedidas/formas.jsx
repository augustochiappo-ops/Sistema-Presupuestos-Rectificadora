import React from 'react'
import { Modal } from '../../components/Modal'

/*
 * La forma de una guía, dibujada.
 *
 * El catálogo la escribe como un código: "A-1-6" es el cuerpo A con los
 * detalles 1 y 6. La letra sola no le dice nada a nadie que no tenga la lámina
 * del catálogo al lado, así que acá se muestra el dibujo — recortado de esa
 * misma lámina, un archivo por forma en /formas/ (ver
 * scripts/recortar_formas_ryc.py).
 *
 * Las nueve letras dibujadas son las del catálogo RYC. Indy y Nubo usan las
 * mismas letras salvo la "N", que es de Indy y no está en la lámina: esa se
 * muestra sin dibujo, con el código solo. Un dibujo que no sabemos si
 * corresponde sería peor que ninguno.
 */

const LETRAS = ['A', 'B', 'C', 'E', 'F', 'G', 'L', 'M', 'P']
const DETALLES = ['detalle-1-2', 'detalle-3-6', 'detalle-7', 'detalle-8']

export const tieneDibujo = (letra) => LETRAS.includes(letra)

export function letraDe(forma) {
  return (forma || '').trim().charAt(0).toUpperCase()
}

export function DibujoForma({ letra, alto = 38, style }) {
  if (!tieneDibujo(letra)) return null
  return (
    <img
      src={`/formas/${letra}.png`}
      alt={`Forma ${letra}`}
      style={{ height: alto, width: 'auto', display: 'block', flexShrink: 0, ...style }}
    />
  )
}

/** Cómo se lee un código de forma, para el tooltip: "Cuerpo A · detalles 1 y 6". */
export function describirForma(forma) {
  const partes = (forma || '').split('-').filter(Boolean)
  if (!partes.length) return ''
  const [letra, ...detalles] = partes
  const cuerpo = `Cuerpo ${letra}`
  if (!detalles.length) return cuerpo
  const lista = detalles.length === 1
    ? detalles[0]
    : `${detalles.slice(0, -1).join(', ')} y ${detalles[detalles.length - 1]}`
  return `${cuerpo} · ${detalles.length === 1 ? 'detalle' : 'detalles'} ${lista}`
}

/** La celda de la tabla: el dibujo, el código, y un clic que abre la lámina. */
export function CeldaForma({ forma, onVerLamina }) {
  if (!forma) return <span style={{ color: 'var(--text-faint)' }}>—</span>
  const letra = letraDe(forma)
  return (
    <button
      type="button"
      onClick={onVerLamina}
      title={`${describirForma(forma)} — clic para ver la lámina`}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: 0,
        border: 'none', background: 'transparent', cursor: 'pointer',
        fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-body)',
      }}
    >
      <DibujoForma letra={letra} />
      <span>{forma}</span>
    </button>
  )
}

/*
 * El filtro: la fila de formas, dibujadas. Es un select con dibujos y no un
 * <select> de letras justamente porque la letra no se acuerda nadie — se
 * reconoce la que se tiene en la mano.
 */
export function FiltroFormas({ valores, valor, onCambiar, onVerLamina }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span
          style={{
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-2xs)',
            fontWeight: 'var(--weight-semibold)', letterSpacing: '.12em',
            textTransform: 'uppercase', color: 'var(--text-faint)',
          }}
        >
          Forma del cuerpo
        </span>
        <button
          type="button"
          onClick={onVerLamina}
          style={{
            border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)', textDecoration: 'underline',
          }}
        >
          Ver la lámina y qué significan los números
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {valores.map((letra) => {
          const activa = valor === letra
          return (
            <button
              key={letra}
              type="button"
              // Volver a tocar la forma elegida la saca: es la manera obvia de
              // deshacer y evita tener un botón "todas" al lado.
              onClick={() => onCambiar(activa ? '' : letra)}
              title={`Forma ${letra}`}
              aria-pressed={activa}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                width: 56, padding: '6px 4px', cursor: 'pointer',
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${activa ? 'var(--surface-inverse)' : 'var(--border-default)'}`,
                background: activa ? 'var(--surface-inverse)' : 'var(--surface-card)',
              }}
            >
              <span style={{ height: 44, display: 'flex', alignItems: 'center' }}>
                <DibujoForma
                  letra={letra}
                  alto={44}
                  // Sobre el fondo oscuro del botón elegido, el dibujo negro no
                  // se vería: se invierte.
                  style={activa ? { filter: 'invert(1)' } : undefined}
                />
                {!tieneDibujo(letra) && (
                  <span style={{
                    fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)',
                    color: activa ? 'var(--text-on-inverse)' : 'var(--text-muted)',
                  }}>
                    {letra}
                  </span>
                )}
              </span>
              <span style={{
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-2xs)',
                fontWeight: 'var(--weight-semibold)',
                color: activa ? 'var(--text-on-inverse)' : 'var(--text-muted)',
              }}>
                {letra}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** La lámina entera: las nueve formas y las cuatro figuras de detalles. */
export function ModalFormas({ open, onClose }) {
  return (
    <Modal open={open} title="Formas de guía del catálogo" onClose={onClose} maxWidth={860}>
      {/* El data-lamina no es decorativo: los mismos dibujos están en el filtro
          de arriba, y sin esto la suite no puede contar los de acá. */}
      <div data-lamina="formas">
      <p style={{ margin: '0 0 18px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-body)', lineHeight: 1.5 }}>
        La forma se escribe con la <strong>letra del cuerpo</strong> y los{' '}
        <strong>detalles numerados</strong> que tenga: <strong>A-1-6</strong> es el cuerpo A
        con los detalles 1 y 6.
      </p>

      {/* Las nueve en una sola fila: partidas en dos se leen como si fueran
          dos grupos de algo, y no lo son. */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 26 }}>
        {LETRAS.map((letra) => (
          <div key={letra} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 72 }}>
            <DibujoForma letra={letra} alto={104} />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>
              {letra}
            </span>
          </div>
        ))}
      </div>

      <h4 style={{ margin: '0 0 12px', fontFamily: 'var(--font-display)', fontSize: 'var(--text-base)', color: 'var(--text-strong)' }}>
        Los detalles, del 1 al 8
      </h4>
      <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {DETALLES.map((nombre) => (
          <img
            key={nombre}
            src={`/formas/${nombre}.png`}
            alt={`Detalles ${nombre.replace('detalle-', '').replace('-', ' a ')}`}
            style={{ height: 150, width: 'auto' }}
          />
        ))}
      </div>

      <p style={{ margin: '20px 0 0', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-faint)', lineHeight: 1.5 }}>
        Los dibujos son los del catálogo RYC. Las guías Indy y Nubo usan las mismas letras,
        salvo la <strong>N</strong> de Indy, que no está en esta lámina y por eso se muestra
        sin dibujo.
      </p>
      </div>
    </Modal>
  )
}
