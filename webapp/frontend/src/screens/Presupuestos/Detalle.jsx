import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { PageHeader } from '../../components/PageHeader'
import { DataTable } from '../../components/DataTable'
import { Button } from '../../components/Button'
import { TextField } from '../../components/TextField'
import { CategoriaField } from '../../components/CategoriaField'
import { RepuestoPicker } from '../../components/RepuestoPicker'
import { ContadorServicio } from '../../components/ContadorServicio'
import { Icon } from '../../components/Icon'
import { ErrorBanner } from '../../components/ErrorBanner'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { StatusBadge } from '../../components/StatusBadge'
import { ModalRepuestosAgregados } from './Wizard/ModalRepuestosAgregados'
import { ModalRevalidacion } from './ModalRevalidacion'
import { formatPrecioARS, formatFechaAR } from '../../utils/format'
import {
  gruposParaPayload, totalRepuestos, totalRepuestosOpcionales, agruparLineas,
  subtotalDe, subtotalDelGrupo, lineaDeOpcion,
} from '../../utils/grupos'
import { textoSubtotal, unitarioDesdeSubtotal } from '../../utils/precios'
import { CajaOpcionales, BotonOpcional } from '../../components/CajaOpcionales'
import { useArrastreOpcionales } from '../../hooks/useArrastreOpcionales'
import { useRepuestosAgrupados } from '../../hooks/useRepuestosAgrupados'
import { useFichaTildes } from '../../hooks/useFichaTildes'
import { useUndo } from '../../context/UndoContext'

const TIPO_LABEL = { mecanico: 'Mecánico', dueno: 'Dueño del vehículo' }
const TIPO_OPUESTO = { mecanico: 'dueno', dueno: 'mecanico' }

/*
 * Avisos de cambios post-emisión: cada línea de repuesto guarda el precio y el
 * stock congelados al cotizar; el backend manda además precio_actual/stock_actual
 * del catálogo vigente. Si difieren, se avisa acá (nunca en el PDF).
 *
 * El precio solo avisa cuando SUBIÓ (pedido del dueño, 2026-08-18). Si el
 * repuesto está más barato que cuando se cotizó, el presupuesto emitido sigue
 * cubriendo el trabajo: no hay nada que corregir y el cartel rojo solo asusta.
 * Para bajarlo igual está el botón "Actualizar a precios de hoy", que no
 * depende de este aviso.
 */
function warningsRepuesto(it) {
  const w = []
  if (!it.repuesto_codigo) return w
  // stock es NOT NULL en el catálogo: si vino null, el código ya no está en la lista.
  if (it.stock_actual === null || it.stock_actual === undefined) {
    w.push('Ya no está en la lista del catálogo')
    return w
  }
  if (it.precio_actual && it.precio_unitario !== null && it.precio_actual > it.precio_unitario) {
    w.push(`El precio de lista subió: ${formatPrecioARS(it.precio_unitario)} → ${formatPrecioARS(it.precio_actual)}`)
  }
  if (it.stock_al_cotizar === 1 && it.stock_actual === 0) {
    w.push('Ya no tiene stock')
  }
  return w
}

function fmtCantidad(cantidad) {
  const c = Number(cantidad)
  if (Number.isNaN(c)) return String(cantidad ?? '')
  return c === Math.trunc(c) ? String(Math.trunc(c)) : String(c)
}

// Misma normalización que manda el PUT de guardado: se usa tanto para armar
// el payload real al guardar como para la "foto" inicial al entrar en modo
// edición, así comparar ambas dice si hubo cambios de verdad (y por lo tanto
// si hay que reconstruir el PDF).
function construirPayload(lista, notas, ajustePct, lineasGrupos = []) {
  // cantidad/precio_unitario se normalizan a Number: los inputs numéricos del
  // formulario los guardan como string en cuanto el usuario toca el campo,
  // aunque el valor final sea igual — sin esto, comparar el payload contra la
  // foto inicial (para saber si hubo cambios de verdad) daría un falso
  // positivo solo por el cambio de tipo string/number.
  const servicios = lista
    .filter((it) => it.tipo !== 'repuesto')
    .filter((it) => (it.desc_facra || (it.descripcion_custom || '').trim()) && it.precio_unitario !== '' && Number(it.cantidad) > 0)
    .map((it) => ({
      servicio_id: it.servicio_id,
      descripcion_custom: it.descripcion_custom,
      cantidad: Number(it.cantidad),
      precio_unitario: Number(it.precio_unitario),
      opcional: Boolean(it.opcional),
    }))
  const repuestos = lista
    .filter((it) => it.tipo === 'repuesto')
    .filter((it) => (it.descripcion_custom || '').trim() && it.precio_unitario !== '' && Number(it.cantidad) > 0)
    .map((it) => ({
      tipo: 'repuesto',
      repuesto_codigo: (it.repuesto_codigo || '').trim() || null,
      descripcion: it.descripcion_custom,
      categoria: it.categoria,
      cantidad: Number(it.cantidad),
      precio_unitario: Number(it.precio_unitario),
      stock_al_cotizar: it.stock_al_cotizar,
      opcional: Boolean(it.opcional),
    }))
  return {
    items: [...servicios, ...repuestos],
    // Los grupos van aparte: el backend guarda una línea por opción, y las
    // marcadas como opcionales quedan fuera del total. Los repuestos de arriba
    // son los sueltos (sin grupo).
    grupos_repuestos: gruposParaPayload(lineasGrupos),
    notas,
    ajuste_pct: ajustePct || 0,
  }
}

function Campo({ label, valor }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-strong)', marginTop: 2 }}>{valor || '—'}</div>
    </div>
  )
}

