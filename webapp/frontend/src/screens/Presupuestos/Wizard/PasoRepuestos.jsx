import React from 'react'
import { api } from '../../../api/client'
import { RepuestoPicker } from '../../../components/RepuestoPicker'
import { CategoriaField } from '../../../components/CategoriaField'
import { TextField } from '../../../components/TextField'
import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import { ModalRepuestosAgregados } from './ModalRepuestosAgregados'
import { ModalRepuestosUsados } from './ModalRepuestosUsados'
import { formatPrecioARS, parsePrecioARS } from '../../../utils/format'
import { totalRepuestos } from '../../../utils/grupos'
import { useRepuestosAgrupados } from '../../../hooks/useRepuestosAgrupados'
import { useUndo } from '../../../context/UndoContext'

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
 * `grupo` es el nombre de la categoría del proveedor. Todas las líneas con el
 * mismo `grupo` son piezas intercambiables para la misma necesidad del motor, y
 * solo se cotiza la de mayor subtotal. Las líneas sin grupo (repuesto fuera de
 * catálogo sin categoría) se comportan como antes.
 *
 * **El paso arranca VACÍO, a propósito.** Antes se cargaba sola la ficha entera
 * del motor y el presupuesto nacía con todo puesto; ahora la ficha es la lista
 * de dónde elegir, no la selección hecha. Los dos ejes son independientes:
 *   cantidad → esta pieza va en ESTE presupuesto
 *   círculo  → esta pieza sirve para ESTE MOTOR (ficha, permanente)
 * con una sola dependencia: poner cantidad marca el círculo solo.
 *
 * key = código de catálogo o 'manual-<ts>' (la API de repuestos no expone id).
 * stock: 1/0 congelado al agregar (null en manuales) — solo para el aviso en pantalla.
 */
