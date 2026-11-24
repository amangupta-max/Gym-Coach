import type { Exercise, LogType, Weekday } from '../db/types'

/** crypto.randomUUID only exists in secure contexts (HTTPS/localhost). Fall back for LAN dev over http. */
export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes)
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export const WEEKDAY_NAMES: Record<Weekday, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
}
export const WEEKDAY_SHORT: Record<Weekday, string> = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' }

export function isoWeekday(d = new Date()): Weekday {
  const js = d.getDay() // 0 = Sunday
  return (js === 0 ? 7 : js) as Weekday
}

/** Local calendar date YYYY-MM-DD (not UTC). */
export function localDate(d: Date | number = new Date()): string {
  const x = typeof d === 'number' ? new Date(d) : d
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const day = String(x.getDate()).padStart(2, '0')
  return `${x.getFullYear()}-${m}-${day}`
}

export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Monday 00:00 local of the week containing d */
export function startOfWeek(d: Date | number = new Date()): Date {
  const x = new Date(typeof d === 'number' ? d : d.getTime())
  x.setHours(0, 0, 0, 0)
  const wd = isoWeekday(x)
  x.setDate(x.getDate() - (wd - 1))
  return x
}

export function fmtDate(ts: number | string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string {
  const d = typeof ts === 'string' ? parseLocalDate(ts) : new Date(ts)
  return d.toLocaleDateString(undefined, opts)
}

export function fmtDateYear(ts: number | string): string {
  return fmtDate(ts, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function fmtDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60000))
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

export function fmtClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function fmtNum(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '–'
  const r = Math.round(n * 10 ** digits) / 10 ** digits
  return r.toLocaleString(undefined, { maximumFractionDigits: digits })
}

/** Accepts "12,5" as well as "12.5". Returns null for empty/invalid. */
export function parseNum(s: string): number | null {
  const t = s.trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function repUnit(logType: LogType): string {
  return logType === 'time' ? 'sec' : 'reps'
}

export function weightLabel(logType: LogType): string {
  if (logType === 'assisted_reps') return 'Assist kg'
  if (logType === 'bodyweight_reps' || logType === 'time') return '+kg'
  return 'kg'
}

/** Short column header that says how to log weight for this exercise. */
export function weightColumn(ex: Pick<Exercise, 'logType' | 'weightNote'>): string {
  if (ex.logType === 'assisted_reps') return 'Assist kg'
  if (ex.logType === 'bodyweight_reps' || ex.logType === 'time') return 'Added kg'
  const note = ex.weightNote ?? ''
  if (/ONE dumbbell|one dumbbell|the dumbbell/i.test(note)) return 'kg each'
  if (/including the bar/i.test(note)) return 'kg total'
  return 'kg'
}

export function fmtRest(sec: number): string {
  return sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : `${sec}s`
}

export function rangeText(min: number, max: number, unit: string): string {
  return min === max ? `${min} ${unit}` : `${min}–${max} ${unit}`
}

/** "30 kg × 12" style label for one set */
export function setLabel(weight: number | null, reps: number | null, logType: LogType): string {
  const unit = logType === 'time' ? ' s' : ''
  const r = reps === null ? '?' : `${fmtNum(reps, 0)}${unit}`
  if (logType === 'assisted_reps') return weight ? `${r} (assist ${fmtNum(weight)} kg)` : `${r} (no assist)`
  if (logType === 'bodyweight_reps' || logType === 'time') return weight ? `+${fmtNum(weight)} kg × ${r}` : logType === 'time' ? r : `BW × ${r}`
  return `${fmtNum(weight)} kg × ${r}`
}

/** Compact "57.5×8" form for dense lists. */
export function compactSet(weight: number | null, reps: number | null, logType: LogType): string {
  const r = reps ?? '?'
  if (logType === 'time') return `${weight ? `+${fmtNum(weight)}kg ` : ''}${r}s`
  if (logType === 'assisted_reps') return weight ? `${r} @ −${fmtNum(weight)}` : `${r}`
  if (logType === 'bodyweight_reps') return weight ? `+${fmtNum(weight)}×${r}` : `BW×${r}`
  return `${fmtNum(weight)}×${r}`
}

export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`
}

export function exerciseImageUrl(file: string): string {
  return assetUrl(`exercise-images/${file}`)
}

export function byName(a: Pick<Exercise, 'name'>, b: Pick<Exercise, 'name'>) {
  return a.name.localeCompare(b.name)
}
