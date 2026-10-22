import { useMemo, useState } from 'react'
import { supabase, EMP_COLS, errMsg } from '../../lib/supabase'
import { useLoad } from '../../lib/hooks'
import { CARGOS, type Employee, type Holiday, type Shift } from '../../lib/types'
import { addDays, dateEs, DIAS_CORTO, hhmmOf, isoDow, todayLP, toISO, weekStart, ymdLP, dayLabel } from '../../lib/time'
import { ErrorBox, Field, Modal, Notice, PageHead, Spinner } from '../../components/ui'

const DEFAULTS: Record<string, { ini: string; fin: string }> = {
  recepcion_dia: { ini: '07:00', fin: '16:00' },
  camarero: { ini: '07:30', fin: '22:00' },
  recepcion_noche: { ini: '22:00', fin: '07:00' },
}
const diffDays = (a: string, b: string) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000)

export default function Horarios() {
  const [ws, setWs] = useState(weekStart(todayLP()))
  const [day, setDay] = useState(todayLP())
  const [edit, setEdit] = useState<{ emp: Employee; date: string; shift?: Shift } | null>(null)
  const [info, setInfo] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const dates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(ws, i)), [ws])

  const { data, loading, error, reload } = useLoad(async () => {
    const [e, s, h] = await Promise.all([
      supabase.from('employees').select(EMP_COLS).eq('active', true).order('full_name'),
      supabase.from('shifts').select('*').gte('work_date', ws).lte('work_date', addDays(ws, 6)),
      supabase.from('holidays').select('*').gte('holiday_date', ws).lte('holiday_date', addDays(ws, 6)),
    ])
    for (const r of [e, s, h]) if (r.error) throw r.error
    return { emps: (e.data ?? []) as Employee[], shifts: (s.data ?? []) as Shift[], hol: (h.data ?? []) as Holiday[] }
  }, [ws])

  const shiftOf = (emp: string, date: string) => data?.shifts.find((s) => s.employee_id === emp && s.work_date === date)
  const holOf = (date: string) => data?.hol.find((h) => h.holiday_date === date)

  const generarLibres = async () => {
    setBusy(true); setInfo(null)
    const { data: n, error } = await supabase.rpc('generar_dias_libres', { p_desde: ws, p_hasta: addDays(ws, 6) })
    setBusy(false)
    if (error) return setInfo({ tone: 'err', text: errMsg(error) })
    setInfo({ tone: 'ok', text: n === 0 ? 'Los días libres semanales ya estaban programados.' : `Se programaron ${n} día(s) libre(s) semanales.` })
    reload()
  }

  const copiarAnterior = async () => {
    setBusy(true); setInfo(null)
    const prev = addDays(ws, -7)
    const { data: old, error } = await supabase.from('shifts').select('*').gte('work_date', prev).lte('work_date', addDays(prev, 6))
    if (error) { setBusy(false); return setInfo({ tone: 'err', text: errMsg(error) }) }
    const rows = (old as Shift[])
      .filter((o) => o.kind === 'trabajo' || o.off_reason === 'semanal')
      .map((o) => {
        const nd = addDays(o.work_date, 7)
        if (shiftOf(o.employee_id, nd)) return null
        const mv = (iso: string | null) => (iso ? toISO(nd, hhmmOf(iso), diffDays(ymdLP(iso), o.work_date)) : null)
        return {
          employee_id: o.employee_id, work_date: nd, kind: o.kind,
          scheduled_start: mv(o.scheduled_start), scheduled_end: mv(o.scheduled_end),
          rest_start: mv(o.rest_start), rest_end: mv(o.rest_end), off_reason: o.off_reason,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
    if (rows.length === 0) { setBusy(false); return setInfo({ tone: 'ok', text: 'No hay nada nuevo que copiar de la semana anterior.' }) }
    const { error: e2 } = await supabase.from('shifts').insert(rows)
    setBusy(false)
    if (e2) return setInfo({ tone: 'err', text: errMsg(e2) })
    setInfo({ tone: 'ok', text: `Se copiaron ${rows.length} turno(s) de la semana anterior.` })
    reload()
  }

  const celda = (emp: Employee, date: string) => {
    const s = shiftOf(emp.id, date)
    const open = () => setEdit({ emp, date, shift: s })
    if (!s) return <button key={date} className="pc vacio" onClick={open}>Sin asignar</button>
    if (s.kind === 'libre') return <button key={date} className="pc libre" onClick={open}><b style={{ color: 'inherit' }}>Libre</b>{s.off_reason}</button>
    return (
      <button key={date} className="pc" onClick={open}>
        <b>{hhmmOf(s.scheduled_start)}–{hhmmOf(s.scheduled_end)}</b>
        {s.rest_start && <span className="muted">Descanso {hhmmOf(s.rest_start)}–{hhmmOf(s.rest_end)}</span>}
      </button>
    )
  }

  return (
    <div className="stack-v">
      <PageHead title="Horarios" sub="Planificación semanal por empleado y fecha. Toca una casilla para asignar o cambiar.">
        <button className="btn ghost sm" onClick={() => setWs(addDays(ws, -7))}>‹ Semana anterior</button>
        <button className="btn ghost sm" onClick={() => { setWs(weekStart(todayLP())); setDay(todayLP()) }}>Esta semana</button>
        <button className="btn ghost sm" onClick={() => setWs(addDays(ws, 7))}>Semana siguiente ›</button>
      </PageHead>

      <div className="panel">
        <div className="row between">
          <h2>Semana del {dateEs(ws)} al {dateEs(addDays(ws, 6))}</h2>
          <div className="row">
            <button className="btn sm" disabled={busy} onClick={generarLibres}>Programar días libres semanales</button>
            <button className="btn sm ghost" disabled={busy} onClick={copiarAnterior}>Copiar semana anterior</button>
          </div>
        </div>
        {info && <div style={{ marginTop: '.8rem' }}><Notice tone={info.tone}>{info.text}</Notice></div>}
      </div>

      {loading && !data && <Spinner />}
      {error && <ErrorBox message={error} onRetry={() => reload()} />}

      {data && data.emps.length === 0 && <Notice tone="info">Primero agrega empleados en la sección Empleados.</Notice>}

      {data && data.emps.length > 0 && (
        <>
          <div className="panel only-desktop" style={{ padding: 0, overflowX: 'auto' }}>
            <div className="planner">
              <div className="ph" />
              {dates.map((d) => (
                <div key={d} className={`ph${holOf(d) ? ' hol' : ''}`}>
                  {DIAS_CORTO[isoDow(d) - 1]} {d.slice(8)}/{d.slice(5, 7)}
                  {holOf(d) && <div className="small" style={{ color: 'var(--burdeos)' }}>★ {holOf(d)!.name}</div>}
                </div>
              ))}
              {data.emps.map((emp) => (
                <Row key={emp.id} emp={emp} dates={dates} celda={celda} />
              ))}
            </div>
          </div>

          <div className="only-mobile">
            <div className="day-tabs">
              {dates.map((d) => (
                <button key={d} className={d === day || (!dates.includes(day) && d === dates[0]) ? 'on' : ''} onClick={() => setDay(d)}>{dayLabel(d)}{holOf(d) ? ' ★' : ''}</button>
              ))}
            </div>
            {holOf(dates.includes(day) ? day : dates[0]) && <Notice tone="info">Feriado: {holOf(dates.includes(day) ? day : dates[0])!.name}</Notice>}
            <div className="stack-v" style={{ marginTop: '.7rem' }}>
              {data.emps.map((emp) => {
                const d = dates.includes(day) ? day : dates[0]
                return (
                  <div key={emp.id} className="panel">
                    <b>{emp.full_name}</b> <span className="muted small">{CARGOS[emp.cargo]}</span>
                    <div className="planner" style={{ display: 'block', minWidth: 0, marginTop: '.4rem' }}>{celda(emp, d)}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {edit && data && (
        <Editor
          emp={edit.emp} date={edit.date} shift={edit.shift} shifts={data.shifts} emps={data.emps}
          onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }}
        />
      )}
    </div>
  )
}

function Row({ emp, dates, celda }: { emp: Employee; dates: string[]; celda: (e: Employee, d: string) => JSX.Element }) {
  return (
    <>
      <div className="pn">{emp.full_name}<span className="muted small" style={{ fontWeight: 400 }}>{CARGOS[emp.cargo]}</span></div>
      {dates.map((d) => celda(emp, d))}
    </>
  )
}

function Editor({ emp, date, shift, shifts, emps, onClose, onSaved }: {
  emp: Employee; date: string; shift?: Shift; shifts: Shift[]; emps: Employee[]; onClose: () => void; onSaved: () => void
}) {
  const def = DEFAULTS[emp.cargo]
  const [kind, setKind] = useState<'trabajo' | 'libre'>(shift?.kind ?? (isoDow(date) === emp.weekly_day_off ? 'libre' : 'trabajo'))
  const [ini, setIni] = useState(shift?.scheduled_start ? hhmmOf(shift.scheduled_start) : def.ini)
  const [fin, setFin] = useState(shift?.scheduled_end ? hhmmOf(shift.scheduled_end) : def.fin)
  const [rest, setRest] = useState(!!shift?.rest_start)
  const [rIni, setRIni] = useState(shift?.rest_start ? hhmmOf(shift.rest_start) : '12:00')
  const [rFin, setRFin] = useState(shift?.rest_end ? hhmmOf(shift.rest_end) : '14:00')
  const [reason, setReason] = useState<string>(shift?.off_reason ?? (isoDow(date) === emp.weekly_day_off ? 'semanal' : 'cambio'))
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  const payloadRest = () => {
    const rsDay = toMin(rIni) < toMin(ini) ? 1 : 0
    const reDay = rsDay + (toMin(rFin) <= toMin(rIni) ? 1 : 0)
    return { rest_start: toISO(date, rIni, rsDay), rest_end: toISO(date, rFin, reDay) }
  }

  // Aviso: descansos que coinciden con los de otros empleados el mismo día
  const choque = useMemo(() => {
    if (kind !== 'trabajo' || !rest) return []
    const p = payloadRest()
    return shifts.filter((s) => s.work_date === date && s.employee_id !== emp.id && s.rest_start && s.rest_end &&
      s.rest_start < p.rest_end && s.rest_end > p.rest_start).map((s) => emps.find((e) => e.id === s.employee_id)?.full_name ?? 'otro empleado')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, rest, rIni, rFin, ini, shifts])

  const guardar = async () => {
    setErr('')
    if (shift && !note.trim()) return setErr('Escribe el motivo del cambio. Queda registrado en el historial.')
    if (kind === 'trabajo' && ini === fin) return setErr('La hora de entrada y la de salida no pueden ser iguales.')
    const row = kind === 'trabajo'
      ? {
          kind, off_reason: null,
          scheduled_start: toISO(date, ini), scheduled_end: toISO(date, fin, toMin(fin) <= toMin(ini) ? 1 : 0),
          ...(rest ? payloadRest() : { rest_start: null, rest_end: null }),
        }
      : { kind, off_reason: reason, scheduled_start: null, scheduled_end: null, rest_start: null, rest_end: null }
    setBusy(true)
    const q = shift
      ? supabase.from('shifts').update({ ...row, change_note: note.trim() }).eq('id', shift.id)
      : supabase.from('shifts').insert({ ...row, employee_id: emp.id, work_date: date, change_note: note.trim() || null })
    const { error } = await q
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onSaved()
  }

  const eliminar = async () => {
    if (!shift || !confirm('¿Eliminar este turno? Solo es posible si aún no tiene registros de asistencia.')) return
    setBusy(true)
    const { error } = await supabase.from('shifts').delete().eq('id', shift.id)
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onSaved()
  }

  return (
    <Modal title={`${emp.full_name} · ${dayLabel(date)}`} onClose={onClose}
      footer={<>
        {shift && <button className="btn danger ghost" disabled={busy} onClick={eliminar} style={{ marginRight: 'auto', color: 'var(--err)' }}>Eliminar</button>}
        <button className="btn ghost" onClick={onClose}>Cancelar</button>
        <button className="btn" disabled={busy} onClick={guardar}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </>}>
      <div className="stack-v">
        <Field label="Tipo de día">
          <select value={kind} onChange={(e) => setKind(e.target.value as 'trabajo' | 'libre')}>
            <option value="trabajo">Turno de trabajo</option>
            <option value="libre">Día libre</option>
          </select>
        </Field>
        {kind === 'trabajo' ? (
          <>
            <div className="form-grid">
              <Field label="Entrada"><input type="time" value={ini} onChange={(e) => setIni(e.target.value)} /></Field>
              <Field label="Salida" hint={toMin(fin) <= toMin(ini) ? 'Termina al día siguiente' : undefined}><input type="time" value={fin} onChange={(e) => setFin(e.target.value)} /></Field>
            </div>
            <label className="check"><input type="checkbox" checked={rest} onChange={(e) => setRest(e.target.checked)} /> Tiene descanso de 2 horas</label>
            {rest && (
              <div className="form-grid">
                <Field label="Inicio del descanso"><input type="time" value={rIni} onChange={(e) => setRIni(e.target.value)} /></Field>
                <Field label="Fin del descanso"><input type="time" value={rFin} onChange={(e) => setRFin(e.target.value)} /></Field>
              </div>
            )}
            {choque.length > 0 && <Notice tone="warn">Este descanso coincide con el de {choque.join(', ')}. Debe haber siempre al menos 2 personas en turno.</Notice>}
          </>
        ) : (
          <Field label="Motivo del día libre">
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="semanal">Día libre semanal</option>
              <option value="feriado">Feriado</option>
              <option value="cambio">Cambio autorizado</option>
            </select>
          </Field>
        )}
        <Field label={shift ? 'Motivo del cambio (obligatorio)' : 'Observación (opcional)'}>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={shift ? 'Ej.: cambio autorizado por administración' : ''} />
        </Field>
        {err && <Notice tone="err">{err}</Notice>}
      </div>
    </Modal>
  )
}
