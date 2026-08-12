import React from 'react'
import { api } from '../../../api/client'
import { RepuestoPicker } from '../../../components/RepuestoPicker'
import { CategoriaField } from '../../../components/CategoriaField'
import { TextField } from '../../../components/TextField'
import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import { ModalRepuestosAgregados } from './ModalRepuestosAgregados'
import { formatPrecioARS, parsePrecioARS } from '../../../utils/format'
import { totalRepuestos } from '../../../utils/grupos'
import { useRepuestosAgrupados, lineaDeCatalogo } from '../../../hooks/useRepuestosAgrupados'

const tituloSeccion = {
  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
  letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-faint)',
}

/*
 * Paso 4 del wizard. Componente controlado: la lista de repuestos (value) vive
 * en el wizard. Cada línea:
 *   { key, repuesto_codigo, descripcion, categoria, cat_prefijo, marca, medida,
 *     grupo, cantidad, precio_unitario, precioTexto, stock, esManual }
 *
 * `grupo` es lo nuevo: el nombre de la categoría del proveedor. Todas las
 * líneas con el mismo `grupo` son piezas intercambiables para la misma
 * necesidad del motor, y solo se cotiza la de mayor subtotal. Las líneas sin
 * grupo (repuesto fuera de catálogo sin categoría) se comportan como antes.
 *
 * key = código de catálogo o 'manual-<ts>' (la API de repuestos no expone id).
 * stock: 1/0 congelado al agregar (null en manuales) — solo para el aviso en pantalla.
 */
