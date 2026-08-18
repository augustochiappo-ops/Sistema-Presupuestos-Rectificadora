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
import { FichaRepuestos } from './FichaRepuestos'
import { formatPrecioARS, formatFechaAR, estadoPresupuesto } from '../../utils/format'
import { coincideBusqueda } from '../../utils/texto'

export default function MotoresScreen() {
  const navigate = useNavigate()
  const [motorSel, setMotorSel] = React.useState(null)
  const [servicios, setServicios] = React.useState([])
  const [busquedaServicios, setBusquedaServicios] = React.useState('')
  const [cargando, setCargando] = React.useState(false)
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
  }

  const abrirPresupuestosVinculados = () => {
    setModalPresupuestos(true)
    setCargandoPresupuestos(true)
    api.get(`/motores/${motorSel.id}/presupuestos`)
      .then(setPresupuestosVinculados)
      .finally(() => setCargandoPresupuestos(false))
  }

  if (motorSel) {
    const filtrados = servicios.filter(
      (s) => coincideBusqueda([String(s.item_num), s.descripcion], busquedaServicios),
    )
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

        <FichaRepuestos motor={motorSel} />

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
