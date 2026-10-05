import React from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { PageHeader } from '../../components/PageHeader'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { ErrorBanner } from '../../components/ErrorBanner'
import { TextField } from '../../components/TextField'
import { SearchInput } from '../../components/SearchInput'
import { ContadorServicio } from '../../components/ContadorServicio'
import { CampoMonto } from '../../components/CampoMonto'
import { useCategorias } from '../../hooks/useCategorias'
import { coincideBusqueda } from '../../utils/texto'
import { aPesos, formatPrecioARS, formatFechaAR, parsePrecioARS } from '../../utils/format'
import { enlaceWhatsApp, saludo } from '../../utils/whatsapp'
import { bajarPdf, compartirPdf, nombreArchivoPdf } from '../../utils/compartirPdf'

/*
 * PRESUPUESTO RÁPIDO — el atajo para cuando entra un motor y hay que anotarlo
 * ya, con el cliente esperando. Pensado primero para el CELULAR (2026-10-02):
 * una sola columna, renglones grandes para el pulgar y la barra de abajo con el
 * precio y el botón de guardar siempre a la vista. En la compu se ve igual,
 * con las listas una al lado de la otra.
 *
 * Es el mismo presupuesto de siempre (mismo endpoint, misma tabla, mismo PDF,
 * se edita y se aprueba igual); lo que cambia es cuánto cuesta cargarlo:
 *
 *   - El cliente y el MOTOR se escriben, no se buscan. Mientras se escribe el
 *     motor aparecen los de la lista de la Cámara que coinciden; tocar uno es
 *     opcional (si se toca, se ve cuánto da la mano de obra según la lista).
 *   - La cantidad de cada trabajo se pone de un toque: se eligen los cilindros
 *     del motor una vez y cada renglón ofrece 1 / N / N×2 / N×4.
 *   - Los repuestos se tildan POR CATEGORÍA ("Aros", "Cojinetes de biela"), sin
 *     buscar código por código. Van sin precio: el precio está en el total.
 *   - El total NO es la suma de los renglones: es el que se escribe a mano y
 *     viaja al backend como `total_manual` (ver db.total_guardado). Y se puede
 *     dejar VACÍO: el motor entra igual y queda "a cotizar", porque muchas
 *     veces el precio se sabe recién después de desarmarlo.
 *   - Si el cliente ya dijo que sí, el motor entra derecho al panel del taller
 *     (con urgente y fecha prometida), en el mismo guardado.
 *
 * Lo que se va cargando queda guardado en el navegador (ver BORRADOR): si se
 * corta la sesión, se bloquea el teléfono o se cierra la pestaña sin querer,
 * al volver está todo como estaba.
 *
 * El wizard de cinco pasos sigue siendo el camino cuando hace falta cotizar de
 * verdad: precios por renglón, códigos concretos para el pedido y opcionales.
 */

const eyebrow = {
  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
  letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-faint)',
}

const tarjeta = {
  display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0,
  padding: 16, background: 'var(--surface-card)',
  border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)',
}

const textoChico = { fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-muted)' }

// "3 trabajos" al lado del título de cada lista: en una sola línea siempre.
const contador = { ...textoChico, fontWeight: 600, color: 'var(--status-active-fg)', whiteSpace: 'nowrap', flexShrink: 0 }

const vacio = {
  padding: '20px 0', textAlign: 'center', color: 'var(--text-faint)',
  fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
}

// En el celular los campos van más altos (se aciertan con el pulgar) y con letra
// de 16 px: con menos, el iPhone agranda la página al tocar el campo y no la
// vuelve a achicar.
const campoAlto = { height: 48 }

// Cliente vacío: el presupuesto se emite igual y queda colgado de esta ficha.
// El endpoint sigue pidiendo un nombre (no se le cambió el contrato), así que
// el default se resuelve acá, en la única pantalla que lo permite en blanco.
const CLIENTE_POR_DEFECTO = 'Consumidor final'

/*
 * CUÁNTAS VECES SE HACE CADA TRABAJO — los atajos de cantidad.
 *
 * Casi todo lo que se le hace a un motor se hace una vez por cilindro (rectificar
 * cilindros, reunir), o una vez por válvula, y las válvulas son dos o cuatro por
 * cilindro. Así que sabiendo los cilindros del motor los tres números que hacen
 * falta salen solos: N, N×2 y N×4. En un motor de 6 son 6, 12 y 24; en uno de 4
 * son 4, 8 y 16. El 1 va siempre, para los trabajos que se hacen una sola vez
 * (rectificar el cigüeñal, planear la tapa).
 *
 * Los cilindros se eligen una vez para todo el presupuesto —un motor tiene los
 * que tiene— y no se sacan del motor elegido porque la lista de la Cámara no
 * trae ese dato como número: el nombre dice "4 CIL" o no dice nada.
 */
const CILINDROS = [4, 6, 8]
const CILINDROS_POR_DEFECTO = 4

/** Los cuatro atajos de cantidad para un motor de N cilindros: 1, N, N×2, N×4. */
function atajosDeCantidad(cilindros) {
  return [...new Set([1, cilindros, cilindros * 2, cilindros * 4])]
}

/*
 * BORRADOR — lo que se está cargando, guardado en el navegador del teléfono.
 *
 * Con el cliente esperando, perder lo cargado es lo peor que puede pasar: la
 * sesión vence a las 8 horas (y vencida, la app vuelve al login y la pantalla
 * se desarma), el teléfono se bloquea, se toca "atrás" sin querer. Así que cada
 * cambio se guarda acá, y al volver a la pantalla se recupera.
 *
 * Es sólo una comodidad de ESTE teléfono: no viaja al servidor ni lo ve nadie
 * más. Dura medio día — un borrador de ayer ya no es el cliente de hoy — y se
 * borra al guardar el presupuesto o al tocar "Empezar de cero". Todo acceso va
 * con try/catch: en modo incógnito el navegador puede negarlo, y la pantalla
 * tiene que andar igual.
 */
