import React from 'react'
import { api } from '../../api/client'
import { DataTable } from '../../components/DataTable'
import { TextField } from '../../components/TextField'
import { Icon } from '../../components/Icon'
import { formatPrecioARS, parsePrecioARS } from '../../utils/format'
import { ModalPropagar } from './ModalPropagar'

/*
 * Los 235 trabajos de la lista, con el precio de la Cámara y el del taller.
 *
 * Cómo se edita
 * -------------
 * Se escribe el precio y se confirma con Enter o saliendo del campo. Ahí se
 * guarda para ESTA lista, que es lo que el dueño quiso hacer. Propagar a las
 * trece es una acción aparte (el botón de capas), no una pregunta que
 * interrumpa cada edición: tarifar treinta trabajos seguidos no puede costar
 * treinta decisiones sobre listas que no se están mirando.
 *
 * Que el precio se explique solo
 * ------------------------------
 * Una fila con precio propio se marca con un punto y el tooltip dice de dónde
 * sale el número ("Cámara $237.367 · tu precio $280.000 · fijado el 12/08 desde
 * el presupuesto #34"). Un monto sin origen no se puede evaluar, y acá conviven
 * tres orígenes posibles: la Cámara, la Cámara con el aumento general, y el
 * precio propio.
 *
 * El ↺ devuelve el trabajo al precio de la Cámara. Todo lo que se hace acá es
 * reversible, que es lo que permite tocar sin miedo.
 */
