import React from 'react'
import { api } from '../../../api/client'
import { SearchInput } from '../../../components/SearchInput'
import { TextField } from '../../../components/TextField'
import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import { formatPrecioARS } from '../../../utils/format'

// Componente controlado: la selección (value = {ids, customItems}) vive en el
// wizard, así volver atrás desde el paso de repuestos no la pierde.
export function PasoServicios({ motor, value, onChange, onSiguiente }) {
  const [servicios, setServicios] = React.useState([])
  const [favoritos, setFavoritos] = React.useState(new Set())
  const [busqueda, setBusqueda] = React.useState('')
  const [nuevoCustomDesc, setNuevoCustomDesc] = React.useState('')
  const [nuevoCustomPrecio, setNuevoCustomPrecio] = React.useState('')

  const seleccionados = React.useMemo(() => new Set(value.ids), [value.ids])
  const customItems = value.customItems

  React.useEffect(() => {
    api.get(`/motores/${motor.id}/servicios`).then(setServicios)
    api.get('/servicios/favoritos').then((ids) => setFavoritos(new Set(ids)))
  }, [motor.id])

  const toggleFavorito = async (id) => {
    const data = await api.post(`/servicios/${id}/favorito`)
    setFavoritos((prev) => {
      const next = new Set(prev)
      if (data.favorito) next.add(id); else next.delete(id)
      return next
    })
  }

  const toggleSeleccion = (id) => {
    const ids = seleccionados.has(id)
      ? value.ids.filter((x) => x !== id)
      : [...value.ids, id]
    onChange({ ...value, ids })
  }

  const agregarCustom = () => {
    const desc = nuevoCustomDesc.trim()
    const precio = parseFloat(nuevoCustomPrecio.replace(',', '.'))
    if (!desc || Number.isNaN(precio)) return
    onChange({
      ...value,
      customItems: [...customItems, { id: `custom-${Date.now()}`, descripcion_custom: desc, precio_aplicado: precio }],
    })
    setNuevoCustomDesc('')
    setNuevoCustomPrecio('')
  }

  const quitarCustom = (id) => onChange({ ...value, customItems: customItems.filter((c) => c.id !== id) })

  const filtrados = servicios.filter((s) => {
    if (!busqueda) return true
    const q = busqueda.toLowerCase()
    return String(s.item_num).includes(q) || (s.descripcion || '').toLowerCase().includes(q)
  })
  const favoritosVisibles = filtrados.filter((s) => favoritos.has(s.id))
  const restoVisibles = filtrados.filter((s) => !favoritos.has(s.id))

  const totalFacra = servicios
    .filter((s) => seleccionados.has(s.id))
    .reduce((acc, s) => acc + (s.precio || 0), 0)
  const totalCustom = customItems.reduce((acc, c) => acc + c.precio_aplicado, 0)
  const total = totalFacra + totalCustom

  const Fila = ({ s }) => (
    <div
      onClick={() => toggleSeleccion(s.id)}
      style={{
        display: 'grid', gridTemplateColumns: '40px 40px 60px 1fr 130px', alignItems: 'center',
        padding: '10px 16px', cursor: 'pointer', borderRadius: 'var(--radius-md)',
        background: seleccionados.has(s.id) ? 'var(--status-active-bg)' : 'transparent',
      }}
    >
      <span
        onClick={(e) => { e.stopPropagation(); toggleFavorito(s.id) }}
        style={{ display: 'flex', color: favoritos.has(s.id) ? '#e8b400' : 'var(--text-faint)' }}
      >
        <Icon n="star" s={16} style={{ fill: favoritos.has(s.id) ? '#e8b400' : 'none' }} />
      </span>
      <span style={{
        width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${seleccionados.has(s.id) ? 'var(--status-active-fg)' : 'var(--border-strong)'}`,
        background: seleccionados.has(s.id) ? 'var(--status-active-fg)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {seleccionados.has(s.id) && <Icon n="check" s={13} style={{ color: '#fff' }} />}
      </span>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{s.item_num}</span>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>{s.descripcion}</span>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-strong)', textAlign: 'right', fontWeight: 600 }}>{formatPrecioARS(s.precio)}</span>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SearchInput icon={<Icon n="search" s={16} />} placeholder="Buscar por número o descripción…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />

      <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', background: 'var(--surface-card)', maxHeight: 420, overflow: 'auto', padding: '8px 0' }}>
        {favoritosVisibles.map((s) => <Fila key={s.id} s={s} />)}
        {favoritosVisibles.length > 0 && restoVisibles.length > 0 && (
          <div style={{ textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-faint)', padding: '10px 0' }}>
            ─── Lista de la Cámara de Rectificadores ───
          </div>
        )}
        {restoVisibles.map((s) => <Fila key={s.id} s={s} />)}
        {filtrados.length === 0 && (
          <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-faint)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
            No se encontraron servicios.
          </div>
        )}
      </div>

      <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', background: 'var(--surface-card)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
          Agregar ítem manual
        </div>
        {customItems.map((c) => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>{c.descripcion_custom}</span>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>{formatPrecioARS(c.precio_aplicado)}</span>
            <button onClick={() => quitarCustom(c.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }}>
              <Icon n="x" s={16} />
            </button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 10 }}>
          <TextField placeholder="Descripción" value={nuevoCustomDesc} onChange={(e) => setNuevoCustomDesc(e.target.value)} style={{ flex: 1 }} />
          <TextField placeholder="Precio" value={nuevoCustomPrecio} onChange={(e) => setNuevoCustomPrecio(e.target.value)} style={{ width: 140 }} />
          <Button variant="secondary" iconLeft={<Icon n="plus" s={16} />} onClick={agregarCustom}>Agregar</Button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: 'var(--surface-inverse)', borderRadius: 'var(--radius-xl)' }}>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-md)', fontWeight: 600, color: '#fff' }}>Total servicios</span>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 700, color: '#fff' }}>{formatPrecioARS(total)}</span>
      </div>

      {/* Se puede seguir sin servicios: un presupuesto puede ser de solo repuestos.
          La validación de "al menos un ítem" está en el paso de confirmación. */}
      <Button variant="primary" fullWidth iconRight={<Icon n="chevron-right" s={16} />} onClick={() => onSiguiente(total)}>
        Siguiente: Repuestos
      </Button>
    </div>
  )
}
