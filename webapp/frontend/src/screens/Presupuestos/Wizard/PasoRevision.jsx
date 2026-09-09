import React from 'react'
import { api } from '../../../api/client'
import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import { DataTable } from '../../../components/DataTable'
import { StatusBadge } from '../../../components/StatusBadge'
import { CajaOpcionales, BotonOpcional } from '../../../components/CajaOpcionales'
import { TextField } from '../../../components/TextField'
import { CampoMonto } from '../../../components/CampoMonto'
import { ContadorCantidad } from '../../../components/ContadorCantidad'
import { useArrastreOpcionales } from '../../../hooks/useArrastreOpcionales'
import { formatPrecioARS, parsePrecioARS } from '../../../utils/format'
import { lineasServicios, totalLineas, hayPreciosInvalidos } from '../../../utils/servicios'
import { textoSubtotal } from '../../../utils/precios'
import { subtotalDe } from '../../../utils/grupos'
import { pctParaTotal, avisoDeTotalFijado } from '../../../utils/totalFinal'
import { ResumenPreciosEditados } from './ResumenPreciosEditados'

const TIPO_LABEL = { mecanico: 'Mecánico', dueno: 'Dueño del vehículo' }
const TIPO_OPUESTO = { mecanico: 'dueno', dueno: 'mecanico' }

const tituloSeccion = {
  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
  letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-faint)',
}

const chip = {
  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
  color: 'var(--text-muted)', background: 'var(--surface-sunken)',
  borderRadius: 'var(--radius-pill)', padding: '2px 8px', whiteSpace: 'nowrap',
}

/* El ajuste % ya no siempre es un número redondo: cuando sale de fijar el total
   a mano puede traer decimales (ver utils/totalFinal.js), y se escriben con coma
   como cualquier otro número de la pantalla. */
function fmtPct(pct) {
  return Number(pct).toLocaleString('es-AR', { maximumFractionDigits: 4 })
}

function Campo({ label, valor }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={tituloSeccion}>{label}</span>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-md)', color: 'var(--text-strong)', fontWeight: 600 }}>
        {valor || '—'}
      </span>
    </div>
  )
}

/*
 * Paso 5 del wizard: cómo quedó el presupuesto, ANTES de emitirlo.
 *
 * No guarda nada ni pide nada al backend salvo la lista de mano de obra del
 * motor (para poder mostrar el Nº y la descripción de cada servicio, igual que
 * el PDF). Todo lo demás se calcula con lo que ya está en memoria, con las
 * mismas funciones que usan los pasos anteriores:
 *   - mano de obra → lineasServicios (utils/servicios)
 *   - repuestos    → una línea por repuesto cargado, que es exactamente lo que
 *     guarda el backend en _resolver_grupos: todo lo cargado se cotiza.
 * Así lo que se ve acá es exactamente lo que se va a guardar al confirmar.
 *
 * La tercera caja son los OPCIONALES: se arrastra ahí (o se toca la flechita)
 * cualquier servicio o repuesto que quede fuera del total. Sigue guardado y
 * sale en el PDF, en su propia caja y con precio, pero no se cobra.
 *
 * Desde el 2026-08-19 esta pantalla también EDITA: cantidad, precio unitario y
 * subtotal de cualquier línea —mano de obra, repuestos y opcionales— con la
 * misma lógica del paso Servicios (el que se escribe manda y el otro se
 * recalcula; ver utils/precios.js). Las ediciones suben al wizard, que es donde
 * vive el estado, así que volver atrás las conserva. Bajar una cantidad a 0
 * saca la línea, igual que en los pasos anteriores.
 *
 * Y desde el 2026-09-09 el TOTAL también se escribe a mano: se tipea el número
 * final y el ajuste % de la mano de obra se acomoda solo para dar ese total
 * (ver utils/totalFinal.js). Es la misma idea del par unitario/subtotal —el que
 * se escribe manda y lo otro se recalcula— un piso más arriba.
 */
