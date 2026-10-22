import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, EMP_COLS, errMsg } from '../../lib/supabase'
import { useLoad } from '../../lib/hooks'
import { CARGOS, type Cargo, type Employee } from '../../lib/types'
import { DIAS, timeLP } from '../../lib/time'
import { Empty, ErrorBox, Field, Modal, Notice, PageHead, Spinner } from '../../components/ui'

export default function Empleados() {
  const [edit, setEdit] = useState<Employee | 'nuevo' | null>(null)
  const [pinFor, setPinFor] = useState<Employee | null>(null)
  const [info, setInfo] = useState('')

  const { data, loading, error, reload } = useLoad(async () => {
    const { data, error } = await supabase.from('employees').select(EMP_COLS).order('active', { ascending: false }).order('full_name')
    if (error) throw error
    return (data ?? []) as Employee[]
  }, [])

  const desbloquear = async (e: Employee) => {
    const { error } = await supabase.rpc('admin_desbloquear_pin', { p_employee_id: e.id })
    setInfo(error ? errMsg(error) : `PIN de ${e.full_name} desbloqueado.`)
    reload(true)
  }
  const bloqueado = (e: Employee) => !!e.pin_locked_until && new Date(e.pin_locked_until) > new Date()

  return (
    <div className="stack-v">
      <PageHead title="Empleados" sub="Altas, cargos, día libre semanal y PIN del quiosco.">
        <button className="btn" onClick={() => setEdit('nuevo')}>Agregar empleado</button>
      </PageHead>
      {info && <Notice tone="info">{info}</Notice>}
      {loading && !data && <Spinner />}
      {error && <ErrorBox message={error} onRetry={() => reload()} />}
      {data && (
        <div className="panel">
          {data.length === 0 ? <Empty>Aún no hay empleados. Agrega el primero con “Agregar empleado”.</Empty> : (
            <div className="tbl-wrap">
              <table className="tbl stack">
                <thead><tr><th>Nombre</th><th>Cargo</th><th>Día libre fijo</th><th>PIN</th><th>Estado</th><th /></tr></thead>
                <tbody>
                  {data.map((e) => (
                    <tr key={e.id}>
                      <td data-label="Nombre"><Link to={`/admin/empleados/${e.id}`}><b>{e.full_name}</b></Link></td>
                      <td data-label="Cargo">{CARGOS[e.cargo]}</td>
                      <td data-label="Día libre fijo">{DIAS[e.weekly_day_off - 1]}</td>
                      <td data-label="PIN">
                        {bloqueado(e) ? <span className="badge err">✕ Bloqueado hasta {timeLP(e.pin_locked_until)}</span>
                          : e.pin_set_at ? <span className="badge ok">✓ Definido</span> : <span className="badge warn">! Sin PIN</span>}
                      </td>
                      <td data-label="Estado">{e.active ? <span className="badge ok">Activo</span> : <span className="badge mute">Inactivo</span>}</td>
                      <td className="right nowrap">
                        <button className="btn sm ghost" onClick={() => setPinFor(e)}>{e.pin_set_at ? 'Cambiar PIN' : 'Definir PIN'}</button>{' '}
                        {bloqueado(e) && <button className="btn sm gold" onClick={() => desbloquear(e)}>Desbloquear</button>}{' '}
                        <button className="btn sm" onClick={() => setEdit(e)}>Editar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {edit && <Formulario emp={edit === 'nuevo' ? null : edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload() }} />}
      {pinFor && <PinModal emp={pinFor} onClose={() => setPinFor(null)} onDone={() => { setPinFor(null); setInfo(`PIN de ${pinFor.full_name} actualizado.`); reload() }} />}
    </div>
  )
}

function Formulario({ emp, onClose, onDone }: { emp: Employee | null; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(emp?.full_name ?? '')
  const [cargo, setCargo] = useState<Cargo>(emp?.cargo ?? 'camarero')
  const [off, setOff] = useState(emp?.weekly_day_off ?? 7)
  const [hired, setHired] = useState(emp?.hired_on ?? '')
  const [active, setActive] = useState(emp?.active ?? true)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const go = async () => {
    setErr('')
    if (!name.trim()) return setErr('Escribe el nombre completo.')
    const row = { full_name: name.trim(), cargo, weekly_day_off: off, hired_on: hired || null, active }
    setBusy(true)
    const { error } = emp ? await supabase.from('employees').update(row).eq('id', emp.id) : await supabase.from('employees').insert(row)
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onDone()
  }
  return (
    <Modal title={emp ? 'Editar empleado' : 'Agregar empleado'} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" disabled={busy} onClick={go}>Guardar</button></>}>
      <div className="stack-v">
        <Field label="Nombre completo"><input type="text" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="form-grid">
          <Field label="Cargo"><select value={cargo} onChange={(e) => setCargo(e.target.value as Cargo)}>{Object.entries(CARGOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Día libre fijo semanal"><select value={off} onChange={(e) => setOff(Number(e.target.value))}>{DIAS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></Field>
          <Field label="Fecha de ingreso (opcional)"><input type="date" value={hired} onChange={(e) => setHired(e.target.value)} /></Field>
        </div>
        <label className="check"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Empleado activo</label>
        {!active && <Notice tone="info">Un empleado inactivo deja de aparecer en el quiosco. Su historial se conserva.</Notice>}
        {err && <Notice tone="err">{err}</Notice>}
      </div>
    </Modal>
  )
}

function PinModal({ emp, onClose, onDone }: { emp: Employee; onClose: () => void; onDone: () => void }) {
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setErr('')
    if (!/^[0-9]{4,6}$/.test(pin)) return setErr('El PIN debe tener entre 4 y 6 dígitos numéricos.')
    setBusy(true)
    const { error } = await supabase.rpc('admin_definir_pin', { p_employee_id: emp.id, p_pin: pin })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onDone()
  }
  return (
    <Modal title={`PIN de ${emp.full_name}`} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" disabled={busy} onClick={go}>Guardar PIN</button></>}>
      <div className="stack-v">
        <Field label="Nuevo PIN (4 a 6 dígitos)" hint="El PIN se guarda cifrado y no se puede volver a ver. Si se olvida, defines uno nuevo.">
          <input type="text" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <p className="muted small">Entrégalo al empleado en persona. Evita fechas de nacimiento o secuencias como 1234.</p>
        {err && <Notice tone="err">{err}</Notice>}
      </div>
    </Modal>
  )
}
