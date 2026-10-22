import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase, EMP_COLS, errMsg } from '../../lib/supabase'
import { useLoad } from '../../lib/hooks'
import { COMIDAS, ESTADOS, type Employee, type Row } from '../../lib/types'
import { addDays, dateTimeLP, dayLabel, hm, hoursFmt, inputToISO, isoToInput, timeLP, todayLP } from '../../lib/time'
import { EstadoBadge, ErrorBox, Empty, Field, Modal, Notice, PageHead, Spinner } from '../../components/ui'

export default function Asistencia() {
  const [params, setParams] = useSearchParams()
  const [from, setFrom] = useState(addDays(todayLP(), -6))
  const [to, setTo] = useState(todayLP())
  const [emp, setEmp] = useState('')
  const [estado, setEstado] = useState('')
  const [shiftId, setShiftId] = useState<string | null>(params.get('turno'))

  const { data, loading, error, reload } = useLoad(async () => {
    let q = supabase.from('v_jornadas').select('*').gte('work_date', from).lte('work_date', to).order('work_date', { ascending: false }).order('scheduled_start')
    if (emp) q = q.eq('employee_id', emp)
    if (estado) q = q.eq('estado', estado)
    const [j, e] = await Promise.all([q, supabase.from('employees').select(EMP_COLS).order('full_name')])
    if (j.error) throw j.error
    if (e.error) throw e.error
    return { rows: (j.data ?? []) as Row[], emps: (e.data ?? []) as Employee[] }
  }, [from, to, emp, estado])

  const cerrar = () => { setShiftId(null); if (params.has('turno')) setParams({}) }

  return (
    <div className="stack-v">
      <PageHead title="Asistencia" sub="Historial de jornadas. Abre una jornada para corregir registros o justificar." />
      <div className="panel">
        <div className="form-grid">
          <Field label="Desde"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Hasta"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label="Empleado">
            <select value={emp} onChange={(e) => setEmp(e.target.value)}>
              <option value="">Todos</option>
              {data?.emps.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </Field>
          <Field label="Estado">
            <select value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
        </div>
      </div>

      {loading && !data && <Spinner />}
      {error && <ErrorBox message={error} onRetry={() => reload()} />}
      {data && (
        <div className="panel">
          {data.rows.length === 0 ? <Empty>No hay jornadas en este período con esos filtros.</Empty> : (
            <div className="tbl-wrap">
              <table className="tbl stack">
                <thead><tr><th>Fecha</th><th>Empleado</th><th>Turno</th><th>Entrada</th><th>Salida</th><th className="num">Retraso</th><th className="num">Sal. anticipada</th><th>Estado</th></tr></thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.shift_id} className="click" onClick={() => setShiftId(r.shift_id)}>
                      <td data-label="Fecha" className="nowrap">{dayLabel(r.work_date)}{r.es_feriado && <span className="badge gold" style={{ marginLeft: 6 }}>★</span>}</td>
                      <td data-label="Empleado"><b>{r.full_name}</b></td>
                      <td data-label="Turno" className="nowrap">{timeLP(r.scheduled_start)}–{timeLP(r.scheduled_end)}</td>
                      <td data-label="Entrada">{timeLP(r.entrada_real)}{r.entrada_en_dispositivo_autorizado === false && <span className="badge warn" title="Equipo no autorizado" style={{ marginLeft: 6 }}>!</span>}</td>
                      <td data-label="Salida">{timeLP(r.salida_real)}</td>
                      <td data-label="Retraso" className="num">{hm(r.retraso_total_min)}</td>
                      <td data-label="Sal. anticipada" className="num">{hm(r.salida_anticipada_min)}</td>
                      <td data-label="Estado"><EstadoBadge estado={r.estado} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {shiftId && <Detalle shiftId={shiftId} onClose={cerrar} onChanged={() => reload(true)} />}
    </div>
  )
}

function Detalle({ shiftId, onClose, onChanged }: { shiftId: string; onClose: () => void; onChanged: () => void }) {
  const [sub, setSub] = useState<null | { t: 'corregir'; rec: Row } | { t: 'manual' } | { t: 'justificar'; kind: string }>(null)
  const { data, loading, error, reload } = useLoad(async () => {
    const [j, r, i] = await Promise.all([
      supabase.from('v_jornadas').select('*').eq('shift_id', shiftId).maybeSingle(),
      supabase.from('time_records').select('*').eq('shift_id', shiftId).order('started_at'),
      supabase.from('incidents').select('*').eq('shift_id', shiftId).order('created_at'),
    ])
    for (const x of [j, r, i]) if (x.error) throw x.error
    const recs = (r.data ?? []) as Row[]
    let audit: Row[] = []
    if (recs.length) {
      const a = await supabase.from('audit_log').select('*').in('record_id', recs.map((x) => x.id)).order('changed_at', { ascending: false })
      if (a.error) throw a.error
      audit = (a.data ?? []) as Row[]
    }
    return { j: j.data as Row | null, recs, inc: (i.data ?? []) as Row[], audit }
  }, [shiftId])

  const refrescar = () => { reload(true); onChanged() }
  const j = data?.j
  const tiene = (k: string) => data?.inc.some((x) => x.kind === k)
  const usados = new Set(data?.recs.map((x) => x.kind))

  return (
    <Modal wide title={j ? `${j.full_name} · ${dayLabel(j.work_date)}` : 'Jornada'} onClose={onClose}>
      {loading && !data && <Spinner />}
      {error && <ErrorBox message={error} />}
      {data && j && (
        <div className="stack-v">
          <div className="row between">
            <span>Turno programado: <b>{timeLP(j.scheduled_start)}–{timeLP(j.scheduled_end)}</b>{j.rest_start && <> · descanso {timeLP(j.rest_start)}–{timeLP(j.rest_end)}</>}</span>
            <EstadoBadge estado={j.estado} />
          </div>
          <div className="kpis">
            <div className="kpi"><div className="n">{hm(j.retraso_min)}</div><div className="l">Retraso{j.retraso_justificado_min > 0 && ` (justificado: ${hm(j.retraso_justificado_min)})`}</div></div>
            <div className="kpi"><div className="n">{hm(j.exceso_comida_min)}</div><div className="l">Exceso de comida</div></div>
            <div className="kpi"><div className="n">{hm(j.salida_anticipada_min)}</div><div className="l">Salida anticipada</div></div>
            <div className="kpi"><div className="n">{hoursFmt(j.efectivas_min === null ? null : j.efectivas_min / 60)}</div><div className="l">Efectivas de {hoursFmt(j.programadas_min / 60)}</div></div>
          </div>

          <div>
            <div className="row between" style={{ marginBottom: '.5rem' }}>
              <h3>Registros</h3>
              <button className="btn sm ghost" onClick={() => setSub({ t: 'manual' })}>Agregar registro olvidado</button>
            </div>
            {data.recs.length === 0 ? <Empty>El empleado aún no registró nada en este turno.</Empty> : (
              <div className="tbl-wrap">
                <table className="tbl stack">
                  <thead><tr><th>Tipo</th><th>Inicio</th><th>Fin</th><th>Origen</th><th /></tr></thead>
                  <tbody>
                    {data.recs.map((r) => {
                      const cambio = r.corrected_at
                      return (
                        <tr key={r.id}>
                          <td data-label="Tipo"><b>{COMIDAS[r.kind] ?? r.kind}</b></td>
                          <td data-label="Inicio">{dateTimeLP(r.started_at)}{cambio && r.original_started_at !== r.started_at && <div className="small muted">Original: {dateTimeLP(r.original_started_at)}</div>}</td>
                          <td data-label="Fin">{r.ended_at ? dateTimeLP(r.ended_at) : <span className="badge warn">Sin cerrar</span>}{cambio && r.original_ended_at !== r.ended_at && <div className="small muted">Original: {r.original_ended_at ? dateTimeLP(r.original_ended_at) : 'sin cierre'}</div>}</td>
                          <td data-label="Origen">{r.origin === 'admin' ? <span className="badge info">Administración</span> : 'Empleado'}{cambio && <span className="badge gold" style={{ marginLeft: 4 }}>Corregido</span>}{r.kind === 'jornada' && r.device_id === null && r.origin === 'empleado' && <span className="badge warn" style={{ marginLeft: 4 }}>Equipo no autorizado</span>}</td>
                          <td className="right"><button className="btn sm" onClick={() => setSub({ t: 'corregir', rec: r })}>Corregir</button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h3 style={{ marginBottom: '.5rem' }}>Justificaciones</h3>
            {data.inc.length === 0 && <p className="muted">Sin justificaciones ni observaciones en este turno.</p>}
            {data.inc.map((x) => (
              <p key={x.id} style={{ marginBottom: '.4rem' }}>
                <span className="badge info">{x.kind.replace(/_/g, ' ')}</span>{x.es_excepcion && <span className="badge gold" style={{ marginLeft: 4 }}>Excepción: justificada después</span>}
                {' '}{x.note} <span className="muted small">({dateTimeLP(x.created_at)})</span>
              </p>
            ))}
            <div className="row" style={{ marginTop: '.5rem' }}>
              {!tiene('retraso_justificado') && <button className="btn sm ghost" onClick={() => setSub({ t: 'justificar', kind: 'retraso_justificado' })}>Justificar retraso</button>}
              {!tiene('salida_anticipada_justificada') && <button className="btn sm ghost" onClick={() => setSub({ t: 'justificar', kind: 'salida_anticipada_justificada' })}>Justificar salida anticipada</button>}
              {!tiene('falta_justificada') && <button className="btn sm ghost" onClick={() => setSub({ t: 'justificar', kind: 'falta_justificada' })}>Justificar falta</button>}
            </div>
            <p className="small muted" style={{ marginTop: '.4rem' }}>Retrasos y salidas anticipadas solo se justifican si se aprueban antes de que ocurran. Las faltas pueden justificarse después como excepción.</p>
          </div>

          {data.audit.length > 0 && (
            <div>
              <h3 style={{ marginBottom: '.5rem' }}>Historial de cambios</h3>
              {data.audit.map((a) => (
                <p key={a.id} className="small" style={{ marginBottom: '.3rem' }}>
                  <b>{dateTimeLP(a.changed_at)}</b> · {a.action === 'registro_manual' ? 'Registro manual' : 'Corrección'} de {COMIDAS[(a.new_data as Row)?.kind] ?? ''}: {a.reason}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
      {sub?.t === 'corregir' && <Corregir rec={sub.rec} onClose={() => setSub(null)} onDone={() => { setSub(null); refrescar() }} />}
      {sub?.t === 'manual' && data && <Manual shiftId={shiftId} usados={usados} onClose={() => setSub(null)} onDone={() => { setSub(null); refrescar() }} />}
      {sub?.t === 'justificar' && data && <Justificar shiftId={shiftId} empId={j?.employee_id} kind={sub.kind} onClose={() => setSub(null)} onDone={() => { setSub(null); refrescar() }} />}
    </Modal>
  )
}

function Corregir({ rec, onClose, onDone }: { rec: Row; onClose: () => void; onDone: () => void }) {
  const [ini, setIni] = useState(isoToInput(rec.started_at))
  const [fin, setFin] = useState(isoToInput(rec.ended_at))
  const [why, setWhy] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setErr('')
    if (why.trim().length < 3) return setErr('Escribe el motivo de la corrección.')
    setBusy(true)
    const { error } = await supabase.rpc('corregir_registro', { p_record_id: rec.id, p_started_at: inputToISO(ini), p_ended_at: inputToISO(fin), p_reason: why })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onDone()
  }
  return (
    <Modal title={`Corregir ${COMIDAS[rec.kind]?.toLowerCase() ?? rec.kind}`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" disabled={busy} onClick={go}>Guardar corrección</button></>}>
      <div className="stack-v">
        <div className="form-grid">
          <Field label="Inicio"><input type="datetime-local" value={ini} onChange={(e) => setIni(e.target.value)} /></Field>
          <Field label="Fin" hint="Déjalo vacío si debe seguir abierto"><input type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} /></Field>
        </div>
        <Field label="Motivo (obligatorio)"><textarea value={why} onChange={(e) => setWhy(e.target.value)} /></Field>
        <Notice tone="info">El registro original se conserva y la corrección queda en el historial con tu usuario.</Notice>
        {err && <Notice tone="err">{err}</Notice>}
      </div>
    </Modal>
  )
}

function Manual({ shiftId, usados, onClose, onDone }: { shiftId: string; usados: Set<string>; onClose: () => void; onDone: () => void }) {
  const libres = Object.keys(COMIDAS).filter((k) => !usados.has(k))
  const [kind, setKind] = useState(libres[0] ?? '')
  const [ini, setIni] = useState('')
  const [fin, setFin] = useState('')
  const [why, setWhy] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setErr('')
    if (!kind || !ini) return setErr('Indica el tipo y la hora de inicio.')
    if (why.trim().length < 3) return setErr('Escribe el motivo.')
    setBusy(true)
    const { error } = await supabase.rpc('crear_registro_manual', { p_shift_id: shiftId, p_kind: kind, p_started_at: inputToISO(ini), p_ended_at: inputToISO(fin), p_reason: why })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onDone()
  }
  return (
    <Modal title="Agregar registro olvidado" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" disabled={busy || libres.length === 0} onClick={go}>Guardar</button></>}>
      <div className="stack-v">
        {libres.length === 0 && <Notice tone="info">Este turno ya tiene todos los tipos de registro.</Notice>}
        <Field label="Tipo"><select value={kind} onChange={(e) => setKind(e.target.value)}>{libres.map((k) => <option key={k} value={k}>{COMIDAS[k]}</option>)}</select></Field>
        <div className="form-grid">
          <Field label="Inicio"><input type="datetime-local" value={ini} onChange={(e) => setIni(e.target.value)} /></Field>
          <Field label="Fin (opcional)"><input type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} /></Field>
        </div>
        <Field label="Motivo (obligatorio)"><textarea value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Ej.: olvidó registrar su salida" /></Field>
        {err && <Notice tone="err">{err}</Notice>}
      </div>
    </Modal>
  )
}

function Justificar({ shiftId, empId, kind, onClose, onDone }: { shiftId: string; empId?: string; kind: string; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const titulo = { retraso_justificado: 'Justificar retraso', salida_anticipada_justificada: 'Justificar salida anticipada', falta_justificada: 'Justificar falta' }[kind]
  const go = async () => {
    setErr('')
    if (!note.trim()) return setErr('Escribe la justificación.')
    setBusy(true)
    const { error } = await supabase.from('incidents').insert({ shift_id: shiftId, employee_id: empId, kind, note: note.trim() })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onDone()
  }
  return (
    <Modal title={titulo ?? 'Justificar'} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" disabled={busy} onClick={go}>Guardar</button></>}>
      <div className="stack-v">
        <Field label="Justificación"><textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {kind !== 'falta_justificada' && <Notice tone="info">Solo se acepta si se aprueba antes de que ocurra el retraso o la salida anticipada.</Notice>}
        {err && <Notice tone="err">{err}</Notice>}
      </div>
    </Modal>
  )
}
