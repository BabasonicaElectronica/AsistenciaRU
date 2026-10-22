import { useEffect, useState } from 'react'
import { supabase, errMsg, getDeviceToken, setDeviceToken } from '../../lib/supabase'
import { useLoad } from '../../lib/hooks'
import { CARGOS, type MealRule, type Settings } from '../../lib/types'
import { dateEs } from '../../lib/time'
import { ErrorBox, Field, Notice, PageHead, Spinner } from '../../components/ui'

type Msg = { tone: 'ok' | 'err'; text: string } | null

export default function Configuracion() {
  const { data, loading, error, reload } = useLoad(async () => {
    const [s, m, d, k] = await Promise.all([
      supabase.from('settings').select('*').eq('id', 1).single(),
      supabase.from('meal_rules').select('*').order('window_start'),
      supabase.from('devices').select('id, name, active, created_at').order('created_at'),
      supabase.from('kiosks').select('user_id, name, active'),
    ])
    for (const r of [s, m, d, k]) if (r.error) throw r.error
    return { s: s.data as Settings, m: (m.data ?? []) as MealRule[], d: (d.data ?? []) as { id: string; name: string; active: boolean; created_at: string }[], k: (k.data ?? []) as { user_id: string; name: string; active: boolean }[] }
  }, [])

  if (loading && !data) return <Spinner />
  if (error && !data) return <ErrorBox message={error} onRetry={() => reload()} />
  if (!data) return null

  return (
    <div className="stack-v">
      <PageHead title="Configuración" sub="Reglas de asistencia, comidas, equipos autorizados y tu contraseña." />
      <Reglas s={data.s} onSaved={() => reload(true)} />
      <Comidas rules={data.m} onSaved={() => reload(true)} />
      <Equipos devices={data.d} kiosks={data.k} onChanged={() => reload(true)} />
      <Clave />
    </div>
  )
}

function Reglas({ s, onSaved }: { s: Settings; onSaved: () => void }) {
  const [v, setV] = useState({ ...s })
  const [msg, setMsg] = useState<Msg>(null)
  const set = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: Number(e.target.value) })
  const guardar = async () => {
    setMsg(null)
    const { error } = await supabase.from('settings').update({
      late_tolerance_minutes: v.late_tolerance_minutes, missing_clockin_alert_minutes: v.missing_clockin_alert_minutes,
      missing_clockout_alert_minutes: v.missing_clockout_alert_minutes, early_clockin_minutes: v.early_clockin_minutes,
      correction_window_days: v.correction_window_days, pin_max_attempts: v.pin_max_attempts, pin_lock_minutes: v.pin_lock_minutes,
    }).eq('id', 1)
    if (error) return setMsg({ tone: 'err', text: errMsg(error) })
    setMsg({ tone: 'ok', text: 'Configuración guardada. Los reportes se recalculan con las nuevas reglas.' }); onSaved()
  }
  return (
    <div className="panel">
      <h2>Reglas de asistencia</h2>
      <div className="form-grid" style={{ marginTop: '.7rem' }}>
        <Field label="Tolerancia de llegada (min)" hint="Si se supera, el retraso se cuenta completo desde el minuto 0."><input type="number" min={0} value={v.late_tolerance_minutes} onChange={set('late_tolerance_minutes')} /></Field>
        <Field label="Alerta de entrada faltante (min)" hint="Minutos después del inicio del turno."><input type="number" min={0} value={v.missing_clockin_alert_minutes} onChange={set('missing_clockin_alert_minutes')} /></Field>
        <Field label="Alerta de salida faltante (min)" hint="Minutos después de la hora de salida."><input type="number" min={0} value={v.missing_clockout_alert_minutes} onChange={set('missing_clockout_alert_minutes')} /></Field>
        <Field label="Entrada anticipada permitida (min)" hint="Cuánto antes del turno puede fichar."><input type="number" min={0} value={v.early_clockin_minutes} onChange={set('early_clockin_minutes')} /></Field>
        <Field label="Días extra para corregir" hint="0 = solo el mismo día de la salida programada."><input type="number" min={0} value={v.correction_window_days} onChange={set('correction_window_days')} /></Field>
        <Field label="Intentos de PIN antes de bloquear"><input type="number" min={1} value={v.pin_max_attempts} onChange={set('pin_max_attempts')} /></Field>
        <Field label="Minutos de bloqueo del PIN"><input type="number" min={1} value={v.pin_lock_minutes} onChange={set('pin_lock_minutes')} /></Field>
      </div>
      <div className="row" style={{ marginTop: '1rem' }}><button className="btn" onClick={guardar}>Guardar reglas</button></div>
      {msg && <div style={{ marginTop: '.8rem' }}><Notice tone={msg.tone}>{msg.text}</Notice></div>}
    </div>
  )
}

