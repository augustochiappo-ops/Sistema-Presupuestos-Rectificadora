import React from 'react'
import { api } from '../../api/client'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { StatusBadge } from '../../components/StatusBadge'
import { MotorSelector } from '../../components/MotorSelector'
import { RepuestoPicker } from '../../components/RepuestoPicker'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { formatPrecioARS } from '../../utils/format'

const tituloSeccion = {
  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
  letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-faint)',
}

/*
 * Ficha de repuestos del motor: qué piezas sirven para este motor, agrupadas
 * por categoría del proveedor. Reemplaza a las viejas "sugerencias" deducidas
 * del historial de presupuestos — acá la asociación la carga el taller y no
 * depende de haber cotizado nada.
 *
 * La ficha está viva: precio, stock y marca salen del catálogo de hoy. Lo único
 * propio que guarda de cada opción es la cantidad (cuántos envases hacen falta,
 * que cambia según cómo venga envasada esa marca).
 */
export function FichaRepuestos({ motor }) {
  const [ficha, setFicha] = React.useState([])
  const [cargando, setCargando] = React.useState(true)
  const [editando, setEditando] = React.useState(false)
  const [modalCopiar, setModalCopiar] = React.useState(false)
  const [aQuitar, setAQuitar] = React.useState(null)
  const [aviso, setAviso] = React.useState('')

  const cargar = React.useCallback(() => {
    setCargando(true)
    api.get(`/motores/${motor.id}/ficha-repuestos`)
      .then(setFicha)
      .catch(() => {})
      .finally(() => setCargando(false))
  }, [motor.id])

  React.useEffect(() => { cargar() }, [cargar])

  const guardar = async (grupos) => {
    const payload = grupos.map((g) => ({
      categoria: g.categoria,
      cat_prefijo: g.cat_prefijo,
      opciones: g.opciones.map((o) => ({ codigo: o.codigo, cantidad: o.cantidad })),
    }))
    const nueva = await api.put(`/motores/${motor.id}/ficha-repuestos`, { grupos: payload })
    setFicha(nueva)
  }

  const cantidadPorCodigo = React.useMemo(() => {
    const m = new Map()
    ficha.forEach((g) => g.opciones.forEach((o) => m.set(o.codigo, o.cantidad)))
    return m
  }, [ficha])

  // Agregar desde el catálogo: mismo agrupado automático que en el wizard — lo
  // que se tilda dentro de una categoría entra al grupo de esa categoría.
  const agregar = async (rep, cantidad, origen = 'click') => {
    const categoria = rep.categoria
    if (!categoria) {
      setAviso('Ese repuesto no tiene categoría en el catálogo, así que no se puede agrupar.')
      return
    }
    const copia = ficha.map((g) => ({ ...g, opciones: [...g.opciones] }))
    let grupo = copia.find((g) => g.categoria === categoria)
    if (!grupo) {
      grupo = { categoria, cat_prefijo: rep.cat_prefijo, opciones: [] }
      copia.push(grupo)
    }
    const existente = grupo.opciones.find((o) => o.codigo === rep.codigo)
    if (existente) {
      if (cantidad <= 0) grupo.opciones = grupo.opciones.filter((o) => o.codigo !== rep.codigo)
      else existente.cantidad = cantidad
    } else {
      if (cantidad <= 0) return
      // Cantidad heredada del grupo, salvo que se haya elegido una a propósito.
      const heredada = grupo.opciones.length ? grupo.opciones[0].cantidad : cantidad
      grupo.opciones.push({ codigo: rep.codigo, cantidad: origen === 'exacto' ? cantidad : heredada })

      if (rep.medida) {
        try {
          const hermanas = await api.get(`/repuestos/medidas?codigo=${encodeURIComponent(rep.codigo)}`)
          const yaEstan = new Set(grupo.opciones.map((o) => o.codigo))
          hermanas.forEach((h) => {
            if (!yaEstan.has(h.codigo)) {
              grupo.opciones.push({ codigo: h.codigo, cantidad: origen === 'exacto' ? cantidad : heredada })
            }
          })
        } catch { /* si falla, queda solo la medida elegida */ }
      }
    }
    await guardar(copia.filter((g) => g.opciones.length))
  }

  const cambiarCantidad = async (categoria, codigo, cantidad) => {
    if (!(cantidad > 0)) return
    const copia = ficha.map((g) => ({
      ...g,
      opciones: g.opciones.map((o) => (g.categoria === categoria && o.codigo === codigo ? { ...o, cantidad } : o)),
    }))
    await guardar(copia)
  }

  const quitarOpcion = async ({ categoria, codigo }) => {
    const copia = ficha
      .map((g) => ({ ...g, opciones: g.opciones.filter((o) => !(g.categoria === categoria && o.codigo === codigo)) }))
      .filter((g) => g.opciones.length)
    await guardar(copia)
    setAQuitar(null)
  }

  const quitarGrupo = async (categoria) => {
    await guardar(ficha.filter((g) => g.categoria !== categoria))
  }

  const copiarDesde = async (origen) => {
    setModalCopiar(false)
    try {
      const nueva = await api.post(`/motores/${motor.id}/ficha-repuestos/copiar-de/${origen.id}`)
      setFicha(nueva)
      setAviso(`Se trajo la ficha de ${origen.motor}.`)
    } catch (err) {
      setAviso(err.message || 'No se pudo copiar la ficha')
    }
  }

  const totalOpciones = ficha.reduce((acc, g) => acc + g.opciones.length, 0)

  return (
    <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', background: 'var(--surface-card)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={tituloSeccion}>
          Ficha de repuestos · {ficha.length} grupo{ficha.length === 1 ? '' : 's'} · {totalOpciones} opcion{totalOpciones === 1 ? '' : 'es'}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="sm" iconLeft={<Icon n="copy" s={14} />} onClick={() => setModalCopiar(true)}>
            Copiar desde otro motor
          </Button>
          <Button
            variant={editando ? 'primary' : 'secondary'}
            size="sm"
            iconLeft={<Icon n={editando ? 'check' : 'pencil'} s={14} />}
            onClick={() => setEditando((v) => !v)}
          >
            {editando ? 'Listo' : 'Editar'}
          </Button>
        </div>
      </div>

      {aviso && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 12px', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
          {aviso}
          <button onClick={() => setAviso('')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }}>
            <Icon n="x" s={14} />
          </button>
        </div>
      )}

      {cargando && (
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>Cargando ficha…</div>
      )}

      {!cargando && ficha.length === 0 && (
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
          Este motor todavía no tiene repuestos cargados. Se cargan solos al confirmar un presupuesto, o los podés
          agregar acá con "Editar" — o traer los de otro motor parecido.
        </div>
      )}

      {ficha.map((g) => {
        const masCara = g.opciones.find((o) => o.codigo === g.elegida_codigo)
        return (
          <div key={g.categoria} style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--surface-sunken)', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-strong)' }}>
                {g.categoria}
              </span>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-faint)' }}>
                {g.opciones.length} opcion{g.opciones.length === 1 ? '' : 'es'}
              </span>
              {masCara && (
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-muted)' }}>
                  Hoy cotizaría <strong>{formatPrecioARS(masCara.subtotal)}</strong>
                </span>
              )}
              {editando && (
                <button
                  onClick={() => quitarGrupo(g.categoria)}
                  title="Borrar todo el grupo"
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }}
                >
                  <Icon n="trash" s={15} />
                </button>
              )}
            </div>

            {g.opciones.map((o) => (
              <div key={o.codigo} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
                borderTop: '1px solid var(--border-subtle)',
                background: o.codigo === g.elegida_codigo ? 'var(--status-active-bg)' : undefined,
              }}>
                <span style={{ width: 150, flexShrink: 0, fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>
                  {o.codigo}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>
                  {o.descripcion || '—'}
                </span>
                <span style={{ width: 110, flexShrink: 0, fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-muted)' }}>
                  {o.marca || '—'}
                </span>
                <span style={{ width: 60, flexShrink: 0, fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-muted)' }}>
                  {o.medida || '—'}
                </span>
                {!o.en_catalogo && <StatusBadge status="expired">Fuera de lista</StatusBadge>}
                {o.en_catalogo && o.stock_actual === 0 && <StatusBadge status="expired">Sin stock</StatusBadge>}
                {o.codigo === g.elegida_codigo && <StatusBadge status="active">El más caro</StatusBadge>}

                {editando ? (
                  <input
                    type="number" min="1" step="1"
                    value={o.cantidad}
                    onChange={(e) => cambiarCantidad(g.categoria, o.codigo, parseFloat(e.target.value))}
                    title="Cuántos envases de esta marca hacen falta"
                    style={{
                      width: 60, height: 30, textAlign: 'center', borderRadius: 8,
                      border: '1px solid var(--border-default)', background: 'var(--surface-card)',
                      color: 'var(--text-strong)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                    }}
                  />
                ) : (
                  <span style={{ width: 60, textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                    ×{o.cantidad}
                  </span>
                )}

                <span style={{ width: 120, textAlign: 'right', flexShrink: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                  {o.precio_actual ? formatPrecioARS(o.precio_actual) : '—'}
                </span>

                {editando && (
                  <button
                    onClick={() => setAQuitar({ categoria: g.categoria, codigo: o.codigo, descripcion: o.descripcion })}
                    title="Sacar de la ficha"
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }}
                  >
                    <Icon n="x" s={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )
      })}

      {editando && (
        <div style={{ marginTop: 6 }}>
          <RepuestoPicker
            sugeridos={[]}
            cantidadPorCodigo={cantidadPorCodigo}
            onAgregar={agregar}
            reorderKey="ficha-motor"
            ayudaFilas="Lo que agregues dentro de una categoría forma un grupo de este motor; las medidas se suman solas"
          />
        </div>
      )}

      <Modal open={modalCopiar} title="Copiar ficha desde otro motor" onClose={() => setModalCopiar(false)} maxWidth={1000}>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 12 }}>
          Elegí el motor del que querés traer los repuestos. Se suman a lo que este motor ya tenga, sin pisar nada.
        </div>
        <MotorSelector onSelect={copiarDesde} />
      </Modal>

      <ConfirmDialog
        open={!!aQuitar}
        title="¿Sacar este repuesto de la ficha?"
        message={aQuitar ? `${aQuitar.descripcion || aQuitar.codigo} deja de estar asociado a ${motor.motor}. No afecta a los presupuestos ya hechos.` : ''}
        confirmLabel="Sacar"
        danger
        onCancel={() => setAQuitar(null)}
        onConfirm={() => quitarOpcion(aQuitar)}
      />
    </div>
  )
}
