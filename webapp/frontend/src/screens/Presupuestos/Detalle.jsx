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
import { formatPrecioARS, formatFechaAR } from '../../utils/format'
import { gruposParaPayload, totalRepuestos, agruparLineas, opcionElegida, subtotalDe } from '../../utils/grupos'
import { useRepuestosAgrupados } from '../../hooks/useRepuestosAgrupados'

const TIPO_LABEL = { mecanico: 'Mecánico', dueno: 'Dueño del vehículo' }
const TIPO_OPUESTO = { mecanico: 'dueno', dueno: 'mecanico' }

// Avisos de cambios post-emisión: cada línea de repuesto guarda el precio y el
// stock congelados al cotizar; el backend manda además precio_actual/stock_actual
// del catálogo vigente. Si difieren, se avisa acá (nunca en el PDF).
function warningsRepuesto(it) {
  const w = []
  if (!it.repuesto_codigo) return w
  // stock es NOT NULL en el catálogo: si vino null, el código ya no está en la lista.
  if (it.stock_actual === null || it.stock_actual === undefined) {
    w.push('Ya no está en la lista del catálogo')
    return w
  }
  if (it.precio_actual && it.precio_unitario !== null && it.precio_actual !== it.precio_unitario) {
    w.push(`Precio de lista cambió: ${formatPrecioARS(it.precio_unitario)} → ${formatPrecioARS(it.precio_actual)}`)
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
function construirPayload(lista, notas, ajustePct, lineasGrupos = [], elegidaAMano = {}) {
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
    }))
  return {
    items: [...servicios, ...repuestos],
    // Los grupos van aparte: el backend elige el más caro de cada uno y guarda
    // todas las opciones. Los repuestos de arriba son los sueltos (sin grupo).
    grupos_repuestos: gruposParaPayload(lineasGrupos, elegidaAMano),
    notas,
    ajuste_pct: ajustePct || 0,
  }
}

// Una opción congelada del backend, en la forma de línea que usan el hook de
// agrupado y el pop-up de repuestos (los mismos que el wizard).
function lineaDeOpcion(grupo, o) {
  return {
    key: o.repuesto_codigo || `op-${grupo.grupo_num}-${o.descripcion}`,
    repuesto_codigo: o.repuesto_codigo,
    descripcion: o.descripcion,
    categoria: grupo.categoria,
    cat_prefijo: null,
    marca: o.marca,
    medida: o.medida,
    grupo: grupo.categoria,
    cantidad: o.cantidad,
    precio_unitario: o.precio_unitario,
    precioTexto: o.precio_unitario ? formatPrecioARS(o.precio_unitario) : '',
    stock: o.stock_al_cotizar,
    esManual: !o.repuesto_codigo,
  }
}

