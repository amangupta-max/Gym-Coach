import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ExerciseImage, ExerciseThumb } from '../components/ExerciseImage'
import { IconBook, IconCheck, IconChevronLeft, IconChevronRight, IconPlus, IconSwap, IconX } from '../components/icons'
import { RestTimerPanel } from '../components/RestTimer'
import { ExercisePicker } from '../components/ExercisePicker'
import { act, Btn, Loading, Modal, NumberInput, Stat, toastError } from '../components/ui'
import { db } from '../db/db'
import type { Exercise, LogType, Session, SessionExercise, SessionSet } from '../db/types'
import { setKeepAwake, unlockAudio } from '../lib/device'
import { useExercises, useNow, useSettings } from '../lib/hooks'
import { addSet, completeSet, goToExercise, removeSet, replaceExercise, setSkipExercise, skipSet, undoSet, updateSetValues } from '../lib/session'
import { exerciseStats, type PerfSet } from '../lib/stats'
import { startTimer } from '../lib/timer'
import { fmtDate, fmtDuration, fmtRest, rangeText, setLabel, weightColumn } from '../lib/util'

export default function ActiveWorkout() {
  const { id = '' } = useParams()
  const session = useLiveQuery(() => db.sessions.get(id).then((s) => s ?? null), [id])
  const exMap = useExercises()
  const settings = useSettings()
  const now = useNow(15000)
  const [dock, setDock] = useState<boolean | null>(null)
  const onDock = useCallback((v: boolean | null) => setDock(v), [])

  useEffect(() => {
    setKeepAwake(settings.keepScreenAwake)
    return () => setKeepAwake(false)
  }, [settings.keepScreenAwake])

  if (session === undefined || !exMap) return <Loading label="Loading workout…" />
  if (session === null || session.status === 'completed')
    return (
      <div className="p-6">
        <p className="text-ink-200">{session ? 'This workout is already saved.' : 'This workout no longer exists.'}</p>
        <Link className="mt-3 inline-block font-semibold text-iris-300" to={session ? `/history/${session.id}` : '/'}>
          {session ? 'Open it in history' : 'Go to Today'}
        </Link>
      </div>
    )

  const idx = Math.min(session.currentIndex, session.exercises.length - 1)
  const sx = session.exercises[idx]
  const ex = exMap.get(sx.exerciseId)
  const doneSets = session.exercises.reduce((n, e) => n + e.sets.filter((s) => s.status === 'completed').length, 0)
  const totalSets = session.exercises.reduce((n, e) => n + e.sets.length, 0)

  // What comes after the current rest, for the timer dock.
  const nextPending = sx.sets.findIndex((s) => s.status === 'pending')
  const nextEx = session.exercises.slice(idx + 1).find((e) => !e.skipped)
  const next =
    nextPending >= 0
      ? { title: `set ${nextPending + 1} of ${sx.sets.length}`, detail: sx.sets[nextPending].weight !== null ? `${sx.sets[nextPending].weight} kg ready` : undefined }
      : nextEx
        ? { title: exMap.get(nextEx.exerciseId)?.name ?? 'next exercise' }
        : { title: 'finish the workout' }

  return (
    <div className={`relative min-h-dvh ${dock === true ? 'pb-[22rem]' : 'pb-44'}`}>
      <div className="bg-aura pointer-events-none absolute inset-x-0 top-0 -z-10 h-96" />
      <header className="sticky top-0 z-20 bg-ink-1000/[0.97] px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <div className="flex items-center justify-between gap-2">
          <Link to="/" aria-label="Back to Today" className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-300 active:bg-ink-800">
            <IconX />
          </Link>
          <div className="min-w-0 text-center">
            <div className="truncate font-semibold" data-testid="workout-name">
              {session.name}
            </div>
            <div className="text-[13px] text-ink-400 tabular-nums">
              {fmtDuration(now - session.startedAt)}, {doneSets} of {totalSets} sets
            </div>
          </div>
          <Link to={`/workout/${session.id}/finish`} className="h-10 rounded-full bg-ink-800 px-4 text-[15px] leading-10 font-semibold text-ink-100 active:bg-ink-700">
            Finish
          </Link>
        </div>
        <ExerciseBar session={session} exMap={exMap} />
      </header>
      <div className="px-4 pt-4">
        {ex ? (
          <ExercisePanel key={sx.id} session={session} idx={idx} sx={sx} ex={ex} exMap={exMap} autoTimer={settings.autoStartTimer} dockOpen={dock === true} />
        ) : (
          <p className="text-rose-400">Exercise “{sx.exerciseId}” is missing from the library.</p>
        )}
      </div>
      <RestTimerPanel next={next} onVisibleChange={onDock} />
    </div>
  )
}

