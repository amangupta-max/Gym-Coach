import { useEffect, useRef, useState } from 'react'
import { playBeep, vibrate } from '../lib/device'
import { updateSettings, useRestTimer, useSettings } from '../lib/hooks'
import { adjustTimer, markFinishedIfDue, pauseTimer, resetTimer, resumeTimer, setTimerRemaining, skipTimer } from '../lib/timer'
import { fmtClock, parseNum } from '../lib/util'
import { act, Btn } from './ui'

/**
 * Mounted once at the app root. Detects when the rest ends (using the stored
 * end timestamp) and plays the alert if the app is on screen at that moment.
 */
export function TimerWatcher() {
  const { timer, remaining } = useRestTimer()
  const settings = useSettings()
  const busy = useRef(false)
  useEffect(() => {
    if (timer.status !== 'running' || remaining > 0 || busy.current) return
    busy.current = true
    markFinishedIfDue()
      .then(({ transitioned, overdueMs }) => {
        // Only alert if we are on screen right when it ends (not when returning much later).
        if (transitioned && overdueMs < 4000 && document.visibilityState === 'visible') {
          if (settings.soundEnabled) playBeep()
          if (settings.vibrationEnabled) vibrate()
        }
      })
      .finally(() => {
        busy.current = false
      })
  }, [timer.status, remaining, settings.soundEnabled, settings.vibrationEnabled])
  return null
}

export function RestTimerPanel() {
  const { timer, remaining, now } = useRestTimer()
  const settings = useSettings()
  const [editing, setEditing] = useState(false)
  const [manual, setManual] = useState('')
  if (timer.status === 'idle') return null

  const finished = timer.status === 'finished' || (timer.status === 'running' && remaining <= 0)
  const overdue = timer.finishedAt ? Math.max(0, now - timer.finishedAt) : 0
  const pct = timer.durationMs > 0 ? Math.min(100, (remaining / timer.durationMs) * 100) : 0

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 border-t px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.08)] ${
        finished ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 bg-white'
      }`}
      data-testid="rest-timer"
    >
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-medium text-slate-500 uppercase">
              {finished ? 'Rest finished' : timer.status === 'paused' ? 'Rest paused' : 'Rest'}
              {timer.label ? ` · ${timer.label}` : ''}
            </div>
            <div className="text-4xl font-bold tabular-nums" data-testid="timer-remaining" data-remaining-ms={Math.round(remaining)}>
              {finished ? 'Go!' : fmtClock(remaining)}
            </div>
            {finished && timer.finishedAt && overdue > 5000 && (
              <div className="text-xs text-slate-600">Ended {fmtClock(overdue)} ago</div>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-1">
            {!finished && timer.status === 'running' && (
              <Btn small onClick={act(pauseTimer)}>
                Pause
              </Btn>
            )}
            {timer.status === 'paused' && (
              <Btn small variant="primary" onClick={act(resumeTimer)}>
                Resume
              </Btn>
            )}
            <Btn small onClick={act(resetTimer)}>
              Reset
            </Btn>
            <Btn small variant={finished ? 'primary' : 'secondary'} onClick={act(skipTimer)}>
              {finished ? 'Dismiss' : 'Skip'}
            </Btn>
          </div>
        </div>
        {!finished && (
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-slate-200">
            <div className="h-full bg-emerald-500 transition-[width] duration-200" style={{ width: `${pct}%` }} />
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <Btn small onClick={act(() => adjustTimer(-15))}>
            −15s
          </Btn>
          <Btn small onClick={act(() => adjustTimer(15))}>
            +15s
          </Btn>
          <Btn small onClick={act(() => adjustTimer(30))}>
            +30s
          </Btn>
          {editing ? (
            <form
              className="flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault()
                const v = parseNum(manual)
                if (v && v > 0) void setTimerRemaining(v)
                setEditing(false)
              }}
            >
              <input
                autoFocus
                inputMode="numeric"
                aria-label="Rest seconds"
                className="min-h-9 w-16 rounded border border-slate-300 px-2 text-center"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="sec"
              />
              <Btn small variant="primary" type="submit">
                Set
              </Btn>
            </form>
          ) : (
            <Btn
              small
              onClick={() => {
                setManual(String(Math.round(remaining / 1000) || Math.round(timer.durationMs / 1000)))
                setEditing(true)
              }}
            >
              Set time
            </Btn>
          )}
          <Btn small variant="ghost" onClick={act(() => updateSettings({ soundEnabled: !settings.soundEnabled }))} aria-pressed={settings.soundEnabled}>
            Sound {settings.soundEnabled ? 'on' : 'off'}
          </Btn>
        </div>
      </div>
    </div>
  )
}
