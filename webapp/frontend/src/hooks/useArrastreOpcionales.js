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
  // Fila a la que se le apagó el arrastre para poder escribir en un recuadro
  // (ver propsCampoEditable). Se guarda para poder devolvérselo siempre.
  const filaBloqueada = React.useRef(null)

  const desbloquearFila = React.useCallback(() => {
    if (filaBloqueada.current) {
      filaBloqueada.current.draggable = true
      filaBloqueada.current = null
    }
  }, [])

  /*
   * El desbloqueo va en `document` y no en el recuadro: si se aprieta el mouse
   * sobre el precio y se suelta en cualquier otro lado —lo más común al querer
   * seleccionar el número—, el recuadro nunca recibe el mouseup y la fila
   * quedaría sin poder arrastrarse hasta que perdiera el foco.
   */
  React.useEffect(() => {
    document.addEventListener('mouseup', desbloquearFila)
    document.addEventListener('dragend', desbloquearFila)
    return () => {
      document.removeEventListener('mouseup', desbloquearFila)
      document.removeEventListener('dragend', desbloquearFila)
      desbloquearFila()
    }
  }, [desbloquearFila])

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
  const propsCampoEditable = React.useMemo(() => ({
    onMouseDown: (e) => {
      const fila = e.currentTarget.closest('[draggable]')
      if (!fila) return
      desbloquearFila()          // por si quedó otra a medio camino
      fila.draggable = false
      filaBloqueada.current = fila
    },
  }), [desbloquearFila])

  return { zonaActiva, propsFila, propsZona, propsCampoEditable }
}
