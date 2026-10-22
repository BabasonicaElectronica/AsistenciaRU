import { useState } from 'react'
import { supabase, EMP_COLS, errMsg } from '../../lib/supabase'
import { useLoad } from '../../lib/hooks'
import { type Employee, type Row } from '../../lib/types'
import { dateEs, dateTimeLP, todayLP } from '../../lib/time'
import { Empty, ErrorBox, Field, Modal, Notice, PageHead, Spinner } from '../../components/ui'

const KINDS: Record<string, string> = {
  retraso_justificado: 'Retraso justificado',
  salida_anticipada_justificada: 'Salida anticipada justificada',
  falta_justificada: 'Falta justificada',
  observacion: 'Observación',
}

export default function Incidencias() {
  const [emp, setEmp] = useState('')
  const [kind, setKind] = useState('')
  const [nuevo, setNuevo] = useState(false)

  const { data, loading, error, reload } = useLoad(async () => {
    let q = supabase.from('incidents').select('*, employees(full_name), shifts(work_date)').order('created_at', { ascending: false }).limit(300)
    if (emp) q = q.eq('employee_id', emp)
    if (kind) q = q.eq('kind', kind)
    const [i, e] = await Promise.all([q, supabase.from('employees').select(EMP_COLS).order('full_name')])
    if (i.error) throw i.error
    if (e.error) throw e.error
    return { rows: (i.data ?? []) as Row[], emps: (e.data ?? []) as Employee[] }
  }, [emp, kind])

  return (
    <div className="stack-v">
      <PageHead title="Incidencias y justificaciones" sub="Aprobaciones previas, justificaciones de faltas y observaciones.">
        <button className="btn" onClick={() => setNuevo(true)}>Nueva incidencia</button>
      </PageHead>
      <div className="panel">
        <div className="form-grid">
          <Field label="Empleado"><select value={emp} onChange={(e) => setEmp(e.target.value)}><option value="">Todos</option>{data?.emps.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></Field>
          <Field label="Tipo"><select value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Todos</option>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        </div>
      </div>
      {loading && !data && <Spinner />}
      {error && <ErrorBox message={error} onRetry={() => reload()} />}
      {data && (
        <div className="panel">
          {data.rows.length === 0 ? <Empty>No hay incidencias registradas.</Empty> : (
            <div className="tbl-wrap">
              <table className="tbl stack">
                <thead><tr><th>Registrada</th><th>Empleado</th><th>Fecha del turno</th><th>Tipo</th><th>Detalle</th></tr></thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id}>
                      <td data-label="Registrada" className="nowrap">{dateTimeLP(r.created_at)}</td>
                      <td data-label="Empleado"><b>{(r.employees as Row)?.full_name}</b></td>
                      <td data-label="Fecha del turno">{dateEs((r.shifts as Row)?.work_date)}</td>
                      <td data-label="Tipo"><span className="badge info">{KINDS[r.kind]}</span>{r.es_excepcion && <span className="badge gold" style={{ marginLeft: 4 }}>Excepción</span>}</td>
                      <td data-label="Detalle">{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {nuevo && data && <Nueva emps={data.emps.filter((e) => e.active)} onClose={() => setNuevo(false)} onDone={() => { setNuevo(false); reload() }} />}
    </div>
  )
}

function Nueva({ emps, onClose, onDone }: { emps: Employee[]; onClose: () => void; onDone: () => void }) {
  const [emp, setEmp] = useState(emps[0]?.id ?? '')
  const [kind, setKind] = useState('retraso_justificado')
  const [date, setDate] = useState(todayLP())
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const go = async () => {
    setErr('')
    if (!emp || !note.trim()) return setErr('Elige al empleado y escribe el detalle.')
    setBusy(true)
    const { data: sh, error: e1 } = await supabase.from('shifts').select('id, kind').eq('employee_id', emp).eq('work_date', date).maybeSingle()
    if (e1) { setBusy(false); return setErr(errMsg(e1)) }
    if (kind !== 'observacion' && (!sh || sh.kind !== 'trabajo')) { setBusy(false); return setErr('Ese empleado no tiene un turno de trabajo programado en esa fecha.') }
    const { error } = await supabase.from('incidents').insert({ employee_id: emp, shift_id: sh?.id ?? null, kind, note: note.trim() })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onDone()
  }
  return (
    <Modal title="Nueva incidencia" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" disabled={busy} onClick={go}>Guardar</button></>}>
      <div className="stack-v">
        <div className="form-grid">
          <Field label="Empleado"><select value={emp} onChange={(e) => setEmp(e.target.value)}>{emps.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></Field>
          <Field label="Fecha del turno"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <Field label="Tipo"><select value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Detalle"><textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {kind === 'retraso_justificado' && <Notice tone="info">Se acepta solo si se registra antes de la hora de inicio del turno.</Notice>}
        {kind === 'salida_anticipada_justificada' && <Notice tone="info">Se acepta solo antes de que el empleado registre su salida.</Notice>}
        {kind === 'falta_justificada' && <Notice tone="info">Las faltas pueden justificarse después; quedan marcadas como excepción.</Notice>}
        {err && <Notice tone="err">{err}</Notice>}
      </div>
    </Modal>
  )
}
