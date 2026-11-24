import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { ExerciseThumb } from '../components/ExerciseImage'
import { IconChevronLeft, IconChevronRight, IconX } from '../components/icons'
import { act, Btn, fieldClass, Group, NumberInput, PageTitle, Segmented, toast, toastError } from '../components/ui'
import { db } from '../db/db'
import { defaultRoutine } from '../db/seed/routine'
import type { Exercise, RoutineDay, RoutineItem, Weekday } from '../db/types'
import { useExercises } from '../lib/hooks'
import { byName, fmtRest, isoWeekday, rangeText, repUnit, uid, WEEKDAY_NAMES, WEEKDAY_SHORT } from '../lib/util'
import { estimateMinutes, useStartWorkout } from './Home'

export function PlanTabs() {
  const loc = useLocation()
  return (
    <Segmented
      items={[
        { to: '/routine', label: 'Week', active: loc.pathname.startsWith('/routine') },
        { to: '/library', label: 'Exercises', active: loc.pathname.startsWith('/library') },
      ]}
    />
  )
}

export function RoutineList() {
  const days = useLiveQuery(() => db.routineDays.orderBy('weekday').toArray(), [])
  const today = isoWeekday()
  if (!days) return null
  return (
    <div>
      <PageTitle>Plan</PageTitle>
      <PlanTabs />
      <Group>
        {days.map((d) => (
          <Link key={d.weekday} to={`/routine/${d.weekday}`} className="flex items-center gap-4 px-4 py-4 active:bg-ink-850" data-testid={`routine-day-${d.weekday}`}>
            <span className={`w-9 shrink-0 text-[14px] font-medium ${d.weekday === today ? 'text-iris-300' : 'text-ink-400'}`}>{WEEKDAY_SHORT[d.weekday]}</span>
            <span className="min-w-0 flex-1">
              <span className={`block font-semibold ${d.isRest ? 'text-ink-400' : 'text-ink-100'}`}>{d.name}</span>
              {!d.isRest && <span className="block text-[14px] leading-snug text-ink-400">{d.focus}</span>}
            </span>
            {!d.isRest && (
              <span className="shrink-0 text-right text-[14px] text-ink-400 tabular-nums">{estimateMinutes(d)} min</span>
            )}
            <IconChevronRight size={18} className="shrink-0 text-ink-600" />
          </Link>
        ))}
      </Group>
    </div>
  )
}

