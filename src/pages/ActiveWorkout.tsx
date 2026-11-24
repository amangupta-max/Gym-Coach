import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ExerciseImage } from '../components/ExerciseImage'
import { RestTimerPanel } from '../components/RestTimer'
import { act, Btn, Modal, NumberInput, toastError } from '../components/ui'
import { db } from '../db/db'
import type { Exercise, LogType, Session, SessionExercise, SessionSet } from '../db/types'
import { setKeepAwake, unlockAudio } from '../lib/device'
import { useExercises, useNow, useSettings, useTimerState } from '../lib/hooks'
import {
  addSet,
  completeSet,
  goToExercise,
  removeSet,
  replaceExercise,
  setSkipExercise,
  skipSet,
  undoSet,
  updateSetValues,
} from '../lib/session'
import { exerciseStats, previousPerformance, type PerfSet } from '../lib/stats'
import { startTimer } from '../lib/timer'
import { byName, fmtDate, fmtDuration, fmtNum, rangeText, repUnit, setLabel, weightLabel } from '../lib/util'

export default function ActiveWorkout() {
  const { id = '' } = useParams()
  const session = useLiveQuery(() => db.sessions.get(id).then((s) => s ?? null), [id])
  const exMap = useExercises()
  const settings = useSettings()
  const timer = useTimerState()
  const now = useNow(15000)

  useEffect(() => {
    setKeepAwake(settings.keepScreenAwake)
    return () => setKeepAwake(false)
  }, [settings.keepScreenAwake])

  if (session === undefined || !exMap) return <p className="p-4 text-slate-500">Loading workout…</p>
  if (session === null)
    return (
      <div className="p-4">
        <p>This workout no longer exists.</p>
        <Link className="text-emerald-700 underline" to="/">
          Go home
        </Link>
      </div>
    )
  if (session.status === 'completed')
    return (
      <div className="p-4">
        <p>This workout is already finished.</p>
        <Link className="text-emerald-700 underline" to={`/history/${session.id}`}>
          View it in history
        </Link>
      </div>
    )

  const idx = Math.min(session.currentIndex, session.exercises.length - 1)
  const sx = session.exercises[idx]
  const ex = exMap.get(sx.exerciseId)
  const doneSets = session.exercises.reduce((n, e) => n + e.sets.filter((s) => s.status === 'completed').length, 0)
  const totalSets = session.exercises.reduce((n, e) => n + e.sets.length, 0)

  return (
    <div className={timer.status !== 'idle' ? 'pb-44' : 'pb-8'}>
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <Link to="/" className="text-sm text-slate-600">
            ‹ Home
          </Link>
          <div className="text-center">
            <div className="font-semibold" data-testid="workout-name">
              {session.name}
            </div>
            <div className="text-xs text-slate-500">
              {fmtDuration(now - session.startedAt)} · {doneSets}/{totalSets} sets
            </div>
          </div>
          <Link to={`/workout/${session.id}/finish`} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">
            Finish
          </Link>
        </div>
        <ExerciseStepper session={session} exMap={exMap} />
      </header>
      <div className="px-4 pt-3">
        {ex ? (
          <ExercisePanel key={sx.id} session={session} idx={idx} sx={sx} ex={ex} exMap={exMap} autoTimer={settings.autoStartTimer} />
        ) : (
          <p className="text-red-700">Exercise “{sx.exerciseId}” is missing from the library.</p>
        )}
      </div>
      <RestTimerPanel />
    </div>
  )
}

function exerciseState(e: SessionExercise): 'done' | 'skipped' | 'partial' | 'todo' {
  const completed = e.sets.filter((s) => s.status === 'completed').length
  const pending = e.sets.filter((s) => s.status === 'pending').length
  if (e.skipped && completed === 0) return 'skipped'
  if (pending === 0 && completed > 0) return 'done'
  if (completed > 0) return 'partial'
  return 'todo'
}

