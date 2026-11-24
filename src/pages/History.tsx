import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Btn, Card, Empty, PageTitle, Section, toast, toastError } from '../components/ui'
import { db } from '../db/db'
import { useExercises } from '../lib/hooks'
import { deleteSession, mutateSession, updateSetValues } from '../lib/session'
import { summarize } from '../lib/stats'
import { fmtDate, fmtDuration, fmtNum, fmtTime, WEEKDAY_SHORT } from '../lib/util'
import { SetRow } from './ActiveWorkout'
import { SummaryView } from './WorkoutSummary'

export function HistoryList() {
  const sessions = useLiveQuery(() => db.sessions.orderBy('startedAt').reverse().filter((s) => s.status === 'completed').toArray(), [])
  const exMap = useExercises()
  const [filter, setFilter] = useState<number | ''>('')
  if (!sessions || !exMap) return <p>Loading…</p>
  const list = filter === '' ? sessions : sessions.filter((s) => s.weekday === filter)
  return (
    <div>
      <PageTitle sub={`${sessions.length} completed workouts`}>Workout History</PageTitle>
      <select className="mb-3 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2" value={filter} onChange={(e) => setFilter(e.target.value === '' ? '' : Number(e.target.value))} aria-label="Filter by routine day">
        <option value="">All workouts</option>
        {[1, 2, 3, 5, 6, 4, 7].map((d) => (
          <option key={d} value={d}>
            {WEEKDAY_SHORT[d as 1]} workouts only
          </option>
        ))}
      </select>
      {list.length === 0 ? (
        <Empty>No completed workouts yet. Finished workouts appear here.</Empty>
      ) : (
        <ul className="space-y-2" data-testid="history-list">
          {list.map((s) => {
            const sum = summarize(s, exMap)
            return (
              <li key={s.id}>
                <Link to={`/history/${s.id}`} className="block rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="font-semibold">{s.name}</span>
                    <span className="text-sm text-slate-500">{fmtDate(s.startedAt)}</span>
                  </div>
                  <div className="text-sm text-slate-600">
                    {fmtDuration(sum.durationMs)} · {sum.completedSets} sets · {sum.totalReps} reps · {fmtNum(sum.volume, 0)} kg volume
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
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
  if (session === undefined || !exMap) return <p>Loading…</p>
  if (session === null) return <p>Workout not found.</p>
  if (session.status !== 'completed')
    return (
      <p>
        This workout is still in progress. <Link to={`/workout/${session.id}`}>Resume it</Link>
      </p>
    )
  return (
    <div>
      <Link to="/history" className="text-sm text-slate-600">
        ‹ History
      </Link>
      <PageTitle sub={`${fmtDate(session.startedAt)} · ${fmtTime(session.startedAt)}`}>{session.name}</PageTitle>
      <SummaryView session={session} exMap={exMap} now={Date.now()} />

      <Section title="Edit logged sets" right={<Btn small onClick={() => setEditing((e) => !e)}>{editing ? 'Done editing' : 'Edit'}</Btn>}>
        {editing ? (
          <div className="space-y-3">
            {session.exercises.map((e, i) => {
              const ex = exMap.get(e.exerciseId)
              if (!ex) return null
              return (
                <Card key={e.id}>
                  <div className="mb-2 font-semibold">{ex.name}</div>
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
                </Card>
              )
            })}
            <p className="text-xs text-slate-500">Changes are saved immediately. Sets marked “pending” here count as not done.</p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Fix a typo in weight or reps after the fact.</p>
        )}
      </Section>

      <Btn
        variant="danger"
        className="mt-6 w-full"
        onClick={() => {
          if (!window.confirm('Delete this workout from history? Its sets will no longer count toward progress or previous weights. This cannot be undone.')) return
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
