import React from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { PageHeader } from '../../components/PageHeader'
import { DataTable } from '../../components/DataTable'
import { SearchInput } from '../../components/SearchInput'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { StatusBadge } from '../../components/StatusBadge'
import { MotorSelector } from '../../components/MotorSelector'
import { formatPrecioARS, formatFechaAR, estadoPresupuesto } from '../../utils/format'

const tituloSeccion = {
  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
  letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-faint)',
}

// Fila de un repuesto sugerido (usado antes en presupuestos de este motor),
// con botón para ocultarlo/mostrarlo. Ocultar no borra nada del historial,
// solo deja de sugerirse en cualquier pantalla (wizard, edición, acá).
function FilaRepuestoSugerido({ r, onToggle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-muted)', width: 110, flexShrink: 0 }}>
        {r.codigo || '—'}
      </span>
      <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-strong)', minWidth: 0 }}>
        {r.descripcion}
      </span>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
        {r.veces_usado}× · último {formatFechaAR(r.ultima_fecha)}
      </span>
      {r.stock_actual === 0 && <StatusBadge status="expired">Sin stock</StatusBadge>}
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, width: 100, textAlign: 'right' }}>
        {r.precio_actual ? formatPrecioARS(r.precio_actual) : '—'}
      </span>
      <button
        onClick={() => onToggle(r.codigo)}
        title={r.oculto ? 'Volver a mostrar' : 'Ocultar de las sugerencias'}
        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }}
      >
        <Icon n={r.oculto ? 'eye' : 'eye-off'} s={16} />
      </button>
    </div>
  )
}

export default function MotoresScreen() {
  const navigate = useNavigate()
  const [motorSel, setMotorSel] = React.useState(null)
  const [servicios, setServicios] = React.useState([])
  const [busquedaServicios, setBusquedaServicios] = React.useState('')
  const [cargando, setCargando] = React.useState(false)
  const [repuestosUsados, setRepuestosUsados] = React.useState([])
  const [verOcultos, setVerOcultos] = React.useState(false)
  const [modalPresupuestos, setModalPresupuestos] = React.useState(false)
  const [presupuestosVinculados, setPresupuestosVinculados] = React.useState([])
  const [cargandoPresupuestos, setCargandoPresupuestos] = React.useState(false)

  const abrirMotor = (motor) => {
    setMotorSel(motor)
    setBusquedaServicios('')
    setCargando(true)
    api.get(`/motores/${motor.id}/servicios`)
      .then(setServicios)
      .finally(() => setCargando(false))
    api.get(`/motores/${motor.id}/repuestos-sugeridos?incluir_ocultos=1`)
      .then(setRepuestosUsados)
      .catch(() => {})
  }

  const toggleOcultoRepuesto = async (codigo) => {
    try {
      const { oculto } = await api.post(`/motores/${motorSel.id}/repuestos-sugeridos/ocultar`, { codigo })
      setRepuestosUsados((prev) => prev.map((r) => (r.codigo === codigo ? { ...r, oculto } : r)))
    } catch {
      // Sin feedback especial: si falla, la fila simplemente no cambia y se puede reintentar.
    }
  }

  const abrirPresupuestosVinculados = () => {
    setModalPresupuestos(true)
    setCargandoPresupuestos(true)
    api.get(`/motores/${motorSel.id}/presupuestos`)
      .then(setPresupuestosVinculados)
      .finally(() => setCargandoPresupuestos(false))
  }

  if (motorSel) {
    const filtrados = servicios.filter((s) => {
      const q = busquedaServicios.toLowerCase()
      if (!q) return true
      return String(s.item_num).includes(q) || (s.descripcion || '').toLowerCase().includes(q)
    })
    const visibles = repuestosUsados.filter((r) => !r.oculto)
    const ocultos = repuestosUsados.filter((r) => r.oculto)

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <PageHeader
          title={motorSel.motor}
          subtitle={motorSel.lista_num ? `Lista N.° ${motorSel.lista_num}` : 'Sin lista de precios asignada'}
          actions={
            <>
              <Button variant="secondary" iconLeft={<Icon n="list-checks" s={16} />} onClick={abrirPresupuestosVinculados}>
                Ver presupuestos vinculados
              </Button>
              <Button variant="secondary" iconLeft={<Icon n="arrow-left" s={16} />} onClick={() => setMotorSel(null)}>
                Volver al listado
              </Button>
            </>
          }
        />

        {repuestosUsados.length > 0 && (
          <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', background: 'var(--surface-card)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={tituloSeccion}>Repuestos usados en presupuestos anteriores</div>
            {visibles.length === 0 && (
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
                No hay repuestos visibles — están todos ocultos.
              </div>
            )}
            {visibles.map((r) => <FilaRepuestoSugerido key={r.codigo} r={r} onToggle={toggleOcultoRepuesto} />)}

            {ocultos.length > 0 && (
              <div>
                <button
                  onClick={() => setVerOcultos((v) => !v)}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: 0, color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}
                >
                  <Icon n={verOcultos ? 'chevron-down' : 'chevron-right'} s={14} />
                  Ver ocultos ({ocultos.length})
                </button>
                {verOcultos && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, paddingLeft: 20 }}>
                    {ocultos.map((r) => <FilaRepuestoSugerido key={r.codigo} r={r} onToggle={toggleOcultoRepuesto} />)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <SearchInput
          icon={<Icon n="search" s={16} />}
          placeholder="Buscar por número o descripción…"
          value={busquedaServicios}
          onChange={(e) => setBusquedaServicios(e.target.value)}
        />
        <DataTable
          columns={[
            { key: 'item_num', header: 'Nº', width: 70 },
            { key: 'descripcion', header: 'Descripción', wrap: true },
            { key: 'precio', header: 'Precio', align: 'right', width: 140, render: formatPrecioARS },
          ]}
          reorderKey="motor-servicios"
          rows={filtrados}
          emptyMessage={cargando ? 'Cargando servicios…' : 'Este motor no tiene servicios con precio.'}
        />

        <Modal open={modalPresupuestos} title={`Presupuestos con ${motorSel.motor}`} onClose={() => setModalPresupuestos(false)}>
          <DataTable
            columns={[
              { key: 'id', header: 'Nº', strong: true, width: 80, render: (v) => `#${String(v).padStart(4, '0')}` },
              { key: 'fecha', header: 'Fecha', width: 120, render: formatFechaAR },
              { key: 'cliente', header: 'Cliente', wrap: true },
              { key: 'total', header: 'Total', align: 'right', width: 140, render: formatPrecioARS },
              { key: 'estado', header: 'Estado', align: 'center', width: 110, render: (_, row) => <StatusBadge status={estadoPresupuesto(row.fecha)} /> },
            ]}
            rows={presupuestosVinculados}
            onRowClick={(p) => { setModalPresupuestos(false); navigate(`/presupuestos/${p.id}`) }}
            emptyMessage={cargandoPresupuestos ? 'Cargando…' : 'Todavía no se hizo ningún presupuesto con este motor.'}
          />
        </Modal>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageHeader title="Listado de Motores" subtitle="Elegí un motor para ver sus servicios y precios." />
      <MotorSelector onSelect={abrirMotor} />
    </div>
  )
}
