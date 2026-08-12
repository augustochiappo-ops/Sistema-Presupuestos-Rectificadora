import React from 'react'
import { TextField } from '../../../components/TextField'
import { StatusBadge } from '../../../components/StatusBadge'
import { Icon } from '../../../components/Icon'
import { CodigoRepuesto } from '../../../components/CodigoRepuesto'
import { formatPrecioARS } from '../../../utils/format'
import {
  agruparLineas, opcionElegida, ahorroDelGrupo, subtotalDe,
  codigosConCantidadSospechosa, masBarataDelGrupo, familiasOrdenadas,
} from '../../../utils/grupos'

const botonCantidad = {
  width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border-default)',
  background: 'var(--surface-card)', cursor: 'pointer', fontSize: 15, lineHeight: 1,
  color: 'var(--text-strong)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
}

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
 * Pop-up "Ver repuestos". Muestra los repuestos agrupados por categoría: dentro
 * de cada grupo, la opción con la que se cotiza (la de mayor subtotal) va
 * marcada y arriba, y debajo el resto, que quedan guardadas para el pedido.
 *
 * Cantidad y precio se editan por opción: es donde se corrige el caso de los
 * envases distintos (una marca viene por blíster de 8 y otra por blíster de 4).
 */
export function ModalRepuestosAgregados({
  open, items, elegidaAMano = {}, onElegirAMano,
  onCambiarCantidad, onCambiarPrecio, onQuitar, onQuitarVarias, onClose,
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

  const totalGeneral = grupos.reduce((acc, g) => {
    const elegida = opcionElegida(g.opciones, elegidaAMano[g.categoria])
    return acc + (elegida ? subtotalDe(elegida) : 0)
  }, 0) + sueltas.reduce((acc, l) => acc + subtotalDe(l), 0)

  const ahorroTotal = grupos.reduce((acc, g) => {
    const elegida = opcionElegida(g.opciones, elegidaAMano[g.categoria])
    return acc + ahorroDelGrupo(g.opciones, elegida)
  }, 0)

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
              Se cotiza el más caro de cada grupo · Total {formatPrecioARS(totalGeneral)}
              {ahorroTotal > 0 && ` · Ahorro potencial ${formatPrecioARS(ahorroTotal)}`}
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
              codigoAMano={elegidaAMano[g.categoria]}
              onElegirAMano={onElegirAMano}
              onCambiarCantidad={onCambiarCantidad}
              onCambiarPrecio={onCambiarPrecio}
              onQuitar={onQuitar}
              onQuitarVarias={onQuitarVarias}
            />
          ))}

          {sueltas.length > 0 && (
            <Grupo
              grupo={{ categoria: 'Sin categoría', opciones: sueltas }}
              sueltas
              abierto={!cerrados.includes('__sueltas__')}
              onAlternar={() => alternar('__sueltas__')}
              onCambiarCantidad={onCambiarCantidad}
              onCambiarPrecio={onCambiarPrecio}
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
  grupo, codigoAMano, onElegirAMano, sueltas, abierto = true, onAlternar,
  onCambiarCantidad, onCambiarPrecio, onQuitar, onQuitarVarias,
}) {
  const elegida = sueltas ? null : opcionElegida(grupo.opciones, codigoAMano)
  const ahorro = sueltas ? 0 : ahorroDelGrupo(grupo.opciones, elegida)
  const sospechosas = React.useMemo(() => codigosConCantidadSospechosa(grupo.opciones), [grupo.opciones])
  const elegidaSinStock = elegida && elegida.stock === 0
  const hayAlternativaConStock = grupo.opciones.some((o) => o.stock === 1 && o !== elegida)

  // Los dos extremos del grupo, para marcarlos en la columna "Cotiza": son la
  // decisión que el taller toma acá (con cuál cotizar, cuál conviene pedir).
  // La más cara se calcula sin mirar la elección a mano: si el usuario pisó al
  // más caro, el chip de la elegida ya dice "Elegido a mano" y la nota tiene
  // que seguir señalando cuál era el más caro de verdad.
  const masCara = sueltas ? null : opcionElegida(grupo.opciones, null)
  // Si ninguna de las baratas tiene stock igual se marca cuál es la más barata
  // (el chip "Sin stock" ya está en su fila): la pregunta que contesta la nota
  // es "cuál me conviene pedir", no "cuál hay hoy".
  const masBarata = sueltas
    ? null
    : (masBarataDelGrupo(grupo.opciones) || masBarataDelGrupo(grupo.opciones, false))
  // Con todos los precios iguales no hay extremos que marcar: sería ruido.
  const hayExtremos = !sueltas && masCara && masBarata && subtotalDe(masCara) > subtotalDe(masBarata)

  // Las medidas de un mismo repuesto (STD, 025, 050…) van SIEMPRE juntas y con
  // una línea al costado: son la misma pieza. Ordenar las opciones sueltas por
  // precio y agrupar después metía el código sin familia entre las medidas de
  // otro, y parecía una medida más de esa familia (bug reportado por el dueño).
  const familias = React.useMemo(
    () => familiasOrdenadas(grupo.opciones, elegida),
    [grupo.opciones, elegida],
  )

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
            {sueltas
              ? `repuesto${grupo.opciones.length === 1 ? '' : 's'}`
              : `${grupo.opciones.length === 1 ? 'opción' : 'opciones'}`}
          </span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {ahorro > 0 && (
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-muted)' }}>
              Ahorro potencial <strong>{formatPrecioARS(ahorro)}</strong>
            </span>
          )}
          {elegida && (
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-strong)' }}>
              Cotiza {formatPrecioARS(subtotalDe(elegida))}
            </span>
          )}
        </div>
      </div>

      {abierto && elegidaSinStock && hayAlternativaConStock && (
        <div style={{
          padding: '8px 16px', background: 'var(--status-expired-bg)', color: 'var(--status-expired-fg)',
          fontFamily: 'var(--font-body)', fontSize: 12,
        }}>
          El repuesto que se está cotizando no tiene stock, pero otra opción del grupo sí.
        </div>
      )}

      {abierto && (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ ...encabezado, width: 120 }}>{sueltas ? '' : 'Cotiza'}</th>
              <th style={{ ...encabezado, width: 150 }}>Código</th>
              <th style={encabezado}>Descripción</th>
              <th style={{ ...encabezado, width: 100 }}>Marca</th>
              <th style={{ ...encabezado, width: 70 }}>Medida</th>
              <th style={{ ...encabezado, width: 130, textAlign: 'right' }}>P. unitario</th>
              <th style={{ ...encabezado, width: 140, textAlign: 'center' }}>Cantidad</th>
              <th style={{ ...encabezado, width: 120, textAlign: 'right' }}>Subtotal</th>
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
                const esElegida = it === elegida
                const sospechosa = sospechosas.has(it.repuesto_codigo || it.key)
                const primeraCelda = familia.esFamilia ? { ...celda, ...lineaFamilia } : celda
                return (
                // data-familia: qué códigos son la misma pieza en otra medida.
                // Es lo que dibuja la línea roja, y lo que mira la suite de UI
                // para verificar que una familia nunca queda partida.
                <tr
                  key={it.key}
                  data-familia={familia.esFamilia ? familia.base : ''}
                  style={esElegida ? { background: 'var(--status-active-bg)' } : undefined}
                >
                  <td style={primeraCelda}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                      {sueltas ? null : esElegida ? (
                        <StatusBadge status="active">
                          {codigoAMano === it.repuesto_codigo ? 'Elegido a mano' : 'El más caro'}
                        </StatusBadge>
                      ) : (
                        <button
                          onClick={() => onElegirAMano?.(grupo.categoria, it.repuesto_codigo)}
                          title="Cotizar con este en vez del más caro"
                          style={{
                            border: '1px solid var(--border-default)', background: 'var(--surface-card)',
                            borderRadius: 'var(--radius-pill)', padding: '4px 10px', cursor: 'pointer',
                            fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-muted)',
                          }}
                        >
                          Usar este
                        </button>
                      )}
                      {/* Si la fila ya lleva el chip "El más caro", la nota diría
                          lo mismo dos veces. Solo aparece cuando aporta algo:
                          en las filas que no cotizan, o cuando se eligió a mano. */}
                      {hayExtremos && it === masCara && !(esElegida && codigoAMano !== it.repuesto_codigo) && (
                        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>El más caro</span>
                      )}
                      {hayExtremos && it === masBarata && (
                        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>El más barato</span>
                      )}
                    </div>
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
                      style={{
                        width: 110, textAlign: 'right',
                        borderColor: it.precio_unitario === null ? 'var(--status-expired-fg)' : undefined,
                      }}
                    />
                  </td>
                  <td style={{ ...celda, textAlign: 'center' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <button style={botonCantidad} onClick={() => onCambiarCantidad(it.key, Math.max(0, (it.cantidad || 0) - 1))}>−</button>
                      <input
                        type="number" min="0" step="1"
                        value={it.cantidad}
                        onChange={(e) => onCambiarCantidad(it.key, parseFloat(e.target.value))}
                        style={{
                          width: 56, height: 28, textAlign: 'center', borderRadius: 8,
                          border: `1px solid ${it.cantidad > 0 ? 'var(--border-default)' : 'var(--status-expired-fg)'}`,
                          background: 'var(--surface-card)', color: 'var(--text-strong)',
                          fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                        }}
                      />
                      <button style={botonCantidad} onClick={() => onCambiarCantidad(it.key, (it.cantidad || 0) + 1)}>+</button>
                    </span>
                  </td>
                  <td style={{ ...celda, textAlign: 'right', fontWeight: 600, color: esElegida ? 'var(--text-strong)' : 'var(--text-muted)' }}>
                    {formatPrecioARS(subtotalDe(it))}
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
