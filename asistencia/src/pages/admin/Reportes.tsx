import { useMemo, useState } from 'react'
import { supabase, EMP_COLS } from '../../lib/supabase'
import { useLoad } from '../../lib/hooks'
import { CARGOS, ESTADOS, type Employee, type Row } from '../../lib/types'
import { addDays, dateEs, DIAS, hhmmOf, hm, isoDow, monthEnd, monthLabel, monthStart, timeLP, todayLP, weekStart } from '../../lib/time'
import { downloadXlsx } from '../../lib/export'
import { Empty, ErrorBox, Field, Notice, PageHead, PrintHeader, Spinner } from '../../components/ui'

type Modo = 'semana' | 'mes' | 'rango'

interface Resumen {
  emp: Employee
  programados: number; asistidos: number
  faltasInj: number; faltasJust: number
  libres: number; libresSem: number; libresFer: number; libresCambio: number
  feriadosTrab: number
  retraso: number; exceso: number; salAnt: number; justificado: number
  noCumplido: number          // retraso total + salida anticipada
  hProg: number; hEfec: number
}
interface Dia {
  fecha: string; tipo: string; turno: string; entrada: string; salida: string
  retraso: number; exceso: number; salAnt: number; efectivas: number | null; obs: string
}

const horas = (min: number) => min / 60
const hFmt = (min: number) => `${horas(min).toFixed(1)} h`
const signo = (min: number) => `${min > 0 ? '+' : min < 0 ? '−' : ''}${Math.abs(horas(min)).toFixed(1)} h`

function resumir(emp: Employee, jor: Row[], libres: Row[], ahora: number): Resumen {
  const mios = jor.filter((j) => j.employee_id === emp.id)
  const lib = libres.filter((l) => l.employee_id === emp.id)
  const r: Resumen = {
    emp, programados: 0, asistidos: 0, faltasInj: 0, faltasJust: 0,
    libres: lib.length, libresSem: lib.filter((l) => l.off_reason === 'semanal').length,
    libresFer: lib.filter((l) => l.off_reason === 'feriado').length, libresCambio: lib.filter((l) => l.off_reason === 'cambio').length,
    feriadosTrab: 0, retraso: 0, exceso: 0, salAnt: 0, justificado: 0, noCumplido: 0, hProg: 0, hEfec: 0,
  }
  for (const j of mios) {
    const terminado = Date.parse(j.scheduled_end) <= ahora
    if (terminado || j.entrada_real) r.programados++
    if (j.entrada_real) r.asistidos++
    if (j.es_falta) { if (j.falta_justificada) r.faltasJust++; else r.faltasInj++ }
    if (j.es_feriado && j.entrada_real) r.feriadosTrab++
    r.retraso += j.retraso_min ?? 0
    r.exceso += j.exceso_comida_min ?? 0
    r.salAnt += j.salida_anticipada_min ?? 0
    r.justificado += j.retraso_justificado_min ?? 0
    if (terminado) r.hProg += j.programadas_min ?? 0
    r.hEfec += j.efectivas_min ?? 0
  }
  r.noCumplido = r.retraso + r.exceso + r.salAnt
  return r
}

const TIPO_LIBRE: Record<string, string> = { semanal: 'Libre semanal', feriado: 'Libre por feriado', cambio: 'Libre (cambio autorizado)' }

function detalle(empId: string, ini: string, fin: string, jor: Row[], libres: Row[], hol: Row[]): Dia[] {
  const out: Dia[] = []
  for (let d = ini; d <= fin; d = addDays(d, 1)) {
    const h = hol.find((x) => x.holiday_date === d)
    const js = jor.filter((j) => j.employee_id === empId && j.work_date === d).sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start))
    const ls = libres.filter((l) => l.employee_id === empId && l.work_date === d)
    js.forEach((j, i) => {
      const obs: string[] = []
      obs.push(ESTADOS[j.estado]?.label ?? j.estado)
      if (h) obs.push(`Feriado: ${h.name}`)
      if (j.retraso_justificado) obs.push('Retraso justificado')
      if (j.salida_justificada) obs.push('Salida anticipada justificada')
      if (j.falta_justificada && j.es_falta) obs.push('Falta justificada')
      out.push({
        fecha: d, tipo: js.length > 1 ? `Turno ${i + 1}` : 'Turno', turno: `${timeLP(j.scheduled_start)}–${timeLP(j.scheduled_end)}`,
        entrada: timeLP(j.entrada_real), salida: timeLP(j.salida_real),
        retraso: j.retraso_min ?? 0, exceso: j.exceso_comida_min ?? 0, salAnt: j.salida_anticipada_min ?? 0,
        efectivas: j.efectivas_min, obs: obs.join(' · '),
      })
    })
    for (const l of ls) {
      out.push({ fecha: d, tipo: TIPO_LIBRE[l.off_reason] ?? 'Libre', turno: '—', entrada: '—', salida: '—', retraso: 0, exceso: 0, salAnt: 0, efectivas: null, obs: h ? `Feriado: ${h.name}` : '' })
    }
    if (js.length === 0 && ls.length === 0) {
      out.push({ fecha: d, tipo: 'Sin asignar', turno: '—', entrada: '—', salida: '—', retraso: 0, exceso: 0, salAnt: 0, efectivas: null, obs: h ? `Feriado: ${h.name}` : '' })
    }
  }
  return out
}