const CLAVE_BORRADOR = 'presupuesto-rapido:borrador'
const VIDA_BORRADOR_MS = 12 * 60 * 60 * 1000

function leerBorrador() {
  try {
    const b = JSON.parse(window.localStorage.getItem(CLAVE_BORRADOR) || 'null')
    if (!b || typeof b !== 'object' || Date.now() - (b.guardado || 0) > VIDA_BORRADOR_MS) return null
    return b
  } catch {
    return null
  }
}

function escribirBorrador(datos) {
  try {
    if (datos) window.localStorage.setItem(CLAVE_BORRADOR, JSON.stringify({ ...datos, guardado: Date.now() }))
    else window.localStorage.removeItem(CLAVE_BORRADOR)
  } catch { /* sin almacenamiento: la pantalla anda igual, sin red de seguridad */ }
}

/** El formulario vacío. Es también lo que deja "Nuevo presupuesto rápido". */
const FORMULARIO_VACIO = {
  cliente: '', telefono: '', motorTexto: '', motor: null, cilindros: CILINDROS_POR_DEFECTO,
  cantidades: {}, categoriasSel: [], notas: '', totalTexto: '',
  aprobado: false, urgente: false, entrega: '',
}

function formularioVacio(f) {
  return !f.cliente.trim() && !f.telefono.trim() && !f.motorTexto.trim() && !f.motor
    && Object.keys(f.cantidades).length === 0 && f.categoriasSel.length === 0
    && !f.notas.trim() && !f.totalTexto.trim() && !f.aprobado
}

/** Una tecla grande de las que se eligen de a una (cilindros). */
function BotonSegmento({ activo, onClick, children, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={activo}
      style={{
        minWidth: 52, height: 44, padding: '0 14px', borderRadius: 12, cursor: 'pointer',
        fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 600, lineHeight: 1,
        border: `1px solid ${activo ? 'var(--surface-inverse)' : 'var(--border-default)'}`,
        background: activo ? 'var(--surface-inverse)' : 'var(--surface-card)',
        color: activo ? '#fff' : 'var(--text-strong)',
      }}
    >
      {children}
    </button>
  )
}

/** Un interruptor de sí/no con su texto, todo el renglón tocable. */
function Interruptor({ prendido, onCambiar, titulo, ayuda, icono }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={prendido}
      onClick={() => onCambiar(!prendido)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 52,
        padding: '8px 4px', border: 'none', background: 'transparent', cursor: 'pointer',
        textAlign: 'left', fontFamily: 'var(--font-body)',
      }}
    >
      {icono && <span style={{ display: 'flex', color: prendido ? 'var(--text-strong)' : 'var(--text-faint)' }}>{icono}</span>}
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-strong)' }}>{titulo}</span>
        {ayuda && <span style={textoChico}>{ayuda}</span>}
      </span>
      <span style={{
        flexShrink: 0, width: 46, height: 28, borderRadius: 999, padding: 3, boxSizing: 'border-box',
        background: prendido ? 'var(--status-active-fg)' : 'var(--neutral-300)',
        transition: 'background .15s ease', display: 'flex',
        justifyContent: prendido ? 'flex-end' : 'flex-start',
      }}>
        <span style={{ width: 22, height: 22, borderRadius: 999, background: '#fff', boxShadow: 'var(--shadow-xs)' }} />
      </span>
    </button>
  )
}

