import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { Shell } from './layout/Shell'
import Login from './screens/Login'
import { Pantalla } from './pantallas'

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
        <Route path="taller" element={<Pantalla.taller />} />
        <Route path="taller/:id" element={<Pantalla.ordenTrabajo />} />
        <Route path="motores" element={<SoloOficina><Pantalla.motores /></SoloOficina>} />
        <Route path="excel" element={<SoloOficina><Pantalla.excel /></SoloOficina>} />
        <Route path="clientes" element={<SoloOficina><Pantalla.clientes /></SoloOficina>} />
        <Route path="clientes/:id" element={<SoloOficina><Pantalla.clienteDetalle /></SoloOficina>} />
        <Route path="presupuestos" element={<SoloOficina><Pantalla.historial /></SoloOficina>} />
        <Route path="presupuestos/nuevo" element={<SoloOficina><Pantalla.wizard /></SoloOficina>} />
        <Route path="presupuestos/nuevo/rapido" element={<SoloOficina><Pantalla.rapido /></SoloOficina>} />
        {/* La misma pantalla con una dirección corta: es la que abre el ícono
            de la app en el celular (ver public/manifest.webmanifest). */}
        <Route path="rapido" element={<SoloOficina><Pantalla.rapido /></SoloOficina>} />
        <Route path="presupuestos/:id" element={<SoloOficina><Pantalla.detalle /></SoloOficina>} />
        <Route path="presupuestos/:id/pedido" element={<SoloOficina><Pantalla.pedido /></SoloOficina>} />
        <Route path="precios" element={<SoloOficina><Pantalla.precios /></SoloOficina>} />
        <Route path="repuestos" element={<SoloOficina><Pantalla.repuestos /></SoloOficina>} />
        <Route path="busqueda-medidas" element={<SoloOficina><Pantalla.medidas /></SoloOficina>} />
        <Route path="*" element={<Inicio />} />
      </Route>
    </Routes>
  )
}

// Cada rol arranca donde trabaja: la oficina en el listado de motores, el
// taller en su panel. En el CELULAR la oficina arranca en el presupuesto
// rápido: desde el teléfono lo que se hace es anotar el motor que acaba de
// entrar, y el listado de motores es una tabla para la pantalla grande. El
// corte es el mismo ancho en que el menú lateral se esconde (layout.css).
const ANCHO_CELULAR = '(max-width: 860px)'

function Inicio() {
  const { esTaller } = useAuth()
  if (esTaller) return <Navigate to="/taller" replace />
  const enCelular = typeof window !== 'undefined' && window.matchMedia?.(ANCHO_CELULAR).matches
  return <Navigate to={enCelular ? '/rapido' : '/motores'} replace />
}

export default App
