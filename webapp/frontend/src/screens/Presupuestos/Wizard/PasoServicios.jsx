import React from 'react'
import { api } from '../../../api/client'
import { SearchInput } from '../../../components/SearchInput'
import { TextField } from '../../../components/TextField'
import { CampoMonto } from '../../../components/CampoMonto'
import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import { ContadorServicio } from '../../../components/ContadorServicio'
import { SelectorCantidadServicio } from '../../../components/SelectorCantidadServicio'
import { DataTable } from '../../../components/DataTable'
import { formatPrecioARS, parsePrecioARS } from '../../../utils/format'
import {
  lineasServicios, totalLineas, totalLineasOpcionales, hayPreciosInvalidos,
  precioEfectivo, estaPisado, esOpcional,
  conCantidadServicio, conPrecioServicio, conSubtotalServicio, sinPrecioPisado,
} from '../../../utils/servicios'
import { textoSubtotal } from '../../../utils/precios'
import { CajaOpcionales, BotonOpcional } from '../../../components/CajaOpcionales'
import { useArrastreOpcionales } from '../../../hooks/useArrastreOpcionales'
import { coincideBusqueda } from '../../../utils/texto'
import { useUndo } from '../../../context/UndoContext'

const tituloSeccion = {
  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
  letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-faint)',
}

const chipEditado = {
  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
  color: 'var(--text-muted)', background: 'var(--surface-sunken)',
  borderRadius: 'var(--radius-pill)', padding: '1px 8px', whiteSpace: 'nowrap',
}

