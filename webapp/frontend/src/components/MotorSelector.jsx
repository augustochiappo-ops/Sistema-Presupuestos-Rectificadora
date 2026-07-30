import React from 'react'
import { api } from '../api/client'
import { SearchInput } from './SearchInput'
import { DataTable } from './DataTable'
import { Icon } from './Icon'

const COLUMNS = [
  { key: 'indice', header: 'Código', strong: true, width: 105 },
  {
    key: 'motor', header: 'Motor', wrap: true,
    render: (v, row) => (
      row.usado_antes
        ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon n="history" s={13} style={{ color: 'var(--status-active-fg)', flexShrink: 0 }} />
            {v}
          </span>
        )
        : v
    ),
  },
  { key: 'marca', header: 'Marca', width: 105 },
  { key: 'cilindrada', header: 'Cilindrada', width: 80 },
  { key: 'tipo', header: 'Tipo', width: 95 },
  { key: 'cilindros', header: 'Cil.', align: 'center', width: 45 },
  { key: 'diametro', header: 'Diámetro', align: 'right', width: 80, render: (v) => (v ? `${v} mm` : '—') },
  { key: 'lista_num', header: 'Lista', align: 'center', width: 55, render: (v) => v ?? '—' },
]

export function MotorSelector({ onSelect }) {
  const [marcas, setMarcas] = React.useState([])
  const [marcaSel, setMarcaSel] = React.useState('Todos')
  const [busqueda, setBusqueda] = React.useState('')
  const [motores, setMotores] = React.useState([])
  const [cargando, setCargando] = React.useState(true)

  React.useEffect(() => {
    api.get('/motores/marcas').then(setMarcas).catch(() => {})
  }, [])

  React.useEffect(() => {
    const t = setTimeout(() => {
      setCargando(true)
      const params = new URLSearchParams()
      if (marcaSel !== 'Todos') params.set('marca', marcaSel)
      if (busqueda) params.set('busqueda', busqueda)
      api.get(`/motores?${params.toString()}`)
        .then(setMotores)
        .finally(() => setCargando(false))
    }, 280)
    return () => clearTimeout(t)
  }, [marcaSel, busqueda])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SearchInput
        width="100%"
        icon={<Icon n="search" s={16} />}
        placeholder="Buscar por marca, modelo o código…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />
      <div className="motor-selector-grid">
        <div className="motor-selector-brands" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', padding: '14px 10px', minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-faint)', padding: '6px 12px' }}>Marcas</div>
          {['Todos', ...marcas].map((m) => (
            <button
              key={m}
              onClick={() => setMarcaSel(m)}
              className="motor-brand-btn"
              style={{
                textAlign: 'left', border: 'none', cursor: 'pointer',
                padding: '10px 12px', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)', fontSize: 14,
                fontWeight: marcaSel === m ? 600 : 500,
                background: marcaSel === m ? 'var(--surface-inverse)' : 'transparent',
                color: marcaSel === m ? '#fff' : 'var(--text-body)',
              }}
            >
              {m}
            </button>
          ))}
        </div>
        <DataTable
          columns={COLUMNS}
          reorderKey="motores"
          rows={motores}
          onRowClick={onSelect}
          getRowBackground={(row) => (row.usado_antes ? 'var(--status-active-bg)' : null)}
          emptyMessage={cargando ? 'Buscando…' : 'No se encontraron motores.'}
          style={{ minWidth: 0 }}
        />
      </div>
    </div>
  )
}
