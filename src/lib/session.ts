import { db } from '../db/db'
import type { Exercise, Session, SessionExercise, SessionSet, Weekday } from '../db/types'
import { previousPerformance, type PreviousPerformance } from './stats'
import { stopTimerIfMatches } from './timer'
import { uid } from './util'

export class UserError extends Error {}

export async function getInProgressSession(): Promise<Session | undefined> {
  const list = await db.sessions.where('status').equals('in_progress').toArray()
  return list.sort((a, b) => b.startedAt - a.startedAt)[0]
}

function prefillWeight(prev: PreviousPerformance | null, index: number): number | null {
  if (!prev || prev.sets.length === 0) return null
  const s = prev.sets[index] ?? prev.sets[prev.sets.length - 1]
  return s.weight
}

function makeSets(count: number, prev: PreviousPerformance | null): SessionSet[] {
  return Array.from({ length: Math.max(1, count) }, (_, i) => {
    const w = prefillWeight(prev, i)
    return { id: uid(), weight: w, reps: null, status: 'pending', prefilled: w !== null }
  })
}

function syncDerived(s: Session) {
  s.exerciseIds = Array.from(new Set(s.exercises.map((e) => e.exerciseId)))
  s.updatedAt = Date.now()
  if (s.currentIndex >= s.exercises.length) s.currentIndex = Math.max(0, s.exercises.length - 1)
}

/** Read-modify-write a session atomically. */
export async function mutateSession(id: string, fn: (s: Session) => void | Promise<void>): Promise<Session> {
  return db.transaction('rw', db.sessions, async () => {
    const s = await db.sessions.get(id)
    if (!s) throw new UserError('Workout not found. It may have been discarded.')
    await fn(s)
    syncDerived(s)
    await db.sessions.put(s)
    return s
  })
}

export async function startSession(weekday: Weekday): Promise<string> {
  const existing = await getInProgressSession()
  if (existing) throw new UserError(`You already have an unfinished ${existing.name} workout. Resume or discard it first.`)
  const day = await db.routineDays.get(weekday)
  if (!day || day.isRest || day.items.length === 0) throw new UserError('This day has no exercises planned.')

  const exercises: SessionExercise[] = []
  for (const item of day.items) {
    const ex = await db.exercises.get(item.exerciseId)
    const prev = await previousPerformance(item.exerciseId)
    exercises.push({
      id: uid(),
      routineItemId: item.id,
      plannedExerciseId: item.exerciseId,
      exerciseId: item.exerciseId,
      skipped: false,
      targetSets: item.sets,
      repMin: item.repMin,
      repMax: item.repMax,
      restSec: item.restSec,
      perSide: item.perSide || !!ex?.perSide,
      alternatives: [...item.alternatives],
      sets: makeSets(item.sets, prev),
    })
  }
  const now = Date.now()
  const session: Session = {
    id: uid(),
    weekday,
    name: day.name,
    focus: day.focus,
    status: 'in_progress',
    startedAt: now,
    currentIndex: 0,
    exercises,
    exerciseIds: [],
    updatedAt: now,
  }
  syncDerived(session)
  await db.sessions.add(session)
  return session.id
}

function findSet(s: Session, exIndex: number, setId: string): { ex: SessionExercise; set: SessionSet; index: number } {
  const ex = s.exercises[exIndex]
  if (!ex) throw new UserError('Exercise not found.')
  const index = ex.sets.findIndex((x) => x.id === setId)
  if (index < 0) throw new UserError('Set not found.')
  return { ex, set: ex.sets[index], index }
}

export async function updateSetValues(sessionId: string, exIndex: number, setId: string, patch: { weight?: number | null; reps?: number | null }) {
  await mutateSession(sessionId, (s) => {
    const { set } = findSet(s, exIndex, setId)
    if ('weight' in patch) {
      set.weight = patch.weight ?? null
      set.prefilled = false
    }
    if ('reps' in patch) set.reps = patch.reps ?? null
  })
}

