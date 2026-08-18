import React from 'react'
import { api } from '../../../api/client'
import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import { DataTable } from '../../../components/DataTable'
import { StatusBadge } from '../../../components/StatusBadge'
import { CajaOpcionales, BotonOpcional } from '../../../components/CajaOpcionales'
import { useArrastreOpcionales } from '../../../hooks/useArrastreOpcionales'
import { formatPrecioARS } from '../../../utils/format'
import { lineasServicios, totalLineas, hayPreciosInvalidos } from '../../../utils/servicios'
import { subtotalDe } from '../../../utils/grupos'

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
 */
export function PasoRevision({
  cliente, motor, serviciosSel, ajustePct, repuestos,
  onMoverServicio, onMoverRepuesto, onConfirmar, guardando,
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

  const { zonaActiva, propsFila, propsZona } = useArrastreOpcionales(mover)

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
      subtotal: f.subtotal,
    })),
    ...filasRepuestos.filter((f) => f.opcional).map((f) => ({
      id: `op-${f.id}`,
      clave: f.clave,
      tipo: f.categoria,
      detalle: f.repuesto,
      cantidad: f.cantidad,
      precioUnitario: f.precioUnitario,
      subtotal: f.subtotal,
    })),
  ]

  const totalServicios = totalLineas(filasServicios)
  const totalRepuestosCotizados = repuestosCotizan.reduce((acc, f) => acc + (f.subtotal || 0), 0)
  const totalOpcionales = opcionales.reduce((acc, f) => acc + (f.subtotal || 0), 0)
  const totalGeneral = totalServicios + totalRepuestosCotizados
  const hayItems = serviciosCotizan.length > 0 || repuestosCotizan.length > 0
  // Red de seguridad: el paso Servicios ya no deja avanzar con un precio que no
  // se entiende, pero si alguno se colara igual el backend descartaría el ítem.
  const preciosInvalidos = hayPreciosInvalidos(filasServicios)

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
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-md)', fontWeight: 600, color: '#fff' }}>Total</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 700, color: '#fff' }}>{formatPrecioARS(totalGeneral)}</span>
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

      {!hayItems && (
        <div style={{ textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
          El presupuesto quedó vacío. Volvé atrás y agregá al menos un servicio o un repuesto.
        </div>
      )}

      {preciosInvalidos && (
        <div style={{ textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--status-expired-fg)' }}>
          Hay un precio de mano de obra que no se entiende como número. Volvé al paso Servicios y corregilo.
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
          <Campo label="Ajuste mano de obra" valor={`${ajustePct > 0 ? '+' : ''}${ajustePct}%`} />
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
              { key: 'cantidad', header: 'Cant.', align: 'center', width: 70 },
              { key: 'precioUnitario', header: 'P. unitario', align: 'right', width: 145, wrap: true, render: formatPrecioARS },
              { key: 'subtotal', header: 'Subtotal', align: 'right', width: 155, wrap: true, strong: true, render: formatPrecioARS },
              columnaMover,
            ]}
            rows={serviciosCotizan.map((f) => ({ ...f, clave: `servicio:${f.id}` }))}
            getRowProps={(fila) => propsFila(fila.clave)}
            reorderKey="revision-servicios"
            emptyMessage="Este presupuesto no lleva mano de obra."
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={tituloSeccion}>Repuestos</div>
          <DataTable
            columns={[
              { key: 'categoria', header: 'Categoría', width: 170, strong: true, wrap: true },
              { key: 'repuesto', header: 'Repuesto', wrap: true },
              { key: 'cantidad', header: 'Cant.', align: 'center', width: 70 },
              { key: 'precioUnitario', header: 'P. unitario', align: 'right', width: 145, wrap: true, render: formatPrecioARS },
              { key: 'subtotal', header: 'Subtotal', align: 'right', width: 155, wrap: true, strong: true, render: formatPrecioARS },
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
            { key: 'cantidad', header: 'Cant.', align: 'center', width: 70 },
            { key: 'precioUnitario', header: 'P. unitario', align: 'right', width: 145, wrap: true, render: formatPrecioARS },
            { key: 'subtotal', header: 'Subtotal', align: 'right', width: 155, wrap: true, strong: true, render: formatPrecioARS },
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
        Esta pantalla es interna: el PDF que recibe el cliente lleva el detalle de qué se hace y qué se pone,
        con el precio solo en el total. Los opcionales sí van con su precio, en una caja aparte y aclarando
        que no están incluidos.
      </div>
    </div>
  )
}
