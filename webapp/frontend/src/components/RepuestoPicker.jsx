import React from 'react'
import ReactDOM from 'react-dom'
import { api } from '../api/client'
import { DataTable } from './DataTable'
import { SearchInput } from './SearchInput'
import { StatusBadge } from './StatusBadge'
import { CategoriasPanel } from './CategoriasPanel'
import { Button } from './Button'
import { Icon } from './Icon'
import { formatPrecioARS } from '../utils/format'

// Cantidades típicas de un motor: una unidad, o un juego por cilindro/válvula.
const CANTIDADES = [1, 4, 6, 8, 12, 16]

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
 * Botón "+" que despliega las cantidades típicas. Elegir una deja esa cantidad
 * FINAL en el presupuesto (no suma), que es como lo piensa el usuario: "de esto
 * van 8". El panel va en un portal porque las tablas viven dentro de
 * contenedores con overflow y si no queda recortado.
 */
export function SelectorCantidad({ cantidadActual, onElegir }) {
  const [pos, setPos] = React.useState(null)
  const botonRef = React.useRef(null)
  const panelRef = React.useRef(null)

  const abrir = (e) => {
    e.stopPropagation()
    if (pos) { setPos(null); return }
    const r = botonRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 6, left: r.right })
  }

  React.useEffect(() => {
    if (!pos) return undefined
    const cerrarSiEsAfuera = (e) => {
      if (panelRef.current?.contains(e.target) || botonRef.current?.contains(e.target)) return
      setPos(null)
    }
    const cerrarConEsc = (e) => { if (e.key === 'Escape') setPos(null) }
    const cerrar = () => setPos(null)
    document.addEventListener('mousedown', cerrarSiEsAfuera)
    document.addEventListener('keydown', cerrarConEsc)
    window.addEventListener('resize', cerrar)
    // capture: el scroll de la tabla no burbujea hasta window.
    window.addEventListener('scroll', cerrar, true)
    return () => {
      document.removeEventListener('mousedown', cerrarSiEsAfuera)
      document.removeEventListener('keydown', cerrarConEsc)
      window.removeEventListener('resize', cerrar)
      window.removeEventListener('scroll', cerrar, true)
    }
  }, [pos])

  const elegir = (e, cantidad) => {
    e.stopPropagation()
    setPos(null)
    onElegir(cantidad)
  }

  return (
    <>
      <button
        ref={botonRef}
        onClick={abrir}
        title="Elegir cantidad"
        style={{
          border: '1px solid var(--border-default)', background: 'var(--surface-card)',
          borderRadius: 8, width: 30, height: 30, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-strong)', padding: 0,
        }}
      >
        <Icon n="plus" s={16} />
      </button>

      {pos && ReactDOM.createPortal(
        <div
          ref={panelRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed', top: pos.top, left: pos.left, transform: 'translateX(-100%)',
            zIndex: 60, display: 'flex', gap: 6, padding: 8,
            background: 'var(--surface-card)', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
          }}
        >
          {CANTIDADES.map((n) => (
            <button
              key={n}
              onClick={(e) => elegir(e, n)}
              style={{
                minWidth: 38, height: 34, borderRadius: 8, cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600,
                border: '1px solid var(--border-default)',
                background: cantidadActual === n ? 'var(--surface-inverse)' : 'var(--surface-card)',
                color: cantidadActual === n ? '#fff' : 'var(--text-strong)',
              }}
            >
              {n}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}

/*
 * Buscador del catálogo del proveedor para armar un presupuesto: sugerencias
 * del motor, rail de categorías (con favoritas) y filtros por marca, código y
 * descripción. Sube el repuesto elegido con onAgregar(repuesto, cantidad);
 * `cantidadPorCodigo` es lo que ya está cargado, para mostrar el ×N.
 */
const botonMenos = {
  border: '1px solid var(--border-default)', background: 'var(--surface-card)',
  borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 16, lineHeight: 1,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  color: 'var(--text-strong)', padding: 0,
}

export function RepuestoPicker({
  sugeridos = [], cantidadPorCodigo, onAgregar, reorderKey = 'repuestos-presupuesto',
  // Botón "Ver repuestos" opcional: solo lo pantallas que manejan una lista de
  // agregados aparte (el wizard) lo pasan. Sin esto, RepuestoPicker se
  // comporta como antes (usado también en la edición del detalle).
  onVerAgregados, cantidadAgregados = 0,
  tituloSugeridos = 'Repuestos de este motor',
  ayudaFilas = 'Click en la fila para agregar uno, o el + para elegir la cantidad',
}) {
  const [marcas, setMarcas] = React.useState([])
  const [categoriaSel, setCategoriaSel] = React.useState('')
  const [marcaSel, setMarcaSel] = React.useState('')
  const [codigo, setCodigo] = React.useState('')
  const [descripcion, setDescripcion] = React.useState('')
  const [resultado, setResultado] = React.useState({ total: 0, repuestos: [] })
  const [cargando, setCargando] = React.useState(false)

  // Las marcas se recalculan según la categoría elegida: al entrar a "Válvulas"
  // solo deben verse las marcas que tienen repuestos en esa categoría.
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
      return undefined
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

  // Único lugar donde se arma el repuesto que sube por onAgregar. `origen` deja
  // que el consumidor distinga un click en la fila (que puede querer usar la
  // cantidad que el motor recuerda) de una cantidad elegida a propósito en el
  // menú "+". Quien no lo mire — la edición del detalle — sigue funcionando igual.
  const agregarFila = (row, cantidad, origen = 'click') => onAgregar({
    codigo: row.codigo,
    descripcion: row.aplicacion,
    precio: row.precio,
    stock: row.stock,
    categoria: row.categoria,
    cat_prefijo: row.cat_prefijo,
    marca: row.marca,
    medida: row.medida,
  }, cantidad, origen)

  const agregarSugerido = (s, cantidad, origen = 'click') => onAgregar({
    codigo: s.codigo,
    descripcion: s.descripcion,
    precio: s.precio_actual,
    stock: s.stock_actual,
    categoria: s.categoria,
    cat_prefijo: s.cat_prefijo,
    marca: s.marca,
    medida: s.medida,
  }, cantidad, origen)

  const columnas = [
    {
      key: '_agregar', header: '', align: 'center', width: 150,
      render: (_, row) => {
        const cantidad = cantidadPorCodigo.get(row.codigo)
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <button
              style={botonMenos}
              disabled={!cantidad}
              onClick={(e) => { e.stopPropagation(); agregarFila(row, Math.max(0, (cantidad || 0) - 1), 'exacto') }}
            >
              −
            </button>
            {cantidad ? <StatusBadge status="active">×{cantidad}</StatusBadge> : null}
            <SelectorCantidad cantidadActual={cantidad} onElegir={(n) => agregarFila(row, n, 'exacto')} />
          </span>
        )
      },
    },
    { key: 'codigo', header: 'Código', width: 130, strong: true, wrap: true },
    {
      key: 'aplicacion', header: 'Descripción', wrap: true,
      render: (v) => <span style={{ fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)' }}>{v}</span>,
    },
    { key: 'marca', header: 'Marca', width: 130, render: (v) => v || '—' },
    { key: 'medida', header: 'Medida', align: 'center', width: 90, render: (v) => v || '—' },
    { key: 'precio', header: 'Precio', align: 'right', width: 120, render: (v) => (v ? formatPrecioARS(v) : '—') },
    {
      key: 'stock', header: 'Stock', align: 'center', width: 80,
      render: (v) => <StatusBadge status={v ? 'active' : 'expired'}>{v ? 'Sí' : 'No'}</StatusBadge>,
    },
  ]

  let emptyMessage = 'Elegí una categoría, una marca, o escribí un código o una descripción para buscar en el catálogo.'
  if (hayFiltro) emptyMessage = cargando ? 'Buscando…' : 'No se encontraron repuestos.'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {sugeridos.length > 0 && (
        <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', background: 'var(--surface-card)', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={tituloSeccion}>{tituloSugeridos}</div>
          {sugeridos.map((s) => {
            const cantidad = cantidadPorCodigo.get(s.codigo)
            return (
              <div key={s.codigo} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-muted)', width: 110, flexShrink: 0, overflowWrap: 'anywhere' }}>{s.codigo}</span>
                <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', minWidth: 0 }}>
                  {s.descripcion}
                  {s.categoria && (
                    <span style={{ fontWeight: 'var(--weight-regular)', color: 'var(--text-faint)' }}> · {s.categoria}</span>
                  )}
                </span>
                {s.medida && <StatusBadge status="pending">{s.medida}</StatusBadge>}
                {s.stock_actual === 0 && <StatusBadge status="expired">Sin stock</StatusBadge>}
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, width: 110, textAlign: 'right' }}>
                  {s.precio_actual ? formatPrecioARS(s.precio_actual) : '—'}
                </span>
                <button
                  style={botonMenos}
                  disabled={!cantidad}
                  onClick={() => agregarSugerido(s, Math.max(0, (cantidad || 0) - 1), 'exacto')}
                >
                  −
                </button>
                {cantidad ? <StatusBadge status="active">×{cantidad}</StatusBadge> : null}
                <SelectorCantidad
                  cantidadActual={cantidad}
                  onElegir={(n) => agregarSugerido(s, n, 'exacto')}
                />
              </div>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={tituloSeccion}>Buscar en el catálogo</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={marcaSel} onChange={(e) => setMarcaSel(e.target.value)} style={selectStyle}>
            <option value="">Todas las marcas</option>
            {marcas.map((m) => <option key={m.prefijo} value={m.prefijo}>{m.nombre}</option>)}
          </select>
          <SearchInput width={180} icon={<Icon n="tag" s={16} />} placeholder="Código…" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          <SearchInput width={240} icon={<Icon n="search" s={16} />} placeholder="Descripción…" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          {onVerAgregados && (
            <Button variant="secondary" iconLeft={<Icon n="eye" s={16} />} onClick={onVerAgregados}>
              Ver repuestos{cantidadAgregados > 0 ? ` (${cantidadAgregados})` : ''}
            </Button>
          )}
        </div>

        <div className="motor-selector-grid">
          <CategoriasPanel value={categoriaSel} onChange={setCategoriaSel} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
            {hayFiltro && (
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                {resultado.total} repuesto{resultado.total === 1 ? '' : 's'} encontrado{resultado.total === 1 ? '' : 's'}
                {resultado.total > resultado.repuestos.length && ` — mostrando los primeros ${resultado.repuestos.length}`}
                {' · '}{ayudaFilas}
              </div>
            )}
            <div style={{ maxHeight: 560, overflow: 'auto' }}>
              <DataTable
                columns={columnas}
                reorderKey={reorderKey}
                rows={resultado.repuestos}
                emptyMessage={emptyMessage}
                striped
                onRowClick={(row) => agregarFila(row, (cantidadPorCodigo.get(row.codigo) || 0) + 1)}
                style={{ minWidth: 0 }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