export default function PresupuestoRapido() {
  const navigate = useNavigate()
  // El borrador se lee UNA vez, al entrar. Todo el estado arranca de ahí.
  const [inicial] = React.useState(() => ({ ...FORMULARIO_VACIO, ...(leerBorrador() || {}) }))
  const [recuperado, setRecuperado] = React.useState(() => !formularioVacio(inicial))

  const [cliente, setCliente] = React.useState(inicial.cliente)
  const [telefono, setTelefono] = React.useState(inicial.telefono)
  const [motorTexto, setMotorTexto] = React.useState(inicial.motorTexto)
  // El motor de la lista de la Cámara, si se tocó una sugerencia: {id, motor, lista_num}.
  const [motor, setMotor] = React.useState(inicial.motor)
  const [sugerencias, setSugerencias] = React.useState([])
  const [escribiendoMotor, setEscribiendoMotor] = React.useState(false)
  const [cilindros, setCilindros] = React.useState(inicial.cilindros)

  const [servicios, setServicios] = React.useState([])
  const [preciosLista, setPreciosLista] = React.useState(null)
  const [favServicios, setFavServicios] = React.useState(new Set())
  const [cantidades, setCantidades] = React.useState(inicial.cantidades)
  const [buscarServicio, setBuscarServicio] = React.useState('')
  const [verTodosServicios, setVerTodosServicios] = React.useState(false)

  const categorias = useCategorias()
  const [favCategorias, setFavCategorias] = React.useState(new Set())
  const [categoriasSel, setCategoriasSel] = React.useState(inicial.categoriasSel)
  const [buscarCategoria, setBuscarCategoria] = React.useState('')
  const [verTodasCategorias, setVerTodasCategorias] = React.useState(false)

  const [notas, setNotas] = React.useState(inicial.notas)
  const [totalTexto, setTotalTexto] = React.useState(inicial.totalTexto)
  const [aprobado, setAprobado] = React.useState(inicial.aprobado)
  const [urgente, setUrgente] = React.useState(inicial.urgente)
  const [entrega, setEntrega] = React.useState(inicial.entrega)

  const [error, setError] = React.useState('')
  const [guardando, setGuardando] = React.useState(false)
  // El presupuesto recién guardado: la pantalla pasa a "Listo" (compartir, nuevo).
  const [hecho, setHecho] = React.useState(null)

  const refCliente = React.useRef(null)
  const refTelefono = React.useRef(null)
  const refMotor = React.useRef(null)
  const motorEnfocado = React.useRef(false)

  // La lista entera de la Cámara, sin precio: los trabajos son los mismos para
  // cualquier motor, así que se tildan igual aunque el motor se escriba a mano.
  React.useEffect(() => {
    // Con el caché (api/client.js): si la precarga ya los trajo, aparecen al instante.
    const favS = (ids) => setFavServicios(new Set(ids))
    const favC = (ids) => setFavCategorias(new Set(ids))
    api.get('/servicios', { alActualizar: setServicios }).then(setServicios).catch(() => setServicios([]))
    api.get('/servicios/favoritos', { alActualizar: favS }).then(favS).catch(() => {})
    api.get('/repuestos/categorias/favoritos', { alActualizar: favC }).then(favC).catch(() => {})
  }, [])

  // Con un motor de la lista hay precios de referencia (los de SU lista).
  React.useEffect(() => {
    if (!motor?.id) { setPreciosLista(null); return undefined }
    let vigente = true
    api.get(`/motores/${motor.id}/servicios`)
      .then((lista) => { if (vigente) setPreciosLista(new Map(lista.map((s) => [s.id, s.precio]))) })
      .catch(() => {})
    return () => { vigente = false }
  }, [motor?.id])

  // Sugerencias de la lista mientras se escribe el motor. Con una pausa de un
  // cuarto de segundo: no hace falta preguntarle al servidor letra por letra.
  React.useEffect(() => {
    const q = motorTexto.trim()
    if (motor || q.length < 2) { setSugerencias([]); return undefined }
    let vigente = true
    const espera = setTimeout(() => {
      api.get(`/motores?busqueda=${encodeURIComponent(q)}`)
        .then((lista) => { if (vigente) setSugerencias(lista.slice(0, 4)) })
        .catch(() => {})
    }, 250)
    return () => { vigente = false; clearTimeout(espera) }
  }, [motorTexto, motor])

  // Cada cambio va al borrador. Uno vacío se borra (no hay nada que recuperar).
  React.useEffect(() => {
    if (hecho) return
    const datos = {
      cliente, telefono, motorTexto, motor, cilindros, cantidades, categoriasSel,
      notas, totalTexto, aprobado, urgente, entrega,
    }
    escribirBorrador(formularioVacio(datos) ? null : datos)
  }, [hecho, cliente, telefono, motorTexto, motor, cilindros, cantidades, categoriasSel,
    notas, totalTexto, aprobado, urgente, entrega])

  // Con la pantalla vacía el cursor ya espera en el cliente: es lo primero que
  // se escribe. Con un borrador recuperado no, que se está siguiendo otra cosa.
  React.useEffect(() => {
    if (!recuperado) refCliente.current?.focus()
    // Sólo al entrar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reiniciar = () => {
    const v = FORMULARIO_VACIO
    setCliente(v.cliente); setTelefono(v.telefono); setMotorTexto(v.motorTexto); setMotor(v.motor)
    setCilindros(v.cilindros); setCantidades(v.cantidades); setCategoriasSel(v.categoriasSel)
    setNotas(v.notas); setTotalTexto(v.totalTexto); setAprobado(v.aprobado); setUrgente(v.urgente)
    setEntrega(v.entrega); setBuscarServicio(''); setBuscarCategoria('')
    setVerTodosServicios(false); setVerTodasCategorias(false)
    setRecuperado(false); setError(''); setHecho(null)
    escribirBorrador(null)
    window.scrollTo(0, 0)
    setTimeout(() => refCliente.current?.focus(), 0)
  }

  const elegirMotor = (m) => {
    setMotor({ id: m.id, motor: m.motor, lista_num: m.lista_num })
    setSugerencias([])
  }

  const cambiarCantidad = (id, n) => {
    setCantidades((prev) => {
      const siguiente = { ...prev }
      if (n > 0) siguiente[id] = n; else delete siguiente[id]
      return siguiente
    })
  }

  const toggleServicio = (id) => cambiarCantidad(id, cantidades[id] > 0 ? 0 : 1)

  // La estrella es la misma de los favoritos del wizard: marcar acá los
  // trabajos de todos los días deja la lista corta también allá.
  const toggleFavorito = async (id) => {
    try {
      const { favorito } = await api.post(`/servicios/${id}/favorito`)
      setFavServicios((prev) => {
        const siguiente = new Set(prev)
        if (favorito) siguiente.add(id); else siguiente.delete(id)
        return siguiente
      })
    } catch (err) {
      setError(err.message || 'No se pudo marcar el favorito')
    }
  }

  const toggleCategoria = (prefijo) => {
    setCategoriasSel((prev) => (
      prev.includes(prefijo) ? prev.filter((p) => p !== prefijo) : [...prev, prefijo]
    ))
  }

  /* ── La lista de mano de obra ──────────────────────────────────────────────
     Sin buscar, se ven los favoritos y lo que ya se tildó: es la lista corta de
     todos los días. El resto (son más de doscientos) se abre con un botón o
     buscando. Sin favoritos marcados se ve todo, para no esconder la lista. */
  const hayBusquedaServicio = buscarServicio.trim() !== ''
  const sinFavoritos = favServicios.size === 0
  const serviciosVisibles = servicios.filter((s) => {
    if (hayBusquedaServicio) return coincideBusqueda([String(s.item_num), s.descripcion], buscarServicio)
    if (verTodosServicios || sinFavoritos) return true
    return favServicios.has(s.id) || cantidades[s.id] > 0
  })
  const serviciosArriba = serviciosVisibles.filter((s) => favServicios.has(s.id))
  const serviciosResto = serviciosVisibles.filter((s) => !favServicios.has(s.id))
  const serviciosOcultos = !hayBusquedaServicio && !verTodosServicios && !sinFavoritos
    ? servicios.length - serviciosVisibles.length
    : 0

  /* ── Las categorías de repuestos ───────────────────────────────────────────
     Mismo criterio: favoritas y tildadas a la vista; el resto, buscando o con
     "Ver todas". Son unas 150: como fichas, de a todas, no se encuentra nada. */
  const hayBusquedaCategoria = buscarCategoria.trim() !== ''
  const categoriasVisibles = categorias.filter((c) => {
    if (hayBusquedaCategoria) return coincideBusqueda([c.nombre], buscarCategoria)
    if (verTodasCategorias) return true
    return favCategorias.has(c.prefijo) || categoriasSel.includes(c.prefijo)
  })
  const categoriasOrdenadas = [
    ...categoriasVisibles.filter((c) => favCategorias.has(c.prefijo)),
    ...categoriasVisibles.filter((c) => !favCategorias.has(c.prefijo)),
  ]

  const atajos = atajosDeCantidad(cilindros)
  const elegidas = categorias.filter((c) => categoriasSel.includes(c.prefijo))
  const tildados = servicios.filter((s) => cantidades[s.id] > 0)
  const cantidadTrabajos = Object.keys(cantidades).length
  const cantidadTildes = cantidadTrabajos + categoriasSel.length

  /* Cuánto daría la mano de obra tildada según la lista. Es un dato al costado,
     para tenerlo a la vista antes de decidir el precio: NO es el total, no viaja
     al backend y no sale en el PDF. Sólo existe con un motor de la lista: uno
     escrito a mano no tiene lista de la Cámara de dónde sacar el precio. */
  const referenciaManoObra = preciosLista
    ? tildados.reduce((acc, s) => acc + (aPesos(preciosLista.get(s.id)) || 0) * cantidades[s.id], 0)
    : null

  const nombreMotor = motor ? motor.motor : motorTexto.trim()
  const totalFinal = parsePrecioARS(totalTexto)
  const precioInvalido = totalTexto.trim() !== '' && (totalFinal === null || totalFinal < 0)
  const puedeGuardar = Boolean(nombreMotor) && cantidadTildes > 0 && !precioInvalido
  const motivoBloqueo = !nombreMotor
    ? 'Falta el motor'
    : cantidadTildes === 0
      ? 'Tildá al menos un trabajo o un repuesto'
      : precioInvalido ? 'El precio no se entiende' : ''

  const guardar = async () => {
    if (!puedeGuardar || guardando) return
    setGuardando(true)
    setError('')
    try {
      const items = [
        ...Object.entries(cantidades)
          .filter(([, c]) => c > 0)
          .map(([id, c]) => ({ servicio_id: Number(id), cantidad: c })),
        // Un repuesto sin código: lo único que el cliente lee de un repuesto en
        // el PDF es la categoría, así que la categoría ES la línea. Unitario 0
        // porque el precio de los repuestos ya está adentro del total escrito.
        ...elegidas.map((c) => ({
          tipo: 'repuesto',
          descripcion: c.nombre,
          categoria: c.nombre,
          cantidad: 1,
          precio_unitario: 0,
        })),
      ]
      const presupuesto = await api.post('/presupuestos', {
        cliente_nombre: cliente.trim() || CLIENTE_POR_DEFECTO,
        cliente_telefono: telefono.trim() || null,
        ...(motor ? { motor_id: motor.id } : { motor_texto: motorTexto.trim() }),
        items,
        ajuste_pct: 0,
        ...(totalFinal !== null ? { total_manual: totalFinal } : { a_cotizar: true }),
        notas: notas.trim() || null,
        aprobado,
        urgente: aprobado && urgente,
        entrega_prometida: aprobado ? (entrega || null) : null,
      })
      escribirBorrador(null)
      // Lo que el resumen y el WhatsApp necesitan, tal cual se cargó.
      setHecho({
        ...presupuesto,
        trabajos: tildados.map((s) => ({ descripcion: s.descripcion, cantidad: cantidades[s.id] })),
        repuestos: elegidas.map((c) => c.nombre),
      })
      if (aprobado) window.dispatchEvent(new CustomEvent('trabajos-cambiaron'))
      window.scrollTo(0, 0)
    } catch (err) {
      setError(err.message || 'No se pudo guardar el presupuesto')
    } finally {
      setGuardando(false)
    }
  }

  // Enter en un campo pasa al que sigue: en el teclado del celular es la tecla
  // "Siguiente", y así se completan los tres datos sin tocar la pantalla.
  const alEnter = (siguiente) => (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (siguiente) siguiente.current?.focus(); else e.currentTarget.blur()
  }

  if (hecho) {
    return <Listo presupuesto={hecho} onNuevo={reiniciar} onVer={() => navigate(`/presupuestos/${hecho.id}`)} />
  }

  /* Un renglón de mano de obra. Es una función que devuelve JSX y NO un
     componente declarado acá adentro: un componente definido dentro del render
     cambia de identidad en cada pasada y React lo remonta, lo que hace perder el
     foco del recuadro de cantidad a cada tecla. */
  const filaServicio = (s) => {
    const cantidad = cantidades[s.id] || 0
    const tildado = cantidad > 0
    const favorito = favServicios.has(s.id)
    return (
      <div
        key={s.id}
        data-servicio={s.id}
        style={{
          borderRadius: 'var(--radius-md)',
          background: tildado ? 'var(--status-active-bg)' : 'transparent',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {/* El renglón entero tilda: es más fácil de acertar con el pulgar
              que un cuadradito. */}
          <button
            type="button"
            onClick={() => toggleServicio(s.id)}
            aria-pressed={tildado}
            style={{
              flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12,
              minHeight: 52, padding: '8px 4px 8px 12px', border: 'none', background: 'transparent',
              cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-body)',
            }}
          >
            <span style={{
              flexShrink: 0, width: 24, height: 24, borderRadius: 7, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              border: `2px solid ${tildado ? 'var(--status-active-fg)' : 'var(--border-strong)'}`,
              background: tildado ? 'var(--status-active-fg)' : 'var(--surface-card)', color: '#fff',
            }}>
              {tildado && <Icon n="check" s={16} />}
            </span>
            <span style={{ flex: 1, fontSize: 15, lineHeight: 1.3, color: 'var(--text-strong)', fontWeight: tildado ? 600 : 400 }}>
              {s.descripcion}
            </span>
            {cantidad > 1 && (
              <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, color: 'var(--status-active-fg)' }}>×{cantidad}</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => toggleFavorito(s.id)}
            title={favorito ? 'Sacar de los de todos los días' : 'Marcar como de todos los días (queda arriba)'}
            aria-label={favorito ? 'Sacar de favoritos' : 'Marcar como favorito'}
            aria-pressed={favorito}
            style={{
              flexShrink: 0, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: favorito ? 'var(--status-aviso-fg)' : 'var(--neutral-300)',
            }}
          >
            <Icon n="star" s={18} style={{ fill: favorito ? 'currentColor' : 'none' }} />
          </button>
        </div>
        {/* La cantidad aparece recién con el trabajo tildado. Los atajos FIJAN
            (no suman, como en el wizard): tocar "6" quiere decir "son seis". */}
        {tildado && (
          <div style={{ padding: '0 12px 12px 48px' }}>
            <ContadorServicio
              cantidad={cantidad}
              onChange={(n) => cambiarCantidad(s.id, n)}
              opciones={atajos}
              modo="fijar"
            />
          </div>
        )}
      </div>
    )
  }

  const fichaCategoria = (c) => {
    const elegida = categoriasSel.includes(c.prefijo)
    return (
      <button
        key={c.prefijo}
        type="button"
        onClick={() => toggleCategoria(c.prefijo)}
        aria-pressed={elegida}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '8px 14px',
          borderRadius: 999, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 14,
          fontWeight: 600, lineHeight: 1.2, textAlign: 'left',
          border: `1px solid ${elegida ? 'var(--status-active-fg)' : 'var(--border-default)'}`,
          background: elegida ? 'var(--status-active-fg)' : 'var(--surface-card)',
          color: elegida ? '#fff' : 'var(--text-strong)',
        }}
      >
        {elegida && <Icon n="check" s={14} />}
        {c.nombre}
      </button>
    )
  }

  return (
    <div className="rapido-pantalla" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PageHeader
        title="Presupuesto rápido"
        subtitle="Cliente, motor y lo que hay que hacerle. El precio, si ya lo sabés."
        actions={
          <>
            <Button variant="secondary" size="sm" iconLeft={<Icon n="arrow-left" s={16} />} onClick={() => navigate('/presupuestos')}>
              Volver
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/presupuestos/nuevo')}>
              Presupuesto completo
            </Button>
          </>
        }
      />

      <ErrorBanner message={error} onClose={() => setError('')} />

      {recuperado && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
          padding: '10px 14px', background: 'var(--status-aviso-bg)', color: 'var(--status-aviso-fg)',
          borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
        }}>
          <span>Recuperé lo que estabas cargando{nombreMotor ? ` (${nombreMotor})` : ''}.</span>
          <button
            type="button"
            onClick={reiniciar}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer', padding: '6px 0',
              color: 'var(--status-aviso-fg)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
              fontWeight: 700, textDecoration: 'underline',
            }}
          >
            Empezar de cero
          </button>
        </div>
      )}

      {/* ── Cliente y motor ──────────────────────────────────────────────── */}
      <section style={tarjeta}>
        <div className="rapido-datos">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <label style={eyebrow} htmlFor="rapido-cliente">Cliente</label>
            <TextField
              id="rapido-cliente"
              ref={refCliente}
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              onKeyDown={alEnter(refTelefono)}
              placeholder={CLIENTE_POR_DEFECTO}
              autoComplete="off"
              autoCapitalize="words"
              enterKeyHint="next"
              style={campoAlto}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <label style={eyebrow} htmlFor="rapido-telefono">Teléfono (opcional)</label>
            <TextField
              id="rapido-telefono"
              ref={refTelefono}
              type="tel"
              inputMode="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              onKeyDown={alEnter(refMotor)}
              placeholder="Ej: 11 2345 6789"
              autoComplete="off"
              enterKeyHint="next"
              style={campoAlto}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, position: 'relative' }}>
            <label style={eyebrow} htmlFor="rapido-motor">Motor</label>
            {motor ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, padding: '6px 6px 6px 14px',
                border: '1px solid var(--status-active-fg)', borderRadius: 'var(--radius-md)',
                background: 'var(--status-active-bg)',
              }}>
                <Icon n="check" s={16} style={{ color: 'var(--status-active-fg)', flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600, color: 'var(--text-strong)' }}>{motor.motor}</span>
                  <span style={textoChico}>De la lista de la Cámara</span>
                </span>
                <button
                  type="button"
                  onClick={() => { setMotor(null); setTimeout(() => refMotor.current?.focus(), 0) }}
                  title="Escribirlo a mano en vez de usar el de la lista"
                  aria-label="Quitar el motor de la lista"
                  style={{
                    flexShrink: 0, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)',
                  }}
                >
                  <Icon n="x" s={18} />
                </button>
              </div>
            ) : (
              <TextField
                id="rapido-motor"
                ref={refMotor}
                value={motorTexto}
                onChange={(e) => setMotorTexto(e.target.value)}
                onKeyDown={alEnter(null)}
                onFocus={() => { motorEnfocado.current = true; setEscribiendoMotor(true) }}
                onBlur={() => {
                  // Se cierra con una demora: en algunos teléfonos el campo
                  // pierde el foco ANTES de que llegue el toque a la sugerencia,
                  // y si la lista se cerrara en el acto el toque caería en el vacío.
                  motorEnfocado.current = false
                  setTimeout(() => { if (!motorEnfocado.current) setEscribiendoMotor(false) }, 200)
                }}
                placeholder="Ej: Ford 292 V8"
                autoComplete="off"
                // Se guarda en mayúsculas, como los de la lista de la Cámara: el
                // teclado ya sale así y el campo lo muestra como va a quedar.
                autoCapitalize="characters"
                enterKeyHint="done"
                style={{ ...campoAlto, textTransform: 'uppercase' }}
              />
            )}
            {/* Las sugerencias son una ayuda, no un paso: el motor queda como
                se escribió salvo que se toque una. onPointerDown evita que el
                campo pierda el foco antes del click (si no, la lista se cierra
                y el toque cae en el vacío). */}
            {!motor && escribiendoMotor && sugerencias.length > 0 && (
              <div style={{
                display: 'flex', flexDirection: 'column', marginTop: 2, padding: 6,
                border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
                background: 'var(--surface-card)', boxShadow: 'var(--shadow-sm)',
              }}>
                <span style={{ ...eyebrow, letterSpacing: '.08em', padding: '4px 8px' }}>¿Es uno de la lista? (opcional)</span>
                {sugerencias.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => elegirMotor(m)}
                    style={{
                      minHeight: 44, padding: '8px 10px', border: 'none', borderRadius: 10, cursor: 'pointer',
                      background: 'transparent', textAlign: 'left', fontFamily: 'var(--font-body)', fontSize: 14,
                      color: 'var(--text-strong)',
                    }}
                  >
                    {m.motor}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Los cilindros del motor. No entran en el presupuesto: lo único que
            hacen es decidir qué números ofrecen los atajos de cada renglón
            (ver atajosDeCantidad). */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ ...eyebrow, marginRight: 4 }}>Cilindros</span>
          {CILINDROS.map((n) => (
            <BotonSegmento
              key={n}
              activo={cilindros === n}
              onClick={() => setCilindros(n)}
              title={`Motor de ${n} cilindros: los atajos pasan a ser ${atajosDeCantidad(n).join(' / ')}`}
            >
              {n}
            </BotonSegmento>
          ))}
        </div>
      </section>

      <div className="rapido-grid">
        {/* ── Mano de obra ─────────────────────────────────────────────── */}
        <section style={tarjeta}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={eyebrow}>Mano de obra</span>
            {cantidadTrabajos > 0 && (
              <span style={contador}>
                {cantidadTrabajos} {cantidadTrabajos === 1 ? 'trabajo' : 'trabajos'}
              </span>
            )}
          </div>
          <SearchInput
            icon={<Icon n="search" s={16} />}
            placeholder="Buscar trabajo (ej: cigüeñal)…"
            value={buscarServicio}
            onChange={(e) => setBuscarServicio(e.target.value)}
            width="100%"
            enterKeyHint="search"
          />
          {/* Arriba y no al pie: sin favoritos la lista son más de doscientos
              renglones, y un consejo al final no lo lee nadie. */}
          {sinFavoritos && servicios.length > 0 && !hayBusquedaServicio && (
            <span style={textoChico}>
              Tocá la estrella <Icon n="star" s={12} style={{ display: 'inline', verticalAlign: '-1px' }} /> de los
              trabajos que más hacés: quedan arriba y la lista se achica.
            </span>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {serviciosArriba.map(filaServicio)}
            {serviciosArriba.length > 0 && serviciosResto.length > 0 && (
              <div style={{ ...eyebrow, letterSpacing: '.08em', textAlign: 'center', padding: '10px 0 4px' }}>
                Resto de la lista de la Cámara
              </div>
            )}
            {serviciosResto.map(filaServicio)}
            {serviciosVisibles.length === 0 && (
              <div style={vacio}>
                {servicios.length === 0 ? 'Cargando la lista…' : `No hay trabajos con "${buscarServicio}".`}
              </div>
            )}
          </div>
          {serviciosOcultos > 0 && (
            <Button variant="secondary" fullWidth onClick={() => setVerTodosServicios(true)}>
              Ver toda la lista ({serviciosOcultos} más)
            </Button>
          )}
          {verTodosServicios && !hayBusquedaServicio && !sinFavoritos && (
            <Button variant="ghost" fullWidth onClick={() => setVerTodosServicios(false)}>
              Mostrar sólo los de todos los días
            </Button>
          )}
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          {/* ── Repuestos ──────────────────────────────────────────────── */}
          <section style={tarjeta}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span style={eyebrow}>Repuestos que lleva (opcional)</span>
              {categoriasSel.length > 0 && (
                <span style={contador}>
                  {categoriasSel.length} {categoriasSel.length === 1 ? 'repuesto' : 'repuestos'}
                </span>
              )}
            </div>
            <SearchInput
              icon={<Icon n="search" s={16} />}
              placeholder="Buscar repuesto (ej: aros)…"
              value={buscarCategoria}
              onChange={(e) => setBuscarCategoria(e.target.value)}
              width="100%"
              enterKeyHint="search"
            />
            {categoriasOrdenadas.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {categoriasOrdenadas.map(fichaCategoria)}
              </div>
            )}
            {hayBusquedaCategoria && categoriasOrdenadas.length === 0 && (
              <div style={vacio}>No hay repuestos con "{buscarCategoria}".</div>
            )}
            {categorias.length === 0 && (
              <div style={vacio}>Todavía no se importó el catálogo del proveedor.</div>
            )}
            {!hayBusquedaCategoria && categorias.length > 0 && (
              <Button variant="ghost" fullWidth onClick={() => setVerTodasCategorias((v) => !v)}>
                {verTodasCategorias ? 'Mostrar menos' : `Ver todas las categorías (${categorias.length})`}
              </Button>
            )}
            <span style={textoChico}>
              Van por categoría y sin precio: en el PDF el cliente lee "Aros", no el código.
            </span>
          </section>

          {/* ── Notas ──────────────────────────────────────────────────── */}
          <section style={tarjeta}>
            <label style={eyebrow} htmlFor="rapido-notas">Notas (opcional)</label>
            <TextField
              as="textarea"
              id="rapido-notas"
              rows={2}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ej: trae la tapa aparte, viene sin cárter…"
              autoCapitalize="sentences"
            />
            <span style={textoChico}>Las ve la oficina y el taller, en la orden de trabajo. El cliente no.</span>
          </section>

          {/* ── Al taller ──────────────────────────────────────────────── */}
          <section style={{ ...tarjeta, gap: 4 }}>
            <Interruptor
              prendido={aprobado}
              onCambiar={setAprobado}
              icono={<Icon n="hard-hat" s={20} />}
              titulo="Ya lo aprobó: mandarlo al taller"
              ayuda="Entra al panel del taller en «Para hacer»."
            />
            {aprobado && (
              <>
                <Interruptor
                  prendido={urgente}
                  onCambiar={setUrgente}
                  icono={<Icon n="flame" s={20} />}
                  titulo="Urgente"
                  ayuda="En el taller va arriba de todo."
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '8px 4px' }}>
                  <Icon n="calendar" s={20} style={{ color: entrega ? 'var(--text-strong)' : 'var(--text-faint)' }} />
                  <label htmlFor="rapido-entrega" style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600, color: 'var(--text-strong)', flex: 1 }}>
                    Para cuándo se lo prometiste
                  </label>
                  <TextField
                    id="rapido-entrega"
                    type="date"
                    value={entrega}
                    onChange={(e) => setEntrega(e.target.value)}
                    style={{ ...campoAlto, width: 170 }}
                  />
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      {/* ── La barra de abajo: el precio y el botón, siempre a la vista ──────
          Es la tarjeta negra de antes, que estaba arriba para no tener que bajar
          a mirar el precio mientras se tilda. Fija abajo cumple lo mismo mejor:
          se ve desde cualquier parte de la pantalla, también en el celular. */}
      <div className="rapido-barra">
        <div className="rapido-barra-info">
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'rgba(255,255,255,.7)' }}>
            {motivoBloqueo || `${cantidadTrabajos} ${cantidadTrabajos === 1 ? 'trabajo' : 'trabajos'}`
              + ` · ${categoriasSel.length} ${categoriasSel.length === 1 ? 'repuesto' : 'repuestos'}`
              + (totalFinal === null ? ' · sin precio: queda a cotizar' : '')}
          </span>
          {referenciaManoObra !== null && cantidadTrabajos > 0 && (
            <span
              title="Lo que da la mano de obra tildada según la lista de la Cámara. Es una referencia: no incluye repuestos y no sale en el PDF."
              style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'rgba(255,255,255,.7)' }}
            >
              Lista: <strong style={{ color: '#fff' }}>{formatPrecioARS(referenciaManoObra)}</strong>
            </span>
          )}
        </div>
        <div className="rapido-barra-accion">
          {/* Mientras se escribe se ve lo tipeado; al salir, el número ya
              formateado ("$ 1.350.000"), que es como se lee de un vistazo. */}
          <CampoMonto
            id="rapido-total"
            className="rapido-total"
            valor={totalFinal !== null && !precioInvalido ? formatPrecioARS(totalFinal) : totalTexto}
            onEscribir={setTotalTexto}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
            inputMode="numeric"
            enterKeyHint="done"
            placeholder="$ Precio final"
            aria-label="Precio final"
            title="El total que va a leer el cliente. Se guarda tal cual. Vacío: queda a cotizar."
            style={{
              flex: 1, minWidth: 0, height: 50, textAlign: 'right', fontWeight: 700, fontSize: 18,
              // Siempre con color de borde (ver ContadorServicio): sacarlo cuando
              // el precio vuelve a ser válido dejaría el borde del color del texto.
              borderColor: precioInvalido ? 'var(--status-expired-fg)' : 'var(--border-default)',
            }}
          />
          <Button
            variant="success"
            size="lg"
            iconLeft={<Icon n="check" s={18} />}
            disabled={!puedeGuardar || guardando}
            onClick={guardar}
            style={{ flexShrink: 0 }}
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ── LISTO ───────────────────────────────────────────────────────────────────
   Lo que queda en pantalla después de guardar: qué se guardó y las tres cosas
   que se hacen con el cliente adelante — mandarle el presupuesto por WhatsApp,
   compartirle el PDF, y arrancar con el que sigue. */
