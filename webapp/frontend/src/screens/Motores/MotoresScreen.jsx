import React from 'react'
import { api } from '../../api/client'
import { PageHeader } from '../../components/PageHeader'
import { DataTable } from '../../components/DataTable'
import { SearchInput } from '../../components/SearchInput'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { MotorSelector } from '../../components/MotorSelector'
import { formatPrecioARS } from '../../utils/format'

export default function MotoresScreen() {
  const [motorSel, setMotorSel] = React.useState(null)
  const [servicios, setServicios] = React.useState([])
  const [busquedaServicios, setBusquedaServicios] = React.useState('')
  const [cargando, setCargando] = React.useState(false)

  const abrirMotor = (motor) => {
    setMotorSel(motor)
    setBusquedaServicios('')
    setCargando(true)
    api.get(`/motores/${motor.id}/servicios`)
      .then(setServicios)
      .finally(() => setCargando(false))
  }

  if (motorSel) {
    const filtrados = servicios.filter((s) => {
      const q = busquedaServicios.toLowerCase()
      if (!q) return true
      return String(s.item_num).includes(q) || (s.descripcion || '').toLowerCase().includes(q)
    })

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <PageHeader
          title={motorSel.motor}
          subtitle={motorSel.lista_num ? `Lista N.° ${motorSel.lista_num}` : 'Sin lista de precios asignada'}
          actions={
            <Button variant="secondary" iconLeft={<Icon n="arrow-left" s={16} />} onClick={() => setMotorSel(null)}>
              Volver al listado
            </Button>
          }
        />
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
