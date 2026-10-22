import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Modal } from './ui'

const ITEMS = [
  { to: '/admin', end: true, label: 'Panel', ico: '◧' },
  { to: '/admin/horarios', label: 'Horarios', ico: '▦' },
  { to: '/admin/asistencia', label: 'Asistencia', ico: '✓' },
  { to: '/admin/reportes', label: 'Reportes', ico: '≣' },
  { to: '/admin/incidencias', label: 'Incidencias', ico: '✎' },
  { to: '/admin/empleados', label: 'Empleados', ico: '☻' },
  { to: '/admin/feriados', label: 'Feriados', ico: '★' },
  { to: '/admin/configuracion', label: 'Configuración', ico: '⚙' },
]
const MAIN_MOBILE = ITEMS.slice(0, 4)
const MORE_MOBILE = ITEMS.slice(4)

export default function AdminLayout() {
  const { email, signOut } = useAuth()
  const [more, setMore] = useState(false)
  const loc = useLocation()
  const moreActive = MORE_MOBILE.some((i) => loc.pathname.startsWith(i.to))

  return (
    <div className="admin">
      <aside className="sidebar no-print">
        <div className="brand">
          <img src="/logo.png" alt="" />
          <div><b>Residencial Uruguay</b><span>Control de asistencia</span></div>
        </div>
        <nav className="nav" aria-label="Principal">
          {ITEMS.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end}><span className="ico" aria-hidden>{i.ico}</span>{i.label}</NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <div>{email}</div>
          <button className="btn sm" onClick={signOut}>Cerrar sesión</button>
        </div>
      </aside>

      <div className="topbar no-print"><img src="/logo.png" alt="" /><b>Residencial Uruguay</b></div>

      <main className="main"><Outlet /></main>

      <nav className="bottomnav no-print" aria-label="Principal">
        {MAIN_MOBILE.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end}><span className="ico" aria-hidden>{i.ico}</span>{i.label}</NavLink>
        ))}
        <button onClick={() => setMore(true)} className={moreActive ? 'active' : ''} style={moreActive ? { color: 'var(--dorado)' } : undefined}>
          <span className="ico" aria-hidden>⋯</span>Más
        </button>
      </nav>

      {more && (
        <div className="more-sheet">
          <Modal title="Más opciones" onClose={() => setMore(false)}>
            <div className="stack-v">
              {MORE_MOBILE.map((i) => (
                <NavLink key={i.to} to={i.to} className="btn ghost" onClick={() => setMore(false)}>{i.ico} {i.label}</NavLink>
              ))}
              <div className="muted small">{email}</div>
              <button className="btn" onClick={signOut}>Cerrar sesión</button>
            </div>
          </Modal>
        </div>
      )}
    </div>
  )
}
