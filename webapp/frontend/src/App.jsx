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
import PresupuestoRapido from './screens/Presupuestos/PresupuestoRapido'
import DetallePresupuesto from './screens/Presupuestos/Detalle'
import PedidoRepuestos from './screens/Presupuestos/Pedido'
import PreciosScreen from './screens/Precios/PreciosScreen'
import RepuestosScreen from './screens/Repuestos/RepuestosScreen'
import BusquedaMedidasScreen from './screens/BusquedaMedidas/BusquedaMedidasScreen'
import TallerScreen from './screens/Taller/TallerScreen'
import OrdenTrabajo from './screens/Taller/OrdenTrabajo'

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

// El taller entra al mismo sistema pero sólo ve el panel de trabajos: cualquier
// otra ruta lo devuelve ahí. No es una medida de seguridad —de eso se encarga el
// backend, que le cierra toda la API con precios— sino de no mostrarle pantallas
// que le van a dar error.
function SoloOficina({ children }) {
  const { esTaller } = useAuth()
  if (esTaller) return <Navigate to="/taller" replace />
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
        <Route index element={<Inicio />} />
        <Route path="taller" element={<TallerScreen />} />
        <Route path="taller/:id" element={<OrdenTrabajo />} />
        <Route path="motores" element={<SoloOficina><MotoresScreen /></SoloOficina>} />
        <Route path="excel" element={<SoloOficina><ExcelScreen /></SoloOficina>} />
        <Route path="clientes" element={<SoloOficina><ClientesScreen /></SoloOficina>} />
        <Route path="clientes/:id" element={<SoloOficina><ClienteDetalle /></SoloOficina>} />
        <Route path="presupuestos" element={<SoloOficina><HistorialPresupuestos /></SoloOficina>} />
        <Route path="presupuestos/nuevo" element={<SoloOficina><WizardPresupuesto /></SoloOficina>} />
        <Route path="presupuestos/nuevo/rapido" element={<SoloOficina><PresupuestoRapido /></SoloOficina>} />
        <Route path="presupuestos/:id" element={<SoloOficina><DetallePresupuesto /></SoloOficina>} />
        <Route path="presupuestos/:id/pedido" element={<SoloOficina><PedidoRepuestos /></SoloOficina>} />
        <Route path="precios" element={<SoloOficina><PreciosScreen /></SoloOficina>} />
        <Route path="repuestos" element={<SoloOficina><RepuestosScreen /></SoloOficina>} />
        <Route path="busqueda-medidas" element={<SoloOficina><BusquedaMedidasScreen /></SoloOficina>} />
        <Route path="*" element={<Inicio />} />
      </Route>
    </Routes>
  )
}

// Cada rol arranca donde trabaja: la oficina en el listado de motores, el
// taller en su panel.
function Inicio() {
  const { esTaller } = useAuth()
  return <Navigate to={esTaller ? '/taller' : '/motores'} replace />
}

export default App