function exerciseState(e: SessionExercise) {
  const completed = e.sets.filter((s) => s.status === 'completed').length
  const pending = e.sets.filter((s) => s.status === 'pending').length
  return { completed, pending, total: e.sets.length, skipped: e.skipped && completed === 0 }
}

/** One segment per exercise: fill shows how many sets are logged. */
function ExerciseBar({ session, exMap }: { session: Session; exMap: Map<string, Exercise> }) {
  return (
    <ol className="mt-2 flex gap-1" aria-label="Exercises">
      {session.exercises.map((e, i) => {
        const st = exerciseState(e)
        const active = i === session.currentIndex
        const pct = st.total ? ((st.total - st.pending) / st.total) * 100 : 0
        return (
          <li key={e.id} className="flex-1">
            <button
              type="button"
              onClick={act(() => goToExercise(session.id, i))}
              className="flex h-7 w-full items-center"
              aria-label={`Exercise ${i + 1}: ${exMap.get(e.exerciseId)?.name ?? ''}`}
              aria-current={active ? 'step' : undefined}
            >
              <span className={`relative block w-full overflow-hidden rounded-full ${active ? 'h-2 bg-ink-600' : 'h-1.5 bg-ink-800'}`}>
                <span className={`absolute inset-y-0 left-0 rounded-full ${st.skipped ? 'bg-ink-600' : 'bg-drive'}`} style={{ width: `${st.skipped ? 100 : pct}%` }} />
              </span>
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
  dockOpen,
}: {
  session: Session
  idx: number
  sx: SessionExercise
  ex: Exercise
  exMap: Map<string, Exercise>
  autoTimer: boolean
  dockOpen: boolean
}) {
  const nav = useNavigate()
  const [replaceOpen, setReplaceOpen] = useState(false)
  const [howOpen, setHowOpen] = useState(false)
  const stats = useLiveQuery(() => exerciseStats(sx.exerciseId, ex.logType, session.id), [sx.exerciseId, session.id])
  const planned = exMap.get(sx.plannedExerciseId)
  const isLast = idx === session.exercises.length - 1
  const allDone = sx.sets.every((s) => s.status !== 'pending')
  const prevSets = stats?.last?.sets ?? []
  const timeBased = ex.logType === 'time'

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
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] text-ink-400">
            Exercise {idx + 1} of {session.exercises.length}
            {sx.skipped && <span className="ml-2 rounded-full bg-ink-800 px-2 py-0.5 text-[13px] text-ink-300">Skipped</span>}
          </p>
          <h1 className="display mt-1 text-[30px] leading-[1.05]" data-testid="exercise-name">
            {ex.name}
          </h1>
          <p className="mt-1.5 text-[15px] text-ink-300">{ex.primaryMuscles.join(', ')}</p>
          {sx.exerciseId !== sx.plannedExerciseId && planned && (
            <p className="mt-1 text-[14px] text-iris-300" data-testid="replaced-note">
              Instead of {planned.name}
            </p>
          )}
        </div>
        <button type="button" onClick={() => setHowOpen(true)} aria-label="How to do it" className="mt-1 rounded-xl ring-1 ring-ink-700">
          <ExerciseThumb exercise={ex} size={64} />
        </button>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 rounded-2xl bg-ink-900 px-4 py-3.5" data-testid="target">
        <Stat value={sx.targetSets} label="sets" />
        <Stat value={rangeText(sx.repMin, sx.repMax, '').trim()} label={`${timeBased ? 'seconds' : 'reps'}${sx.perSide ? ' per side' : ''}`} />
        <Stat value={fmtRest(sx.restSec)} label="rest" />
      </div>

      <p className="mt-4 px-1 text-[14px] leading-snug text-ink-400" data-testid="previous-performance">
        {stats === undefined
          ? ' '
          : stats.last
            ? `Last time ${fmtDate(stats.last.date)}.${stats.best ? ` Best ${setLabel(stats.best.weight, stats.best.reps, ex.logType)}.` : ''} Weights are filled in from then, change them freely.`
            : `No previous record for ${ex.name} yet. Today sets your baseline.`}
      </p>

      <div className="mt-3">
        <div className="mb-1.5 grid grid-cols-[2rem_1fr_1fr_3rem] items-center gap-2 px-1 text-[13px] text-ink-400">
          <span>Set</span>
          <span className="text-center">{weightColumn(ex)}</span>
          <span className="text-center">{timeBased ? 'Seconds' : 'Reps'}</span>
          <span />
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
              onSkip={i === sx.sets.findIndex((x) => x.status === 'pending') ? act(() => skipSet(session.id, idx, set.id)) : undefined}
              onRemove={set.extra ? act(() => removeSet(session.id, idx, set.id)) : undefined}
            />
          ))}
        </ol>
        <button
          type="button"
          onClick={act(() => addSet(session.id, idx))}
          className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-ink-700 text-[15px] font-semibold text-ink-300 active:bg-ink-900"
        >
          <IconPlus size={18} />
          Add set
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Btn variant="quiet" onClick={() => setHowOpen(true)}>
          <IconBook size={19} />
          How to
        </Btn>
        <Btn variant="quiet" onClick={() => setReplaceOpen(true)} data-testid="replace-button">
          <IconSwap size={19} />
          Swap
        </Btn>
      </div>
      {sx.alternatives.length > 0 && <p className="mt-2 px-1 text-[13px] text-ink-500">Planned alternative: {sx.alternatives.map((a) => exMap.get(a)?.name ?? a).join(', ')}</p>}

      {/* Bottom action bar */}
      <div className={`fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg border-t border-ink-800 bg-ink-1000/[0.97] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${dockOpen ? 'invisible' : ''}`}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={act(() => goToExercise(session.id, idx - 1))}
            disabled={idx === 0}
            aria-label="Previous exercise"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink-800 text-ink-200 active:bg-ink-700 disabled:opacity-30"
          >
            <IconChevronLeft />
          </button>
          {sx.skipped ? (
            <Btn variant="ghost" className="flex-1" onClick={act(() => setSkipExercise(session.id, idx, false))}>
              Unskip
            </Btn>
          ) : (
            <Btn
              variant="ghost"
              className="flex-1"
              onClick={act(async () => {
                await setSkipExercise(session.id, idx, true)
                if (!isLast) await goToExercise(session.id, idx + 1)
              })}
            >
              Skip exercise
            </Btn>
          )}
          <Btn variant={allDone ? 'primary' : 'secondary'} className="flex-1" onClick={next}>
            {isLast ? 'Finish' : 'Next'}
            <IconChevronRight size={18} />
          </Btn>
        </div>
      </div>

      <Modal open={howOpen} onClose={() => setHowOpen(false)} title={ex.name}>
        <ExerciseImage exercise={ex} />
        {ex.weightNote && <p className="mt-4 rounded-xl bg-ink-850 px-3 py-2.5 text-[14px] text-ink-200">{ex.weightNote}</p>}
        <Instructions ex={ex} />
      </Modal>
      <ReplaceSheet open={replaceOpen} onClose={() => setReplaceOpen(false)} session={session} idx={idx} sx={sx} exMap={exMap} />
    </article>
  )
}

