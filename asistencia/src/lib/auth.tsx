import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type Role = 'admin' | 'kiosk' | 'none'
interface AuthState {
  loading: boolean
  session: Session | null
  role: Role
  email: string
  signOut: () => Promise<void>
}
const Ctx = createContext<AuthState>({ loading: true, session: null, role: 'none', email: '', signOut: async () => {} })
export const useAuth = () => useContext(Ctx)

async function detectRole(session: Session | null): Promise<Role> {
  if (!session) return 'none'
  const { data: prof } = await supabase.from('profiles').select('role, active').eq('id', session.user.id).maybeSingle()
  if (prof && prof.active && prof.role === 'admin') return 'admin'
  const { data: isKiosk } = await supabase.rpc('is_kiosk')
  return isKiosk === true ? 'kiosk' : 'none'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<Role>('none')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let cancel = false
    setLoading(true)
    detectRole(session)
      .then((r) => { if (!cancel) setRole(r) })
      .catch(() => { if (!cancel) setRole('none') })
      .finally(() => { if (!cancel) setLoading(false) })
    return () => { cancel = true }
  }, [session?.user.id])

  const signOut = async () => { await supabase.auth.signOut() }
  return <Ctx.Provider value={{ loading, session, role, email: session?.user.email ?? '', signOut }}>{children}</Ctx.Provider>
}