export function PasoRevision({
  cliente, motor, serviciosSel, ajustePct, onAjustePctChange, repuestos,
  onMoverServicio, onMoverRepuesto, onEditarServicio, onEditarRepuesto,
  onConfirmar, guardando, guardarPrecios, onGuardarPreciosChange,
}) {
  const [servicios, setServicios] = React.useState([])

  React.useEffect(() => {
    let vigente = true
    api.get(`/motores/${motor.id}/servicios`)
      .then((data) => { if (vigente) setServicios(data) })
      .catch(() => {})
    return () => { vigente = false }
  }, [motor.id])

  const filasServicios = React.useMemo(
    () => lineasServicios(servicios, serviciosSel, ajustePct),
    [servicios, serviciosSel, ajustePct],
  )

  // Una fila por repuesto cargado. La categoría agrupa visualmente (y es lo que
  // sale en el PDF), pero cada línea cotiza por su cuenta: dos repuestos de la
  // misma categoría suman los dos.
  const filasRepuestos = React.useMemo(() => repuestos.map((l) => ({
    id: `repuesto-${l.key}`,
    clave: `repuesto:${l.key}`,
    categoria: l.categoria || l.grupo || 'Sin categoría',
    repuesto: l.repuesto_codigo
      ? `${l.repuesto_codigo} — ${l.descripcion || ''}`.trim()
      : (l.descripcion || '—'),
    cantidad: l.cantidad,
    precioUnitario: l.precio_unitario,
    precioTexto: l.precioTexto ?? (l.precio_unitario === null || l.precio_unitario === undefined
      ? '' : formatPrecioARS(l.precio_unitario)),
    subtotal: subtotalDe(l),
    opcional: Boolean(l.opcional),
    lineaKey: l.key,
  })), [repuestos])

  /* Una sola función para las dos tablas: la clave dice de dónde salió la
     línea, porque el arrastre solo puede mover texto. */
  const mover = React.useCallback((clave, opcional) => {
    if (clave.startsWith('repuesto:')) {
      onMoverRepuesto(clave.slice('repuesto:'.length), opcional)
      return
    }
    onMoverServicio(clave.slice('servicio:'.length), opcional)
  }, [onMoverServicio, onMoverRepuesto])

  const { zonaActiva, propsFila, propsZona, propsCampoEditable } = useArrastreOpcionales(mover)

  const serviciosCotizan = filasServicios.filter((f) => !f.opcional)
  const repuestosCotizan = filasRepuestos.filter((f) => !f.opcional)
  const opcionales = [
    ...filasServicios.filter((f) => f.opcional).map((f) => ({
      id: `op-servicio-${f.id}`,
      clave: `servicio:${f.id}`,
      tipo: 'Mano de obra',
      detalle: f.descripcion,
      cantidad: f.cantidad,
      precioUnitario: f.precioUnitario,
      precioTexto: f.precioTexto,
      subtotal: f.subtotal,
      // `fila` es lo que necesitan las funciones de edición para saber dónde
      // escribir; se conserva acá porque la caja de opcionales mezcla las dos
      // clases de línea en una sola tabla.
      fila: f,
    })),
    ...filasRepuestos.filter((f) => f.opcional).map((f) => ({
      id: `op-${f.id}`,
      clave: f.clave,
      tipo: f.categoria,
      detalle: f.repuesto,
      cantidad: f.cantidad,
      precioUnitario: f.precioUnitario,
      precioTexto: f.precioTexto,
      subtotal: f.subtotal,
      lineaKey: f.lineaKey,
    })),
  ]

  const totalServicios = totalLineas(filasServicios)
  const totalRepuestosCotizados = repuestosCotizan.reduce((acc, f) => acc + (f.subtotal || 0), 0)
  const totalOpcionales = opcionales.reduce((acc, f) => acc + (f.subtotal || 0), 0)
  const totalGeneral = totalServicios + totalRepuestosCotizados
  const hayItems = serviciosCotizan.length > 0 || repuestosCotizan.length > 0
  // Desde que esta pantalla también edita, la validación tiene que mirar las dos
  // clases de línea: un precio que no se entiende o una cantidad en cero harían
  // que el backend descartara el ítem en silencio.
  const preciosInvalidos = hayPreciosInvalidos(filasServicios)
    || repuestos.some((r) => r.precio_unitario === null || r.precio_unitario === undefined || !(r.cantidad > 0))

  /*
   * El total, escrito a mano. `totalTexto` en null quiere decir "mostrá el
   * total calculado"; en cuanto se toca el recuadro pasa a mandar lo tipeado.
   *
   * A diferencia del unitario y el subtotal de cada renglón —que se aplican
   * tecla por tecla— éste se aplica recién al salir del recuadro o con Enter.
   * Es a propósito: mueve el precio de TODOS los renglones de mano de obra de
   * una, y hacerlo con el total a medio escribir ("1", "15", "150"…) dejaría el
   * ajuste en el mínimo en cada tecla y la pantalla entera parpadeando.
   *
   * El aviso se guarda junto con el total al que se refiere, así deja de verse
   * solo cuando el total cambia por cualquier otro motivo (se editó un renglón,
   * se movió algo a opcionales) y nunca queda un texto viejo explicando un
   * número que ya no está en pantalla.
   */
  const [totalTexto, setTotalTexto] = React.useState(null)
  const [avisoTotal, setAvisoTotal] = React.useState(null)

  // El total del presupuesto para un ajuste % cualquiera. Se arma con las
  // mismas funciones que dibujan las tablas de arriba, así que el % que
  // devuelve la búsqueda produce exactamente el total que se va a ver acá (y el
  // que va a calcular el backend, que aplica la misma fórmula).
  const totalPara = React.useCallback(
    (pct) => totalLineas(lineasServicios(servicios, serviciosSel, pct)) + totalRepuestosCotizados,
    [servicios, serviciosSel, totalRepuestosCotizados],
  )

  const aplicarTotalEscrito = () => {
    const texto = totalTexto
    setTotalTexto(null)
    // Salir sin haber escrito nada (o borrando todo) no toca el presupuesto:
    // vuelve a verse el total calculado, como si no se hubiera entrado.
    if (texto === null || !texto.trim()) return
    const objetivo = parsePrecioARS(texto)
    if (objetivo === null) {
      setAvisoTotal({ texto: 'Ese total no se entiende como un número.', total: totalGeneral })
      return
    }
    const resultado = pctParaTotal(totalPara, objetivo)
    // 'bajo' y 'alto' son totales que el porcentaje no puede alcanzar. Ahí no se
    // toca nada: aplicar el extremo dejaría el presupuesto en cero o por las
    // nubes, que no es lo que se pidió y habría que deshacer a mano. Se explica
    // hasta dónde llega y el presupuesto queda como estaba.
    const alcanzable = resultado.motivo === null || resultado.motivo === 'salto'
    setAvisoTotal(
      resultado.exacto ? null : {
        texto: avisoDeTotalFijado(resultado, formatPrecioARS),
        total: alcanzable ? resultado.total : totalGeneral,
      },
    )
    if (alcanzable && resultado.pct !== null && resultado.pct !== ajustePct) onAjustePctChange(resultado.pct)
  }

  const tipoContacto = cliente.tipo ? TIPO_OPUESTO[cliente.tipo] : null

  const columnaMover = {
    key: 'mover',
    header: '',
    align: 'center',
    width: 44,
    render: (_, fila) => (
      <BotonOpcional opcional={false} onClick={() => mover(fila.clave, true)} />
    ),
  }

  /*
   * Las tres columnas editables. Se arman con una función porque las usan las
   * tres tablas (mano de obra, repuestos y opcionales) y cada una escribe en un
   * lado distinto: `editar` dice a quién avisarle.
   *
   * Sin useMemo a propósito, igual que en el paso Servicios: las celdas capturan
   * las filas de este render y memorizarlas las dejaría escribiendo sobre una
   * selección vieja.
   */
  const columnasEditables = (editar) => [
    {
      key: 'cantidad',
      header: 'Cant.',
      align: 'center',
      width: 158,
      // wrap:true no por el texto (no tiene) sino para que la celda no recorte:
      // con overflow hidden el "+" del contador deja asomando el "…" del
      // ellipsis, que se lee como un control más.
      wrap: true,
      render: (_, fila) => (
        <span {...propsCampoEditable} style={{ display: 'inline-flex' }}>
          <ContadorCantidad
            cantidad={fila.cantidad}
            onChange={(n) => editar.cantidad(fila, n)}
          />
        </span>
      ),
    },
    {
      key: 'precioUnitario',
      header: 'P. unitario',
      align: 'right',
      width: 158,
      wrap: true,
      render: (_, fila) => (
        <TextField
          value={fila.precioTexto ?? ''}
          onChange={(e) => editar.precio(fila, e.target.value)}
          {...propsCampoEditable}
          title="Precio unitario — se puede editar"
          style={{
            width: 120, textAlign: 'right',
            borderColor: fila.precioUnitario === null || fila.precioUnitario === undefined
              ? 'var(--status-expired-fg)' : undefined,
          }}
        />
      ),
    },
    {
      key: 'subtotal',
      header: 'Subtotal',
      align: 'right',
      width: 168,
      wrap: true,
      render: (_, fila) => (
        <CampoMonto
          valor={textoSubtotal(fila.precioUnitario, fila.cantidad)}
          onEscribir={(texto) => editar.subtotal(fila, texto)}
          {...propsCampoEditable}
          title="Subtotal — se puede editar; el precio unitario se recalcula solo"
          style={{
            width: 130, textAlign: 'right', fontWeight: 600,
            borderColor: fila.subtotal === null || fila.subtotal === undefined
              ? 'var(--status-expired-fg)' : undefined,
          }}
        />
      ),
    },
  ]

  /* Una línea de mano de obra se ubica por la fila entera (servicio de la
     Cámara o ítem manual); una de repuesto, por su key. De ahí que cada tabla
     traiga su propio adaptador. */
  const editarServicioFila = {
    cantidad: (fila, n) => onEditarServicio.cantidad(fila.fila || fila, n),
    precio: (fila, texto) => onEditarServicio.precio(fila.fila || fila, texto),
    subtotal: (fila, texto) => onEditarServicio.subtotal(fila.fila || fila, texto),
  }

  const editarRepuestoFila = {
    cantidad: (fila, n) => onEditarRepuesto.cantidad(fila.lineaKey, n),
    precio: (fila, texto) => onEditarRepuesto.precio(fila.lineaKey, texto),
    subtotal: (fila, texto) => onEditarRepuesto.subtotal(fila.lineaKey, texto),
  }

  /* La caja de opcionales mezcla las dos clases de línea: la de mano de obra
     trae `fila` y la de repuesto trae `lineaKey`. */
  const editarOpcional = {
    cantidad: (fila, n) => (fila.lineaKey ? editarRepuestoFila : editarServicioFila).cantidad(fila, n),
    precio: (fila, texto) => (fila.lineaKey ? editarRepuestoFila : editarServicioFila).precio(fila, texto),
    subtotal: (fila, texto) => (fila.lineaKey ? editarRepuestoFila : editarServicioFila).subtotal(fila, texto),
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Totales y el botón de confirmar arriba de todo, como en los pasos
          anteriores: se puede confirmar sin bajar hasta el final. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: 'var(--surface-inverse)', borderRadius: 'var(--radius-xl)', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'rgba(255,255,255,.75)' }}>
            Mano de obra <strong style={{ color: '#fff' }}>{formatPrecioARS(totalServicios)}</strong>
          </span>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'rgba(255,255,255,.75)' }}>
            Repuestos <strong style={{ color: '#fff' }}>{formatPrecioARS(totalRepuestosCotizados)}</strong>
          </span>
          {/* El total se escribe: lo que se tipee acá es el número final y el
              ajuste % de la mano de obra se acomoda solo para darlo. Va como
              input y no como texto para que se vea que es editable. */}
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-md)', fontWeight: 600, color: '#fff' }}>Total</span>
            <input
              type="text"
              inputMode="decimal"
              value={totalTexto ?? formatPrecioARS(totalGeneral)}
              onChange={(e) => setTotalTexto(e.target.value)}
              onFocus={(e) => setTotalTexto(e.target.value)}
              onBlur={aplicarTotalEscrito}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
              title="Total final — se puede escribir a mano: el ajuste % de la mano de obra se acomoda para dar ese número"
              style={{
                width: 190, height: 42, textAlign: 'right', borderRadius: 8, padding: '0 12px',
                border: '2px solid rgba(255,255,255,.35)', background: 'rgba(255,255,255,.06)', color: '#fff',
                fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 700, outline: 'none',
              }}
            />
          </span>
          {totalOpcionales > 0 && (
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'rgba(255,255,255,.75)' }}>
              Opcionales <strong style={{ color: '#fff' }}>{formatPrecioARS(totalOpcionales)}</strong>
              <span style={{ opacity: .8 }}> (fuera del total)</span>
            </span>
          )}
        </div>
        <Button
          variant="success"
          disabled={!hayItems || preciosInvalidos || guardando}
          iconLeft={<Icon n="check" s={16} />}
          onClick={onConfirmar}
        >
          {guardando ? 'Generando presupuesto…' : 'Confirmar y generar PDF'}
        </Button>
      </div>

      {/* Por qué el total no quedó en el número que se escribió. Se muestra solo
          mientras siga siendo ese total el que está en pantalla. */}
      {avisoTotal && avisoTotal.total === totalGeneral && (
        <div style={{
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', lineHeight: 1.5,
          color: 'var(--status-aviso-fg)', background: 'var(--status-aviso-bg)',
          borderRadius: 'var(--radius-md)', padding: '10px 14px',
        }}>
          {avisoTotal.texto}
        </div>
      )}

      {!hayItems && (
        <div style={{ textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
          El presupuesto quedó vacío. Volvé atrás y agregá al menos un servicio o un repuesto.
        </div>
      )}

      {preciosInvalidos && (
        <div style={{ textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--status-expired-fg)' }}>
          Hay una línea con un precio que no se entiende como número o sin cantidad. Corregila para poder confirmar.
        </div>
      )}

      <div style={{ display: 'flex', gap: 40, alignItems: 'flex-end', flexWrap: 'wrap', padding: '18px 22px', background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)' }}>
        <Campo label="Cliente" valor={cliente.nombre} />
        {cliente.tipo && <Campo label="Tipo" valor={<StatusBadge status={cliente.tipo} />} />}
        {cliente.contacto && (
          <Campo label={TIPO_LABEL[tipoContacto] || 'Contacto'} valor={cliente.contacto} />
        )}
        <Campo label="Motor" valor={motor.motor} />
        {ajustePct !== 0 && (
          <Campo label="Ajuste de este presupuesto" valor={`${ajustePct > 0 ? '+' : ''}${fmtPct(ajustePct)}%`} />
        )}
      </div>

      {/* Las dos cajas del presupuesto son también zona de drop: arrastrar una
          línea de vuelta desde Opcionales la devuelve al total. */}
      <div
        {...propsZona(false)}
        style={{
          display: 'flex', flexDirection: 'column', gap: 14,
          padding: zonaActiva === false ? 8 : 0,
          border: zonaActiva === false ? '2px dashed var(--text-strong)' : 'none',
          borderRadius: 'var(--radius-xl)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={tituloSeccion}>Mano de obra</div>
          <DataTable
            columns={[
              { key: 'itemNum', header: 'Nº', width: 70, render: (v) => v ?? '—' },
              {
                key: 'descripcion', header: 'Descripción', wrap: true,
                render: (v, fila) => (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {v}
                    {fila.pisado && <span style={chip}>precio editado</span>}
                    {fila.esManual && <span style={chip}>ítem manual</span>}
                  </span>
                ),
              },
              ...columnasEditables(editarServicioFila),
              columnaMover,
            ]}
            rows={serviciosCotizan.map((f) => ({ ...f, clave: `servicio:${f.id}`, fila: f }))}
            getRowProps={(fila) => propsFila(fila.clave)}
            reorderKey="revision-servicios"
            emptyMessage="Este presupuesto no lleva mano de obra."
          />

          {/* Va pegado a la tabla y no al pie de la pantalla: las líneas que
              ofrece guardar son las que acaban de verse acá arriba, con su chip
              de "precio editado". Al pie quedaría lejos de lo que explica, y
              además el botón de confirmar está arriba de todo. */}
          {/* filasServicios y no serviciosCotizan: un trabajo que quedó como
              opcional se cobra igual si el cliente lo acepta, así que su precio
              es tarifa lo mismo que el de una línea que suma al total. */}
          <ResumenPreciosEditados
            lineas={filasServicios}
            listaNum={motor?.lista_num}
            marcado={Boolean(guardarPrecios)}
            onMarcar={onGuardarPreciosChange}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={tituloSeccion}>Repuestos</div>
          <DataTable
            columns={[
              { key: 'categoria', header: 'Categoría', width: 170, strong: true, wrap: true },
              { key: 'repuesto', header: 'Repuesto', wrap: true },
              ...columnasEditables(editarRepuestoFila),
              columnaMover,
            ]}
            rows={repuestosCotizan}
            getRowProps={(fila) => propsFila(fila.clave)}
            reorderKey="revision-repuestos"
            emptyMessage="Este presupuesto no lleva repuestos."
          />
        </div>
      </div>

      <CajaOpcionales
        total={totalOpcionales}
        cantidad={opcionales.length}
        activa={zonaActiva === true}
        dropProps={propsZona(true)}
      >
        <DataTable
          columns={[
            { key: 'tipo', header: 'Qué es', width: 170, strong: true, wrap: true },
            { key: 'detalle', header: 'Detalle', wrap: true },
            ...columnasEditables(editarOpcional),
            {
              key: 'volver',
              header: '',
              align: 'center',
              width: 44,
              render: (_, fila) => <BotonOpcional opcional onClick={() => mover(fila.clave, false)} />,
            },
          ]}
          rows={opcionales}
          getRowProps={(fila) => propsFila(fila.clave)}
        />
      </CajaOpcionales>

      <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.5 }}>
        Cantidad, precio unitario y subtotal se editan acá mismo: entre el unitario y el subtotal manda el
        que escribís y el otro se recalcula solo. Como los precios van en pesos enteros, un subtotal que no
        se reparte justo entre la cantidad sube al peso siguiente. Bajar una cantidad a cero saca la línea.
        <br />
        El <strong>total</strong> también se escribe: poné ahí arriba el número que querés cobrar y el ajuste %
        de la mano de obra se acomoda solo para dar ese total (se aplica al salir del recuadro o con Enter).
        No mueve los repuestos ni los precios que hayas puesto a mano en un renglón: esos quedan como están.
        <br />
        Esta pantalla es interna: el PDF que recibe el cliente lleva el detalle de qué se hace y qué se pone,
        con el precio solo en el total. Los opcionales sí van con su precio, en una caja aparte y aclarando
        que no están incluidos.
      </div>
    </div>
  )
}