export function Instructions({ ex }: { ex: Exercise }) {
  const block = (title: string, items: string[], ordered = false) => {
    const List = ordered ? 'ol' : 'ul'
    return (
      <div>
        <h3 className="mb-2 font-semibold text-ink-100">{title}</h3>
        <List className="space-y-2">
          {items.map((s, i) => (
            <li key={i} className="flex gap-3 text-[15px] leading-snug text-ink-200">
              <span className={`shrink-0 ${ordered ? 'num w-5 text-[14px] text-iris-300' : 'mt-2 h-1.5 w-1.5 rounded-full bg-ink-500'}`}>{ordered ? i + 1 : ''}</span>
              <span>{s}</span>
            </li>
          ))}
        </List>
      </div>
    )
  }
  return (
    <div className="mt-5 space-y-6">
      {ex.description && <p className="text-[15px] leading-relaxed text-ink-300">{ex.description}</p>}
      {ex.instructions.length > 0 && block('Steps', ex.instructions, true)}
      {ex.formTips.length > 0 && block('Form tips', ex.formTips)}
      {ex.commonMistakes.length > 0 && block('Common mistakes', ex.commonMistakes)}
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
}) {
  const done = set.status === 'completed'
  const skipped = set.status === 'skipped'
  const surface = done ? 'bg-sheen ring-1 ring-iris-800' : skipped ? 'bg-ink-950 opacity-60' : 'bg-ink-900'
  const showFoot = prev || (set.status === 'pending' && (onSkip || onRemove))
  return (
    <li className={`rounded-2xl px-2 py-2 ${surface}`} data-testid={`set-row-${n}`} data-status={set.status}>
      <div className="grid grid-cols-[2rem_1fr_1fr_3rem] items-center gap-2">
        <span className={`num text-center text-[17px] ${done ? 'text-iris-300' : 'text-ink-500'}`}>{n}</span>
        <NumberInput
          ariaLabel={`Set ${n} weight`}
          value={set.weight}
          onCommit={onWeight}
          placeholder={logType === 'weight_reps' ? 'kg' : 'BW'}
          className={`${set.prefilled ? 'text-ink-300' : ''} ${done ? 'border-transparent bg-transparent' : ''}`}
        />
        <NumberInput
          ariaLabel={`Set ${n} ${logType === 'time' ? 'seconds' : 'reps'}`}
          value={set.reps}
          onCommit={onReps}
          placeholder={prev ? String(prev.reps) : repHint}
          decimal={false}
          className={done ? 'border-transparent bg-transparent' : ''}
        />
        {set.status === 'pending' ? (
          <button
            type="button"
            onClick={onComplete}
            aria-label={`Complete set ${n}`}
            className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-ink-600 text-ink-500 active:border-iris-500 active:text-iris-300"
          >
            <IconCheck size={20} />
          </button>
        ) : (
          <button
            type="button"
            onClick={onUndo}
            aria-label={`Undo set ${n}`}
            className={`flex h-12 w-12 items-center justify-center rounded-full ${done ? 'bg-drive text-white' : 'bg-ink-800 text-[12px] font-semibold text-ink-300'}`}
          >
            {done ? <IconCheck size={20} /> : 'Skip'}
          </button>
        )}
      </div>
      {showFoot && (
        <div className="mt-1 flex min-h-6 items-center justify-between pr-1 pl-10 text-[13px]">
          <span className="text-ink-400">{prev ? `Last ${setLabel(prev.weight, prev.reps, logType)}` : ''}</span>
          {set.status === 'pending' && (
            <span className="flex gap-3">
              {onRemove && (
                <button type="button" className="text-rose-400" onClick={onRemove}>
                  Remove
                </button>
              )}
              {onSkip && (
                <button type="button" className="text-ink-400" onClick={onSkip} aria-label={`Skip set ${n}`}>
                  Skip set
                </button>
              )}
            </span>
          )}
        </div>
      )}
    </li>
  )
}

