import React from 'react'
import { api } from '../../../api/client'
import { RepuestoPicker } from '../../../components/RepuestoPicker'
import { CategoriaField } from '../../../components/CategoriaField'
import { TextField } from '../../../components/TextField'
import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import { formatPrecioARS, parsePrecioARS } from '../../../utils/format'

const tituloSeccion = {
  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
  letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-faint)',
}

/*
 * Paso 4 del wizard. Componente controlado: la lista de repuestos agregados
 * (value) vive en el wizard. Cada línea:
 *   { key, repuesto_codigo, descripcion, categoria, cantidad, precio_unitario,
 *     precioTexto, stock, esManual }
 * key = código de catálogo o 'manual-<ts>' (la API de repuestos no expone id).
 * categoria: lo único del repuesto que sale en el PDF.
 * stock: 1/0 congelado al agregar (null en manuales) — solo para el aviso en pantalla.
 */
export function PasoRepuestos({ motor, value, onChange, totalServicios, hayServicios, onConfirmar, guardando }) {
  const [sugeridos, setSugeridos] = React.useState([])
  const [manualCodigo, setManualCodigo] = React.useState('')
  const [manualDesc, setManualDesc] = React.useState('')
  const [manualCategoria, setManualCategoria] = React.useState('')
  const [manualPrecio, setManualPrecio] = React.useState('')
  const [manualCantidad, setManualCantidad] = React.useState('1')

  React.useEffect(() => {
    api.get(`/motores/${motor.id}/repuestos-sugeridos`).then(setSugeridos).catch(() => {})
  }, [motor.id])

  const porCodigo = React.useMemo(() => {
    const m = new Map()
    value.forEach((r) => { if (r.repuesto_codigo) m.set(r.repuesto_codigo, r) })
    return m
  }, [value])

  const cantidadPorCodigo = React.useMemo(() => {
    const m = new Map()
    porCodigo.forEach((r, cod) => m.set(cod, r.cantidad))
    return m
  }, [porCodigo])

  // El picker manda siempre la cantidad final que quiere el usuario.
  const agregarDeCatalogo = ({ codigo: cod, descripcion: desc, precio, stock, categoria }, cantidad) => {
    const existente = porCodigo.get(cod)
    if (existente) {
      cambiarCantidad(existente.key, cantidad)
      return
    }
    const unitario = precio || 0
    onChange([...value, {
      key: cod,
      repuesto_codigo: cod,
      descripcion: desc || cod,
      categoria: categoria || null,
      cantidad,
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
      categoria: manualCategoria.trim() || null,
      cantidad: cant,
      precio_unitario: precio,
      precioTexto: formatPrecioARS(precio),
      stock: null,
      esManual: true,
    }])
    setManualCodigo('')
    setManualDesc('')
    setManualCategoria('')
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

  const botonCantidad = {
    width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border-default)',
    background: 'var(--surface-card)', cursor: 'pointer', fontSize: 16, lineHeight: 1,
    color: 'var(--text-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      <RepuestoPicker
        sugeridos={sugeridos}
        cantidadPorCodigo={cantidadPorCodigo}
        onAgregar={agregarDeCatalogo}
        reorderKey="repuestos-presupuesto"
      />

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

              <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-muted)', width: 110, flexShrink: 0 }}>
                {r.repuesto_codigo || '—'}
              </span>
              <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-strong)', minWidth: 160 }}>
                {r.descripcion}
                {r.categoria && (
                  <span style={{ color: 'var(--text-faint)' }}> · {r.categoria}</span>
                )}
              </span>

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
          <CategoriaField value={manualCategoria} onChange={setManualCategoria} style={{ width: 170 }} />
          <TextField placeholder="Precio unit." value={manualPrecio} onChange={(e) => setManualPrecio(e.target.value)} style={{ width: 120 }} />
          <TextField placeholder="Cant." value={manualCantidad} onChange={(e) => setManualCantidad(e.target.value)} style={{ width: 70 }} />
          <Button variant="secondary" iconLeft={<Icon n="plus" s={16} />} onClick={agregarManual}>Agregar</Button>
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-faint)' }}>
          La categoría es lo que va a leer el cliente en el PDF (ej. "Aros"). Si la dejás vacía se usa la descripción.
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
