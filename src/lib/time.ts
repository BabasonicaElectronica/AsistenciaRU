export const TZ = 'America/La_Paz'
const OFFSET = '-04:00' // Bolivia: UTC-4 todo el año

const fmtT = new Intl.DateTimeFormat('es-BO', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
const fmtD = new Intl.DateTimeFormat('es-BO', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' })
const fmtYMD = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const fmtHMS = new Intl.DateTimeFormat('es-BO', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
const fmtLong = new Intl.DateTimeFormat('es-BO', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
export const DIAS_CORTO = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export const timeLP = (iso?: string | null) => (iso ? fmtT.format(new Date(iso)) : '—')
export const clockLP = (d: Date) => fmtHMS.format(d)
export const longDateLP = (d: Date) => {
  const s = fmtLong.format(d)
  return s.charAt(0).toUpperCase() + s.slice(1)
}
export const dateTimeLP = (iso?: string | null) => (iso ? `${fmtD.format(new Date(iso))} ${fmtT.format(new Date(iso))}` : '—')

/** 'YYYY-MM-DD' de hoy en La Paz */
export const todayLP = () => fmtYMD.format(new Date())
export const ymdLP = (iso: string) => fmtYMD.format(new Date(iso))

const utc = (ymd: string) => new Date(ymd + 'T00:00:00Z')
const toYMD = (d: Date) => d.toISOString().slice(0, 10)
export const addDays = (ymd: string, n: number) => {
  const d = utc(ymd)
  d.setUTCDate(d.getUTCDate() + n)
  return toYMD(d)
}
/** 1 = lunes ... 7 = domingo */
export const isoDow = (ymd: string) => {
  const d = utc(ymd).getUTCDay()
  return d === 0 ? 7 : d
}
export const weekStart = (ymd: string) => addDays(ymd, 1 - isoDow(ymd))
export const monthStart = (ymd: string) => ymd.slice(0, 8) + '01'
export const monthEnd = (ymd: string) => {
  const d = utc(monthStart(ymd))
  d.setUTCMonth(d.getUTCMonth() + 1)
  d.setUTCDate(0)
  return toYMD(d)
}
export const dateEs = (ymd?: string | null) => {
  if (!ymd) return '—'
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${y}`
}
export const dayLabel = (ymd: string) => `${DIAS_CORTO[isoDow(ymd) - 1]} ${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`
export const monthLabel = (ymd: string) => `${MESES[Number(ymd.slice(5, 7)) - 1]} ${ymd.slice(0, 4)}`

/** Fecha + hora de La Paz -> instante ISO. plusDays permite cruzar la medianoche. */
export const toISO = (ymd: string, hhmm: string, plusDays = 0) => `${addDays(ymd, plusDays)}T${hhmm.slice(0, 5)}:00${OFFSET}`

/** Instante ISO -> valor para <input type="datetime-local"> en hora de La Paz */
export const isoToInput = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${fmtYMD.format(d)}T${fmtT.format(d)}`
}
export const inputToISO = (v: string) => (v ? `${v}:00${OFFSET}` : null)
export const hhmmOf = (iso?: string | null) => (iso ? fmtT.format(new Date(iso)) : '')

/** 135 -> "2 h 15 min" */
export const hm = (min?: number | null) => {
  if (min === null || min === undefined) return '—'
  if (min === 0) return '0 min'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')} min`
}
export const hoursFmt = (h?: number | null) => (h === null || h === undefined ? '—' : `${Number(h).toFixed(2)} h`)
