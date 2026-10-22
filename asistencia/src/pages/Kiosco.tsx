import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, errMsg, getDeviceToken } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useLoad, useNow } from '../lib/hooks'
import { CARGOS, COMIDAS, ESTADOS, type Row } from '../lib/types'
import { clockLP, longDateLP, timeLP, hm, dateEs, dayLabel, todayLP, weekStart, monthStart, timeLP as tLP } from '../lib/time'
import { Spinner, ErrorBox } from '../components/ui'

type Step = 'lista' | 'pin' | 'acciones' | 'hecho' | 'reportes'
interface Emp { id: string; full_name: string; cargo: keyof typeof CARGOS }
interface Accion { tipo: string; accion: 'inicio' | 'fin'; etiqueta: string }

const IDLE_MS: Record<Step, number> = { lista: 0, pin: 45000, acciones: 45000, hecho: 0, reportes: 120000 }

export default function Kiosco() {
  const { signOut } = useAuth()
  const now = useNow(1000)
  const { data: emps, loading, error, reload } = useLoad<Emp[]>(async () => {
    const { data, error } = await supabase.rpc('kiosco_listar_empleados')
    if (error) throw error
    return (data ?? []) as Emp[]
  }, [], { every: 5 * 60 * 1000 })

  const [step, setStep] = useState<Step>('lista')
  const [emp, setEmp] = useState<Emp | null>(null)
  const [pin, setPin] = useState('')
  const [msg, setMsg] = useState('')
  const [shake, setShake] = useState(false)
  const [busy, setBusy] = useState(false)
  const [acciones, setAcciones] = useState<Accion[]>([])
  const [aviso, setAviso] = useState('')
  const [hecho, setHecho] = useState('')
  const [rep, setRep] = useState<Row | null>(null)
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null)

  const volver = useCallback(() => {
    setStep('lista'); setEmp(null); setPin(''); setMsg(''); setAcciones([]); setAviso(''); setRep(null)
  }, [])

  // Cierre automático por inactividad (se reinicia con cualquier toque o tecla)
  useEffect(() => {
    const limit = IDLE_MS[step]
    if (!limit) return
    const arm = () => {
      if (idle.current) clearTimeout(idle.current)
      idle.current = setTimeout(volver, limit)
    }
    arm()
    window.addEventListener('pointerdown', arm)
    window.addEventListener('keydown', arm)
    return () => {
      if (idle.current) clearTimeout(idle.current)
      window.removeEventListener('pointerdown', arm)
      window.removeEventListener('keydown', arm)
    }
  }, [step, volver])

  // Tras registrar, vuelve sola a la lista
  useEffect(() => {
    if (step !== 'hecho') return
    const t = setTimeout(volver, 5000)
    return () => clearTimeout(t)
  }, [step, volver])

  const pinError = (r: Row) => {
    if (r.error === 'pin_incorrecto') return `PIN incorrecto. Te quedan ${r.intentos_restantes} intento${r.intentos_restantes === 1 ? '' : 's'}.`
    if (r.error === 'bloqueado') return `Demasiados intentos. Tu PIN está bloqueado hasta las ${timeLP(r.hasta)}. Avisa a administración si lo necesitas antes.`
    if (r.error === 'sin_pin') return 'Aún no tienes un PIN. Pídelo a administración.'
    if (r.error === 'regla') return r.mensaje as string
    return 'No se pudo verificar tu PIN. Intenta de nuevo.'
  }
  const fallo = (r: Row) => {
    setMsg(pinError(r)); setPin(''); setShake(true); setTimeout(() => setShake(false), 400)
    setStep('pin')
  }

  const enviarPin = useCallback(async () => {
    if (!emp || pin.length < 4 || busy) return
    setBusy(true); setMsg('')
    const { data, error } = await supabase.rpc('kiosco_estado', { p_employee_id: emp.id, p_pin: pin })
    setBusy(false)
    if (error) { setMsg(errMsg(error)); setPin(''); return }
    const r = data as Row
    if (!r.ok) return fallo(r)
    setAcciones(r.acciones as Accion[]); setAviso((r.mensaje as string) ?? ''); setStep('acciones')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emp, pin, busy])

  // Teclado físico en la pantalla de PIN
  useEffect(() => {
    if (step !== 'pin') return
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) setPin((p) => (p.length < 6 ? p + e.key : p))
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1))
      else if (e.key === 'Enter') enviarPin()
      else if (e.key === 'Escape') volver()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, enviarPin, volver])

  const registrar = async (a: Accion) => {
    if (!emp || busy) return
    setBusy(true); setMsg('')
    const { data, error } = await supabase.rpc('kiosco_registrar', {
      p_employee_id: emp.id, p_pin: pin, p_tipo: a.tipo, p_accion: a.accion, p_device_token: getDeviceToken(),
    })
    setBusy(false)
    if (error) { setMsg(errMsg(error)); return }
    const r = data as Row
    if (!r.ok) {
      if (r.error === 'regla') { setMsg(r.mensaje as string); return }
      return fallo(r)
    }
    const reg = r.registro as Row
    const hora = timeLP(a.accion === 'inicio' ? reg.started_at : reg.ended_at)
    const nombre = a.tipo === 'jornada' ? (a.accion === 'inicio' ? 'Entrada' : 'Salida') : `${a.accion === 'inicio' ? 'Inicio de' : 'Fin de'} ${COMIDAS[a.tipo].toLowerCase()}`
    setHecho(`${nombre} registrada a las ${hora}`); setStep('hecho')
  }

  const verReportes = async () => {
    if (!emp || busy) return
    setBusy(true); setMsg('')
    const { data, error } = await supabase.rpc('kiosco_mis_reportes', { p_employee_id: emp.id, p_pin: pin })
    setBusy(false)
    if (error) { setMsg(errMsg(error)); return }
    const r = data as Row
    if (!r.ok) return fallo(r)
    setRep(r); setStep('reportes')
  }

  return (
    <div className="kiosk">
      <header className="kiosk-top">
        <img src="/logo.png" alt="" />
        <div><div className="ttl">Residencial Uruguay</div><div className="sub">Control de asistencia</div></div>
        <div className="kiosk-clock" aria-live="off">
          <div className="t">{clockLP(now)}</div>
          <div className="d">{longDateLP(now)}</div>
        </div>
      </header>

      <main className="kiosk-body">
        {step === 'lista' && (
          <>
            <p className="kiosk-hint">Toca tu nombre para registrar tu entrada, comida, descanso o salida.</p>
            {loading && <Spinner />}
            {error && <ErrorBox message={error} onRetry={() => reload()} />}
            {emps && emps.length === 0 && <p className="muted">Aún no hay empleados registrados. Pide a administración que los agregue.</p>}
            <div className="names">
              {emps?.map((e) => (
                <button key={e.id} className="name-btn" onClick={() => { setEmp(e); setPin(''); setMsg(''); setStep('pin') }}>
                  <span className="nm">{e.full_name}</span><span className="cg">{CARGOS[e.cargo]}</span>
                </button>
              ))}
            </div>
            <p className="small muted" style={{ marginTop: '2rem' }}>
              <button className="btn ghost sm" onClick={signOut}>Cerrar sesión de la computadora</button>
            </p>
          </>
        )}

        {step === 'pin' && emp && (
          <div className={`kiosk-card${shake ? ' shake' : ''}`}>
            <h2>{emp.full_name}</h2>
            <p className="muted">Escribe tu PIN</p>
            <div className="pin-dots" aria-label={`${pin.length} dígitos escritos`}>
              {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => <i key={i} className={i < pin.length ? 'on' : ''} />)}
            </div>
            {msg && <div className="notice err" role="alert" style={{ textAlign: 'left' }}>{msg}</div>}
            <div className="keypad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
                <button key={n} onClick={() => setPin((p) => (p.length < 6 ? p + n : p))}>{n}</button>
              ))}
              <button className="fn" onClick={() => setPin((p) => p.slice(0, -1))}>Borrar</button>
              <button onClick={() => setPin((p) => (p.length < 6 ? p + '0' : p))}>0</button>
              <button className="fn" onClick={volver}>Cancelar</button>
            </div>
            <button className="btn gold lg" style={{ width: '100%' }} disabled={pin.length < 4 || busy} onClick={enviarPin}>
              {busy ? 'Verificando…' : 'Continuar'}
            </button>
          </div>
        )}

        {step === 'acciones' && emp && (
          <div className="kiosk-card">
            <h2>Hola, {emp.full_name.split(' ')[0]}</h2>
            <p className="muted">{CARGOS[emp.cargo]}</p>
            {aviso && <div className="notice info" style={{ margin: '1rem 0', textAlign: 'left' }}>{aviso}</div>}
            {msg && <div className="notice err" role="alert" style={{ margin: '1rem 0', textAlign: 'left' }}>{msg}</div>}
            <div className="action-list">
              {acciones.map((a) => (
                <button key={a.tipo + a.accion} className={`btn lg ${a.tipo === 'jornada' && a.accion === 'inicio' ? 'gold' : ''}`} disabled={busy} onClick={() => registrar(a)}>
                  {a.etiqueta}
                </button>
              ))}
              <button className="btn ghost lg" disabled={busy} onClick={verReportes}>Ver mis reportes</button>
              <button className="btn ghost" onClick={volver}>Cancelar</button>
            </div>
          </div>
        )}

        {step === 'hecho' && (
          <div className="kiosk-card done">
            <div className="big" aria-hidden>✓</div>
            <h2>{hecho}</h2>
            <p className="muted" style={{ marginTop: '.6rem' }}>Gracias, {emp?.full_name.split(' ')[0]}.</p>
            <button className="btn ghost" style={{ marginTop: '1.2rem' }} onClick={volver}>Listo</button>
          </div>
        )}

        {step === 'reportes' && rep && <MisReportes rep={rep} onClose={volver} />}
      </main>
    </div>
  )
}