export default function Reportes() {
  const hoy = todayLP()
  const [modo, setModo] = useState<Modo>('mes')
  const [ref, setRef] = useState(hoy)
  const [desde, setDesde] = useState(monthStart(hoy))
  const [hasta, setHasta] = useState(hoy)
  const [emp, setEmp] = useState('')
  const [exporting, setExporting] = useState(false)

  const ini = modo === 'semana' ? weekStart(ref) : modo === 'mes' ? monthStart(ref) : desde
  const fin = modo === 'semana' ? addDays(ini, 6) : modo === 'mes' ? monthEnd(ref) : hasta
  const rangoMalo = modo === 'rango' && (!desde || !hasta || hasta < desde || (Date.parse(hasta) - Date.parse(desde)) / 86400000 > 92)
  const periodo = modo === 'mes' ? `Mes de ${monthLabel(ini)}` : `Del ${dateEs(ini)} al ${dateEs(fin)}`

  const { data, loading, error, reload } = useLoad(async () => {
    if (rangoMalo) return null
    let qj = supabase.from('v_jornadas').select('*').gte('work_date', ini).lte('work_date', fin).order('work_date').order('scheduled_start')
    let ql = supabase.from('shifts').select('employee_id, work_date, off_reason').eq('kind', 'libre').gte('work_date', ini).lte('work_date', fin)
    if (emp) { qj = qj.eq('employee_id', emp); ql = ql.eq('employee_id', emp) }
    const [j, l, h, e] = await Promise.all([
      qj, ql,
      supabase.from('holidays').select('holiday_date, name').gte('holiday_date', ini).lte('holiday_date', fin),
      supabase.from('employees').select(EMP_COLS).order('full_name'),
    ])
    for (const r of [j, l, h, e]) if (r.error) throw r.error
    return { jor: (j.data ?? []) as Row[], libres: (l.data ?? []) as Row[], hol: (h.data ?? []) as Row[], emps: (e.data ?? []) as Employee[] }
  }, [ini, fin, emp, rangoMalo])

  const filas = useMemo(() => {
    if (!data) return []
    const ahora = Date.now()
    return data.emps
      .filter((e) => (emp ? e.id === emp : true))
      .map((e) => resumir(e, data.jor, data.libres, ahora))
      .filter((r) => r.emp.active || r.programados > 0 || r.libres > 0)
  }, [data, emp])

  const pendientes = useMemo(() => (data?.jor ?? []).filter((j) => ['sin_entrada', 'salida_faltante', 'incompleta', 'en_curso'].includes(j.estado)).length, [data])
  const sel = emp ? data?.emps.find((e) => e.id === emp) : undefined
  const dias = useMemo(() => (data && emp ? detalle(emp, ini, fin, data.jor, data.libres, data.hol) : []), [data, emp, ini, fin])
  const tot = (k: keyof Resumen) => filas.reduce((a, r) => a + Number(r[k] ?? 0), 0)
  const pct = (r: { hProg: number; hEfec: number }) => (r.hProg > 0 ? `${Math.round((r.hEfec / r.hProg) * 100)} %` : '—')

  const exportar = async () => {
    if (!data) return
    setExporting(true)
    try {
      const [f, c] = await Promise.all([
        supabase.from('v_faltas_y_salidas').select('*').gte('work_date', ini).lte('work_date', fin).order('work_date'),
        supabase.from('day_off_changes').select('*, employees(full_name)').or(`and(fecha_original.gte.${ini},fecha_original.lte.${fin}),and(fecha_nueva.gte.${ini},fecha_nueva.lte.${fin})`),
      ])
      if (f.error) throw f.error
      const faltas = ((f.data ?? []) as Row[]).filter((x) => !emp || x.employee_id === emp)
      const cambios = c.error ? [] : ((c.data ?? []) as Row[]).filter((x) => !emp || x.employee_id === emp)

      const detalleRows: (string | number | null)[][] = []
      for (const r of filas) {
        const ds = detalle(r.emp.id, ini, fin, data.jor, data.libres, data.hol)
        for (const d of ds) detalleRows.push([r.emp.full_name, d.fecha, DIAS[isoDow(d.fecha) - 1], d.tipo, d.turno, d.entrada, d.salida, d.retraso, d.exceso, d.salAnt, d.efectivas === null ? null : Number(horas(d.efectivas).toFixed(2)), d.obs])
        detalleRows.push([`TOTAL ${r.emp.full_name}`, null, null, null, null, null, null, r.retraso, r.exceso, r.salAnt, Number(horas(r.hEfec).toFixed(2)), `No cumplido: ${r.noCumplido} min`])
      }

      await downloadXlsx(`asistencia_${ini}_a_${fin}`, [
        {
          name: 'Resumen por empleado',
          headers: ['Empleado', 'Cargo', 'Turnos programados', 'Turnos con asistencia', 'Faltas sin justificar', 'Faltas justificadas', 'Días libres', 'Libres semanales', 'Libres por feriado', 'Libres por cambio', 'Feriados trabajados', 'Retraso (min)', 'Exceso comida (min)', 'Salida anticipada (min)', 'Retraso justificado (min)', 'TOTAL no cumplido (min)', 'Horas programadas', 'Horas efectivas', 'Diferencia (h)', 'Cumplimiento (%)'],
          rows: [
            ...filas.map((r) => [r.emp.full_name, CARGOS[r.emp.cargo], r.programados, r.asistidos, r.faltasInj, r.faltasJust, r.libres, r.libresSem, r.libresFer, r.libresCambio, r.feriadosTrab, r.retraso, r.exceso, r.salAnt, r.justificado, r.noCumplido, Number(horas(r.hProg).toFixed(2)), Number(horas(r.hEfec).toFixed(2)), Number(horas(r.hEfec - r.hProg).toFixed(2)), r.hProg > 0 ? Math.round((r.hEfec / r.hProg) * 100) : null]),
            ...(emp ? [] : [['TOTAL DEL EQUIPO', null, null, null, tot('faltasInj'), tot('faltasJust'), tot('libres'), tot('libresSem'), tot('libresFer'), tot('libresCambio'), tot('feriadosTrab'), tot('retraso'), tot('exceso'), tot('salAnt'), tot('justificado'), tot('noCumplido'), Number(horas(tot('hProg')).toFixed(2)), Number(horas(tot('hEfec')).toFixed(2)), Number(horas(tot('hEfec') - tot('hProg')).toFixed(2)), null]]),
          ],
          widths: [26, 24, 12, 12, 12, 12, 10, 10, 10, 10, 12, 12, 14, 16, 16, 18, 14, 14, 12, 14],
        },
        {
          name: 'Detalle diario',
          headers: ['Empleado', 'Fecha', 'Día', 'Tipo de día', 'Turno', 'Entrada', 'Salida', 'Retraso (min)', 'Exceso comida (min)', 'Salida anticipada (min)', 'Horas efectivas', 'Observación'],
          rows: detalleRows, widths: [26, 12, 12, 24, 14, 10, 10, 12, 16, 18, 14, 50],
        },
        {
          name: 'Faltas y salidas',
          headers: ['Fecha', 'Empleado', 'Tipo', 'Minutos', 'Justificada', 'Justificación', 'Justificada como excepción'],
          rows: faltas.map((r) => [r.work_date, r.full_name, r.tipo === 'falta' ? 'Falta' : 'Salida anticipada', r.minutos, r.justificada ? 'Sí' : 'No', r.justificacion, r.justificada_como_excepcion ? 'Sí' : 'No']),
          widths: [12, 26, 18, 10, 12, 40, 24],
        },
        {
          name: 'Cambios de día libre',
          headers: ['Empleado', 'Tipo de cambio', 'Día libre original', 'Día libre nuevo', 'Motivo', 'Aprobado por', 'Registrado'],
          rows: cambios.map((r) => [(r.employees as Row)?.full_name, r.tipo === 'intercambio' ? 'Intercambio' : 'Movido', r.fecha_original, r.fecha_nueva, r.motivo, r.aprobado_por, hhmmOf(r.created_at) ? String(r.created_at).slice(0, 10) : '']),
          widths: [26, 16, 18, 16, 44, 18, 14],
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
      <PageHead title="Reportes" sub="Informe de asistencia por empleado.">
        <button className="btn ghost" onClick={() => window.print()}>Imprimir</button>
        <button className="btn" disabled={exporting || !data} onClick={exportar}>{exporting ? 'Generando…' : 'Exportar a Excel'}</button>
      </PageHead>

      <div className="panel no-print">
        <div className="form-grid">
          <Field label="Período">
            <select value={modo} onChange={(e) => setModo(e.target.value as Modo)}>
              <option value="mes">Mensual</option>
              <option value="semana">Semanal (lunes a domingo)</option>
              <option value="rango">Rango de fechas</option>
            </select>
          </Field>
          {modo === 'semana' && <Field label="Semana que contiene el día" hint={periodo}><input type="date" value={ref} onChange={(e) => e.target.value && setRef(e.target.value)} /></Field>}
          {modo === 'mes' && <Field label="Mes" hint={periodo}><input type="month" value={ref.slice(0, 7)} onChange={(e) => e.target.value && setRef(e.target.value + '-01')} /></Field>}
          {modo === 'rango' && (
            <>
              <Field label="Desde"><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></Field>
              <Field label="Hasta" hint="Máximo 93 días"><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></Field>
            </>
          )}
          <Field label="Empleado">
            <select value={emp} onChange={(e) => setEmp(e.target.value)}>
              <option value="">Todos (resumen por empleado)</option>
              {data?.emps.filter((e) => e.active).map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </Field>
        </div>
        {rangoMalo && <div style={{ marginTop: '.8rem' }}><Notice tone="err">Revisa el rango: “Hasta” debe ser posterior a “Desde” y no superar 93 días.</Notice></div>}
      </div>

      {loading && !data && !rangoMalo && <Spinner />}
      {error && <ErrorBox message={error} onRetry={() => reload()} />}

      {data && (
        <div className="panel">
          <PrintHeader title={`Informe de asistencia · ${periodo}`} sub={sel ? `${sel.full_name} · ${CARGOS[sel.cargo]}` : 'Todos los empleados'} />
          <div className="no-print" style={{ marginBottom: '.8rem' }}>
            <h2>{sel ? sel.full_name : 'Resumen por empleado'}</h2>
            <p className="muted small">{periodo}{sel ? ` · ${CARGOS[sel.cargo]}` : ''}</p>
          </div>
          {pendientes > 0 && (
            <div style={{ marginBottom: '.8rem' }}>
              <Notice tone="warn"><b>{pendientes} jornada(s) pendientes de revisión</b> en este período (sin entrada, sin salida, incompletas o en curso). Los totales pueden cambiar cuando se corrijan; revisa Asistencia antes de cerrar el informe.</Notice>
            </div>
          )}

          {filas.length === 0 ? <Empty>No hay turnos ni días libres en este período.</Empty> : (
            <div className="tbl-wrap">
              <table className="tbl stack">
                <thead>
                  <tr>
                    <th>Empleado</th><th className="num">Turnos prog.</th><th className="num">Asistió</th><th className="num">Faltas (sin just. / just.)</th>
                    <th className="num">Días libres</th><th className="num">Feriados trab.</th>
                    <th className="num">Retraso</th><th className="num">Exceso comida</th><th className="num">Salida anticipada</th><th className="num">Retraso justificado</th>
                    <th className="num">TOTAL no cumplido</th>
                    <th className="num">Horas prog.</th><th className="num">Horas efect.</th><th className="num">Diferencia</th><th className="num">Cumpl.</th><th className="no-print" />
                  </tr>
                </thead>
                <tbody>
                  {filas.map((r) => (
                    <tr key={r.emp.id}>
                      <td data-label="Empleado"><b>{r.emp.full_name}</b><div className="small muted">{CARGOS[r.emp.cargo]}</div></td>
                      <td data-label="Turnos prog." className="num">{r.programados}</td>
                      <td data-label="Asistió" className="num">{r.asistidos}</td>
                      <td data-label="Faltas" className="num">{r.faltasInj > 0 ? <span className="badge err">{r.faltasInj}</span> : 0} / {r.faltasJust}</td>
                      <td data-label="Días libres" className="num" title={`${r.libresSem} semanales · ${r.libresFer} por feriado · ${r.libresCambio} por cambio`}>{r.libres}</td>
                      <td data-label="Feriados trab." className="num">{r.feriadosTrab}</td>
                      <td data-label="Retraso" className="num">{hm(r.retraso)}</td>
                      <td data-label="Exceso comida" className="num">{hm(r.exceso)}</td>
                      <td data-label="Salida anticipada" className="num">{hm(r.salAnt)}</td>
                      <td data-label="Retraso justificado" className="num">{hm(r.justificado)}</td>
                      <td data-label="TOTAL no cumplido" className="num"><b>{hm(r.noCumplido)}</b></td>
                      <td data-label="Horas prog." className="num">{hFmt(r.hProg)}</td>
                      <td data-label="Horas efect." className="num">{hFmt(r.hEfec)}</td>
                      <td data-label="Diferencia" className="num">{signo(r.hEfec - r.hProg)}</td>
                      <td data-label="Cumpl." className="num">{pct(r)}</td>
                      <td className="right no-print">{!emp && <button className="btn sm ghost" onClick={() => setEmp(r.emp.id)}>Ver detalle</button>}</td>
                    </tr>
                  ))}
                </tbody>
                {!emp && filas.length > 1 && (
                  <tfoot>
                    <tr>
                      <td>Total del equipo</td><td className="num">—</td><td className="num">—</td><td className="num">{tot('faltasInj')} / {tot('faltasJust')}</td>
                      <td className="num">{tot('libres')}</td><td className="num">{tot('feriadosTrab')}</td>
                      <td className="num">{hm(tot('retraso'))}</td><td className="num">{hm(tot('exceso'))}</td><td className="num">{hm(tot('salAnt'))}</td><td className="num">{hm(tot('justificado'))}</td>
                      <td className="num">{hm(tot('noCumplido'))}</td>
                      <td className="num">{hFmt(tot('hProg'))}</td><td className="num">{hFmt(tot('hEfec'))}</td><td className="num">{signo(tot('hEfec') - tot('hProg'))}</td><td className="num">—</td><td className="no-print" />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
          <p className="small muted" style={{ marginTop: '.8rem' }}>
            <b>TOTAL no cumplido</b> = retraso + exceso de comida + salida anticipada (los retrasos justificados no se suman). Las faltas se cuentan aparte, en días.
            {' '}<b>Diferencia</b> = horas efectivas − horas programadas (negativa = horas no trabajadas, incluidas las faltas). Las horas extra no se calculan. Los días libres por feriado o cambio autorizado no cuentan como falta.
          </p>

          {sel && (
            <div style={{ marginTop: '1.4rem' }}>
              <div className="row between no-print"><h2>Detalle día por día</h2><button className="btn sm ghost" onClick={() => setEmp('')}>Volver al resumen de todos</button></div>
              <h3 className="print-only" style={{ margin: '1rem 0 .4rem' }}>Detalle día por día</h3>
              <div className="tbl-wrap" style={{ marginTop: '.6rem' }}>
                <table className="tbl stack">
                  <thead><tr><th>Fecha</th><th>Tipo de día</th><th>Turno</th><th>Entrada</th><th>Salida</th><th className="num">Retraso</th><th className="num">Exceso comida</th><th className="num">Sal. anticipada</th><th className="num">Horas efect.</th><th>Observación</th></tr></thead>
                  <tbody>
                    {dias.map((d, i) => (
                      <tr key={i}>
                        <td data-label="Fecha" className="nowrap">{DIAS[isoDow(d.fecha) - 1].slice(0, 3)} {dateEs(d.fecha)}</td>
                        <td data-label="Tipo de día">{d.tipo === 'Sin asignar' ? <span className="badge warn">! Sin asignar</span> : d.tipo}</td>
                        <td data-label="Turno" className="nowrap">{d.turno}</td>
                        <td data-label="Entrada">{d.entrada}</td>
                        <td data-label="Salida">{d.salida}</td>
                        <td data-label="Retraso" className="num">{d.retraso ? hm(d.retraso) : '—'}</td>
                        <td data-label="Exceso comida" className="num">{d.exceso ? hm(d.exceso) : '—'}</td>
                        <td data-label="Sal. anticipada" className="num">{d.salAnt ? hm(d.salAnt) : '—'}</td>
                        <td data-label="Horas efect." className="num">{d.efectivas === null ? '—' : hFmt(d.efectivas)}</td>
                        <td data-label="Observación">{d.obs}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={5}>TOTAL {sel.full_name}</td>
                      <td className="num">{hm(dias.reduce((a, d) => a + d.retraso, 0))}</td>
                      <td className="num">{hm(dias.reduce((a, d) => a + d.exceso, 0))}</td>
                      <td className="num">{hm(dias.reduce((a, d) => a + d.salAnt, 0))}</td>
                      <td className="num">{hFmt(dias.reduce((a, d) => a + (d.efectivas ?? 0), 0))}</td>
                      <td>No cumplido: <b>{hm(dias.reduce((a, d) => a + d.retraso + d.exceso + d.salAnt, 0))}</b></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
