import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router'
import { Btn, Card, PageTitle, Section, toast, toastError } from '../components/ui'
import { db, getKV } from '../db/db'
import type { RoutineDay, Session, Weekday } from '../db/types'
import { requestPersistentStorage } from '../lib/device'
import { useExercises } from '../lib/hooks'
import { discardSession, startSession } from '../lib/session'
import { fmtDate, fmtTime, isoWeekday, localDate, startOfWeek, WEEKDAY_NAMES, WEEKDAY_SHORT } from '../lib/util'

export function useStartWorkout() {
  const nav = useNavigate()
  return (weekday: Weekday) => {
    void requestPersistentStorage()
    startSession(weekday)
      .then((id) => nav(`/workout/${id}`))
      .catch(toastError)
  }
}

function UnfinishedCard({ session }: { session: Session }) {
  const nav = useNavigate()
  const done = session.exercises.reduce((n, e) => n + e.sets.filter((s) => s.status === 'completed').length, 0)
  const total = session.exercises.reduce((n, e) => n + e.sets.length, 0)
  return (
    <Card className="border-amber-300 bg-amber-50" >
      <div data-testid="unfinished-card">
        <div className="text-sm font-medium text-amber-900">Unfinished workout</div>
        <div className="text-lg font-bold">{session.name}</div>
        <div className="text-sm text-slate-700">
          Started {fmtDate(session.startedAt)} at {fmtTime(session.startedAt)} · {done}/{total} sets done
        </div>
        <div className="mt-3 flex gap-2">
          <Btn variant="primary" className="flex-1" onClick={() => nav(`/workout/${session.id}`)}>
            Resume workout
          </Btn>
          <Btn
            variant="danger"
            onClick={() => {
              if (!window.confirm(`Discard the unfinished ${session.name} workout and all sets logged in it? This cannot be undone.`)) return
              discardSession(session.id)
                .then(() => toast('Workout discarded.'))
                .catch(toastError)
            }}
          >
            Discard
          </Btn>
        </div>
      </div>
    </Card>
  )
}

