import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { Spinner } from './components/ui'
import Login from './pages/Login'
import Kiosco from './pages/Kiosco'
import AdminLayout from './components/AdminLayout'
import Dashboard from './pages/admin/Dashboard'
import Horarios from './pages/admin/Horarios'
import Asistencia from './pages/admin/Asistencia'
import Incidencias from './pages/admin/Incidencias'
import Reportes from './pages/admin/Reportes'
import Empleados from './pages/admin/Empleados'
import EmpleadoDetalle from './pages/admin/EmpleadoDetalle'
import Feriados from './pages/admin/Feriados'
import Configuracion from './pages/admin/Configuracion'

function Home() {
  const { loading, role } = useAuth()
  if (loading) return <div className="login-wrap"><Spinner /></div>
  if (role === 'kiosk') return <Kiosco />
  if (role === 'admin') return <Navigate to="/admin" replace />
  return <Navigate to="/login" replace />
}

function AdminGate() {
  const { loading, role } = useAuth()
  if (loading) return <div className="login-wrap"><Spinner /></div>
  if (role === 'kiosk') return <Navigate to="/" replace />
  if (role !== 'admin') return <Navigate to="/login" replace />
  return <AdminLayout />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Home />} />
      <Route path="/admin" element={<AdminGate />}>
        <Route index element={<Dashboard />} />
        <Route path="horarios" element={<Horarios />} />
        <Route path="asistencia" element={<Asistencia />} />
        <Route path="incidencias" element={<Incidencias />} />
        <Route path="reportes" element={<Reportes />} />
        <Route path="empleados" element={<Empleados />} />
        <Route path="empleados/:id" element={<EmpleadoDetalle />} />
        <Route path="feriados" element={<Feriados />} />
        <Route path="configuracion" element={<Configuracion />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
