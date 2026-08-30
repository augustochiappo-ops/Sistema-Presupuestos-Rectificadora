import React from 'react'
import { Icon } from '../../../components/Icon'
import { formatPrecioARS } from '../../../utils/format'

/*
 * "Editaste estos precios: ¿son tu tarifa de ahora en más?"
 *
 * El cierre del paso de Revisión para el que corrigió ocho renglones y no
 * quiere ocho clicks. El botón ⤓ de cada línea (paso Servicios) sirve para
 * decidirlo sobre la marcha; esto sirve para decidirlo todo junto, al final,
 * que es cuando uno ya sabe si el precio que puso fue una concesión a este
 * cliente o su precio nuevo.
 *
 * Se listan las líneas con su precio viejo y el nuevo. Un tilde ciego que
 * dijera "guardar los precios editados" no alcanza: la diferencia entre un
 * descuento puntual y una decisión de tarifa está justo en esos montos, así
 * que hay que poder verlos antes de decidir.
 *
 * Solo entran los trabajos de la lista de la Cámara: un ítem manual no tiene
 * lista a la cual pertenecer, y su precio ya es a mano por definición.
 */
export function ResumenPreciosEditados({ lineas, listaNum, marcado, onMarcar }) {
  // `onMarcar` sube las líneas exactas a guardar (o null). El wizard no vuelve a
  // filtrar: si lo hiciera con otro criterio, se guardaría algo distinto de lo
  // que el dueño vio listado acá, que es justo lo que no puede pasar.
  //
  // Ojo con el orden: los hooks van todos ANTES de cualquier return temprano
  // (listaNum sin cargar, o sin líneas editadas), porque React exige que la
  // cantidad de hooks no cambie entre renders.
  //
  // Solo entra lo que de verdad cambia la tarifa. `pisado` dice que se tocó el
  // campo, pero tocarlo y dejar el mismo número no es una decisión de precio:
  // ofrecer guardar un "$ 999.000 → $ 999.000" es ruido, y guardarlo dejaría un
  // renglón de historial que no registra ningún cambio.
  const editadas = (listaNum ? lineas : []).filter((l) => (
    l.pisado && !l.esManual && l.precioUnitario != null && l.precioUnitario !== l.precioLista
  ))
  const aGuardar = editadas.map((l) => ({ servicio_id: l.servicioId, precio: l.precioUnitario }))
  const firma = JSON.stringify(aGuardar)

  /*
   * Mantiene al día lo que se va a guardar. Sin esto, tildar la casilla y
   * después volver atrás a corregir un precio guardaría el número viejo: la
   * casilla seguiría marcada, pero con la foto de antes. Lo que se guarda tiene
   * que ser siempre lo que dice la lista de acá abajo.
   */
  React.useEffect(() => {
    if (marcado && JSON.stringify(marcado) !== firma) onMarcar(JSON.parse(firma))
  }, [marcado, firma, onMarcar])

  if (!listaNum || editadas.length === 0) return null

  return (
    <div style={{
      border: `1px solid ${marcado ? 'var(--status-active-fg)' : 'var(--border-default)'}`,
      background: 'var(--surface-card)',
      borderRadius: 'var(--radius-xl)', padding: 16,
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={marcado}
          onChange={(e) => onMarcar(e.target.checked ? aGuardar : null)}
          style={{ width: 17, height: 17, marginTop: 2, flexShrink: 0, cursor: 'pointer', accentColor: 'var(--text-strong)' }}
        />
        <span>
          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>
            Guardar {editadas.length === 1 ? 'este precio' : `estos ${editadas.length} precios`} como mi tarifa
            {' '}<span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>(lista {listaNum})</span>
          </span>
          <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
            Se usan en los próximos presupuestos de motores de esta lista. Este presupuesto
            sale igual con o sin el tilde, y los ya emitidos no cambian.
          </span>
        </span>
      </label>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 27 }}>
        {editadas.map((l) => (
          <div
            key={l.id}
            style={{
              display: 'flex', alignItems: 'baseline', gap: 10,
              fontFamily: 'var(--font-body)', fontSize: 12,
              color: marcado ? 'var(--text-body)' : 'var(--text-muted)',
            }}
          >
            <span style={{ color: 'var(--text-faint)', flexShrink: 0 }}>·</span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {l.descripcion}
            </span>
            <span style={{ color: 'var(--text-faint)', flexShrink: 0 }}>
              {formatPrecioARS(l.precioLista)}
            </span>
            <span style={{ color: 'var(--text-faint)', flexShrink: 0 }}>→</span>
            <span style={{ fontWeight: 600, color: 'var(--text-strong)', flexShrink: 0, minWidth: 96, textAlign: 'right' }}>
              {formatPrecioARS(l.precioUnitario)}
            </span>
          </div>
        ))}
      </div>

      {marcado && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 27,
          fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--status-active-fg)',
        }}>
          <Icon n="check" s={14} />
          <span>Se van a guardar al confirmar. Después se pueden deshacer desde Editar Precios.</span>
        </div>
      )}
    </div>
  )
}
