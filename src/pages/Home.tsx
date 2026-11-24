import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router'
import { IconCheck, IconChevronRight, IconShield } from '../components/icons'
import { Btn, Group, Section, Stat, toast, toastError } from '../components/ui'
import { db, getKV } from '../db/db'
import type { RoutineDay, Session, Weekday } from '../db/types'
import { requestPersistentStorage } from '../lib/device'
import { useExercises } from '../lib/hooks'
import { discardSession, startSession } from '../lib/session'
import { fmtDate, fmtTime, isoWeekday, localDate, rangeText, startOfWeek, WEEKDAY_SHORT } from '../lib/util'

export function useStartWorkout() {
  const nav = useNavigate()
  return (weekday: Weekday) => {
    void requestPersistentStorage()
    startSession(weekday)
      .then((id) => nav(`/workout/${id}`))
      .catch(toastError)
  }
}

/** Rough session length: each set takes ~40 s of work plus its rest. */
export function estimateMinutes(day: RoutineDay): number {
  const sec = day.items.reduce((n, i) => n + i.sets * (40 + i.restSec), 0)
  return Math.max(5, Math.round(sec / 60 / 5) * 5)
}

function InProgressHero({ session }: { session: Session }) {
  const nav = useNavigate()
  const done = session.exercises.reduce((n, e) => n + e.sets.filter((s) => s.status === 'completed').length, 0)
  const total = session.exercises.reduce((n, e) => n + e.sets.length, 0)
  return (
    <div data-testid="unfinished-card">
      <p className="text-[15px] text-iris-300">Workout in progress</p>
      <h1 className="display mt-1 text-[48px] leading-[1]">{session.name}</h1>
      <p className="mt-2 text-ink-300">
        Started {fmtDate(session.startedAt)} at {fmtTime(session.startedAt)}
      </p>
      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-ink-800">
        <div className="bg-drive h-full rounded-full" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
      <p className="mt-2 text-[14px] text-ink-400">
        {done} of {total} sets logged
      </p>
      <div className="mt-6 flex gap-2">
        <Btn variant="primary" className="h-14 flex-1 text-[17px]" onClick={() => nav(`/workout/${session.id}`)}>
          Resume workout
        </Btn>
        <Btn
          variant="ghost"
          className="h-14"
          onClick={() => {
            if (!window.confirm(`Discard the unfinished ${session.name} workout and every set logged in it? This can't be undone.`)) return
            discardSession(session.id)
              .then(() => toast('Workout discarded.'))
              .catch(toastError)
          }}
        >
          Discard
        </Btn>
      </div>
    </div>
  )
}

