import React from 'react'
import { api } from '../../../api/client'
import { SearchInput } from '../../../components/SearchInput'
import { TextField } from '../../../components/TextField'
import { CampoMonto } from '../../../components/CampoMonto'
import { CampoCantidad } from '../../../components/CampoCantidad'
import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import { ContadorServicio } from '../../../components/ContadorServicio'
import { SelectorCantidadServicio } from '../../../components/SelectorCantidadServicio'
import { DataTable } from '../../../components/DataTable'
import { formatPrecioARS, parsePrecioARS } from '../../../utils/format'
import {
  lineasServicios, totalLineas, totalLineasOpcionales, hayPreciosInvalidos,
  precioEfectivo, estaPisado, esOpcional,
  conCantidadServicio, conPrecioServicio, conSubtotalServicio, sinPrecioPisado,
  conDescripcionManual, esManualVacio, hayDescripcionesVacias, sinManualesVacios,
} from '../../../utils/servicios'
import { textoSubtotal, unitarioDesdeSubtotal } from '../../../utils/precios'
import { CajaOpcionales, BotonOpcional } from '../../../components/CajaOpcionales'
import { useArrastreOpcionales } from '../../../hooks/useArrastreOpcionales'
import { coincideBusqueda, normalizarTexto } from '../../../utils/texto'
import { useUndo } from '../../../context/UndoContext'
import { ServiciosGuardados } from './ServiciosGuardados'

const tituloSeccion = {
  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
  letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-faint)',
}

const botonIcono = {
  border: 'none', background: 'transparent', cursor: 'pointer',
  color: 'var(--text-faint)', display: 'flex', padding: 2,
}

