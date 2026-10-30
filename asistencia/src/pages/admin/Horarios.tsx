import { useEffect, useMemo, useState } from 'react'
import { supabase, EMP_COLS, errMsg } from '../../lib/supabase'
import { useLoad } from '../../lib/hooks'
import { CARGOS, type Employee, type Holiday, type Row, type Shift } from '../../lib/types'
import { addDays, dateEs, DIAS_CORTO, DIAS, hhmmOf, isoDow, todayLP, toISO, weekStart, ymdLP, dayLabel } from '../../lib/time'
import { ErrorBox, Field, Modal, Notice, PageHead, Spinner } from '../../components/ui'

const DEFAULTS: Record<string, { ini: string; fin: string }> = {
  recepcion_dia: { ini: '07:00', fin: '16:00' },
  camarero: { ini: '07:30', fin: '22:00' },
  recepcion_noche: { ini: '22:00', fin: '07:00' },
}
const diffDays = (a: string, b: string) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000)
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

interface TForm { ini: string; fin: string; rest: boolean; rIni: string; rFin: string }
const formFrom = (s: Shift | undefined, def: { ini: string; fin: string }): TForm => ({
  ini: s?.scheduled_start ? hhmmOf(s.scheduled_start) : def.ini,
  fin: s?.scheduled_end ? hhmmOf(s.scheduled_end) : def.fin,
  rest: !!s?.rest_start,
  rIni: s?.rest_start ? hhmmOf(s.rest_start) : '12:00',
  rFin: s?.rest_end ? hhmmOf(s.rest_end) : '14:00',
})
/** Convierte el formulario de un turno en instantes reales (maneja turnos que cruzan la medianoche). */
const build = (date: string, f: TForm) => {
  const start = toISO(date, f.ini)
  const end = toISO(date, f.fin, toMin(f.fin) <= toMin(f.ini) ? 1 : 0)
  let rest_start: string | null = null
  let rest_end: string | null = null
  if (f.rest) {
    const rsDay = toMin(f.rIni) < toMin(f.ini) ? 1 : 0
    const reDay = rsDay + (toMin(f.rFin) <= toMin(f.rIni) ? 1 : 0)
    rest_start = toISO(date, f.rIni, rsDay)
    rest_end = toISO(date, f.rFin, reDay)
  }
  return { scheduled_start: start, scheduled_end: end, rest_start, rest_end }
}

