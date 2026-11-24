import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router'
import { IconX } from './icons'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'quiet'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-drive text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18)] active:brightness-110 disabled:opacity-50',
  secondary: 'bg-ink-800 text-ink-100 border border-ink-600/70 active:bg-ink-700 disabled:text-ink-500',
  quiet: 'bg-ink-900 text-ink-200 active:bg-ink-800',
  danger: 'bg-transparent text-rose-400 border border-rose-400/35 active:bg-rose-400/10',
  ghost: 'bg-transparent text-ink-300 active:bg-ink-800',
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
      className={`${VARIANTS[variant]} ${small ? 'min-h-9 px-3.5 text-[15px]' : 'min-h-12 px-5 text-base'} inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-[filter,background-color] disabled:pointer-events-none ${className}`}
    />
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-ink-900 p-4 ${className}`}>{children}</div>
}

/** A grouped list surface: rows separated by hairlines. */
export function Group({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`divide-y divide-ink-800 overflow-hidden rounded-2xl bg-ink-900 ${className}`}>{children}</div>
}

export function Section({ title, children, right, className = '' }: { title: string; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={`mt-8 ${className}`}>
      <div className="mb-3 flex items-baseline justify-between gap-2 px-1">
        <h2 className="text-[17px] font-semibold text-ink-100">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-5 px-1">
      <h1 className="display text-[34px] leading-[1.05] text-ink-100">{children}</h1>
      {sub && <p className="mt-1.5 text-[15px] text-ink-300">{sub}</p>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-ink-700 px-4 py-6 text-center text-[15px] text-ink-400">{children}</p>
}

export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-[15px] font-medium text-iris-300 active:text-iris-200">
      {children}
    </Link>
  )
}

/** Two or three way switch between sibling screens. */
export function Segmented({ items }: { items: { to: string; label: string; active: boolean }[] }) {
  return (
    <nav className="mb-5 grid auto-cols-fr grid-flow-col rounded-full bg-ink-900 p-1" aria-label="Sections">
      {items.map((i) => (
        <Link
          key={i.to}
          to={i.to}
          replace
          aria-current={i.active ? 'page' : undefined}
          className={`flex min-h-10 items-center justify-center rounded-full text-[15px] font-semibold transition-colors ${i.active ? 'bg-ink-700 text-ink-100' : 'text-ink-400'}`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  )
}

export function Switch({ checked, onChange, label, note }: { checked: boolean; onChange: (v: boolean) => void; label: string; note?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center gap-4 px-4 py-3.5 text-left">
      <span className="flex-1">
        <span className="block text-base text-ink-100">{label}</span>
        {note && <span className="mt-0.5 block text-[14px] leading-snug text-ink-400">{note}</span>}
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-iris-600' : 'bg-ink-700'}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-[left] ${checked ? 'left-6' : 'left-1'}`} />
      </span>
    </button>
  )
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-1000/70 backdrop-blur-[2px]" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div
        className="bg-dusk max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] border-t border-ink-700 px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink-600" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="display pt-1 text-[22px] leading-tight">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-300 active:bg-ink-700">
            <IconX />
          </button>
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
    <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[70] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className="pointer-events-auto flex max-w-md items-center gap-2.5 rounded-full border border-ink-700 bg-ink-850/95 py-2.5 pr-4 pl-3 text-[15px] text-ink-100 shadow-[0_12px_32px_rgb(0_0_0/0.5)] backdrop-blur"
        >
          <span className={`h-2 w-2 shrink-0 rounded-full ${t.kind === 'error' ? 'bg-rose-400' : t.kind === 'success' ? 'bg-iris-400' : 'bg-ink-400'}`} />
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

export const fieldClass =
  'min-h-12 w-full rounded-xl border border-ink-700 bg-ink-850 px-3 text-ink-100 placeholder:text-ink-500 focus:border-iris-500 focus:outline-none focus:ring-2 focus:ring-iris-500/30'

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
      className={`num h-12 w-full min-w-0 rounded-xl border border-ink-700 bg-ink-850 px-2 text-center text-[21px] text-ink-100 placeholder:font-medium placeholder:text-ink-600 focus:border-iris-500 focus:outline-none focus:ring-2 focus:ring-iris-500/30 disabled:opacity-50 ${className}`}
    />
  )
}

/** A big number with a small label under it. */
export function Stat({ value, label, testId }: { value: ReactNode; label: string; testId?: string }) {
  return (
    <div>
      <div className="num text-[24px] leading-none text-ink-100" data-testid={testId}>
        {value}
      </div>
      <div className="mt-1.5 text-[14px] text-ink-400">{label}</div>
    </div>
  )
}
