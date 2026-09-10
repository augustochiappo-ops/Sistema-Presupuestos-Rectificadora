import React from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { PageHeader } from '../../components/PageHeader'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { ErrorBanner } from '../../components/ErrorBanner'
import { TextField } from '../../components/TextField'
import { SearchInput } from '../../components/SearchInput'
import { MotorSelector } from '../../components/MotorSelector'
import { ContadorServicio } from '../../components/ContadorServicio'
import { CampoMonto } from '../../components/CampoMonto'
import { useCategorias } from '../../hooks/useCategorias'
import { coincideBusqueda } from '../../utils/texto'
import { aPesos, formatPrecioARS, parsePrecioARS } from '../../utils/format'

/*
 * PRESUPUESTO RÁPIDO — el atajo para cuando el presupuesto ya está resuelto en
 * la cabeza y lo único que falta es emitirlo.
 *
 * Es el mismo presupuesto de siempre (mismo endpoint, misma tabla, mismo PDF,
 * se edita y se aprueba igual); lo que cambia es cuánto cuesta cargarlo:
 *
 *   - El cliente es opcional y no se pregunta si es mecánico o dueño.
 *   - Los repuestos se tildan POR CATEGORÍA ("Aros", "Cojinetes de biela"), sin
 *     buscar código por código. Van sin precio a propósito: el número que se le
 *     dice al cliente lo escribe el dueño abajo.
 *   - El total NO es la suma de los renglones: es el que se escribe a mano y
 *     viaja al backend como `total_manual` (ver db.total_guardado). Por eso acá
 *     no hay ajuste %, ni precios editables por línea, ni caja de opcionales:
 *     todo eso son formas de llegar a un total que acá ya está decidido.
 *
 * El PDF no cambia ni hace falta que cambie: sus dos tablas nunca imprimieron
 * precios por renglón — el número sale una sola vez, en el TOTAL.
 *
 * El wizard de cinco pasos sigue siendo el camino cuando hace falta cotizar de
 * verdad: precios por renglón, códigos concretos para el pedido y opcionales.
 */

const tituloSeccion = {
  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
  letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-faint)',
}

const cajaLista = {
  border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)',
  background: 'var(--surface-card)', maxHeight: 520, overflow: 'auto', padding: '8px 0',
}

const separador = {
  textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 11,
  color: 'var(--text-faint)', padding: '10px 0',
}

const tildeFila = { width: 16, height: 16, pointerEvents: 'none', margin: 0 }

const vacio = {
  padding: '32px 0', textAlign: 'center', color: 'var(--text-faint)',
  fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
}

// Cliente vacío: el presupuesto se emite igual y queda colgado de esta ficha.
// El endpoint sigue pidiendo un nombre (no se le cambió el contrato), así que
// el default se resuelve acá, en la única pantalla que lo permite en blanco.
const CLIENTE_POR_DEFECTO = 'Consumidor final'

