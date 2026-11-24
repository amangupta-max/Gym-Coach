import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { LineChart } from '../components/LineChart'
import { Btn, Card, Empty, PageTitle, Section, toast, toastError } from '../components/ui'
import { db } from '../db/db'
import type { BodyLogKind, Exercise, Session } from '../db/types'
import { useExercises } from '../lib/hooks'
import { exerciseStats, setsForExercise, setVolume } from '../lib/stats'
import { byName, fmtDate, fmtDateYear, fmtNum, localDate, parseLocalDate, parseNum, setLabel, startOfWeek, uid } from '../lib/util'

type Preset = '4w' | '12w' | '6m' | '1y' | 'all' | 'custom'

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
  for (let i = 0; i < 8; i++) {
    const d = new Date(thisWeek)
    d.setDate(d.getDate() - 7 * i)
    const start = d.getTime()
    const endD = new Date(start)
    endD.setDate(endD.getDate() + 7)
    const inWeek = sessions.filter((s) => s.startedAt >= start && s.startedAt < endD.getTime())
    weeks.push({ start, count: new Set(inWeek.map((s) => s.weekday)).size })
  }
  return (
    <ul className="space-y-1 text-sm" data-testid="weekly-completion">
      {weeks.map((w) => (
        <li key={w.start} className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-2">
          <span className="text-slate-600">{fmtDate(w.start, { day: 'numeric', month: 'short' })}</span>
          <span className="h-3 overflow-hidden rounded bg-slate-200">
            <span className="block h-full bg-emerald-500" style={{ width: `${Math.min(100, (w.count / Math.max(1, plannedPerWeek)) * 100)}%` }} />
          </span>
          <span className="text-right tabular-nums">
            {w.count}/{plannedPerWeek}
          </span>
        </li>
      ))}
    </ul>
  )
}

