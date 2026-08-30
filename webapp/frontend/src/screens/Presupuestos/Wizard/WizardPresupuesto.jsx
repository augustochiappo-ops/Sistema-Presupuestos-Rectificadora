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
import { PasoRevision } from './PasoRevision'
import {
  gruposParaPayload, itemsSueltosParaPayload, lineaDeOpcion,
  conCantidadRepuesto, conPrecioRepuesto, conSubtotalRepuesto,
} from '../../../utils/grupos'
import {
  itemsServiciosParaPayload,
  conCantidadServicio, conPrecioServicio, conSubtotalServicio,
} from '../../../utils/servicios'
import { useFichaTildes } from '../../../hooks/useFichaTildes'

const PASOS = ['Cliente', 'Motor', 'Servicios', 'Repuestos', 'Revisión']

export default function WizardPresupuesto() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const duplicarDe = params.get('duplicar')
  const [paso, setPaso] = React.useState(0)
  const [cliente, setCliente] = React.useState({ nombre: '', tipo: null, contacto: null })
  const [motor, setMotor] = React.useState(null)
  // La selección de servicios y repuestos vive acá (no en cada paso) para que
  // ir atrás y adelante en el wizard no pierda lo ya elegido.
  // precios: { [servicioId]: { valor, texto } } — unitarios pisados a mano en
  // el paso Servicios (ver utils/servicios.js).
  // opcionales: claves de las líneas de mano de obra que quedaron fuera del
  // total (caja de Opcionales).
  const [serviciosSel, setServiciosSel] = React.useState({ cantidades: {}, customItems: [], grupos: {}, precios: {}, opcionales: [] })
  const [totalServicios, setTotalServicios] = React.useState(0)
  const [totalServiciosOpcionales, setTotalServiciosOpcionales] = React.useState(0)
  // Aumento/descuento en % sobre los precios de lista de mano de obra (positivo
  // = aumento, negativo = descuento). Vive acá (no en el paso) para no perderse
  // al ir y volver entre pasos, igual que serviciosSel.
  const [ajustePct, setAjustePct] = React.useState(0)
  const [repuestos, setRepuestos] = React.useState([])
  // Cantidad vigente de cada grupo de repuestos: lo que se tilda después dentro
  // de la misma categoría la hereda. Cada opción puede después ajustar la suya
  // (una marca viene por blíster de 8 y otra por blíster de 4).
  const [cantidadPorGrupo, setCantidadPorGrupo] = React.useState({})
  const [error, setError] = React.useState('')
  const [guardando, setGuardando] = React.useState(false)
  // Las líneas de mano de obra que pasan a ser la tarifa del taller, o null si
  // el tilde del paso de Revisión está sin marcar. Las arma ese paso, que es el
  // que las muestra; acá se guardan tal cual, al confirmar, para poder dejar
  // registrado de qué presupuesto salió cada una.
  const [guardarPrecios, setGuardarPrecios] = React.useState(null)
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

  /* Mover una línea a la caja de Opcionales, o traerla de vuelta. Las dos
     entradas (el paso Servicios y el paso de Revisión) terminan acá. */
  const moverServicioOpcional = React.useCallback((clave, opcional) => {
    setServiciosSel((actual) => {
      const previas = (actual.opcionales || []).filter((c) => String(c) !== String(clave))
      return { ...actual, opcionales: opcional ? [...previas, clave] : previas }
    })
  }, [])

  const moverRepuestoOpcional = React.useCallback((key, opcional) => {
    setRepuestos((actual) => actual.map((r) => (r.key === key ? { ...r, opcional } : r)))
  }, [])

  /*
   * Editar una línea desde el paso de Revisión. Son las mismas funciones que
   * usan el paso Servicios y el pop-up "Ver repuestos" (utils/servicios.js y
   * utils/grupos.js), así que corregir un precio en la última pantalla da
   * exactamente lo mismo que haberlo corregido dos pasos antes.
   *
   * Viven en el wizard y no en el paso porque el estado es de acá: el paso de
   * Revisión se desmonta al volver atrás y con él se perdería lo editado.
   */
  const editarServicio = React.useMemo(() => ({
    cantidad: (fila, cantidad) => setServiciosSel((actual) => conCantidadServicio(actual, fila, cantidad)),
    precio: (fila, texto) => setServiciosSel((actual) => conPrecioServicio(actual, fila, texto)),
    subtotal: (fila, texto) => setServiciosSel((actual) => conSubtotalServicio(actual, fila, texto)),
  }), [])

  const editarRepuesto = React.useMemo(() => ({
    cantidad: (key, cantidad) => setRepuestos((actual) => (
      cantidad > 0
        ? conCantidadRepuesto(actual, key, cantidad)
        // Cantidad 0 es sacar la línea, no dejarla en cero: una línea en cero es
        // inválida y apagaría "Confirmar" sin explicar por qué (misma regla que
        // en el paso Repuestos).
        : actual.filter((r) => r.key !== key)
    )),
    precio: (key, texto) => setRepuestos((actual) => conPrecioRepuesto(actual, key, texto)),
    subtotal: (key, texto) => setRepuestos((actual) => conSubtotalRepuesto(actual, key, texto)),
  }), [])

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
        const manuales = itemsOriginal
          .filter((it) => it.tipo !== 'repuesto' && !it.servicio_id)
          .map((it, i) => ({
            id: `dup-${i}`,
            descripcion_custom: it.descripcion_custom,
            // El wizard trata precio_aplicado como el UNITARIO del ítem manual.
            precio_aplicado: it.precio_unitario ?? it.precio_aplicado,
            cantidad: it.cantidad || 1,
            opcional: Boolean(it.opcional),
          }))
        setServiciosSel({
          cantidades: Object.fromEntries(
            itemsOriginal
              .filter((it) => it.tipo !== 'repuesto' && it.servicio_id)
              .map((it) => [it.servicio_id, it.cantidad || 1]),
          ),
          customItems: manuales.map(({ opcional: _opcional, ...c }) => c),
          grupos: {},
          // La copia se arma a precios de hoy: la mano de obra la recalcula el
          // backend contra la lista, así que no se arrastran precios pisados.
          precios: {},
          // Lo que era opcional en el original sigue siéndolo en la copia.
          opcionales: [
            ...itemsOriginal
              .filter((it) => it.tipo !== 'repuesto' && it.servicio_id && it.opcional)
              .map((it) => String(it.servicio_id)),
            ...manuales.filter((c) => c.opcional).map((c) => c.id),
          ],
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
            opcional: Boolean(it.opcional),
            esManual: !it.repuesto_codigo,
          }))
        setRepuestos([...lineasGrupos, ...sueltos])
        setCantidadPorGrupo(Object.fromEntries(
          gruposOriginal.map((g) => [g.categoria, g.opciones[0]?.cantidad || 1]),
        ))
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
        ...itemsServiciosParaPayload(serviciosSel),
        // Los repuestos sueltos (fuera de catálogo, sin categoría) siguen yendo
        // como ítems normales; los agrupados van aparte en grupos_repuestos.
        ...itemsSueltosParaPayload(repuestos),
      ]
      const presupuesto = await api.post('/presupuestos', {
        cliente_nombre: cliente.nombre,
        cliente_tipo: cliente.tipo,
        contacto_nombre: cliente.contacto,
        motor_id: motor.id,
        items,
        grupos_repuestos: gruposParaPayload(repuestos),
        // Lo que se marcó como "sirve para este motor" sin cotizarlo: otras
        // marcas y las medidas hermanas. Entran a la ficha sin cantidad.
        ficha_tildes: tildes.tildesParaPayload(repuestos),
        ajuste_pct: ajustePct || 0,
      })
      // Los precios editados pasan a ser tarifa, si se tildó. Va DESPUÉS de
      // crear el presupuesto para poder guardar de cuál salió cada uno (queda
      // enlazado en "Mis precios"), y en su propio try: que falle guardar la
      // tarifa no puede tirar abajo un presupuesto que ya se emitió bien.
      if (guardarPrecios?.length && motor?.lista_num) {
        try {
          await api.post('/precios/mano-obra/lote', {
            lista_num: motor.lista_num,
            precios: guardarPrecios,
            origen: 'presupuesto',
            presupuesto_id: presupuesto.id,
          })
        } catch {
          // Sin banner: el presupuesto salió bien y es lo que importa. Los
          // precios se pueden cargar después desde Editar Precios.
        }
      }
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

  // Solo lo que cotiza cuenta para "el presupuesto tiene algo": un presupuesto
  // de puros opcionales no tiene total que cobrar.
  const esOpcionalClave = (clave) => (serviciosSel.opcionales || []).some((c) => String(c) === String(clave))
  const cantidadItemsServicios = Object.entries(serviciosSel.cantidades)
    .filter(([id, c]) => c > 0 && !esOpcionalClave(id)).length
    + serviciosSel.customItems.filter((c) => (c.cantidad || 0) > 0 && !esOpcionalClave(c.id)).length

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
            setServiciosSel({ cantidades: {}, customItems: [], grupos: {}, precios: {}, opcionales: [] })
            setTotalServicios(0)
            setTotalServiciosOpcionales(0)
            setRepuestos([])
            setCantidadPorGrupo({})
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
          onSiguiente={(total, totalOpcionales) => {
            setTotalServicios(total)
            setTotalServiciosOpcionales(totalOpcionales || 0)
            setPaso(3)
          }}
        />
      )}

      {paso === 3 && motor && (
        <PasoRepuestos
          motor={motor}
          value={repuestos}
          onChange={setRepuestos}
          totalServicios={totalServicios}
          totalServiciosOpcionales={totalServiciosOpcionales}
          hayServicios={cantidadItemsServicios > 0}
          onRevisar={() => setPaso(4)}
          cantidadPorGrupo={cantidadPorGrupo}
          onCantidadGrupo={setCantidadGrupo}
          ficha={ficha}
          onFicha={setFicha}
          tildes={tildes}
        />
      )}

      {paso === 4 && motor && (
        <PasoRevision
          cliente={cliente}
          motor={motor}
          serviciosSel={serviciosSel}
          ajustePct={ajustePct}
          repuestos={repuestos}
          onMoverServicio={moverServicioOpcional}
          onMoverRepuesto={moverRepuestoOpcional}
          onEditarServicio={editarServicio}
          onEditarRepuesto={editarRepuesto}
          guardarPrecios={guardarPrecios}
          onGuardarPreciosChange={setGuardarPrecios}
          onConfirmar={finalizar}
          guardando={guardando}
        />
      )}
    </div>
  )
}
