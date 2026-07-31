import React from 'react'
import { api, ApiError } from '../../api/client'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'

const ETIQUETAS = {
  motores: 'Motores',
  servicios: 'Servicios (mano de obra)',
  clientes: 'Clientes',
  presupuestos: 'Presupuestos',
  crac_repuestos: 'Repuestos (catálogo proveedor)',
}

function formatearFecha(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

export default function BackupPanel() {
  const inputRef = React.useRef(null)
  const [exportando, setExportando] = React.useState(false)
  const [estadoExport, setEstadoExport] = React.useState(null)
  const [analizando, setAnalizando] = React.useState(false)
  const [estadoImport, setEstadoImport] = React.useState(null)
  const [preview, setPreview] = React.useState(null)
  const [restaurando, setRestaurando] = React.useState(false)

  const generarBackup = async () => {
    setExportando(true)
    setEstadoExport(null)
    try {
      const res = await fetch('/api/backup/exportar', { credentials: 'include' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || `Error ${res.status}`)
      }
      const blob = await res.blob()
      const disposition = res.headers.get('content-disposition') || ''
      const match = disposition.match(/filename="?([^";]+)"?/)
      const nombre = match?.[1] || `backup-rectificadora-${Date.now()}.zip`

      const enlace = document.createElement('a')
      enlace.href = URL.createObjectURL(blob)
      enlace.download = nombre
      document.body.appendChild(enlace)
      enlace.click()
      document.body.removeChild(enlace)
      setEstadoExport({ ok: true, mensaje: `Copia de seguridad descargada (${nombre}).` })
    } catch (err) {
      setEstadoExport({ ok: false, mensaje: err.message })
    } finally {
      setExportando(false)
    }
  }

  const onFile = async (e) => {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo) return
    setAnalizando(true)
    setEstadoImport(null)
    setPreview(null)
    try {
      const form = new FormData()
      form.append('archivo', archivo)
      const data = await api.post('/backup/analizar', form)
      if (data.ya_cargada) {
        setEstadoImport({ ok: true, mensaje: 'Copia de seguridad ya cargada.' })
      } else {
        setPreview(data)
      }
    } catch (err) {
      setEstadoImport({ ok: false, mensaje: err instanceof ApiError ? err.message : 'No se pudo leer el archivo.' })
    } finally {
      setAnalizando(false)
    }
  }

  const confirmarRestauracion = async () => {
    if (!preview) return
    setRestaurando(true)
    try {
      const data = await api.post('/backup/restaurar', { token: preview.token })
      setPreview(null)
      setEstadoImport({
        ok: true,
        mensaje: `Copia de seguridad restaurada: ${data.pdfs_agregados} PDF nuevo(s), ${data.pdfs_actualizados} actualizado(s). Recargando…`,
      })
      setTimeout(() => window.location.reload(), 1500)
    } catch (err) {
      setEstadoImport({ ok: false, mensaje: err instanceof ApiError ? err.message : 'No se pudo restaurar la copia de seguridad.' })
    } finally {
      setRestaurando(false)
    }
  }

  const filas = preview
    ? Array.from(new Set([...Object.keys(preview.resumen_backup || {}), ...Object.keys(preview.resumen_actual || {})]))
    : []

  return (
    <div style={{
      background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)',
      padding: '22px 24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--surface-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon n="download" s={20} />
        </div>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--text-strong)' }}>Copia de seguridad</h3>
      </div>
      <p style={{ margin: '0 0 16px', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-muted)' }}>
        Incluye la base de datos completa (motores, servicios, clientes, presupuestos y catálogo de repuestos) y todos los PDFs generados. Los Excel de FACRA y el CSV del proveedor no se incluyen: se pueden volver a cargar desde las tarjetas de arriba.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Button variant="primary" disabled={exportando} iconLeft={<Icon n="download" s={16} />} onClick={generarBackup}>
          {exportando ? 'Generando…' : 'Generar copia de seguridad'}
        </Button>

        <input ref={inputRef} type="file" accept=".zip" onChange={onFile} style={{ display: 'none' }} />
        <Button variant="secondary" disabled={analizando} iconLeft={<Icon n="file-up" s={16} />} onClick={() => inputRef.current?.click()}>
          {analizando ? 'Analizando…' : 'Cargar copia de seguridad'}
        </Button>
      </div>

      {estadoExport && (
        <div style={{ marginTop: 12, fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: estadoExport.ok ? 'var(--status-active-fg)' : 'var(--status-expired-fg)' }}>
          {estadoExport.ok ? '✓' : '✗'} {estadoExport.mensaje}
        </div>
      )}
      {estadoImport && (
        <div style={{ marginTop: 12, fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: estadoImport.ok ? 'var(--status-active-fg)' : 'var(--status-expired-fg)' }}>
          {estadoImport.ok ? '✓' : '✗'} {estadoImport.mensaje}
        </div>
      )}

      <Modal open={!!preview} title="Confirmar restauración" onClose={() => !restaurando && setPreview(null)} maxWidth={520}>
        {preview && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-muted)' }}>
              Backup generado el <strong>{formatearFecha(preview.creado)}</strong>.
              {!preview.db_identica && ' Esto reemplaza la base de datos actual por la del backup (se guarda una copia de la actual antes, por las dudas).'}
            </p>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-body)', fontSize: 13 }}>
              <thead>
                <tr style={{ color: 'var(--text-faint)', textAlign: 'left' }}>
                  <th style={{ padding: '4px 8px 4px 0', fontWeight: 600 }}>Datos</th>
                  <th style={{ padding: '4px 8px', fontWeight: 600, textAlign: 'right' }}>Actual</th>
                  <th style={{ padding: '4px 0', fontWeight: 600, textAlign: 'right' }}>Backup</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((k) => (
                  <tr key={k}>
                    <td style={{ padding: '4px 8px 4px 0', color: 'var(--text-strong)' }}>{ETIQUETAS[k] || k}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>{preview.resumen_actual?.[k] ?? '—'}</td>
                    <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 600 }}>{preview.resumen_backup?.[k] ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-muted)' }}>
              PDFs nuevos: <strong>{preview.pdfs_nuevos.length}</strong> · actualizados: <strong>{preview.pdfs_actualizados.length}</strong> · sin cambios: {preview.pdfs_sin_cambios}
              {preview.pdfs_nuevos.length > 0 && (
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {preview.pdfs_nuevos.slice(0, 8).map((n) => <li key={n}>{n}</li>)}
                  {preview.pdfs_nuevos.length > 8 && <li>… y {preview.pdfs_nuevos.length - 8} más</li>}
                </ul>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button variant="secondary" size="sm" disabled={restaurando} onClick={() => setPreview(null)}>Cancelar</Button>
              <Button variant="danger" size="sm" disabled={restaurando} onClick={confirmarRestauracion}>
                {restaurando ? 'Restaurando…' : 'Restaurar copia de seguridad'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
