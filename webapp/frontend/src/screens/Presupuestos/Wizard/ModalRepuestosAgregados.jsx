import React from 'react'
import { TextField } from '../../../components/TextField'
import { CampoMonto } from '../../../components/CampoMonto'
import { ContadorCantidad } from '../../../components/ContadorCantidad'
import { StatusBadge } from '../../../components/StatusBadge'
import { Icon } from '../../../components/Icon'
import { CodigoRepuesto } from '../../../components/CodigoRepuesto'
import { formatPrecioARS } from '../../../utils/format'
import { textoSubtotal } from '../../../utils/precios'
import {
  agruparLineas, subtotalDe, subtotalDelGrupo, opcionesQueCotizan,
  codigosConCantidadSospechosa, familiasOrdenadas,
} from '../../../utils/grupos'

const celda = {
  padding: '10px 12px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
  color: 'var(--text-body)', borderBottom: '1px solid var(--border-subtle)', verticalAlign: 'middle',
}

const encabezado = {
  padding: '8px 12px', fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
  letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-faint)',
  textAlign: 'left', borderBottom: '1px solid var(--border-default)',
}

/* La línea vertical que une las medidas de un mismo repuesto: se dibuja como
   borde izquierdo de la primera celda de cada fila de la familia, así queda
   continua de la primera medida a la última. */
const lineaFamilia = { borderLeft: '3px solid var(--familia-linea)' }

/*
 * Pop-up "Ver repuestos". Muestra los repuestos agrupados por categoría del
 * proveedor. **Todo lo que está acá se cotiza**: el sistema ya no elige por
 * precio, el taller carga la pieza que va a usar — y por eso una categoría
 * puede llevar dos piezas que suman las dos (válvulas de admisión y de escape).
 *
 * La columna que antes decía "Cotiza" es ahora la casilla **Opcional**: marca
 * la pieza que se pone "por las dudas" (la bomba de aceite por si la del motor
 * no sirve). Sigue guardada y sale en el PDF, en su propia caja y con precio,
 * pero no suma al total.
 *
 * Cantidad, precio unitario y subtotal se editan por línea; entre el unitario y
 * el subtotal manda el último que se escribe (ver utils/precios.js).
 */