function WeekDots({ days, sessions }: { days: RoutineDay[]; sessions: Session[] }) {
  const training = days.filter((d) => !d.isRest && d.items.length > 0)
  const doneDays = new Set(sessions.map((s) => s.weekday))
  const count = training.filter((d) => doneDays.has(d.weekday)).length
  return (
    <div>
      <div className="text-lg font-semibold" data-testid="week-count">
        {count} of {training.length} workouts done this week
      </div>
      <div className="mt-2 flex gap-1.5">
        {days.map((d) => (
          <div
            key={d.weekday}
            className={`flex h-10 flex-1 flex-col items-center justify-center rounded text-xs ${
              d.isRest ? 'bg-slate-100 text-slate-400' : doneDays.has(d.weekday) ? 'bg-emerald-600 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-300'
            }`}
            title={d.name}
          >
            <span>{WEEKDAY_SHORT[d.weekday]}</span>
            <span>{d.isRest ? 'rest' : doneDays.has(d.weekday) ? '✓' : ''}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Home() {
  const today = isoWeekday()
  const days = useLiveQuery(() => db.routineDays.orderBy('weekday').toArray(), [])
  const inProgress = useLiveQuery(() => db.sessions.where('status').equals('in_progress').first(), [])
  const weekStart = startOfWeek().getTime()
  const weekSessions = useLiveQuery(
    () => db.sessions.where('startedAt').aboveOrEqual(weekStart).filter((s) => s.status === 'completed').toArray(),
    [weekStart],
  )
  const plans = useLiveQuery(() => db.cardioPlans.toArray(), [])
  const todayStr = localDate()
  const cardioToday = useLiveQuery(() => db.cardioLogs.where('date').equals(todayStr).toArray(), [todayStr])
  const completedCount = useLiveQuery(() => db.sessions.where('status').equals('completed').count(), [])
  const lastBackup = useLiveQuery(() => getKV<number | null>('lastBackupAt', null), [])
  const exMap = useExercises()
  const start = useStartWorkout()

  if (!days) return <p>Loading…</p>
  const todayPlan = days.find((d) => d.weekday === today)
  const todaysPlans = (plans ?? []).filter((p) => p.days.includes(today))
  const backupDue = (completedCount ?? 0) > 0 && (!lastBackup || Date.now() - lastBackup > 14 * 86400000)

  return (
    <div>
      <PageTitle sub={fmtDate(Date.now(), { weekday: 'long', day: 'numeric', month: 'long' })}>Gym Companion</PageTitle>

      {inProgress && <UnfinishedCard session={inProgress} />}

      <Section title={`Today · ${WEEKDAY_NAMES[today]}`}>
        {todayPlan && !todayPlan.isRest && todayPlan.items.length > 0 ? (
          <Card>
            <div className="text-xl font-bold" data-testid="today-name">
              {todayPlan.name}
            </div>
            <div className="text-sm text-slate-600">{todayPlan.focus}</div>
            <ol className="mt-2 ml-5 list-decimal text-sm text-slate-700">
              {todayPlan.items.map((i) => (
                <li key={i.id}>{exMap?.get(i.exerciseId)?.name ?? i.exerciseId}</li>
              ))}
            </ol>
            {inProgress ? (
              <p className="mt-3 text-sm text-slate-600">Finish or discard the unfinished workout to start a new one.</p>
            ) : (
              <Btn variant="primary" className="mt-3 w-full" onClick={() => start(today)} data-testid="start-today">
                Start {todayPlan.name} workout
              </Btn>
            )}
          </Card>
        ) : (
          <Card>
            <div className="text-xl font-bold">Rest day</div>
            <p className="text-sm text-slate-600">Recover today. You can still start any workout below.</p>
          </Card>
        )}
      </Section>

      {!inProgress && (
        <Section title="Start a different day">
          <div className="grid grid-cols-2 gap-2">
            {days
              .filter((d) => !d.isRest && d.items.length > 0 && d.weekday !== today)
              .map((d) => (
                <Btn key={d.weekday} onClick={() => start(d.weekday)} data-testid={`start-day-${d.weekday}`}>
                  {WEEKDAY_SHORT[d.weekday]} · {d.name}
                </Btn>
              ))}
          </div>
        </Section>
      )}

      <Section title="Today's cardio" right={<Link to="/cardio" className="text-sm text-emerald-700">Cardio log ›</Link>}>
        {todaysPlans.length === 0 ? (
          <p className="text-sm text-slate-500">No cardio planned today.</p>
        ) : (
          <ul className="space-y-2">
            {todaysPlans.map((p) => {
              const log = cardioToday?.find((l) => l.planId === p.id)
              return (
                <li key={p.id}>
                  <Link to={`/cardio?plan=${p.id}`} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3">
                    <span>
                      <span className="font-medium">{p.name}</span>
                      <span className="block text-xs text-slate-500">
                        {p.durationMin} min{p.incline !== undefined ? ` · incline ${p.incline}` : ''}
                        {p.speedKmh !== undefined ? ` · ${p.speedKmh} km/h` : ''}
                      </span>
                    </span>
                    <span className={`text-sm font-medium ${log?.completed ? 'text-emerald-700' : log ? 'text-slate-600' : 'text-slate-400'}`}>
                      {log ? (log.completed ? '✓ Done' : 'Not done') : 'Log ›'}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      <Section title="This week">
        <Card>
          <WeekDots days={days} sessions={weekSessions ?? []} />
          <p className="mt-2 text-sm text-slate-600">Total completed workouts: {completedCount ?? 0}</p>
        </Card>
      </Section>

      {backupDue && (
        <Section title="Data safety">
          <Card className="border-sky-300 bg-sky-50">
            <p className="text-sm">
              {lastBackup ? `Last backup: ${fmtDate(lastBackup)}.` : 'You have not backed up yet.'} Your data lives only on this device.
            </p>
            <Link to="/settings" className="mt-2 inline-block font-medium text-sky-800 underline">
              Back up now
            </Link>
          </Card>
        </Section>
      )}
    </div>
  )
}
