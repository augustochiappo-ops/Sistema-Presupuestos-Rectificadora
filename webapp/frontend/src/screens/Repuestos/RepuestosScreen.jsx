import React from 'react'
import { api } from '../../api/client'
import { PageHeader } from '../../components/PageHeader'
import { DataTable } from '../../components/DataTable'
import { SearchInput } from '../../components/SearchInput'
import { StatusBadge } from '../../components/StatusBadge'
import { Icon } from '../../components/Icon'
import { formatPrecioARS } from '../../utils/format'

const COLUMNS = [
  { key: 'codigo', header: 'Código', width: 140, strong: true },
  { key: 'aplicacion', header: 'Descripción', wrap: true },
  { key: 'marca', header: 'Marca', width: 140, render: (v) => v || '—' },
  { key: 'categoria', header: 'Categoría', width: 160, render: (v) => v || '—' },
  { key: 'precio', header: 'Precio', align: 'right', width: 130, render: (v) => (v ? formatPrecioARS(v) : '—') },
  {
    key: 'stock', header: 'Stock', align: 'center', width: 90,
    render: (v) => <StatusBadge status={v ? 'active' : 'expired'}>{v ? 'Sí' : 'No'}</StatusBadge>,
  },
]

const selectStyle = {
  height: 44, padding: '0 14px', borderRadius: 'var(--radius-pill)',
  border: '1px solid var(--border-default)', background: 'var(--surface-card)',
  fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-strong)',
  minWidth: 200,
}

export default function RepuestosScreen() {
  const [categorias, setCategorias] = React.useState([])
  const [marcas, setMarcas] = React.useState([])
  const [categoriaSel, setCategoriaSel] = React.useState('')
  const [marcaSel, setMarcaSel] = React.useState('')
  const [codigo, setCodigo] = React.useState('')
  const [descripcion, setDescripcion] = React.useState('')
  const [resultado, setResultado] = React.useState({ total: 0, repuestos: [] })
  const [cargando, setCargando] = React.useState(false)

  React.useEffect(() => {
    api.get('/repuestos/categorias').then(setCategorias).catch(() => {})
    api.get('/repuestos/marcas').then(setMarcas).catch(() => {})
  }, [])

  const hayFiltro = Boolean(categoriaSel || marcaSel || codigo || descripcion)

  React.useEffect(() => {
    if (!hayFiltro) {
      setResultado({ total: 0, repuestos: [] })
      return
    }
    const t = setTimeout(() => {
      setCargando(true)
      const params = new URLSearchParams()
      if (categoriaSel) params.set('categoria', categoriaSel)
      if (marcaSel) params.set('marca', marcaSel)
      if (codigo) params.set('codigo', codigo)
      if (descripcion) params.set('descripcion', descripcion)
      api.get(`/repuestos?${params.toString()}`)
        .then(setResultado)
        .finally(() => setCargando(false))
    }, 280)
    return () => clearTimeout(t)
  }, [categoriaSel, marcaSel, codigo, descripcion, hayFiltro])

  let emptyMessage = 'Elegí una categoría, una marca, o escribí un código o una descripción para buscar repuestos.'
  if (hayFiltro) emptyMessage = cargando ? 'Buscando…' : 'No se encontraron repuestos.'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageHeader title="Repuestos" subtitle="Buscá repuestos del proveedor por categoría, marca, código o descripción." />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <select value={marcaSel} onChange={(e) => setMarcaSel(e.target.value)} style={selectStyle}>
          <option value="">Todas las marcas</option>
          {marcas.map((m) => (
            <option key={m.prefijo} value={m.prefijo}>{m.nombre}</option>
          ))}
        </select>
        <SearchInput
          width={220}
          icon={<Icon n="tag" s={16} />}
          placeholder="Filtrar por código…"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
        />
        <SearchInput
          width={300}
          icon={<Icon n="search" s={16} />}
          placeholder="Filtrar por descripción…"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />
      </div>

      <div className="motor-selector-grid">
        <div className="motor-selector-brands" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', padding: '14px 10px', minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-faint)', padding: '6px 12px' }}>Categorías</div>
          <button
            onClick={() => setCategoriaSel('')}
            className="motor-brand-btn"
            style={{
              textAlign: 'left', border: 'none', cursor: 'pointer',
              padding: '10px 12px', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)', fontSize: 14,
              fontWeight: categoriaSel === '' ? 600 : 500,
              background: categoriaSel === '' ? 'var(--surface-inverse)' : 'transparent',
              color: categoriaSel === '' ? '#fff' : 'var(--text-body)',
            }}
          >
            Todas
          </button>
          {categorias.map((c) => (
            <button
              key={c.prefijo}
              onClick={() => setCategoriaSel(c.prefijo)}
              className="motor-brand-btn"
              style={{
                textAlign: 'left', border: 'none', cursor: 'pointer',
                padding: '10px 12px', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)', fontSize: 14,
                fontWeight: categoriaSel === c.prefijo ? 600 : 500,
                background: categoriaSel === c.prefijo ? 'var(--surface-inverse)' : 'transparent',
                color: categoriaSel === c.prefijo ? '#fff' : 'var(--text-body)',
              }}
            >
              {c.nombre}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          {hayFiltro && (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              {resultado.total} repuesto{resultado.total === 1 ? '' : 's'} encontrado{resultado.total === 1 ? '' : 's'}
              {resultado.total > resultado.repuestos.length && ` — mostrando los primeros ${resultado.repuestos.length}`}
            </div>
          )}
          <DataTable columns={COLUMNS} rows={resultado.repuestos} emptyMessage={emptyMessage} style={{ minWidth: 0 }} />
        </div>
      </div>
    </div>
  )
}
