import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { PageHeader } from '../../components/PageHeader'
import { DataTable } from '../../components/DataTable'
import { Button } from '../../components/Button'
import { TextField } from '../../components/TextField'
import { Icon } from '../../components/Icon'
import { ErrorBanner } from '../../components/ErrorBanner'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { formatPrecioARS, formatFechaAR } from '../../utils/format'

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

  const cargar = React.useCallback(() => {
    api.get(`/presupuestos/${id}`).then(setDetalle)
    api.get(`/presupuestos/${id}/items`).then(setItems)
    api.get(`/presupuestos/${id}/pdfs`).then(setPdfs)
  }, [id])

  React.useEffect(() => { cargar() }, [cargar])

  const entrarEdicion = () => {
    setEditItems(items.map((it) => ({ ...it })))
    setEditNotas(detalle?.notas || '')
    setEditMode(true)
  }

  const cancelarEdicion = () => setEditMode(false)

  const intentarVolver = () => {
    if (editMode) { setConfirmarSalir(true); return }
    navigate(-1)
  }

  const actualizarPrecio = (idx, valor) => {
    setEditItems((prev) => prev.map((it, i) => (i === idx ? { ...it, precio_aplicado: valor } : it)))
  }
  const actualizarDescCustom = (idx, valor) => {
    setEditItems((prev) => prev.map((it, i) => (i === idx ? { ...it, descripcion_custom: valor } : it)))
  }
  const quitarItem = (idx) => setEditItems((prev) => prev.filter((_, i) => i !== idx))
  const agregarItemCustom = () => {
    setEditItems((prev) => [...prev, { id: `nuevo-${Date.now()}`, servicio_id: null, item_num: null, desc_facra: null, descripcion_custom: '', precio_aplicado: '' }])
  }

  const guardar = async () => {
    setGuardando(true)
    setError('')
    try {
      const payload = {
        items: editItems
          .filter((it) => (it.desc_facra || (it.descripcion_custom || '').trim()) && it.precio_aplicado !== '')
          .map((it) => ({
            servicio_id: it.servicio_id,
            descripcion_custom: it.descripcion_custom,
            precio_aplicado: it.precio_aplicado,
          })),
        notas: editNotas,
      }
      await api.put(`/presupuestos/${id}`, payload)
      setEditMode(false)
      cargar()
    } catch (err) {
      setError(err.message || 'No se pudieron guardar los cambios')
    } finally {
      setGuardando(false)
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

  if (!detalle) {
    return <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Cargando…</div>
  }

  const ultimoPdf = pdfs[0]
  const anteriores = pdfs.slice(1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title={`Presupuesto #${String(detalle.id).padStart(4, '0')}`}
        subtitle={detalle.cliente}
        actions={
          <>
            <Button variant="secondary" iconLeft={<Icon n="arrow-left" s={16} />} onClick={intentarVolver}>Volver</Button>
            {!editMode && (
              <Button variant="primary" iconLeft={<Icon n="pencil" s={16} />} onClick={entrarEdicion}>Editar</Button>
            )}
          </>
        }
      />

      <ErrorBanner message={error} onClose={() => setError('')} />

      <div style={{ display: 'flex', gap: 40, padding: '18px 22px', background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)' }}>
        <Campo label="Cliente" valor={detalle.cliente} />
        <Campo label="Motor" valor={detalle.motor} />
        <Campo label="Fecha" valor={formatFechaAR(detalle.fecha)} />
        <Campo label="Total" valor={formatPrecioARS(detalle.total)} />
      </div>

      {!editMode ? (
        <DataTable
          columns={[
            { key: 'item_num', header: 'Nº', width: 70 },
            { key: 'desc', header: 'Descripción', wrap: true, render: (_, row) => row.desc_facra || row.descripcion_custom },
            { key: 'precio_aplicado', header: 'Precio', align: 'right', width: 140, render: formatPrecioARS },
          ]}
          rows={items}
        />
      ) : (
        <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', background: 'var(--surface-card)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {editItems.map((it, idx) => (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
                type="number" step="0.01" placeholder="Precio"
                value={it.precio_aplicado}
                onChange={(e) => actualizarPrecio(idx, e.target.value)}
                style={{ width: 140 }}
              />
              <button onClick={() => quitarItem(idx)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }}>
                <Icon n="x" s={16} />
              </button>
            </div>
          ))}
          <Button variant="ghost" size="sm" iconLeft={<Icon n="plus" s={14} />} onClick={agregarItemCustom} style={{ alignSelf: 'flex-start' }}>
            Agregar ítem
          </Button>
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
    </div>
  )
}