// Id de un ítem manual. Lleva algo al azar además de la hora porque el renglón
// en blanco de cada caja necesita el suyo ya armado ANTES de que se escriba
// nada (ver idsNuevos), y los dos se arman en el mismo milisegundo.
const nuevoIdManual = () => `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

const chipEditado = {
  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
  color: 'var(--text-muted)', background: 'var(--surface-sunken)',
  borderRadius: 'var(--radius-pill)', padding: '1px 8px', whiteSpace: 'nowrap',
}

// Componente controlado: la selección (value = {cantidades, customItems, grupos,
// precios}) vive en el wizard, así volver atrás desde el paso de repuestos no la
// pierde.
// cantidades: { [servicioId]: cantidad } — un servicio sin entrada (o en 0) no
// está incluido en el presupuesto; cantidad > 1 multiplica el precio de lista
// (ej. "Reunir cilindros" ×4 en un motor de 4 cilindros).
// grupos: { [servicioId]: 'a'|'b' } — a qué familia de cantidades rápidas
// pertenece la última elección hecha desde el botón "+" de ese ítem ('a' para
// 4/8/16, 'b' para 6/12). Solo se usa para decidir qué par muestran los
// recuadros adaptativos (ver parAdaptativo más abajo); tipear a mano no tagea.
// precios: { [servicioId]: { valor, texto } } — el unitario pisado a mano desde
// la tabla de la derecha. Ver utils/servicios.js. Se pisa escribiendo el
// unitario o el subtotal: el que se escribe manda y el otro se recalcula.
// opcionales: claves de las líneas que pasaron a la caja de OPCIONALES — siguen
// en el presupuesto y salen en el PDF, pero no suman al total.
export function PasoServicios({ motor, value, onChange, ajustePct, onAjustePctChange, onSiguiente }) {
  const [servicios, setServicios] = React.useState([])
  const [favoritos, setFavoritos] = React.useState(new Set())
  const [busqueda, setBusqueda] = React.useState('')
  const [nuevoCustomDesc, setNuevoCustomDesc] = React.useState('')
  const [nuevoCustomPrecio, setNuevoCustomPrecio] = React.useState('')
  const [ajusteTexto, setAjusteTexto] = React.useState(ajustePct ? String(ajustePct) : '')
  // % persistente sobre la lista de la Cámara, configurado en "Editar Precios".
  // Se lee solo para avisarlo al lado del ajuste de ESTE presupuesto: son dos
  // porcentajes distintos sobre la misma mano de obra, y aplicar uno sin saber
  // del otro es el error más fácil de cometer.
  const [ajusteGeneral, setAjusteGeneral] = React.useState(0)
  // Servicios cuyo precio pisado ya se guardó como precio propio del taller,
  // para mostrar el acuse y no ofrecer guardar dos veces lo mismo.
  const [preciosGuardados, setPreciosGuardados] = React.useState({})
  const [guardandoPrecio, setGuardandoPrecio] = React.useState(null)
  const { avisarBorrado, borrarConDeshacer, estaPendiente } = useUndo()

  // Trabajos escritos a mano que se guardaron con el disquete (ver
  // ServiciosGuardados). null = todavía no llegaron.
  const [guardados, setGuardados] = React.useState(null)
  const [verGuardados, setVerGuardados] = React.useState(false)
  const [guardandoTrabajo, setGuardandoTrabajo] = React.useState(null)

  /*
   * El renglón en blanco de abajo de cada tabla (pedido del dueño, 2026-10-16).
   *
   * Cada caja tiene uno, con su id ya elegido. Escribir CUALQUIER cosa en él lo
   * convierte en un ítem manual de verdad con ESE id, y se arma otro renglón en
   * blanco con un id nuevo. Que el ítem herede el id del renglón es lo que
   * permite seguir escribiendo sin que se pierda el cursor: la tabla usa el id
   * como key, así que React reusa la misma fila y los mismos recuadros, y lo
   * único que cambia es que abajo aparece otra fila en blanco.
   */
  const [idsNuevos, setIdsNuevos] = React.useState(() => ({ cotiza: nuevoIdManual(), opcional: nuevoIdManual() }))

  const cantidades = value.cantidades
  const customItems = value.customItems
  const grupos = value.grupos

  React.useEffect(() => {
    api.get(`/motores/${motor.id}/servicios`).then(setServicios)
    api.get('/servicios/favoritos').then((ids) => setFavoritos(new Set(ids)))
    // Si falla no pasa nada: el aviso del ajuste general es informativo y su
    // ausencia no puede romper el armado de un presupuesto.
    api.get('/precios/ajuste-general').then((d) => setAjusteGeneral(d.pct)).catch(() => {})
  }, [motor.id])

  React.useEffect(() => {
    // Mismo criterio que el ajuste general: si falla, el desplegable queda
    // vacío y el presupuesto se arma igual.
    api.get('/servicios/guardados', { alActualizar: setGuardados })
      .then(setGuardados)
      .catch(() => setGuardados([]))
  }, [])

  const guardadosVisibles = React.useMemo(
    () => (guardados || []).filter((g) => !estaPendiente(`servicio-guardado-${g.id}`)),
    [guardados, estaPendiente],
  )

  /** ¿Este renglón manual ya está guardado, y con este mismo precio? */
  const trabajoGuardado = (fila) => {
    const clave = normalizarTexto(fila.descripcion)
    return guardadosVisibles.some((g) => normalizarTexto(g.descripcion) === clave && g.precio === fila.precioUnitario)
  }

  /*
   * El disquete de un renglón escrito a mano: lo deja en la lista de trabajos
   * guardados para los próximos presupuestos. Si ya había uno con la misma
   * descripción, el backend le actualiza el precio (no lo duplica).
   */
  const guardarTrabajo = async (fila) => {
    if (!fila.descripcion?.trim() || fila.precioUnitario == null) return
    setGuardandoTrabajo(fila.id)
    try {
      await api.post('/servicios/guardados', { descripcion: fila.descripcion, precio: fila.precioUnitario })
      setGuardados(await api.get('/servicios/guardados'))
    } catch {
      // No frena el presupuesto: el trabajo sigue en este renglón igual, y el
      // disquete queda a la vista para volver a intentarlo.
    } finally {
      setGuardandoTrabajo(null)
    }
  }

  /** Tocar un trabajo guardado: entra al presupuesto con su precio. */
  const agregarGuardado = (g) => onChange((actual) => ({
    ...actual,
    customItems: [...(actual.customItems || []), {
      id: nuevoIdManual(),
      descripcion_custom: g.descripcion,
      precio_aplicado: g.precio,
      precioTexto: g.precio == null ? '' : formatPrecioARS(g.precio),
      cantidad: 1,
    }],
  }))

  // El tacho del desplegable. Es un borrado en el servidor, así que espera los
  // segundos del cartel "Deshacer" antes de hacerse (mismo patrón que borrar
  // un cliente).
  const borrarGuardado = (g) => borrarConDeshacer({
    mensaje: `Se sacó «${g.descripcion}» de los trabajos guardados.`,
    clave: `servicio-guardado-${g.id}`,
    ejecutar: async () => {
      await api.del(`/servicios/guardados/${g.id}`)
      setGuardados((prev) => (prev || []).filter((x) => x.id !== g.id))
    },
  })

  /*
   * Guardar un precio pisado como precio propio del taller.
   *
   * Es explícito y de a una línea a propósito: un precio especial para un
   * cliente y una decisión de tarifa son cosas distintas. Si cada edición se
   * guardara sola, el descuento de hoy sería el precio de la casa mañana, sin
   * que nadie se enterara. Queda además el resumen del paso de Revisión, para
   * el que prefiere decidirlo todo junto al final.
   */
  const guardarPrecioPropio = async (fila) => {
    if (!motor?.lista_num || fila.esManual || fila.precioUnitario == null) return
    setGuardandoPrecio(fila.servicioId)
    try {
      await api.post('/precios/mano-obra', {
        servicio_id: fila.servicioId,
        lista_num: motor.lista_num,
        precio: fila.precioUnitario,
        origen: 'presupuesto',
      })
      setPreciosGuardados((g) => ({ ...g, [fila.servicioId]: fila.precioUnitario }))
    } catch {
      // El precio del presupuesto no se toca: guardarlo en la tarifa es un
      // extra, y que falle no puede frenar la cotización que se está armando.
      setPreciosGuardados((g) => ({ ...g, [fila.servicioId]: 'error' }))
    } finally {
      setGuardandoPrecio(null)
    }
  }

  const toggleFavorito = async (id) => {
    const data = await api.post(`/servicios/${id}/favorito`)
    setFavoritos((prev) => {
      const next = new Set(prev)
      if (data.favorito) next.add(id); else next.delete(id)
      return next
    })
  }

  // Tipeo a mano en el recuadro: fija la cantidad tal cual y limpia el tag de
  // grupo (un valor tipeado a mano no participa del cálculo del par adaptativo).
  // Sacar el servicio del presupuesto (cantidad 0) también borra su precio
  // pisado y su marca de opcional: nada que ya no se ve en ningún lado puede
  // volver solo si el servicio se agrega de nuevo más tarde.
  const cambiarCantidad = (id, cantidad) => onChange(
    conCantidadServicio(value, { servicioId: id, esManual: false }, cantidad),
  )

  // Botón "+" o recuadro adaptativo: fija la cantidad y tagea el ítem con su
  // familia (4/8/16 → 'a', 6/12 → 'b') para que el par adaptativo global se
  // recalcule según cuál familia predomina en el presupuesto.
  const elegirCantidad = (id, cantidad) => {
    onChange({
      ...value,
      cantidades: { ...cantidades, [id]: cantidad },
      grupos: { ...grupos, [id]: (cantidad === 6 || cantidad === 12) ? 'b' : 'a' },
    })
  }

  // Click en cualquier parte de la fila (fuera de los controles): suma 1 a la
  // cantidad actual, sin tocar el tag de grupo.
  const sumarUno = (id) => {
    onChange({ ...value, cantidades: { ...cantidades, [id]: (cantidades[id] || 0) + 1 } })
  }

  // Par que muestran los recuadros adaptativos: la familia con más ítems
  // activos (cantidad > 0) en el presupuesto gana; empate (incluido el caso
  // inicial, sin nada elegido todavía) se resuelve a favor de 4/8.
  const parAdaptativo = React.useMemo(() => {
    let cuentaA = 0
    let cuentaB = 0
    Object.entries(grupos).forEach(([id, g]) => {
      if ((cantidades[id] || 0) <= 0) return
      if (g === 'b') cuentaB += 1
      else cuentaA += 1
    })
    return cuentaB > cuentaA ? [6, 12] : [4, 8]
  }, [grupos, cantidades])

  const agregarCustom = () => {
    const desc = nuevoCustomDesc.trim()
    const precio = parsePrecioARS(nuevoCustomPrecio)
    if (!desc || precio === null) return
    onChange({
      ...value,
      customItems: [...customItems, {
        id: `custom-${Date.now()}`,
        descripcion_custom: desc,
        precio_aplicado: precio,
        precioTexto: formatPrecioARS(precio),
        cantidad: 1,
      }],
    })
    setNuevoCustomDesc('')
    setNuevoCustomPrecio('')
  }

  const cambiarCantidadCustom = (id, cantidad) => onChange({
    ...value,
    customItems: customItems.map((c) => (c.id === id ? { ...c, cantidad: Math.max(0, cantidad) } : c)),
  })

  const quitarCustom = (id) => {
    const antes = value
    const it = customItems.find((c) => c.id === id)
    onChange({
      ...value,
      customItems: customItems.filter((c) => c.id !== id),
      opcionales: (value.opcionales || []).filter((c) => String(c) !== String(id)),
    })
    avisarBorrado({
      mensaje: `Se quitó ${it?.descripcion_custom || 'el ítem'} del presupuesto.`,
      onDeshacer: () => onChange(antes),
    })
  }

  /** Vuelve al precio de la lista de la Cámara (con el ajuste %). */
  const restaurarPrecio = (fila) => onChange(sinPrecioPisado(value, fila))

  /*
   * Pisar el precio unitario desde la tabla de la derecha. Se guarda el texto
   * tal cual se tipea (para no pelearle al cursor mientras se escribe) y el
   * valor parseado aparte; un texto que no se entiende deja el valor en null,
   * pinta el recuadro en rojo y apaga "Siguiente".
   *
   * Vaciar el recuadro de un servicio de la Cámara devuelve el precio de lista:
   * es la misma salida que el botón ↺, escribiendo.
   */
  const cambiarPrecio = (fila, texto) => {
    if (fila.esNuevo) {
      if (texto.trim()) crearDesdeRenglonNuevo(fila.opcional, { precio_aplicado: parsePrecioARS(texto), precioTexto: texto })
      return
    }
    onChange(conPrecioServicio(value, fila, texto))
  }

  /*
   * Subtotal editable. Es la misma casilla del unitario vista al revés: se
   * reparte lo tipeado entre la cantidad y lo que queda es el unitario, que es
   * el que se guarda. Con cantidad 0 no se puede repartir, así que el valor
   * queda inválido (recuadro rojo) en vez de inventar un número.
   */
  const cambiarSubtotal = (fila, texto) => {
    if (fila.esNuevo) {
      // El renglón en blanco arranca con cantidad 1: el subtotal ES el unitario.
      if (!texto.trim()) return
      const { valor } = unitarioDesdeSubtotal(texto, 1)
      crearDesdeRenglonNuevo(fila.opcional, {
        precio_aplicado: valor, precioTexto: valor === null ? texto : formatPrecioARS(valor),
      })
      return
    }
    onChange(conSubtotalServicio(value, fila, texto))
  }

  /*
   * Lo primero que se escribe en el renglón en blanco de una caja: crea el ítem
   * manual con el id que ya tenía el renglón (ver idsNuevos) y arma otro renglón
   * en blanco abajo. Un renglón de la caja de Opcionales nace opcional.
   */
  const crearDesdeRenglonNuevo = (opcional, campos) => {
    const id = opcional ? idsNuevos.opcional : idsNuevos.cotiza
    onChange((actual) => {
      if ((actual.customItems || []).some((c) => c.id === id)) return actual
      return {
        ...actual,
        customItems: [...(actual.customItems || []), {
          id, descripcion_custom: '', precio_aplicado: null, precioTexto: '', cantidad: 1, ...campos,
        }],
        opcionales: opcional ? [...(actual.opcionales || []), id] : (actual.opcionales || []),
      }
    })
    setIdsNuevos((ids) => ({ ...ids, [opcional ? 'opcional' : 'cotiza']: nuevoIdManual() }))
  }

  const escribirDescripcion = (fila, texto) => {
    if (fila.esNuevo) {
      if (texto.trim()) crearDesdeRenglonNuevo(fila.opcional, { descripcion_custom: texto })
      return
    }
    onChange(conDescripcionManual(value, fila, texto))
  }

  /** La cantidad, escrita en la tabla de la derecha. CampoCantidad avisa sólo
   *  números mayores que cero: sacar una línea es la ✕, no un recuadro en 0. */
  const escribirCantidad = (fila, n) => {
    if (fila.esNuevo) {
      crearDesdeRenglonNuevo(fila.opcional, { cantidad: n })
      return
    }
    onChange(conCantidadServicio(value, fila, n))
  }

  /** La ✕ de un renglón de la tabla de la derecha: lo saca del presupuesto. */
  const quitarLinea = (fila) => {
    const antes = value
    onChange(conCantidadServicio(value, fila, 0))
    if (fila.vacia) return
    avisarBorrado({
      mensaje: `Se quitó ${fila.descripcion || 'el renglón'} del presupuesto.`,
      onDeshacer: () => onChange(antes),
    })
  }

  /*
   * Un renglón escrito a mano que se borró entero (sin descripción ni precio)
   * desaparece cuando el cursor sale de él. No antes: mientras se está
   * escribiendo, sacarlo se llevaría el cursor puesto.
   */
  const salirDelRenglon = (e, fila) => {
    if (e.currentTarget.contains(e.relatedTarget)) return
    onChange((actual) => {
      const item = (actual.customItems || []).find((c) => c.id === fila.id)
      if (!item || !esManualVacio(item)) return actual
      return {
        ...actual,
        customItems: actual.customItems.filter((c) => c.id !== fila.id),
        opcionales: (actual.opcionales || []).filter((c) => String(c) !== String(fila.id)),
      }
    })
  }

  /** Enter en un recuadro escrito a mano: salta al renglón en blanco de su caja,
   *  para cargar varios trabajos seguidos sin tocar el mouse. */
  const enterAlRenglonNuevo = (e, opcional) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    document.querySelector(`input[data-renglon-nuevo="${opcional ? 'opcional' : 'cotiza'}"]`)?.focus()
  }

  /* Pasar una línea a la caja de opcionales, o traerla de vuelta. Lo hacen el
     arrastre y la flechita del renglón: los dos terminan acá. */
  const moverOpcional = React.useCallback((clave, opcional) => {
    onChange((actual) => {
      const previas = (actual.opcionales || []).filter((c) => String(c) !== String(clave))
      return { ...actual, opcionales: opcional ? [...previas, clave] : previas }
    })
  }, [onChange])

  const { zonaActiva, propsFila, propsZona, propsCampoEditable } = useArrastreOpcionales(moverOpcional)

  const filtrados = servicios.filter(
    (s) => coincideBusqueda([String(s.item_num), s.descripcion], busqueda),
  )
  const favoritosVisibles = filtrados.filter((s) => favoritos.has(s.id))
  const restoVisibles = filtrados.filter((s) => !favoritos.has(s.id))

  // Aumento/descuento en % sobre la mano de obra (positivo = aumento, negativo
  // = descuento). Solo afecta los precios de lista de servicios FACRA — los
  // ítems manuales y los renglones con el precio pisado a mano ya tienen un
  // precio elegido a mano, no se ajustan de nuevo.
  const aplicarAjusteTexto = (texto) => {
    setAjusteTexto(texto)
    const normalizado = texto.replace(',', '.').trim()
    if (normalizado === '' || normalizado === '-') {
      onAjustePctChange(0)
      return
    }
    const n = parseFloat(normalizado)
    onAjustePctChange(Number.isNaN(n) ? 0 : n)
  }

  const colorAjuste = ajustePct > 0 ? 'var(--status-active-fg)' : ajustePct < 0 ? 'var(--status-expired-fg)' : 'var(--border-default)'

  // Previsualización del lado derecho: todo lo que ya está incluido en el
  // presupuesto (catálogo + ítems manuales), con su subtotal ya calculado. Es
  // también donde se edita el precio unitario, así que es la misma lista que
  // alimenta el total y el paso de Revisión.
  const filasPreview = lineasServicios(servicios, value, ajustePct)
  const filasCotizan = filasPreview.filter((f) => !f.opcional)
  const filasOpcionales = filasPreview.filter((f) => f.opcional)
  const total = totalLineas(filasPreview)
  const totalOpcionales = totalLineasOpcionales(filasPreview)
  const preciosInvalidos = hayPreciosInvalidos(filasPreview)
  const descripcionesVacias = hayDescripcionesVacias(filasPreview)
  // Un trabajo escrito a mano al que todavía no se le puso precio: el aviso de
  // "un precio que no se entiende" no le cabe, le falta, que es otra cosa.
  const sinPrecio = filasPreview.find((l) => l.esManual && !l.vacia && !String(l.precioTexto ?? '').trim())
  const bloqueado = preciosInvalidos || descripcionesVacias
  let aviso = null
  if (descripcionesVacias) aviso = 'Hay un trabajo escrito a mano sin descripción. Escribila, o sacá el renglón con la ✕, para poder seguir.'
  else if (sinPrecio) aviso = `Falta el precio de «${sinPrecio.descripcion.trim()}». Escribilo para poder seguir.`
  else if (preciosInvalidos) aviso = 'Hay un precio que no se entiende como número. Corregilo para poder seguir.'

  // El renglón en blanco del final de cada tabla (ver idsNuevos). Lleva los
  // mismos campos que una línea para que las columnas lo dibujen sin casos
  // especiales salvo donde importa.
  const renglonNuevo = (opcional) => ({
    id: opcional ? idsNuevos.opcional : idsNuevos.cotiza,
    esNuevo: true, esManual: true, opcional,
    descripcion: '', cantidad: null, precioTexto: '', precioUnitario: undefined, subtotal: undefined,
  })

  // Pintar un recuadro en rojo: sólo en una línea de verdad. El renglón en
  // blanco y uno manual borrado entero no tienen nada mal, están vacíos.
  const rojoSi = (fila, condicion) => (!fila.esNuevo && !fila.vacia && condicion ? 'var(--status-expired-fg)' : undefined)

  // Las filas de la tabla: arrastrables (salvo el renglón en blanco, que no
  // es todavía nada que mover) y, las escritas a mano, con la limpieza de
  // salirDelRenglon. El renglón en blanco va con fondo gris: es el lugar
  // donde se escribe, no una línea más del presupuesto.
  const propsDeFila = (fila) => {
    if (fila.esNuevo) return {}
    return {
      ...propsFila(String(fila.id)),
      ...(fila.esManual ? { onBlur: (e) => salirDelRenglon(e, fila) } : {}),
    }
  }

  // wrap:true en subtotal: aunque el ancho de columna no alcance para un monto
  // grande, el valor pasa a una segunda línea en vez de recortarse con "…".
  // Sin useMemo a propósito: las celdas editables capturan value/onChange, y
  // memorizarlas las dejaría escribiendo sobre una selección vieja.
  const columnasPreview = [
    {
      key: 'descripcion',
      header: 'Descripción',
      wrap: true,
      // Los trabajos de la lista de la Cámara se leen y nada más: su nombre es
      // el de la lista. Los escritos a mano (y el renglón en blanco) se
      // escriben acá mismo.
      //
      // OJO al tocar esto: el renglón en blanco y el ítem manual que nace de él
      // tienen que dibujar EXACTAMENTE los mismos elementos en el mismo orden
      // (el lápiz va adentro de un lugar fijo que en los demás queda vacío).
      // Si cambiaran, React no podría reusar el recuadro al convertir el
      // renglón en ítem, y el cursor se perdería con la primera letra.
      render: (_, fila) => (fila.esManual ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{ display: 'flex', flex: 'none', width: 14, color: 'var(--text-faint)' }}
            title={fila.esNuevo ? 'Renglón nuevo: escribí un trabajo que no esté en la lista' : undefined}
          >
            {fila.esNuevo && <Icon n="pencil" s={14} />}
          </span>
          <TextField
            value={fila.descripcion ?? ''}
            onChange={(e) => escribirDescripcion(fila, e.target.value)}
            onKeyDown={(e) => enterAlRenglonNuevo(e, fila.opcional)}
            {...propsCampoEditable}
            data-renglon-nuevo={fila.esNuevo ? (fila.opcional ? 'opcional' : 'cotiza') : undefined}
            placeholder={fila.esNuevo ? 'Otro trabajo…' : 'Descripción'}
            title={fila.esNuevo ? 'Escribí un trabajo que no está en la lista: queda como un renglón más' : 'Descripción — se puede editar'}
            style={{ minWidth: 0, borderColor: rojoSi(fila, fila.descripcionVacia) }}
          />
        </span>
      ) : fila.descripcion),
    },
    {
      key: 'cantidad',
      header: 'Cant.',
      align: 'center',
      width: 78,
      // wrap:true para que la celda no recorte el recuadro con un "…".
      wrap: true,
      render: (_, fila) => (
        <CampoCantidad
          cantidad={fila.esNuevo ? '' : fila.cantidad}
          onCambiar={(n) => escribirCantidad(fila, n)}
          onKeyDown={fila.esManual ? (e) => enterAlRenglonNuevo(e, fila.opcional) : undefined}
          {...propsCampoEditable}
          placeholder={fila.esNuevo ? '1' : undefined}
          title="Cantidad — se puede editar"
          style={{ width: 48, textAlign: 'center', padding: '0 4px' }}
        />
      ),
    },
    {
      key: 'precioUnitario',
      header: 'P. unitario',
      align: 'right',
      width: 178,
      // wrap:true no por el texto sino para que la celda no recorte: con
      // overflow hidden el ↺ dejaba asomando el "…" del ellipsis al lado del
      // precio (se ve en la captura que mandó el dueño el 2026-08-19).
      wrap: true,
      render: (_, fila) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
          <TextField
            value={fila.precioTexto ?? ''}
            onChange={(e) => cambiarPrecio(fila, e.target.value)}
            onKeyDown={fila.esManual ? (e) => enterAlRenglonNuevo(e, fila.opcional) : undefined}
            {...propsCampoEditable}
            placeholder={fila.esNuevo ? 'P. unitario' : undefined}
            title="Precio unitario — se puede editar"
            style={{
              width: 122, textAlign: 'right',
              borderColor: rojoSi(fila, fila.precioUnitario === null || fila.precioUnitario === undefined),
            }}
          />
          {/* Guardar este precio como el del taller, para que salga así en los
              próximos presupuestos. Explícito y de a uno: ver guardarPrecioPropio. */}
          {/* La última condición evita ofrecer guardar un precio que ya es la
              tarifa: sería una escritura que no cambia nada y un renglón de
              historial que no registra ningún cambio. */}
          {fila.pisado && !fila.esManual && motor?.lista_num
            && fila.precioUnitario !== fila.precioLista && (
            preciosGuardados[fila.servicioId] === fila.precioUnitario ? (
              <span
                style={{ display: 'flex', color: 'var(--status-active-fg)', padding: 2 }}
                title="Guardado como tu precio: desde ahora sale así. Se puede deshacer en Editar Precios."
              >
                <Icon n="check" s={14} />
              </span>
            ) : (
              <button
                type="button"
                onClick={() => guardarPrecioPropio(fila)}
                disabled={guardandoPrecio === fila.servicioId || fila.precioUnitario == null}
                title={`Guardar ${formatPrecioARS(fila.precioUnitario)} como tu precio para este trabajo (lista ${motor.lista_num}). Se usa en los próximos presupuestos; este no cambia.`}
                style={botonIcono}
              >
                <Icon n="save" s={14} />
              </button>
            )
          )}
          {/* El disquete de un trabajo escrito a mano: lo guarda para los
              próximos presupuestos (aparece en el botón del disquete que está
              al lado del buscador). Recién cuando tiene descripción y precio:
              antes no hay nada que guardar. */}
          {fila.esManual && !fila.esNuevo && !fila.descripcionVacia && fila.precioUnitario != null && (
            trabajoGuardado(fila) ? (
              <span
                style={{ display: 'flex', color: 'var(--status-active-fg)', padding: 2 }}
                title="Guardado: está en el disquete de al lado del buscador, para los próximos presupuestos."
              >
                <Icon n="check" s={14} />
              </span>
            ) : (
              <button
                type="button"
                onClick={() => guardarTrabajo(fila)}
                disabled={guardandoTrabajo === fila.id}
                title={`Guardar «${fila.descripcion.trim()}» a ${formatPrecioARS(fila.precioUnitario)} para usarlo en otros presupuestos (queda en el disquete de al lado del buscador)`}
                style={botonIcono}
              >
                <Icon n="save" s={14} />
              </button>
            )
          )}
          {/* El ↺ solo tiene sentido con un precio de lista atrás: un ítem
              manual no tiene a dónde volver. */}
          {fila.pisado && (
            <button
              type="button"
              onClick={() => restaurarPrecio(fila)}
              title="Volver al precio de la lista"
              style={botonIcono}
            >
              <Icon n="rotate-cw" s={14} />
            </button>
          )}
        </span>
      ),
    },
    {
      key: 'subtotal',
      header: 'Subtotal',
      align: 'right',
      width: 150,
      wrap: true,
      // El subtotal también se edita: escribirlo recalcula el unitario. Manda
      // el último que se tocó (ver utils/precios.js).
      render: (_, fila) => (
        <CampoMonto
          valor={textoSubtotal(fila.precioUnitario, fila.cantidad)}
          onEscribir={(texto) => cambiarSubtotal(fila, texto)}
          onKeyDown={fila.esManual ? (e) => enterAlRenglonNuevo(e, fila.opcional) : undefined}
          {...propsCampoEditable}
          placeholder={fila.esNuevo ? 'Subtotal' : undefined}
          title="Subtotal — se puede editar; el precio unitario se recalcula solo"
          style={{
            width: 120, textAlign: 'right', fontWeight: 600,
            borderColor: rojoSi(fila, fila.subtotal === null || fila.subtotal === undefined),
          }}
        />
      ),
    },
    {
      key: 'opcional',
      header: '',
      align: 'center',
      width: 72,
      wrap: true,
      // El renglón en blanco no lleva ni flechita ni ✕: todavía no es nada que
      // mover ni que sacar.
      render: (_, fila) => (fila.esNuevo ? null : (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          <BotonOpcional
            opcional={fila.opcional}
            onClick={() => moverOpcional(String(fila.id), !fila.opcional)}
          />
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); quitarLinea(fila) }}
            title="Sacar del presupuesto"
            style={botonIcono}
          >
            <Icon n="x" s={15} />
          </button>
        </span>
      )),
    },
  ]

  const Fila = ({ s }) => {
    const cantidad = cantidades[s.id] || 0
    const precio = precioEfectivo(s, value, ajustePct)
    const pisado = estaPisado(s.id, value)
    return (
      <div
        onClick={() => sumarUno(s.id)}
        style={{
          display: 'grid', gridTemplateColumns: '32px auto 1fr 150px', alignItems: 'center', gap: 10,
          padding: '10px 16px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
          background: cantidad > 0 ? 'var(--status-active-bg)' : 'transparent',
        }}
      >
        <span
          onClick={(e) => { e.stopPropagation(); toggleFavorito(s.id) }}
          style={{ display: 'flex', cursor: 'pointer', color: favoritos.has(s.id) ? '#e8b400' : 'var(--text-faint)' }}
        >
          <Icon n="star" s={16} style={{ fill: favoritos.has(s.id) ? '#e8b400' : 'none' }} />
        </span>
        <SelectorCantidadServicio
          cantidad={cantidad}
          par={parAdaptativo}
          onEscribir={(n) => cambiarCantidad(s.id, n)}
          onElegir={(n) => elegirCantidad(s.id, n)}
        />
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>{s.descripcion}</span>
        {/* El precio de la izquierda es el mismo que cotiza el presupuesto: si
            se pisó a mano en la tabla de la derecha, se ve el pisado. */}
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
          {esOpcional(s.id, value) && <span style={chipEditado}>opcional</span>}
          {pisado && <span style={chipEditado}>editado</span>}
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-strong)', fontWeight: 600 }}>
            {formatPrecioARS(precio)}
          </span>
        </span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Total y "Siguiente" arriba de todo: no hace falta bajar hasta el final
          de la lista de servicios para ver cuánto lleva el presupuesto o avanzar. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: '16px 20px', background: 'var(--surface-inverse)', borderRadius: 'var(--radius-xl)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {/* "De este presupuesto" y no "mano de obra" a secas: desde que
                existe el aumento general de la pantalla Editar Precios hay dos
                porcentajes sobre la misma mano de obra, y el nombre tiene que
                decir cuál es cuál. Éste es la palanca de UNA cotización ("a este
                cliente -10%"); el otro es parte de la tarifa y vale para todos. */}
            <label style={{ fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.65)' }}>
              Ajuste de este presupuesto
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={ajusteTexto}
                onChange={(e) => aplicarAjusteTexto(e.target.value)}
                title="Porcentaje de aumento (positivo) o descuento (negativo) sobre la mano de obra, solo para este presupuesto"
                style={{
                  width: 64, height: 34, textAlign: 'center', borderRadius: 8,
                  border: `2px solid ${colorAjuste}`, background: '#fff', color: 'var(--text-strong)',
                  fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, outline: 'none',
                }}
              />
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'rgba(255,255,255,.75)' }}>%</span>
            </div>
            {/* Sin este aviso es fácil sumar 25 acá encima de un 25 que ya está
                puesto en la tarifa y cotizar un 56% más caro sin querer. */}
            {ajusteGeneral !== 0 && (
              <span
                style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'rgba(255,255,255,.6)' }}
                title="Configurado en Editar Precios. Ya viene aplicado en los precios de esta pantalla."
              >
                tu lista ya tiene {ajusteGeneral > 0 ? '+' : ''}{ajusteGeneral}%
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-md)', fontWeight: 600, color: '#fff' }}>Total servicios</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 700, color: '#fff' }}>{formatPrecioARS(total)}</span>
          </div>
          {totalOpcionales > 0 && (
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'rgba(255,255,255,.75)' }}>
              Opcionales <strong style={{ color: '#fff' }}>{formatPrecioARS(totalOpcionales)}</strong>
              <span style={{ opacity: .8 }}> (fuera del total)</span>
            </span>
          )}
        </div>
        {/* Se puede seguir sin servicios: un presupuesto puede ser de solo repuestos.
            La validación de "al menos un ítem" está en el paso de confirmación. */}
        <Button
          variant="secondary"
          iconRight={<Icon n="chevron-right" s={16} />}
          disabled={bloqueado}
          onClick={() => {
            // Los renglones escritos a mano y borrados enteros no pasan al
            // paso siguiente: no son nada (ver esManualVacio).
            onChange(sinManualesVacios(value))
            onSiguiente(total, totalOpcionales)
          }}
          style={{ background: '#fff', border: 'none', color: 'var(--text-strong)' }}
        >
          Siguiente: Repuestos
        </Button>
      </div>

      {aviso && (
        <div style={{ textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--status-expired-fg)' }}>
          {aviso}
        </div>
      )}

      {/* Izquierda: catálogo completo de mano de obra para ir eligiendo.
          Derecha: previsualización de cómo va quedando el presupuesto. */}
      <div className="servicios-picker-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          {/* Al lado del buscador, el disquete: los trabajos escritos a mano
              que se guardaron en presupuestos anteriores (ver
              ServiciosGuardados). aria-pressed y no aria-expanded: la suite
              de UI cuenta los aria-expanded de la página como grupos. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SearchInput icon={<Icon n="search" s={16} />} placeholder="Buscar por número o descripción…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            <button
              type="button"
              onClick={() => setVerGuardados((v) => !v)}
              aria-pressed={verGuardados}
              title="Trabajos guardados: los que escribiste a mano y guardaste con el disquete"
              style={{
                position: 'relative', flex: 'none', width: 44, height: 44, borderRadius: 'var(--radius-pill)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                border: `1px solid ${verGuardados ? 'var(--surface-inverse)' : 'var(--border-default)'}`,
                background: verGuardados ? 'var(--surface-inverse)' : 'var(--surface-card)',
                color: verGuardados ? '#fff' : 'var(--text-strong)',
                boxShadow: 'var(--shadow-xs)',
              }}
            >
              <Icon n="save" s={18} />
              {guardadosVisibles.length > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, padding: '0 5px',
                  borderRadius: 'var(--radius-pill)', background: 'var(--surface-inverse)', color: '#fff',
                  border: '2px solid var(--surface-card)', fontFamily: 'var(--font-body)', fontSize: 10,
                  fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                }}
                >
                  {guardadosVisibles.length}
                </span>
              )}
            </button>
          </div>

          {verGuardados && (
            <ServiciosGuardados
              guardados={guardados === null ? null : guardadosVisibles}
              cargando={guardados === null}
              busqueda={busqueda}
              enPresupuesto={new Set(
                (customItems || []).map((c) => normalizarTexto(c.descripcion_custom)).filter(Boolean),
              )}
              onAgregar={agregarGuardado}
              onBorrar={borrarGuardado}
            />
          )}

          <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', background: 'var(--surface-card)', maxHeight: 780, overflow: 'auto', padding: '8px 0' }}>
            {favoritosVisibles.map((s) => <Fila key={s.id} s={s} />)}
            {favoritosVisibles.length > 0 && restoVisibles.length > 0 && (
              <div style={{ textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-faint)', padding: '10px 0' }}>
                ─── Lista de la Cámara de Rectificadores ───
              </div>
            )}
            {restoVisibles.map((s) => <Fila key={s.id} s={s} />)}
            {filtrados.length === 0 && (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-faint)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
                No se encontraron servicios.
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          {/* Caja del presupuesto: lo que se cobra. Sus filas se pueden
              arrastrar a la caja de abajo. */}
          <div
            {...propsZona(false)}
            style={{
              display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0,
              // Outline y no padding + borde: el outline no ocupa lugar, así
              // que prender la zona no corre los renglones de abajo del mouse
              // (correrlos era parte del parpadeo al arrastrar).
              outline: zonaActiva === false ? '2px dashed var(--text-strong)' : 'none',
              outlineOffset: 6,
              borderRadius: 'var(--radius-xl)',
            }}
          >
            <div style={tituloSeccion}>Presupuesto</div>
            {filasCotizan.length === 0 && (
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
                Todavía no elegiste servicios. Tocá un ítem de la lista para agregarlo acá, o escribí uno
                en el renglón en blanco.
              </div>
            )}
            <DataTable
              columns={columnasPreview}
              rows={[...filasCotizan, renglonNuevo(false)]}
              getRowProps={propsDeFila}
              getRowBackground={(fila) => (fila.esNuevo ? 'var(--surface-sunken)' : undefined)}
            />
            {filasCotizan.length > 0 && (
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-faint)' }}>
                La cantidad, el precio unitario y el subtotal se pueden editar acá mismo: entre el unitario y
                el subtotal, el que escribís manda y el otro se recalcula solo. Los precios van en pesos
                enteros, así que un subtotal que no se reparte justo entre la cantidad sube al peso
                siguiente. Un precio editado no recibe el ajuste %; el ↺ lo devuelve al de la lista. En el
                renglón gris de abajo se escribe un trabajo que no está en la lista, y su disquete lo guarda
                para los próximos presupuestos.
              </div>
            )}
          </div>

          <CajaOpcionales
            total={totalOpcionales}
            cantidad={filasOpcionales.length}
            activa={zonaActiva === true}
            dropProps={propsZona(true)}
            siempre
          >
            <DataTable
              columns={columnasPreview}
              rows={[...filasOpcionales, renglonNuevo(true)]}
              getRowProps={propsDeFila}
              getRowBackground={(fila) => (fila.esNuevo ? 'var(--surface-sunken)' : undefined)}
            />
          </CajaOpcionales>
        </div>
      </div>

      <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', background: 'var(--surface-card)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={tituloSeccion}>Agregar ítem manual</div>
        {customItems.filter((c) => !esManualVacio(c)).map((c) => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ContadorServicio cantidad={c.cantidad || 0} onChange={(n) => cambiarCantidadCustom(c.id, n)} />
            <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
              {c.descripcion_custom}
              <span style={{ color: 'var(--text-faint)' }}> ({formatPrecioARS(c.precio_aplicado)} c/u)</span>
            </span>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>{formatPrecioARS((c.precio_aplicado || 0) * (c.cantidad || 0))}</span>
            <button onClick={() => quitarCustom(c.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }}>
              <Icon n="x" s={16} />
            </button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 10 }}>
          <TextField placeholder="Descripción" value={nuevoCustomDesc} onChange={(e) => setNuevoCustomDesc(e.target.value)} style={{ flex: 1 }} />
          <TextField placeholder="Precio unit." value={nuevoCustomPrecio} onChange={(e) => setNuevoCustomPrecio(e.target.value)} style={{ width: 140 }} />
          <Button variant="secondary" iconLeft={<Icon n="plus" s={16} />} onClick={agregarCustom}>Agregar</Button>
        </div>
      </div>
    </div>
  )
}
