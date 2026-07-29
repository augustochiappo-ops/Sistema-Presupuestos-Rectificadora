import React from 'react'
import { api } from '../../../api/client'
import { DataTable } from '../../../components/DataTable'
import { SearchInput } from '../../../components/SearchInput'
import { StatusBadge } from '../../../components/StatusBadge'
import { TextField } from '../../../components/TextField'
import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import { formatPrecioARS, parsePrecioARS } from '../../../utils/format'

const selectStyle = {
  height: 44, padding: '0 14px', borderRadius: 'var(--radius-pill)',
  border: '1px solid var(--border-default)', background: 'var(--surface-card)',
  fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-strong)',
  minWidth: 180,
}

const tituloSeccion = {
  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
  letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-faint)',
}

/*
 * Paso 4 del wizard. Componente controlado: la lista de repuestos agregados
 * (value) vive en el wizard. Cada línea:
 *   { key, repuesto_codigo, descripcion, cantidad, precio_unitario, precioTexto, stock, esManual }
 * key = código de catálogo o 'manual-<ts>' (la API de repuestos no expone id).
 * stock: 1/0 congelado al agregar (null en manuales) — solo para el aviso en pantalla.
 */
export function PasoRepuestos({ motor, value, onChange, totalServicios, hayServicios, onConfirmar, guardando }) {
  const [sugeridos, setSugeridos] = React.useState([])
  const [categorias, setCategorias] = React.useState([])
  const [marcas, setMarcas] = React.useState([])
  const [categoriaSel, setCategoriaSel] = React.useState('')
  const [marcaSel, setMarcaSel] = React.useState('')
  const [codigo, setCodigo] = React.useState('')
  const [descripcion, setDescripcion] = React.useState('')
  const [resultado, setResultado] = React.useState({ total: 0, repuestos: [] })
  const [cargando, setCargando] = React.useState(false)
  const [manualCodigo, setManualCodigo] = React.useState('')
  const [manualDesc, setManualDesc] = React.useState('')
  const [manualPrecio, setManualPrecio] = React.useState('')
  const [manualCantidad, setManualCantidad] = React.useState('1')

  React.useEffect(() => {
    api.get(`/motores/${motor.id}/repuestos-sugeridos`).then(setSugeridos).catch(() => {})
    api.get('/repuestos/categorias').then(setCategorias).catch(() => {})
  }, [motor.id])

  // Igual que en la pestaña Repuestos: las marcas se recalculan según la categoría.
  React.useEffect(() => {
    const params = new URLSearchParams()
    if (categoriaSel) params.set('categoria', categoriaSel)
    api.get(`/repuestos/marcas?${params.toString()}`)
      .then((data) => {
        setMarcas(data)
        setMarcaSel((prev) => (data.some((m) => m.prefijo === prev) ? prev : ''))
      })
      .catch(() => {})
  }, [categoriaSel])

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

  const porCodigo = React.useMemo(() => {
    const m = new Map()
    value.forEach((r) => { if (r.repuesto_codigo) m.set(r.repuesto_codigo, r) })
    return m
  }, [value])

  const agregarDeCatalogo = ({ codigo: cod, descripcion: desc, precio, stock }) => {
    const existente = porCodigo.get(cod)
    if (existente) {
      // Ya estaba agregado: sumamos una unidad en vez de duplicar la línea.
      cambiarCantidad(existente.key, existente.cantidad + 1)
      return
    }
    const unitario = precio || 0
    onChange([...value, {
      key: cod,
      repuesto_codigo: cod,
      descripcion: desc || cod,
      cantidad: 1,
      precio_unitario: unitario,
      precioTexto: unitario ? formatPrecioARS(unitario) : '',
      stock: stock ?? null,
      esManual: false,
    }])
  }

  const agregarManual = () => {
    const desc = manualDesc.trim()
    const precio = parsePrecioARS(manualPrecio)
    const cant = parseFloat(String(manualCantidad).replace(',', '.'))
    if (!desc || precio === null || Number.isNaN(cant) || cant <= 0) return
    onChange([...value, {
      key: `manual-${Date.now()}`,
      repuesto_codigo: manualCodigo.trim() || null,
      descripcion: desc,
      cantidad: cant,
      precio_unitario: precio,
      precioTexto: formatPrecioARS(precio),
      stock: null,
      esManual: true,
    }])
    setManualCodigo('')
    setManualDesc('')
    setManualPrecio('')
    setManualCantidad('1')
  }

  const cambiarCantidad = (key, cantidad) => {
    if (Number.isNaN(cantidad) || cantidad < 0) return
    onChange(value.map((r) => (r.key === key ? { ...r, cantidad } : r)))
  }

  const cambiarPrecio = (key, texto) => {
    const precio = parsePrecioARS(texto)
    onChange(value.map((r) => (r.key === key ? { ...r, precioTexto: texto, precio_unitario: precio } : r)))
  }

  const quitar = (key) => onChange(value.filter((r) => r.key !== key))

  const totalRepuestos = value.reduce((acc, r) => acc + (r.precio_unitario || 0) * (r.cantidad || 0), 0)
  const totalGeneral = totalServicios + totalRepuestos
  const hayInvalidos = value.some((r) => r.precio_unitario === null || !(r.cantidad > 0))
  const hayItems = hayServicios || value.length > 0

  const columnasBusqueda = [
    { key: 'codigo', header: 'Código', width: 130, strong: true },
    { key: 'aplicacion', header: 'Descripción', wrap: true },
    { key: 'marca', header: 'Marca', width: 130, render: (v) => v || '—' },
    { key: 'precio', header: 'Precio', align: 'right', width: 120, render: (v) => (v ? formatPrecioARS(v) : '—') },
    {
      key: 'stock', header: 'Stock', align: 'center', width: 80,
      render: (v) => <StatusBadge status={v ? 'active' : 'expired'}>{v ? 'Sí' : 'No'}</StatusBadge>,
    },
    {
      key: '_agregar', header: '', align: 'center', width: 90,
      render: (_, row) => {
        const agregado = porCodigo.get(row.codigo)
        return agregado
          ? <StatusBadge status="active">×{agregado.cantidad}</StatusBadge>
          : <span style={{ display: 'inline-flex', color: 'var(--text-muted)' }}><Icon n="plus" s={16} /></span>
      },
    },
  ]

  let emptyMessage = 'Elegí una categoría, una marca, o escribí un código o una descripción para buscar en el catálogo.'
  if (hayFiltro) emptyMessage = cargando ? 'Buscando…' : 'No se encontraron repuestos.'

  const botonCantidad = {
    width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border-default)',
    background: 'var(--surface-card)', cursor: 'pointer', fontSize: 16, lineHeight: 1,
    color: 'var(--text-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {sugeridos.length > 0 && (
        <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', background: 'var(--surface-card)', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={tituloSeccion}>Usados antes en este motor</div>
          {sugeridos.map((s) => {
            const agregado = porCodigo.get(s.codigo)
            return (
              <div key={s.codigo} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-muted)', width: 110, flexShrink: 0 }}>{s.codigo}</span>
                <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-strong)', minWidth: 0 }}>{s.descripcion}</span>
                {s.stock_actual === 0 && <StatusBadge status="expired">Sin stock</StatusBadge>}
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, width: 110, textAlign: 'right' }}>
                  {s.precio_actual ? formatPrecioARS(s.precio_actual) : '—'}
                </span>
                {agregado
                  ? <StatusBadge status="active">×{agregado.cantidad}</StatusBadge>
                  : (
                    <Button size="sm" variant="secondary" iconLeft={<Icon n="plus" s={14} />}
                      onClick={() => agregarDeCatalogo({ codigo: s.codigo, descripcion: s.descripcion, precio: s.precio_actual, stock: s.stock_actual })}>
                      Agregar
                    </Button>
                  )}
              </div>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={tituloSeccion}>Buscar en el catálogo</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select value={categoriaSel} onChange={(e) => setCategoriaSel(e.target.value)} style={selectStyle}>
            <option value="">Todas las categorías</option>
            {categorias.map((c) => <option key={c.prefijo} value={c.prefijo}>{c.nombre}</option>)}
          </select>
          <select value={marcaSel} onChange={(e) => setMarcaSel(e.target.value)} style={selectStyle}>
            <option value="">Todas las marcas</option>
            {marcas.map((m) => <option key={m.prefijo} value={m.prefijo}>{m.nombre}</option>)}
          </select>
          <SearchInput width={180} icon={<Icon n="tag" s={16} />} placeholder="Código…" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          <SearchInput width={240} icon={<Icon n="search" s={16} />} placeholder="Descripción…" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </div>

        {hayFiltro && (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            {resultado.total} repuesto{resultado.total === 1 ? '' : 's'} encontrado{resultado.total === 1 ? '' : 's'}
            {resultado.total > resultado.repuestos.length && ` — mostrando los primeros ${resultado.repuestos.length}`}
            {' · '}Hacé click en una fila para agregarlo
          </div>
        )}
        <div style={{ maxHeight: 340, overflow: 'auto' }}>
          <DataTable
            columns={columnasBusqueda}
            rows={resultado.repuestos}
            emptyMessage={emptyMessage}
            striped
            onRowClick={(row) => agregarDeCatalogo({ codigo: row.codigo, descripcion: row.aplicacion, precio: row.precio, stock: row.stock })}
            style={{ minWidth: 0 }}
          />
        </div>
      </div>

      <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', background: 'var(--surface-card)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={tituloSeccion}>Repuestos agregados</div>

        {value.length === 0 && (
          <div style={{ padding: '12px 0', color: 'var(--text-faint)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
            Todavía no agregaste repuestos. Este paso es opcional: podés confirmar el presupuesto sin repuestos.
          </div>
        )}

        {value.map((r) => (
          <div key={r.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-muted)', width: 110, flexShrink: 0 }}>
                {r.repuesto_codigo || '—'}
              </span>
              <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-strong)', minWidth: 160 }}>{r.descripcion}</span>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button style={botonCantidad} onClick={() => cambiarCantidad(r.key, Math.max(0, (r.cantidad || 0) - 1))}>−</button>
                <input
                  type="number" min="0" step="1" value={r.cantidad}
                  onChange={(e) => cambiarCantidad(r.key, parseFloat(e.target.value))}
                  style={{
                    width: 56, height: 30, textAlign: 'center', borderRadius: 8,
                    border: `1px solid ${r.cantidad > 0 ? 'var(--border-default)' : 'var(--status-expired-fg)'}`,
                    fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', background: 'var(--surface-card)', color: 'var(--text-strong)',
                  }}
                />
                <button style={botonCantidad} onClick={() => cambiarCantidad(r.key, (r.cantidad || 0) + 1)}>+</button>
              </div>

              <TextField
                placeholder="Precio unit."
                value={r.precioTexto}
                onChange={(e) => cambiarPrecio(r.key, e.target.value)}
                style={{ width: 130, borderColor: r.precio_unitario === null ? 'var(--status-expired-fg)' : undefined }}
              />

              <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, width: 120, textAlign: 'right' }}>
                {formatPrecioARS((r.precio_unitario || 0) * (r.cantidad || 0))}
              </span>

              <button onClick={() => quitar(r.key)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }}>
                <Icon n="trash" s={16} />
              </button>
            </div>

            {r.stock === 0 && (
              <div style={{
                display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 6,
                fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--status-expired-fg)',
                background: 'var(--status-expired-bg)', borderRadius: 'var(--radius-pill)', padding: '3px 10px',
              }}>
                Sin stock — sujeto a disponibilidad
              </div>
            )}
          </div>
        ))}

        <div style={{ ...tituloSeccion, marginTop: 6 }}>Agregar repuesto fuera de catálogo</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <TextField placeholder="Código (opcional)" value={manualCodigo} onChange={(e) => setManualCodigo(e.target.value)} style={{ width: 150 }} />
          <TextField placeholder="Descripción" value={manualDesc} onChange={(e) => setManualDesc(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
          <TextField placeholder="Precio unit." value={manualPrecio} onChange={(e) => setManualPrecio(e.target.value)} style={{ width: 120 }} />
          <TextField placeholder="Cant." value={manualCantidad} onChange={(e) => setManualCantidad(e.target.value)} style={{ width: 70 }} />
          <Button variant="secondary" iconLeft={<Icon n="plus" s={16} />} onClick={agregarManual}>Agregar</Button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: 'var(--surface-inverse)', borderRadius: 'var(--radius-xl)', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'rgba(255,255,255,.75)' }}>
            Servicios <strong style={{ color: '#fff' }}>{formatPrecioARS(totalServicios)}</strong>
          </span>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'rgba(255,255,255,.75)' }}>
            Repuestos <strong style={{ color: '#fff' }}>{formatPrecioARS(totalRepuestos)}</strong>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-md)', fontWeight: 600, color: '#fff' }}>Total</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 700, color: '#fff' }}>{formatPrecioARS(totalGeneral)}</span>
        </div>
      </div>

      <Button variant="success" fullWidth disabled={!hayItems || hayInvalidos || guardando} onClick={onConfirmar}>
        {guardando ? 'Generando presupuesto…' : 'Confirmar presupuesto'}
      </Button>
      {!hayItems && (
        <div style={{ textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
          Agregá al menos un servicio o un repuesto para confirmar.
        </div>
      )}
    </div>
  )
}