function ExerciseSelect({ exMap, onPick, label, exclude = [] }: { exMap: Map<string, Exercise>; onPick: (id: string) => void; label: string; exclude?: string[] }) {
  const list = Array.from(exMap.values())
    .filter((e) => !exclude.includes(e.id))
    .sort(byName)
  return (
    <select
      className={fieldClass}
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
    <label className="text-[13px] text-ink-400">
      {label}
      <NumberInput ariaLabel={`${ex?.name} ${label}`} value={item[key]} decimal={false} className="mt-1 text-[18px]" onCommit={(v) => v !== null && v > 0 && onChange({ ...item, [key]: v })} />
    </label>
  )
  const iconBtn = 'flex h-10 w-10 items-center justify-center rounded-full bg-ink-800 text-ink-200 active:bg-ink-700 disabled:opacity-30'
  return (
    <div className="rounded-2xl bg-ink-900 p-4">
      <div className="flex items-center gap-3">
        <ExerciseThumb exercise={ex} size={40} />
        <div className="min-w-0 flex-1 font-semibold">{ex?.name ?? item.exerciseId}</div>
        <button type="button" className={iconBtn} disabled={first} onClick={() => onMove(-1)} aria-label="Move up">
          <IconChevronLeft size={18} className="rotate-90" />
        </button>
        <button type="button" className={iconBtn} disabled={last} onClick={() => onMove(1)} aria-label="Move down">
          <IconChevronRight size={18} className="rotate-90" />
        </button>
        <button type="button" className={`${iconBtn} text-rose-400`} onClick={onRemove} aria-label={`Remove ${ex?.name}`}>
          <IconX size={18} />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {num('Sets', 'sets')}
        {num(ex?.logType === 'time' ? 'Min sec' : 'Min reps', 'repMin')}
        {num(ex?.logType === 'time' ? 'Max sec' : 'Max reps', 'repMax')}
        {num('Rest sec', 'restSec')}
      </div>
      <label className="mt-3 flex items-center gap-3 text-[15px] text-ink-200">
        <input type="checkbox" className="h-5 w-5 accent-iris-500" checked={item.perSide} onChange={(e) => onChange({ ...item, perSide: e.target.checked })} />
        Reps are per arm or per leg
      </label>
      <div className="mt-3">
        <div className="text-[13px] text-ink-400">Alternatives</div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {item.alternatives.length === 0 && <span className="text-[14px] text-ink-500">None</span>}
          {item.alternatives.map((a) => (
            <span key={a} className="inline-flex items-center gap-1 rounded-full bg-ink-800 py-1 pr-1 pl-3 text-[14px]">
              {exMap.get(a)?.name ?? a}
              <button type="button" aria-label="Remove alternative" className="flex h-6 w-6 items-center justify-center rounded-full text-ink-400 active:bg-ink-700" onClick={() => onChange({ ...item, alternatives: item.alternatives.filter((x) => x !== a) })}>
                <IconX size={14} />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-2">
          <ExerciseSelect exMap={exMap} label="Add an alternative" exclude={[item.exerciseId, ...item.alternatives]} onPick={(id) => onChange({ ...item, alternatives: [...item.alternatives, id] })} />
        </div>
      </div>
    </div>
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

  if (day === undefined || !exMap) return null
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
        <PageTitle sub="Changes apply to future workouts. Past workouts stay as they were.">Edit {WEEKDAY_NAMES[wd]}</PageTitle>
        <div className="space-y-3 rounded-2xl bg-ink-900 p-4">
          <label className="block text-[13px] text-ink-400">
            Name
            <input className={`${fieldClass} mt-1`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label className="block text-[13px] text-ink-400">
            Target muscles
            <input className={`${fieldClass} mt-1`} value={draft.focus} onChange={(e) => setDraft({ ...draft, focus: e.target.value })} />
          </label>
          <label className="flex items-center gap-3 text-[15px] text-ink-200">
            <input type="checkbox" className="h-5 w-5 accent-iris-500" checked={draft.isRest} onChange={(e) => setDraft({ ...draft, isRest: e.target.checked })} />
            Rest day
          </label>
        </div>
        {!draft.isRest && (
          <div className="mt-3 space-y-3">
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
              label="Add an exercise to this day"
              onPick={(id) => {
                const e = exMap.get(id)!
                setDraft({
                  ...draft,
                  items: [...draft.items, { id: uid(), exerciseId: id, sets: e.defaultSets, repMin: e.defaultRepMin, repMax: e.defaultRepMax, restSec: e.defaultRestSec, perSide: !!e.perSide, alternatives: [...e.alternatives] }],
                })
              }}
            />
          </div>
        )}
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] mt-5 flex gap-2 bg-ink-1000/90 py-3 backdrop-blur">
          <Btn
            variant="primary"
            className="flex-1"
            onClick={() => {
              for (const it of draft.items) {
                if (it.repMin > it.repMax) return toast('Min reps cannot be more than max reps.', 'error')
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
      <Link to="/routine" className="-ml-2 mb-3 inline-flex h-10 items-center gap-1 rounded-full pr-3 pl-1 text-[15px] text-ink-300 active:bg-ink-800">
        <IconChevronLeft size={20} />
        Plan
      </Link>
      <p className="px-1 text-[15px] text-ink-400">{WEEKDAY_NAMES[wd]}</p>
      <PageTitle sub={day.isRest ? 'Rest day' : day.focus}>{day.name}</PageTitle>
      {!day.isRest && day.items.length > 0 && !inProgress && (
        <Btn variant="primary" className="mb-6 h-14 w-full text-[17px]" onClick={() => start(wd)} data-testid="start-day">
          Start {day.name} workout
        </Btn>
      )}
      {inProgress && <p className="mb-5 rounded-2xl bg-ink-900 px-4 py-3 text-[15px] text-ink-300">Finish or discard your current workout before starting another.</p>}
      {!day.isRest && (
        <Group>
          {day.items.map((it) => {
            const ex = exMap.get(it.exerciseId)
            return (
              <Link key={it.id} to={`/library/${it.exerciseId}`} className="flex items-center gap-3 px-3 py-3 active:bg-ink-850">
                <ExerciseThumb exercise={ex} size={48} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink-100">{ex?.name ?? it.exerciseId}</span>
                  <span className="block text-[14px] text-ink-400 tabular-nums">
                    {it.sets} × {rangeText(it.repMin, it.repMax, repUnit(ex?.logType ?? 'weight_reps'))}
                    {it.perSide ? ' per side' : ''}, {fmtRest(it.restSec)} rest
                  </span>
                  {it.alternatives.length > 0 && <span className="block truncate text-[13px] text-ink-500">or {it.alternatives.map((a) => exMap.get(a)?.name ?? a).join(', ')}</span>}
                </span>
              </Link>
            )
          })}
        </Group>
      )}
      <div className="mt-6 flex gap-2">
        <Btn className="flex-1" onClick={() => setDraft(structuredClone(day))}>
          Edit day
        </Btn>
        <Btn
          variant="ghost"
          className="text-rose-400"
          onClick={act(async () => {
            if (!window.confirm(`Reset ${WEEKDAY_NAMES[wd]} to the original plan? Your edits to this day will be lost. Workout history is not affected.`)) return
            const def = defaultRoutine().find((d) => d.weekday === wd)
            if (def) await db.routineDays.put(def)
            toast('Day reset to the original plan.')
          })}
        >
          Reset
        </Btn>
      </div>
    </div>
  )
}
