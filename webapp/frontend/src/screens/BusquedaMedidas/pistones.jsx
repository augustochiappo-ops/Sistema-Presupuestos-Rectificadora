import React from 'react'
import { Modal } from '../../components/Modal'
import { CON_DIBUJO } from './dibujos-pistones'

/*
 * El dibujo del pistón de un subconjunto.
 *
 * El catálogo Mahle trae, al lado de cada código, el corte del pistón y su
 * vista de abajo. Es lo que se mira para saber de una si el pistón que se está
 * buscando es el que se tiene en la mano: la cámara en la cabeza, el rebaje de
 * las válvulas, la forma de la falda. Las medidas de la fila dicen cuánto mide;
 * el dibujo dice qué es.
 *
 * Los archivos salen de scripts/recortar_pistones_mahle.py, uno por código, en
 * /pistones/<código sin espacios>.png. Todos vienen con la MISMA PROPORCIÓN de
 * cuadro, así que pedidos con una altura fija se ven todos del mismo tamaño y
 * ninguno empuja el alto de la fila.
 *
 * No todos los subconjuntos tienen foto —se van agregando a medida que se
 * recortan del catálogo—, así que `CON_DIBUJO` (generado por el script) dice
 * cuáles sí. Salir a pedir el PNG para ver si está deja un cuadrito roto en la
 * tabla y un 404 por fila.
 */

/** El código como se llama el archivo: "S BE 14040" y "S BE14040" son el mismo. */
export const claveDe = (codigo) => (codigo || '').replace(/\s+/g, '')

export const tieneDibujo = (codigo) => CON_DIBUJO.has(claveDe(codigo))

// 56 px y no los 38 de las formas de guía: el dibujo del pistón son dos vistas
// una sobre la otra, y a la altura de una letra no se distingue la cabeza de la
// falda. Sigue entrando en el alto que ya tiene la fila.
export function DibujoPiston({ codigo, alto = 56, style }) {
  if (!tieneDibujo(codigo)) return null
  return (
    <img
      src={`/pistones/${claveDe(codigo)}.png`}
      alt={`Dibujo del pistón ${codigo}`}
      style={{ height: alto, width: 'auto', display: 'block', flexShrink: 0, ...style }}
    />
  )
}

/** La celda de la tabla: la miniatura, y un clic que la abre en grande. */
export function CeldaDibujo({ fila, onVer }) {
  if (!tieneDibujo(fila.codigo)) return <span style={{ color: 'var(--text-faint)' }}>—</span>
  return (
    <button
      type="button"
      onClick={onVer}
      title={`${fila.codigo} — clic para ver el dibujo en grande`}
      style={{
        display: 'flex', alignItems: 'center', padding: 0,
        border: 'none', background: 'transparent', cursor: 'zoom-in',
      }}
    >
      <DibujoPiston codigo={fila.codigo} />
    </button>
  )
}

/** El dibujo en grande, con la ficha del subconjunto al lado. */
export function ModalDibujo({ fila, onClose }) {
  return (
    <Modal open={Boolean(fila)} title={fila ? fila.codigo : ''} onClose={onClose} maxWidth={620}>
      {fila && (
        <div data-dibujo-piston={claveDe(fila.codigo)} style={{ display: 'flex', gap: 26, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <DibujoPiston codigo={fila.codigo} alto={320} />
          <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {fila.descripcion && (
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-base)', color: 'var(--text-strong)' }}>
                {fila.descripcion}
              </div>
            )}
            {fila.aplicacion && (
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-body)', lineHeight: 1.5 }}>
                {fila.aplicacion}
              </div>
            )}
            <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-faint)', lineHeight: 1.5 }}>
              El dibujo es el del catálogo del fabricante: arriba el corte del pistón, abajo la
              vista desde el perno. Todos se muestran del mismo tamaño, así que sirve para
              reconocer la forma, no para comparar medidas — esas están en la fila.
            </p>
          </div>
        </div>
      )}
    </Modal>
  )
}
