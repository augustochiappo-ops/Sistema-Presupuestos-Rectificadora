import React from 'react'
import { api } from '../../api/client'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { StatusBadge } from '../../components/StatusBadge'
import { MotorSelector } from '../../components/MotorSelector'
import { RepuestoPicker } from '../../components/RepuestoPicker'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { formatPrecioARS, formatFechaHoraAR, formatFechaAR } from '../../utils/format'
import { agruparPorFamilia } from '../../utils/grupos'
import { useUndo } from '../../context/UndoContext'

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
  const [papelera, setPapelera] = React.useState([])
  const [modalPapelera, setModalPapelera] = React.useState(false)
  const { avisarBorrado, borrarConDeshacer } = useUndo()

  const cargar = React.useCallback(() => {
    setCargando(true)
    api.get(`/motores/${motor.id}/ficha-repuestos`)
      .then(setFicha)
      .catch(() => {})
      .finally(() => setCargando(false))
    api.get(`/motores/${motor.id}/repuestos-eliminados`).then(setPapelera).catch(() => {})
  }, [motor.id])

  React.useEffect(() => { cargar() }, [cargar])

  const guardar = async (grupos) => {
    const payload = grupos.map((g) => ({
      categoria: g.categoria,
      cat_prefijo: g.cat_prefijo,
      opciones: g.opciones.map((o) => ({
        codigo: o.codigo, cantidad: o.cantidad, cantidad_manual: o.cantidad_manual,
      })),
    }))
    const nueva = await api.put(`/motores/${motor.id}/ficha-repuestos`, { grupos: payload })
    setFicha(nueva)
    // Todo lo que sale de la ficha va a la papelera del motor, así que hay que
    // volver a leerla después de cada guardado (agregar también la actualiza:
    // un código que vuelve a la ficha deja de estar eliminado).
    api.get(`/motores/${motor.id}/repuestos-eliminados`).then(setPapelera).catch(() => {})
  }

  const restaurar = async (codigos) => {
    try {
      const r = await api.post(`/motores/${motor.id}/repuestos-eliminados/restaurar`, { codigos })
      setFicha(r.ficha)
      setPapelera(r.papelera)
      setAviso(codigos.length === 1
        ? 'Repuesto restaurado a la ficha del motor.'
        : `${r.restaurados} repuestos restaurados a la ficha del motor.`)
      if (!r.papelera.length) setModalPapelera(false)
    } catch (err) {
      setAviso(err.message || 'No se pudo restaurar')
    }
  }

  /* Vaciar la papelera no se puede deshacer del lado del servidor, así que el
     DELETE sale recién cuando se apaga el cartel: hasta entonces la lista se ve
     vacía y "Deshacer" la devuelve entera. */
  const vaciarPapelera = () => {
    const antes = papelera
    setPapelera([])
    setModalPapelera(false)
    borrarConDeshacer({
      mensaje: `Se vació la lista de ${antes.length} repuesto${antes.length === 1 ? '' : 's'} eliminado${antes.length === 1 ? '' : 's'}.`,
      clave: `papelera:${motor.id}`,
      ejecutar: () => api.del(`/motores/${motor.id}/repuestos-eliminados`),
      onDeshacer: () => setPapelera(antes),
      onError: (err) => { setPapelera(antes); setAviso(err.message || 'No se pudo vaciar la lista') },
    })
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

  /* Escribir la cantidad a mano la FIJA: el recálculo automático (la cantidad
     que más se repite en los presupuestos del motor) no la vuelve a tocar.
     Queda marcada en pantalla para que se entienda por qué ese número no se
     mueve solo. */
  const cambiarCantidad = async (categoria, codigo, cantidad) => {
    if (!(cantidad > 0)) return
    const copia = ficha.map((g) => ({
      ...g,
      opciones: g.opciones.map((o) => (
        g.categoria === categoria && o.codigo === codigo
          ? { ...o, cantidad, cantidad_manual: true }
          : o
      )),
    }))
    await guardar(copia)
  }

  /* Saca una opción o toda una familia de medidas (STD, 025, 050…) de la ficha.
     Sin cartel de confirmación: sale el cartel de "Deshacer", y además lo
     borrado queda en la papelera del motor. Deshacer guarda la ficha como
     estaba, que es también lo que saca esos códigos de la papelera. */
  const quitarConDeshacer = async (nueva, mensaje) => {
    const antes = ficha
    await guardar(nueva)
    avisarBorrado({
      mensaje,
      onDeshacer: async () => {
        try {
          await guardar(antes)
        } catch (err) {
          setAviso(err.message || 'No se pudo deshacer')
        }
      },
    })
  }

  const quitarOpciones = async (categoria, codigos) => {
    const fuera = new Set(codigos)
    const copia = ficha
      .map((g) => ({ ...g, opciones: g.opciones.filter((o) => !(g.categoria === categoria && fuera.has(o.codigo))) }))
      .filter((g) => g.opciones.length)
    await quitarConDeshacer(copia, codigos.length === 1
      ? 'Se sacó el repuesto de la ficha del motor.'
      : `Se sacaron ${codigos.length} medidas de la ficha del motor.`)
  }

  const quitarGrupo = async (categoria) => {
    await quitarConDeshacer(
      ficha.filter((g) => g.categoria !== categoria),
      `Se sacó la categoría "${categoria}" de la ficha del motor.`,
    )
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {papelera.length > 0 && (
            <Button variant="secondary" size="sm" iconLeft={<Icon n="trash" s={14} />} onClick={() => setModalPapelera(true)}>
              Repuestos eliminados ({papelera.length})
            </Button>
          )}
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
                  onClick={() => setAQuitar({ categoria: g.categoria, cantidad: g.opciones.length })}
                  title={`Sacar toda la categoría "${g.categoria}" (${g.opciones.length} opciones)`}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }}
                >
                  <Icon n="trash" s={15} />
                </button>
              )}
            </div>

            {agruparPorFamilia(g.opciones.map((o) => ({ ...o, key: o.codigo }))).flatMap((familia) => [
              // Las medidas de un mismo repuesto entran juntas a la ficha; con
              // este renglón también salen juntas, sin arrastrar a las otras
              // marcas de la categoría.
              familia.esFamilia && editando ? (
                <div key={`fam-${familia.base}`} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px',
                  borderTop: '1px solid var(--border-subtle)',
                }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-faint)' }}>
                    {familia.base}{familia.marca ? ` · ${familia.marca}` : ''} · {familia.opciones.length} medidas
                  </span>
                  <button
                    onClick={() => quitarOpciones(g.categoria, familia.codigos)}
                    title={`Sacar las ${familia.opciones.length} medidas de ${familia.base}`}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex', padding: 0 }}
                  >
                    <Icon n="trash" s={14} />
                  </button>
                </div>
              ) : null,
              ...familia.opciones.map((o) => (
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
                  {/* Lo que el taller compra de verdad, separado de lo que quedó
                      anotado por las dudas. Es también el orden de la lista. */}
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--text-faint)' }}>
                    {(o.usado_en || 0) > 0
                      ? `Usado en ${o.usado_en} presupuesto${o.usado_en === 1 ? '' : 's'}${o.ultima_vez ? ` · última vez ${formatFechaAR(o.ultima_vez)}` : ''}`
                      : 'Anotado, nunca cotizado'}
                  </span>
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

                {o.cantidad_manual && (
                  <StatusBadge status="pending" title="La escribiste vos: el sistema no la vuelve a calcular">
                    Cantidad puesta a mano
                  </StatusBadge>
                )}

                {editando ? (
                  <input
                    type="number" min="1" step="1"
                    value={o.cantidad ?? ''}
                    placeholder="—"
                    onChange={(e) => cambiarCantidad(g.categoria, o.codigo, parseFloat(e.target.value))}
                    title="Cuántos envases de esta marca hacen falta. Si la escribís a mano queda fija."
                    style={{
                      width: 60, height: 30, textAlign: 'center', borderRadius: 8,
                      border: '1px solid var(--border-default)', background: 'var(--surface-card)',
                      color: 'var(--text-strong)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                    }}
                  />
                ) : (
                  <span
                    style={{ width: 60, textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}
                    title={o.cantidad ? undefined : 'Marcado como repuesto de este motor, todavía sin cotizar'}
                  >
                    {o.cantidad ? `×${o.cantidad}` : '—'}
                  </span>
                )}

                <span style={{ width: 120, textAlign: 'right', flexShrink: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                  {o.precio_actual ? formatPrecioARS(o.precio_actual) : '—'}
                </span>

                {editando && (
                  <button
                    onClick={() => quitarOpciones(g.categoria, [o.codigo])}
                    title={familia.esFamilia ? `Sacar solo la medida ${o.medida || ''}`.trim() : 'Sacar de la ficha'}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }}
                  >
                    <Icon n="x" s={16} />
                  </button>
                )}
              </div>
              )),
            ])}
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

      <Modal
        open={modalPapelera}
        title="Repuestos eliminados de este motor"
        onClose={() => setModalPapelera(false)}
        maxWidth={860}
      >
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 12 }}>
          Lo que se sacó de la ficha, del último borrado al primero. Si borraste algo por error, "Restaurar" lo devuelve
          a su categoría con la cantidad que tenía. Esto no afecta a los presupuestos ya emitidos, que guardan su propia copia.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '52vh', overflow: 'auto' }}>
          {papelera.map((p) => (
            <div key={p.codigo} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
              border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', flexWrap: 'wrap',
            }}>
              <span style={{ width: 150, flexShrink: 0, fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>
                {p.codigo}
              </span>
              <span style={{ flex: 1, minWidth: 140, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>
                {p.descripcion || '—'}
                <span style={{ color: 'var(--text-faint)' }}>
                  {' · '}{p.categoria}{p.marca ? ` · ${p.marca}` : ''}{p.medida ? ` · ${p.medida}` : ''}
                </span>
              </span>
              {!p.en_catalogo && <StatusBadge status="expired">Fuera de lista</StatusBadge>}
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-faint)' }}>
                ×{p.cantidad} · {formatFechaHoraAR(p.eliminado_en)}
              </span>
              <Button variant="secondary" size="sm" onClick={() => restaurar([p.codigo])}>Restaurar</Button>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <Button variant="ghost" size="sm" onClick={vaciarPapelera}>Vaciar la lista</Button>
          {papelera.length > 1 && (
            <Button variant="secondary" size="sm" onClick={() => restaurar(papelera.map((p) => p.codigo))}>
              Restaurar todo
            </Button>
          )}
        </div>
      </Modal>

      <Modal open={modalCopiar} title="Copiar ficha desde otro motor" onClose={() => setModalCopiar(false)} maxWidth={1000}>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 12 }}>
          Elegí el motor del que querés traer los repuestos. Se suman a lo que este motor ya tenga, sin pisar nada.
        </div>
        <MotorSelector onSelect={copiarDesde} />
      </Modal>

      {/* Solo la categoría entera pregunta antes: son todas las marcas y todas
          las medidas de una necesidad del motor, y es lo único que no se puede
          volver a armar con un par de clicks. Una opción o una familia de
          medidas se sacan directo — están en la papelera si hizo falta. */}
      <ConfirmDialog
        open={!!aQuitar}
        title={`¿Sacar ${aQuitar?.cantidad || 0} opciones de la ficha?`}
        message={aQuitar
          ? `Se va toda la categoría "${aQuitar.categoria}" de ${motor.motor}, con sus ${aQuitar.cantidad} opciones. `
            + 'Queda en "Repuestos eliminados" por si hace falta recuperarla, y no afecta a los presupuestos ya hechos.'
          : ''}
        confirmLabel="Sacar la categoría"
        danger
        onCancel={() => setAQuitar(null)}
        onConfirm={() => { quitarGrupo(aQuitar.categoria); setAQuitar(null) }}
      />
    </div>
  )
}
