import { useEffect, useRef, useState } from 'react'
import { playBeep, vibrate } from '../lib/device'
import { updateSettings, useRestTimer, useSettings } from '../lib/hooks'
import { adjustTimer, markFinishedIfDue, pauseTimer, resetTimer, resumeTimer, setTimerRemaining, skipTimer } from '../lib/timer'
import { fmtClock, parseNum } from '../lib/util'
import { IconChevronDown, IconPause, IconPlay, IconRestart } from './icons'
import { act } from './ui'

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

const chip = 'min-h-10 rounded-full bg-white/12 px-4 text-[15px] font-semibold text-white active:bg-white/20'

function Ring({ fraction, size = 132, children }: { fraction: number; size?: number; children: React.ReactNode }) {
  const r = size / 2 - 5
  const c = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(255 255 255 / 0.14)" strokeWidth="5" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="white"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, fraction)))}
          style={{ transition: 'stroke-dashoffset 250ms linear' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  )
}

/** The rest dock on the workout screen. `next` describes what comes after the rest. */
export function RestTimerPanel({ next, onVisibleChange }: { next?: { title: string; detail?: string }; onVisibleChange?: (expanded: boolean | null) => void }) {
  const { timer, remaining, now } = useRestTimer()
  const settings = useSettings()
  const [hiddenFor, setHiddenFor] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [manual, setManual] = useState('')
  const key = `${timer.setId ?? 'manual'}-${timer.startedAt ?? 0}`
  const minimized = hiddenFor === key
  const visible = timer.status !== 'idle'

  useEffect(() => {
    onVisibleChange?.(visible ? !minimized : null)
  }, [visible, minimized, onVisibleChange])

  if (!visible) return null

  const finished = timer.status === 'finished' || (timer.status === 'running' && remaining <= 0)
  const overdue = timer.finishedAt ? Math.max(0, now - timer.finishedAt) : 0
  const fraction = timer.durationMs > 0 ? remaining / timer.durationMs : 0
  const time = (
    <span className="num leading-none" data-testid="timer-remaining" data-remaining-ms={Math.round(remaining)}>
      {finished ? '0:00' : fmtClock(remaining)}
    </span>
  )

  if (minimized) {
    return (
      <div
        className="bg-pulse fixed inset-x-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-[calc(32rem-2rem)] items-center gap-2 rounded-full py-2 pr-2 pl-5 shadow-[0_12px_36px_rgb(102_32_208/0.5)]"
        data-testid="rest-timer"
      >
        <button type="button" className="flex flex-1 items-baseline gap-2 text-left" onClick={() => setHiddenFor(null)} aria-label="Show timer">
          <span className="text-[22px]">{time}</span>
          <span className="text-[14px] text-iris-100">{finished ? 'Rest done' : timer.status === 'paused' ? 'Paused' : 'Rest'}</span>
        </button>
        {!finished && (
          <button type="button" className={chip} onClick={act(() => adjustTimer(30))}>
            +30s
          </button>
        )}
        <button type="button" className="min-h-10 rounded-full bg-white px-4 text-[15px] font-semibold text-iris-900" onClick={act(skipTimer)}>
          {finished ? 'Done' : 'Skip'}
        </button>
      </div>
    )
  }

  return (
    <div
      className="bg-pulse fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg rounded-t-[32px] px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-20px_50px_rgb(5_3_8/0.7)]"
      data-testid="rest-timer"
      role="timer"
      aria-label="Rest timer"
    >
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setHiddenFor(key)} aria-label="Hide timer" className="-ml-2 flex h-10 items-center gap-1 rounded-full px-2 text-[15px] text-iris-100 active:bg-white/10">
          <IconChevronDown size={20} />
          Hide
        </button>
        <span className="truncate px-2 text-[14px] text-iris-100">{timer.label}</span>
        <button
          type="button"
          onClick={act(() => updateSettings({ soundEnabled: !settings.soundEnabled }))}
          aria-pressed={settings.soundEnabled}
          className="-mr-2 h-10 rounded-full px-3 text-[14px] text-iris-100 active:bg-white/10"
        >
          Sound {settings.soundEnabled ? 'on' : 'off'}
        </button>
      </div>

      <div className="mt-2 flex items-center gap-5">
        <Ring fraction={finished ? 0 : fraction}>
          <span className="text-[34px] text-white">{time}</span>
        </Ring>
        <div className="min-w-0 flex-1">
          <div className="display text-[26px] leading-tight text-white">{finished ? 'Rest done' : timer.status === 'paused' ? 'Paused' : 'Rest'}</div>
          {finished && overdue > 5000 ? (
            <p className="mt-1 text-[15px] text-iris-100">Ended {fmtClock(overdue)} ago</p>
          ) : next ? (
            <p className="mt-1 text-[15px] leading-snug text-iris-100">
              Next: {next.title}
              {next.detail && <span className="block text-iris-200/80">{next.detail}</span>}
            </p>
          ) : null}
        </div>
      </div>

      {!finished && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" className={chip} onClick={act(() => adjustTimer(-15))}>
            −15s
          </button>
          <button type="button" className={chip} onClick={act(() => adjustTimer(15))}>
            +15s
          </button>
          <button type="button" className={chip} onClick={act(() => adjustTimer(30))}>
            +30s
          </button>
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
                className="num h-10 w-20 rounded-full bg-white/15 px-3 text-center text-white placeholder:text-iris-200/60 focus:outline-none"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="sec"
              />
              <button type="submit" className={chip}>
                Set
              </button>
            </form>
          ) : (
            <button
              type="button"
              className={chip}
              onClick={() => {
                setManual(String(Math.round(remaining / 1000) || Math.round(timer.durationMs / 1000)))
                setEditing(true)
              }}
            >
              Set time
            </button>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        {!finished &&
          (timer.status === 'paused' ? (
            <button type="button" onClick={act(resumeTimer)} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-white/14 font-semibold text-white active:bg-white/20">
              <IconPlay size={18} />
              Resume
            </button>
          ) : (
            <button type="button" onClick={act(pauseTimer)} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-white/14 font-semibold text-white active:bg-white/20">
              <IconPause size={18} />
              Pause
            </button>
          ))}
        <button type="button" onClick={act(resetTimer)} aria-label="Restart rest" className="flex h-12 w-12 items-center justify-center rounded-full bg-white/14 text-white active:bg-white/20">
          <IconRestart size={20} />
        </button>
        <button type="button" onClick={act(skipTimer)} className="h-12 flex-1 rounded-full bg-white font-semibold text-iris-900 active:bg-iris-100">
          {finished ? 'Back to sets' : 'Skip rest'}
        </button>
      </div>
    </div>
  )
}