export default function Horarios() {
  const hoy = todayLP()
  const [ws, setWs] = useState(weekStart(hoy))
  const [day, setDay] = useState(hoy)
  const [edit, setEdit] = useState<{ emp: Employee; date: string } | null>(null)
  const [feriado, setFeriado] = useState<Holiday | null>(null)
  const [cambio, setCambio] = useState(false)
  const [info, setInfo] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const dates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(ws, i)), [ws])
  const dayShown = dates.includes(day) ? day : dates[0]

  const { data, loading, error, reload } = useLoad(async () => {
    const [e, s, h] = await Promise.all([
      supabase.from('employees').select(EMP_COLS).eq('active', true).order('full_name'),
      supabase.from('shifts').select('*').gte('work_date', ws).lte('work_date', addDays(ws, 6)).order('turno_num'),
      supabase.from('holidays').select('*').gte('holiday_date', ws).lte('holiday_date', addDays(ws, 6)),
    ])
    for (const r of [e, s, h]) if (r.error) throw r.error
    return { emps: (e.data ?? []) as Employee[], shifts: (s.data ?? []) as Shift[], hol: (h.data ?? []) as Holiday[] }
  }, [ws])

  const { data: cambios, reload: recargarCambios } = useLoad(async () => {
    const fin = addDays(ws, 6)
    const { data, error } = await supabase.from('day_off_changes').select('*, employees(full_name)')
      .or(`and(fecha_original.gte.${ws},fecha_original.lte.${fin}),and(fecha_nueva.gte.${ws},fecha_nueva.lte.${fin})`)
      .order('created_at', { ascending: false })
    if (error) return { ok: false, rows: [] as Row[] }
    return { ok: true, rows: (data ?? []) as Row[] }
  }, [ws])

  const shiftsOf = (emp: string, date: string) =>
    (data?.shifts ?? []).filter((s) => s.employee_id === emp && s.work_date === date).sort((a, b) => a.turno_num - b.turno_num)
  const holOf = (date: string) => data?.hol.find((h) => h.holiday_date === date)

  // Casillas sin asignar desde hoy en adelante (dentro de la semana mostrada)
  const sinAsignar = useMemo(() => {
    const out: { emp: Employee; date: string }[] = []
    if (!data) return out
    for (const emp of data.emps) for (const d of dates) {
      if (d >= hoy && !data.shifts.some((s) => s.employee_id === emp.id && s.work_date === d)) out.push({ emp, date: d })
    }
    return out
  }, [data, dates, hoy])

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
        if (shiftsOf(o.employee_id, nd).length > 0) return null
        const fijo = data?.emps.find((e) => e.id === o.employee_id)?.weekly_day_off
        if (o.kind === 'trabajo' && fijo === isoDow(nd)) return null   // su día libre fijo (el turno fue un cambio de la semana pasada)
        const mv = (iso: string | null) => (iso ? toISO(nd, hhmmOf(iso), diffDays(ymdLP(iso), o.work_date)) : null)
        return {
          employee_id: o.employee_id, work_date: nd, kind: o.kind, turno_num: o.turno_num,
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
    const list = shiftsOf(emp.id, date)
    const open = () => setEdit({ emp, date })
    if (list.length === 0) {
      return <button key={date} className={`pc vacio${date >= hoy ? ' aviso' : ''}`} onClick={open}>{date >= hoy ? '! Sin asignar' : 'Sin asignar'}</button>
    }
    if (list[0].kind === 'libre') {
      return <button key={date} className="pc libre" onClick={open}><b style={{ color: 'inherit' }}>Libre</b>{list[0].off_reason}</button>
    }
    return (
      <button key={date} className="pc" onClick={open}>
        {list.map((s) => (
          <span key={s.id} className="l2">
            <b>{hhmmOf(s.scheduled_start)}–{hhmmOf(s.scheduled_end)}</b>
            {s.rest_start && <span className="muted">Descanso {hhmmOf(s.rest_start)}–{hhmmOf(s.rest_end)}</span>}
          </span>
        ))}
      </button>
    )
  }

  return (
    <div className="stack-v">
      <PageHead title="Horarios" sub="Planificación semanal por empleado y fecha. Toca una casilla para asignar o cambiar.">
        <button className="btn ghost sm" onClick={() => setWs(addDays(ws, -7))}>‹ Semana anterior</button>
        <button className="btn ghost sm" onClick={() => { setWs(weekStart(hoy)); setDay(hoy) }}>Esta semana</button>
        <button className="btn ghost sm" onClick={() => setWs(addDays(ws, 7))}>Semana siguiente ›</button>
      </PageHead>

      <div className="panel">
        <div className="row between">
          <h2>Semana del {dateEs(ws)} al {dateEs(addDays(ws, 6))}</h2>
          <div className="row">
            <button className="btn sm" disabled={busy} onClick={generarLibres}>Programar días libres semanales</button>
            <button className="btn sm ghost" disabled={busy} onClick={copiarAnterior}>Copiar semana anterior</button>
            <button className="btn sm gold" onClick={() => setCambio(true)}>Cambiar día libre</button>
          </div>
        </div>
        {info && <div style={{ marginTop: '.8rem' }}><Notice tone={info.tone}>{info.text}</Notice></div>}
        {sinAsignar.length > 0 && (
          <div style={{ marginTop: '.8rem' }}>
            <Notice tone="warn">
              <b>{sinAsignar.length} casilla(s) sin asignar</b> desde hoy en esta semana. Un empleado sin turno no puede registrar su entrada.
              {' '}Pendientes: {Array.from(new Set(sinAsignar.map((x) => dayLabel(x.date)))).join(', ')}.
            </Notice>
          </div>
        )}
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
                  {holOf(d) && (
                    <>
                      <div className="small" style={{ color: 'var(--burdeos)' }}>★ {holOf(d)!.name}</div>
                      <button className="btn sm" onClick={() => setFeriado(holOf(d)!)}>Asignar feriado</button>
                    </>
                  )}
                </div>
              ))}
              {data.emps.map((emp) => (
                <Fila key={emp.id} emp={emp} dates={dates} celda={celda} />
              ))}
            </div>
          </div>

          <div className="only-mobile">
            <div className="day-tabs">
              {dates.map((d) => (
                <button key={d} className={d === dayShown ? 'on' : ''} onClick={() => setDay(d)}>{dayLabel(d)}{holOf(d) ? ' ★' : ''}</button>
              ))}
            </div>
            {holOf(dayShown) && (
              <Notice tone="info">
                Feriado: {holOf(dayShown)!.name}{' '}
                <button className="btn sm" onClick={() => setFeriado(holOf(dayShown)!)}>Asignar feriado</button>
              </Notice>
            )}
            <div className="stack-v" style={{ marginTop: '.7rem' }}>
              {data.emps.map((emp) => (
                <div key={emp.id} className="panel">
                  <b>{emp.full_name}</b> <span className="muted small">{CARGOS[emp.cargo]}</span>
                  <div className="planner" style={{ display: 'block', minWidth: 0, marginTop: '.4rem' }}>{celda(emp, dayShown)}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {edit && data && (
        <Editor
          emp={edit.emp} date={edit.date} list={shiftsOf(edit.emp.id, edit.date)} shifts={data.shifts} emps={data.emps}
          onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} onPartial={() => reload(true)}
        />
      )}
      {data && cambios && cambios.ok && cambios.rows.length > 0 && (
        <div className="panel">
          <h2>Cambios de día libre autorizados esta semana</h2>
          <div className="tbl-wrap" style={{ marginTop: '.6rem' }}>
            <table className="tbl stack">
              <thead><tr><th>Empleado</th><th>Cambio</th><th>Día libre</th><th>Motivo</th><th>Aprobó</th></tr></thead>
              <tbody>{cambios.rows.map((c) => (
                <tr key={c.id}>
                  <td data-label="Empleado"><b>{(c.employees as Row)?.full_name}</b></td>
                  <td data-label="Cambio">{c.tipo === 'intercambio' ? <span className="badge info">Intercambio</span> : <span className="badge gold">Movido</span>}</td>
                  <td data-label="Día libre">{dayLabel(c.fecha_original)} → <b>{dayLabel(c.fecha_nueva)}</b></td>
                  <td data-label="Motivo">{c.motivo}</td>
                  <td data-label="Aprobó">{c.aprobado_por}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {cambio && data && (
        <CambioModal emps={data.emps} onClose={() => setCambio(false)} onSaved={() => { setCambio(false); reload(); recargarCambios() }} />
      )}
      {feriado && data && (
        <FeriadoModal
          holiday={feriado} emps={data.emps} dayShifts={data.shifts.filter((s) => s.work_date === feriado.holiday_date)}
          onClose={() => setFeriado(null)} onSaved={() => { setFeriado(null); reload() }}
        />
      )}
    </div>
  )
}

function Fila({ emp, dates, celda }: { emp: Employee; dates: string[]; celda: (e: Employee, d: string) => JSX.Element }) {
  return (
    <>
      <div className="pn">{emp.full_name}<span className="muted small" style={{ fontWeight: 400 }}>{CARGOS[emp.cargo]}</span></div>
      {dates.map((d) => celda(emp, d))}
    </>
  )
}

/* ---------- Campos de un turno ---------- */
function TurnoCampos({ f, set, titulo }: { f: TForm; set: (f: TForm) => void; titulo?: string }) {
  return (
    <div className="stack-v" style={{ gap: '.7rem' }}>
      {titulo && <h3>{titulo}</h3>}
      <div className="form-grid">
        <Field label="Entrada"><input type="time" value={f.ini} onChange={(e) => set({ ...f, ini: e.target.value })} /></Field>
        <Field label="Salida" hint={toMin(f.fin) <= toMin(f.ini) ? 'Termina al día siguiente' : undefined}><input type="time" value={f.fin} onChange={(e) => set({ ...f, fin: e.target.value })} /></Field>
      </div>
      <label className="check"><input type="checkbox" checked={f.rest} onChange={(e) => set({ ...f, rest: e.target.checked })} /> Tiene descanso de 2 horas</label>
      {f.rest && (
        <div className="form-grid">
          <Field label="Inicio del descanso"><input type="time" value={f.rIni} onChange={(e) => set({ ...f, rIni: e.target.value })} /></Field>
          <Field label="Fin del descanso"><input type="time" value={f.rFin} onChange={(e) => set({ ...f, rFin: e.target.value })} /></Field>
        </div>
      )}
    </div>
  )
}

/* ---------- Editor de la casilla (1 o 2 turnos) ---------- */
function Editor({ emp, date, list, shifts, emps, onClose, onSaved, onPartial }: {
  emp: Employee; date: string; list: Shift[]; shifts: Shift[]; emps: Employee[]
  onClose: () => void; onSaved: () => void; onPartial: () => void
}) {
  const def = DEFAULTS[emp.cargo]
  const esLibreFijo = isoDow(date) === emp.weekly_day_off
  const [kind, setKind] = useState<'trabajo' | 'libre'>(list[0]?.kind ?? (esLibreFijo ? 'libre' : 'trabajo'))
  const [f1, setF1] = useState<TForm>(formFrom(list.find((s) => s.turno_num === 1 && s.kind === 'trabajo'), def))
  const [two, setTwo] = useState(list.some((s) => s.turno_num === 2))
  const [f2, setF2] = useState<TForm>(formFrom(list.find((s) => s.turno_num === 2), { ini: '22:00', fin: '07:00' }))
  const [reason, setReason] = useState<string>(list[0]?.off_reason ?? (esLibreFijo ? 'semanal' : 'cambio'))
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const choque = useMemo(() => {
    if (kind !== 'trabajo') return []
    const out = new Set<string>()
    for (const f of two ? [f1, f2] : [f1]) {
      if (!f.rest) continue
      const p = build(date, f)
      for (const s of shifts) {
        if (s.work_date !== date || s.employee_id === emp.id || !s.rest_start || !s.rest_end) continue
        if (s.rest_start < p.rest_end! && s.rest_end > p.rest_start!) out.add(emps.find((e) => e.id === s.employee_id)?.full_name ?? 'otro empleado')
      }
    }
    return Array.from(out)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, two, f1, f2, shifts])

  const guardar = async () => {
    setErr('')
    if (list.length > 0 && !note.trim()) return setErr('Escribe el motivo del cambio. Queda registrado en el historial.')
    const forms = kind === 'trabajo' ? (two ? [f1, f2] : [f1]) : []
    for (const f of forms) if (f.ini === f.fin) return setErr('La hora de entrada y la de salida no pueden ser iguales.')
    if (kind === 'trabajo' && two) {
      const a = build(date, f1), b = build(date, f2)
      if (b.scheduled_start < a.scheduled_end) return setErr('El segundo turno debe empezar cuando ya terminó el primero.')
    }
    setBusy(true)
    const motivo = note.trim()
    const upsert = async (slot: 1 | 2, row: Record<string, unknown>) => {
      const ex = list.find((s) => s.turno_num === slot)
      return ex
        ? supabase.from('shifts').update({ ...row, change_note: motivo }).eq('id', ex.id)
        : supabase.from('shifts').insert({ ...row, employee_id: emp.id, work_date: date, turno_num: slot, change_note: motivo || null })
    }
    const quitar2 = async () => {
      const ex = list.find((s) => s.turno_num === 2)
      return ex ? supabase.from('shifts').delete().eq('id', ex.id) : { error: null }
    }
    let res
    if (kind === 'libre') {
      res = await quitar2()
      if (!res.error) res = await upsert(1, { kind: 'libre', off_reason: reason, scheduled_start: null, scheduled_end: null, rest_start: null, rest_end: null })
    } else {
      res = await upsert(1, { kind: 'trabajo', off_reason: null, ...build(date, f1) })
      if (!res.error) res = two ? await upsert(2, { kind: 'trabajo', off_reason: null, ...build(date, f2) }) : await quitar2()
    }
    setBusy(false)
    if (res.error) { onPartial(); return setErr(errMsg(res.error)) }
    onSaved()
  }

  const eliminar = async () => {
    if (!confirm('¿Eliminar los turnos de este día? Solo es posible si aún no tienen registros de asistencia.')) return
    setBusy(true)
    const { error } = await supabase.from('shifts').delete().in('id', list.map((s) => s.id))
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onSaved()
  }

  return (
    <Modal title={`${emp.full_name} · ${dayLabel(date)}`} onClose={onClose}
      footer={<>
        {list.length > 0 && <button className="btn danger ghost" disabled={busy} onClick={eliminar} style={{ marginRight: 'auto', color: 'var(--err)' }}>Eliminar</button>}
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
            <TurnoCampos f={f1} set={setF1} titulo={two ? 'Turno 1' : undefined} />
            <label className="check"><input type="checkbox" checked={two} onChange={(e) => setTwo(e.target.checked)} /> Este día tiene un segundo turno (por ejemplo, cubrir la noche)</label>
            {two && <TurnoCampos f={f2} set={setF2} titulo="Turno 2" />}
            {two && <Notice tone="info">Cada turno se registra por separado: el empleado marca entrada y salida en cada uno. Las comidas se exigen según el horario de cada turno.</Notice>}
            {choque.length > 0 && <Notice tone="warn">Un descanso coincide con el de {choque.join(', ')}. Debe haber siempre al menos 2 personas en turno.</Notice>}
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
        <Field label={list.length > 0 ? 'Motivo del cambio (obligatorio)' : 'Observación (opcional)'}>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={list.length > 0 ? 'Ej.: cubre el día libre de la recepcionista nocturna' : ''} />
        </Field>
        {err && <Notice tone="err">{err}</Notice>}
      </div>
    </Modal>
  )
}

/* ---------- Asignación de un feriado a todo el personal ---------- */
interface FerRow { emp: Employee; mode: 'libre' | 'trabaja'; f: TForm; locked: boolean; existing: Shift[] }

function FeriadoModal({ holiday, emps, dayShifts, onClose, onSaved }: {
  holiday: Holiday; emps: Employee[]; dayShifts: Shift[]; onClose: () => void; onSaved: () => void
}) {
  const date = holiday.holiday_date
  const year = date.slice(0, 4)
  const [rows, setRows] = useState<FerRow[]>(() => emps.map((emp) => {
    const existing = dayShifts.filter((s) => s.employee_id === emp.id).sort((a, b) => a.turno_num - b.turno_num)
    const trabajo = existing.filter((s) => s.kind === 'trabajo')
    return {
      emp, existing, locked: trabajo.length > 1,
      mode: trabajo.length > 0 ? 'trabaja' : 'libre',
      f: formFrom(trabajo[0], DEFAULTS[emp.cargo]),
    }
  }))
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  // Feriados ya trabajados este año (para repartir con justicia)
  const { data: conteo } = useLoad(async () => {
    const h = await supabase.from('holidays').select('holiday_date').gte('holiday_date', `${year}-01-01`).lte('holiday_date', `${year}-12-31`)
    if (h.error) throw h.error
    const fechas = (h.data ?? []).map((x) => x.holiday_date as string).filter((d) => d !== date)
    const res: Record<string, number> = {}
    if (fechas.length > 0) {
      const s = await supabase.from('shifts').select('employee_id, work_date').eq('kind', 'trabajo').in('work_date', fechas)
      if (s.error) throw s.error
      const vistos = new Set<string>()
      for (const x of s.data ?? []) {
        const k = `${x.employee_id}|${x.work_date}`
        if (vistos.has(k)) continue
        vistos.add(k)
        res[x.employee_id as string] = (res[x.employee_id as string] ?? 0) + 1
      }
    }
    return res
  }, [date])

  const setRow = (i: number, patch: Partial<FerRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  const trabajan = rows.filter((r) => r.mode === 'trabaja')
  const dia = trabajan.filter((r) => r.locked || toMin(r.f.fin) > toMin(r.f.ini)).length
  const noche = trabajan.filter((r) => !r.locked && toMin(r.f.fin) <= toMin(r.f.ini)).length

  const guardar = async () => {
    setErr('')
    for (const r of rows) if (!r.locked && r.mode === 'trabaja' && r.f.ini === r.f.fin) return setErr(`${r.emp.full_name}: la entrada y la salida no pueden ser iguales.`)
    setBusy(true)
    const motivo = note.trim() || `Feriado: ${holiday.name}`
    const fallos: string[] = []
    for (const r of rows) {
      if (r.locked) continue
      const trabajo = r.existing.find((s) => s.kind === 'trabajo')
      const libre = r.existing.find((s) => s.kind === 'libre')
      let error: { message: string } | null = null
      if (r.mode === 'libre') {
        if (libre) {
          if (libre.off_reason !== 'feriado') ({ error } = await supabase.from('shifts').update({ off_reason: 'feriado', change_note: motivo }).eq('id', libre.id))
        } else {
          if (trabajo) ({ error } = await supabase.from('shifts').delete().eq('id', trabajo.id))
          if (!error) ({ error } = await supabase.from('shifts').insert({ employee_id: r.emp.id, work_date: date, turno_num: 1, kind: 'libre', off_reason: 'feriado', change_note: motivo }))
        }
      } else {
        const fila = { kind: 'trabajo', off_reason: null, ...build(date, r.f) }
        if (trabajo) ({ error } = await supabase.from('shifts').update({ ...fila, change_note: motivo }).eq('id', trabajo.id))
        else {
          if (libre) ({ error } = await supabase.from('shifts').delete().eq('id', libre.id))
          if (!error) ({ error } = await supabase.from('shifts').insert({ ...fila, employee_id: r.emp.id, work_date: date, turno_num: 1, change_note: motivo }))
        }
      }
      if (error) fallos.push(`${r.emp.full_name}: ${errMsg(error)}`)
    }
    setBusy(false)
    if (fallos.length > 0) return setErr(fallos.join(' · '))
    onSaved()
  }

  return (
    <Modal wide title={`Asignar feriado · ${holiday.name} (${dateEs(date)})`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" disabled={busy} onClick={guardar}>{busy ? 'Guardando…' : 'Guardar asignación'}</button></>}>
      <div className="stack-v">
        <p className="muted small">Marca quién trabaja este feriado. Quien quede como “Libre por feriado” no tendrá falta ni retraso ese día. Los feriados no se compensan.</p>
        <div>
          {rows.map((r, i) => (
            <div className="fer-row" key={r.emp.id}>
              <div>
                <b>{r.emp.full_name}</b> <span className="muted small">{CARGOS[r.emp.cargo]}</span>
                <div className="small muted">Feriados trabajados este año: <b>{conteo?.[r.emp.id] ?? 0}</b></div>
              </div>
              <div>
                {r.locked ? (
                  <span className="badge info">Tiene 2 turnos: edítalos en la casilla</span>
                ) : (
                  <div className="stack-v" style={{ gap: '.5rem' }}>
                    <div className="seg" role="group" aria-label={`Feriado de ${r.emp.full_name}`}>
                      <button type="button" className={r.mode === 'libre' ? 'on' : ''} onClick={() => setRow(i, { mode: 'libre' })}>Libre por feriado</button>
                      <button type="button" className={r.mode === 'trabaja' ? 'on' : ''} onClick={() => setRow(i, { mode: 'trabaja' })}>Trabaja</button>
                    </div>
                    {r.mode === 'trabaja' && (
                      <>
                        <div className="times">
                          <input type="time" aria-label="Entrada" value={r.f.ini} onChange={(e) => setRow(i, { f: { ...r.f, ini: e.target.value } })} />
                          <span>a</span>
                          <input type="time" aria-label="Salida" value={r.f.fin} onChange={(e) => setRow(i, { f: { ...r.f, fin: e.target.value } })} />
                          {toMin(r.f.fin) <= toMin(r.f.ini) && <span className="small muted">(hasta el día siguiente)</span>}
                        </div>
                        <label className="check"><input type="checkbox" checked={r.f.rest} onChange={(e) => setRow(i, { f: { ...r.f, rest: e.target.checked } })} /> Con descanso de 2 horas</label>
                        {r.f.rest && (
                          <div className="times">
                            <input type="time" aria-label="Inicio del descanso" value={r.f.rIni} onChange={(e) => setRow(i, { f: { ...r.f, rIni: e.target.value } })} />
                            <span>a</span>
                            <input type="time" aria-label="Fin del descanso" value={r.f.rFin} onChange={(e) => setRow(i, { f: { ...r.f, rFin: e.target.value } })} />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        {(dia < 2 || noche < 1) && (
          <Notice tone="warn">
            Cobertura: {dia} persona(s) de día y {noche} de noche. {dia < 2 && 'Debe haber al menos 2 personas de día. '}{noche < 1 && 'Nadie cubre la noche (22:00 a 07:00).'}
          </Notice>
        )}
        <Field label="Nota (opcional)" hint={`Si la dejas vacía se guarda “Feriado: ${holiday.name}”.`}>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {err && <Notice tone="err">{err}</Notice>}
      </div>
    </Modal>
  )
}

/* ---------- Cambiar el día libre de un empleado, o intercambiar entre dos ---------- */
function SelectorLibre({ emps, emp, fecha, onChange, titulo, excluir }: {
  emps: Employee[]; emp: string; fecha: string; titulo: string; excluir?: string
  onChange: (emp: string, fecha: string) => void
}) {
  const hoy = todayLP()
  const { data } = useLoad(async () => {
    if (!emp) return { libres: [] as Row[], hol: [] as Row[] }
    const [l, h] = await Promise.all([
      supabase.from('shifts').select('work_date, off_reason').eq('employee_id', emp).eq('kind', 'libre')
        .gte('work_date', addDays(hoy, -14)).lte('work_date', addDays(hoy, 120)).order('work_date'),
      supabase.from('holidays').select('holiday_date, name').gte('holiday_date', addDays(hoy, -14)).lte('holiday_date', addDays(hoy, 120)),
    ])
    if (l.error) throw l.error
    return { libres: (l.data ?? []) as Row[], hol: (h.data ?? []) as Row[] }
  }, [emp])
  const motivo: Record<string, string> = { semanal: 'libre semanal', feriado: 'libre por feriado', cambio: 'libre por cambio' }
  return (
    <div className="form-grid">
      <Field label={`${titulo}: empleado`}>
        <select value={emp} onChange={(e) => onChange(e.target.value, '')}>
          <option value="">Elige…</option>
          {emps.filter((e) => e.id !== excluir).map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
        </select>
      </Field>
      <Field label="Día libre actual que se cambia">
        <select value={fecha} disabled={!emp} onChange={(e) => onChange(emp, e.target.value)}>
          <option value="">{emp ? 'Elige un día libre…' : 'Primero elige al empleado'}</option>
          {data?.libres.map((l) => {
            const h = data.hol.find((x) => x.holiday_date === l.work_date)
            return <option key={l.work_date} value={l.work_date}>{DIAS[isoDow(l.work_date) - 1]} {dateEs(l.work_date)} · {motivo[l.off_reason] ?? 'libre'}{h ? ` · ${h.name}` : ''}</option>
          })}
        </select>
      </Field>
    </div>
  )
}

function CambioModal({ emps, onClose, onSaved }: { emps: Employee[]; onClose: () => void; onSaved: () => void }) {
  const [tipo, setTipo] = useState<'mover' | 'intercambio'>('mover')
  const [empA, setEmpA] = useState('')
  const [fechaA, setFechaA] = useState('')
  const [empB, setEmpB] = useState('')
  const [fechaB, setFechaB] = useState('')
  const [nueva, setNueva] = useState('')
  const [fA, setFA] = useState<TForm>(formFrom(undefined, DEFAULTS.camarero))
  const [fB, setFB] = useState<TForm>(formFrom(undefined, DEFAULTS.camarero))
  const [tocoA, setTocoA] = useState(false)
  const [tocoB, setTocoB] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [aprobado, setAprobado] = useState('Administración')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const a = emps.find((e) => e.id === empA)
  const b = emps.find((e) => e.id === empB)

  // Sugiere el horario: cada uno toma el turno que el otro deja ese día; si no hay, el habitual de su cargo.
  const { data: previo } = useLoad(async () => {
    if (tipo !== 'intercambio' || !empA || !fechaA || !empB || !fechaB) return null
    const [x, y] = await Promise.all([
      supabase.from('shifts').select('*').eq('employee_id', empB).eq('work_date', fechaA).eq('kind', 'trabajo').order('turno_num').limit(1),
      supabase.from('shifts').select('*').eq('employee_id', empA).eq('work_date', fechaB).eq('kind', 'trabajo').order('turno_num').limit(1),
    ])
    return { paraA: ((x.data ?? []) as Shift[])[0], paraB: ((y.data ?? []) as Shift[])[0] }
  }, [tipo, empA, fechaA, empB, fechaB])

  useEffect(() => {
    if (!tocoA) setFA(formFrom(previo?.paraA, DEFAULTS[a?.cargo ?? 'camarero']))
    if (!tocoB) setFB(formFrom(previo?.paraB, DEFAULTS[b?.cargo ?? 'camarero']))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previo, empA, empB])

  const trabajo = (fecha: string, f: TForm) => {
    const t = build(fecha, f)
    return { inicio: t.scheduled_start, fin: t.scheduled_end, descanso_inicio: t.rest_start, descanso_fin: t.rest_end }
  }

  const guardar = async () => {
    setErr('')
    if (!empA || !fechaA) return setErr('Elige al empleado y su día libre actual.')
    if (motivo.trim().length < 3) return setErr('Escribe el motivo o el acuerdo que se aprobó.')
    if (fA.ini === fA.fin) return setErr('Revisa la entrada y la salida.')
    setBusy(true)
    let res
    if (tipo === 'mover') {
      if (!nueva) { setBusy(false); return setErr('Elige la nueva fecha del día libre.') }
      res = await supabase.rpc('mover_dia_libre', {
        p_employee: empA, p_desde: fechaA, p_hasta: nueva, p_trabajo: trabajo(fechaA, fA), p_motivo: motivo, p_aprobado: aprobado,
      })
    } else {
      if (!empB || !fechaB) { setBusy(false); return setErr('Elige al segundo empleado y su día libre actual.') }
      if (fB.ini === fB.fin) { setBusy(false); return setErr('Revisa la entrada y la salida del segundo empleado.') }
      res = await supabase.rpc('intercambiar_dias_libres', {
        p_emp_a: empA, p_fecha_a: fechaA, p_emp_b: empB, p_fecha_b: fechaB,
        p_trabajo_a: trabajo(fechaA, fA), p_trabajo_b: trabajo(fechaB, fB), p_motivo: motivo, p_aprobado: aprobado,
      })
    }
    setBusy(false)
    if (res.error) return setErr(errMsg(res.error))
    onSaved()
  }

  return (
    <Modal wide title="Cambiar día libre" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" disabled={busy} onClick={guardar}>{busy ? 'Guardando…' : 'Autorizar cambio'}</button></>}>
      <div className="stack-v">
        <div className="seg" role="group" aria-label="Tipo de cambio">
          <button type="button" className={tipo === 'mover' ? 'on' : ''} onClick={() => setTipo('mover')}>Mover el día libre de un empleado</button>
          <button type="button" className={tipo === 'intercambio' ? 'on' : ''} onClick={() => setTipo('intercambio')}>Intercambiar entre dos empleados</button>
        </div>
        <Notice tone="info">
          {tipo === 'mover'
            ? 'Sirve para pasar un feriado o una salida semanal a otra fecha. El día libre original pasa a ser día de trabajo y la fecha nueva queda libre: si era un feriado, esa fecha queda como “libre por feriado” y no cuenta falta ni descuenta horas.'
            : 'Cada empleado sale el día libre del otro. Los días libres fijos de cada uno no cambian: el intercambio vale solo esta vez.'}
          {' '}Queda registrado con el motivo y quién lo aprobó.
        </Notice>

        <SelectorLibre emps={emps} emp={empA} fecha={fechaA} titulo={tipo === 'mover' ? 'Empleado' : 'Primer empleado'}
          onChange={(e, f) => { setEmpA(e); setFechaA(f); setTocoA(false) }} excluir={tipo === 'intercambio' ? empB : undefined} />
        {tipo === 'mover' && (
          <Field label="Nueva fecha del día libre" hint="El empleado quedará libre ese día y trabajará el día libre original.">
            <input type="date" value={nueva} onChange={(e) => setNueva(e.target.value)} />
          </Field>
        )}
        {tipo === 'intercambio' && (
          <SelectorLibre emps={emps} emp={empB} fecha={fechaB} titulo="Segundo empleado"
            onChange={(e, f) => { setEmpB(e); setFechaB(f); setTocoB(false) }} excluir={empA} />
        )}

        {empA && fechaA && (
          <div className="panel" style={{ background: '#fffdf6' }}>
            <TurnoCampos f={fA} set={(f) => { setFA(f); setTocoA(true) }} titulo={`${a?.full_name} trabajará el ${dateEs(fechaA)}`} />
          </div>
        )}
        {tipo === 'intercambio' && empB && fechaB && (
          <div className="panel" style={{ background: '#fffdf6' }}>
            <TurnoCampos f={fB} set={(f) => { setFB(f); setTocoB(true) }} titulo={`${b?.full_name} trabajará el ${dateEs(fechaB)}`} />
          </div>
        )}

        <Field label="Motivo o acuerdo aprobado (obligatorio)">
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: prefiere salir el viernes; acordado con administración" />
        </Field>
        <Field label="Aprobado por"><input type="text" value={aprobado} onChange={(e) => setAprobado(e.target.value)} /></Field>
        {err && <Notice tone="err">{err}</Notice>}
      </div>
    </Modal>
  )
}
