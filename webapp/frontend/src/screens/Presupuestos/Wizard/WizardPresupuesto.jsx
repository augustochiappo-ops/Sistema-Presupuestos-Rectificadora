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

const PASOS = ['Cliente', 'Motor', 'Servicios']

export default function WizardPresupuesto() {
  const navigate = useNavigate()
  const [paso, setPaso] = React.useState(0)
  const [cliente, setCliente] = React.useState('')
  const [motor, setMotor] = React.useState(null)
  const [error, setError] = React.useState('')
  const [guardando, setGuardando] = React.useState(false)

  const finalizar = async (items) => {
    setGuardando(true)
    setError('')
    // Se abre la pestaña ya (en blanco) dentro del gesto de click, sin esperar la
    // respuesta del servidor: si se abre recién después del await, el navegador
    // suele bloquearla como popup por no considerarla parte de la interacción del usuario.
    const pdfTab = window.open('', '_blank')
    try {
      const presupuesto = await api.post('/presupuestos', {
        cliente_nombre: cliente,
        motor_id: motor.id,
        items,
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Nuevo Presupuesto"
        subtitle={`Paso ${paso + 1} de 3 — ${PASOS[paso]}`}
        actions={
          <Button variant="secondary" iconLeft={<Icon n="arrow-left" s={16} />} onClick={volver}>
            Volver
          </Button>
        }
      />

      <ErrorBanner message={error} onClose={() => setError('')} />

      {paso === 0 && (
        <PasoCliente valorInicial={cliente} onSiguiente={(nombre) => { setCliente(nombre); setPaso(1) }} />
      )}

      {paso === 1 && (
        <MotorSelector onSelect={(m) => { setMotor(m); setPaso(2) }} />
      )}

      {paso === 2 && motor && (
        <PasoServicios motor={motor} onFinalizar={finalizar} guardando={guardando} />
      )}
    </div>
  )
}