function Listo({ presupuesto, onNuevo, onVer }) {
  const [pdf, setPdf] = React.useState(null)       // {version, blob}
  const [aviso, setAviso] = React.useState('')
  const numero = `#${String(presupuesto.id).padStart(4, '0')}`
  const sinPrecio = presupuesto.total === null || presupuesto.total === undefined

  // El PDF se baja apenas se muestra esta pantalla, para que "Compartir" ande
  // en el iPhone (ver utils/compartirPdf.js).
  React.useEffect(() => {
    let vigente = true
    api.get(`/presupuestos/${presupuesto.id}/pdfs`)
      .then(async (lista) => {
        const version = lista?.[0]?.version
        if (!version) return
        const blob = await bajarPdf(presupuesto.id, version)
        if (vigente) setPdf({ version, blob })
      })
      .catch(() => {})
    return () => { vigente = false }
  }, [presupuesto.id])

  const nombre = nombreArchivoPdf(presupuesto.id, presupuesto.cliente)
  const compartir = async () => {
    if (!pdf) return
    setAviso(await compartirPdf({
      blob: pdf.blob, nombre, urlDescarga: `/api/presupuestos/${presupuesto.id}/pdf/${pdf.version}?descargar=1`,
    }))
  }

  // El mensaje de WhatsApp dice lo mismo que el PDF, en texto: alcanza solo
  // aunque no se mande el archivo.
  const lineasTrabajos = presupuesto.trabajos.map((t) => `• ${t.descripcion}${t.cantidad > 1 ? ` ×${t.cantidad}` : ''}`)
  const mensaje = [
    saludo(presupuesto.cliente),
    sinPrecio
      ? `Recibimos el motor ${presupuesto.motor} (Nº ${String(presupuesto.id).padStart(4, '0')}). Lo que hay que hacerle:`
      : `Te paso el presupuesto Nº ${String(presupuesto.id).padStart(4, '0')} del motor ${presupuesto.motor}:`,
    ...lineasTrabajos,
    ...(presupuesto.repuestos.length ? [`Repuestos: ${presupuesto.repuestos.join(', ')}`] : []),
    sinPrecio
      ? 'El precio te lo confirmamos cuando lo revisemos.'
      : `Total: ${formatPrecioARS(presupuesto.total)} (vale por 7 días)`,
  ].join('\n')
  const telefono = presupuesto.cliente_telefono

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560, width: '100%', margin: '0 auto' }}>
      <section style={{ ...tarjeta, alignItems: 'center', textAlign: 'center', gap: 8, padding: '28px 20px' }}>
        <span style={{ color: 'var(--status-active-fg)', display: 'flex' }}><Icon n="circle-check" s={52} /></span>
        <h1 style={{ margin: '6px 0 0', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24, color: 'var(--text-strong)' }}>
          Presupuesto {numero} guardado
        </h1>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--text-body)' }}>
          {presupuesto.cliente} · {presupuesto.motor}
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 30, color: 'var(--text-strong)', marginTop: 4 }}>
          {sinPrecio ? 'A cotizar' : formatPrecioARS(presupuesto.total)}
        </div>
        {presupuesto.aprobado_en && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 }}>
            <span style={pildora('var(--trabajo-aprobado-bg)', 'var(--trabajo-aprobado-fg)')}>
              <Icon n="hard-hat" s={13} /> En el taller: Para hacer
            </span>
            {Boolean(presupuesto.prioridad) && (
              <span style={pildora('var(--trabajo-urgente-bg)', 'var(--trabajo-urgente-fg)')}>
                <Icon n="flame" s={13} /> Urgente
              </span>
            )}
            {presupuesto.entrega_prometida && (
              <span style={pildora('var(--surface-sunken)', 'var(--text-body)')}>
                <Icon n="calendar" s={13} /> Entrega {formatFechaAR(presupuesto.entrega_prometida)}
              </span>
            )}
          </div>
        )}
      </section>

      {aviso && (
        <div style={{ padding: '10px 14px', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-body)' }}>
          {aviso}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Un <a> y no un window.open: en el celular abre la app de WhatsApp
            directo, y no cuenta como ventana emergente. Con la pinta del botón
            verde, pero es un link: un <button> adentro de un <a> no navega en
            todos los navegadores. */}
        <a
          href={enlaceWhatsApp(telefono, mensaje)}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, height: 50,
            padding: '0 24px', borderRadius: 'var(--radius-md)', textDecoration: 'none',
            fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-md)',
            background: 'var(--status-active-fg)', color: '#fff', boxShadow: 'var(--shadow-sm)',
          }}
        >
          <Icon n="message-circle" s={18} />
          {telefono ? 'Mandárselo por WhatsApp' : 'Mandar por WhatsApp'}
        </a>
        <Button variant="secondary" size="lg" fullWidth iconLeft={<Icon n="share" s={18} />} disabled={!pdf} onClick={compartir}>
          {pdf ? 'Compartir el PDF' : 'Preparando el PDF…'}
        </Button>
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          iconLeft={<Icon n="eye" s={18} />}
          disabled={!pdf}
          onClick={() => window.open(`/api/presupuestos/${presupuesto.id}/pdf/${pdf.version}`, '_blank')}
        >
          Ver el PDF
        </Button>
        <Button variant="primary" size="lg" fullWidth iconLeft={<Icon n="plus" s={18} />} onClick={onNuevo} style={{ marginTop: 6 }}>
          Nuevo presupuesto rápido
        </Button>
        <Button variant="ghost" fullWidth onClick={onVer}>
          Ver el presupuesto completo
        </Button>
      </div>
      {!telefono && (
        <span style={{ ...textoChico, textAlign: 'center' }}>
          Sin teléfono cargado, WhatsApp se abre para que elijas el chat.
        </span>
      )}
    </div>
  )
}

function pildora(bg, fg) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px',
    borderRadius: 'var(--radius-pill)', fontFamily: 'var(--font-body)',
    fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-xs)', background: bg, color: fg,
  }
}