export default function PresupuestoRapido() {
  const navigate = useNavigate()
  const [motor, setMotor] = React.useState(null)
  const [cliente, setCliente] = React.useState('')

  const [servicios, setServicios] = React.useState([])
  const [favServicios, setFavServicios] = React.useState(new Set())
  const [cantidades, setCantidades] = React.useState({})
  const [buscarServicio, setBuscarServicio] = React.useState('')

  const categorias = useCategorias()
  const [favCategorias, setFavCategorias] = React.useState(new Set())
  const [categoriasSel, setCategoriasSel] = React.useState([])
  const [buscarCategoria, setBuscarCategoria] = React.useState('')

  const [totalTexto, setTotalTexto] = React.useState('')
  const [error, setError] = React.useState('')
  const [guardando, setGuardando] = React.useState(false)

  React.useEffect(() => {
    if (!motor?.id) { setServicios([]); return }
    api.get(`/motores/${motor.id}/servicios`).then(setServicios).catch(() => setServicios([]))
  }, [motor?.id])

  React.useEffect(() => {
    api.get('/servicios/favoritos').then((ids) => setFavServicios(new Set(ids))).catch(() => {})
    api.get('/repuestos/categorias/favoritos').then((ids) => setFavCategorias(new Set(ids))).catch(() => {})
  }, [])

  const elegirMotor = (m) => {
    // Los tildes de mano de obra son de la lista de ESE motor: si cambia el
    // motor, no significan lo mismo y se van. Las categorías de repuestos sí
    // sobreviven — son del catálogo del proveedor, no de la lista de la Cámara.
    if (motor && m.id !== motor.id) setCantidades({})
    setMotor(m)
  }

  const cambiarCantidad = (id, n) => {
    setCantidades((prev) => {
      const siguiente = { ...prev }
      if (n > 0) siguiente[id] = n; else delete siguiente[id]
      return siguiente
    })
  }

  const toggleServicio = (id) => cambiarCantidad(id, cantidades[id] > 0 ? 0 : 1)

  const toggleCategoria = (prefijo) => {
    setCategoriasSel((prev) => (
      prev.includes(prefijo) ? prev.filter((p) => p !== prefijo) : [...prev, prefijo]
    ))
  }

  const serviciosFiltrados = servicios.filter(
    (s) => coincideBusqueda([String(s.item_num), s.descripcion], buscarServicio),
  )
  const serviciosFav = serviciosFiltrados.filter((s) => favServicios.has(s.id))
  const serviciosResto = serviciosFiltrados.filter((s) => !favServicios.has(s.id))

  const categoriasFiltradas = categorias.filter((c) => coincideBusqueda([c.nombre], buscarCategoria))
  const categoriasFav = categoriasFiltradas.filter((c) => favCategorias.has(c.prefijo))
  const categoriasResto = categoriasFiltradas.filter((c) => !favCategorias.has(c.prefijo))

  const elegidas = categorias.filter((c) => categoriasSel.includes(c.prefijo))
  const cantidadTildes = Object.keys(cantidades).length + categoriasSel.length

  /* Cuánto daría la mano de obra tildada según la lista. Es un dato al costado,
     para tenerlo a la vista antes de decidir el precio: NO es el total, no viaja
     al backend y no sale en el PDF. Los repuestos no suman acá porque en esta
     pantalla se tildan sin código, así que no tienen precio que sumar. */
  const referenciaManoObra = servicios.reduce(
    (acc, s) => acc + (aPesos(s.precio) || 0) * (cantidades[s.id] || 0), 0,
  )

  const totalFinal = parsePrecioARS(totalTexto)
  const puedeConfirmar = Boolean(motor) && cantidadTildes > 0 && totalFinal !== null && totalFinal >= 0

  const confirmar = async () => {
    if (!puedeConfirmar || guardando) return
    setGuardando(true)
    setError('')
    // La pestaña del PDF se abre DENTRO del click, antes del await: si se abre
    // después, el navegador la bloquea por popup (mismo truco que el wizard).
    const pdfTab = window.open('', '_blank')
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
        motor_id: motor.id,
        items,
        ajuste_pct: 0,
        total_manual: totalFinal,
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

  const FilaServicio = ({ s }) => {
    const cantidad = cantidades[s.id] || 0
    return (
      <div
        onClick={() => toggleServicio(s.id)}
        style={{
          display: 'grid', gridTemplateColumns: '22px 1fr auto', alignItems: 'center', gap: 10,
          padding: '10px 16px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
          background: cantidad > 0 ? 'var(--status-active-bg)' : 'transparent',
        }}
      >
        {/* El tilde lo maneja el renglón entero (es más fácil de acertar que
            un cuadradito de 14px): el checkbox solo muestra el estado. */}
        <input type="checkbox" checked={cantidad > 0} readOnly style={tildeFila} />
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>
          {s.descripcion}
        </span>
        {/* El contador aparece recién cuando el trabajo está tildado: la
            cantidad solo tiene sentido sobre algo que ya está adentro, y así la
            lista para tildar queda limpia de recuadros. */}
        {cantidad > 0
          ? <ContadorServicio cantidad={cantidad} onChange={(n) => cambiarCantidad(s.id, n)} />
          : <span />}
      </div>
    )
  }

  const FilaCategoria = ({ c }) => {
    const elegida = categoriasSel.includes(c.prefijo)
    return (
      <div
        onClick={() => toggleCategoria(c.prefijo)}
        style={{
          display: 'grid', gridTemplateColumns: '22px 1fr', alignItems: 'center', gap: 10,
          padding: '10px 16px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
          background: elegida ? 'var(--status-active-bg)' : 'transparent',
        }}
      >
        <input type="checkbox" checked={elegida} readOnly style={tildeFila} />
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>
          {c.nombre}
        </span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageHeader
        title="Presupuesto rápido"
        subtitle="Elegí el motor, tildá el trabajo y escribí el precio final"
        actions={
          <>
            <Button variant="secondary" iconLeft={<Icon n="arrow-left" s={16} />} onClick={() => navigate('/presupuestos')}>
              Volver
            </Button>
            {motor && (
              <Button variant="secondary" onClick={() => navigate('/presupuestos/nuevo')}>
                Ir al presupuesto completo
              </Button>
            )}
          </>
        }
      />

      <ErrorBanner message={error} onClose={() => setError('')} />

      {!motor && <MotorSelector onSelect={elegirMotor} />}

      {motor && (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            flexWrap: 'wrap', padding: '14px 18px', background: 'var(--surface-card)',
            border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', minWidth: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={tituloSeccion}>Motor</span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-strong)' }}>
                  {motor.motor}
                </span>
              </div>
              <Button variant="secondary" onClick={() => setMotor(null)}>Cambiar</Button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 240 }}>
              <label style={tituloSeccion} htmlFor="rapido-cliente">Cliente (opcional)</label>
              <TextField
                id="rapido-cliente"
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                placeholder={CLIENTE_POR_DEFECTO}
              />
            </div>
          </div>

          <div className="rapido-grid">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
              <div style={tituloSeccion}>Mano de obra</div>
              <SearchInput
                icon={<Icon n="search" s={16} />}
                placeholder="Buscar por número o descripción…"
                value={buscarServicio}
                onChange={(e) => setBuscarServicio(e.target.value)}
              />
              <div style={cajaLista}>
                {serviciosFav.map((s) => <FilaServicio key={s.id} s={s} />)}
                {serviciosFav.length > 0 && serviciosResto.length > 0 && (
                  <div style={separador}>─── Lista de la Cámara de Rectificadores ───</div>
                )}
                {serviciosResto.map((s) => <FilaServicio key={s.id} s={s} />)}
                {serviciosFiltrados.length === 0 && (
                  <div style={vacio}>No se encontraron servicios.</div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
              <div style={tituloSeccion}>Repuestos que se le ponen</div>
              <SearchInput
                icon={<Icon n="search" s={16} />}
                placeholder="Buscar categoría…"
                value={buscarCategoria}
                onChange={(e) => setBuscarCategoria(e.target.value)}
              />
              <div style={cajaLista}>
                {categoriasFav.map((c) => <FilaCategoria key={c.prefijo} c={c} />)}
                {categoriasFav.length > 0 && categoriasResto.length > 0 && (
                  <div style={separador}>─── Todas las categorías ───</div>
                )}
                {categoriasResto.map((c) => <FilaCategoria key={c.prefijo} c={c} />)}
                {categoriasFiltradas.length === 0 && (
                  <div style={vacio}>
                    {categorias.length === 0
                      ? 'Todavía no se importó el catálogo del proveedor.'
                      : `Sin categorías para "${buscarCategoria}".`}
                  </div>
                )}
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-faint)' }}>
                Van por categoría y sin precio: en el PDF el cliente lee "Aros", no el código.
                Si necesitás el código para el pedido, ese es el presupuesto completo.
              </div>
            </div>
          </div>

          <div style={{
            display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16,
            flexWrap: 'wrap', padding: '16px 20px', background: 'var(--surface-inverse)',
            borderRadius: 'var(--radius-xl)',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.65)' }}>
                Según la lista, solo la mano de obra
              </span>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-lg)', fontWeight: 600, color: '#fff' }}>
                {formatPrecioARS(referenciaManoObra)}
              </span>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'rgba(255,255,255,.55)' }}>
                Es al costado: no incluye repuestos y no sale en el PDF.
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.65)' }} htmlFor="rapido-total">
                  Precio final
                </label>
                <CampoMonto
                  id="rapido-total"
                  valor={totalTexto}
                  onEscribir={setTotalTexto}
                  placeholder="$ 0"
                  title="El total que va a leer el cliente. Se guarda tal cual: no es la suma de los renglones."
                  style={{ width: 190, textAlign: 'right', fontWeight: 600, fontSize: 'var(--text-md)' }}
                />
              </div>
              <Button
                variant="success"
                iconLeft={<Icon n="file-text" s={16} />}
                disabled={!puedeConfirmar || guardando}
                onClick={confirmar}
              >
                {guardando ? 'Generando…' : 'Generar presupuesto'}
              </Button>
            </div>
          </div>

          {cantidadTildes === 0 && (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-faint)', textAlign: 'center' }}>
              Tildá al menos un trabajo o un repuesto para poder emitirlo.
            </div>
          )}
        </>
      )}
    </div>
  )
}
