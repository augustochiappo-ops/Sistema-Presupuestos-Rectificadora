import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { Shell } from './layout/Shell'
import Login from './screens/Login'
import MotoresScreen from './screens/Motores/MotoresScreen'
import ExcelScreen from './screens/Excel/ExcelScreen'
import ClientesScreen from './screens/Clientes/ClientesScreen'
import ClienteDetalle from './screens/Clientes/ClienteDetalle'
import HistorialPresupuestos from './screens/Presupuestos/Historial'
import WizardPresupuesto from './screens/Presupuestos/Wizard/WizardPresupuesto'
import DetallePresupuesto from './screens/Presupuestos/Detalle'
import PreciosPlaceholder from './screens/Precios/PlaceholderScreen'

function Cargando() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
      Cargando…
    </div>
  )
}

function RutaProtegida({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Cargando />
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return children
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RutaProtegida>
            <Shell />
          </RutaProtegida>
        }
      >
        <Route index element={<Navigate to="/motores" replace />} />
        <Route path="motores" element={<MotoresScreen />} />
        <Route path="excel" element={<ExcelScreen />} />
        <Route path="clientes" element={<ClientesScreen />} />
        <Route path="clientes/:id" element={<ClienteDetalle />} />
        <Route path="presupuestos" element={<HistorialPresupuestos />} />
        <Route path="presupuestos/nuevo" element={<WizardPresupuesto />} />
        <Route path="presupuestos/:id" element={<DetallePresupuesto />} />
        <Route path="precios" element={<PreciosPlaceholder />} />
        <Route path="*" element={<Navigate to="/motores" replace />} />
      </Route>
    </Routes>
  )
}

export default App