/** Validates and completes a set. Returns rest seconds for the timer. */
export async function completeSet(sessionId: string, exIndex: number, setId: string, exercise: Exercise): Promise<number> {
  let rest = 0
  await mutateSession(sessionId, (s) => {
    const { ex, set, index } = findSet(s, exIndex, setId)
    if (set.reps === null || set.reps <= 0) throw new UserError(exercise.logType === 'time' ? 'Enter the seconds held first.' : 'Enter the reps you completed first.')
    if (exercise.logType === 'weight_reps' && set.weight === null) throw new UserError('Enter the weight first (use 0 if no weight).')
    if (set.weight !== null && set.weight < 0) throw new UserError('Weight cannot be negative.')
    set.status = 'completed'
    set.completedAt = Date.now()
    set.prefilled = false
    // Carry weight forward to the next pending set only if it has no value yet.
    const next = ex.sets.slice(index + 1).find((x) => x.status === 'pending')
    if (next && next.weight === null && set.weight !== null) {
      next.weight = set.weight
      next.prefilled = true
    }
    if (ex.skipped) ex.skipped = false
    rest = ex.restSec
  })
  return rest
}

export async function undoSet(sessionId: string, exIndex: number, setId: string) {
  await mutateSession(sessionId, (s) => {
    const { set } = findSet(s, exIndex, setId)
    set.status = 'pending'
    delete set.completedAt
  })
  await stopTimerIfMatches({ setId })
}

export async function skipSet(sessionId: string, exIndex: number, setId: string) {
  await mutateSession(sessionId, (s) => {
    const { set } = findSet(s, exIndex, setId)
    set.status = 'skipped'
    delete set.completedAt
  })
}

export async function addSet(sessionId: string, exIndex: number) {
  await mutateSession(sessionId, (s) => {
    const ex = s.exercises[exIndex]
    const last = ex.sets[ex.sets.length - 1]
    ex.sets.push({ id: uid(), weight: last?.weight ?? null, reps: null, status: 'pending', extra: true, prefilled: last?.weight != null })
    ex.skipped = false
  })
}

export async function removeSet(sessionId: string, exIndex: number, setId: string) {
  await mutateSession(sessionId, (s) => {
    const { ex, set, index } = findSet(s, exIndex, setId)
    if (set.status === 'completed') throw new UserError('Undo the set before removing it.')
    if (ex.sets.length <= 1) throw new UserError('An exercise needs at least one set. Skip the exercise instead.')
    ex.sets.splice(index, 1)
  })
}

export async function setSkipExercise(sessionId: string, exIndex: number, skipped: boolean) {
  await mutateSession(sessionId, (s) => {
    s.exercises[exIndex].skipped = skipped
  })
}

export async function goToExercise(sessionId: string, index: number) {
  await mutateSession(sessionId, (s) => {
    s.currentIndex = Math.min(Math.max(0, index), s.exercises.length - 1)
  })
}

/**
 * Replace the exercise in a slot for THIS session only. The routine is untouched.
 * If sets were already completed, those stay recorded under the original
 * exercise and the alternative is inserted as a new entry for the remaining sets.
 */
export async function replaceExercise(sessionId: string, exIndex: number, newExerciseId: string) {
  const newEx = await db.exercises.get(newExerciseId)
  if (!newEx) throw new UserError('Exercise not found in library.')
  const prev = await previousPerformance(newExerciseId, sessionId)
  await mutateSession(sessionId, (s) => {
    const ex = s.exercises[exIndex]
    if (ex.exerciseId === newExerciseId) return
    const done = ex.sets.filter((x) => x.status === 'completed')
    if (done.length === 0) {
      ex.exerciseId = newExerciseId
      ex.perSide = ex.perSide || !!newEx.perSide
      ex.skipped = false
      // Re-reference weights from the new exercise's own history (not the original's).
      ex.sets = ex.sets.map((set, i) => {
        if (set.status !== 'pending') return set
        const w = prefillWeight(prev, i)
        return { ...set, weight: w, prefilled: w !== null }
      })
      return
    }
    const remaining = ex.sets.filter((x) => x.status === 'pending').length
    ex.sets = ex.sets.filter((x) => x.status !== 'pending')
    const entry: SessionExercise = {
      ...ex,
      id: uid(),
      exerciseId: newExerciseId,
      perSide: ex.perSide || !!newEx.perSide,
      skipped: false,
      sets: makeSets(Math.max(1, remaining), prev),
    }
    s.exercises.splice(exIndex + 1, 0, entry)
    s.currentIndex = exIndex + 1
  })
}

export async function finishSession(sessionId: string) {
  await mutateSession(sessionId, (s) => {
    s.status = 'completed'
    s.finishedAt = Date.now()
  })
  await stopTimerIfMatches({ sessionId })
}

export async function discardSession(sessionId: string) {
  await db.sessions.delete(sessionId)
  await stopTimerIfMatches({ sessionId })
}

export async function deleteSession(sessionId: string) {
  await db.sessions.delete(sessionId)
}
