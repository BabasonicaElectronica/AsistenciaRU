import { useEffect, type ReactNode } from 'react'
import { ESTADOS } from '../lib/types'

export function Spinner() { return <div className="spinner" role="status" aria-label="Cargando" /> }

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="notice err" role="alert">
      <b>No se pudo completar la acción.</b> {message}
      {onRetry && <> <button className="btn sm ghost" onClick={onRetry}>Reintentar</button></>}
    </div>
  )
}

export function Notice({ tone, children }: { tone: 'ok' | 'err' | 'warn' | 'info'; children: ReactNode }) {
  return <div className={`notice ${tone}`} role={tone === 'err' ? 'alert' : 'status'}>{children}</div>
}

export function Empty({ children }: { children: ReactNode }) { return <div className="empty">{children}</div> }

export function EstadoBadge({ estado }: { estado: string }) {
  const e = ESTADOS[estado] ?? { label: estado, tone: 'mute' as const }
  const icon = { ok: '✓', warn: '!', err: '✕', info: '●', mute: '○' }[e.tone]
  return <span className={`badge ${e.tone}`}><span aria-hidden>{icon}</span>{e.label}</span>
}

export function Modal({ title, onClose, children, footer, wide }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn ghost sm" onClick={onClose} aria-label="Cerrar">Cerrar</button>
        </div>
        {children}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{sub && <p className="sub">{sub}</p>}</div>
      {children && <div className="row no-print">{children}</div>}
    </div>
  )
}

export function PrintHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="print-only print-head">
      <img src="/logo.png" alt="" />
      <div><h2 style={{ margin: 0 }}>Residencial Uruguay</h2><div>{title}</div>{sub && <div className="small muted">{sub}</div>}</div>
    </div>
  )
}
