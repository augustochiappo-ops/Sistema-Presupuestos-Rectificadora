import React from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../../api/client'
import { PageHeader } from '../../../components/PageHeader'
import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import { ErrorBanner } from '../../../components/ErrorBanner'
import { MotorSelector } from '../../../components/MotorSelector'
import { PasoCliente } from './PasoCliente'
import { PasoServicios } from './PasoServicios'
import { PasoRepuestos } from './PasoRepuestos'

const PASOS = ['Cliente', 'Motor', 'Servicios', 'Repuestos']

export default function WizardPresupuesto() {
  const navigate = useNavigate()
  const [paso, setPaso] = React.useState(0)
  const [cliente, setCliente] = React.useState({ nombre: '', tipo: null, contacto: null })
  const [motor, setMotor] = React.useState(null)
  // La selección de servicios y repuestos vive acá (no en cada paso) para que
  // ir atrás y adelante en el wizard no pierda lo ya elegido.
  const [serviciosSel, setServiciosSel] = React.useState({ cantidades: {}, customItems: [], grupos: {} })
  const [totalServicios, setTotalServicios] = React.useState(0)
  // Aumento/descuento en % sobre los precios de lista de mano de obra (positivo
  // = aumento, negativo = descuento). Vive acá (no en el paso) para no perderse
  // al ir y volver entre pasos, igual que serviciosSel.
  const [ajustePct, setAjustePct] = React.useState(0)
  const [repuestos, setRepuestos] = React.useState([])
  const [error, setError] = React.useState('')
  const [guardando, setGuardando] = React.useState(false)

  const finalizar = async () => {
    setGuardando(true)
    setError('')
    // Se abre la pestaña ya (en blanco) dentro del gesto de click, sin esperar la
    // respuesta del servidor: si se abre recién después del await, el navegador
    // suele bloquearla como popup por no considerarla parte de la interacción del usuario.
    const pdfTab = window.open('', '_blank')
    try {
      const items = [
        ...Object.entries(serviciosSel.cantidades)
          .filter(([, cantidad]) => cantidad > 0)
          .map(([id, cantidad]) => ({ servicio_id: Number(id), cantidad })),
        ...serviciosSel.customItems
          .filter((c) => (c.cantidad || 0) > 0)
          .map((c) => ({
            servicio_id: null,
            descripcion_custom: c.descripcion_custom,
            precio_aplicado: c.precio_aplicado,
            cantidad: c.cantidad,
          })),
        ...repuestos.map((r) => ({
          tipo: 'repuesto',
          repuesto_codigo: r.repuesto_codigo,
          descripcion: r.descripcion,
          categoria: r.categoria,
          cantidad: r.cantidad,
          precio_unitario: r.precio_unitario,
        })),
      ]
      const presupuesto = await api.post('/presupuestos', {
        cliente_nombre: cliente.nombre,
        cliente_tipo: cliente.tipo,
        contacto_nombre: cliente.contacto,
        motor_id: motor.id,
        items,
        ajuste_pct: ajustePct || 0,
      })
      if (pdfTab) pdfTab.location.href = `/api/presupuestos/${presupuesto.id}/pdf/1`
      navigate('/presupuestos')
    } catch (err) {
      if (pdfTab) pdfTab.close()
      setError(err.message || 'No se pudo generar el presupuesto')
    } finally {
      setGuardando(false)
    }
  }

  const volver = () => {
    if (paso === 0) { navigate('/presupuestos'); return }
    setPaso((p) => p - 1)
  }

  const cantidadItemsServicios = Object.values(serviciosSel.cantidades).filter((c) => c > 0).length
    + serviciosSel.customItems.filter((c) => (c.cantidad || 0) > 0).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Nuevo Presupuesto"
        subtitle={`Paso ${paso + 1} de ${PASOS.length} — ${PASOS[paso]}`}
        actions={
          <Button variant="secondary" iconLeft={<Icon n="arrow-left" s={16} />} onClick={volver}>
            Volver
          </Button>
        }
      />

      <ErrorBanner message={error} onClose={() => setError('')} />

      {paso === 0 && (
        <PasoCliente valorInicial={cliente.nombre} onSiguiente={(info) => { setCliente(info); setPaso(1) }} />
      )}

      {paso === 1 && (
        <MotorSelector onSelect={(m) => {
          if (motor && m.id !== motor.id) {
            // Cambió el motor: la selección de servicios (y sus precios de lista)
            // ya no aplica. Los repuestos se conservan: no dependen del motor.
            setServiciosSel({ cantidades: {}, customItems: [], grupos: {} })
            setTotalServicios(0)
          }
          setMotor(m)
          setPaso(2)
        }} />
      )}

      {paso === 2 && motor && (
        <PasoServicios
          motor={motor}
          value={serviciosSel}
          onChange={setServiciosSel}
          ajustePct={ajustePct}
          onAjustePctChange={setAjustePct}
          onSiguiente={(total) => { setTotalServicios(total); setPaso(3) }}
        />
      )}

      {paso === 3 && motor && (
        <PasoRepuestos
          motor={motor}
          value={repuestos}
          onChange={setRepuestos}
          totalServicios={totalServicios}
          hayServicios={cantidadItemsServicios > 0}
          onConfirmar={finalizar}
          guardando={guardando}
        />
      )}
    </div>
  )
}
