import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { LineChart } from '../components/LineChart'
import { Btn, Empty, fieldClass, Group, PageTitle, Section, Segmented, Stat, toast, toastError } from '../components/ui'
import { db } from '../db/db'
import type { BodyLogKind, Exercise, Session } from '../db/types'
import { useExercises } from '../lib/hooks'
import { exerciseStats, setsForExercise, setVolume } from '../lib/stats'
import { byName, compactSet, fmtDate, fmtNum, localDate, parseLocalDate, parseNum, setLabel, startOfWeek, uid } from '../lib/util'

type Preset = '4w' | '12w' | '6m' | '1y' | 'all' | 'custom'

export function ProgressTabs() {
  const loc = useLocation()
  return (
    <Segmented
      items={[
        { to: '/progress', label: 'Overview', active: loc.pathname.startsWith('/progress') },
        { to: '/history', label: 'History', active: loc.pathname.startsWith('/history') },
        { to: '/body', label: 'Body', active: loc.pathname.startsWith('/body') },
      ]}
    />
  )
}

function rangeFor(preset: Preset, from: string, to: string): [number, number] {
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  const days = { '4w': 28, '12w': 84, '6m': 182, '1y': 365 } as const
  if (preset === 'all') return [0, end.getTime()]
  if (preset === 'custom') {
    const f = from ? parseLocalDate(from).getTime() : 0
    const t = to ? parseLocalDate(to).getTime() + 86400000 - 1 : end.getTime()
    return [f, t]
  }
  return [end.getTime() - days[preset] * 86400000, end.getTime()]
}