function elegidaAManoInicial(grupos) {
  return Object.fromEntries(
    grupos
      .filter((g) => g.opciones.some((o) => o.elegida_a_mano))
      .map((g) => [g.categoria, g.opciones.find((o) => o.elegida_a_mano).repuesto_codigo]),
  )
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
  const [elegidaAMano, setElegidaAMano] = React.useState({})
  const [modalRepuestos, setModalRepuestos] = React.useState(false)
  const [aprobando, setAprobando] = React.useState(false)
  const [editNotas, setEditNotas] = React.useState('')
  const [guardando, setGuardando] = React.useState(false)
  const [reconstruyendo, setReconstruyendo] = React.useState(false)
  const [confirmarSalir, setConfirmarSalir] = React.useState(false)
  const [confirmarEliminar, setConfirmarEliminar] = React.useState(false)
  const [eliminando, setEliminando] = React.useState(false)
  const [sugeridos, setSugeridos] = React.useState([])
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
    setElegidaAMano(Object.fromEntries(
      grupos
        .filter((g) => g.opciones.some((o) => o.elegida_a_mano))
        .map((g) => [g.categoria, g.opciones.find((o) => o.elegida_a_mano).repuesto_codigo]),
    ))

    const itemsIniciales = items
      .filter((it) => it.grupo_num == null)
      .map((it) => (
        it.tipo === 'repuesto'
          ? { ...it }
          // Presupuestos armados antes de soportar cantidad en servicios no
          // tienen precio_unitario guardado: se asume cantidad 1 y que
          // precio_aplicado YA era el unitario.
          : { ...it, cantidad: it.cantidad || 1, precio_unitario: it.precio_unitario ?? it.precio_aplicado }
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
      construirPayload(itemsIniciales, notasIniciales, ajusteInicial, lineasGrupos, elegidaAManoInicial(grupos)),
    )
    setEditMode(true)
    if (detalle?.motor_id) {
      api.get(`/motores/${detalle.motor_id}/ficha-repuestos`)
        .then((ficha) => setSugeridos(ficha.flatMap((g) => g.opciones.map((o) => ({
          codigo: o.codigo,
          descripcion: o.descripcion || o.codigo,
          categoria: g.categoria,
          cat_prefijo: g.cat_prefijo,
          marca: o.marca,
          medida: o.medida,
          precio_actual: o.precio_actual,
          stock_actual: o.stock_actual,
        })))))
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
  const quitarItem = (idx) => setEditItems((prev) => prev.filter((_, i) => i !== idx))
  const agregarItemCustom = () => {
    setEditItems((prev) => [...prev, { id: `nuevo-${Date.now()}`, servicio_id: null, item_num: null, desc_facra: null, descripcion_custom: '', cantidad: 1, precio_unitario: '' }])
  }
  const agregarItemRepuesto = () => {
    setEditItems((prev) => [...prev, {
      id: `nuevo-rep-${Date.now()}`, servicio_id: null, item_num: null, desc_facra: null,
      tipo: 'repuesto', repuesto_codigo: '', descripcion_custom: '', categoria: '',
      cantidad: 1, precio_unitario: '', stock_al_cotizar: null,
    }])
  }

  const setCantidadGrupo = React.useCallback((grupo, cantidad) => {
    setCantidadPorGrupo((prev) => (prev[grupo] === cantidad ? prev : { ...prev, [grupo]: cantidad }))
  }, [])

  const elegirAMano = React.useCallback((grupo, codigo) => {
    setElegidaAMano((prev) => ({ ...prev, [grupo]: prev[grupo] === codigo ? null : codigo }))
  }, [])

  // Mismo agrupado automático que en el wizard: lo que se agrega dentro de una
  // categoría entra al grupo de esa categoría, con las medidas hermanas.
  const {
    cantidadPorCodigo, agregar: agregarDeCatalogo,
    cambiarCantidad: cambiarCantidadGrupo, cambiarPrecio: cambiarPrecioGrupo, quitar: quitarDeGrupo,
  } = useRepuestosAgrupados({
    lineas: editGrupos,
    setLineas: setEditGrupos,
    cantidadPorGrupo,
    setCantidadGrupo,
  })

  const guardar = async () => {
    setGuardando(true)
    setError('')
    try {
      const payload = construirPayload(editItems, editNotas, ajustePct, editGrupos, elegidaAMano)
      // Si el payload es idéntico al que había al entrar en modo edición, no
      // hubo cambios de verdad: no tiene sentido generar una versión de PDF
      // nueva (y consumir un número de versión) por un guardado que no cambió nada.
      const huboCambios = JSON.stringify(payload) !== payloadOriginalRef.current
      await api.put(`/presupuestos/${id}`, payload)
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

  const eliminar = async () => {
    setEliminando(true)
    setError('')
    try {
      await api.del(`/presupuestos/${id}`)
      navigate('/presupuestos')
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el presupuesto')
      setEliminando(false)
      setConfirmarEliminar(false)
    }
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

  // En edición el total suma los ítems sueltos más, de cada grupo, solo la
  // opción con la que se cotiza (las alternativas no se cobran).
  const totalEditado = editItems.reduce((acc, it) => acc + (Number(it.precio_unitario) || 0) * (Number(it.cantidad) || 0), 0)
    + totalRepuestos(editGrupos, elegidaAMano)
  const gruposEditados = agruparLineas(editGrupos).grupos
  const colorAjuste = ajustePct > 0 ? 'var(--status-active-fg)' : ajustePct < 0 ? 'var(--status-expired-fg)' : 'var(--border-default)'

  const serviciosItems = items.filter((it) => it.tipo !== 'repuesto')
  const repuestoItems = items.filter((it) => it.tipo === 'repuesto')
  const warningsPorItem = new Map(repuestoItems.map((it) => [it.id, warningsRepuesto(it)]))
  const hayWarnings = [...warningsPorItem.values()].some((w) => w.length > 0)

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
                <Button variant="secondary" iconLeft={<Icon n="share" s={16} />} disabled={!ultimoPdf} onClick={compartirPdf}>Compartir PDF</Button>
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
                  La lista de repuestos cambió desde la emisión de este presupuesto — revisá los avisos antes de reconfirmar.
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

          {grupos.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
                Opciones guardadas
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                Todas las marcas y medidas que sirven para cada repuesto de este presupuesto. Se cotizó la más cara;
                el resto queda para decidir qué pedir.
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
                      {o.elegida && <StatusBadge status="active">{o.elegida_a_mano ? 'Elegido a mano' : 'Cotizado'}</StatusBadge>}
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
        <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', background: 'var(--surface-card)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
            Detalle de mano de obra
          </div>
          {editItems
            .map((it, idx) => ({ it, idx }))
            .filter(({ it }) => it.tipo !== 'repuesto')
            .map(({ it, idx }) => (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
                  style={{ width: 130 }}
                />
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, width: 120, textAlign: 'right' }}>
                  {formatPrecioARS((Number(it.precio_unitario) || 0) * (Number(it.cantidad) || 0))}
                </span>
                <button onClick={() => quitarItem(idx)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }}>
                  <Icon n="x" s={16} />
                </button>
              </div>
            ))}
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
                const elegida = opcionElegida(g.opciones, elegidaAMano[g.categoria])
                return (
                  <div key={g.categoria} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-strong)', width: 170 }}>
                      {g.categoria}
                    </span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-faint)', width: 90 }}>
                      {g.opciones.length} opcion{g.opciones.length === 1 ? '' : 'es'}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                      Cotiza: {elegida ? `${elegida.descripcion}${elegida.marca ? ` · ${elegida.marca}` : ''}` : '—'}
                    </span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, width: 120, textAlign: 'right' }}>
                      {elegida ? formatPrecioARS(subtotalDe(elegida)) : '—'}
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
            .filter(({ it }) => it.tipo === 'repuesto')
            .map(({ it, idx }) => (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
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
                  style={{ width: 130 }}
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

        <RepuestoPicker
          sugeridos={sugeridos}
          cantidadPorCodigo={cantidadPorCodigo}
          onAgregar={agregarDeCatalogo}
          reorderKey="repuestos-presupuesto"
          onVerAgregados={() => setModalRepuestos(true)}
          cantidadAgregados={editGrupos.length}
          ayudaFilas="Lo que agregues dentro de una categoría forma un grupo: se cotiza el más caro y quedan guardadas todas las opciones"
        />
        </div>
      )}

      <ModalRepuestosAgregados
        open={modalRepuestos}
        items={editGrupos}
        elegidaAMano={elegidaAMano}
        onElegirAMano={elegirAMano}
        onCambiarCantidad={cambiarCantidadGrupo}
        onCambiarPrecio={cambiarPrecioGrupo}
        onQuitar={quitarDeGrupo}
        onClose={() => setModalRepuestos(false)}
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
        message={`Se va a eliminar el presupuesto #${String(detalle.id).padStart(4, '0')} junto con sus PDFs. Esta acción no se puede deshacer.`}
        confirmLabel={eliminando ? 'Eliminando…' : 'Eliminar'}
        danger
        onCancel={() => setConfirmarEliminar(false)}
        onConfirm={eliminar}
      />
    </div>
  )
}
