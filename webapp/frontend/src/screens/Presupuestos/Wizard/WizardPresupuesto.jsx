import React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../../../api/client'
import { PageHeader } from '../../../components/PageHeader'
import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import { ErrorBanner } from '../../../components/ErrorBanner'
import { formatPrecioARS } from '../../../utils/format'
import { MotorSelector } from '../../../components/MotorSelector'
import { PasoCliente } from './PasoCliente'
import { PasoServicios } from './PasoServicios'
import { PasoRepuestos } from './PasoRepuestos'
import {
  gruposParaPayload, itemsSueltosParaPayload, lineaDeOpcion, elegidaAManoInicial,
} from '../../../utils/grupos'
import { useFichaTildes } from '../../../hooks/useFichaTildes'

const PASOS = ['Cliente', 'Motor', 'Servicios', 'Repuestos']

export default function WizardPresupuesto() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const duplicarDe = params.get('duplicar')
  const [paso, setPaso] = React.useState(0)
  const [cliente, setCliente] = React.useState({ nombre: '', tipo: null, contacto: null })
  const [motor, setMotor] = React.useState(null)
  // La selección de servicios y repuestos vive acá (no en cada paso) para que
  // ir atrás y adelante en el wizard no pierda lo ya elegido.
  const [serviciosSel, setServiciosSel] = React.useState({ cantidades: {}, customItems: [], grupos: {} })
  const [totalServicios, setTotalServicios] = React.useState(0)
  // Aumento/descuento en % sobre los precios de lista de mano de obra (positivo
  // = aumento, negativo = descuento). Vive acá (no en el paso) para no perderse
  // al ir y volver entre pasos, igual que serviciosSel.
  const [ajustePct, setAjustePct] = React.useState(0)
  const [repuestos, setRepuestos] = React.useState([])
  // Cantidad vigente de cada grupo de repuestos: lo que se tilda después dentro
  // de la misma categoría la hereda. Cada opción puede después ajustar la suya
  // (una marca viene por blíster de 8 y otra por blíster de 4).
  const [cantidadPorGrupo, setCantidadPorGrupo] = React.useState({})
  // Grupo → código elegido a mano, cuando el usuario pisa al más caro.
  const [elegidaAMano, setElegidaAMano] = React.useState({})
  const [error, setError] = React.useState('')
  const [guardando, setGuardando] = React.useState(false)
  /*
   * La ficha del motor (qué repuestos sirven para este motor) y los tildes viven
   * acá y no en el paso Repuestos, porque el paso se desmonta al ir y volver
   * entre pasos y con él se perdería lo marcado que todavía no se guardó.
   */
  const [ficha, setFicha] = React.useState([])
  const tildes = useFichaTildes({ motorId: motor?.id, ficha, onFicha: setFicha })

  React.useEffect(() => {
    if (!motor?.id) { setFicha([]); return undefined }
    let vigente = true
    api.get(`/motores/${motor.id}/ficha-repuestos`)
      .then((grupos) => { if (vigente) setFicha(grupos) })
      .catch(() => {})
    return () => { vigente = false }
  }, [motor?.id])

  const setCantidadGrupo = React.useCallback((grupo, cantidad) => {
    setCantidadPorGrupo((prev) => (prev[grupo] === cantidad ? prev : { ...prev, [grupo]: cantidad }))
  }, [])

  const setElegidaGrupo = React.useCallback((grupo, codigo) => {
    setElegidaAMano((prev) => ({ ...prev, [grupo]: prev[grupo] === codigo ? null : codigo }))
  }, [])

  /*
   * Duplicar: el wizard arranca cargado con el contenido de otro presupuesto y
   * lo único que falta es el cliente. Todo se copia a PRECIOS DE HOY, porque es
   * un presupuesto nuevo: los repuestos toman el precio vigente del catálogo
   * (lineaDeOpcion con preciosDeHoy) y la mano de obra la recalcula el backend
   * contra la lista de FACRA al crear, aplicándole este mismo ajuste %.
   *
   * No se copian las notas: son de ese trabajo puntual. Se cargan después desde
   * el detalle si hacen falta.
   */
  React.useEffect(() => {
    if (!duplicarDe) return
    let vigente = true
    const cargar = async () => {
      try {
        const original = await api.get(`/presupuestos/${duplicarDe}`)
        if (!vigente || !original.motor_id) return
        const [motorOriginal, itemsOriginal, gruposOriginal] = await Promise.all([
          api.get(`/motores/${original.motor_id}`),
          api.get(`/presupuestos/${duplicarDe}/items`),
          api.get(`/presupuestos/${duplicarDe}/grupos`).catch(() => []),
        ])
        if (!vigente) return

        setMotor(motorOriginal)
        setAjustePct(original.ajuste_pct || 0)
        setServiciosSel({
          cantidades: Object.fromEntries(
            itemsOriginal
              .filter((it) => it.tipo !== 'repuesto' && it.servicio_id)
              .map((it) => [it.servicio_id, it.cantidad || 1]),
          ),
          customItems: itemsOriginal
            .filter((it) => it.tipo !== 'repuesto' && !it.servicio_id)
            .map((it, i) => ({
              id: `dup-${i}`,
              descripcion_custom: it.descripcion_custom,
              // El wizard trata precio_aplicado como el UNITARIO del ítem manual.
              precio_aplicado: it.precio_unitario ?? it.precio_aplicado,
              cantidad: it.cantidad || 1,
            })),
          grupos: {},
        })

        const lineasGrupos = gruposOriginal.flatMap((g) => g.opciones.map((o) => lineaDeOpcion(g, o, true)))
        // Los repuestos sin grupo son los cargados a mano, fuera de catálogo:
        // no tienen precio vigente contra el cual compararse, así que se copian
        // con el que les puso el usuario.
        const sueltos = itemsOriginal
          .filter((it) => it.tipo === 'repuesto' && it.grupo_num == null)
          .map((it, i) => ({
            key: it.repuesto_codigo || `dup-suelto-${i}`,
            repuesto_codigo: it.repuesto_codigo,
            descripcion: it.descripcion_custom,
            categoria: null,
            cat_prefijo: null,
            marca: null,
            medida: null,
            grupo: null,
            cantidad: it.cantidad || 1,
            precio_unitario: it.precio_unitario,
            precioTexto: it.precio_unitario ? formatPrecioARS(it.precio_unitario) : '',
            stock: it.stock_al_cotizar,
            esManual: !it.repuesto_codigo,
          }))
        setRepuestos([...lineasGrupos, ...sueltos])
        setCantidadPorGrupo(Object.fromEntries(
          gruposOriginal.map((g) => [g.categoria, g.opciones[0]?.cantidad || 1]),
        ))
        setElegidaAMano(elegidaAManoInicial(gruposOriginal))
      } catch {
        if (vigente) setError('No se pudo cargar el presupuesto que querés duplicar')
      }
    }
    cargar()
    return () => { vigente = false }
  }, [duplicarDe])

  const finalizar = async () => {
    setGuardando(true)
    setError('')
    // Se abre la pestaña ya (en blanco) dentro del gesto de click, sin esperar la
    // respuesta del servidor: si se abre recién después del await, el navegador
    // suele bloquearla como popup por no considerarla parte de la interacción del usuario.
    const pdfTab = window.open('', '_blank')
    try {
      const items = [
        ...Object.entries(serviciosSel.cantidades)
          .filter(([, cantidad]) => cantidad > 0)
          .map(([id, cantidad]) => ({ servicio_id: Number(id), cantidad })),
        ...serviciosSel.customItems
          .filter((c) => (c.cantidad || 0) > 0)
          .map((c) => ({
            servicio_id: null,
            descripcion_custom: c.descripcion_custom,
            precio_aplicado: c.precio_aplicado,
            cantidad: c.cantidad,
          })),
        // Los repuestos sueltos (fuera de catálogo, sin categoría) siguen yendo
        // como ítems normales; los agrupados van aparte en grupos_repuestos,
        // donde el backend elige el más caro y guarda todas las opciones.
        ...itemsSueltosParaPayload(repuestos),
      ]
      const presupuesto = await api.post('/presupuestos', {
        cliente_nombre: cliente.nombre,
        cliente_tipo: cliente.tipo,
        contacto_nombre: cliente.contacto,
        motor_id: motor.id,
        items,
        grupos_repuestos: gruposParaPayload(repuestos, elegidaAMano),
        // Lo que se marcó como "sirve para este motor" sin cotizarlo: otras
        // marcas y las medidas hermanas. Entran a la ficha sin cantidad.
        ficha_tildes: tildes.tildesParaPayload(repuestos),
        ajuste_pct: ajustePct || 0,
      })
      if (pdfTab) pdfTab.location.href = `/api/presupuestos/${presupuesto.id}/pdf/1`
      navigate('/presupuestos')
    } catch (err) {
      if (pdfTab) pdfTab.close()
      setError(err.message || 'No se pudo generar el presupuesto')
    } finally {
      setGuardando(false)
    }
  }

  const volver = () => {
    if (paso === 0) { navigate('/presupuestos'); return }
    setPaso((p) => p - 1)
  }

  const cantidadItemsServicios = Object.values(serviciosSel.cantidades).filter((c) => c > 0).length
    + serviciosSel.customItems.filter((c) => (c.cantidad || 0) > 0).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Nuevo Presupuesto"
        subtitle={`Paso ${paso + 1} de ${PASOS.length} — ${PASOS[paso]}`}
        actions={
          <Button variant="secondary" iconLeft={<Icon n="arrow-left" s={16} />} onClick={volver}>
            Volver
          </Button>
        }
      />

      <ErrorBanner message={error} onClose={() => setError('')} />

      {duplicarDe && (
        <div style={{
          padding: '10px 14px', background: 'var(--status-aviso-bg)', color: 'var(--status-aviso-fg)',
          borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
        }}>
          Copia del presupuesto #{String(duplicarDe).padStart(4, '0')}
          {motor ? ` — ${motor.motor}` : ''}, con los precios de hoy. Elegí el cliente y revisá lo que haga falta.
        </div>
      )}

      {paso === 0 && (
        <PasoCliente
          valorInicial={cliente.nombre}
          onSiguiente={(info) => {
            setCliente(info)
            // Al duplicar el motor ya viene resuelto: se salta el selector. El
            // paso sigue accesible con "Volver" por si lo quieren cambiar.
            setPaso(duplicarDe && motor ? 2 : 1)
          }}
        />
      )}

      {paso === 1 && (
        <MotorSelector onSelect={(m) => {
          if (motor && m.id !== motor.id) {
            // Cambió el motor: la selección de servicios (y sus precios de lista)
            // ya no aplica. Los repuestos tampoco: ahora salen de la ficha del
            // motor, así que arrancan de cero con la ficha del motor nuevo.
            setServiciosSel({ cantidades: {}, customItems: [], grupos: {} })
            setTotalServicios(0)
            setRepuestos([])
            setCantidadPorGrupo({})
            setElegidaAMano({})
          }
          setMotor(m)
          setPaso(2)
        }} />
      )}

      {paso === 2 && motor && (
        <PasoServicios
          motor={motor}
          value={serviciosSel}
          onChange={setServiciosSel}
          ajustePct={ajustePct}
          onAjustePctChange={setAjustePct}
          onSiguiente={(total) => { setTotalServicios(total); setPaso(3) }}
        />
      )}

      {paso === 3 && motor && (
        <PasoRepuestos
          motor={motor}
          value={repuestos}
          onChange={setRepuestos}
          totalServicios={totalServicios}
          hayServicios={cantidadItemsServicios > 0}
          onConfirmar={finalizar}
          guardando={guardando}
          cantidadPorGrupo={cantidadPorGrupo}
          onCantidadGrupo={setCantidadGrupo}
          elegidaAMano={elegidaAMano}
          onElegirAMano={setElegidaGrupo}
          ficha={ficha}
          onFicha={setFicha}
          tildes={tildes}
        />
      )}
    </div>
  )
}