// Componente controlado: la selección (value = {cantidades, customItems, grupos,
// precios}) vive en el wizard, así volver atrás desde el paso de repuestos no la
// pierde.
// cantidades: { [servicioId]: cantidad } — un servicio sin entrada (o en 0) no
// está incluido en el presupuesto; cantidad > 1 multiplica el precio de lista
// (ej. "Reunir cilindros" ×4 en un motor de 4 cilindros).
// grupos: { [servicioId]: 'a'|'b' } — a qué familia de cantidades rápidas
// pertenece la última elección hecha desde el botón "+" de ese ítem ('a' para
// 4/8/16, 'b' para 6/12). Solo se usa para decidir qué par muestran los
// recuadros adaptativos (ver parAdaptativo más abajo); tipear a mano no tagea.
// precios: { [servicioId]: { valor, texto } } — el unitario pisado a mano desde
// la tabla de la derecha. Ver utils/servicios.js. Se pisa escribiendo el
// unitario o el subtotal: el que se escribe manda y el otro se recalcula.
// opcionales: claves de las líneas que pasaron a la caja de OPCIONALES — siguen
// en el presupuesto y salen en el PDF, pero no suman al total.
export function PasoServicios({ motor, value, onChange, ajustePct, onAjustePctChange, onSiguiente }) {
  const [servicios, setServicios] = React.useState([])
  const [favoritos, setFavoritos] = React.useState(new Set())
  const [busqueda, setBusqueda] = React.useState('')
  const [nuevoCustomDesc, setNuevoCustomDesc] = React.useState('')
  const [nuevoCustomPrecio, setNuevoCustomPrecio] = React.useState('')
  const [ajusteTexto, setAjusteTexto] = React.useState(ajustePct ? String(ajustePct) : '')
  // % persistente sobre la lista de la Cámara, configurado en "Editar Precios".
  // Se lee solo para avisarlo al lado del ajuste de ESTE presupuesto: son dos
  // porcentajes distintos sobre la misma mano de obra, y aplicar uno sin saber
  // del otro es el error más fácil de cometer.
  const [ajusteGeneral, setAjusteGeneral] = React.useState(0)
  // Servicios cuyo precio pisado ya se guardó como precio propio del taller,
  // para mostrar el acuse y no ofrecer guardar dos veces lo mismo.
  const [preciosGuardados, setPreciosGuardados] = React.useState({})
  const [guardandoPrecio, setGuardandoPrecio] = React.useState(null)
  const { avisarBorrado } = useUndo()

  const cantidades = value.cantidades
  const customItems = value.customItems
  const grupos = value.grupos

  React.useEffect(() => {
    api.get(`/motores/${motor.id}/servicios`).then(setServicios)
    api.get('/servicios/favoritos').then((ids) => setFavoritos(new Set(ids)))
    // Si falla no pasa nada: el aviso del ajuste general es informativo y su
    // ausencia no puede romper el armado de un presupuesto.
    api.get('/precios/ajuste-general').then((d) => setAjusteGeneral(d.pct)).catch(() => {})
  }, [motor.id])

  /*
   * Guardar un precio pisado como precio propio del taller.
   *
   * Es explícito y de a una línea a propósito: un precio especial para un
   * cliente y una decisión de tarifa son cosas distintas. Si cada edición se
   * guardara sola, el descuento de hoy sería el precio de la casa mañana, sin
   * que nadie se enterara. Queda además el resumen del paso de Revisión, para
   * el que prefiere decidirlo todo junto al final.
   */
  const guardarPrecioPropio = async (fila) => {
    if (!motor?.lista_num || fila.esManual || fila.precioUnitario == null) return
    setGuardandoPrecio(fila.servicioId)
    try {
      await api.post('/precios/mano-obra', {
        servicio_id: fila.servicioId,
        lista_num: motor.lista_num,
        precio: fila.precioUnitario,
        origen: 'presupuesto',
      })
      setPreciosGuardados((g) => ({ ...g, [fila.servicioId]: fila.precioUnitario }))
    } catch {
      // El precio del presupuesto no se toca: guardarlo en la tarifa es un
      // extra, y que falle no puede frenar la cotización que se está armando.
      setPreciosGuardados((g) => ({ ...g, [fila.servicioId]: 'error' }))
    } finally {
      setGuardandoPrecio(null)
    }
  }

  const toggleFavorito = async (id) => {
    const data = await api.post(`/servicios/${id}/favorito`)
    setFavoritos((prev) => {
      const next = new Set(prev)
      if (data.favorito) next.add(id); else next.delete(id)
      return next
    })
  }

  // Tipeo a mano en el recuadro: fija la cantidad tal cual y limpia el tag de
  // grupo (un valor tipeado a mano no participa del cálculo del par adaptativo).
  // Sacar el servicio del presupuesto (cantidad 0) también borra su precio
  // pisado y su marca de opcional: nada que ya no se ve en ningún lado puede
  // volver solo si el servicio se agrega de nuevo más tarde.
  const cambiarCantidad = (id, cantidad) => onChange(
    conCantidadServicio(value, { servicioId: id, esManual: false }, cantidad),
  )

  // Botón "+" o recuadro adaptativo: fija la cantidad y tagea el ítem con su
  // familia (4/8/16 → 'a', 6/12 → 'b') para que el par adaptativo global se
  // recalcule según cuál familia predomina en el presupuesto.
  const elegirCantidad = (id, cantidad) => {
    onChange({
      ...value,
      cantidades: { ...cantidades, [id]: cantidad },
      grupos: { ...grupos, [id]: (cantidad === 6 || cantidad === 12) ? 'b' : 'a' },
    })
  }

  // Click en cualquier parte de la fila (fuera de los controles): suma 1 a la
  // cantidad actual, sin tocar el tag de grupo.
  const sumarUno = (id) => {
    onChange({ ...value, cantidades: { ...cantidades, [id]: (cantidades[id] || 0) + 1 } })
  }

  // Par que muestran los recuadros adaptativos: la familia con más ítems
  // activos (cantidad > 0) en el presupuesto gana; empate (incluido el caso
  // inicial, sin nada elegido todavía) se resuelve a favor de 4/8.
  const parAdaptativo = React.useMemo(() => {
    let cuentaA = 0
    let cuentaB = 0
    Object.entries(grupos).forEach(([id, g]) => {
      if ((cantidades[id] || 0) <= 0) return
      if (g === 'b') cuentaB += 1
      else cuentaA += 1
    })
    return cuentaB > cuentaA ? [6, 12] : [4, 8]
  }, [grupos, cantidades])

  const agregarCustom = () => {
    const desc = nuevoCustomDesc.trim()
    const precio = parsePrecioARS(nuevoCustomPrecio)
    if (!desc || precio === null) return
    onChange({
      ...value,
      customItems: [...customItems, {
        id: `custom-${Date.now()}`,
        descripcion_custom: desc,
        precio_aplicado: precio,
        precioTexto: formatPrecioARS(precio),
        cantidad: 1,
      }],
    })
    setNuevoCustomDesc('')
    setNuevoCustomPrecio('')
  }

  const cambiarCantidadCustom = (id, cantidad) => onChange({
    ...value,
    customItems: customItems.map((c) => (c.id === id ? { ...c, cantidad: Math.max(0, cantidad) } : c)),
  })

  const quitarCustom = (id) => {
    const antes = value
    const it = customItems.find((c) => c.id === id)
    onChange({
      ...value,
      customItems: customItems.filter((c) => c.id !== id),
      opcionales: (value.opcionales || []).filter((c) => String(c) !== String(id)),
    })
    avisarBorrado({
      mensaje: `Se quitó ${it?.descripcion_custom || 'el ítem'} del presupuesto.`,
      onDeshacer: () => onChange(antes),
    })
  }

  /** Vuelve al precio de la lista de la Cámara (con el ajuste %). */
  const restaurarPrecio = (fila) => onChange(sinPrecioPisado(value, fila))

  /*
   * Pisar el precio unitario desde la tabla de la derecha. Se guarda el texto
   * tal cual se tipea (para no pelearle al cursor mientras se escribe) y el
   * valor parseado aparte; un texto que no se entiende deja el valor en null,
   * pinta el recuadro en rojo y apaga "Siguiente".
   *
   * Vaciar el recuadro de un servicio de la Cámara devuelve el precio de lista:
   * es la misma salida que el botón ↺, escribiendo.
   */
  const cambiarPrecio = (fila, texto) => onChange(conPrecioServicio(value, fila, texto))

  /*
   * Subtotal editable. Es la misma casilla del unitario vista al revés: se
   * reparte lo tipeado entre la cantidad y lo que queda es el unitario, que es
   * el que se guarda. Con cantidad 0 no se puede repartir, así que el valor
   * queda inválido (recuadro rojo) en vez de inventar un número.
   */
  const cambiarSubtotal = (fila, texto) => onChange(conSubtotalServicio(value, fila, texto))

  /* Pasar una línea a la caja de opcionales, o traerla de vuelta. Lo hacen el
     arrastre y la flechita del renglón: los dos terminan acá. */
  const moverOpcional = React.useCallback((clave, opcional) => {
    onChange((actual) => {
      const previas = (actual.opcionales || []).filter((c) => String(c) !== String(clave))
      return { ...actual, opcionales: opcional ? [...previas, clave] : previas }
    })
  }, [onChange])

  const { zonaActiva, propsFila, propsZona, propsCampoEditable } = useArrastreOpcionales(moverOpcional)

  const filtrados = servicios.filter(
    (s) => coincideBusqueda([String(s.item_num), s.descripcion], busqueda),
  )
  const favoritosVisibles = filtrados.filter((s) => favoritos.has(s.id))
  const restoVisibles = filtrados.filter((s) => !favoritos.has(s.id))

  // Aumento/descuento en % sobre la mano de obra (positivo = aumento, negativo
  // = descuento). Solo afecta los precios de lista de servicios FACRA — los
  // ítems manuales y los renglones con el precio pisado a mano ya tienen un
  // precio elegido a mano, no se ajustan de nuevo.
  const aplicarAjusteTexto = (texto) => {
    setAjusteTexto(texto)
    const normalizado = texto.replace(',', '.').trim()
    if (normalizado === '' || normalizado === '-') {
      onAjustePctChange(0)
      return
    }
    const n = parseFloat(normalizado)
    onAjustePctChange(Number.isNaN(n) ? 0 : n)
  }

  const colorAjuste = ajustePct > 0 ? 'var(--status-active-fg)' : ajustePct < 0 ? 'var(--status-expired-fg)' : 'var(--border-default)'

  // Previsualización del lado derecho: todo lo que ya está incluido en el
  // presupuesto (catálogo + ítems manuales), con su subtotal ya calculado. Es
  // también donde se edita el precio unitario, así que es la misma lista que
  // alimenta el total y el paso de Revisión.
  const filasPreview = lineasServicios(servicios, value, ajustePct)
  const filasCotizan = filasPreview.filter((f) => !f.opcional)
  const filasOpcionales = filasPreview.filter((f) => f.opcional)
  const total = totalLineas(filasPreview)
  const totalOpcionales = totalLineasOpcionales(filasPreview)
  const preciosInvalidos = hayPreciosInvalidos(filasPreview)

  // wrap:true en subtotal: aunque el ancho de columna no alcance para un monto
  // grande, el valor pasa a una segunda línea en vez de recortarse con "…".
  // Sin useMemo a propósito: las celdas editables capturan value/onChange, y
  // memorizarlas las dejaría escribiendo sobre una selección vieja.
  const columnasPreview = [
    { key: 'descripcion', header: 'Descripción', wrap: true },
    { key: 'cantidad', header: 'Cant.', align: 'right', width: 76 },
    {
      key: 'precioUnitario',
      header: 'P. unitario',
      align: 'right',
      width: 178,
      // wrap:true no por el texto sino para que la celda no recorte: con
      // overflow hidden el ↺ dejaba asomando el "…" del ellipsis al lado del
      // precio (se ve en la captura que mandó el dueño el 2026-08-19).
      wrap: true,
      render: (_, fila) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
          <TextField
            value={fila.precioTexto ?? ''}
            onChange={(e) => cambiarPrecio(fila, e.target.value)}
            {...propsCampoEditable}
            title="Precio unitario — se puede editar"
            style={{
              width: 122, textAlign: 'right',
              borderColor: fila.precioUnitario === null || fila.precioUnitario === undefined
                ? 'var(--status-expired-fg)' : undefined,
            }}
          />
          {/* Guardar este precio como el del taller, para que salga así en los
              próximos presupuestos. Explícito y de a uno: ver guardarPrecioPropio. */}
          {/* La última condición evita ofrecer guardar un precio que ya es la
              tarifa: sería una escritura que no cambia nada y un renglón de
              historial que no registra ningún cambio. */}
          {fila.pisado && !fila.esManual && motor?.lista_num
            && fila.precioUnitario !== fila.precioLista && (
            preciosGuardados[fila.servicioId] === fila.precioUnitario ? (
              <span
                style={{ display: 'flex', color: 'var(--status-active-fg)', padding: 2 }}
                title="Guardado como tu precio: desde ahora sale así. Se puede deshacer en Editar Precios."
              >
                <Icon n="check" s={14} />
              </span>
            ) : (
              <button
                type="button"
                onClick={() => guardarPrecioPropio(fila)}
                disabled={guardandoPrecio === fila.servicioId || fila.precioUnitario == null}
                title={`Guardar ${formatPrecioARS(fila.precioUnitario)} como tu precio para este trabajo (lista ${motor.lista_num}). Se usa en los próximos presupuestos; este no cambia.`}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex', padding: 2 }}
              >
                <Icon n="save" s={14} />
              </button>
            )
          )}
          {/* El ↺ solo tiene sentido con un precio de lista atrás: un ítem
              manual no tiene a dónde volver. */}
          {fila.pisado && (
            <button
              type="button"
              onClick={() => restaurarPrecio(fila)}
              title="Volver al precio de la lista"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex', padding: 2 }}
            >
              <Icon n="rotate-cw" s={14} />
            </button>
          )}
        </span>
      ),
    },
    {
      key: 'subtotal',
      header: 'Subtotal',
      align: 'right',
      width: 178,
      wrap: true,
      // El subtotal también se edita: escribirlo recalcula el unitario. Manda
      // el último que se tocó (ver utils/precios.js).
      render: (_, fila) => (
        <CampoMonto
          valor={textoSubtotal(fila.precioUnitario, fila.cantidad)}
          onEscribir={(texto) => cambiarSubtotal(fila, texto)}
          {...propsCampoEditable}
          title="Subtotal — se puede editar; el precio unitario se recalcula solo"
          style={{
            width: 132, textAlign: 'right', fontWeight: 600,
            borderColor: fila.subtotal === null || fila.subtotal === undefined
              ? 'var(--status-expired-fg)' : undefined,
          }}
        />
      ),
    },
    {
      key: 'opcional',
      header: '',
      align: 'center',
      width: 44,
      render: (_, fila) => (
        <BotonOpcional
          opcional={fila.opcional}
          onClick={() => moverOpcional(String(fila.id), !fila.opcional)}
        />
      ),
    },
  ]

  const Fila = ({ s }) => {
    const cantidad = cantidades[s.id] || 0
    const precio = precioEfectivo(s, value, ajustePct)
    const pisado = estaPisado(s.id, value)
    return (
      <div
        onClick={() => sumarUno(s.id)}
        style={{
          display: 'grid', gridTemplateColumns: '32px auto 1fr 150px', alignItems: 'center', gap: 10,
          padding: '10px 16px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
          background: cantidad > 0 ? 'var(--status-active-bg)' : 'transparent',
        }}
      >
        <span
          onClick={(e) => { e.stopPropagation(); toggleFavorito(s.id) }}
          style={{ display: 'flex', cursor: 'pointer', color: favoritos.has(s.id) ? '#e8b400' : 'var(--text-faint)' }}
        >
          <Icon n="star" s={16} style={{ fill: favoritos.has(s.id) ? '#e8b400' : 'none' }} />
        </span>
        <SelectorCantidadServicio
          cantidad={cantidad}
          par={parAdaptativo}
          onEscribir={(n) => cambiarCantidad(s.id, n)}
          onElegir={(n) => elegirCantidad(s.id, n)}
        />
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>{s.descripcion}</span>
        {/* El precio de la izquierda es el mismo que cotiza el presupuesto: si
            se pisó a mano en la tabla de la derecha, se ve el pisado. */}
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
          {esOpcional(s.id, value) && <span style={chipEditado}>opcional</span>}
          {pisado && <span style={chipEditado}>editado</span>}
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-strong)', fontWeight: 600 }}>
            {formatPrecioARS(precio)}
          </span>
        </span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Total y "Siguiente" arriba de todo: no hace falta bajar hasta el final
          de la lista de servicios para ver cuánto lleva el presupuesto o avanzar. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: '16px 20px', background: 'var(--surface-inverse)', borderRadius: 'var(--radius-xl)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {/* "De este presupuesto" y no "mano de obra" a secas: desde que
                existe el aumento general de la pantalla Editar Precios hay dos
                porcentajes sobre la misma mano de obra, y el nombre tiene que
                decir cuál es cuál. Éste es la palanca de UNA cotización ("a este
                cliente -10%"); el otro es parte de la tarifa y vale para todos. */}
            <label style={{ fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.65)' }}>
              Ajuste de este presupuesto
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={ajusteTexto}
                onChange={(e) => aplicarAjusteTexto(e.target.value)}
                title="Porcentaje de aumento (positivo) o descuento (negativo) sobre la mano de obra, solo para este presupuesto"
                style={{
                  width: 64, height: 34, textAlign: 'center', borderRadius: 8,
                  border: `2px solid ${colorAjuste}`, background: '#fff', color: 'var(--text-strong)',
                  fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, outline: 'none',
                }}
              />
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'rgba(255,255,255,.75)' }}>%</span>
            </div>
            {/* Sin este aviso es fácil sumar 25 acá encima de un 25 que ya está
                puesto en la tarifa y cotizar un 56% más caro sin querer. */}
            {ajusteGeneral !== 0 && (
              <span
                style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'rgba(255,255,255,.6)' }}
                title="Configurado en Editar Precios. Ya viene aplicado en los precios de esta pantalla."
              >
                tu lista ya tiene {ajusteGeneral > 0 ? '+' : ''}{ajusteGeneral}%
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-md)', fontWeight: 600, color: '#fff' }}>Total servicios</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 700, color: '#fff' }}>{formatPrecioARS(total)}</span>
          </div>
          {totalOpcionales > 0 && (
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'rgba(255,255,255,.75)' }}>
              Opcionales <strong style={{ color: '#fff' }}>{formatPrecioARS(totalOpcionales)}</strong>
              <span style={{ opacity: .8 }}> (fuera del total)</span>
            </span>
          )}
        </div>
        {/* Se puede seguir sin servicios: un presupuesto puede ser de solo repuestos.
            La validación de "al menos un ítem" está en el paso de confirmación. */}
        <Button
          variant="secondary"
          iconRight={<Icon n="chevron-right" s={16} />}
          disabled={preciosInvalidos}
          onClick={() => onSiguiente(total, totalOpcionales)}
          style={{ background: '#fff', border: 'none', color: 'var(--text-strong)' }}
        >
          Siguiente: Repuestos
        </Button>
      </div>

      {preciosInvalidos && (
        <div style={{ textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--status-expired-fg)' }}>
          Hay un precio que no se entiende como número. Corregilo para poder seguir.
        </div>
      )}

      {/* Izquierda: catálogo completo de mano de obra para ir eligiendo.
          Derecha: previsualización de cómo va quedando el presupuesto. */}
      <div className="servicios-picker-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <SearchInput icon={<Icon n="search" s={16} />} placeholder="Buscar por número o descripción…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />

          <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', background: 'var(--surface-card)', maxHeight: 780, overflow: 'auto', padding: '8px 0' }}>
            {favoritosVisibles.map((s) => <Fila key={s.id} s={s} />)}
            {favoritosVisibles.length > 0 && restoVisibles.length > 0 && (
              <div style={{ textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-faint)', padding: '10px 0' }}>
                ─── Lista de la Cámara de Rectificadores ───
              </div>
            )}
            {restoVisibles.map((s) => <Fila key={s.id} s={s} />)}
            {filtrados.length === 0 && (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-faint)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
                No se encontraron servicios.
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          {/* Caja del presupuesto: lo que se cobra. Sus filas se pueden
              arrastrar a la caja de abajo. */}
          <div
            {...propsZona(false)}
            style={{
              display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0,
              padding: zonaActiva === false ? 6 : 0,
              border: zonaActiva === false ? '2px dashed var(--text-strong)' : 'none',
              borderRadius: 'var(--radius-xl)',
            }}
          >
            <div style={tituloSeccion}>Presupuesto</div>
            <DataTable
              columns={columnasPreview}
              rows={filasCotizan}
              getRowProps={(fila) => propsFila(String(fila.id))}
              emptyMessage="Todavía no elegiste servicios. Tocá un ítem de la lista para agregarlo acá."
            />
            {filasCotizan.length > 0 && (
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-faint)' }}>
                El precio unitario y el subtotal se pueden editar acá mismo: el que escribís manda y el otro
                se recalcula solo. Los precios van en pesos enteros, así que un subtotal que no se reparte
                justo entre la cantidad sube al peso siguiente. Un precio editado no recibe el ajuste %;
                el ↺ lo devuelve al de la lista.
              </div>
            )}
          </div>

          <CajaOpcionales
            total={totalOpcionales}
            cantidad={filasOpcionales.length}
            activa={zonaActiva === true}
            dropProps={propsZona(true)}
          >
            <DataTable
              columns={columnasPreview}
              rows={filasOpcionales}
              getRowProps={(fila) => propsFila(String(fila.id))}
            />
          </CajaOpcionales>
        </div>
      </div>

      <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', background: 'var(--surface-card)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={tituloSeccion}>Agregar ítem manual</div>
        {customItems.map((c) => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ContadorServicio cantidad={c.cantidad || 0} onChange={(n) => cambiarCantidadCustom(c.id, n)} />
            <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
              {c.descripcion_custom}
              <span style={{ color: 'var(--text-faint)' }}> ({formatPrecioARS(c.precio_aplicado)} c/u)</span>
            </span>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>{formatPrecioARS((c.precio_aplicado || 0) * (c.cantidad || 0))}</span>
            <button onClick={() => quitarCustom(c.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }}>
              <Icon n="x" s={16} />
            </button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 10 }}>
          <TextField placeholder="Descripción" value={nuevoCustomDesc} onChange={(e) => setNuevoCustomDesc(e.target.value)} style={{ flex: 1 }} />
          <TextField placeholder="Precio unit." value={nuevoCustomPrecio} onChange={(e) => setNuevoCustomPrecio(e.target.value)} style={{ width: 140 }} />
          <Button variant="secondary" iconLeft={<Icon n="plus" s={16} />} onClick={agregarCustom}>Agregar</Button>
        </div>
      </div>
    </div>
  )
}
