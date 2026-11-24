import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { act, Btn, Card, NumberInput, PageTitle, toast, toastError } from '../components/ui'
import { db } from '../db/db'
import { defaultRoutine } from '../db/seed/routine'
import type { Exercise, RoutineDay, RoutineItem, Weekday } from '../db/types'
import { useExercises } from '../lib/hooks'
import { byName, rangeText, repUnit, uid, WEEKDAY_NAMES } from '../lib/util'
import { useStartWorkout } from './Home'

export function RoutineList() {
  const days = useLiveQuery(() => db.routineDays.orderBy('weekday').toArray(), [])
  const exMap = useExercises()
  if (!days || !exMap) return <p>Loading…</p>
  return (
    <div>
      <PageTitle sub="Tap a day to view, start or edit it.">Weekly Routine</PageTitle>
      <ul className="space-y-2">
        {days.map((d) => (
          <li key={d.weekday}>
            <Link to={`/routine/${d.weekday}`} className="block rounded-xl border border-slate-200 bg-white p-3" data-testid={`routine-day-${d.weekday}`}>
              <div className="flex items-baseline justify-between">
                <span className="font-semibold">
                  {WEEKDAY_NAMES[d.weekday]} · {d.name}
                </span>
                <span className="text-xs text-slate-500">{d.isRest ? 'Rest' : `${d.items.length} exercises`}</span>
              </div>
              {!d.isRest && (
                <div className="mt-1 text-sm text-slate-600">
                  {d.focus}
                  <div className="text-xs text-slate-500">{d.items.map((i) => exMap.get(i.exerciseId)?.name ?? i.exerciseId).join(' · ')}</div>
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ExerciseSelect({ exMap, onPick, label, exclude = [] }: { exMap: Map<string, Exercise>; onPick: (id: string) => void; label: string; exclude?: string[] }) {
  const list = Array.from(exMap.values())
    .filter((e) => !exclude.includes(e.id))
    .sort(byName)
  return (
    <select
      className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2"
      value=""
      aria-label={label}
      onChange={(e) => {
        if (e.target.value) onPick(e.target.value)
      }}
    >
      <option value="">{label}</option>
      {list.map((e) => (
        <option key={e.id} value={e.id}>
          {e.name} ({e.targetMuscle})
        </option>
      ))}
    </select>
  )
}

function ItemEditor({
  item,
  exMap,
  onChange,
  onMove,
  onRemove,
  first,
  last,
}: {
  item: RoutineItem
  exMap: Map<string, Exercise>
  onChange: (i: RoutineItem) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
  first: boolean
  last: boolean
}) {
  const ex = exMap.get(item.exerciseId)
  const num = (label: string, key: 'sets' | 'repMin' | 'repMax' | 'restSec') => (
    <label className="text-xs text-slate-600">
      {label}
      <NumberInput ariaLabel={`${ex?.name} ${label}`} value={item[key]} decimal={false} onCommit={(v) => v !== null && v > 0 && onChange({ ...item, [key]: v })} />
    </label>
  )
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold">{ex?.name ?? item.exerciseId}</div>
        <div className="flex gap-1">
          <Btn small disabled={first} onClick={() => onMove(-1)} aria-label="Move up">
            ↑
          </Btn>
          <Btn small disabled={last} onClick={() => onMove(1)} aria-label="Move down">
            ↓
          </Btn>
          <Btn small variant="danger" onClick={onRemove}>
            Remove
          </Btn>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {num('Sets', 'sets')}
        {num(ex?.logType === 'time' ? 'Min sec' : 'Min reps', 'repMin')}
        {num(ex?.logType === 'time' ? 'Max sec' : 'Max reps', 'repMax')}
        {num('Rest sec', 'restSec')}
      </div>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-5 w-5" checked={item.perSide} onChange={(e) => onChange({ ...item, perSide: e.target.checked })} />
        Reps are per side (per arm / per leg)
      </label>
      <div className="mt-2 text-sm">
        <div className="text-xs text-slate-600">Alternatives</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {item.alternatives.length === 0 && <span className="text-xs text-slate-400">None</span>}
          {item.alternatives.map((a) => (
            <span key={a} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs">
              {exMap.get(a)?.name ?? a}
              <button type="button" aria-label="Remove alternative" className="text-red-700" onClick={() => onChange({ ...item, alternatives: item.alternatives.filter((x) => x !== a) })}>
                ✕
              </button>
            </span>
          ))}
        </div>
        <div className="mt-1">
          <ExerciseSelect exMap={exMap} label="+ Add alternative" exclude={[item.exerciseId, ...item.alternatives]} onPick={(id) => onChange({ ...item, alternatives: [...item.alternatives, id] })} />
        </div>
      </div>
    </Card>
  )
}

export function RoutineDayPage() {
  const { weekday = '1' } = useParams()
  const wd = Number(weekday) as Weekday
  const day = useLiveQuery(() => db.routineDays.get(wd).then((d) => d ?? null), [wd])
  const inProgress = useLiveQuery(() => db.sessions.where('status').equals('in_progress').first(), [])
  const exMap = useExercises()
  const start = useStartWorkout()
  const [draft, setDraft] = useState<RoutineDay | null>(null)

  if (day === undefined || !exMap) return <p>Loading…</p>
  if (day === null) return <p>Day not found.</p>

  if (draft) {
    const setItem = (i: number, item: RoutineItem) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === i ? item : x)) })
    const move = (i: number, dir: -1 | 1) => {
      const items = [...draft.items]
      const [it] = items.splice(i, 1)
      items.splice(i + dir, 0, it)
      setDraft({ ...draft, items })
    }
    return (
      <div>
        <PageTitle sub="Changes apply to future workouts. Past workouts are not changed.">Edit {WEEKDAY_NAMES[wd]}</PageTitle>
        <Card>
          <label className="block text-sm">
            Name
            <input className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label className="mt-2 block text-sm">
            Target muscles
            <input className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2" value={draft.focus} onChange={(e) => setDraft({ ...draft, focus: e.target.value })} />
          </label>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5" checked={draft.isRest} onChange={(e) => setDraft({ ...draft, isRest: e.target.checked })} />
            Rest day
          </label>
        </Card>
        {!draft.isRest && (
          <div className="mt-3 space-y-2">
            {draft.items.map((item, i) => (
              <ItemEditor
                key={item.id}
                item={item}
                exMap={exMap}
                first={i === 0}
                last={i === draft.items.length - 1}
                onChange={(it) => setItem(i, it)}
                onMove={(d) => move(i, d)}
                onRemove={() => window.confirm(`Remove ${exMap.get(item.exerciseId)?.name} from this day?`) && setDraft({ ...draft, items: draft.items.filter((_, j) => j !== i) })}
              />
            ))}
            <ExerciseSelect
              exMap={exMap}
              label="+ Add exercise to this day"
              onPick={(id) => {
                const e = exMap.get(id)!
                setDraft({
                  ...draft,
                  items: [
                    ...draft.items,
                    { id: uid(), exerciseId: id, sets: e.defaultSets, repMin: e.defaultRepMin, repMax: e.defaultRepMax, restSec: e.defaultRestSec, perSide: !!e.perSide, alternatives: [...e.alternatives] },
                  ],
                })
              }}
            />
          </div>
        )}
        <div className="sticky bottom-16 mt-4 flex gap-2 bg-slate-50 py-2">
          <Btn
            variant="primary"
            className="flex-1"
            onClick={() => {
              for (const it of draft.items) {
                if (it.repMin > it.repMax) return toast('Min reps cannot be greater than max reps.', 'error')
              }
              db.routineDays
                .put({ ...draft, name: draft.name.trim() || 'Workout', updatedAt: Date.now() })
                .then(() => {
                  setDraft(null)
                  toast('Routine saved.', 'success')
                })
                .catch(toastError)
            }}
          >
            Save changes
          </Btn>
          <Btn onClick={() => setDraft(null)}>Cancel</Btn>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Link to="/routine" className="text-sm text-slate-600">
        ‹ Weekly routine
      </Link>
      <PageTitle sub={day.isRest ? 'Rest day' : day.focus}>
        {WEEKDAY_NAMES[wd]} · {day.name}
      </PageTitle>
      {!day.isRest && (
        <ol className="space-y-2">
          {day.items.map((it, i) => {
            const ex = exMap.get(it.exerciseId)
            return (
              <li key={it.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <Link to={`/library/${it.exerciseId}`} className="font-semibold text-slate-900">
                  {i + 1}. {ex?.name ?? it.exerciseId}
                </Link>
                <div className="text-sm text-slate-600">
                  {it.sets} sets × {rangeText(it.repMin, it.repMax, repUnit(ex?.logType ?? 'weight_reps'))}
                  {it.perSide ? ' per side' : ''} · {it.restSec} sec rest
                </div>
                {it.alternatives.length > 0 && <div className="text-xs text-slate-500">Alternative: {it.alternatives.map((a) => exMap.get(a)?.name ?? a).join(', ')}</div>}
              </li>
            )
          })}
        </ol>
      )}
      <div className="mt-4 space-y-2">
        {!day.isRest && day.items.length > 0 && !inProgress && (
          <Btn variant="primary" className="w-full" onClick={() => start(wd)} data-testid="start-day">
            Start {day.name} workout
          </Btn>
        )}
        {inProgress && <p className="text-sm text-slate-600">You have an unfinished workout. Resume or discard it from Home before starting another.</p>}
        <Btn className="w-full" onClick={() => setDraft(structuredClone(day))}>
          Edit this day
        </Btn>
        <Btn
          variant="danger"
          className="w-full"
          onClick={act(async () => {
            if (!window.confirm(`Reset ${WEEKDAY_NAMES[wd]} to the original plan? Your edits to this day will be lost (workout history is not affected).`)) return
            const def = defaultRoutine().find((d) => d.weekday === wd)
            if (def) await db.routineDays.put(def)
            toast('Day reset to default.')
          })}
        >
          Reset day to default
        </Btn>
      </div>
    </div>
  )
}
