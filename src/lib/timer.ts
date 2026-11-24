/*
 * Rest timer.
 *
 * The timer never counts down by decrementing a number. It stores the END
 * TIMESTAMP in IndexedDB and every render computes `endAt - Date.now()`.
 * So if Android freezes the tab, the screen turns off, or the app is killed,
 * the correct remaining time is recovered as soon as the app is visible again.
 *
 * Limitation (by design, not a bug): a web app cannot reliably make a sound
 * while Android has suspended the browser. The beep plays only if the app is
 * on screen when the rest ends. Use "Keep screen on" to make that likely.
 */
import { db, getKV, setKV } from '../db/db'
import { IDLE_TIMER, type TimerState } from '../db/types'

const KEY = 'timer'

export function remainingMs(t: TimerState, now = Date.now()): number {
  if (t.status === 'running' && t.endAt !== null) return Math.min(t.durationMs, Math.max(0, t.endAt - now))
  if (t.status === 'paused' && t.pausedRemainingMs !== null) return Math.max(0, t.pausedRemainingMs)
  return 0
}

async function update(fn: (t: TimerState) => TimerState): Promise<TimerState> {
  return db.transaction('rw', db.kv, async () => {
    const cur = await getKV<TimerState>(KEY, IDLE_TIMER)
    const next = fn(cur)
    await setKV(KEY, next)
    return next
  })
}

export function startTimer(seconds: number, meta: { sessionId?: string; setId?: string; label?: string } = {}) {
  const ms = Math.max(1, Math.round(seconds)) * 1000
  return update(() => ({
    status: 'running',
    durationMs: ms,
    endAt: Date.now() + ms,
    pausedRemainingMs: null,
    finishedAt: null,
    startedAt: Date.now(),
    ...meta,
  }))
}

export function pauseTimer() {
  return update((t) => (t.status !== 'running' ? t : { ...t, status: 'paused', pausedRemainingMs: remainingMs(t), endAt: null }))
}

export function resumeTimer() {
  return update((t) =>
    t.status !== 'paused' ? t : { ...t, status: 'running', endAt: Date.now() + (t.pausedRemainingMs ?? 0), pausedRemainingMs: null },
  )
}

/** Restart from the full duration. */
export function resetTimer() {
  return update((t) =>
    t.durationMs <= 0 ? t : { ...t, status: 'running', endAt: Date.now() + t.durationMs, pausedRemainingMs: null, finishedAt: null },
  )
}

export function skipTimer() {
  return update(() => ({ ...IDLE_TIMER }))
}

/** Add (or with a negative value, remove) seconds. */
export function adjustTimer(seconds: number) {
  const delta = seconds * 1000
  return update((t) => {
    if (t.status === 'running' && t.endAt !== null) {
      const endAt = Math.max(Date.now(), t.endAt + delta)
      return { ...t, endAt, durationMs: Math.max(1000, t.durationMs + delta) }
    }
    if (t.status === 'paused') {
      return { ...t, pausedRemainingMs: Math.max(0, (t.pausedRemainingMs ?? 0) + delta), durationMs: Math.max(1000, t.durationMs + delta) }
    }
    if (delta > 0) {
      // finished or idle: start a fresh rest of that length
      return { ...t, status: 'running', durationMs: delta, endAt: Date.now() + delta, pausedRemainingMs: null, finishedAt: null }
    }
    return t
  })
}

/** Manually set the remaining time. */
export function setTimerRemaining(seconds: number) {
  const ms = Math.max(1, Math.round(seconds)) * 1000
  return update((t) => ({
    ...t,
    status: t.status === 'paused' ? 'paused' : 'running',
    durationMs: ms,
    endAt: t.status === 'paused' ? null : Date.now() + ms,
    pausedRemainingMs: t.status === 'paused' ? ms : null,
    finishedAt: null,
  }))
}

/**
 * Marks a running timer as finished once its end time has passed.
 * Returns true only for the single caller that performed the transition,
 * so the completion sound plays at most once.
 */
export async function markFinishedIfDue(now = Date.now()): Promise<{ transitioned: boolean; overdueMs: number }> {
  let transitioned = false
  let overdueMs = 0
  await db.transaction('rw', db.kv, async () => {
    const t = await getKV<TimerState>(KEY, IDLE_TIMER)
    if (t.status === 'running' && t.endAt !== null && t.endAt <= now) {
      overdueMs = now - t.endAt
      await setKV<TimerState>(KEY, { ...t, status: 'finished', finishedAt: t.endAt, endAt: null })
      transitioned = true
    }
  })
  return { transitioned, overdueMs }
}

export async function stopTimerIfMatches(match: { sessionId?: string; setId?: string }) {
  await update((t) => {
    if (t.status === 'idle') return t
    if (match.setId && t.setId === match.setId) return { ...IDLE_TIMER }
    if (match.sessionId && t.sessionId === match.sessionId) return { ...IDLE_TIMER }
    return t
  })
}
