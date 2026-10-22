import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, EMP_COLS } from '../../lib/supabase'
import { useLoad } from '../../lib/hooks'
import { CARGOS, type Employee, type Row } from '../../lib/types'
import { addDays, dateEs, dayLabel, DIAS, hm, hoursFmt, monthLabel, monthStart, timeLP, todayLP, weekStart } from '../../lib/time'
import { EstadoBadge, ErrorBox, Empty, PageHead, Spinner } from '../../components/ui'

export default function EmpleadoDetalle() {
  const { id } = useParams()
  const nav = useNavigate()
  const hoy = todayLP()

  const { data, loading, error, reload } = useLoad(async () => {
    const [e, j, s, m, f] = await Promise.all([
      supabase.from('employees').select(EMP_COLS).eq('id', id!).maybeSingle(),
      supabase.from('v_jornadas').select('*').eq('employee_id', id!).gte('work_date', addDays(hoy, -60)).order('work_date', { ascending: false }),
      supabase.from('v_resumen_semanal').select('*').eq('employee_id', id!).order('semana_inicio', { ascending: false }).limit(8),
      supabase.from('v_resumen_mensual').select('*').eq('employee_id', id!).order('mes_inicio', { ascending: false }).limit(6),
      supabase.from('v_faltas_y_salidas').select('*').eq('employee_id', id!).order('work_date', { ascending: false }).limit(40),
    ])
    for (const r of [e, j, s, m, f]) if (r.error) throw r.error
    return { emp: e.data as Employee | null, jor: (j.data ?? []) as Row[], sem: (s.data ?? []) as Row[], mes: (m.data ?? []) as Row[], fal: (f.data ?? []) as Row[] }
  }, [id])

  if (loading && !data) return <Spinner />
  if (error) return <ErrorBox message={error} onRetry={() => reload()} />
  if (!data?.emp) return <Empty>No se encontró al empleado. <Link to="/admin/empleados">Volver a Empleados</Link></Empty>
  const e = data.emp
  const sem = data.sem.find((x) => x.semana_inicio === weekStart(hoy))
  const mes = data.mes.find((x) => x.mes_inicio === monthStart(hoy))

  return (
    <div className="stack-v">
      <PageHead title={e.full_name} sub={`${CARGOS[e.cargo]} · día libre fijo: ${DIAS[e.weekly_day_off - 1]}`}>
        <Link className="btn ghost" to="/admin/empleados">Volver</Link>
      </PageHead>

      <div className="two-col">
        {[{ t: 'Esta semana', r: sem }, { t: `Este mes (${monthLabel(monthStart(hoy))})`, r: mes }].map(({ t, r }) => (
          <div className="panel" key={t}>
            <h2>{t}</h2>
            <div className="kpis" style={{ marginTop: '.6rem' }}>
              <div className={`kpi ${r?.minutos_retraso_total > 0 ? 'warn' : 'ok'}`}><div className="n">{hm(r?.minutos_retraso_total ?? 0)}</div><div className="l">Retraso total</div></div>
              <div className="kpi"><div className="n">{r?.salidas_anticipadas ?? 0}</div><div className="l">Salidas anticipadas</div></div>
              <div className={`kpi ${r?.faltas_injustificadas > 0 ? 'err' : ''}`}><div className="n">{r?.faltas_injustificadas ?? 0}</div><div className="l">Faltas sin justificar</div></div>
              <div className="kpi"><div className="n">{hoursFmt(r?.horas_efectivas ?? 0)}</div><div className="l">Horas efectivas</div></div>
            </div>
          </div>
        ))}
      </div>

      <div className="panel">
        <h2>Historial semanal de retrasos</h2>
        {data.sem.length === 0 ? <Empty>Sin semanas con turnos.</Empty> : (
          <div className="tbl-wrap"><table className="tbl stack">
            <thead><tr><th>Semana</th><th className="num">Retraso</th><th className="num">Exceso comida</th><th className="num">Total</th><th className="num">Salidas anticipadas</th><th className="num">Faltas (sin just. / just.)</th></tr></thead>
            <tbody>{data.sem.map((s) => (
              <tr key={s.semana_inicio}>
                <td data-label="Semana">{dateEs(s.semana_inicio)} – {dateEs(s.semana_fin)}</td>
                <td data-label="Retraso" className="num">{hm(s.minutos_retraso)}</td>
                <td data-label="Exceso comida" className="num">{hm(s.minutos_exceso_comida)}</td>
                <td data-label="Total" className="num"><b>{hm(s.minutos_retraso_total)}</b></td>
                <td data-label="Salidas anticipadas" className="num">{s.salidas_anticipadas}</td>
                <td data-label="Faltas" className="num">{s.faltas_injustificadas} / {s.faltas_justificadas}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>

      <div className="panel">
        <h2>Jornadas de los últimos 60 días</h2>
        {data.jor.length === 0 ? <Empty>Sin jornadas en este período.</Empty> : (
          <div className="tbl-wrap"><table className="tbl stack">
            <thead><tr><th>Fecha</th><th>Turno</th><th>Entrada</th><th>Salida</th><th className="num">Retraso</th><th className="num">Sal. anticipada</th><th>Estado</th></tr></thead>
            <tbody>{data.jor.map((j) => (
              <tr key={j.shift_id} className="click" onClick={() => nav('/admin/asistencia?turno=' + j.shift_id)}>
                <td data-label="Fecha">{dayLabel(j.work_date)}</td>
                <td data-label="Turno">{timeLP(j.scheduled_start)}–{timeLP(j.scheduled_end)}</td>
                <td data-label="Entrada">{timeLP(j.entrada_real)}</td>
                <td data-label="Salida">{timeLP(j.salida_real)}</td>
                <td data-label="Retraso" className="num">{hm(j.retraso_total_min)}</td>
                <td data-label="Sal. anticipada" className="num">{hm(j.salida_anticipada_min)}</td>
                <td data-label="Estado"><EstadoBadge estado={j.estado} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>

      <div className="panel">
        <h2>Faltas y salidas anticipadas</h2>
        {data.fal.length === 0 ? <Empty>No hay faltas ni salidas anticipadas registradas.</Empty> : (
          <div className="tbl-wrap"><table className="tbl stack">
            <thead><tr><th>Fecha</th><th>Tipo</th><th className="num">Minutos</th><th>Justificación</th></tr></thead>
            <tbody>{data.fal.map((x, i) => (
              <tr key={i}>
                <td data-label="Fecha">{dayLabel(x.work_date)}</td>
                <td data-label="Tipo">{x.tipo === 'falta' ? 'Falta' : 'Salida anticipada'}</td>
                <td data-label="Minutos" className="num">{x.minutos === null ? '—' : hm(x.minutos)}</td>
                <td data-label="Justificación">{x.justificada ? <><span className="badge info">Justificada</span>{x.justificada_como_excepcion && <span className="badge gold" style={{ marginLeft: 4 }}>Excepción</span>} {x.justificacion}</> : <span className="badge err">Sin justificar</span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  )
}
