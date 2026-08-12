import React from 'react'
import { TextField } from '../../../components/TextField'
import { StatusBadge } from '../../../components/StatusBadge'
import { Icon } from '../../../components/Icon'
import { formatPrecioARS } from '../../../utils/format'
import {
  agruparLineas, opcionElegida, ahorroDelGrupo, subtotalDe,
  codigosConCantidadSospechosa, masBarataDelGrupo, agruparPorFamilia,
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

  if (!open) return null

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
          width: '100%', maxWidth: 1140, maxHeight: '86vh', overflow: 'auto',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
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
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }}>
            <Icon n="x" s={20} />
          </button>
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

function Grupo({ grupo, codigoAMano, onElegirAMano, sueltas, onCambiarCantidad, onCambiarPrecio, onQuitar, onQuitarVarias }) {
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
  const diferencia = hayExtremos && elegida ? subtotalDe(elegida) - subtotalDe(masBarata) : 0

  // La elegida arriba, después de mayor a menor subtotal. Las medidas de un
  // mismo repuesto (STD, 025, 050…) quedan juntas: la familia se ubica donde
  // aparece su primera opción, así la que se cotiza sigue arriba de todo.
  const familias = React.useMemo(() => {
    const resto = grupo.opciones.filter((o) => o !== elegida)
    resto.sort((a, b) => subtotalDe(b) - subtotalDe(a))
    return agruparPorFamilia(elegida ? [elegida, ...resto] : resto)
  }, [grupo.opciones, elegida])

  return (
    <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: '12px 16px', background: 'var(--surface-sunken)', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>
            {grupo.categoria}
          </span>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-faint)' }}>
            {grupo.opciones.length} {sueltas ? 'repuesto' : 'opción'}{grupo.opciones.length === 1 ? '' : sueltas ? 's' : 'es'}
          </span>
        </div>
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

      {elegidaSinStock && hayAlternativaConStock && (
        <div style={{
          padding: '8px 16px', background: 'var(--status-expired-bg)', color: 'var(--status-expired-fg)',
          fontFamily: 'var(--font-body)', fontSize: 12,
        }}>
          El repuesto que se está cotizando no tiene stock, pero otra opción del grupo sí.
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ ...encabezado, width: 130 }}>{sueltas ? '' : 'Cotiza'}</th>
              <th style={encabezado}>Descripción</th>
              <th style={{ ...encabezado, width: 120 }}>Marca</th>
              <th style={{ ...encabezado, width: 80 }}>Medida</th>
              <th style={{ ...encabezado, width: 140, textAlign: 'right' }}>P. unitario</th>
              <th style={{ ...encabezado, width: 150, textAlign: 'center' }}>Cantidad</th>
              <th style={{ ...encabezado, width: 130, textAlign: 'right' }}>Subtotal</th>
              <th style={{ ...encabezado, width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {familias.flatMap((familia) => [
              // Encabezado de la familia: las medidas de un mismo repuesto se
              // agregan juntas al elegir una, así que también se sacan juntas.
              familia.esFamilia ? (
                <tr key={`fam-${familia.base}`}>
                  <td colSpan={7} style={{ ...celda, padding: '8px 12px', background: 'var(--surface-sunken)' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      <strong style={{ color: 'var(--text-strong)' }}>{familia.base}</strong>
                      {familia.marca ? ` · ${familia.marca}` : ''}
                      {` · ${familia.opciones.length} medidas`}
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
                return (
                <tr key={it.key} style={esElegida ? { background: 'var(--status-active-bg)' } : undefined}>
                  <td style={celda}>
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
                        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>El más caro del grupo</span>
                      )}
                      {hayExtremos && it === masBarata && (
                        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                          El más barato{diferencia > 0 ? ` — ${formatPrecioARS(diferencia)} menos` : ''}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={celda}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)' }}>{it.descripcion}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{it.repuesto_codigo || 'Sin código'}</span>
                      {it.stock === 0 && (
                        <StatusBadge status="expired">Sin stock — sujeto a disponibilidad</StatusBadge>
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
                        width: 120, textAlign: 'right',
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
    </div>
  )
}