function MisReportes({ rep, onClose }: { rep: Row; onClose: () => void }) {
  const hoy = todayLP()
  const sem = (rep.semanas as Row[]).find((s) => s.semana_inicio === weekStart(hoy))
  const mes = (rep.meses as Row[]).find((m) => m.mes_inicio === monthStart(hoy))
  const bloque = (titulo: string, r?: Row) => (
    <div className="panel">
      <h3>{titulo}</h3>
      <div className="kpis" style={{ marginTop: '.6rem' }}>
        <div className={`kpi ${r && r.minutos_retraso_total > 0 ? 'warn' : 'ok'}`}><div className="n">{hm(r?.minutos_retraso_total ?? 0)}</div><div className="l">Retraso total</div></div>
        <div className="kpi"><div className="n">{hm(r?.minutos_exceso_comida ?? 0)}</div><div className="l">De ello, exceso de comida</div></div>
        <div className="kpi"><div className="n">{r?.salidas_anticipadas ?? 0}</div><div className="l">Salidas anticipadas</div></div>
        <div className={`kpi ${r && r.faltas_injustificadas > 0 ? 'err' : ''}`}><div className="n">{r?.faltas_injustificadas ?? 0}</div><div className="l">Faltas sin justificar</div></div>
      </div>
    </div>
  )
  return (
    <div className="stack-v">
      <div className="row between">
        <div><h1>{(rep.empleado as Row).nombre}</h1><p className="muted">Tus reportes personales</p></div>
        <button className="btn" onClick={onClose}>Terminar</button>
      </div>
      {bloque('Esta semana', sem)}
      {bloque('Este mes', mes)}
      <div className="panel">
        <h3>Últimas jornadas</h3>
        <div className="tbl-wrap">
          <table className="tbl stack">
            <thead><tr><th>Fecha</th><th>Horario</th><th>Entrada</th><th>Salida</th><th className="num">Retraso</th><th className="num">Salida anticipada</th><th>Estado</th></tr></thead>
            <tbody>
              {(rep.jornadas as Row[]).map((j) => (
                <tr key={j.work_date + j.scheduled_start}>
                  <td data-label="Fecha">{dayLabel(j.work_date)}</td>
                  <td data-label="Horario">{tLP(j.scheduled_start)}–{tLP(j.scheduled_end)}</td>
                  <td data-label="Entrada">{tLP(j.entrada_real)}</td>
                  <td data-label="Salida">{tLP(j.salida_real)}</td>
                  <td data-label="Retraso" className="num">{hm(j.retraso_total_min)}{j.retraso_justificado_min > 0 && <span className="muted small"> (justificado {hm(j.retraso_justificado_min)})</span>}</td>
                  <td data-label="Salida anticipada" className="num">{hm(j.salida_anticipada_min)}</td>
                  <td data-label="Estado">{ESTADOS[j.estado]?.label ?? j.estado}</td>
                </tr>
              ))}
              {(rep.jornadas as Row[]).length === 0 && <tr><td colSpan={7} className="muted">Todavía no hay jornadas en los últimos 35 días.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div className="panel">
        <h3>Semanas anteriores</h3>
        <div className="tbl-wrap">
          <table className="tbl stack">
            <thead><tr><th>Semana</th><th className="num">Retraso total</th><th className="num">Exceso de comida</th><th className="num">Salidas anticipadas</th><th className="num">Faltas</th></tr></thead>
            <tbody>
              {(rep.semanas as Row[]).map((s) => (
                <tr key={s.semana_inicio}>
                  <td data-label="Semana">{dateEs(s.semana_inicio)} – {dateEs(s.semana_fin)}</td>
                  <td data-label="Retraso total" className="num">{hm(s.minutos_retraso_total)}</td>
                  <td data-label="Exceso de comida" className="num">{hm(s.minutos_exceso_comida)}</td>
                  <td data-label="Salidas anticipadas" className="num">{s.salidas_anticipadas}</td>
                  <td data-label="Faltas" className="num">{s.faltas_injustificadas} sin justificar · {s.faltas_justificadas} justificadas</td>
                </tr>
              ))}
              {(rep.semanas as Row[]).length === 0 && <tr><td colSpan={5} className="muted">Aún no hay semanas con turnos.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
