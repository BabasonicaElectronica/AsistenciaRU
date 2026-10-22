import { useState } from 'react'
import { supabase, errMsg } from '../../lib/supabase'
import { useLoad } from '../../lib/hooks'
import { type Holiday } from '../../lib/types'
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
    </div>
  )
}