function ReplaceSheet({ open, onClose, session, idx, sx, exMap }: { open: boolean; onClose: () => void; session: Session; idx: number; sx: SessionExercise; exMap: Map<string, Exercise> }) {
  const current = exMap.get(sx.exerciseId)
  const planned = exMap.get(sx.plannedExerciseId)

  const suggested = useMemo(() => {
    const ids = new Set<string>([...sx.alternatives, ...(planned?.alternatives ?? []), ...(current?.alternatives ?? [])])
    if (sx.plannedExerciseId !== sx.exerciseId) ids.add(sx.plannedExerciseId)
    ids.delete(sx.exerciseId)
    return Array.from(ids)
      .map((i) => exMap.get(i))
      .filter((e): e is Exercise => !!e)
      .slice(0, 6)
  }, [sx, planned, current, exMap])
  const exclude = useMemo(() => [sx.exerciseId], [sx.exerciseId])

  const pick = (id: string) => {
    replaceExercise(session.id, idx, id)
      .then(onClose)
      .catch(toastError)
  }
  const hasCompleted = sx.sets.some((s) => s.status === 'completed')

  return (
    <Modal open={open} onClose={onClose} title={`Swap ${current?.name ?? 'exercise'}`}>
      <ExercisePicker
        key={`${sx.id}-${open}`}
        exMap={exMap}
        onPick={pick}
        pickLabel="Swap to this"
        exclude={exclude}
        suggested={suggested}
        suggestedTag={(e) => (e.id === sx.plannedExerciseId ? 'Back to planned' : sx.alternatives.includes(e.id) ? 'Planned alternative' : undefined)}
        defaultMuscle={current?.targetMuscle ?? ''}
        intro={
          <p className="mb-4 text-[15px] leading-snug text-ink-300">
            Only today changes. Sets are saved under the exercise you actually do.
            {hasCompleted && ' Sets already logged stay with the current exercise.'}
          </p>
        }
      />
    </Modal>
  )
}
