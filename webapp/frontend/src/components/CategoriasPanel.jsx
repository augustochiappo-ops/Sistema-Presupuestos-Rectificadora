import React from 'react'
import { api } from '../api/client'
import { SearchInput } from './SearchInput'
import { Icon } from './Icon'
import { useCategorias } from '../hooks/useCategorias'

const tituloPanel = {
  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '.14em',
  textTransform: 'uppercase', color: 'var(--text-faint)', padding: '6px 12px',
}

const tituloGrupo = {
  fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600, letterSpacing: '.1em',
  textTransform: 'uppercase', color: 'var(--text-faint)', padding: '10px 12px 4px',
}

/*
 * Rail de categorías del catálogo, con buscador y favoritas arriba de todo.
 * Se usa en la pestaña Repuestos y también al armar un presupuesto, para que
 * sea el mismo gesto en los dos lados. `value` es el prefijo seleccionado
 * ('' = todas). Los favoritos se guardan en el servidor, no en el navegador.
 */
export function CategoriasPanel({ value, onChange }) {
  const categorias = useCategorias()
  const [favoritos, setFavoritos] = React.useState(new Set())
  const [busqueda, setBusqueda] = React.useState('')

  React.useEffect(() => {
    api.get('/repuestos/categorias/favoritos').then((ids) => setFavoritos(new Set(ids))).catch(() => {})
  }, [])

  const toggleFavorito = async (prefijo, e) => {
    e.stopPropagation()
    const data = await api.post(`/repuestos/categorias/${prefijo}/favorito`)
    setFavoritos((prev) => {
      const next = new Set(prev)
      if (data.favorito) next.add(prefijo); else next.delete(prefijo)
      return next
    })
  }

  const filtradas = categorias.filter((c) =>
    !busqueda || c.nombre.toLowerCase().includes(busqueda.toLowerCase())
  )
  const favoritas = filtradas.filter((c) => favoritos.has(c.prefijo))
  const resto = filtradas.filter((c) => !favoritos.has(c.prefijo))

  return (
    <div
      className="repuestos-categorias-panel"
      style={{
        background: 'var(--surface-card)', border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-xl)', padding: '14px 10px', minWidth: 0,
      }}
    >
      <div style={tituloPanel}>Categorías</div>
      <div style={{ padding: '0 4px 8px' }}>
        <SearchInput
          width="100%"
          icon={<Icon n="search" s={14} />}
          placeholder="Buscar categoría…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{ height: 36 }}
        />
      </div>

      <div className="categoria-chips-row">
        <button
          onClick={() => onChange('')}
          className="motor-brand-btn"
          style={{
            textAlign: 'left', border: 'none', cursor: 'pointer',
            padding: '10px 12px', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)', fontSize: 14,
            fontWeight: value === '' ? 600 : 500,
            background: value === '' ? 'var(--surface-inverse)' : 'transparent',
            color: value === '' ? '#fff' : 'var(--text-body)',
          }}
        >
          Todas
        </button>

        {favoritas.length > 0 && <div style={tituloGrupo}>Favoritas</div>}
        {favoritas.map((c) => (
          <CategoriaBoton key={c.prefijo} c={c} activo={value === c.prefijo} esFavorita onSeleccionar={onChange} onToggleFavorito={toggleFavorito} />
        ))}

        {favoritas.length > 0 && resto.length > 0 && <div style={tituloGrupo}>Todas</div>}
        {resto.map((c) => (
          <CategoriaBoton key={c.prefijo} c={c} activo={value === c.prefijo} esFavorita={false} onSeleccionar={onChange} onToggleFavorito={toggleFavorito} />
        ))}

        {filtradas.length === 0 && (
          <div style={{ padding: '16px 12px', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-faint)' }}>
            {categorias.length === 0 ? 'Todavía no se importó el catálogo del proveedor.' : `Sin categorías para "${busqueda}".`}
          </div>
        )}
      </div>
    </div>
  )
}

function CategoriaBoton({ c, activo, esFavorita, onSeleccionar, onToggleFavorito }) {
  return (
    <div className="motor-brand-btn" style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
      <button
        onClick={() => onSeleccionar(c.prefijo)}
        style={{
          flex: 1, minWidth: 0, textAlign: 'left', border: 'none', cursor: 'pointer',
          padding: '10px 4px 10px 12px', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)', fontSize: 14,
          fontWeight: activo ? 600 : 500,
          background: activo ? 'var(--surface-inverse)' : 'transparent',
          color: activo ? '#fff' : 'var(--text-body)',
        }}
      >
        {c.nombre}
      </button>
      <button
        onClick={(e) => onToggleFavorito(c.prefijo, e)}
        title={esFavorita ? 'Quitar de favoritas' : 'Agregar a favoritas'}
        style={{
          border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '10px 10px 10px 4px', flexShrink: 0,
          color: esFavorita ? '#e8b400' : 'var(--text-faint)',
        }}
      >
        <Icon n="star" s={14} style={{ fill: esFavorita ? '#e8b400' : 'none' }} />
      </button>
    </div>
  )
}
