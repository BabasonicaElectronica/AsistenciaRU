import { useCallback, useEffect, useRef, useState } from 'react'

/** Carga datos asíncronos con estado de carga, error y recarga manual. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[], opts?: { every?: number }) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const seq = useRef(0)

  const reload = useCallback(async (silent = false) => {
    const id = ++seq.current
    if (!silent) setLoading(true)
    try {
      const d = await fnRef.current()
      if (id === seq.current) { setData(d); setError(null) }
    } catch (e) {
      if (id === seq.current) setError((e as { message?: string })?.message ?? 'No se pudo cargar la información.')
    } finally {
      if (id === seq.current) setLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload() }, deps)
  useEffect(() => {
    if (!opts?.every) return
    const t = setInterval(() => reload(true), opts.every)
    return () => clearInterval(t)
  }, [opts?.every, reload])

  return { data, loading, error, reload, setData }
}

export function useNow(ms = 1000) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}