export function PasoRepuestos({
  motor, value, onChange, totalServicios, hayServicios, onRevisar,
  cantidadPorGrupo, onCantidadGrupo, elegidaAMano, onElegirAMano,
  ficha, onFicha, tildes,
}) {
  const [manualCodigo, setManualCodigo] = React.useState('')
  const [manualDesc, setManualDesc] = React.useState('')
  const [manualCategoria, setManualCategoria] = React.useState('')
  const [manualPrecio, setManualPrecio] = React.useState('')
  const [manualCantidad, setManualCantidad] = React.useState('1')
  const [modalAbierto, setModalAbierto] = React.useState(false)
  const [modalUsados, setModalUsados] = React.useState(false)
  const [aviso, setAviso] = React.useState('')
  const { avisarBorrado } = useUndo()

  // Cantidad que el motor recuerda para cada código de su ficha: la que más se
  // repite en sus presupuestos. En null (marcado sin cotizar nunca) el hook cae
  // en la cantidad del grupo, y si tampoco hay, en 1.
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
    // Las otras medidas de la pieza quedan marcadas en el motor, sin entrar al
    // presupuesto: cuál va se sabe recién cuando se mide el motor.
    onHermanas: tildes.marcarAuto,
    // Sacar la cantidad destilda SOLO si el tilde lo había puesto esa cantidad.
    onQuitarCodigo: tildes.soltarAuto,
  })

  /* Poner cantidad implica que la pieza es de este motor: el círculo se llena
     solo. Es el único sentido de la dependencia — marcar no pone cantidad. */
  const agregarRepuesto = React.useCallback((rep, cantidad, origen = 'click') => {
    if (cantidad > 0) tildes.marcarAuto(rep)
    agregar(rep, cantidad, origen)
  }, [agregar, tildes])

  const estadoDe = React.useCallback((codigo) => {
    if (cantidadPorCodigo.get(codigo)) return 'presupuesto'
    return tildes.estaTildado(codigo) ? 'motor' : 'fuera'
  }, [cantidadPorCodigo, tildes])

  /* Sacar del presupuesto (no de la ficha del motor) con cartel de deshacer:
     la lista completa de antes vuelve tal cual, con cantidades y precios. */
  const quitarConDeshacer = (key) => {
    const antes = value
    const linea = value.find((r) => r.key === key)
    const eraAuto = linea?.repuesto_codigo && tildes.tildes.get(linea.repuesto_codigo) === 'auto'
    quitar(key)
    avisarBorrado({
      mensaje: eraAuto
        ? `Se quitó ${linea?.descripcion || 'el repuesto'} del presupuesto y de los repuestos de este motor.`
        : `Se quitó ${linea?.descripcion || 'el repuesto'} del presupuesto.`,
      onDeshacer: () => {
        onChange(antes)
        // La línea usa `repuesto_codigo`; el tilde trabaja con `codigo`.
        if (linea?.repuesto_codigo) {
          tildes.marcarAuto({
            codigo: linea.repuesto_codigo,
            categoria: linea.categoria,
            cat_prefijo: linea.cat_prefijo,
          })
        }
      },
    })
  }

  const quitarVariasConDeshacer = (keys) => {
    const antes = value
    quitarVarias(keys)
    avisarBorrado({
      mensaje: `Se quitaron ${keys.length} medidas del presupuesto.`,
      onDeshacer: () => onChange(antes),
    })
  }

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
      usado_en: o.usado_en,
      ultima_vez: o.ultima_vez,
    }))),
    [ficha],
  )

  const guardarFicha = (grupos) => api.put(`/motores/${motor.id}/ficha-repuestos`, {
    grupos: grupos.map((g) => ({
      categoria: g.categoria,
      cat_prefijo: g.cat_prefijo,
      opciones: g.opciones.map((o) => ({
        codigo: o.codigo, cantidad: o.cantidad, cantidad_manual: o.cantidad_manual,
      })),
    })),
  })

  /*
   * Click en el círculo. Marcar guarda la pieza en el motor en el momento (es un
   * acto sobre el motor, no sobre el presupuesto). Desmarcar la saca del motor
   * y también de este presupuesto, que es la intención al apagarlo. Los
   * presupuestos ya emitidos no se tocan nunca: guardan su propia copia. Lo que
   * sale queda en la papelera del motor, así que se puede recuperar.
   */
  const alternarFicha = async (rep) => {
    const estaba = tildes.estaTildado(rep.codigo)
    const lineasAntes = value
    try {
      await tildes.alternarManual(rep)
      if (!estaba) {
        setAviso(`${rep.descripcion || rep.codigo} quedó guardado como repuesto de este motor. Ponele una cantidad si además va en este presupuesto.`)
        return
      }
      const linea = value.find((r) => r.repuesto_codigo === rep.codigo)
      if (linea) quitar(linea.key)
      setAviso('Se sacó de los repuestos de este motor. Si fue sin querer, lo recuperás desde "Repuestos eliminados", en la pantalla del motor.')
      avisarBorrado({
        mensaje: 'Se sacó el repuesto de este motor.',
        onDeshacer: async () => {
          try {
            await tildes.alternarManual(rep)
            onChange(lineasAntes)
            setAviso('')
          } catch (err) {
            setAviso(err.message || 'No se pudo deshacer')
          }
        },
      })
    } catch (err) {
      setAviso(err.message || 'No se pudo guardar en el motor')
    }
  }

  /*
   * Sacar un repuesto (o una familia de medidas entera) del registro del motor
   * desde el bloque de la ficha. Es el mismo efecto que apagar el círculo, pero
   * de varios códigos a la vez.
   */
  const quitarDeFicha = async (codigos) => {
    const fuera = new Set(codigos)
    const fichaAntes = ficha
    const lineasAntes = value
    const nueva = ficha
      .map((g) => ({ ...g, opciones: g.opciones.filter((o) => !fuera.has(o.codigo)) }))
      .filter((g) => g.opciones.length)
    try {
      const guardada = await guardarFicha(nueva)
      // El círculo se apaga solo: los tildes se recalculan desde la ficha.
      onFicha(guardada)
      onChange((actual) => actual.filter((r) => !fuera.has(r.repuesto_codigo)))
      setAviso(codigos.length === 1
        ? 'Se sacó de los repuestos de este motor. Si fue sin querer, lo recuperás desde "Repuestos eliminados", en la pantalla del motor.'
        : `Se sacaron ${codigos.length} medidas de los repuestos de este motor. Si fue sin querer, las recuperás desde "Repuestos eliminados", en la pantalla del motor.`)
      // Deshacer devuelve la ficha exactamente como estaba (guardarla de vuelta
      // también saca esos códigos de la papelera del motor) y repone las líneas
      // que se habían ido del presupuesto.
      avisarBorrado({
        mensaje: codigos.length === 1
          ? 'Se sacó el repuesto de este motor.'
          : `Se sacaron ${codigos.length} medidas de este motor.`,
        onDeshacer: async () => {
          try {
            const vuelta = await guardarFicha(fichaAntes)
            onFicha(vuelta)
            onChange(lineasAntes)
            setAviso('')
          } catch (err) {
            setAviso(err.message || 'No se pudo deshacer')
          }
        },
      })
    } catch (err) {
      setAviso(err.message || 'No se pudo sacar el repuesto del motor')
    }
  }

  /* Lo que se elige en "Repuestos ya utilizados" entra como cualquier otra
     carga: con su cantidad de aquel presupuesto y a precios de hoy. */
  const agregarUsados = (filas) => {
    filas.forEach((f) => agregarRepuesto({
      codigo: f.codigo,
      descripcion: f.descripcion,
      precio: f.precioHoy,
      stock: f.stockHoy,
      categoria: f.categoria,
      cat_prefijo: null,
      marca: f.marca,
      medida: f.medida,
      base_codigo: f.base_codigo,
    }, f.cantidad || 1, 'exacto'))
    setModalUsados(false)
    setAviso(`Se agregaron ${filas.length} repuesto${filas.length === 1 ? '' : 's'} al presupuesto, con los precios de hoy.`)
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

      {/* Total y "Revisar presupuesto" arriba de todo, igual que en el paso
          de Servicios: no hace falta bajar hasta el final para ver el total o
          seguir. El presupuesto todavía no se emite acá: el botón lleva al paso
          de Revisión, que es donde se confirma. */}
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
        <Button
          variant="success"
          disabled={!hayItems || hayInvalidos}
          iconRight={<Icon n="chevron-right" s={16} />}
          onClick={onRevisar}
        >
          Revisar presupuesto
        </Button>
      </div>
      {!hayItems && (
        <div style={{ textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
          Agregá al menos un servicio o un repuesto para poder seguir.
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
        onAgregar={agregarRepuesto}
        onQuitarDeFicha={quitarDeFicha}
        estadoDe={estadoDe}
        onToggleFicha={alternarFicha}
        motorId={motor.id}
        reorderKey="repuestos-presupuesto"
        onVerAgregados={() => setModalAbierto(true)}
        cantidadAgregados={value.length}
        accionExtra={(
          <Button variant="secondary" iconLeft={<Icon n="history" s={16} />} onClick={() => setModalUsados(true)}>
            Repuestos ya utilizados
          </Button>
        )}
        ayudaFilas="Poné una cantidad para cotizarlo, o tocá el círculo para dejarlo guardado como repuesto de este motor sin cotizarlo"
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
          a ese grupo y compite por precio; si la dejás vacía, va como línea aparte. Los repuestos fuera de catálogo
          quedan solo en este presupuesto: no se guardan en el motor.
        </div>
      </div>

      <ModalRepuestosAgregados
        open={modalAbierto}
        items={value}
        elegidaAMano={elegidaAMano}
        onElegirAMano={onElegirAMano}
        onCambiarCantidad={cambiarCantidad}
        onCambiarPrecio={cambiarPrecio}
        onQuitar={quitarConDeshacer}
        onQuitarVarias={quitarVariasConDeshacer}
        onClose={() => setModalAbierto(false)}
      />

      <ModalRepuestosUsados
        open={modalUsados}
        motorId={motor.id}
        onClose={() => setModalUsados(false)}
        onAgregar={agregarUsados}
      />
    </div>
  )
}
