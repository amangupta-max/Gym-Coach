import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import type { Exercise } from '../db/types'
import { equipmentGroup, EQUIPMENT_ORDER, searchExercises } from '../lib/search'
import { previousPerformance } from '../lib/stats'
import { fmtDate, setLabel } from '../lib/util'
import { ExerciseImage, ExerciseThumb } from './ExerciseImage'
import { IconChevronLeft, IconChevronRight, IconSearch } from './icons'
import { Btn, fieldClass } from './ui'

const PAGE = 50

function Chips({ items, value, onChange, label }: { items: string[]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5" role="group" aria-label={label}>
      {['', ...items].map((v) => (
        <button
          key={v || 'all'}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={`h-9 shrink-0 rounded-full px-4 text-[14px] font-medium ${value === v ? 'bg-iris-600 text-white' : 'bg-ink-800 text-ink-300'}`}
        >
          {v || 'All'}
        </button>
      ))}
    </div>
  )
}

function LastTime({ exercise }: { exercise: Exercise }) {
  const prev = useLiveQuery(() => previousPerformance(exercise.id), [exercise.id])
  if (prev === undefined) return <span className="block text-[13px] text-ink-500">Checking history…</span>
  return (
    <span className="block text-[13px] text-ink-400">
      {prev ? `Last ${fmtDate(prev.date)}: ${prev.sets.map((s) => setLabel(s.weight, s.reps, exercise.logType)).join(', ')}` : 'No history yet'}
    </span>
  )
}

function Row({ exercise, tag, onOpen, showLast }: { exercise: Exercise; tag?: string; onOpen: () => void; showLast?: boolean }) {
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 rounded-2xl bg-ink-850 p-2.5 text-left active:bg-ink-800" data-testid={`alt-${exercise.id}`}>
        <ExerciseThumb exercise={exercise} size={56} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="font-semibold leading-snug text-ink-100">{exercise.name}</span>
            {tag && <span className="shrink-0 text-[12px] text-iris-300">{tag}</span>}
          </span>
          <span className="block truncate text-[14px] text-ink-300">
            {exercise.primaryMuscles.join(', ')}, {equipmentGroup(exercise).toLowerCase()}
          </span>
          {showLast && <LastTime exercise={exercise} />}
        </span>
        <IconChevronRight size={18} className="shrink-0 text-ink-600" />
      </button>
    </li>
  )
}