function Comidas({ rules, onSaved }: { rules: MealRule[]; onSaved: () => void }) {
  return (
    <div className="panel">
      <h2>Alimentación</h2>
      <p className="muted small" style={{ margin: '.3rem 0 .8rem' }}>Cada comida solo puede iniciarse dentro de su horario y no puede terminar después. Los minutos que excedan la duración prevista se suman al retraso.</p>
      <div className="stack-v">{rules.map((r) => <Comida key={r.kind} rule={r} onSaved={onSaved} />)}</div>
    </div>
  )
}

function Comida({ rule, onSaved }: { rule: MealRule; onSaved: () => void }) {
  const [ini, setIni] = useState(rule.window_start.slice(0, 5))
  const [fin, setFin] = useState(rule.window_end.slice(0, 5))
  const [dur, setDur] = useState(rule.planned_minutes)
  const [cargos, setCargos] = useState<string[]>(rule.cargos)
  const [msg, setMsg] = useState<Msg>(null)
  const toggle = (c: string) => setCargos(cargos.includes(c) ? cargos.filter((x) => x !== c) : [...cargos, c])
  const guardar = async () => {
    setMsg(null)
    if (fin <= ini) return setMsg({ tone: 'err', text: 'La hora final debe ser posterior a la inicial.' })
    const { error } = await supabase.from('meal_rules').update({ window_start: ini, window_end: fin, planned_minutes: dur, cargos }).eq('kind', rule.kind)
    if (error) return setMsg({ tone: 'err', text: errMsg(error) })
    setMsg({ tone: 'ok', text: 'Guardado.' }); onSaved()
  }
  return (
    <div style={{ borderTop: '1px solid var(--borde)', paddingTop: '.8rem' }}>
      <h3>{rule.label}</h3>
      <div className="form-grid" style={{ margin: '.5rem 0' }}>
        <Field label="Desde"><input type="time" value={ini} onChange={(e) => setIni(e.target.value)} /></Field>
        <Field label="Hasta"><input type="time" value={fin} onChange={(e) => setFin(e.target.value)} /></Field>
        <Field label="Duración (min)"><input type="number" min={1} value={dur} onChange={(e) => setDur(Number(e.target.value))} /></Field>
      </div>
      <div className="row">
        {Object.entries(CARGOS).map(([k, label]) => (
          <label key={k} className="check"><input type="checkbox" checked={cargos.includes(k)} onChange={() => toggle(k)} /> {label}</label>
        ))}
        <button className="btn sm" onClick={guardar}>Guardar</button>
      </div>
      {msg && <div style={{ marginTop: '.5rem' }}><Notice tone={msg.tone}>{msg.text}</Notice></div>}
    </div>
  )
}

