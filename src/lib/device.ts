// Sound, vibration, screen wake lock and persistent storage. All optional:
// every function degrades silently when the browser does not support it.

let audioCtx: AudioContext | null = null

/** Must be called from a user gesture (tap) so Android allows audio later. */
export function unlockAudio() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    if (!audioCtx) audioCtx = new Ctx()
    if (audioCtx.state === 'suspended') void audioCtx.resume()
  } catch {
    /* ignore */
  }
}

/** Three short beeps generated locally (no audio files, works offline). */
export function playBeep() {
  try {
    unlockAudio()
    const ctx = audioCtx
    if (!ctx) return
    const t0 = ctx.currentTime + 0.02
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = i === 2 ? 1175 : 880
      const start = t0 + i * 0.28
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.5, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.25)
    }
  } catch {
    /* ignore */
  }
}

export function vibrate(pattern: number | number[] = [250, 120, 250]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* ignore */
  }
}

type WakeLockSentinelLike = { release: () => Promise<void>; released: boolean }
let wakeLock: WakeLockSentinelLike | null = null
let wantWakeLock = false

export function wakeLockSupported(): boolean {
  return 'wakeLock' in navigator
}

async function acquire() {
  if (!wantWakeLock || !wakeLockSupported() || document.visibilityState !== 'visible') return
  if (wakeLock && !wakeLock.released) return
  try {
    wakeLock = await (navigator as unknown as { wakeLock: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } }).wakeLock.request('screen')
  } catch {
    wakeLock = null
  }
}

function onVisibility() {
  if (document.visibilityState === 'visible') void acquire()
}

/** Keep the screen on while a workout is open (the lock is released when the page hides, so re-acquire). */
export function setKeepAwake(on: boolean) {
  wantWakeLock = on
  if (on) {
    document.addEventListener('visibilitychange', onVisibility)
    void acquire()
  } else {
    document.removeEventListener('visibilitychange', onVisibility)
    if (wakeLock && !wakeLock.released) void wakeLock.release().catch(() => {})
    wakeLock = null
  }
}

export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return null
  }
}

export async function storageInfo(): Promise<{ persisted: boolean | null; usage: number | null; quota: number | null }> {
  try {
    const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null
    const est = navigator.storage?.estimate ? await navigator.storage.estimate() : null
    return { persisted, usage: est?.usage ?? null, quota: est?.quota ?? null }
  } catch {
    return { persisted: null, usage: null, quota: null }
  }
}

export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
}