export function ModalRepuestosAgregados({
  open, items, onCambiarCantidad, onCambiarPrecio, onCambiarSubtotal, onToggleOpcional,
  onQuitar, onQuitarVarias, onClose,
}) {
  const { grupos, sueltas } = React.useMemo(() => agruparLineas(items), [items])
  // null = nadie tocó las flechitas todavía: arrancan todos abiertos (es la
  // pantalla donde se revisa lo cargado). Cerrarlos sirve cuando hay muchas
  // categorías y se quiere mirar una sola.
  const [cerrados, setCerrados] = React.useState([])

  if (!open) return null

  const nombres = [...grupos.map((g) => g.categoria), ...(sueltas.length ? ['__sueltas__'] : [])]
  const alternar = (nombre) => setCerrados(
    cerrados.includes(nombre) ? cerrados.filter((n) => n !== nombre) : [...cerrados, nombre],
  )
  const todosCerrados = nombres.length > 0 && cerrados.length >= nombres.length

  const totalGeneral = items.reduce((acc, l) => acc + (l.opcional ? 0 : subtotalDe(l)), 0)
  const totalOpcionales = items.reduce((acc, l) => acc + (l.opcional ? subtotalDe(l) : 0), 0)

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,22,25,.35)', zIndex: 1000,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface-card)', borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-lg)',
          width: '100%', maxWidth: 1280, maxHeight: '86vh', overflow: 'auto',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          padding: '16px 20px', borderBottom: '1px solid var(--border-default)',
          position: 'sticky', top: 0, background: 'var(--surface-card)', zIndex: 1,
        }}>
          <div>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text-strong)' }}>
              Repuestos del presupuesto
            </h3>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>
              Total {formatPrecioARS(totalGeneral)}
              {totalOpcionales > 0 && ` · Opcionales ${formatPrecioARS(totalOpcionales)} (fuera del total)`}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {nombres.length > 1 && (
              <button
                onClick={() => setCerrados(todosCerrados ? [] : nombres)}
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
                  fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
                }}
              >
                {todosCerrados ? 'Expandir todo' : 'Colapsar todo'}
              </button>
            )}
            <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }}>
              <Icon n="x" s={20} />
            </button>
          </div>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 22 }}>
          {grupos.length === 0 && sueltas.length === 0 && (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
              Todavía no agregaste ningún repuesto.
            </div>
          )}

          {grupos.map((g) => (
            <Grupo
              key={g.categoria}
              grupo={g}
              abierto={!cerrados.includes(g.categoria)}
              onAlternar={() => alternar(g.categoria)}
              onCambiarCantidad={onCambiarCantidad}
              onCambiarPrecio={onCambiarPrecio}
              onCambiarSubtotal={onCambiarSubtotal}
              onToggleOpcional={onToggleOpcional}
              onQuitar={onQuitar}
              onQuitarVarias={onQuitarVarias}
            />
          ))}

          {sueltas.length > 0 && (
            <Grupo
              grupo={{ categoria: 'Sin categoría', opciones: sueltas }}
              abierto={!cerrados.includes('__sueltas__')}
              onAlternar={() => alternar('__sueltas__')}
              onCambiarCantidad={onCambiarCantidad}
              onCambiarPrecio={onCambiarPrecio}
              onCambiarSubtotal={onCambiarSubtotal}
              onToggleOpcional={onToggleOpcional}
              onQuitar={onQuitar}
              onQuitarVarias={onQuitarVarias}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function Grupo({
  grupo, abierto = true, onAlternar,
  onCambiarCantidad, onCambiarPrecio, onCambiarSubtotal, onToggleOpcional, onQuitar, onQuitarVarias,
}) {
  const sospechosas = React.useMemo(() => codigosConCantidadSospechosa(grupo.opciones), [grupo.opciones])
  const cotizan = opcionesQueCotizan(grupo.opciones)
  const sinStockQueCotiza = cotizan.some((o) => o.stock === 0)

  // Las medidas de un mismo repuesto (STD, 025, 050…) van SIEMPRE juntas y con
  // una línea al costado: son la misma pieza. Ordenar las opciones sueltas por
  // precio y agrupar después metía el código sin familia entre las medidas de
  // otro, y parecía una medida más de esa familia (bug reportado por el dueño).
  const familias = React.useMemo(() => familiasOrdenadas(grupo.opciones), [grupo.opciones])

  return (
    <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: '12px 16px', background: 'var(--surface-sunken)', flexWrap: 'wrap',
      }}>
        <button
          onClick={onAlternar}
          aria-expanded={abierto}
          title={abierto ? 'Cerrar el grupo' : 'Abrir el grupo'}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, textAlign: 'left',
          }}
        >
          <Icon n={abierto ? 'chevron-down' : 'chevron-right'} s={16} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>
            {grupo.categoria}
          </span>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-faint)' }}>
            {grupo.opciones.length}{' '}
            {grupo.opciones.length === 1 ? 'repuesto' : 'repuestos'}
            {cotizan.length !== grupo.opciones.length && ` · ${grupo.opciones.length - cotizan.length} opcional${grupo.opciones.length - cotizan.length === 1 ? '' : 'es'}`}
          </span>
        </button>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-strong)' }}>
          Cotiza {formatPrecioARS(subtotalDelGrupo(grupo.opciones))}
        </span>
      </div>

      {abierto && sinStockQueCotiza && (
        <div style={{
          padding: '8px 16px', background: 'var(--status-expired-bg)', color: 'var(--status-expired-fg)',
          fontFamily: 'var(--font-body)', fontSize: 12,
        }}>
          Hay un repuesto cotizado sin stock — sujeto a disponibilidad.
        </div>
      )}

      {abierto && (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
          <thead>
            <tr>
              <th style={{ ...encabezado, width: 110 }} title="Queda en el presupuesto y sale en el PDF, pero no suma al total">
                Opcional
              </th>
              <th style={{ ...encabezado, width: 150 }}>Código</th>
              <th style={encabezado}>Descripción</th>
              <th style={{ ...encabezado, width: 100 }}>Marca</th>
              <th style={{ ...encabezado, width: 70 }}>Medida</th>
              <th style={{ ...encabezado, width: 130, textAlign: 'right' }}>P. unitario</th>
              <th style={{ ...encabezado, width: 140, textAlign: 'center' }}>Cantidad</th>
              <th style={{ ...encabezado, width: 140, textAlign: 'right' }}>Subtotal</th>
              <th style={{ ...encabezado, width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {familias.flatMap((familia) => [
              // Encabezado de la familia: las medidas de un mismo repuesto se
              // agregan juntas al elegir una, así que también se sacan juntas.
              familia.esFamilia ? (
                <tr key={`fam-${familia.base}`} data-familia={familia.base}>
                  <td colSpan={8} style={{ ...celda, ...lineaFamilia, padding: '8px 12px', background: 'var(--surface-sunken)' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <CodigoRepuesto>{familia.base}</CodigoRepuesto>
                      <span>
                        {familia.marca ? `${familia.marca} · ` : ''}
                        {`${familia.opciones.length} medidas del mismo repuesto`}
                      </span>
                    </span>
                  </td>
                  <td style={{ ...celda, padding: '8px 12px', background: 'var(--surface-sunken)', textAlign: 'center' }}>
                    <button
                      onClick={() => onQuitarVarias?.(familia.keys)}
                      title={`Quitar las ${familia.opciones.length} medidas de ${familia.base}`}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }}
                    >
                      <Icon n="trash" s={16} />
                    </button>
                  </td>
                </tr>
              ) : null,
              ...familia.opciones.map((it) => {
                const sospechosa = sospechosas.has(it.repuesto_codigo || it.key)
                const primeraCelda = familia.esFamilia ? { ...celda, ...lineaFamilia } : celda
                return (
                // data-familia: qué códigos son la misma pieza en otra medida.
                // Es lo que dibuja la línea roja, y lo que mira la suite de UI
                // para verificar que una familia nunca queda partida.
                <tr
                  key={it.key}
                  data-familia={familia.esFamilia ? familia.base : ''}
                  data-opcional={it.opcional ? '1' : '0'}
                  style={it.opcional ? { background: 'var(--surface-sunken)' } : undefined}
                >
                  <td style={primeraCelda}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(it.opcional)}
                        onChange={() => onToggleOpcional?.(it.key)}
                        title="Opcional: queda guardado y sale en el PDF aparte, pero no suma al total"
                        style={{ width: 16, height: 16, cursor: 'pointer' }}
                      />
                      {it.opcional && <StatusBadge status="aviso">Opcional</StatusBadge>}
                    </label>
                  </td>
                  <td style={celda}>
                    <CodigoRepuesto>{it.repuesto_codigo || 'Sin código'}</CodigoRepuesto>
                  </td>
                  <td style={celda}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                      <span style={{ fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)' }}>{it.descripcion}</span>
                      {it.stock === 0 && (
                        <StatusBadge status="expired" title="Sin stock — sujeto a disponibilidad">Sin stock</StatusBadge>
                      )}
                      {sospechosa && (
                        <StatusBadge
                          status="aviso"
                          style={{ alignSelf: 'flex-start' }}
                          title="El subtotal quedó muy por debajo del resto del grupo. Suele pasar cuando esa marca viene en un envase más chico y falta ajustarle la cantidad."
                        >
                          ¿cantidad correcta?
                        </StatusBadge>
                      )}
                    </div>
                  </td>
                  <td style={celda}>{it.marca || '—'}</td>
                  <td style={celda}>{it.medida || '—'}</td>
                  <td style={{ ...celda, textAlign: 'right' }}>
                    <TextField
                      value={it.precioTexto ?? ''}
                      onChange={(e) => onCambiarPrecio(it.key, e.target.value)}
                      title="Precio unitario — se puede editar"
                      style={{
                        width: 110, textAlign: 'right',
                        borderColor: it.precio_unitario === null ? 'var(--status-expired-fg)' : undefined,
                      }}
                    />
                  </td>
                  <td style={{ ...celda, textAlign: 'center' }}>
                    <ContadorCantidad
                      cantidad={it.cantidad}
                      onChange={(n) => onCambiarCantidad(it.key, n)}
                    />
                  </td>
                  {/* El subtotal también se edita: lo que se escribe acá se
                      reparte por la cantidad y pisa el precio unitario. */}
                  <td style={{ ...celda, textAlign: 'right' }}>
                    <CampoMonto
                      valor={textoSubtotal(it.precio_unitario, it.cantidad)}
                      onEscribir={(texto) => onCambiarSubtotal(it.key, texto)}
                      title="Subtotal — se puede editar; el precio unitario se recalcula solo"
                      style={{
                        width: 120, textAlign: 'right', fontWeight: 600,
                        borderColor: it.precio_unitario === null ? 'var(--status-expired-fg)' : undefined,
                      }}
                    />
                  </td>
                  <td style={{ ...celda, textAlign: 'center' }}>
                    <button
                      onClick={() => onQuitar(it.key)}
                      title={familia.esFamilia ? `Quitar solo la medida ${it.medida || ''}`.trim() : 'Quitar'}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }}
                    >
                      <Icon n="trash" s={16} />
                    </button>
                  </td>
                </tr>
                )
              }),
            ])}
          </tbody>
        </table>
      </div>
      )}
    </div>
  )
}
