import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { EMP_COLS } from '../../lib/supabase'
import { useLoad } from '../../lib/hooks'
import { type Row } from '../../lib/types'
import { addDays, dateEs, dayLabel, hm, longDateLP, monthStart, timeLP, todayLP, weekStart, monthLabel } from '../../lib/time'
import { EstadoBadge, ErrorBox, PageHead, Spinner, Empty } from '../../components/ui'

export default function Dashboard() {
  const nav = useNavigate()
  const hoy = todayLP()
  const ws = weekStart(hoy)
  const ms = monthStart(hoy)

  const { data, loading, error, reload } = useLoad(async () => {
    const [jor, sem, mes, libres, hol, emps, disp] = await Promise.all([
      supabase.from('v_jornadas').select('*').gte('work_date', addDays(hoy, -3)).lte('work_date', hoy).order('scheduled_start'),
      supabase.from('v_resumen_semanal').select('*').eq('semana_inicio', ws),
      supabase.from('v_resumen_mensual').select('*').eq('mes_inicio', ms),
      supabase.from('shifts').select('work_date, off_reason, employees(full_name)').eq('kind', 'libre').gte('work_date', hoy).lte('work_date', addDays(hoy, 7)).order('work_date'),
      supabase.from('holidays').select('*').gte('holiday_date', hoy).lte('holiday_date', addDays(hoy, 30)).order('holiday_date'),
      supabase.from('employees').select(EMP_COLS).eq('active', true),
      supabase.from('v_jornadas').select('shift_id, full_name, work_date, entrada_real').eq('entrada_en_dispositivo_autorizado', false).gte('work_date', addDays(hoy, -7)),
    ])
    for (const r of [jor, sem, mes, libres, hol, emps, disp]) if (r.error) throw r.error
    return {
      jor: (jor.data ?? []) as Row[], sem: (sem.data ?? []) as Row[], mes: (mes.data ?? []) as Row[],
      libres: (libres.data ?? []) as Row[], hol: (hol.data ?? []) as Row[], emps: (emps.data ?? []) as Row[], disp: (disp.data ?? []) as Row[],
    }
  }, [], { every: 60000 })

  if (loading && !data) return <Spinner />
  if (error && !data) return <ErrorBox message={error} onRetry={() => reload()} />
  if (!data) return null

  const hoyRows = data.jor.filter((j) => j.work_date === hoy)
  const cnt = (e: string) => data.jor.filter((j) => j.estado === e).length
  const tardeHoy = hoyRows.filter((j) => j.retraso_min > 0).length
  const alertas = data.jor.filter((j) => ['sin_entrada', 'salida_faltante', 'incompleta'].includes(j.estado))
  const bloqueados = data.emps.filter((e) => e.pin_locked_until && new Date(e.pin_locked_until) > new Date())
  const maxMes = Math.max(1, ...data.mes.map((r) => r.minutos_retraso_total))
  const maxSem = Math.max(1, ...data.sem.map((r) => r.minutos_retraso_total))
  const ordenar = (a: Row[]) => [...a].sort((x, y) => y.minutos_retraso_total - x.minutos_retraso_total)

  return (
    <div className="stack-v">
      <PageHead title="Panel del día" sub={longDateLP(new Date())}>
        <button className="btn ghost sm" onClick={() => reload()}>Actualizar</button>
      </PageHead>

      <div className="kpis">
        <div className="kpi"><div className="n">{hoyRows.length}</div><div className="l">Turnos programados hoy</div></div>
        <div className="kpi"><div className="n">{hoyRows.filter((j) => j.entrada_real).length}</div><div className="l">Entradas registradas</div></div>
        <div className={`kpi ${cnt('sin_entrada') ? 'err' : ''}`}><div className="n">{cnt('sin_entrada')}</div><div className="l">Sin entrada</div></div>
        <div className={`kpi ${tardeHoy ? 'warn' : ''}`}><div className="n">{tardeHoy}</div><div className="l">Llegaron tarde hoy</div></div>
        <div className={`kpi ${cnt('salida_faltante') ? 'err' : ''}`}><div className="n">{cnt('salida_faltante')}</div><div className="l">Salidas faltantes</div></div>
        <div className={`kpi ${cnt('incompleta') ? 'warn' : ''}`}><div className="n">{cnt('incompleta')}</div><div className="l">Jornadas incompletas</div></div>
      </div>

      <div className="panel">
        <h2>Alertas para revisar</h2>
        {alertas.length === 0 && bloqueados.length === 0 && data.disp.length === 0 && <Empty>Todo en orden. No hay alertas pendientes.</Empty>}
        <div className="tbl-wrap">
          <table className="tbl stack">
            <tbody>
              {alertas.map((j) => (
                <tr key={j.shift_id} className="click" onClick={() => nav('/admin/asistencia?turno=' + j.shift_id)}>
                  <td data-label="Empleado"><b>{j.full_name}</b></td>
                  <td data-label="Fecha">{dayLabel(j.work_date)}</td>
                  <td data-label="Turno">{timeLP(j.scheduled_start)}–{timeLP(j.scheduled_end)}</td>
                  <td data-label="Estado"><EstadoBadge estado={j.estado} /></td>
                </tr>
              ))}
              {bloqueados.map((e) => (
                <tr key={e.id}>
                  <td data-label="Empleado"><b>{e.full_name}</b></td>
                  <td data-label="Aviso" colSpan={2}>PIN bloqueado por intentos fallidos hasta las {timeLP(e.pin_locked_until)}</td>
                  <td data-label="Acción"><Link to="/admin/empleados">Ir a Empleados</Link></td>
                </tr>
              ))}
              {data.disp.map((d) => (
                <tr key={'d' + d.shift_id}>
                  <td data-label="Empleado"><b>{d.full_name}</b></td>
                  <td data-label="Fecha">{dayLabel(d.work_date)}</td>
                  <td data-label="Aviso" colSpan={2}><span className="badge warn">! Entrada desde un equipo no autorizado</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="two-col">
        <div className="panel">
          <h2>Retraso de la semana</h2>
          <p className="muted small" style={{ marginBottom: '.6rem' }}>{dateEs(ws)} al {dateEs(addDays(ws, 6))} · incluye exceso de comida</p>
          {data.sem.length === 0 && <Empty>Sin datos todavía esta semana.</Empty>}
          {ordenar(data.sem).map((r) => (
            <div className="bar-row" key={r.employee_id}>
              <span>{r.full_name}</span>
              <div className="bar"><i style={{ width: `${(r.minutos_retraso_total / maxSem) * 100}%` }} /></div>
              <b className="right">{hm(r.minutos_retraso_total)}</b>
            </div>
          ))}
        </div>
        <div className="panel">
          <h2>Retraso del mes</h2>
          <p className="muted small" style={{ marginBottom: '.6rem' }}>{monthLabel(ms)}</p>
          {data.mes.length === 0 && <Empty>Sin datos todavía este mes.</Empty>}
          {ordenar(data.mes).map((r) => (
            <div className="bar-row" key={r.employee_id}>
              <span>{r.full_name}</span>
              <div className="bar"><i style={{ width: `${(r.minutos_retraso_total / maxMes) * 100}%` }} /></div>
              <b className="right">{hm(r.minutos_retraso_total)}</b>
            </div>
          ))}
        </div>
      </div>

      <div className="two-col">
        <div className="panel">
          <h2>Días libres de los próximos 7 días</h2>
          {data.libres.length === 0 && <Empty>No hay días libres programados.</Empty>}
          {data.libres.map((l, i) => (
            <div key={i} className="row between" style={{ padding: '.25rem 0' }}>
              <span>{(l.employees as Row)?.full_name}</span>
              <span className="muted">{dayLabel(l.work_date)} <span className="badge mute">{l.off_reason}</span></span>
            </div>
          ))}
        </div>
        <div className="panel">
          <h2>Feriados próximos</h2>
          {data.hol.length === 0 && <Empty>No hay feriados en los próximos 30 días.</Empty>}
          {data.hol.map((h) => (
            <div key={h.id} className="row between" style={{ padding: '.25rem 0' }}>
              <span>{h.name}</span><span className="muted">{dateEs(h.holiday_date)} <span className="badge gold">{h.scope}</span></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
