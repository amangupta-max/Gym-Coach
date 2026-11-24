import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { IconChevronLeft } from '../components/icons'
import { Btn, Empty, Group, PageTitle, Section, toast, toastError } from '../components/ui'
import { db } from '../db/db'
import type { Weekday } from '../db/types'
import { useExercises } from '../lib/hooks'
import { deleteSession, mutateSession, updateSetValues } from '../lib/session'
import { summarize } from '../lib/stats'
import { fmtDate, fmtDuration, fmtNum, fmtTime } from '../lib/util'
import { SetRow } from './ActiveWorkout'
import { ProgressTabs } from './Progress'
import { SummaryView } from './WorkoutSummary'

export function HistoryList() {
  const sessions = useLiveQuery(() => db.sessions.orderBy('startedAt').reverse().filter((s) => s.status === 'completed').toArray(), [])
  const days = useLiveQuery(() => db.routineDays.orderBy('weekday').toArray(), [])
  const exMap = useExercises()
  const [filter, setFilter] = useState<Weekday | 0>(0)
  if (!sessions || !exMap || !days) return null
  const list = filter === 0 ? sessions : sessions.filter((s) => s.weekday === filter)
  const used = days.filter((d) => sessions.some((s) => s.weekday === d.weekday))
  const chip = (value: Weekday | 0, label: string) => (
    <button
      key={value}
      type="button"
      onClick={() => setFilter(value)}
      aria-pressed={filter === value}
      className={`h-9 shrink-0 rounded-full px-4 text-[14px] font-medium ${filter === value ? 'bg-iris-600 text-white' : 'bg-ink-900 text-ink-300'}`}
    >
      {label}
    </button>
  )
  return (
    <div>
      <PageTitle>Progress</PageTitle>
      <ProgressTabs />
      {used.length > 1 && (
        <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Filter by workout">
          {chip(0, 'All')}
          {used.map((d) => chip(d.weekday, d.name))}
        </div>
      )}
      {list.length === 0 ? (
        <Empty>Saved workouts show up here.</Empty>
      ) : (
        <Group>
          <div className="divide-y divide-ink-800" data-testid="history-list">
            {list.map((s) => {
              const sum = summarize(s, exMap)
              return (
                <Link key={s.id} to={`/history/${s.id}`} className="block px-4 py-3.5 active:bg-ink-850">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold text-ink-100">{s.name}</span>
                    <span className="text-[14px] text-ink-400">{fmtDate(s.startedAt)}</span>
                  </span>
                  <span className="mt-0.5 block text-[14px] text-ink-400 tabular-nums">
                    {fmtDuration(sum.durationMs)}, {sum.completedSets} sets, {fmtNum(sum.volume, 0)} kg
                  </span>
                </Link>
              )
            })}
          </div>
        </Group>
      )}
    </div>
  )
}

export function HistoryDetail() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const session = useLiveQuery(() => db.sessions.get(id).then((s) => s ?? null), [id])
  const exMap = useExercises()
  const [editing, setEditing] = useState(false)
  if (session === undefined || !exMap) return null
  if (session === null) return <p>Workout not found.</p>
  if (session.status !== 'completed')
    return (
      <p>
        This workout is still in progress.{' '}
        <Link className="text-iris-300" to={`/workout/${session.id}`}>
          Resume it
        </Link>
      </p>
    )
  return (
    <div>
      <Link to="/history" className="-ml-2 mb-3 inline-flex h-10 items-center gap-1 rounded-full pr-3 pl-1 text-[15px] text-ink-300 active:bg-ink-800">
        <IconChevronLeft size={20} />
        History
      </Link>
      <SummaryView session={session} exMap={exMap} now={Date.now()} />

      <Section title="Fix a logged set" right={<Btn small variant={editing ? 'primary' : 'secondary'} onClick={() => setEditing((e) => !e)}>{editing ? 'Done' : 'Edit'}</Btn>}>
        {editing ? (
          <div className="space-y-4">
            {session.exercises.map((e, i) => {
              const ex = exMap.get(e.exerciseId)
              if (!ex) return null
              return (
                <div key={e.id}>
                  <div className="mb-2 px-1 font-semibold">{ex.name}</div>
                  <ol className="space-y-2">
                    {e.sets.map((set, j) => (
                      <SetRow
                        key={set.id}
                        n={j + 1}
                        set={set}
                        logType={ex.logType}
                        onWeight={(v) => void updateSetValues(session.id, i, set.id, { weight: v }).catch(toastError)}
                        onReps={(v) => void updateSetValues(session.id, i, set.id, { reps: v }).catch(toastError)}
                        onComplete={() =>
                          void mutateSession(session.id, (s) => {
                            const t = s.exercises[i].sets[j]
                            if (t.reps === null || t.reps <= 0) throw new Error('Enter reps first.')
                            t.status = 'completed'
                            t.completedAt = t.completedAt ?? session.finishedAt ?? Date.now()
                          }).catch(toastError)
                        }
                        onSkip={() =>
                          void mutateSession(session.id, (s) => {
                            s.exercises[i].sets[j].status = 'skipped'
                          }).catch(toastError)
                        }
                        onUndo={() =>
                          void mutateSession(session.id, (s) => {
                            s.exercises[i].sets[j].status = 'pending'
                          }).catch(toastError)
                        }
                      />
                    ))}
                  </ol>
                </div>
              )
            })}
            <p className="px-1 text-[14px] text-ink-500">Changes save as you type. Sets without a tick count as not done.</p>
          </div>
        ) : (
          <p className="px-1 text-[15px] text-ink-400">
            Logged {fmtDate(session.startedAt)} at {fmtTime(session.startedAt)}. Edit to correct a typo in weight or reps.
          </p>
        )}
      </Section>

      <Btn
        variant="ghost"
        className="mt-8 w-full text-rose-400"
        onClick={() => {
          if (!window.confirm('Delete this workout? Its sets will no longer count toward progress or previous weights. This cannot be undone.')) return
          deleteSession(session.id)
            .then(() => {
              toast('Workout deleted.')
              nav('/history', { replace: true })
            })
            .catch(toastError)
        }}
      >
        Delete workout
      </Btn>
    </div>
  )
}