export function ListaManoObra({ servicios, listaNum, cargando, hayBusqueda, onCambio, onError }) {
  // Lo tipeado por fila mientras se edita. Se guarda el texto tal cual se
  // escribe (no el número) para no pelearle al cursor, igual que en el wizard.
  const [borradores, setBorradores] = React.useState({})
  const [guardando, setGuardando] = React.useState(null)
  const [recienGuardado, setRecienGuardado] = React.useState(null)
  const [propagar, setPropagar] = React.useState(null)

  // El "✓ Guardado" se apaga solo: es un acuse de recibo, no un estado.
  React.useEffect(() => {
    if (recienGuardado === null) return undefined
    const t = setTimeout(() => setRecienGuardado(null), 2200)
    return () => clearTimeout(t)
  }, [recienGuardado])

  const confirmar = async (servicio, texto) => {
    setBorradores((b) => { const { [servicio.id]: _, ...resto } = b; return resto })

    const precio = parsePrecioARS(texto)
    const actual = servicio.es_propio ? servicio.precio : null

    // Vaciar el campo es volver al precio de la Cámara: es el gesto natural
    // ("saco lo que puse") y hace lo mismo que el ↺.
    if (!String(texto).trim()) {
      if (actual !== null) await borrar(servicio)
      return
    }
    if (precio === null || precio <= 0) {
      onError('El precio tiene que ser un número mayor que cero.')
      return
    }
    if (precio === actual) return   // no cambió: no se escribe ni se registra

    setGuardando(servicio.id)
    try {
      await api.post('/precios/mano-obra', {
        servicio_id: servicio.id, lista_num: listaNum, precio, origen: 'pantalla',
      })
      setRecienGuardado(servicio.id)
      onCambio()
    } catch (e) {
      onError(e.message)
    } finally {
      setGuardando(null)
    }
  }

  const borrar = async (servicio) => {
    setGuardando(servicio.id)
    try {
      await api.del('/precios/mano-obra', { servicio_id: servicio.id, lista_num: listaNum })
      onCambio()
    } catch (e) {
      onError(e.message)
    } finally {
      setGuardando(null)
    }
  }

  const explicacion = (s) => {
    if (!s.es_propio) return 'Precio de la lista de la Cámara. Escribí acá el tuyo.'
    const partes = [
      `Cámara ${formatPrecioARS(s.precio_facra)}`,
      `tu precio ${formatPrecioARS(s.precio)}`,
    ]
    if (s.precio_propio_fijado_en) {
      const [fecha] = s.precio_propio_fijado_en.split('T')
      const [y, m, d] = fecha.split('-')
      partes.push(`fijado el ${d}/${m}/${y}`)
    }
    if (s.origen_propio === 'presupuesto') partes.push('desde un presupuesto')
    return partes.join(' · ')
  }

  const columnas = [
    { key: 'item_num', header: 'Ítem', width: 68, align: 'right' },
    {
      key: 'descripcion',
      header: 'Trabajo',
      wrap: true,
      render: (v, s) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {/* El punto es lo primero que se ve al barrer la columna: dice qué
              filas tienen precio del taller sin tener que comparar montos. */}
          <span
            aria-hidden
            style={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              background: s.es_propio
                ? (s.desfasado ? 'var(--status-aviso-fg)' : 'var(--status-active-fg)')
                : 'transparent',
            }}
          />
          <span>{v}</span>
        </span>
      ),
    },
    {
      key: 'precio_facra',
      header: 'Cámara',
      align: 'right',
      width: 130,
      render: (v) => (
        <span style={{ color: 'var(--text-faint)' }}>{formatPrecioARS(v)}</span>
      ),
    },
    {
      key: 'precio',
      header: 'Mi precio',
      align: 'right',
      width: 210,
      wrap: true,
      render: (_, s) => {
        // Mientras se escribe manda lo tipeado tal cual (si no, reformatear en
        // cada tecla manda el cursor al final); en reposo se ve el monto
        // formateado, como en todo el resto del sistema. Es la misma idea de
        // components/CampoMonto.jsx, con el borrador acá porque la confirmación
        // al salir del campo necesita el texto.
        const borrador = borradores[s.id]
        const valor = borrador !== undefined
          ? borrador
          : (s.es_propio ? formatPrecioARS(s.precio) : '')
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
            {recienGuardado === s.id && (
              <span style={{ display: 'flex', color: 'var(--status-active-fg)' }} title="Guardado">
                <Icon n="check" s={15} />
              </span>
            )}
            <TextField
              value={valor}
              disabled={guardando === s.id}
              onChange={(e) => setBorradores((b) => ({ ...b, [s.id]: e.target.value }))}
              // Al entrar se muestra el número pelado: editar sobre "$ 280.000"
              // obliga a esquivar el signo y los puntos. (parsePrecioARS entiende
              // las dos formas igual, esto es solo comodidad al tipear.)
              onFocus={() => setBorradores((b) => (
                b[s.id] !== undefined ? b : { ...b, [s.id]: s.es_propio ? String(s.precio) : '' }
              ))}
              onBlur={(e) => confirmar(s, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') {
                  setBorradores((b) => { const { [s.id]: _, ...resto } = b; return resto })
                  e.currentTarget.blur()
                }
              }}
              inputMode="numeric"
              // Un guión y no el precio de la Cámara: con el precio de placeholder,
              // las 235 filas se leían como si ya estuvieran todas tarifadas y la
              // columna repetía la de al lado. Vacío tiene que verse vacío.
              placeholder="—"
              title={explicacion(s)}
              style={{
                width: 122, textAlign: 'right',
                fontWeight: s.es_propio ? 600 : 400,
                color: s.es_propio ? 'var(--text-strong)' : 'var(--text-muted)',
              }}
            />
            {/* Llevar este precio a las trece listas. Solo tiene sentido con un
                precio propio cargado: sin él no hay nada que propagar. */}
            <button
              type="button"
              onClick={() => setPropagar({ servicio: s, precio: s.precio })}
              disabled={!s.es_propio}
              title={s.es_propio
                ? 'Aplicar este precio a las trece listas, manteniendo la proporción de la Cámara'
                : 'Cargá tu precio para poder aplicarlo a las trece listas'}
              style={{
                border: 'none', background: 'transparent', display: 'flex', padding: 2,
                cursor: s.es_propio ? 'pointer' : 'default',
                color: s.es_propio ? 'var(--text-faint)' : 'var(--border-default)',
              }}
            >
              <Icon n="layers" s={15} />
            </button>
            {/* ↺: vuelve al precio de la Cámara. */}
            <button
              type="button"
              onClick={() => borrar(s)}
              disabled={!s.es_propio}
              title={s.es_propio ? 'Volver al precio de la Cámara' : ''}
              style={{
                border: 'none', background: 'transparent', display: 'flex', padding: 2,
                cursor: s.es_propio ? 'pointer' : 'default',
                color: s.es_propio ? 'var(--text-faint)' : 'transparent',
              }}
            >
              <Icon n="rotate-cw" s={15} />
            </button>
          </span>
        )
      },
    },
  ]

  let vacio = 'No hay trabajos en esta lista.'
  if (cargando) vacio = 'Cargando…'
  else if (hayBusqueda) vacio = 'Ningún trabajo coincide con lo que buscaste.'

  return (
    <>
      <DataTable
        columns={columnas}
        rows={servicios}
        reorderKey="precios-mano-obra"
        emptyMessage={vacio}
        striped
      />

      <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.5 }}>
        Escribí tu precio y confirmá con Enter. Se guarda para la lista {listaNum};
        el botón de capas lo lleva a las trece manteniendo la proporción de la Cámara, y
        el ↺ lo devuelve al precio de ella. Borrar el campo hace lo mismo que el ↺.
        <br />
        Los presupuestos ya emitidos no cambian: sus precios quedaron congelados el día que se cotizaron.
      </div>

      <ModalPropagar
        open={Boolean(propagar)}
        servicio={propagar?.servicio}
        listaNum={listaNum}
        precio={propagar?.precio}
        onCerrar={() => setPropagar(null)}
        onListo={() => { setPropagar(null); onCambio() }}
      />
    </>
  )
}
