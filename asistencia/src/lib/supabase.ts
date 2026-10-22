import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

if (!url || !key) {
  // eslint-disable-next-line no-console
  console.error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY')
}

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})

export const DEVICE_KEY = 'ru_device_token'
export const getDeviceToken = (): string | null => {
  try { return localStorage.getItem(DEVICE_KEY) } catch { return null }
}
export const setDeviceToken = (t: string) => {
  try { localStorage.setItem(DEVICE_KEY, t) } catch { /* sin almacenamiento */ }
}

/** Columnas de empleados que se leen (nunca el PIN cifrado). */
export const EMP_COLS =
  'id, full_name, cargo, weekly_day_off, active, hired_on, pin_set_at, pin_failed_attempts, pin_locked_until'

export function errMsg(e: unknown): string {
  if (!e) return 'Ocurrió un error.'
  const m = (e as { message?: string }).message ?? String(e)
  if (m.includes('row-level security')) return 'No tienes permiso para esta acción.'
  if (m.includes('duplicate key')) return 'Ya existe un registro con esos datos.'
  if (m.includes('violates foreign key')) return 'Este dato está en uso y no se puede eliminar.'
  return m
}
