import React from 'react'
import { api } from '../../../api/client'
import { SearchInput } from '../../../components/SearchInput'
import { TextField } from '../../../components/TextField'
import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import { ContadorServicio } from '../../../components/ContadorServicio'
import { SelectorCantidadServicio } from '../../../components/SelectorCantidadServicio'
import { DataTable } from '../../../components/DataTable'
import { formatPrecioARS } from '../../../utils/format'

const tituloSeccion = {
  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
  letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-faint)',
}

const COLUMNAS_PREVIEW = [
  { key: 'descripcion', header: 'Descripción', wrap: true },
  { key: 'cantidad', header: 'Cant.', align: 'right', width: 72 },
  { key: 'precioUnitario', header: 'P. unitario', align: 'right', width: 118, render: formatPrecioARS },
  { key: 'subtotal', header: 'Subtotal', align: 'right', width: 150, strong: true, render: formatPrecioARS },
]

// Componente controlado: la selección (value = {cantidades, customItems, grupos})
// vive en el wizard, así volver atrás desde el paso de repuestos no la pierde.
// cantidades: { [servicioId]: cantidad } — un servicio sin entrada (o en 0) no
// está incluido en el presupuesto; cantidad > 1 multiplica el precio de lista
// (ej. "Reunir cilindros" ×4 en un motor de 4 cilindros).
// grupos: { [servicioId]: 'a'|'b' } — a qué familia de cantidades rápidas
// pertenece la última elección hecha desde el botón "+" de ese ítem ('a' para
// 4/8/16, 'b' para 6/12). Solo se usa para decidir qué par muestran los
// recuadros adaptativos (ver parAdaptativo más abajo); tipear a mano no tagea.
export function PasoServicios({ motor, value, onChange, ajustePct, onAjustePctChange, onSiguiente }) {
  const [servicios, setServicios] = React.useState([])
  const [favoritos, setFavoritos] = React.useState(new Set())
  const [busqueda, setBusqueda] = React.useState('')
  const [nuevoCustomDesc, setNuevoCustomDesc] = React.useState('')
  const [nuevoCustomPrecio, setNuevoCustomPrecio] = React.useState('')
  const [ajusteTexto, setAjusteTexto] = React.useState(ajustePct ? String(ajustePct) : '')

  const cantidades = value.cantidades
  const customItems = value.customItems
  const grupos = value.grupos

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

  // Tipeo a mano en el recuadro: fija la cantidad tal cual y limpia el tag de
  // grupo (un valor tipeado a mano no participa del cálculo del par adaptativo).
  const cambiarCantidad = (id, cantidad) => {
    const nuevas = { ...cantidades }
    if (cantidad > 0) nuevas[id] = cantidad
    else delete nuevas[id]
    const nuevosGrupos = { ...grupos }
    delete nuevosGrupos[id]
    onChange({ ...value, cantidades: nuevas, grupos: nuevosGrupos })
  }

  // Botón "+" o recuadro adaptativo: fija la cantidad y tagea el ítem con su
  // familia (4/8/16 → 'a', 6/12 → 'b') para que el par adaptativo global se
  // recalcule según cuál familia predomina en el presupuesto.
  const elegirCantidad = (id, cantidad) => {
    onChange({
      ...value,
      cantidades: { ...cantidades, [id]: cantidad },
      grupos: { ...grupos, [id]: (cantidad === 6 || cantidad === 12) ? 'b' : 'a' },
    })
  }

  // Click en cualquier parte de la fila (fuera de los controles): suma 1 a la
  // cantidad actual, sin tocar el tag de grupo.
  const sumarUno = (id) => {
    onChange({ ...value, cantidades: { ...cantidades, [id]: (cantidades[id] || 0) + 1 } })
  }

  // Par que muestran los recuadros adaptativos: la familia con más ítems
  // activos (cantidad > 0) en el presupuesto gana; empate (incluido el caso
  // inicial, sin nada elegido todavía) se resuelve a favor de 4/8.
  const parAdaptativo = React.useMemo(() => {
    let cuentaA = 0
    let cuentaB = 0
    Object.entries(grupos).forEach(([id, g]) => {
      if ((cantidades[id] || 0) <= 0) return
      if (g === 'b') cuentaB += 1
      else cuentaA += 1
    })
    return cuentaB > cuentaA ? [6, 12] : [4, 8]
  }, [grupos, cantidades])

  const agregarCustom = () => {
    const desc = nuevoCustomDesc.trim()
    const precio = parseFloat(nuevoCustomPrecio.replace(',', '.'))
    if (!desc || Number.isNaN(precio)) return
    onChange({
      ...value,
      customItems: [...customItems, { id: `custom-${Date.now()}`, descripcion_custom: desc, precio_aplicado: precio, cantidad: 1 }],
    })
    setNuevoCustomDesc('')
    setNuevoCustomPrecio('')
  }

  const cambiarCantidadCustom = (id, cantidad) => onChange({
    ...value,
    customItems: customItems.map((c) => (c.id === id ? { ...c, cantidad: Math.max(0, cantidad) } : c)),
  })

  const quitarCustom = (id) => onChange({ ...value, customItems: customItems.filter((c) => c.id !== id) })

  const filtrados = servicios.filter((s) => {
    if (!busqueda) return true
    const q = busqueda.toLowerCase()
    return String(s.item_num).includes(q) || (s.descripcion || '').toLowerCase().includes(q)
  })
  const favoritosVisibles = filtrados.filter((s) => favoritos.has(s.id))
  const restoVisibles = filtrados.filter((s) => !favoritos.has(s.id))

  // Aumento/descuento en % sobre la mano de obra (positivo = aumento, negativo
  // = descuento). Solo afecta los precios de lista de servicios FACRA — los
  // ítems manuales ya tienen un precio elegido a mano, no se ajustan de nuevo.
  // El redondeo por unidad tiene que ser igual al que hace el backend
  // (_resolver_items) para que el total que se ve acá coincida con el final.
  const factorAjuste = 1 + (ajustePct || 0) / 100
  const precioConAjuste = (precio) => Math.round((precio || 0) * factorAjuste * 100) / 100

  const aplicarAjusteTexto = (texto) => {
    setAjusteTexto(texto)
    const normalizado = texto.replace(',', '.').trim()
    if (normalizado === '' || normalizado === '-') {
      onAjustePctChange(0)
      return
    }
    const n = parseFloat(normalizado)
    onAjustePctChange(Number.isNaN(n) ? 0 : n)
  }

  const colorAjuste = ajustePct > 0 ? 'var(--status-active-fg)' : ajustePct < 0 ? 'var(--status-expired-fg)' : 'var(--border-default)'

  const totalFacra = servicios.reduce((acc, s) => acc + (cantidades[s.id] || 0) * precioConAjuste(s.precio), 0)
  const totalCustom = customItems.reduce((acc, c) => acc + c.precio_aplicado * (c.cantidad || 0), 0)
  const total = totalFacra + totalCustom

  // Previsualización del lado derecho: todo lo que ya está incluido en el
  // presupuesto (catálogo + ítems manuales), con su subtotal ya calculado.
  const filasPreview = [
    ...servicios
      .filter((s) => (cantidades[s.id] || 0) > 0)
      .map((s) => {
        const cantidad = cantidades[s.id]
        const precioUnitario = precioConAjuste(s.precio)
        return { id: s.id, descripcion: s.descripcion, cantidad, precioUnitario, subtotal: precioUnitario * cantidad }
      }),
    ...customItems
      .filter((c) => (c.cantidad || 0) > 0)
      .map((c) => ({
        id: c.id, descripcion: c.descripcion_custom, cantidad: c.cantidad,
        precioUnitario: c.precio_aplicado, subtotal: c.precio_aplicado * c.cantidad,
      })),
  ]

  const Fila = ({ s }) => {
    const cantidad = cantidades[s.id] || 0
    return (
      <div
        onClick={() => sumarUno(s.id)}
        style={{
          display: 'grid', gridTemplateColumns: '32px auto 1fr 110px', alignItems: 'center', gap: 10,
          padding: '10px 16px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
          background: cantidad > 0 ? 'var(--status-active-bg)' : 'transparent',
        }}
      >
        <span
          onClick={(e) => { e.stopPropagation(); toggleFavorito(s.id) }}
          style={{ display: 'flex', cursor: 'pointer', color: favoritos.has(s.id) ? '#e8b400' : 'var(--text-faint)' }}
        >
          <Icon n="star" s={16} style={{ fill: favoritos.has(s.id) ? '#e8b400' : 'none' }} />
        </span>
        <SelectorCantidadServicio
          cantidad={cantidad}
          par={parAdaptativo}
          onEscribir={(n) => cambiarCantidad(s.id, n)}
          onElegir={(n) => elegirCantidad(s.id, n)}
        />
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>{s.descripcion}</span>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-strong)', textAlign: 'right', fontWeight: 600 }}>{formatPrecioARS(precioConAjuste(s.precio))}</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Total y "Siguiente" arriba de todo: no hace falta bajar hasta el final
          de la lista de servicios para ver cuánto lleva el presupuesto o avanzar. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: '16px 20px', background: 'var(--surface-inverse)', borderRadius: 'var(--radius-xl)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.65)' }}>
              Ajuste mano de obra
            </label>
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
                  border: `2px solid ${colorAjuste}`, background: '#fff', color: 'var(--text-strong)',
                  fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, outline: 'none',
                }}
              />
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'rgba(255,255,255,.75)' }}>%</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-md)', fontWeight: 600, color: '#fff' }}>Total servicios</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 700, color: '#fff' }}>{formatPrecioARS(total)}</span>
          </div>
        </div>
        {/* Se puede seguir sin servicios: un presupuesto puede ser de solo repuestos.
            La validación de "al menos un ítem" está en el paso de confirmación. */}
        <Button
          variant="secondary"
          iconRight={<Icon n="chevron-right" s={16} />}
          onClick={() => onSiguiente(total)}
          style={{ background: '#fff', border: 'none', color: 'var(--text-strong)' }}
        >
          Siguiente: Repuestos
        </Button>
      </div>

      {/* Izquierda: catálogo completo de mano de obra para ir eligiendo.
          Derecha: previsualización de cómo va quedando el presupuesto. */}
      <div className="servicios-picker-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <SearchInput icon={<Icon n="search" s={16} />} placeholder="Buscar por número o descripción…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />

          <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', background: 'var(--surface-card)', maxHeight: 520, overflow: 'auto', padding: '8px 0' }}>
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
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div style={tituloSeccion}>Presupuesto</div>
          <DataTable
            columns={COLUMNAS_PREVIEW}
            rows={filasPreview}
            emptyMessage="Todavía no elegiste servicios. Tocá un ítem de la lista para agregarlo acá."
          />
        </div>
      </div>

      <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', background: 'var(--surface-card)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={tituloSeccion}>Agregar ítem manual</div>
        {customItems.map((c) => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ContadorServicio cantidad={c.cantidad || 0} onChange={(n) => cambiarCantidadCustom(c.id, n)} />
            <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
              {c.descripcion_custom}
              <span style={{ color: 'var(--text-faint)' }}> ({formatPrecioARS(c.precio_aplicado)} c/u)</span>
            </span>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>{formatPrecioARS(c.precio_aplicado * (c.cantidad || 0))}</span>
            <button onClick={() => quitarCustom(c.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }}>
              <Icon n="x" s={16} />
            </button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 10 }}>
          <TextField placeholder="Descripción" value={nuevoCustomDesc} onChange={(e) => setNuevoCustomDesc(e.target.value)} style={{ flex: 1 }} />
          <TextField placeholder="Precio unit." value={nuevoCustomPrecio} onChange={(e) => setNuevoCustomPrecio(e.target.value)} style={{ width: 140 }} />
          <Button variant="secondary" iconLeft={<Icon n="plus" s={16} />} onClick={agregarCustom}>Agregar</Button>
        </div>
      </div>
    </div>
  )
}
