import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db, getKV, setKV } from '../db/db'
import { DEFAULT_SETTINGS, IDLE_TIMER, type Exercise, type Settings, type TimerState } from '../db/types'
import { remainingMs } from './timer'
import { exerciseImageUrl } from './util'

export function useSettings(): Settings {
  const s = useLiveQuery(() => getKV<Settings>('settings', DEFAULT_SETTINGS), [])
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) }
}

export async function updateSettings(patch: Partial<Settings>) {
  const cur = await getKV<Settings>('settings', DEFAULT_SETTINGS)
  await setKV('settings', { ...DEFAULT_SETTINGS, ...cur, ...patch })
}

/** Re-renders every `ms` and immediately when the page becomes visible again. */
export function useNow(ms = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    const tick = () => setNow(Date.now())
    tick()
    const id = window.setInterval(tick, ms)
    const onVis = () => tick()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    window.addEventListener('pageshow', onVis)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onVis)
      window.removeEventListener('pageshow', onVis)
    }
  }, [ms, enabled])
  return now
}

export function useTimerState(): TimerState {
  const t = useLiveQuery(() => getKV<TimerState>('timer', IDLE_TIMER), [])
  return t ?? IDLE_TIMER
}

export function useRestTimer() {
  const timer = useTimerState()
  // useNow only forces re-renders; the value shown is always computed from the
  // real clock and the stored end timestamp, never from a stale tick.
  useNow(timer.status === 'running' ? 250 : 1000, timer.status !== 'idle')
  const now = Date.now()
  return { timer, remaining: remainingMs(timer, now), now }
}

export function useExercises(): Map<string, Exercise> | undefined {
  const list = useLiveQuery(() => db.exercises.toArray(), [])
  if (!list) return undefined
  return new Map(list.map((e) => [e.id, e]))
}

/** Image URLs for an exercise: the user's own photo wins, then bundled images, else placeholder. */
export function useExerciseImages(ex: Exercise | undefined): { urls: string[]; thumb: string; custom: boolean; placeholder: boolean } {
  const custom = useLiveQuery(() => (ex ? db.customImages.get(ex.id) : undefined), [ex?.id])
  const [objUrl, setObjUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!custom) {
      setObjUrl(null)
      return
    }
    const u = URL.createObjectURL(custom.blob)
    setObjUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [custom])
  if (objUrl) return { urls: [objUrl], thumb: objUrl, custom: true, placeholder: false }
  if (ex && ex.images.length) {
    const urls = ex.images.map(exerciseImageUrl)
    return { urls, thumb: ex.thumb ? exerciseImageUrl(ex.thumb) : urls[0], custom: false, placeholder: false }
  }
  const ph = exerciseImageUrl('placeholder.svg')
  return { urls: [ph], thumb: ph, custom: false, placeholder: true }
}
