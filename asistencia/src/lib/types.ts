export type Cargo = 'recepcion_dia' | 'camarero' | 'recepcion_noche'
export const CARGOS: Record<Cargo, string> = {
  recepcion_dia: 'Recepcionista diurno',
  camarero: 'Camarero cama adentro',
  recepcion_noche: 'Recepcionista nocturno',
}
export const COMIDAS: Record<string, string> = {
  desayuno: 'Desayuno', almuerzo: 'Almuerzo', te: 'Té o merienda', cena: 'Cena', descanso: 'Descanso', jornada: 'Jornada',
}

export interface Employee {
  id: string
  full_name: string
  cargo: Cargo
  weekly_day_off: number
  active: boolean
  hired_on: string | null
  pin_set_at: string | null
  pin_failed_attempts: number
  pin_locked_until: string | null
}
export interface Shift {
  id: string
  employee_id: string
  work_date: string
  kind: 'trabajo' | 'libre'
  scheduled_start: string | null
  scheduled_end: string | null
  rest_start: string | null
  rest_end: string | null
  off_reason: 'semanal' | 'feriado' | 'cambio' | null
  change_note: string | null
  turno_num: number
}
export interface TimeRecord {
  id: string
  shift_id: string
  employee_id: string
  kind: string
  started_at: string
  ended_at: string | null
  original_started_at: string
  original_ended_at: string | null
  origin: 'empleado' | 'admin'
  device_id: string | null
  note: string | null
  corrected_at: string | null
}
export interface Holiday { id: string; holiday_date: string; name: string; scope: 'nacional' | 'local'; note: string | null }
export interface Incident {
  id: string; employee_id: string; shift_id: string | null; kind: string; note: string
  es_excepcion: boolean; created_at: string
}
export interface Settings {
  late_tolerance_minutes: number; rest_minutes: number
  missing_clockin_alert_minutes: number; missing_clockout_alert_minutes: number
  early_clockin_minutes: number; correction_window_days: number
  pin_max_attempts: number; pin_lock_minutes: number; timezone: string
}
export interface MealRule {
  kind: string; label: string; window_start: string; window_end: string; planned_minutes: number; cargos: string[]
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>

export const ESTADOS: Record<string, { label: string; tone: 'ok' | 'warn' | 'err' | 'info' | 'mute' }> = {
  programado: { label: 'Programado', tone: 'mute' },
  sin_entrada: { label: 'Sin entrada', tone: 'err' },
  en_curso: { label: 'En curso', tone: 'info' },
  salida_faltante: { label: 'Salida faltante', tone: 'err' },
  incompleta: { label: 'Incompleta', tone: 'warn' },
  completa: { label: 'Completa', tone: 'ok' },
  falta: { label: 'Falta', tone: 'err' },
  falta_justificada: { label: 'Falta justificada', tone: 'info' },
}