function WeekStrip({ days, sessions }: { days: RoutineDay[]; sessions: Session[] }) {
  const today = isoWeekday()
  const training = days.filter((d) => !d.isRest && d.items.length > 0)
  const done = new Set(sessions.map((s) => s.weekday))
  const count = training.filter((d) => done.has(d.weekday)).length
  return (
    <div className="rounded-2xl bg-ink-900 p-4">
      <div className="flex items-baseline justify-between">
        <span className="font-semibold" data-testid="week-count">
          {count} of {training.length} workouts done this week
        </span>
      </div>
      <ol className="mt-4 grid grid-cols-7 gap-1">
        {days.map((d) => {
          const isDone = done.has(d.weekday)
          const rest = d.isRest || d.items.length === 0
          return (
            <li key={d.weekday} className="flex flex-col items-center gap-2" title={d.name}>
              <span className={`text-[13px] font-medium ${d.weekday === today ? 'text-iris-300' : 'text-ink-400'}`}>{WEEKDAY_SHORT[d.weekday].slice(0, 1)}</span>
              {isDone ? (
                <span className="bg-drive flex h-8 w-8 items-center justify-center rounded-full" aria-label={`${d.name} done`}>
                  <IconCheck size={15} />
                </span>
              ) : rest ? (
                <span className="flex h-8 w-8 items-center justify-center" aria-label="Rest day">
                  <span className="h-1 w-3 rounded-full bg-ink-700" />
                </span>
              ) : (
                <span className={`h-8 w-8 rounded-full border-2 ${d.weekday === today ? 'border-iris-500' : 'border-ink-700'}`} aria-label={`${d.name} not done`} />
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export default function Home() {
  const today = isoWeekday()
  const days = useLiveQuery(() => db.routineDays.orderBy('weekday').toArray(), [])
  const inProgress = useLiveQuery(() => db.sessions.where('status').equals('in_progress').first().then((s) => s ?? null), [])
  const weekStart = startOfWeek().getTime()
  const weekSessions = useLiveQuery(() => db.sessions.where('startedAt').aboveOrEqual(weekStart).filter((s) => s.status === 'completed').toArray(), [weekStart])
  const plans = useLiveQuery(() => db.cardioPlans.toArray(), [])
  const todayStr = localDate()
  const cardioToday = useLiveQuery(() => db.cardioLogs.where('date').equals(todayStr).toArray(), [todayStr])
  const completedCount = useLiveQuery(() => db.sessions.where('status').equals('completed').count(), [])
  const lastBackup = useLiveQuery(() => getKV<number | null>('lastBackupAt', null), [])
  const exMap = useExercises()
  const start = useStartWorkout()

  if (!days || inProgress === undefined) return null
  const plan = days.find((d) => d.weekday === today)
  const isTraining = !!plan && !plan.isRest && plan.items.length > 0
  const todaysPlans = (plans ?? []).filter((p) => p.days.includes(today))
  const others = days.filter((d) => !d.isRest && d.items.length > 0 && d.weekday !== today)
  const backupDue = (completedCount ?? 0) > 0 && (!lastBackup || Date.now() - lastBackup > 14 * 86400000)

  return (
    <div>
      <div className="bg-aura pointer-events-none absolute inset-x-0 top-0 -z-10 h-[460px]" />
      <p className="px-1 text-[15px] text-ink-300">{fmtDate(Date.now(), { weekday: 'long', day: 'numeric', month: 'long' })}</p>

      <div className="mt-4 px-1">
        {inProgress ? (
          <InProgressHero session={inProgress} />
        ) : isTraining && plan ? (
          <div>
            <h1 className="display text-[56px] leading-[0.95]" data-testid="today-name">
              {plan.name}
            </h1>
            <p className="mt-2 text-[17px] text-ink-300">{plan.focus}</p>
            <div className="mt-6 grid grid-cols-3 gap-3">
              <Stat value={plan.items.length} label="exercises" />
              <Stat value={plan.items.reduce((n, i) => n + i.sets, 0)} label="sets" />
              <Stat value={estimateMinutes(plan)} label="minutes" />
            </div>
            <Btn variant="primary" className="mt-7 h-14 w-full text-[17px]" onClick={() => start(today)} data-testid="start-today">
              Start workout
            </Btn>
          </div>
        ) : (
          <div>
            <h1 className="display text-[56px] leading-[0.95]">Rest day</h1>
            <p className="mt-2 text-[17px] text-ink-300">Recovery is part of the plan. You can still train another day's session below.</p>
          </div>
        )}
      </div>

      {!inProgress && isTraining && plan && (
        <Group className="mt-8">
          {plan.items.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-ink-100">{exMap?.get(i.exerciseId)?.name ?? i.exerciseId}</span>
              <span className="shrink-0 text-[14px] text-ink-400 tabular-nums">
                {i.sets} × {rangeText(i.repMin, i.repMax, exMap?.get(i.exerciseId)?.logType === 'time' ? 's' : '').trim()}
              </span>
            </div>
          ))}
        </Group>
      )}

      {!inProgress && others.length > 0 && (
        <Section title="Train another day">
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
            {others.map((d) => (
              <Link
                key={d.weekday}
                to={`/routine/${d.weekday}`}
                className="shrink-0 rounded-2xl bg-ink-900 px-4 py-3 active:bg-ink-800"
                data-testid={`start-day-${d.weekday}`}
              >
                <span className="block text-[13px] text-ink-400">{WEEKDAY_SHORT[d.weekday]}</span>
                <span className="block font-semibold">{d.name}</span>
              </Link>
            ))}
          </div>
        </Section>
      )}

      <Section title="This week">
        <WeekStrip days={days} sessions={weekSessions ?? []} />
      </Section>

      <Section title="Cardio" right={<Link to="/cardio" className="text-[15px] text-iris-300">Log</Link>}>
        {todaysPlans.length === 0 ? (
          <p className="px-1 text-ink-400">Nothing planned today.</p>
        ) : (
          <Group>
            {todaysPlans.map((p) => {
              const log = cardioToday?.find((l) => l.planId === p.id)
              return (
                <Link key={p.id} to={`/cardio?plan=${p.id}`} className="flex items-center gap-3 px-4 py-3.5 active:bg-ink-850">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${log?.completed ? 'bg-drive' : 'border-2 border-ink-600'}`}
                    aria-label={log?.completed ? 'Done' : 'Not done'}
                  >
                    {log?.completed && <IconCheck size={14} />}
                  </span>
                  <span className="flex-1">
                    <span className="block text-ink-100">{p.name}</span>
                    <span className="block text-[14px] text-ink-400">
                      {p.durationMin} min
                      {p.incline !== undefined ? `, incline ${p.incline}` : ''}
                      {p.speedKmh !== undefined ? `, ${p.speedKmh} km/h` : ''}
                      {log && !log.completed ? ', marked not done' : ''}
                    </span>
                  </span>
                  <IconChevronRight size={18} className="text-ink-500" />
                </Link>
              )
            })}
          </Group>
        )}
      </Section>

      {backupDue && (
        <Link to="/settings" className="mt-8 flex items-center gap-3 rounded-2xl border border-ink-800 px-4 py-3.5 active:bg-ink-900">
          <IconShield className="shrink-0 text-iris-300" />
          <span className="flex-1 text-[15px] text-ink-200">
            {lastBackup ? `Last backup ${fmtDate(lastBackup)}.` : 'No backup yet.'} Your workouts live only on this phone.
          </span>
          <span className="text-[15px] font-semibold text-iris-300">Back up</span>
        </Link>
      )}
    </div>
  )
}
