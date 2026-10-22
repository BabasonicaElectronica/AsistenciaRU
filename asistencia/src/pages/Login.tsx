import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Spinner } from '../components/ui'

export default function Login() {
  const { loading, role } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (loading) return <div className="login-wrap"><Spinner /></div>
  if (role === 'admin') return <Navigate to="/admin" replace />
  if (role === 'kiosk') return <Navigate to="/" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(error.message.includes('Invalid login') ? 'Correo o contraseña incorrectos.' : errMsg(error))
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <img src="/logo.png" alt="Residencial Uruguay" />
        <h1>Control de asistencia</h1>
        <p className="muted">Ingresa con la cuenta de administración o con la cuenta de la computadora de recepción.</p>
        <form onSubmit={submit}>
          <div className="field"><label htmlFor="em">Correo</label>
            <input id="em" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="field"><label htmlFor="pw">Contraseña</label>
            <input id="pw" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          {error && <div className="notice err" role="alert">{error}</div>}
          <button className="btn" disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar'}</button>
        </form>
      </div>
    </div>
  )
}
