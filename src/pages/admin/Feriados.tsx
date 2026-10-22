import { useState } from 'react'
import { supabase, errMsg, EMP_COLS } from '../../lib/supabase'
import { useLoad } from '../../lib/hooks'
import { type Holiday, type Employee, CARGOS } from '../../lib/types'
import { dateEs, DIAS, isoDow, todayLP } from '../../lib/time'
import { Empty, ErrorBox, Field, Notice, PageHead, Spinner } from '../../components/ui'

const FIJOS: { md: string; name: string; scope: 'nacional' | 'local' }[] = [
  { md: '01-01', name: 'Año Nuevo', scope: 'nacional' },
  { md: '01-22', name: 'Día del Estado Plurinacional', scope: 'nacional' },
  { md: '05-01', name: 'Día del Trabajo', scope: 'nacional' },
  { md: '06-21', name: 'Año Nuevo Andino Amazónico', scope: 'nacional' },
  { md: '08-06', name: 'Día de la Patria', scope: 'nacional' },
  { md: '11-02', name: 'Todos Santos', scope: 'nacional' },
  { md: '12-25', name: 'Navidad', scope: 'nacional' },
  { md: '07-16', name: 'Efemérides de La Paz', scope: 'local' },
]

export default function Feriados() {
  const [year, setYear] = useState(Number(todayLP().slice(0, 4)))
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const [scope, setScope] = useState<'nacional' | 'local'>('nacional')
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  const { data, loading, error, reload } = useLoad(async () => {
    const { data, error } = await supabase.from('holidays').select('*').gte('holiday_date', `${year}-01-01`).lte('holiday_date', `${year}-12-31`).order('holiday_date')
    if (error) throw error
    return (data ?? []) as Holiday[]
  }, [year])

  const { data: cont } = useLoad(async () => {
    const [h, e] = await Promise.all([
      supabase.from('holidays').select('holiday_date, name').gte('holiday_date', `${year}-01-01`).lte('holiday_date', `${year}-12-31`).order('holiday_date'),
      supabase.from('employees').select(EMP_COLS).eq('active', true).order('full_name'),
    ])
    if (h.error) throw h.error
    if (e.error) throw e.error
    const fechas = (h.data ?? []).map((x) => x.holiday_date as string)
    let turnos: { employee_id: string; work_date: string; kind: string }[] = []
    if (fechas.length > 0) {
      const s = await supabase.from('shifts').select('employee_id, work_date, kind').in('work_date', fechas)
      if (s.error) throw s.error
      turnos = (s.data ?? []) as typeof turnos
    }
    const filas = ((e.data ?? []) as Employee[]).map((emp) => {
      const trab: string[] = []
      let libres = 0
      let sin = 0
      for (const f of fechas) {
        const t = turnos.filter((x) => x.employee_id === emp.id && x.work_date === f)
        if (t.some((x) => x.kind === 'trabajo')) trab.push(f)
        else if (t.length > 0) libres++
        else sin++
      }
      return { emp, trab, libres, sin }
    })
    return { filas, total: fechas.length }
  }, [year, data?.length ?? -1])

  const agregar = async () => {
    setMsg(null)
    if (!date || !name.trim()) return setMsg({ tone: 'err', text: 'Indica la fecha y el nombre del feriado.' })
    const { error } = await supabase.from('holidays').insert({ holiday_date: date, name: name.trim(), scope })
    if (error) return setMsg({ tone: 'err', text: errMsg(error) })
    setDate(''); setName(''); reload()
  }
  const cargarFijos = async () => {
    setMsg(null)
    const rows = FIJOS.map((f) => ({ holiday_date: `${year}-${f.md}`, name: f.name, scope: f.scope }))
      .filter((r) => !data?.some((h) => h.holiday_date === r.holiday_date))
    if (rows.length === 0) return setMsg({ tone: 'ok', text: 'Los feriados de fecha fija ya estaban cargados.' })
    const { error } = await supabase.from('holidays').insert(rows)
    if (error) return setMsg({ tone: 'err', text: errMsg(error) })
    setMsg({ tone: 'ok', text: `Se cargaron ${rows.length} feriados de fecha fija. Revisa las fechas y agrega a mano los móviles.` })
    reload()
  }
  const quitar = async (h: Holiday) => {
    if (!confirm(`¿Eliminar el feriado “${h.name}”?`)) return
    const { error } = await supabase.from('holidays').delete().eq('id', h.id)
    if (error) setMsg({ tone: 'err', text: errMsg(error) })
    reload()
  }

  return (
    <div className="stack-v">
      <PageHead title="Feriados" sub="Calendario de consulta. Quién trabaja cada feriado se decide en Horarios; un feriado no es día libre por defecto." />
      <div className="panel">
        <h2>Agregar feriado</h2>
        <div className="form-grid" style={{ marginTop: '.7rem' }}>
          <Field label="Fecha"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Nombre"><input type="text" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Alcance"><select value={scope} onChange={(e) => setScope(e.target.value as 'nacional' | 'local')}><option value="nacional">Nacional (Bolivia)</option><option value="local">Local (La Paz)</option></select></Field>
        </div>
        <div className="row" style={{ marginTop: '.8rem' }}>
          <button className="btn" onClick={agregar}>Agregar</button>
          <button className="btn ghost" onClick={cargarFijos}>Cargar feriados de fecha fija de {year}</button>
        </div>
        {msg && <div style={{ marginTop: '.8rem' }}><Notice tone={msg.tone}>{msg.text}</Notice></div>}
        <p className="small muted" style={{ marginTop: '.6rem' }}>Carnaval, Viernes Santo y Corpus Christi cambian cada año: agrégalos a mano. Confirma también las fechas cargadas con el calendario oficial.</p>
      </div>
      <div className="panel">
        <div className="row between">
          <h2>Feriados de {year}</h2>
          <div className="row"><button className="btn sm ghost" onClick={() => setYear(year - 1)}>‹ {year - 1}</button><button className="btn sm ghost" onClick={() => setYear(year + 1)}>{year + 1} ›</button></div>
        </div>
        {loading && !data && <Spinner />}
        {error && <ErrorBox message={error} onRetry={() => reload()} />}
        {data && (data.length === 0 ? <Empty>No hay feriados cargados para {year}.</Empty> : (
          <div className="tbl-wrap"><table className="tbl stack">
            <thead><tr><th>Fecha</th><th>Día</th><th>Feriado</th><th>Alcance</th><th /></tr></thead>
            <tbody>{data.map((h) => (
              <tr key={h.id}>
                <td data-label="Fecha">{dateEs(h.holiday_date)}</td>
                <td data-label="Día">{DIAS[isoDow(h.holiday_date) - 1]}</td>
                <td data-label="Feriado"><b>{h.name}</b></td>
                <td data-label="Alcance"><span className="badge gold">{h.scope}</span></td>
                <td className="right"><button className="btn sm ghost" onClick={() => quitar(h)}>Eliminar</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        ))}
      </div>
      <div className="panel">
        <h2>Reparto de feriados {year}</h2>
        <p className="muted small" style={{ margin: '.3rem 0 .8rem' }}>Cuenta los feriados que cada empleado tiene asignados en Horarios, para repartirlos con equidad. Los feriados no se compensan.</p>
        {!cont || cont.total === 0 ? <Empty>Carga los feriados del año para ver el reparto.</Empty> : (
          <div className="tbl-wrap"><table className="tbl stack">
            <thead><tr><th>Empleado</th><th className="num">Trabajados</th><th className="num">Libres por feriado</th><th className="num">Sin asignar</th><th>Fechas trabajadas</th></tr></thead>
            <tbody>{cont.filas.map((f) => (
              <tr key={f.emp.id}>
                <td data-label="Empleado"><b>{f.emp.full_name}</b><div className="small muted">{CARGOS[f.emp.cargo]}</div></td>
                <td data-label="Trabajados" className="num"><b>{f.trab.length}</b></td>
                <td data-label="Libres por feriado" className="num">{f.libres}</td>
                <td data-label="Sin asignar" className="num">{f.sin > 0 ? <span className="badge warn">! {f.sin}</span> : 0}</td>
                <td data-label="Fechas trabajadas">{f.trab.length === 0 ? '—' : f.trab.map((d) => dateEs(d)).join(', ')}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  )
}
