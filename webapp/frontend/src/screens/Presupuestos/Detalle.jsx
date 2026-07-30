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
import { formatPrecioARS, formatFechaAR } from '../../utils/format'

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
  const [pdfs, setPdfs] = React.useState([])
  const [verVersionesAnteriores, setVerVersionesAnteriores] = React.useState(false)
  const [error, setError] = React.useState('')

  const [editMode, setEditMode] = React.useState(false)
  const [editItems, setEditItems] = React.useState([])
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
  const pdfParaCompartir = React.useRef(null)

  const cargar = React.useCallback(() => {
    api.get(`/presupuestos/${id}`).then(setDetalle)
    api.get(`/presupuestos/${id}/items`).then(setItems)
    api.get(`/presupuestos/${id}/pdfs`).then(setPdfs)
  }, [id])

  React.useEffect(() => { cargar() }, [cargar])

  const entrarEdicion = () => {
    setEditItems(items.map((it) => (
      it.tipo === 'repuesto'
        ? { ...it }
        // Presupuestos armados antes de soportar cantidad en servicios no
        // tienen precio_unitario guardado: se asume cantidad 1 y que
        // precio_aplicado YA era el unitario. precioBase congela el unitario
        // con el que se entró a editar, para que el ajuste % de abajo tenga
        // un punto de partida fijo (no compone sobre sí mismo si se cambia
        // el % varias veces).
        : { ...it, cantidad: it.cantidad || 1, precio_unitario: it.precio_unitario ?? it.precio_aplicado, precioBase: it.precio_unitario ?? it.precio_aplicado }
    )))
    setEditNotas(detalle?.notas || '')
    setAjusteTexto('')
    setAjustePct(0)
    setEditMode(true)
    if (detalle?.motor_id) {
      api.get(`/motores/${detalle.motor_id}/repuestos-sugeridos`).then(setSugeridos).catch(() => {})
    }
  }

  // Aumento/descuento en % sobre la mano de obra, igual criterio que en el
  // wizard: solo toca servicios de la lista FACRA (desc_facra presente), no
  // ítems manuales ni repuestos, que ya tienen un precio elegido a mano. Se
  // aplica siempre desde precioBase (el valor con el que se entró a editar),
  // así que pisa cualquier edición manual de precio hecha después de tocar
  // el %, pero no compone si se cambia el % varias veces seguidas.
  const aplicarAjusteTexto = (texto) => {
    setAjusteTexto(texto)
    const normalizado = texto.replace(',', '.').trim()
    const pct = normalizado === '' || normalizado === '-' ? 0 : parseFloat(normalizado)
    const pctValido = Number.isNaN(pct) ? 0 : pct
    setAjustePct(pctValido)
    const factor = 1 + pctValido / 100
    setEditItems((prev) => prev.map((it) => (
      it.tipo !== 'repuesto' && it.desc_facra
        ? { ...it, precio_unitario: Math.round((it.precioBase || 0) * factor * 100) / 100 }
        : it
    )))
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

  // Cantidades ya cargadas por código: el picker las usa para el ×N y para
  // saber si tiene que sumar una línea nueva o pisar la cantidad de una existente.
  const cantidadPorCodigo = React.useMemo(() => {
    const m = new Map()
    editItems.forEach((it) => {
      if (it.tipo === 'repuesto' && it.repuesto_codigo) m.set(it.repuesto_codigo, Number(it.cantidad) || 0)
    })
    return m
  }, [editItems])

  const agregarDeCatalogo = ({ codigo, descripcion, precio, stock, categoria }, cantidad) => {
    setEditItems((prev) => {
      const idx = prev.findIndex((it) => it.tipo === 'repuesto' && it.repuesto_codigo === codigo)
      if (idx >= 0) return prev.map((it, i) => (i === idx ? { ...it, cantidad } : it))
      return [...prev, {
        id: `nuevo-rep-${Date.now()}`, servicio_id: null, item_num: null, desc_facra: null,
        tipo: 'repuesto', repuesto_codigo: codigo, descripcion_custom: descripcion || codigo,
        categoria: categoria || '', cantidad, precio_unitario: precio || 0,
        stock_al_cotizar: stock ?? null,
      }]
    })
  }

  const guardar = async () => {
    setGuardando(true)
    setError('')
    try {
      const servicios = editItems
        .filter((it) => it.tipo !== 'repuesto')
        .filter((it) => (it.desc_facra || (it.descripcion_custom || '').trim()) && it.precio_unitario !== '' && Number(it.cantidad) > 0)
        .map((it) => ({
          servicio_id: it.servicio_id,
          descripcion_custom: it.descripcion_custom,
          cantidad: it.cantidad,
          precio_unitario: it.precio_unitario,
        }))
      const repuestos = editItems
        .filter((it) => it.tipo === 'repuesto')
        .filter((it) => (it.descripcion_custom || '').trim() && it.precio_unitario !== '' && Number(it.cantidad) > 0)
        .map((it) => ({
          tipo: 'repuesto',
          repuesto_codigo: (it.repuesto_codigo || '').trim() || null,
          descripcion: it.descripcion_custom,
          // La categoría congelada al cotizar viaja de vuelta tal cual: es lo que
          // sale en el PDF y editar el presupuesto no tiene por qué borrarla.
          categoria: it.categoria,
          cantidad: it.cantidad,
          precio_unitario: it.precio_unitario,
          // Se devuelve el stock congelado tal cual vino: la edición no re-lee
          // el catálogo, para no pisar la foto tomada al cotizar.
          stock_al_cotizar: it.stock_al_cotizar,
        }))
      const payload = { items: [...servicios, ...repuestos], notas: editNotas }
      await api.put(`/presupuestos/${id}`, payload)
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

  const reconstruirPdf = async () => {
    setReconstruyendo(true)
    setError('')
    const pdfTab = window.open('', '_blank')
    try {
      const nuevaLista = await api.post(`/presupuestos/${id}/pdf`)
      setPdfs(nuevaLista)
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

  const totalEditado = editItems.reduce((acc, it) => acc + (Number(it.precio_unitario) || 0) * (Number(it.cantidad) || 0), 0)
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
            {!editMode && (
              <>
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
        <Campo label="Motor" valor={detalle.motor} />
        <Campo label="Fecha" valor={formatFechaAR(detalle.fecha)} />
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
                  { key: 'repuesto_codigo', header: 'Código', width: 120, strong: true, render: (v) => v || '—' },
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
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <RepuestoPicker
          sugeridos={sugeridos}
          cantidadPorCodigo={cantidadPorCodigo}
          onAgregar={agregarDeCatalogo}
          reorderKey="repuestos-presupuesto"
        />

        <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', background: 'var(--surface-card)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {editItems.map((it, idx) => (
            it.tipo === 'repuesto' ? (
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
                  style={{ width: 120 }}
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
            ) : (
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
            )
          ))}
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="ghost" size="sm" iconLeft={<Icon n="plus" s={14} />} onClick={agregarItemCustom}>
              Agregar ítem
            </Button>
            <Button variant="ghost" size="sm" iconLeft={<Icon n="plus" s={14} />} onClick={agregarItemRepuesto}>
              Agregar repuesto a mano
            </Button>
          </div>
        </div>
        </div>
      )}

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

      {editMode && (
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="primary" iconLeft={<Icon n="save" s={16} />} disabled={guardando} onClick={guardar}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </Button>
          <Button variant="secondary" onClick={cancelarEdicion}>Cancelar</Button>
        </div>
      )}

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
