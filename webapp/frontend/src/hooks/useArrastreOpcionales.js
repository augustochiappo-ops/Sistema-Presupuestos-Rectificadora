import React from 'react'

/*
 * Arrastrar una línea del presupuesto a la caja de OPCIONALES (y de vuelta).
 *
 * Lo pidió el dueño así, con el mouse: "arrastro encamisar cilindros a la caja
 * de abajo y queda en ese grupo". El arrastre real no alcanza —en el celular no
 * existe—, así que cada fila lleva además un botón que hace exactamente lo
 * mismo; el hook solo resuelve la parte del arrastre.
 *
 * `clave` identifica la línea dentro de la pantalla (ej. "servicio:12",
 * "repuesto:CAAC02740 STD"): es lo único que viaja en el dataTransfer, porque
 * en HTML solo se puede arrastrar texto.
 */
export function useArrastreOpcionales(onMover) {
  const [zonaActiva, setZonaActiva] = React.useState(null)
  const arrastrando = React.useRef(null)

  const propsFila = React.useCallback((clave) => ({
    draggable: true,
    onDragStart: (e) => {
      arrastrando.current = clave
      e.dataTransfer.setData('text/plain', clave)
      e.dataTransfer.effectAllowed = 'move'
    },
    onDragEnd: () => { arrastrando.current = null; setZonaActiva(null) },
    style: { cursor: 'grab' },
  }), [])

  /** zona: true = caja de opcionales, false = caja del presupuesto. */
  const propsZona = React.useCallback((opcional) => ({
    onDragOver: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setZonaActiva(opcional) },
    onDragLeave: () => setZonaActiva((z) => (z === opcional ? null : z)),
    onDrop: (e) => {
      e.preventDefault()
      setZonaActiva(null)
      const clave = e.dataTransfer.getData('text/plain') || arrastrando.current
      arrastrando.current = null
      if (clave) onMover(clave, opcional)
    },
  }), [onMover])

  /*
   * Un recuadro editable adentro de una fila arrastrable. Sin esto, arrastrar
   * para seleccionar el texto de un precio arrastra la fila entera: el navegador
   * le da prioridad al drag del contenedor. Mientras el mouse está apretado
   * sobre el recuadro, la fila deja de ser arrastrable.
   */
  const propsCampoEditable = React.useMemo(() => {
    const filaDe = (e) => e.currentTarget.closest('[draggable]')
    const permitir = (e) => { const f = filaDe(e); if (f) f.draggable = true }
    return {
      onMouseDown: (e) => { const f = filaDe(e); if (f) f.draggable = false },
      onMouseUp: permitir,
      onBlur: permitir,
    }
  }, [])

  return { zonaActiva, propsFila, propsZona, propsCampoEditable }
}