export function PasoRepuestos({
  motor, value, onChange, totalServicios, hayServicios, onConfirmar, guardando,
  cantidadPorGrupo, onCantidadGrupo, elegidaAMano, onElegirAMano,
}) {
  const [ficha, setFicha] = React.useState([])
  const [manualCodigo, setManualCodigo] = React.useState('')
  const [manualDesc, setManualDesc] = React.useState('')
  const [manualCategoria, setManualCategoria] = React.useState('')
  const [manualPrecio, setManualPrecio] = React.useState('')
  const [manualCantidad, setManualCantidad] = React.useState('1')
  const [modalAbierto, setModalAbierto] = React.useState(false)
  const [aviso, setAviso] = React.useState('')
  const fichaCargadaPara = React.useRef(null)

  // La ficha del motor es la asociación explícita motor→repuestos. Si el motor
  // ya tiene ficha y todavía no se cargó nada, el paso arranca con todo puesto
  // y con los precios de hoy: el segundo presupuesto del mismo motor es de un
  // click. La ref evita recargarla al ir y volver entre pasos.
  React.useEffect(() => {
    if (fichaCargadaPara.current === motor.id) return
    fichaCargadaPara.current = motor.id
    api.get(`/motores/${motor.id}/ficha-repuestos`).then((grupos) => {
      setFicha(grupos)
      if (!grupos.length) return
      onChange((actual) => {
        if (actual.length) return actual
        const lineas = []
        grupos.forEach((g) => {
          g.opciones.forEach((o) => {
            if (!o.en_catalogo) return
            lineas.push(lineaDeFicha(g, o))
          })
          if (g.opciones.length) onCantidadGrupo(g.categoria, g.opciones[0].cantidad)
        })
        return lineas
      })
    }).catch(() => {})
  }, [motor.id, onChange, onCantidadGrupo])

  // Cantidad que el motor recuerda para cada código de su ficha: la cuenta
  // "16 retenes ÷ blíster de 4 = 4" se hace una sola vez en la vida.
  const cantidadRecordada = React.useMemo(() => {
    const m = new Map()
    ficha.forEach((g) => g.opciones.forEach((o) => m.set(o.codigo, o.cantidad)))
    return m
  }, [ficha])

  const { cantidadPorCodigo, agregar, cambiarCantidad, cambiarPrecio, quitar, quitarVarias } = useRepuestosAgrupados({
    lineas: value,
    setLineas: onChange,
    cantidadPorGrupo,
    setCantidadGrupo: onCantidadGrupo,
    cantidadRecordada,
  })

  const sugeridos = React.useMemo(
    () => ficha.flatMap((g) => g.opciones.map((o) => ({
      codigo: o.codigo,
      descripcion: o.descripcion || o.codigo,
      categoria: g.categoria,
      cat_prefijo: g.cat_prefijo,
      marca: o.marca,
      medida: o.medida,
      base_codigo: o.base_codigo,
      precio_actual: o.precio_actual,
      stock_actual: o.stock_actual,
    }))),
    [ficha],
  )

  /*
   * Sacar un repuesto del registro del motor sin salir del presupuesto: es acá
   * donde uno se da cuenta de que en el presupuesto anterior cargó algo que no
   * iba. Borra de la ficha (que es lo que va a cargarse solo la próxima vez) y
   * también de este presupuesto, que es la intención al tocar el tacho. Los
   * presupuestos ya emitidos no se tocan nunca: guardan su propia copia.
   * Lo borrado queda en la papelera del motor, así que se puede deshacer.
   */
  const quitarDeFicha = async (codigos) => {
    const fuera = new Set(codigos)
    const nueva = ficha
      .map((g) => ({ ...g, opciones: g.opciones.filter((o) => !fuera.has(o.codigo)) }))
      .filter((g) => g.opciones.length)
    try {
      const guardada = await api.put(`/motores/${motor.id}/ficha-repuestos`, {
        grupos: nueva.map((g) => ({
          categoria: g.categoria,
          cat_prefijo: g.cat_prefijo,
          opciones: g.opciones.map((o) => ({ codigo: o.codigo, cantidad: o.cantidad })),
        })),
      })
      setFicha(guardada)
      onChange((actual) => actual.filter((r) => !fuera.has(r.repuesto_codigo)))
      setAviso(codigos.length === 1
        ? 'Se sacó de los repuestos de este motor. Si fue sin querer, lo recuperás desde "Repuestos eliminados", en la pantalla del motor.'
        : `Se sacaron ${codigos.length} medidas de los repuestos de este motor. Si fue sin querer, las recuperás desde "Repuestos eliminados", en la pantalla del motor.`)
    } catch (err) {
      setAviso(err.message || 'No se pudo sacar el repuesto del motor')
    }
  }

  const agregarManual = () => {
    const desc = manualDesc.trim()
    const precio = parsePrecioARS(manualPrecio)
    const cant = parseFloat(String(manualCantidad).replace(',', '.'))
    if (!desc || precio === null || Number.isNaN(cant) || cant <= 0) return
    const categoria = manualCategoria.trim()
    onChange((actual) => [...actual, {
      key: `manual-${Date.now()}`,
      repuesto_codigo: manualCodigo.trim() || null,
      descripcion: desc,
      categoria: categoria || null,
      cat_prefijo: null,
      marca: null,
      medida: null,
      // Con categoría entra al grupo de esa categoría y compite por precio como
      // una opción más; sin categoría queda como línea suelta, igual que antes.
      grupo: categoria || null,
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

  const total = totalRepuestos(value, elegidaAMano)
  const totalGeneral = totalServicios + total
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
            Repuestos <strong style={{ color: '#fff' }}>{formatPrecioARS(total)}</strong>
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

      {aviso && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          padding: '10px 14px', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)',
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-body)',
        }}>
          {aviso}
          <button onClick={() => setAviso('')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }}>
            <Icon n="x" s={14} />
          </button>
        </div>
      )}

      <RepuestoPicker
        sugeridos={sugeridos}
        cantidadPorCodigo={cantidadPorCodigo}
        onAgregar={agregar}
        onQuitarDeFicha={quitarDeFicha}
        reorderKey="repuestos-presupuesto"
        onVerAgregados={() => setModalAbierto(true)}
        cantidadAgregados={value.length}
        ayudaFilas="Lo que agregues dentro de una categoría forma un grupo: se cotiza el más caro y quedan guardadas todas las opciones"
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
          La categoría es lo que va a leer el cliente en el PDF (ej. "Aros"). Si ponés una que ya tiene grupo, se suma
          a ese grupo y compite por precio; si la dejás vacía, va como línea aparte.
        </div>
      </div>

      <ModalRepuestosAgregados
        open={modalAbierto}
        items={value}
        elegidaAMano={elegidaAMano}
        onElegirAMano={onElegirAMano}
        onCambiarCantidad={cambiarCantidad}
        onCambiarPrecio={cambiarPrecio}
        onQuitar={quitar}
        onQuitarVarias={quitarVarias}
        onClose={() => setModalAbierto(false)}
      />
    </div>
  )
}

function lineaDeFicha(grupo, opcion) {
  return lineaDeCatalogo({
    codigo: opcion.codigo,
    descripcion: opcion.descripcion,
    precio: opcion.precio_actual,
    stock: opcion.stock_actual,
    categoria: grupo.categoria,
    cat_prefijo: grupo.cat_prefijo,
    marca: opcion.marca,
    medida: opcion.medida,
    base_codigo: opcion.base_codigo,
  }, opcion.cantidad)
}