function ExerciseStepper({ session, exMap }: { session: Session; exMap: Map<string, Exercise> }) {
  return (
    <ol className="no-scrollbar mt-2 flex gap-1 overflow-x-auto pb-1" aria-label="Exercises">
      {session.exercises.map((e, i) => {
        const st = exerciseState(e)
        const active = i === session.currentIndex
        const color =
          st === 'done' ? 'bg-emerald-600 text-white' : st === 'skipped' ? 'bg-slate-300 text-slate-600 line-through' : st === 'partial' ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-700'
        return (
          <li key={e.id}>
            <button
              type="button"
              onClick={act(() => goToExercise(session.id, i))}
              className={`min-h-9 min-w-9 rounded-md px-2 text-sm font-medium ${color} ${active ? 'ring-2 ring-slate-900' : ''}`}
              aria-current={active ? 'step' : undefined}
              title={exMap.get(e.exerciseId)?.name}
            >
              {i + 1}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function ExercisePanel({
  session,
  idx,
  sx,
  ex,
  exMap,
  autoTimer,
}: {
  session: Session
  idx: number
  sx: SessionExercise
  ex: Exercise
  exMap: Map<string, Exercise>
  autoTimer: boolean
}) {
  const nav = useNavigate()
  const [replaceOpen, setReplaceOpen] = useState(false)
  const stats = useLiveQuery(() => exerciseStats(sx.exerciseId, ex.logType, session.id), [sx.exerciseId, session.id])
  const planned = exMap.get(sx.plannedExerciseId)
  const isLast = idx === session.exercises.length - 1
  const unit = repUnit(ex.logType)
  const allDone = sx.sets.every((s) => s.status !== 'pending')
  const prevSets = stats?.last?.sets ?? []

  const onComplete = async (set: SessionSet) => {
    unlockAudio()
    try {
      const rest = await completeSet(session.id, idx, set.id, ex)
      if (autoTimer) await startTimer(rest, { sessionId: session.id, setId: set.id, label: ex.name })
    } catch (e) {
      toastError(e)
    }
  }

  const next = () => (isLast ? nav(`/workout/${session.id}/finish`) : void goToExercise(session.id, idx + 1).catch(toastError))

  return (
    <article data-testid="exercise-panel">
      <div className="mb-2">
        <div className="text-xs text-slate-500">
          Exercise {idx + 1} of {session.exercises.length}
          {sx.skipped && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 font-medium text-slate-700">Skipped</span>}
        </div>
        <h1 className="text-2xl leading-tight font-bold" data-testid="exercise-name">
          {ex.name}
        </h1>
        {sx.exerciseId !== sx.plannedExerciseId && planned && (
          <p className="text-sm text-amber-800" data-testid="replaced-note">
            Replacing planned: {planned.name}
          </p>
        )}
      </div>

      <ExerciseImage exercise={ex} />

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <dt className="text-slate-500">Target</dt>
        <dd className="font-medium" data-testid="target">
          {sx.targetSets} sets × {rangeText(sx.repMin, sx.repMax, unit)}
          {sx.perSide ? ' per side' : ''}
        </dd>
        <dt className="text-slate-500">Rest</dt>
        <dd className="font-medium">{sx.restSec} sec</dd>
        <dt className="text-slate-500">Muscles</dt>
        <dd>
          {ex.primaryMuscles.join(', ')}
          {ex.secondaryMuscles.length > 0 && <span className="text-slate-500"> (+ {ex.secondaryMuscles.join(', ')})</span>}
        </dd>
        <dt className="text-slate-500">Equipment</dt>
        <dd>{ex.equipment.join(', ')}</dd>
      </dl>
      {ex.weightNote && <p className="mt-2 rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">{ex.weightNote}</p>}

      <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm" data-testid="previous-performance">
        {stats === undefined ? (
          'Loading previous performance…'
        ) : stats.last ? (
          <>
            <div className="font-semibold">Previous workout · {fmtDate(stats.last.date)}</div>
            <ul className="mt-1">
              {stats.last.sets.map((s, i) => (
                <li key={i} className="tabular-nums">
                  {setLabel(s.weight, s.reps, ex.logType)}
                </li>
              ))}
            </ul>
            {ex.logType !== 'time' && stats.last.sets.some((s) => s.weight !== null) && (
              <div className="mt-1 text-slate-700">
                Suggested starting reference: {stats.last.sets.map((s) => (s.weight === null ? 'BW' : `${fmtNum(s.weight)} kg`)).join(', ')}
                <span className="block text-xs text-slate-500">A reference only. Increase, decrease or keep it, your call.</span>
              </div>
            )}
            <div className="mt-1 text-xs text-slate-600">
              {stats.best && <>Best: {setLabel(stats.best.weight, stats.best.reps, ex.logType)}</>}
              {stats.mostReps && ex.logType !== 'time' && <> · Most {unit}: {stats.mostReps.reps}</>}
            </div>
          </>
        ) : (
          <span>No previous record for {ex.name} yet. Today sets your baseline.</span>
        )}
      </div>

      <div className="mt-4">
        <div className="mb-1 grid grid-cols-[1.5rem_1fr_1fr_auto] items-center gap-2 px-1 text-xs font-medium text-slate-500">
          <span>#</span>
          <span>{weightLabel(ex.logType)}</span>
          <span>{ex.logType === 'time' ? 'Seconds' : 'Reps'}</span>
          <span className="w-[7.5rem]" />
        </div>
        <ol className="space-y-2">
          {sx.sets.map((set, i) => (
            <SetRow
              key={set.id}
              n={i + 1}
              set={set}
              logType={ex.logType}
              prev={prevSets[i]}
              repHint={rangeText(sx.repMin, sx.repMax, '').trim()}
              onWeight={(v) => void updateSetValues(session.id, idx, set.id, { weight: v }).catch(toastError)}
              onReps={(v) => void updateSetValues(session.id, idx, set.id, { reps: v }).catch(toastError)}
              onComplete={() => void onComplete(set)}
              onUndo={act(() => undoSet(session.id, idx, set.id))}
              onSkip={act(() => skipSet(session.id, idx, set.id))}
              onRemove={set.extra ? act(() => removeSet(session.id, idx, set.id)) : undefined}
            />
          ))}
        </ol>
        <Btn className="mt-2 w-full" onClick={act(() => addSet(session.id, idx))}>
          + Add set
        </Btn>
      </div>

      {allDone && !isLast && (
        <Btn variant="primary" className="mt-3 w-full" onClick={next}>
          All sets done · Next exercise ›
        </Btn>
      )}
      {allDone && isLast && (
        <Btn variant="primary" className="mt-3 w-full" onClick={next}>
          Last exercise done · Finish workout ›
        </Btn>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Btn onClick={act(() => goToExercise(session.id, idx - 1))} disabled={idx === 0}>
          ‹ Previous
        </Btn>
        {sx.skipped ? (
          <Btn onClick={act(() => setSkipExercise(session.id, idx, false))}>Unskip</Btn>
        ) : (
          <Btn
            onClick={act(async () => {
              await setSkipExercise(session.id, idx, true)
              if (!isLast) await goToExercise(session.id, idx + 1)
            })}
          >
            Skip exercise
          </Btn>
        )}
        <Btn onClick={next}>{isLast ? 'Finish ›' : 'Next ›'}</Btn>
      </div>
      <Btn className="mt-2 w-full" onClick={() => setReplaceOpen(true)} data-testid="replace-button">
        Replace exercise
        {sx.alternatives.length > 0 && <span className="ml-1 text-slate-500">({sx.alternatives.map((a) => exMap.get(a)?.name ?? a).join(', ')})</span>}
      </Btn>

      <details className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
        <summary className="font-medium">How to do it</summary>
        <Instructions ex={ex} />
      </details>

      <ReplaceSheet
        open={replaceOpen}
        onClose={() => setReplaceOpen(false)}
        session={session}
        idx={idx}
        sx={sx}
        exMap={exMap}
      />
    </article>
  )
}

export function Instructions({ ex }: { ex: Exercise }) {
  return (
    <div className="mt-2 space-y-3 text-sm">
      {ex.description && <p className="text-slate-700">{ex.description}</p>}
      <div>
        <h3 className="font-semibold">Steps</h3>
        <ol className="ml-5 list-decimal space-y-1">
          {ex.instructions.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </div>
      <div>
        <h3 className="font-semibold">Form tips</h3>
        <ul className="ml-5 list-disc space-y-1">
          {ex.formTips.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="font-semibold">Common mistakes</h3>
        <ul className="ml-5 list-disc space-y-1">
          {ex.commonMistakes.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function SetRow({
  n,
  set,
  logType,
  prev,
  repHint,
  onWeight,
  onReps,
  onComplete,
  onUndo,
  onSkip,
  onRemove,
  readOnlyStatus,
}: {
  n: number
  set: SessionSet
  logType: LogType
  prev?: PerfSet
  repHint?: string
  onWeight: (v: number | null) => void
  onReps: (v: number | null) => void
  onComplete?: () => void
  onUndo?: () => void
  onSkip?: () => void
  onRemove?: () => void
  readOnlyStatus?: boolean
}) {
  const bg = set.status === 'completed' ? 'bg-emerald-50 border-emerald-300' : set.status === 'skipped' ? 'bg-slate-100 border-slate-200 opacity-70' : 'bg-white border-slate-200'
  return (
    <li className={`rounded-lg border p-2 ${bg}`} data-testid={`set-row-${n}`} data-status={set.status}>
      <div className="grid grid-cols-[1.5rem_1fr_1fr_auto] items-center gap-2">
        <span className="text-center font-semibold text-slate-600">{n}</span>
        <NumberInput
          ariaLabel={`Set ${n} weight`}
          value={set.weight}
          onCommit={onWeight}
          placeholder={logType === 'weight_reps' ? 'kg' : '—'}
          className={set.prefilled ? 'text-slate-500 italic' : ''}
        />
        <NumberInput ariaLabel={`Set ${n} ${logType === 'time' ? 'seconds' : 'reps'}`} value={set.reps} onCommit={onReps} placeholder={prev ? String(prev.reps) : repHint} decimal={false} />
        <div className="flex w-[7.5rem] justify-end gap-1">
          {readOnlyStatus ? (
            <span className="text-xs text-slate-600">{set.status}</span>
          ) : set.status === 'pending' ? (
            <>
              <Btn small variant="primary" onClick={onComplete} aria-label={`Complete set ${n}`}>
                Done
              </Btn>
              <Btn small variant="ghost" onClick={onSkip} aria-label={`Skip set ${n}`}>
                Skip
              </Btn>
            </>
          ) : (
            <Btn small onClick={onUndo} aria-label={`Undo set ${n}`}>
              {set.status === 'completed' ? '✓ Undo' : 'Skipped · Undo'}
            </Btn>
          )}
        </div>
      </div>
      {(prev || set.prefilled || onRemove) && (
        <div className="mt-1 flex items-center justify-between pl-8 text-xs text-slate-500">
          <span>
            {prev ? `Last time: ${setLabel(prev.weight, prev.reps, logType)}` : ''}
            {set.prefilled ? `${prev ? ' · ' : ''}weight pre-filled as a reference` : ''}
          </span>
          {onRemove && set.status !== 'completed' && (
            <button type="button" className="text-red-700 underline" onClick={onRemove}>
              Remove set
            </button>
          )}
        </div>
      )}
    </li>
  )
}

function AltOption({ exercise, onPick, tag }: { exercise: Exercise; onPick: () => void; tag?: string }) {
  const prev = useLiveQuery(() => previousPerformance(exercise.id), [exercise.id])
  return (
    <li>
      <button type="button" onClick={onPick} className="w-full rounded-lg border border-slate-200 p-3 text-left active:bg-slate-100" data-testid={`alt-${exercise.id}`}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold">{exercise.name}</span>
          {tag && <span className="shrink-0 text-xs text-emerald-700">{tag}</span>}
        </div>
        <div className="text-sm text-slate-600">
          {exercise.primaryMuscles.join(', ')} · {exercise.equipment.join(', ')}
        </div>
        <div className="text-xs text-slate-500">
          {prev === undefined
            ? 'Checking history…'
            : prev
              ? `Last: ${fmtDate(prev.date)} · ${prev.sets.map((s) => setLabel(s.weight, s.reps, exercise.logType)).join(', ')}`
              : 'No history yet'}
        </div>
      </button>
    </li>
  )
}

function ReplaceSheet({
  open,
  onClose,
  session,
  idx,
  sx,
  exMap,
}: {
  open: boolean
  onClose: () => void
  session: Session
  idx: number
  sx: SessionExercise
  exMap: Map<string, Exercise>
}) {
  const [q, setQ] = useState('')
  const [showAll, setShowAll] = useState(false)
  const current = exMap.get(sx.exerciseId)
  const planned = exMap.get(sx.plannedExerciseId)

  const suggested = useMemo(() => {
    const ids = new Set<string>([...sx.alternatives, ...(planned?.alternatives ?? []), ...(current?.alternatives ?? [])])
    if (sx.plannedExerciseId !== sx.exerciseId) ids.add(sx.plannedExerciseId)
    ids.delete(sx.exerciseId)
    return Array.from(ids)
      .map((i) => exMap.get(i))
      .filter((e): e is Exercise => !!e)
  }, [sx, planned, current, exMap])

  const others = useMemo(() => {
    const s = q.trim().toLowerCase()
    const skip = new Set([sx.exerciseId, ...suggested.map((e) => e.id)])
    return Array.from(exMap.values())
      .filter((e) => !skip.has(e.id))
      .filter((e) => !s || e.name.toLowerCase().includes(s) || e.targetMuscle.toLowerCase().includes(s))
      .sort((a, b) => (a.targetMuscle === current?.targetMuscle ? -1 : 0) - (b.targetMuscle === current?.targetMuscle ? -1 : 0) || byName(a, b))
  }, [q, exMap, sx.exerciseId, suggested, current])

  const pick = (id: string) => {
    replaceExercise(session.id, idx, id)
      .then(() => {
        onClose()
        setQ('')
        setShowAll(false)
      })
      .catch(toastError)
  }
  const hasCompleted = sx.sets.some((s) => s.status === 'completed')

  return (
    <Modal open={open} onClose={onClose} title={`Replace ${current?.name ?? ''}`}>
      <p className="mb-3 text-sm text-slate-600">
        Only today's workout changes. Your routine stays the same, and the sets are saved under the exercise you actually do.
        {hasCompleted && ' Sets you already completed stay recorded under the current exercise; the new one gets the remaining sets.'}
      </p>
      {suggested.length > 0 ? (
        <ul className="space-y-2">
          {suggested.map((e) => (
            <AltOption key={e.id} exercise={e} onPick={() => pick(e.id)} tag={e.id === sx.plannedExerciseId ? 'Back to planned' : sx.alternatives.includes(e.id) ? 'Planned alternative' : undefined} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">No alternatives listed for this exercise.</p>
      )}
      <div className="mt-4">
        {showAll ? (
          <>
            <input
              className="min-h-11 w-full rounded-lg border border-slate-300 px-3"
              placeholder="Search all exercises"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search exercises"
            />
            <ul className="mt-2 space-y-2">
              {others.slice(0, 40).map((e) => (
                <AltOption key={e.id} exercise={e} onPick={() => pick(e.id)} />
              ))}
            </ul>
          </>
        ) : (
          <Btn className="w-full" onClick={() => setShowAll(true)}>
            Choose any other exercise…
          </Btn>
        )}
      </div>
    </Modal>
  )
}