export default function DetallePresupuesto() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [detalle, setDetalle] = React.useState(null)
  const [items, setItems] = React.useState([])
  const [grupos, setGrupos] = React.useState([])
  const [pdfs, setPdfs] = React.useState([])
  const [verVersionesAnteriores, setVerVersionesAnteriores] = React.useState(false)
  const [error, setError] = React.useState('')

  const [editMode, setEditMode] = React.useState(false)
  const [editItems, setEditItems] = React.useState([])
  // Los grupos de repuestos se editan aparte de editItems: una línea del
  // presupuesto es la opción cotizada, pero el grupo entero (con todas sus
  // alternativas) es lo que hay que mandar de vuelta al guardar.
  const [editGrupos, setEditGrupos] = React.useState([])
  const [cantidadPorGrupo, setCantidadPorGrupo] = React.useState({})
  const [modalRepuestos, setModalRepuestos] = React.useState(false)
  const [aprobando, setAprobando] = React.useState(false)
  const [editNotas, setEditNotas] = React.useState('')
  const [guardando, setGuardando] = React.useState(false)
  const [reconstruyendo, setReconstruyendo] = React.useState(false)
  const [confirmarSalir, setConfirmarSalir] = React.useState(false)
  const [confirmarEliminar, setConfirmarEliminar] = React.useState(false)
  // Revalidación: el resumen de qué cambiaría a precios de hoy. Se pide al
  // backend y se muestra en un pop-up; nada se aplica hasta confirmarlo.
  const [revalidacion, setRevalidacion] = React.useState(null)
  const [revalidando, setRevalidando] = React.useState(false)
  const [aplicandoRevalidacion, setAplicandoRevalidacion] = React.useState(false)
  // La ficha del motor, para poder marcar/desmarcar desde acá igual que en el
  // wizard: editar un presupuesto viejo también es un momento donde uno se da
  // cuenta de que una pieza es (o no es) de este motor.
  const [ficha, setFicha] = React.useState([])
  const [aviso, setAviso] = React.useState('')
  const [ajusteTexto, setAjusteTexto] = React.useState('')
  const [ajustePct, setAjustePct] = React.useState(0)
  // Precio de lista VIGENTE por servicio_id (no el que quedó guardado en este
  // presupuesto, que puede ya tener un ajuste anterior aplicado): el ajuste %
  // de acá siempre parte de este valor, así cambiarlo no compone sobre un
  // ajuste de una edición anterior.
  const [preciosListaPorServicio, setPreciosListaPorServicio] = React.useState(new Map())
  const pdfParaCompartir = React.useRef(null)
  // "Foto" del payload al entrar en modo edición (ver construirPayload):
  // compararla contra lo que se manda al guardar dice si hubo cambios de
  // verdad, para no reconstruir el PDF en un guardado que no cambió nada.
  const payloadOriginalRef = React.useRef('')
  const { avisarBorrado, borrarConDeshacer } = useUndo()

  const cargar = React.useCallback(() => {
    api.get(`/presupuestos/${id}`).then(setDetalle)
    api.get(`/presupuestos/${id}/items`).then(setItems)
    api.get(`/presupuestos/${id}/grupos`).then(setGrupos).catch(() => {})
    api.get(`/presupuestos/${id}/pdfs`).then(setPdfs)
  }, [id])

  React.useEffect(() => { cargar() }, [cargar])

  const entrarEdicion = () => {
    // Las líneas que pertenecen a un grupo no se editan como ítems sueltos: el
    // grupo entero (con sus alternativas) se maneja aparte y vuelve al backend
    // por grupos_repuestos.
    const lineasGrupos = grupos.flatMap((g) => g.opciones.map((o) => lineaDeOpcion(g, o)))
    setEditGrupos(lineasGrupos)
    setCantidadPorGrupo(Object.fromEntries(grupos.map((g) => [g.categoria, g.opciones[0]?.cantidad || 1])))

    const itemsIniciales = items
      .filter((it) => it.grupo_num == null)
      .map((it) => (
        it.tipo === 'repuesto'
          ? { ...it, opcional: Boolean(it.opcional) }
          // Presupuestos armados antes de soportar cantidad en servicios no
          // tienen precio_unitario guardado: se asume cantidad 1 y que
          // precio_aplicado YA era el unitario.
          : {
            ...it,
            cantidad: it.cantidad || 1,
            precio_unitario: it.precio_unitario ?? it.precio_aplicado,
            opcional: Boolean(it.opcional),
          }
      ))
    setEditItems(itemsIniciales)
    const notasIniciales = detalle?.notas || ''
    setEditNotas(notasIniciales)
    // El % se restaura tal cual quedó guardado la última vez, solo como
    // referencia — los precios ya cargados arriba reflejan ese ajuste, así
    // que no hay que volver a aplicarlo. Recién se recalcula algo si el
    // usuario toca la casilla de nuevo.
    const ajusteInicial = detalle?.ajuste_pct || 0
    setAjustePct(ajusteInicial)
    setAjusteTexto(ajusteInicial ? String(ajusteInicial) : '')
    payloadOriginalRef.current = JSON.stringify(
      construirPayload(itemsIniciales, notasIniciales, ajusteInicial, lineasGrupos),
    )
    setEditMode(true)
    if (detalle?.motor_id) {
      api.get(`/motores/${detalle.motor_id}/ficha-repuestos`)
        .then(setFicha)
        .catch(() => {})
      api.get(`/motores/${detalle.motor_id}/servicios`)
        .then((servicios) => setPreciosListaPorServicio(new Map(servicios.map((s) => [s.id, s.precio]))))
        .catch(() => {})
    }
  }

  // Aumento/descuento en % sobre la mano de obra, igual criterio que en el
  // wizard: solo toca servicios de la lista FACRA (servicio_id presente), no
  // ítems manuales ni repuestos, que ya tienen un precio elegido a mano.
  // Parte siempre del precio de lista VIGENTE (preciosListaPorServicio), no
  // del que quedó guardado la última vez, para no componer sobre un ajuste
  // anterior si se cambia el % de nuevo en esta edición.
  const aplicarAjusteTexto = (texto) => {
    setAjusteTexto(texto)
    const normalizado = texto.replace(',', '.').trim()
    const pct = normalizado === '' || normalizado === '-' ? 0 : parseFloat(normalizado)
    const pctValido = Number.isNaN(pct) ? 0 : pct
    setAjustePct(pctValido)
    const factor = 1 + pctValido / 100
    setEditItems((prev) => prev.map((it) => {
      if (it.tipo === 'repuesto' || !it.servicio_id) return it
      const base = preciosListaPorServicio.get(it.servicio_id)
      if (base === undefined || base === null) return it
      return { ...it, precio_unitario: Math.round(base * factor * 100) / 100 }
    }))
  }

  const cancelarEdicion = () => setEditMode(false)

  const intentarVolver = () => {
    if (editMode) { setConfirmarSalir(true); return }
    navigate(-1)
  }

  const actualizarCampo = (idx, campo, valor) => {
    setEditItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [campo]: valor } : it)))
  }
  // Para servicios este campo edita el precio UNITARIO: el subtotal
  // (precio_aplicado) se recalcula server-side como cantidad × unitario.
  const actualizarPrecio = (idx, valor) => actualizarCampo(idx, 'precio_unitario', valor)
  const actualizarDescCustom = (idx, valor) => actualizarCampo(idx, 'descripcion_custom', valor)
  /* Subtotal editable de un ítem de la lista de edición: se reparte por la
     cantidad y pisa el unitario, que es lo que se guarda (ver utils/precios). */
  const actualizarSubtotal = (idx, texto) => {
    setEditItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it
      const { valor } = unitarioDesdeSubtotal(texto, it.cantidad)
      return { ...it, precio_unitario: valor === null ? '' : valor }
    }))
  }

  /* Mover un ítem a la caja de opcionales, o traerlo de vuelta. Lo usan el
     arrastre y la flechita del renglón. */
  const moverItemOpcional = React.useCallback((clave, opcional) => {
    if (clave.startsWith('repuesto:')) {
      const key = clave.slice('repuesto:'.length)
      setEditGrupos((prev) => prev.map((r) => (r.key === key ? { ...r, opcional } : r)))
      return
    }
    const id = clave.slice('item:'.length)
    setEditItems((prev) => prev.map((it) => (String(it.id) === id ? { ...it, opcional } : it)))
  }, [])

  const quitarItem = (idx) => {
    const antes = editItems
    const it = editItems[idx]
    setEditItems((prev) => prev.filter((_, i) => i !== idx))
    avisarBorrado({
      mensaje: `Se quitó ${it?.descripcion_custom || it?.desc_facra || 'el ítem'} del presupuesto.`,
      onDeshacer: () => setEditItems(antes),
    })
  }
  const agregarItemCustom = () => {
    setEditItems((prev) => [...prev, { id: `nuevo-${Date.now()}`, servicio_id: null, item_num: null, desc_facra: null, descripcion_custom: '', cantidad: 1, precio_unitario: '', opcional: false }])
  }
  const agregarItemRepuesto = () => {
    setEditItems((prev) => [...prev, {
      id: `nuevo-rep-${Date.now()}`, servicio_id: null, item_num: null, desc_facra: null,
      tipo: 'repuesto', repuesto_codigo: '', descripcion_custom: '', categoria: '',
      cantidad: 1, precio_unitario: '', stock_al_cotizar: null, opcional: false,
    }])
  }

  const setCantidadGrupo = React.useCallback((grupo, cantidad) => {
    setCantidadPorGrupo((prev) => (prev[grupo] === cantidad ? prev : { ...prev, [grupo]: cantidad }))
  }, [])

  const { zonaActiva, propsFila, propsZona, propsCampoEditable } = useArrastreOpcionales(moverItemOpcional)

  const tildes = useFichaTildes({ motorId: detalle?.motor_id, ficha, onFicha: setFicha })

  const sugeridos = React.useMemo(
    () => ficha.flatMap((g) => g.opciones.map((o) => ({
      codigo: o.codigo,
      descripcion: o.descripcion || o.codigo,
      categoria: g.categoria,
      cat_prefijo: g.cat_prefijo,
      marca: o.marca,
      medida: o.medida,
      base_codigo: o.base_codigo,
      precio_actual: o.precio_actual,
      stock_actual: o.stock_actual,
      usado_en: o.usado_en,
      ultima_vez: o.ultima_vez,
    }))),
    [ficha],
  )

  const cantidadRecordada = React.useMemo(() => {
    const m = new Map()
    ficha.forEach((g) => g.opciones.forEach((o) => m.set(o.codigo, o.cantidad)))
    return m
  }, [ficha])

  // Mismo agrupado automático que en el wizard: lo que se agrega dentro de una
  // categoría entra al grupo de esa categoría, con las medidas hermanas.
  const {
    cantidadPorCodigo, agregar: agregarDeCatalogo,
    cambiarCantidad: cambiarCantidadGrupo, cambiarPrecio: cambiarPrecioGrupo,
    cambiarSubtotal: cambiarSubtotalGrupo, toggleOpcional: toggleOpcionalGrupo,
    quitar: quitarDeGrupo, quitarVarias: quitarVariasDeGrupo,
  } = useRepuestosAgrupados({
    lineas: editGrupos,
    setLineas: setEditGrupos,
    cantidadPorGrupo,
    setCantidadGrupo,
    cantidadRecordada,
    onHermanas: tildes.marcarAuto,
    onQuitarCodigo: tildes.soltarAuto,
  })

  /* Poner cantidad marca la pieza como repuesto de este motor, igual que en el
     wizard. Sacarla del presupuesto NO la saca del motor (salvo que el tilde lo
     hubiera puesto esa misma cantidad, que es lo que resuelve soltarAuto). */
  const agregarConTilde = React.useCallback((rep, cantidad, origen = 'click') => {
    if (cantidad > 0) tildes.marcarAuto(rep)
    agregarDeCatalogo(rep, cantidad, origen)
  }, [agregarDeCatalogo, tildes])

  const estadoDeCodigo = React.useCallback((codigo) => {
    if (cantidadPorCodigo.get(codigo)) return 'presupuesto'
    return tildes.estaTildado(codigo) ? 'motor' : 'fuera'
  }, [cantidadPorCodigo, tildes])

  const alternarFicha = async (rep) => {
    const estaba = tildes.estaTildado(rep.codigo)
    try {
      await tildes.alternarManual(rep)
      if (!estaba) return
      const linea = editGrupos.find((r) => r.repuesto_codigo === rep.codigo)
      if (linea) quitarDeGrupo(linea.key)
      setAviso('Se sacó de los repuestos de este motor. El presupuesto emitido no cambia; si fue sin querer, lo recuperás desde "Repuestos eliminados", en la pantalla del motor.')
    } catch (err) {
      setAviso(err.message || 'No se pudo guardar en el motor')
    }
  }

  // Sacar un repuesto (o una familia de medidas) del presupuesto que se está
  // editando: se puede deshacer devolviendo la lista tal cual estaba.
  const quitarRepuestoConDeshacer = (key) => {
    const antes = editGrupos
    const linea = editGrupos.find((r) => r.key === key)
    quitarDeGrupo(key)
    avisarBorrado({
      mensaje: `Se quitó ${linea?.descripcion || 'el repuesto'} del presupuesto.`,
      onDeshacer: () => setEditGrupos(antes),
    })
  }

  const quitarVariasConDeshacer = (keys) => {
    const antes = editGrupos
    quitarVariasDeGrupo(keys)
    avisarBorrado({
      mensaje: `Se quitaron ${keys.length} medidas del presupuesto.`,
      onDeshacer: () => setEditGrupos(antes),
    })
  }

  const guardar = async () => {
    setGuardando(true)
    setError('')
    try {
      const payload = construirPayload(editItems, editNotas, ajustePct, editGrupos)
      // Si el payload es idéntico al que había al entrar en modo edición, no
      // hubo cambios de verdad: no tiene sentido generar una versión de PDF
      // nueva (y consumir un número de versión) por un guardado que no cambió nada.
      const huboCambios = JSON.stringify(payload) !== payloadOriginalRef.current
      // Lo marcado sin cotizar viaja aparte y no cuenta como cambio del
      // presupuesto: toca la ficha del motor, no el documento.
      await api.put(`/presupuestos/${id}`, {
        ...payload,
        ficha_tildes: tildes.tildesParaPayload(editGrupos),
      })
      if (huboCambios) {
        // El PDF se reconstruye solo, en silencio (sin abrir pestaña): así
        // "Compartir PDF" y "Abrir" siempre reflejan la última edición, sin
        // depender de que el usuario se acuerde de tocar "Reconstruir PDF".
        try {
          await reconstruirPdfSilencioso()
        } catch {
          setAviso('Los cambios se guardaron, pero no se pudo reconstruir el PDF automáticamente. Probá con "Reconstruir PDF" más abajo.')
        }
      }
      setEditMode(false)
      cargar()
    } catch (err) {
      setError(err.message || 'No se pudieron guardar los cambios')
    } finally {
      setGuardando(false)
    }
  }

  /* Igual que en el historial: la pantalla vuelve al listado (que ya esconde lo
     que está por borrarse) y el DELETE sale recién cuando se apaga el cartel de
     "Deshacer", porque un presupuesto borrado no se puede recuperar. */
  const eliminar = () => {
    setConfirmarEliminar(false)
    borrarConDeshacer({
      mensaje: `Se eliminó el presupuesto #${String(detalle.id).padStart(4, '0')}.`,
      clave: `presupuesto:${detalle.id}`,
      ejecutar: () => api.del(`/presupuestos/${id}`),
    })
    navigate('/presupuestos')
  }

  const cambiarAprobado = async () => {
    setAprobando(true)
    setError('')
    try {
      const { aprobado_en: aprobadoEn } = await api.post(`/presupuestos/${id}/aprobar`, {
        aprobado: !detalle.aprobado_en,
      })
      setDetalle((prev) => ({ ...prev, aprobado_en: aprobadoEn }))
    } catch (err) {
      setError(err.message || 'No se pudo cambiar el estado de aprobación')
    } finally {
      setAprobando(false)
    }
  }

  // "Actualizar a precios de hoy": primero se pide el resumen de qué cambiaría
  // (sin tocar nada) y se muestra en el pop-up. Recién si el dueño confirma, el
  // backend recotiza los repuestos y emite una versión nueva del PDF.
  const pedirRevalidacion = async () => {
    setRevalidando(true)
    setError('')
    setAviso('')
    try {
      const resumen = await api.get(`/presupuestos/${id}/revalidacion`)
      if (!resumen.hay_cambios) {
        setAviso('Los precios no cambiaron desde que se emitió este presupuesto.')
        return
      }
      setRevalidacion(resumen)
    } catch (err) {
      setError(err.message || 'No se pudo consultar los precios de hoy')
    } finally {
      setRevalidando(false)
    }
  }

  const aplicarRevalidacion = async () => {
    setAplicandoRevalidacion(true)
    setError('')
    try {
      const res = await api.post(`/presupuestos/${id}/revalidar`)
      setRevalidacion(null)
      if (res.sin_cambios) {
        setAviso('Los precios de los repuestos no cambiaron: no hizo falta actualizar nada.')
        return
      }
      cargar()
      const version = res.pdfs?.[0]?.version
      setAviso(`Actualizado a precios de hoy.${version ? ` Se generó la versión ${version} del PDF.` : ''}`)
    } catch (err) {
      setError(err.message || 'No se pudo actualizar el presupuesto')
    } finally {
      setAplicandoRevalidacion(false)
    }
  }

  const reconstruirPdfSilencioso = async () => {
    const nuevaLista = await api.post(`/presupuestos/${id}/pdf`)
    setPdfs(nuevaLista)
    return nuevaLista
  }

  const reconstruirPdf = async () => {
    setReconstruyendo(true)
    setError('')
    const pdfTab = window.open('', '_blank')
    try {
      const nuevaLista = await reconstruirPdfSilencioso()
      if (pdfTab) pdfTab.location.href = `/api/presupuestos/${id}/pdf/${nuevaLista[0].version}`
    } catch (err) {
      if (pdfTab) pdfTab.close()
      setError(err.message || 'No se pudo reconstruir el PDF')
    } finally {
      setReconstruyendo(false)
    }
  }

  const nombreArchivoPdf = detalle
    ? `Presupuesto ${String(detalle.id).padStart(4, '0')} - ${detalle.cliente || 'cliente'}.pdf`
    : 'presupuesto.pdf'

  // El PDF se baja apenas se abre el detalle y queda guardado: navigator.share()
  // exige el gesto del usuario, y si el fetch se hace recién dentro del click el
  // navegador (iOS sobre todo) considera vencida la interacción y lo rechaza.
  React.useEffect(() => {
    pdfParaCompartir.current = null
    const version = pdfs[0]?.version
    if (!version) return undefined
    let vigente = true
    fetch(`/api/presupuestos/${id}/pdf/${version}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => { if (vigente) pdfParaCompartir.current = blob })
      .catch(() => {})
    return () => { vigente = false }
  }, [id, pdfs])

  const compartirPdf = async () => {
    const version = pdfs[0]?.version
    if (!version) return
    setAviso('')
    const blob = pdfParaCompartir.current
    const archivo = blob ? new File([blob], nombreArchivoPdf, { type: 'application/pdf' }) : null

    if (archivo && navigator.canShare?.({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], title: nombreArchivoPdf })
      } catch (err) {
        // El usuario cerró el menú de compartir: no es un error que mostrar.
        if (err?.name !== 'AbortError') setAviso('No se pudo abrir el menú de compartir. Probá descargando el PDF.')
      }
      return
    }

    // Sin Web Share (Firefox de escritorio, navegadores viejos): se descarga y
    // desde la carpeta de descargas se puede copiar y pegar en WhatsApp.
    const enlace = document.createElement('a')
    enlace.href = blob ? URL.createObjectURL(blob) : `/api/presupuestos/${id}/pdf/${version}?descargar=1`
    enlace.download = nombreArchivoPdf
    document.body.appendChild(enlace)
    enlace.click()
    document.body.removeChild(enlace)
    if (blob) setTimeout(() => URL.revokeObjectURL(enlace.href), 10000)
    setAviso('Este navegador no permite compartir archivos: se descargó el PDF. Copialo desde la carpeta Descargas y pegalo en WhatsApp.')
  }

  if (!detalle) {
    return <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Cargando…</div>
  }

  const ultimoPdf = pdfs[0]
  const anteriores = pdfs.slice(1)

  // En edición el total suma todo lo cargado, menos lo marcado como opcional.
  const totalEditado = editItems
    .filter((it) => !it.opcional)
    .reduce((acc, it) => acc + (Number(it.precio_unitario) || 0) * (Number(it.cantidad) || 0), 0)
    + totalRepuestos(editGrupos)
  const totalOpcionalesEditado = editItems
    .filter((it) => it.opcional)
    .reduce((acc, it) => acc + (Number(it.precio_unitario) || 0) * (Number(it.cantidad) || 0), 0)
    + totalRepuestosOpcionales(editGrupos)
  const gruposEditados = agruparLineas(editGrupos).grupos
  const itemsOpcionalesEdicion = editItems.map((it, idx) => ({ it, idx })).filter(({ it }) => it.opcional)
  const gruposOpcionales = editGrupos.filter((l) => l.opcional)
  const colorAjuste = ajustePct > 0 ? 'var(--status-active-fg)' : ajustePct < 0 ? 'var(--status-expired-fg)' : 'var(--border-default)'

  // Lo opcional se muestra aparte, en su propia caja: está en el presupuesto y
  // en el PDF, pero no entra en el total.
  const serviciosItems = items.filter((it) => it.tipo !== 'repuesto' && !it.opcional)
  const repuestoItems = items.filter((it) => it.tipo === 'repuesto' && !it.opcional)
  const itemsOpcionales = items.filter((it) => it.opcional)
  const totalOpcionales = itemsOpcionales.reduce((acc, it) => acc + (it.precio_aplicado || 0), 0)
  const warningsPorItem = new Map(repuestoItems.map((it) => [it.id, warningsRepuesto(it)]))
  const hayWarnings = [...warningsPorItem.values()].some((w) => w.length > 0)

  /*
   * Una línea de mano de obra en modo edición. El precio unitario y el subtotal
   * se editan los dos: el que se escribe manda y el otro se recalcula. La
   * flechita (y arrastrar la fila) la manda a la caja de opcionales.
   *
   * Es una función que devuelve JSX, NO un componente declarado acá adentro: un
   * componente definido dentro del render cambia de identidad en cada pasada y
   * React lo remonta, lo que hace perder el foco del recuadro a cada tecla.
   */
  const filaServicioEdicion = (it, idx) => (
    <div
      key={it.id}
      {...propsFila(`item:${it.id}`)}
      style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'grab' }}
    >
      <ContadorServicio cantidad={Number(it.cantidad) || 0} onChange={(n) => actualizarCampo(idx, 'cantidad', n)} />
      {it.desc_facra ? (
        <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>{it.desc_facra}</span>
      ) : (
        <TextField
          placeholder="Descripción"
          value={it.descripcion_custom || ''}
          onChange={(e) => actualizarDescCustom(idx, e.target.value)}
          style={{ flex: 1 }}
        />
      )}
      <TextField
        type="number" step="0.01" placeholder="Precio unit."
        value={it.precio_unitario}
        onChange={(e) => actualizarPrecio(idx, e.target.value)}
        {...propsCampoEditable}
        title="Precio unitario — se puede editar"
        style={{ width: 130 }}
      />
      <TextField
        value={textoSubtotal(Number(it.precio_unitario) || 0, it.cantidad)}
        onChange={(e) => actualizarSubtotal(idx, e.target.value)}
        {...propsCampoEditable}
        title="Subtotal — se puede editar; el precio unitario se recalcula solo"
        style={{ width: 130, textAlign: 'right', fontWeight: 600 }}
      />
      <BotonOpcional
        opcional={Boolean(it.opcional)}
        onClick={() => moverItemOpcional(`item:${it.id}`, !it.opcional)}
      />
      <button onClick={() => quitarItem(idx)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }}>
        <Icon n="x" s={16} />
      </button>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title={`Presupuesto #${String(detalle.id).padStart(4, '0')}`}
        subtitle={detalle.cliente}
        actions={
          <>
            <Button variant="secondary" iconLeft={<Icon n="arrow-left" s={16} />} onClick={intentarVolver}>Volver</Button>
            {editMode ? (
              <>
                <Button variant="primary" iconLeft={<Icon n="save" s={16} />} disabled={guardando} onClick={guardar}>
                  {guardando ? 'Guardando…' : 'Guardar cambios'}
                </Button>
                <Button variant="secondary" onClick={cancelarEdicion}>Cancelar</Button>
              </>
            ) : (
              <>
                <Button
                  variant={detalle.aprobado_en ? 'primary' : 'secondary'}
                  iconLeft={<Icon n="badge-check" s={16} />}
                  disabled={aprobando}
                  onClick={cambiarAprobado}
                >
                  {detalle.aprobado_en ? 'Aprobado' : 'Marcar aprobado'}
                </Button>
                <Button variant="secondary" iconLeft={<Icon n="cart" s={16} />} onClick={() => navigate(`/presupuestos/${id}/pedido`)}>
                  Pedido de repuestos
                </Button>
                <Button
                  variant="secondary"
                  iconLeft={<Icon n="rotate-cw" s={16} />}
                  disabled={revalidando}
                  onClick={pedirRevalidacion}
                >
                  {revalidando ? 'Consultando…' : 'Actualizar a precios de hoy'}
                </Button>
                <Button variant="secondary" iconLeft={<Icon n="share" s={16} />} disabled={!ultimoPdf} onClick={compartirPdf}>Compartir PDF</Button>
                <Button variant="secondary" iconLeft={<Icon n="copy" s={16} />} onClick={() => navigate(`/presupuestos/nuevo?duplicar=${id}`)}>
                  Duplicar
                </Button>
                <Button variant="primary" iconLeft={<Icon n="pencil" s={16} />} onClick={entrarEdicion}>Editar</Button>
                <Button variant="danger" iconLeft={<Icon n="trash" s={16} />} onClick={() => setConfirmarEliminar(true)}>Eliminar</Button>
              </>
            )}
          </>
        }
      />

      <ErrorBanner message={error} onClose={() => setError('')} />

      {aviso && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          padding: '10px 14px', background: 'var(--surface-sunken)', color: 'var(--text-body)',
          borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
        }}>
          {aviso}
          <button onClick={() => setAviso('')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }}>
            <Icon n="x" s={16} />
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 40, alignItems: 'flex-end', flexWrap: 'wrap', padding: '18px 22px', background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)' }}>
        <Campo label="Cliente" valor={detalle.cliente} />
        {detalle.cliente_tipo && <Campo label="Tipo" valor={<StatusBadge status={detalle.cliente_tipo} />} />}
        {detalle.contacto && (
          <Campo label={TIPO_LABEL[TIPO_OPUESTO[detalle.cliente_tipo]] || 'Contacto'} valor={detalle.contacto} />
        )}
        <Campo label="Motor" valor={detalle.motor} />
        <Campo label="Fecha" valor={formatFechaAR(detalle.fecha)} />
        {detalle.aprobado_en && (
          <Campo label="Aprobado" valor={<StatusBadge status="active">{formatFechaAR(detalle.aprobado_en)}</StatusBadge>} />
        )}
        <Campo label="Total" valor={formatPrecioARS(editMode ? totalEditado : detalle.total)} />
        {editMode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
              Ajuste mano de obra
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={ajusteTexto}
                onChange={(e) => aplicarAjusteTexto(e.target.value)}
                title="Porcentaje de aumento (positivo) o descuento (negativo) sobre la mano de obra"
                style={{
                  width: 64, height: 34, textAlign: 'center', borderRadius: 8,
                  border: `2px solid ${colorAjuste}`, background: 'var(--surface-card)', color: 'var(--text-strong)',
                  fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, outline: 'none',
                }}
              />
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>%</span>
            </div>
          </div>
        )}
      </div>

      {!editMode ? (
        <>
          {serviciosItems.length > 0 && (
            <DataTable
              columns={[
                { key: 'item_num', header: 'Nº', width: 70 },
                { key: 'desc', header: 'Descripción', wrap: true, render: (_, row) => row.desc_facra || row.descripcion_custom },
                { key: 'cantidad', header: 'Cant.', align: 'center', width: 70, render: fmtCantidad },
                { key: 'precio_aplicado', header: 'Precio', align: 'right', width: 140, render: formatPrecioARS },
              ]}
              reorderKey="detalle-servicios"
              rows={serviciosItems}
            />
          )}

          {repuestoItems.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
                Repuestos
              </div>

              {hayWarnings && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                  background: 'var(--status-expired-bg)', color: 'var(--status-expired-fg)',
                  borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                }}>
                  <Icon n="rotate-cw" s={15} />
                  <span style={{ flex: 1 }}>
                    Hay repuestos más caros (o sin stock) que cuando se emitió este presupuesto — revisá los avisos
                    antes de reconfirmar. Si un precio bajó no aparece acá: el presupuesto sigue cubriendo el trabajo.
                  </span>
                  {/* El atajo va acá a propósito: es el momento exacto en que el
                      dueño se entera de que el presupuesto quedó viejo. */}
                  {!editMode && (
                    <Button variant="secondary" size="sm" disabled={revalidando} onClick={pedirRevalidacion}>
                      {revalidando ? 'Consultando…' : 'Actualizar a precios de hoy'}
                    </Button>
                  )}
                </div>
              )}

              <DataTable
                columns={[
                  { key: 'repuesto_codigo', header: 'Código', width: 120, strong: true, wrap: true, render: (v) => v || '—' },
                  {
                    key: 'desc', header: 'Descripción', wrap: true,
                    render: (_, row) => {
                      const warns = warningsPorItem.get(row.id) || []
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span>{row.descripcion_custom}</span>
                          {warns.map((w) => (
                            <span key={w} style={{
                              alignSelf: 'flex-start', fontFamily: 'var(--font-body)', fontSize: 12,
                              color: 'var(--status-expired-fg)', background: 'var(--status-expired-bg)',
                              borderRadius: 'var(--radius-pill)', padding: '2px 10px',
                            }}>
                              {w}
                            </span>
                          ))}
                        </div>
                      )
                    },
                  },
                  { key: 'categoria', header: 'Categoría', width: 140, render: (v, row) => v || row.descripcion_custom },
                  { key: 'cantidad', header: 'Cant.', align: 'center', width: 70, render: fmtCantidad },
                  { key: 'precio_unitario', header: 'P. unitario', align: 'right', width: 130, render: formatPrecioARS },
                  { key: 'precio_aplicado', header: 'Subtotal', align: 'right', width: 130, render: formatPrecioARS },
                ]}
                reorderKey="detalle-repuestos"
                rows={repuestoItems}
              />
            </div>
          )}

          {itemsOpcionales.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
                Opcionales · {formatPrecioARS(totalOpcionales)} fuera del total
              </div>
              <DataTable
                columns={[
                  {
                    key: 'que', header: 'Qué es', width: 170, strong: true, wrap: true,
                    render: (_, row) => (row.tipo === 'repuesto' ? (row.categoria || 'Repuesto') : 'Mano de obra'),
                  },
                  { key: 'detalle', header: 'Detalle', wrap: true, render: (_, row) => row.desc_facra || row.descripcion_custom },
                  { key: 'cantidad', header: 'Cant.', align: 'center', width: 70, render: fmtCantidad },
                  { key: 'precio_unitario', header: 'P. unitario', align: 'right', width: 130, render: formatPrecioARS },
                  { key: 'precio_aplicado', header: 'Subtotal', align: 'right', width: 130, render: formatPrecioARS },
                ]}
                reorderKey="detalle-opcionales"
                rows={itemsOpcionales}
              />
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-faint)' }}>
                No suman al total. En el PDF salen en su propia caja, con el precio de cada uno y la aclaración
                de que no están incluidos.
              </div>
            </div>
          )}

          {grupos.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
                Repuestos por categoría
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                Lo que se cargó en cada categoría, con marca y medida. Todo lo que dice "Cotiza" está en el total;
                lo opcional queda guardado para tenerlo en cuenta.
              </div>
              {grupos.map((g) => (
                <div key={g.grupo_num} style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                  <div style={{ padding: '10px 14px', background: 'var(--surface-sunken)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-strong)' }}>
                    {g.categoria} · {g.opciones.length} opcion{g.opciones.length === 1 ? '' : 'es'}
                  </div>
                  {g.opciones.map((o) => (
                    <div key={o.repuesto_codigo || o.descripcion} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
                      borderTop: '1px solid var(--border-subtle)',
                      background: o.elegida ? 'var(--status-active-bg)' : undefined,
                    }}>
                      <span style={{ width: 150, flexShrink: 0, fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>
                        {o.repuesto_codigo || '—'}
                      </span>
                      <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>{o.descripcion}</span>
                      <span style={{ width: 110, flexShrink: 0, fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-muted)' }}>{o.marca || '—'}</span>
                      <span style={{ width: 60, flexShrink: 0, fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-muted)' }}>{o.medida || '—'}</span>
                      {o.elegida
                        ? <StatusBadge status="active">Cotiza</StatusBadge>
                        : <StatusBadge status="aviso">Opcional</StatusBadge>}
                      {o.stock_actual === 0 && <StatusBadge status="expired">Sin stock hoy</StatusBadge>}
                      <span style={{ width: 60, textAlign: 'center', flexShrink: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>×{fmtCantidad(o.cantidad)}</span>
                      <span style={{ width: 130, textAlign: 'right', flexShrink: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                        {formatPrecioARS(o.subtotal)}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Mano de obra y repuestos ya cargados en un solo bloque, arriba de
            todo (entre la tarjeta Cliente/Motor/Fecha/Total(+Ajuste) y
            "Usados antes en este motor" del buscador de abajo), separados
            adentro por el título "Repuestos". */}
        <div
          {...propsZona(false)}
          style={{
            border: zonaActiva === false ? '2px dashed var(--text-strong)' : '1px solid var(--border-default)',
            borderRadius: 'var(--radius-xl)', background: 'var(--surface-card)', padding: 16,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}
        >
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
            Detalle de mano de obra
          </div>
          {editItems
            .map((it, idx) => ({ it, idx }))
            .filter(({ it }) => it.tipo !== 'repuesto' && !it.opcional)
            .map(({ it, idx }) => filaServicioEdicion(it, idx))}
          <Button variant="ghost" size="sm" iconLeft={<Icon n="plus" s={14} />} onClick={agregarItemCustom} style={{ alignSelf: 'flex-start' }}>
            Agregar ítem
          </Button>

          {editGrupos.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 8, paddingTop: 10, borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
                  Grupos de repuestos
                </div>
                <Button variant="secondary" size="sm" iconLeft={<Icon n="layers" s={14} />} onClick={() => setModalRepuestos(true)}>
                  Ver y editar ({editGrupos.length})
                </Button>
              </div>
              {gruposEditados.map((g) => {
                const opcionales = g.opciones.filter((o) => o.opcional).length
                return (
                  <div key={g.categoria} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-strong)', width: 170 }}>
                      {g.categoria}
                    </span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-faint)', width: 130 }}>
                      {g.opciones.length} repuesto{g.opciones.length === 1 ? '' : 's'}
                      {opcionales > 0 && ` · ${opcionales} opcional${opcionales === 1 ? '' : 'es'}`}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                      {g.opciones.filter((o) => !o.opcional).map((o) => o.descripcion).join(' · ') || '—'}
                    </span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, width: 120, textAlign: 'right' }}>
                      {formatPrecioARS(subtotalDelGrupo(g.opciones))}
                    </span>
                  </div>
                )
              })}
            </>
          )}

          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-faint)', marginTop: 8, paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
            Repuestos sueltos
          </div>
          {editItems
            .map((it, idx) => ({ it, idx }))
            .filter(({ it }) => it.tipo === 'repuesto' && !it.opcional)
            .map(({ it, idx }) => (
              <div key={it.id} {...propsFila(`item:${it.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', cursor: 'grab' }}>
                <TextField
                  type="number" min="0" step="1" placeholder="Cant."
                  value={it.cantidad}
                  onChange={(e) => actualizarCampo(idx, 'cantidad', e.target.value)}
                  style={{ width: 80 }}
                />
                <TextField
                  placeholder="Código"
                  value={it.repuesto_codigo || ''}
                  onChange={(e) => actualizarCampo(idx, 'repuesto_codigo', e.target.value)}
                  style={{ width: 180 }}
                />
                <TextField
                  placeholder="Descripción del repuesto"
                  value={it.descripcion_custom || ''}
                  onChange={(e) => actualizarDescCustom(idx, e.target.value)}
                  style={{ flex: 1, minWidth: 160 }}
                />
                <CategoriaField
                  value={it.categoria || ''}
                  onChange={(v) => actualizarCampo(idx, 'categoria', v)}
                  style={{ width: 150 }}
                />
                <TextField
                  type="number" step="0.01" placeholder="P. unitario"
                  value={it.precio_unitario}
                  onChange={(e) => actualizarCampo(idx, 'precio_unitario', e.target.value)}
                  title="Precio unitario — se puede editar"
                  style={{ width: 130 }}
                />
                <TextField
                  value={textoSubtotal(Number(it.precio_unitario) || 0, it.cantidad)}
                  onChange={(e) => actualizarSubtotal(idx, e.target.value)}
                  title="Subtotal — se puede editar; el precio unitario se recalcula solo"
                  style={{ width: 130, textAlign: 'right', fontWeight: 600 }}
                />
                <BotonOpcional
                  opcional={Boolean(it.opcional)}
                  onClick={() => moverItemOpcional(`item:${it.id}`, !it.opcional)}
                />
                <button onClick={() => quitarItem(idx)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }}>
                  <Icon n="x" s={16} />
                </button>
              </div>
            ))}
          <Button variant="ghost" size="sm" iconLeft={<Icon n="plus" s={14} />} onClick={agregarItemRepuesto} style={{ alignSelf: 'flex-start' }}>
            Agregar repuesto a mano
          </Button>
        </div>

        {/* Caja de opcionales: lo que queda fuera del total. Se arrastra acá
            desde el bloque de arriba (o con la flechita del renglón), y lo que
            cae adentro deja de sumar pero sigue guardado y sale en el PDF. */}
        <CajaOpcionales
          total={totalOpcionalesEditado}
          cantidad={itemsOpcionalesEdicion.length + gruposOpcionales.length}
          activa={zonaActiva === true}
          dropProps={propsZona(true)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {itemsOpcionalesEdicion.map(({ it, idx }) => (
              it.tipo === 'repuesto' ? (
                <div key={it.id} {...propsFila(`item:${it.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', cursor: 'grab' }}>
                  <TextField
                    type="number" min="0" step="1" placeholder="Cant."
                    value={it.cantidad}
                    onChange={(e) => actualizarCampo(idx, 'cantidad', e.target.value)}
                    style={{ width: 80 }}
                  />
                  <span style={{ flex: 1, minWidth: 160, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>
                    {it.descripcion_custom || it.repuesto_codigo}
                  </span>
                  <TextField
                    type="number" step="0.01" placeholder="P. unitario"
                    value={it.precio_unitario}
                    onChange={(e) => actualizarCampo(idx, 'precio_unitario', e.target.value)}
                    style={{ width: 130 }}
                  />
                  <TextField
                    value={textoSubtotal(Number(it.precio_unitario) || 0, it.cantidad)}
                    onChange={(e) => actualizarSubtotal(idx, e.target.value)}
                    style={{ width: 130, textAlign: 'right', fontWeight: 600 }}
                  />
                  <BotonOpcional opcional onClick={() => moverItemOpcional(`item:${it.id}`, false)} />
                  <button onClick={() => quitarItem(idx)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }}>
                    <Icon n="x" s={16} />
                  </button>
                </div>
              ) : filaServicioEdicion(it, idx)
            ))}

            {/* Los repuestos de catálogo marcados como opcionales se editan en
                el pop-up "Ver repuestos"; acá se listan para poder devolverlos
                al presupuesto de un toque. */}
            {gruposOpcionales.map((linea) => (
              <div key={linea.key} {...propsFila(`repuesto:${linea.key}`)} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', cursor: 'grab' }}>
                <span style={{ width: 60, textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                  ×{fmtCantidad(linea.cantidad)}
                </span>
                <span style={{ flex: 1, minWidth: 160, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>
                  {linea.descripcion}
                  {linea.categoria && <span style={{ color: 'var(--text-faint)' }}> · {linea.categoria}</span>}
                </span>
                <span style={{ width: 130, textAlign: 'right', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                  {formatPrecioARS(subtotalDe(linea))}
                </span>
                <BotonOpcional opcional onClick={() => moverItemOpcional(`repuesto:${linea.key}`, false)} />
              </div>
            ))}
          </div>
        </CajaOpcionales>

        <RepuestoPicker
          sugeridos={sugeridos}
          cantidadPorCodigo={cantidadPorCodigo}
          onAgregar={agregarConTilde}
          estadoDe={estadoDeCodigo}
          onToggleFicha={alternarFicha}
          motorId={detalle?.motor_id}
          reorderKey="repuestos-presupuesto"
          onVerAgregados={() => setModalRepuestos(true)}
          cantidadAgregados={editGrupos.length}
          ayudaFilas="Poné una cantidad para cotizarlo, o tocá el círculo para dejarlo guardado como repuesto de este motor sin cotizarlo"
        />
        </div>
      )}

      <ModalRepuestosAgregados
        open={modalRepuestos}
        items={editGrupos}
        onCambiarCantidad={cambiarCantidadGrupo}
        onCambiarPrecio={cambiarPrecioGrupo}
        onCambiarSubtotal={cambiarSubtotalGrupo}
        onToggleOpcional={toggleOpcionalGrupo}
        onQuitar={quitarRepuestoConDeshacer}
        onQuitarVarias={quitarVariasConDeshacer}
        onClose={() => setModalRepuestos(false)}
      />

      <ModalRevalidacion
        open={!!revalidacion}
        resumen={revalidacion}
        aplicando={aplicandoRevalidacion}
        onConfirmar={aplicarRevalidacion}
        onClose={() => setRevalidacion(null)}
      />

      <div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 6 }}>Notas</div>
        {!editMode ? (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: detalle.notas ? 'var(--text-body)' : 'var(--text-faint)', margin: 0 }}>
            {detalle.notas || 'Sin notas.'}
          </p>
        ) : (
          <TextField as="textarea" rows={3} value={editNotas} onChange={(e) => setEditNotas(e.target.value)} />
        )}
      </div>

      {!editMode && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '18px 22px', background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)' }}>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>PDF</div>
          {ultimoPdf && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
                Versión {ultimoPdf.version} · {formatFechaAR(ultimoPdf.fecha)}
              </span>
              <Button variant="secondary" size="sm" iconLeft={<Icon n="eye" s={14} />} onClick={() => window.open(`/api/presupuestos/${id}/pdf/${ultimoPdf.version}`, '_blank')}>
                Abrir
              </Button>
            </div>
          )}
          <Button variant="ghost" size="sm" iconLeft={<Icon n="rotate-cw" s={14} />} disabled={reconstruyendo} onClick={reconstruirPdf} style={{ alignSelf: 'flex-start' }}>
            {reconstruyendo ? 'Reconstruyendo…' : 'Reconstruir PDF'}
          </Button>

          {anteriores.length > 0 && (
            <div>
              <button
                onClick={() => setVerVersionesAnteriores((v) => !v)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: 0, color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}
              >
                <Icon n={verVersionesAnteriores ? 'chevron-down' : 'chevron-right'} s={14} />
                Ver versiones anteriores ({anteriores.length})
              </button>
              {verVersionesAnteriores && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, paddingLeft: 20 }}>
                  {anteriores.map((p) => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                        Versión {p.version} · {formatFechaAR(p.fecha)}
                      </span>
                      <Button variant="ghost" size="sm" iconLeft={<Icon n="eye" s={14} />} onClick={() => window.open(`/api/presupuestos/${id}/pdf/${p.version}`, '_blank')}>
                        Abrir
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmarSalir}
        title="¿Salir sin guardar?"
        message="Vas a perder los cambios que hiciste en este presupuesto."
        confirmLabel="Salir sin guardar"
        danger
        onCancel={() => setConfirmarSalir(false)}
        onConfirm={() => { setConfirmarSalir(false); setEditMode(false); navigate(-1) }}
      />

      <ConfirmDialog
        open={confirmarEliminar}
        title="¿Eliminar presupuesto?"
        message={`Se va a eliminar el presupuesto #${String(detalle.id).padStart(4, '0')} junto con sus PDFs. Vas a tener unos segundos para deshacerlo.`}
        confirmLabel="Eliminar"
        danger
        onCancel={() => setConfirmarEliminar(false)}
        onConfirm={eliminar}
      />
    </div>
  )
}
