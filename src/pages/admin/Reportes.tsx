import { useState } from 'react'
import { supabase, EMP_COLS } from '../../lib/supabase'
import { useLoad } from '../../lib/hooks'
import { CARGOS, ESTADOS, type Employee, type Row } from '../../lib/types'
import { addDays, dateEs, hhmmOf, hm, monthEnd, monthLabel, monthStart, todayLP, weekStart, ymdLP } from '../../lib/time'
import { downloadXlsx } from '../../lib/export'
import { Empty, ErrorBox, Field, PageHead, PrintHeader, Spinner } from '../../components/ui'

export default function Reportes() {
  const [modo, setModo] = useState<'semana' | 'mes'>('semana')
  const [ref, setRef] = useState(todayLP())
  const [emp, setEmp] = useState('')
  const [exporting, setExporting] = useState(false)

  const ini = modo === 'semana' ? weekStart(ref) : monthStart(ref)
  const fin = modo === 'semana' ? addDays(ini, 6) : monthEnd(ref)
  const periodo = modo === 'semana' ? `Semana del ${dateEs(ini)} al ${dateEs(fin)}` : `Mes de ${monthLabel(ini)}`

  const { data, loading, error, reload } = useLoad(async () => {
    const vista = modo === 'semana' ? 'v_resumen_semanal' : 'v_resumen_mensual'
    const col = modo === 'semana' ? 'semana_inicio' : 'mes_inicio'
    let q = supabase.from(vista).select('*').eq(col, ini).order('full_name')
    if (emp) q = q.eq('employee_id', emp)
    const [r, e] = await Promise.all([q, supabase.from('employees').select(EMP_COLS).order('full_name')])
    if (r.error) throw r.error
    if (e.error) throw e.error
    return { rows: (r.data ?? []) as Row[], emps: (e.data ?? []) as Employee[] }
  }, [modo, ini, emp])

  const tot = (k: string) => (data?.rows ?? []).reduce((a, r) => a + Number(r[k] ?? 0), 0)

  const exportar = async () => {
    if (!data) return
    setExporting(true)
    try {
      let qj = supabase.from('v_jornadas').select('*').gte('work_date', ini).lte('work_date', fin).order('work_date').order('full_name')
      let qf = supabase.from('v_faltas_y_salidas').select('*').gte('work_date', ini).lte('work_date', fin).order('work_date')
      if (emp) { qj = qj.eq('employee_id', emp); qf = qf.eq('employee_id', emp) }
      const [j, f] = await Promise.all([qj, qf])
      if (j.error) throw j.error
      if (f.error) throw f.error
      await downloadXlsx(`asistencia_${modo === 'semana' ? 'semana' : 'mes'}_${ini}`, [
        {
          name: 'Resumen',
          headers: ['Empleado', 'Jornadas', 'Retraso (min)', 'Exceso comida (min)', 'Retraso total (min)', 'Retraso justificado (min)', 'Salidas anticipadas', 'Min. salida anticipada', 'Faltas sin justificar', 'Faltas justificadas', 'Horas programadas', 'Horas efectivas'],
          rows: data.rows.map((r) => [r.full_name, r.jornadas_programadas, r.minutos_retraso, r.minutos_exceso_comida, r.minutos_retraso_total, r.minutos_retraso_justificado, r.salidas_anticipadas, r.minutos_salida_anticipada, r.faltas_injustificadas, r.faltas_justificadas, Number(r.horas_programadas), Number(r.horas_efectivas)]),
          widths: [26, 10, 14, 18, 18, 22, 18, 20, 20, 18, 18, 16],
        },
        {
          name: 'Jornadas',
          headers: ['Fecha', 'Empleado', 'Cargo', 'Turno desde', 'Turno hasta', 'Entrada', 'Salida', 'Retraso (min)', 'Exceso comida (min)', 'Retraso total (min)', 'Retraso justificado (min)', 'Salida anticipada (min)', 'Horas programadas', 'Horas efectivas', 'Estado'],
          rows: ((j.data ?? []) as Row[]).map((r) => [
            r.work_date, r.full_name, CARGOS[r.cargo as keyof typeof CARGOS], hhmmOf(r.scheduled_start), hhmmOf(r.scheduled_end), hhmmOf(r.entrada_real) || null, hhmmOf(r.salida_real) || null,
            r.retraso_min, r.exceso_comida_min, r.retraso_total_min, r.retraso_justificado_min, r.salida_anticipada_min,
            Number((r.programadas_min / 60).toFixed(2)), r.efectivas_min === null ? null : Number((r.efectivas_min / 60).toFixed(2)), ESTADOS[r.estado]?.label ?? r.estado,
          ]),
          widths: [12, 26, 24, 12, 12, 10, 10, 14, 18, 18, 22, 20, 18, 16, 18],
        },
        {
          name: 'Faltas y salidas',
          headers: ['Fecha', 'Empleado', 'Tipo', 'Minutos', 'Justificada', 'Justificación', 'Justificada como excepción'],
          rows: ((f.data ?? []) as Row[]).map((r) => [r.work_date, r.full_name, r.tipo === 'falta' ? 'Falta' : 'Salida anticipada', r.minutos, r.justificada ? 'Sí' : 'No', r.justificacion, r.justificada_como_excepcion ? 'Sí' : 'No']),
          widths: [12, 26, 18, 10, 12, 40, 24],
        },
      ])
    } catch (e) {
      alert('No se pudo generar el archivo: ' + ((e as Error).message ?? e))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="stack-v">
      <PageHead title="Reportes" sub="Minutos de retraso y asistencia por empleado.">
        <button className="btn ghost" onClick={() => window.print()}>Imprimir</button>
        <button className="btn" disabled={exporting || !data} onClick={exportar}>{exporting ? 'Generando…' : 'Exportar a Excel'}</button>
      </PageHead>

      <div className="panel no-print">
        <div className="form-grid">
          <Field label="Período">
            <select value={modo} onChange={(e) => setModo(e.target.value as 'semana' | 'mes')}>
              <option value="semana">Semanal (lunes a domingo)</option>
              <option value="mes">Mensual</option>
            </select>
          </Field>
          {modo === 'semana'
            ? <Field label="Semana que contiene el día" hint={periodo}><input type="date" value={ref} onChange={(e) => e.target.value && setRef(e.target.value)} /></Field>
            : <Field label="Mes" hint={periodo}><input type="month" value={ref.slice(0, 7)} onChange={(e) => e.target.value && setRef(e.target.value + '-01')} /></Field>}
          <Field label="Empleado">
            <select value={emp} onChange={(e) => setEmp(e.target.value)}>
              <option value="">Todos</option>
              {data?.emps.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </Field>
        </div>
      </div>

      <div className="panel">
        <PrintHeader title={`Reporte de asistencia · ${periodo}`} sub={emp ? data?.emps.find((e) => e.id === emp)?.full_name : 'Todos los empleados'} />
        <h2 className="no-print" style={{ marginBottom: '.8rem' }}>{periodo}</h2>
        {loading && !data && <Spinner />}
        {error && <ErrorBox message={error} onRetry={() => reload()} />}
        {data && (data.rows.length === 0 ? <Empty>No hay turnos programados en este período.</Empty> : (
          <div className="tbl-wrap">
            <table className="tbl stack">
              <thead>
                <tr><th>Empleado</th><th className="num">Jornadas</th><th className="num">Retraso</th><th className="num">Exceso comida</th><th className="num">Retraso total</th><th className="num">Justificado</th><th className="num">Salidas anticipadas</th><th className="num">Faltas (sin just. / just.)</th><th className="num">Horas prog.</th><th className="num">Horas efect.</th></tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.employee_id}>
                    <td data-label="Empleado"><b>{r.full_name}</b></td>
                    <td data-label="Jornadas" className="num">{r.jornadas_programadas}</td>
                    <td data-label="Retraso" className="num">{hm(r.minutos_retraso)}</td>
                    <td data-label="Exceso comida" className="num">{hm(r.minutos_exceso_comida)}</td>
                    <td data-label="Retraso total" className="num"><b>{hm(r.minutos_retraso_total)}</b></td>
                    <td data-label="Justificado" className="num">{hm(r.minutos_retraso_justificado)}</td>
                    <td data-label="Salidas anticipadas" className="num">{r.salidas_anticipadas} ({hm(r.minutos_salida_anticipada)})</td>
                    <td data-label="Faltas" className="num">{r.faltas_injustificadas} / {r.faltas_justificadas}</td>
                    <td data-label="Horas prog." className="num">{Number(r.horas_programadas).toFixed(1)}</td>
                    <td data-label="Horas efect." className="num">{Number(r.horas_efectivas).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td><td className="num">{tot('jornadas_programadas')}</td><td className="num">{hm(tot('minutos_retraso'))}</td><td className="num">{hm(tot('minutos_exceso_comida'))}</td>
                  <td className="num">{hm(tot('minutos_retraso_total'))}</td><td className="num">{hm(tot('minutos_retraso_justificado'))}</td><td className="num">{tot('salidas_anticipadas')} ({hm(tot('minutos_salida_anticipada'))})</td>
                  <td className="num">{tot('faltas_injustificadas')} / {tot('faltas_justificadas')}</td><td className="num">{tot('horas_programadas').toFixed(1)}</td><td className="num">{tot('horas_efectivas').toFixed(1)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ))}
        <p className="small muted" style={{ marginTop: '.8rem' }}>
          Retraso: se cuenta completo desde el minuto 0 cuando supera la tolerancia de llegada. El retraso total suma además el exceso sobre los 30 minutos de cada comida. Los retrasos justificados no se suman.
        </p>
      </div>
    </div>
  )
}
