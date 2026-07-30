import React from 'react'
import { api } from '../../../api/client'
import { RepuestoPicker } from '../../../components/RepuestoPicker'
import { CategoriaField } from '../../../components/CategoriaField'
import { TextField } from '../../../components/TextField'
import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import { ModalRepuestosAgregados } from './ModalRepuestosAgregados'
import { formatPrecioARS, parsePrecioARS } from '../../../utils/format'

const tituloSeccion = {
  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
  letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-faint)',
}

/*
 * Paso 4 del wizard. Componente controlado: la lista de repuestos agregados
 * (value) vive en el wizard. Cada línea:
 *   { key, repuesto_codigo, descripcion, categoria, marca, cantidad,
 *     precio_unitario, precioTexto, stock, esManual }
 * key = código de catálogo o 'manual-<ts>' (la API de repuestos no expone id).
 * categoria: lo único del repuesto que sale en el PDF.
 * marca: solo para mostrar en el pop-up "Ver repuestos" de este paso — no se
 * persiste en el presupuesto (los ítems fuera de catálogo no tienen marca).
 * stock: 1/0 congelado al agregar (null en manuales) — solo para el aviso en pantalla.
 */
export function PasoRepuestos({ motor, value, onChange, totalServicios, hayServicios, onConfirmar, guardando }) {
  const [sugeridos, setSugeridos] = React.useState([])
  const [manualCodigo, setManualCodigo] = React.useState('')
  const [manualDesc, setManualDesc] = React.useState('')
  const [manualCategoria, setManualCategoria] = React.useState('')
  const [manualPrecio, setManualPrecio] = React.useState('')
  const [manualCantidad, setManualCantidad] = React.useState('1')
  const [modalAbierto, setModalAbierto] = React.useState(false)

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
  const agregarDeCatalogo = ({ codigo: cod, descripcion: desc, precio, stock, categoria, marca }, cantidad) => {
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
      marca: marca || null,
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
      marca: null,
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Total y "Confirmar presupuesto" arriba de todo, igual que en el paso
          de Servicios: no hace falta bajar hasta el final para ver el total o confirmar. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: 'var(--surface-inverse)', borderRadius: 'var(--radius-xl)', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'rgba(255,255,255,.75)' }}>
            Servicios <strong style={{ color: '#fff' }}>{formatPrecioARS(totalServicios)}</strong>
          </span>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'rgba(255,255,255,.75)' }}>
            Repuestos <strong style={{ color: '#fff' }}>{formatPrecioARS(totalRepuestos)}</strong>
          </span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-md)', fontWeight: 600, color: '#fff' }}>Total</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 700, color: '#fff' }}>{formatPrecioARS(totalGeneral)}</span>
          </span>
        </div>
        <Button variant="success" disabled={!hayItems || hayInvalidos || guardando} onClick={onConfirmar}>
          {guardando ? 'Generando presupuesto…' : 'Confirmar presupuesto'}
        </Button>
      </div>
      {!hayItems && (
        <div style={{ textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
          Agregá al menos un servicio o un repuesto para confirmar.
        </div>
      )}

      <RepuestoPicker
        sugeridos={sugeridos}
        cantidadPorCodigo={cantidadPorCodigo}
        onAgregar={agregarDeCatalogo}
        reorderKey="repuestos-presupuesto"
        onVerAgregados={() => setModalAbierto(true)}
        cantidadAgregados={value.length}
      />

      <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', background: 'var(--surface-card)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={tituloSeccion}>Agregar repuesto fuera de catálogo</div>
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

      <ModalRepuestosAgregados
        open={modalAbierto}
        items={value}
        onCambiarCantidad={cambiarCantidad}
        onCambiarPrecio={cambiarPrecio}
        onQuitar={quitar}
        onClose={() => setModalAbierto(false)}
      />
    </div>
  )
}