/** Larger look at one exercise before choosing it. */
function Preview({ exercise, pickLabel, onPick, onBack }: { exercise: Exercise; pickLabel: string; onPick: () => void; onBack: () => void }) {
  return (
    <div data-testid="pick-preview">
      <button type="button" onClick={onBack} className="-ml-2 mb-3 inline-flex h-10 items-center gap-1 rounded-full pr-3 pl-1 text-[15px] text-ink-300 active:bg-ink-800">
        <IconChevronLeft size={20} />
        Back to list
      </button>
      <h3 className="display text-[24px] leading-tight">{exercise.name}</h3>
      <p className="mt-1 mb-3 text-[15px] text-ink-300">
        {exercise.primaryMuscles.join(', ')}
        {exercise.secondaryMuscles.length > 0 && <span className="text-ink-500"> with {exercise.secondaryMuscles.join(', ').toLowerCase()}</span>}
        <span className="block text-ink-400">{exercise.equipment.join(', ')}</span>
      </p>
      <ExerciseImage exercise={exercise} />
      <div className="mt-3">
        <LastTime exercise={exercise} />
      </div>
      {exercise.instructions.length > 0 && (
        <ol className="mt-4 space-y-2">
          {exercise.instructions.slice(0, 3).map((s, i) => (
            <li key={i} className="flex gap-3 text-[15px] leading-snug text-ink-200">
              <span className="num w-5 shrink-0 text-[14px] text-iris-300">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      )}
      <Btn variant="primary" className="sticky bottom-0 mt-5 h-14 w-full text-[17px]" onClick={onPick} data-testid="pick-confirm">
        {pickLabel}
      </Btn>
    </div>
  )
}

/**
 * Browse, search and preview exercises. Used for Swap, and for adding
 * exercises or alternatives to the routine.
 */
export function ExercisePicker({
  exMap,
  onPick,
  pickLabel,
  exclude = [],
  suggested = [],
  suggestedTag,
  defaultMuscle = '',
  intro,
}: {
  exMap: Map<string, Exercise>
  onPick: (id: string) => void
  pickLabel: string
  exclude?: string[]
  suggested?: Exercise[]
  suggestedTag?: (e: Exercise) => string | undefined
  defaultMuscle?: string
  intro?: React.ReactNode
}) {
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState(defaultMuscle)
  // The starting muscle filter is a convenience for browsing. A typed search looks
  // through every muscle unless you picked a muscle chip yourself.
  const [muscleChosen, setMuscleChosen] = useState(false)
  const [equipment, setEquipment] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [preview, setPreview] = useState<Exercise | null>(null)

  const all = useMemo(() => Array.from(exMap.values()).filter((e) => !exclude.includes(e.id)), [exMap, exclude])
  // The starting muscle goes first so its chip is visible without scrolling.
  const muscles = useMemo(() => {
    const list = Array.from(new Set(all.map((e) => e.targetMuscle))).sort()
    return defaultMuscle && list.includes(defaultMuscle) ? [defaultMuscle, ...list.filter((m) => m !== defaultMuscle)] : list
  }, [all, defaultMuscle])
  const equipments = useMemo(() => EQUIPMENT_ORDER.filter((g) => all.some((e) => equipmentGroup(e) === g)), [all])
  const activeMuscle = q.trim() && !muscleChosen ? '' : muscle
  const results = useMemo(() => searchExercises(all, q, { muscle: activeMuscle || undefined, equipment: equipment || undefined }), [all, q, activeMuscle, equipment])

  if (preview) return <Preview exercise={preview} pickLabel={pickLabel} onPick={() => onPick(preview.id)} onBack={() => setPreview(null)} />

  const showSuggested = !q.trim() && suggested.length > 0
  // While suggestions are shown above, don't list them twice.
  const listed = showSuggested ? results.filter((e) => !suggested.some((x) => x.id === e.id)) : results
  return (
    <div>
      {intro}
      {showSuggested && (
        <>
          <h3 className="mb-2 text-[15px] font-semibold text-ink-200">Suggested</h3>
          <ul className="mb-5 space-y-2">
            {suggested.map((e) => (
              <Row key={e.id} exercise={e} tag={suggestedTag?.(e)} onOpen={() => setPreview(e)} showLast />
            ))}
          </ul>
        </>
      )}
      <div className="relative">
        <IconSearch size={19} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-500" />
        <input
          className={`${fieldClass} pl-11`}
          placeholder={`Search ${all.length} exercises`}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setLimit(PAGE)
          }}
          aria-label="Search exercises"
          type="search"
          enterKeyHint="search"
        />
      </div>
      <div className="mt-3 space-y-2">
        <Chips items={muscles} value={activeMuscle} onChange={(v) => (setMuscle(v), setMuscleChosen(true), setLimit(PAGE))} label="Filter by muscle" />
        <Chips items={equipments} value={equipment} onChange={(v) => (setEquipment(v), setLimit(PAGE))} label="Filter by equipment" />
      </div>
      <p className="mt-3 mb-2 px-1 text-[13px] text-ink-500" data-testid="pick-count">
        {listed.length} {showSuggested ? 'more ' : ''}{listed.length === 1 ? 'exercise' : 'exercises'}
        {activeMuscle ? ` for ${activeMuscle.toLowerCase()}` : ''}
        {equipment ? `, ${equipment.toLowerCase()}` : ''}. Tap one to see it before choosing.
      </p>
      {listed.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-ink-700 px-4 py-6 text-center text-[15px] text-ink-400">
          Nothing matches. Try another word, or set the filters to All.
        </p>
      ) : (
        <ul className="space-y-2">
          {listed.slice(0, limit).map((e) => (
            <Row key={e.id} exercise={e} onOpen={() => setPreview(e)} />
          ))}
        </ul>
      )}
      {listed.length > limit && (
        <Btn variant="secondary" className="mt-3 w-full" onClick={() => setLimit((l) => l + PAGE)}>
          Show more ({listed.length - limit} left)
        </Btn>
      )}
    </div>
  )
}