function WeeklyCompletion({ sessions, plannedPerWeek }: { sessions: Session[]; plannedPerWeek: number }) {
  const weeks: { start: number; count: number }[] = []
  const thisWeek = startOfWeek().getTime()
  for (let i = 7; i >= 0; i--) {
    const d = new Date(thisWeek)
    d.setDate(d.getDate() - 7 * i)
    const start = d.getTime()
    const endD = new Date(start)
    endD.setDate(endD.getDate() + 7)
    const inWeek = sessions.filter((s) => s.startedAt >= start && s.startedAt < endD.getTime())
    weeks.push({ start, count: new Set(inWeek.map((s) => s.weekday)).size })
  }
  const max = Math.max(1, plannedPerWeek)
  return (
    <div data-testid="weekly-completion">
      <div className="flex h-28 items-end gap-2">
        {weeks.map((w, i) => (
          <div key={w.start} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <span className="num text-[12px] text-ink-300">{w.count || ''}</span>
            <div className="relative w-full flex-1 overflow-hidden rounded-lg bg-ink-850">
              <div className={`absolute inset-x-0 bottom-0 rounded-lg ${i === weeks.length - 1 ? 'bg-drive' : 'bg-iris-800'}`} style={{ height: `${Math.min(100, (w.count / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[12px] text-ink-500">
        <span>{fmtDate(weeks[0].start, { day: 'numeric', month: 'short' })}</span>
        <span>This week, out of {plannedPerWeek}</span>
      </div>
    </div>
  )
}

function ExerciseProgress({ exercise, from, to }: { exercise: Exercise; from: number; to: number }) {
  const stats = useLiveQuery(() => exerciseStats(exercise.id, exercise.logType), [exercise.id])
  if (!stats) return null
  const pts = stats.history.filter((h) => h.date >= from && h.date <= to).reverse()
  const usesWeight = exercise.logType !== 'time' && pts.some((p) => p.topWeight !== null && p.topWeight > 0)
  const main = pts.map((p) => ({ x: p.date, y: usesWeight ? (p.topWeight ?? 0) : p.bestReps }))
  const mainLabel = exercise.logType === 'assisted_reps' ? 'Least assistance, kg' : usesWeight ? 'Top set, kg' : exercise.logType === 'time' ? 'Longest hold, seconds' : 'Best reps'
  return (
    <div data-testid="exercise-progress">
      <div className="text-[14px] text-ink-400">{mainLabel}</div>
      <LineChart points={main} unit={usesWeight ? 'kg' : exercise.logType === 'time' ? 's' : 'reps'} label={`${exercise.name} ${mainLabel}`} />
      {usesWeight && exercise.logType !== 'assisted_reps' && (
        <>
          <div className="mt-3 text-[14px] text-ink-400">Volume per session, kg</div>
          <LineChart points={pts.map((p) => ({ x: p.date, y: p.volume }))} unit="kg" label={`${exercise.name} volume`} height={130} />
        </>
      )}
      {pts.length > 0 && (
        <ul className="mt-3 divide-y divide-ink-800 border-t border-ink-800 text-[15px]">
          {[...pts].reverse().map((p) => (
            <li key={p.sessionId}>
              <Link to={`/history/${p.sessionId}`} className="flex gap-3 py-2.5">
                <span className="w-16 shrink-0 text-ink-400">{fmtDate(p.date, { day: 'numeric', month: 'short' })}</span>
                <span className="flex flex-wrap gap-x-4 text-ink-200 tabular-nums">
                  {p.sets.map((s, i) => (
                    <span key={i}>{compactSet(s.weight, s.reps, exercise.logType)}</span>
                  ))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PersonalRecords({ sessions, exMap }: { sessions: Session[]; exMap: Map<string, Exercise> }) {
  const rows = useMemo(() => {
    const ids = new Set(sessions.flatMap((s) => s.exercises.filter((e) => e.sets.some((x) => x.status === 'completed')).map((e) => e.exerciseId)))
    return Array.from(ids)
      .map((id) => exMap.get(id))
      .filter((e): e is Exercise => !!e)
      .sort(byName)
      .map((ex) => {
        let best: { w: number | null; r: number; d: number } | null = null
        let most: { r: number; d: number } | null = null
        let vol = 0
        for (const s of sessions) {
          const sets = setsForExercise(s, ex.id)
          let v = 0
          for (const set of sets) {
            const w = set.weight ?? 0
            const better =
              !best ||
              (ex.logType === 'assisted_reps'
                ? w < (best.w ?? 0) || (w === (best.w ?? 0) && set.reps > best.r)
                : ex.logType === 'time'
                  ? set.reps > best.r
                  : w > (best.w ?? 0) || (w === (best.w ?? 0) && set.reps > best.r))
            if (better) best = { w: set.weight, r: set.reps, d: s.startedAt }
            if (!most || set.reps > most.r) most = { r: set.reps, d: s.startedAt }
            v += setVolume(set, ex.logType)
          }
          vol = Math.max(vol, v)
        }
        return { ex, best, most, vol }
      })
  }, [sessions, exMap])
  if (rows.length === 0) return <Empty>Records show up after your first saved workout.</Empty>
  return (
    <Group>
      <div data-testid="personal-records" className="divide-y divide-ink-800">
        {rows.map(({ ex, best, most, vol }) => (
          <div key={ex.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-ink-100">{ex.name}</div>
              <div className="text-[14px] text-ink-400">
                {most && ex.logType !== 'time' ? `Most reps ${most.r}` : ''}
                {vol > 0 ? `${most && ex.logType !== 'time' ? ', ' : ''}best session ${fmtNum(vol, 0)} kg` : ''}
              </div>
            </div>
            {best && (
              <div className="shrink-0 text-right">
                <div className="num text-[17px] text-ink-100">{setLabel(best.w, best.r, ex.logType)}</div>
                <div className="text-[12px] text-ink-500">{fmtDate(best.d, { day: 'numeric', month: 'short' })}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Group>
  )
}

export default function Progress() {
  const exMap = useExercises()
  const sessions = useLiveQuery(() => db.sessions.where('status').equals('completed').toArray(), [])
  const days = useLiveQuery(() => db.routineDays.toArray(), [])
  const [preset, setPreset] = useState<Preset>('12w')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [exerciseId, setExerciseId] = useState('')
  const [rFrom, rTo] = rangeFor(preset, from, to)

  const performed = useMemo(() => {
    if (!sessions || !exMap) return []
    const ids = new Set(sessions.flatMap((s) => s.exercises.filter((e) => e.sets.some((x) => x.status === 'completed')).map((e) => e.exerciseId)))
    return Array.from(ids)
      .map((id) => exMap.get(id))
      .filter((e): e is Exercise => !!e)
      .sort(byName)
  }, [sessions, exMap])

  if (!sessions || !exMap || !days) return null
  const inRange = sessions.filter((s) => s.startedAt >= rFrom && s.startedAt <= rTo)
  const planned = days.filter((d) => !d.isRest && d.items.length > 0).length
  const selected = exMap.get(exerciseId) ?? performed[0]
  const presets: [Preset, string][] = [
    ['4w', '4 weeks'],
    ['12w', '12 weeks'],
    ['6m', '6 months'],
    ['1y', 'Year'],
    ['all', 'All'],
    ['custom', 'Custom'],
  ]

  return (
    <div>
      <PageTitle>Progress</PageTitle>
      <ProgressTabs />

      <div className="grid grid-cols-2 gap-3 rounded-2xl bg-ink-900 p-4">
        <Stat value={sessions.length} label="workouts saved" testId="total-workouts" />
        <Stat value={inRange.length} label="in this range" />
      </div>
      <div className="mt-3 rounded-2xl bg-ink-900 p-4">
        <div className="mb-3 text-[15px] font-medium">Workouts per week</div>
        <WeeklyCompletion sessions={sessions} plannedPerWeek={planned} />
      </div>

      <div className="no-scrollbar -mx-4 mt-6 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Date range">
        {presets.map(([p, label]) => (
          <button
            key={p}
            type="button"
            onClick={() => setPreset(p)}
            aria-pressed={preset === p}
            className={`h-9 shrink-0 rounded-full px-4 text-[14px] font-medium ${preset === p ? 'bg-iris-600 text-white' : 'bg-ink-900 text-ink-300'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-[13px] text-ink-400">
            From
            <input type="date" className={`${fieldClass} mt-1`} value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="text-[13px] text-ink-400">
            To
            <input type="date" className={`${fieldClass} mt-1`} value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
      )}

      <Section title="Exercise progress">
        {performed.length === 0 ? (
          <Empty>Save a workout to see your lifts move.</Empty>
        ) : (
          <div className="rounded-2xl bg-ink-900 p-4">
            <select className={`${fieldClass} mb-4`} value={selected?.id ?? ''} onChange={(e) => setExerciseId(e.target.value)} aria-label="Exercise">
              {performed.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            {selected && <ExerciseProgress exercise={selected} from={rFrom} to={rTo} />}
          </div>
        )}
      </Section>

      <Section title="Personal records">
        <PersonalRecords sessions={inRange} exMap={exMap} />
      </Section>
    </div>
  )
}

function BodyLogSection({ kind }: { kind: BodyLogKind }) {
  const logs = useLiveQuery(() => db.bodyLogs.where('kind').equals(kind).toArray(), [kind])
  const [date, setDate] = useState(localDate())
  const [value, setValue] = useState('')
  const unit = kind === 'waist' ? 'cm' : 'kg'
  const label = kind === 'waist' ? 'Waist' : 'Body weight'
  if (!logs) return null
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
  const latest = sorted[sorted.length - 1]
  const first = sorted[0]
  return (
    <div className="rounded-2xl bg-ink-900 p-4">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="num text-[32px] leading-none">
            {latest ? fmtNum(latest.value) : '–'}
            <span className="ml-1 text-[15px] font-medium text-ink-400">{unit}</span>
          </div>
          <div className="mt-1.5 text-[14px] text-ink-400">{latest ? `${label}, ${fmtDate(latest.date)}` : `No ${label.toLowerCase()} logged yet`}</div>
        </div>
        {latest && first && latest !== first && (
          <div className="text-right text-[14px] text-ink-300 tabular-nums">
            {latest.value - first.value > 0 ? '+' : ''}
            {fmtNum(latest.value - first.value)} {unit}
            <div className="text-[12px] text-ink-500">since {fmtDate(first.date, { day: 'numeric', month: 'short' })}</div>
          </div>
        )}
      </div>
      {sorted.length > 1 && (
        <div className="mt-3">
          <LineChart points={sorted.map((l) => ({ x: parseLocalDate(l.date).getTime(), y: l.value }))} unit={unit} label={`${label} over time`} height={140} />
        </div>
      )}
      <form
        className="mt-4 grid grid-cols-[minmax(0,1fr)_5.5rem_auto] items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const v = parseNum(value)
          if (v === null || v <= 0) return toast(`Enter your ${label.toLowerCase()} in ${unit}.`, 'error')
          db.bodyLogs
            .add({ id: uid(), kind, date, value: v, createdAt: Date.now() })
            .then(() => {
              setValue('')
              toast(`${label} saved.`, 'success')
            })
            .catch(toastError)
        }}
      >
        <label className="text-[13px] text-ink-400">
          Date
          <input type="date" className={`${fieldClass} mt-1`} value={date} max={localDate()} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="text-[13px] text-ink-400">
          {unit}
          <input inputMode="decimal" className={`${fieldClass} num mt-1 text-center`} value={value} onChange={(e) => setValue(e.target.value)} aria-label={`${label} value`} />
        </label>
        <Btn variant="primary" type="submit">
          Add
        </Btn>
      </form>
      {sorted.length > 0 && (
        <ul className="mt-4 max-h-56 divide-y divide-ink-800 overflow-y-auto border-t border-ink-800 text-[15px]">
          {[...sorted].reverse().map((l) => (
            <li key={l.id} className="flex items-center justify-between py-2.5">
              <span className="text-ink-300">{fmtDate(l.date)}</span>
              <span className="flex items-center gap-4">
                <span className="tabular-nums">
                  {fmtNum(l.value)} {unit}
                </span>
                <button type="button" className="text-[14px] text-ink-500 active:text-rose-400" onClick={() => window.confirm(`Delete ${label.toLowerCase()} for ${fmtDate(l.date)}?`) && void db.bodyLogs.delete(l.id)}>
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function BodyPage() {
  return (
    <div>
      <PageTitle>Progress</PageTitle>
      <ProgressTabs />
      <BodyLogSection kind="body_weight" />
      <div className="mt-3">
        <BodyLogSection kind="waist" />
      </div>
    </div>
  )
}