function Equipos({ devices, kiosks, onChanged }: {
  devices: { id: string; name: string; active: boolean; created_at: string }[]; kiosks: { user_id: string; name: string; active: boolean }[]; onChanged: () => void
}) {
  const [msg, setMsg] = useState<Msg>(null)
  const [tiene, setTiene] = useState(false)
  useEffect(() => { setTiene(!!getDeviceToken()) }, [])

  const autorizar = async () => {
    setMsg(null)
    if (!confirm('Haz esto solo desde la computadora de recepción. ¿Autorizar este equipo para registrar asistencia?')) return
    const { data, error } = await supabase.rpc('crear_dispositivo', { p_name: 'Computadora de recepción' })
    if (error) return setMsg({ tone: 'err', text: errMsg(error) })
    setDeviceToken(data as string); setTiene(true)
    setMsg({ tone: 'ok', text: 'Este equipo quedó autorizado. Los registros hechos desde aquí se marcan como equipo autorizado.' }); onChanged()
  }
  const alternar = async (id: string, active: boolean) => {
    const { error } = await supabase.from('devices').update({ active: !active }).eq('id', id)
    if (error) setMsg({ tone: 'err', text: errMsg(error) })
    onChanged()
  }
  return (
    <div className="panel">
      <h2>Equipos autorizados</h2>
      <p className="muted small" style={{ margin: '.3rem 0 .8rem' }}>Los registros hechos desde un equipo no autorizado aparecen marcados en el panel y en el historial. Es un aviso para detectar usos indebidos, no un bloqueo.</p>
      <div className="row"><button className="btn" onClick={autorizar}>Autorizar este equipo</button>
        <span className="muted small">{tiene ? 'Este navegador ya tiene un código de autorización.' : 'Este navegador aún no está autorizado.'}</span></div>
      {msg && <div style={{ marginTop: '.8rem' }}><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      {devices.length > 0 && (
        <div className="tbl-wrap" style={{ marginTop: '1rem' }}>
          <table className="tbl stack">
            <thead><tr><th>Equipo</th><th>Autorizado el</th><th>Estado</th><th /></tr></thead>
            <tbody>{devices.map((d) => (
              <tr key={d.id}>
                <td data-label="Equipo">{d.name}</td><td data-label="Autorizado el">{dateEs(d.created_at.slice(0, 10))}</td>
                <td data-label="Estado">{d.active ? <span className="badge ok">Activo</span> : <span className="badge mute">Desactivado</span>}</td>
                <td className="right"><button className="btn sm ghost" onClick={() => alternar(d.id, d.active)}>{d.active ? 'Desactivar' : 'Activar'}</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <h3 style={{ marginTop: '1.2rem' }}>Cuentas de quiosco</h3>
      {kiosks.length === 0 ? <p className="muted">No hay cuentas de quiosco registradas.</p> : kiosks.map((k) => <p key={k.user_id}>{k.name} {k.active ? <span className="badge ok">Activa</span> : <span className="badge mute">Inactiva</span>}</p>)}
    </div>
  )
}

function Clave() {
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [msg, setMsg] = useState<Msg>(null)
  const guardar = async () => {
    setMsg(null)
    if (p1.length < 8) return setMsg({ tone: 'err', text: 'Usa al menos 8 caracteres.' })
    if (p1 !== p2) return setMsg({ tone: 'err', text: 'Las dos contraseñas no coinciden.' })
    const { error } = await supabase.auth.updateUser({ password: p1 })
    if (error) return setMsg({ tone: 'err', text: errMsg(error) })
    setP1(''); setP2(''); setMsg({ tone: 'ok', text: 'Contraseña actualizada.' })
  }
  return (
    <div className="panel">
      <h2>Mi contraseña</h2>
      <div className="form-grid" style={{ marginTop: '.7rem' }}>
        <Field label="Nueva contraseña"><input type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} /></Field>
        <Field label="Repetir contraseña"><input type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} /></Field>
      </div>
      <div className="row" style={{ marginTop: '1rem' }}><button className="btn" onClick={guardar}>Cambiar contraseña</button></div>
      {msg && <div style={{ marginTop: '.8rem' }}><Notice tone={msg.tone}>{msg.text}</Notice></div>}
    </div>
  )
}