function ExerciseProgress({ exercise, from, to }: { exercise: Exercise; from: number; to: number }) {
  const stats = useLiveQuery(() => exerciseStats(exercise.id, exercise.logType), [exercise.id])
  if (!stats) return <p className="text-sm">Loading…</p>
  const pts = stats.history.filter((h) => h.date >= from && h.date <= to).reverse()
  const usesWeight = exercise.logType !== 'time' && pts.some((p) => p.topWeight !== null && p.topWeight > 0)
  const main = pts.map((p) => ({ x: p.date, y: usesWeight ? (p.topWeight ?? 0) : p.bestReps }))
  const mainLabel = exercise.logType === 'assisted_reps' ? 'Least assistance (kg)' : usesWeight ? 'Top set weight (kg)' : exercise.logType === 'time' ? 'Longest hold (sec)' : 'Best reps'
  return (
    <div data-testid="exercise-progress">
      <div className="text-sm font-medium">{mainLabel}</div>
      <LineChart points={main} unit={usesWeight ? 'kg' : exercise.logType === 'time' ? 's' : 'reps'} label={`${exercise.name} ${mainLabel}`} />
      {usesWeight && exercise.logType !== 'assisted_reps' && (
        <>
          <div className="mt-2 text-sm font-medium">Session volume (kg × reps)</div>
          <LineChart points={pts.map((p) => ({ x: p.date, y: p.volume }))} unit="kg" label={`${exercise.name} volume`} />
        </>
      )}
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="font-normal">Date</th>
            <th className="font-normal">Sets</th>
          </tr>
        </thead>
        <tbody>
          {[...pts].reverse().map((p) => (
            <tr key={p.sessionId} className="border-t border-slate-100 align-top">
              <td className="py-1 pr-2 whitespace-nowrap">
                <Link to={`/history/${p.sessionId}`} className="text-emerald-700">
                  {fmtDateYear(p.date)}
                </Link>
              </td>
              <td className="py-1 tabular-nums">{p.sets.map((s) => setLabel(s.weight, s.reps, exercise.logType)).join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
  if (rows.length === 0) return <Empty>Personal records appear after your first completed workout.</Empty>
  return (
    <ul className="space-y-2" data-testid="personal-records">
      {rows.map(({ ex, best, most, vol }) => (
        <li key={ex.id} className="rounded-lg border border-slate-200 bg-white p-2 text-sm">
          <div className="font-medium">{ex.name}</div>
          <div className="text-slate-600">
            {best && (
              <>
                {ex.logType === 'assisted_reps' ? 'Least assist' : ex.logType === 'time' ? 'Longest' : 'Best'}: {setLabel(best.w, best.r, ex.logType)} ({fmtDate(best.d, { day: 'numeric', month: 'short' })})
              </>
            )}
            {most && ex.logType !== 'time' && <> · Most reps: {most.r}</>}
            {vol > 0 && <> · Best session volume: {fmtNum(vol, 0)} kg</>}
          </div>
        </li>
      ))}
    </ul>
  )
}

function BodyLogSection({ kind, from, to }: { kind: BodyLogKind; from: number; to: number }) {
  const logs = useLiveQuery(() => db.bodyLogs.where('kind').equals(kind).toArray(), [kind])
  const [date, setDate] = useState(localDate())
  const [value, setValue] = useState('')
  const unit = kind === 'waist' ? 'cm' : 'kg'
  const label = kind === 'waist' ? 'Waist' : 'Body weight'
  if (!logs) return null
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
  const inRange = sorted.filter((l) => {
    const t = parseLocalDate(l.date).getTime()
    return t >= from && t <= to
  })
  return (
    <Card>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const v = parseNum(value)
          if (v === null || v <= 0) return toast(`Enter a valid ${label.toLowerCase()}.`, 'error')
          db.bodyLogs
            .add({ id: uid(), kind, date, value: v, createdAt: Date.now() })
            .then(() => {
              setValue('')
              toast(`${label} saved.`, 'success')
            })
            .catch(toastError)
        }}
      >
        <label className="text-xs text-slate-600">
          Date
          <input type="date" className="block min-h-11 rounded-lg border border-slate-300 px-2" value={date} max={localDate()} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="text-xs text-slate-600">
          {label} ({unit})
          <input inputMode="decimal" className="block min-h-11 w-24 rounded-lg border border-slate-300 px-2" value={value} onChange={(e) => setValue(e.target.value)} aria-label={`${label} value`} />
        </label>
        <Btn variant="primary" type="submit">
          Add
        </Btn>
      </form>
      <div className="mt-3">
        <LineChart points={inRange.map((l) => ({ x: parseLocalDate(l.date).getTime(), y: l.value }))} unit={unit} label={`${label} over time`} />
      </div>
      {sorted.length > 0 && (
        <ul className="mt-2 max-h-48 overflow-y-auto text-sm">
          {[...sorted].reverse().map((l) => (
            <li key={l.id} className="flex items-center justify-between border-t border-slate-100 py-1">
              <span>
                {fmtDate(l.date)} · <strong>{fmtNum(l.value)}</strong> {unit}
              </span>
              <button
                type="button"
                className="text-xs text-red-700 underline"
                onClick={() => window.confirm(`Delete ${label.toLowerCase()} entry for ${fmtDate(l.date)}?`) && void db.bodyLogs.delete(l.id)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
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

  if (!sessions || !exMap || !days) return <p>Loading…</p>
  const inRange = sessions.filter((s) => s.startedAt >= rFrom && s.startedAt <= rTo)
  const planned = days.filter((d) => !d.isRest && d.items.length > 0).length
  const selected = exMap.get(exerciseId) ?? performed[0]

  return (
    <div>
      <PageTitle>Progress</PageTitle>
      <Card>
        <label className="text-xs text-slate-600">
          Date range
          <select className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2" value={preset} onChange={(e) => setPreset(e.target.value as Preset)} aria-label="Date range">
            <option value="4w">Last 4 weeks</option>
            <option value="12w">Last 12 weeks</option>
            <option value="6m">Last 6 months</option>
            <option value="1y">Last year</option>
            <option value="all">All time</option>
            <option value="custom">Custom…</option>
          </select>
        </label>
        {preset === 'custom' && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-600">
              From
              <input type="date" className="block min-h-11 w-full rounded-lg border border-slate-300 px-2" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="text-xs text-slate-600">
              To
              <input type="date" className="block min-h-11 w-full rounded-lg border border-slate-300 px-2" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
        )}
      </Card>

      <Section title="Overview">
        <Card>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div>
              <div className="text-3xl font-bold" data-testid="total-workouts">
                {sessions.length}
              </div>
              <div className="text-xs text-slate-500">completed workouts (all time)</div>
            </div>
            <div>
              <div className="text-3xl font-bold">{inRange.length}</div>
              <div className="text-xs text-slate-500">in selected range</div>
            </div>
          </div>
          <div className="mt-3 text-sm font-medium">Weekly completion (last 8 weeks, week starting Monday)</div>
          <WeeklyCompletion sessions={sessions} plannedPerWeek={planned} />
        </Card>
      </Section>

      <Section title="Exercise progression">
        {performed.length === 0 ? (
          <Empty>Complete a workout to see progression charts.</Empty>
        ) : (
          <Card>
            <select className="mb-3 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2" value={selected?.id ?? ''} onChange={(e) => setExerciseId(e.target.value)} aria-label="Exercise">
              {performed.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            {selected && <ExerciseProgress exercise={selected} from={rFrom} to={rTo} />}
          </Card>
        )}
      </Section>

      <Section title="Personal records">
        <PersonalRecords sessions={inRange} exMap={exMap} />
      </Section>

      <Section title="Body weight">
        <BodyLogSection kind="body_weight" from={rFrom} to={rTo} />
      </Section>

      <Section title="Waist">
        <BodyLogSection kind="waist" from={rFrom} to={rTo} />
      </Section>

      <Section title="Cardio">
        <Link to="/cardio" className="block rounded-xl border border-slate-200 bg-white p-3 font-medium text-emerald-700">
          Open cardio log ›
        </Link>
      </Section>
    </div>
  )
}
