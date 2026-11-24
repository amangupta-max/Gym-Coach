import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-emerald-600 text-white active:bg-emerald-700 disabled:bg-emerald-300',
  success: 'bg-emerald-100 text-emerald-900 border border-emerald-300 active:bg-emerald-200',
  secondary: 'bg-white text-slate-900 border border-slate-300 active:bg-slate-100 disabled:text-slate-400',
  danger: 'bg-white text-red-700 border border-red-300 active:bg-red-50',
  ghost: 'bg-transparent text-slate-700 active:bg-slate-200',
}

export function Btn({
  variant = 'secondary',
  small,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; small?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={`${VARIANTS[variant]} ${small ? 'min-h-9 px-3 text-sm' : 'min-h-11 px-4'} rounded-lg font-medium disabled:opacity-60 ${className}`}
    />
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200 bg-white p-4 ${className}`}>{children}</div>
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-3">
      <h1 className="text-2xl font-bold">{children}</h1>
      {sub && <p className="text-slate-600">{sub}</p>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-slate-500">{children}</p>
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Btn variant="ghost" small onClick={onClose} aria-label="Close">
            Close
          </Btn>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Toasts ──────────────────────────────────────────────
type ToastMsg = { id: number; text: string; kind: 'info' | 'error' | 'success' }
let listeners: ((t: ToastMsg) => void)[] = []
let nextId = 1

export function toast(text: string, kind: ToastMsg['kind'] = 'info') {
  const msg = { id: nextId++, text, kind }
  listeners.forEach((l) => l(msg))
}

export function toastError(e: unknown) {
  const text = e instanceof Error ? e.message : String(e)
  console.error(e)
  toast(text || 'Something went wrong.', 'error')
}

export function Toaster() {
  const [items, setItems] = useState<ToastMsg[]>([])
  useEffect(() => {
    const l = (t: ToastMsg) => {
      setItems((cur) => [...cur, t])
      setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== t.id)), t.kind === 'error' ? 5000 : 2500)
    }
    listeners.push(l)
    return () => {
      listeners = listeners.filter((x) => x !== l)
    }
  }, [])
  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-[60] flex flex-col items-center gap-2 px-3" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto max-w-md rounded-lg px-4 py-2 text-sm shadow-lg ${
            t.kind === 'error' ? 'bg-red-700 text-white' : t.kind === 'success' ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-white'
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  )
}

/** Runs an async action and reports errors as a toast. */
export function act(fn: () => Promise<unknown>, success?: string) {
  return () => {
    fn()
      .then(() => success && toast(success, 'success'))
      .catch(toastError)
  }
}

export function NumberInput({
  value,
  onCommit,
  placeholder,
  ariaLabel,
  className = '',
  disabled,
  decimal = true,
}: {
  value: number | null
  onCommit: (v: number | null) => void
  placeholder?: string
  ariaLabel: string
  className?: string
  disabled?: boolean
  decimal?: boolean
}) {
  const [text, setText] = useState(value === null ? '' : String(value))
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setText(value === null ? '' : String(value))
  }, [value, focused])
  const commit = (t: string) => {
    const s = t.trim().replace(',', '.')
    if (s === '') return onCommit(null)
    const n = Number(s)
    if (Number.isFinite(n)) onCommit(decimal ? n : Math.round(n))
  }
  return (
    <input
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      enterKeyHint="done"
      aria-label={ariaLabel}
      disabled={disabled}
      placeholder={placeholder}
      value={text}
      onFocus={(e) => {
        setFocused(true)
        e.currentTarget.select()
      }}
      onBlur={(e) => {
        setFocused(false)
        commit(e.currentTarget.value)
      }}
      onChange={(e) => {
        setText(e.target.value)
        const s = e.target.value.trim().replace(',', '.')
        if (s === '' || (Number.isFinite(Number(s)) && !s.endsWith('.'))) commit(e.target.value)
      }}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className={`min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-center text-lg tabular-nums disabled:bg-slate-100 ${className}`}
    />
  )
}
