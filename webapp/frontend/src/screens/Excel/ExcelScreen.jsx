import React from 'react'
import { api } from '../../api/client'
import { PageHeader } from '../../components/PageHeader'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'

function Eyebrow({ children }) {
  return (
    <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
      {children}
    </div>
  )
}

function CardImport({ icon, title, desc, endpoint, disabled }) {
  const inputRef = React.useRef(null)
  const [estado, setEstado] = React.useState(null) // { ok: bool, mensaje: string } | null
  const [cargando, setCargando] = React.useState(false)

  const onFile = async (e) => {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo) return
    setCargando(true)
    setEstado(null)
    try {
      const form = new FormData()
      form.append('archivo', archivo)
      const data = await api.post(endpoint, form)
      setEstado({ ok: true, mensaje: data.mensaje })
    } catch (err) {
      setEstado({ ok: false, mensaje: err.message })
    } finally {
      setCargando(false)
    }
  }

  return (
    <div style={{
      background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)',
      padding: '22px 24px', opacity: disabled ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--surface-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon n={icon} s={20} />
        </div>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--text-strong)' }}>{title}</h3>
      </div>
      <p style={{ margin: '0 0 16px', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-muted)' }}>{desc}</p>

      <input ref={inputRef} type="file" accept=".xls" onChange={onFile} style={{ display: 'none' }} />
      <Button
        variant={disabled ? 'secondary' : 'primary'}
        disabled={disabled || cargando}
        iconLeft={<Icon n="file-up" s={16} />}
        onClick={() => inputRef.current?.click()}
      >
        {disabled ? 'No disponible aún' : cargando ? 'Importando…' : 'Cargar archivo .xls'}
      </Button>

      {estado && (
        <div style={{
          marginTop: 12, fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
          color: estado.ok ? 'var(--status-active-fg)' : 'var(--status-expired-fg)',
        }}>
          {estado.ok ? '✓' : '✗'} {estado.mensaje}
        </div>
      )}
    </div>
  )
}

export default function ExcelScreen() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader title="Actualizar Excel" subtitle="Importá los archivos de FACRA para mantener motores y precios al día." />

      <Eyebrow>FACRA</Eyebrow>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        <CardImport
          icon="file-text"
          title="Nomenclador de Motores"
          desc="Lista de todos los motores con su número de lista asignado (1–13)."
          endpoint="/excel/nomenclador"
        />
        <CardImport
          icon="dollar-sign"
          title="Lista Orientadora de Mano de Obra"
          desc="Precios vigentes por servicio, clasificados por número de lista."
          endpoint="/excel/lista-orientadora"
        />
      </div>

      <Eyebrow>CRAC — Próximamente</Eyebrow>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        <CardImport icon="package" title="Lista de Precios CRAC" desc="Precios de repuestos del proveedor CRAC. Se habilitará en una próxima versión." disabled />
        <CardImport icon="tag" title="Lista de Prefijos CRAC" desc="Codificación y prefijos de partes CRAC. Se habilitará en una próxima versión." disabled />
      </div>
    </div>
  )
}
