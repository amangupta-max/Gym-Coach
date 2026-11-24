import { db } from '../db/db'
import type { Exercise, LogType, Session, SessionExercise, SessionSet } from '../db/types'

export interface PerfSet {
  weight: number | null
  reps: number
}

export interface PreviousPerformance {
  sessionId: string
  date: number
  sets: PerfSet[]
}

export interface ExerciseHistoryPoint {
  sessionId: string
  date: number
  sets: PerfSet[]
  topWeight: number | null
  bestReps: number
  volume: number
}

export interface BestSet {
  weight: number | null
  reps: number
  date: number
  sessionId: string
}

export interface ExerciseStats {
  exerciseId: string
  last: PreviousPerformance | null
  /** heaviest weight (least assistance for assisted, longest hold for time) */
  best: BestSet | null
  /** most reps (or seconds) in a single completed set */
  mostReps: BestSet | null
  history: ExerciseHistoryPoint[]
}

export function completedSets(ex: SessionExercise): SessionSet[] {
  return ex.sets.filter((s) => s.status === 'completed')
}

export function setVolume(s: { weight: number | null; reps: number | null }, logType: LogType): number {
  if (logType === 'assisted_reps' || logType === 'time') return 0
  return (s.weight ?? 0) * (s.reps ?? 0)
}

function toPerf(sets: SessionSet[]): PerfSet[] {
  return sets.filter((s) => s.status === 'completed' && s.reps !== null).map((s) => ({ weight: s.weight, reps: s.reps as number }))
}

/** Completed sessions that include this exercise, newest first. */
export async function sessionsWithExercise(exerciseId: string): Promise<Session[]> {
  const list = await db.sessions.where('exerciseIds').equals(exerciseId).toArray()
  return list.filter((s) => s.status === 'completed').sort((a, b) => b.startedAt - a.startedAt)
}

/** Collect this exercise's completed sets from a session (it may appear in more than one slot). */
export function setsForExercise(session: Session, exerciseId: string): PerfSet[] {
  return session.exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => toPerf(e.sets))
}

/** Most recent completed performance of the ACTUAL exercise, excluding a given session. */
export async function previousPerformance(exerciseId: string, excludeSessionId?: string): Promise<PreviousPerformance | null> {
  for (const s of await sessionsWithExercise(exerciseId)) {
    if (s.id === excludeSessionId) continue
    const sets = setsForExercise(s, exerciseId)
    if (sets.length > 0) return { sessionId: s.id, date: s.startedAt, sets }
  }
  return null
}

function isBetter(logType: LogType, cand: PerfSet, cur: PerfSet): boolean {
  const cw = cand.weight ?? 0
  const bw = cur.weight ?? 0
  if (logType === 'assisted_reps') {
    // less assistance is better, tie-break on reps
    return cw < bw || (cw === bw && cand.reps > cur.reps)
  }
  if (logType === 'time') return cand.reps > cur.reps || (cand.reps === cur.reps && cw > bw)
  return cw > bw || (cw === bw && cand.reps > cur.reps)
}

export async function exerciseStats(exerciseId: string, logType: LogType, excludeSessionId?: string): Promise<ExerciseStats> {
  const sessions = (await sessionsWithExercise(exerciseId)).filter((s) => s.id !== excludeSessionId)
  const history: ExerciseHistoryPoint[] = []
  let best: BestSet | null = null
  let mostReps: BestSet | null = null
  for (const s of sessions) {
    const sets = setsForExercise(s, exerciseId)
    if (sets.length === 0) continue
    let topWeight: number | null = null
    let bestReps = 0
    let volume = 0
    for (const set of sets) {
      if (set.weight !== null) {
        if (topWeight === null) topWeight = set.weight
        else topWeight = logType === 'assisted_reps' ? Math.min(topWeight, set.weight) : Math.max(topWeight, set.weight)
      }
      bestReps = Math.max(bestReps, set.reps)
      volume += setVolume(set, logType)
      if (!best || isBetter(logType, set, best)) best = { ...set, date: s.startedAt, sessionId: s.id }
      if (!mostReps || set.reps > mostReps.reps || (set.reps === mostReps.reps && (set.weight ?? 0) > (mostReps.weight ?? 0)))
        mostReps = { ...set, date: s.startedAt, sessionId: s.id }
    }
    history.push({ sessionId: s.id, date: s.startedAt, sets, topWeight, bestReps, volume })
  }
  return { exerciseId, last: history[0] ? { sessionId: history[0].sessionId, date: history[0].date, sets: history[0].sets } : null, best, mostReps, history }
}

export interface SessionSummary {
  durationMs: number
  completedExercises: number
  skippedExercises: SessionExercise[]
  completedSets: number
  skippedSets: number
  totalReps: number
  totalSeconds: number
  volume: number
}

export function summarize(session: Session, exercises: Map<string, Exercise>, now = Date.now()): SessionSummary {
  let completedExercises = 0
  const skippedExercises: SessionExercise[] = []
  let completed = 0
  let skippedSets = 0
  let totalReps = 0
  let totalSeconds = 0
  let volume = 0
  for (const ex of session.exercises) {
    const logType = exercises.get(ex.exerciseId)?.logType ?? 'weight_reps'
    const done = completedSets(ex)
    if (done.length > 0) completedExercises++
    else skippedExercises.push(ex)
    completed += done.length
    skippedSets += ex.sets.filter((s) => s.status === 'skipped').length
    for (const s of done) {
      if (logType === 'time') totalSeconds += s.reps ?? 0
      else totalReps += s.reps ?? 0
      volume += setVolume(s, logType)
    }
  }
  const end = session.finishedAt ?? now
  return {
    durationMs: end - session.startedAt,
    completedExercises,
    skippedExercises,
    completedSets: completed,
    skippedSets,
    totalReps,
    totalSeconds,
    volume,
  }
}

/** Previous completed session for the same routine day, for comparisons. */
export async function previousSessionForDay(session: Session): Promise<Session | null> {
  const list = await db.sessions.where('weekday').equals(session.weekday).toArray()
  const prev = list
    .filter((s) => s.status === 'completed' && s.id !== session.id && s.startedAt < session.startedAt)
    .sort((a, b) => b.startedAt - a.startedAt)
  return prev[0] ?? null
}

export async function exerciseMap(): Promise<Map<string, Exercise>> {
  const all = await db.exercises.toArray()
  return new Map(all.map((e) => [e.id, e]))
}
