import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate, useParams } from 'react-router'
import { Btn, Card, toast, toastError } from '../components/ui'
import { db } from '../db/db'
import type { Exercise, Session } from '../db/types'
import { useExercises, useNow } from '../lib/hooks'
import { discardSession, finishSession } from '../lib/session'
import { previousSessionForDay, summarize, type SessionSummary } from '../lib/stats'
import { fmtDate, fmtDuration, fmtNum, fmtTime } from '../lib/util'

export function SummaryView({ session, exMap, now }: { session: Session; exMap: Map<string, Exercise>; now: number }) {
  const prev = useLiveQuery(() => previousSessionForDay(session), [session.id, session.weekday, session.startedAt])
  const sum = summarize(session, exMap, now)
  const prevSum = prev ? summarize(prev, exMap) : null
  const done = session.exercises.filter((e) => e.sets.some((s) => s.status === 'completed'))
  return (
    <div className="space-y-3" data-testid="summary">
      <Card>
        <h2 className="text-xl font-bold">{session.name}</h2>
        <p className="text-slate-600">{session.focus}</p>
        <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-slate-500">Started</dt>
          <dd>
            {fmtDate(session.startedAt)} {fmtTime(session.startedAt)}
          </dd>
          <dt className="text-slate-500">Finished</dt>
          <dd>{session.finishedAt ? fmtTime(session.finishedAt) : `${fmtTime(now)} (if you finish now)`}</dd>
          <dt className="text-slate-500">Duration</dt>
          <dd>{fmtDuration(sum.durationMs)}</dd>
          <dt className="text-slate-500">Exercises done</dt>
          <dd data-testid="sum-exercises">
            {sum.completedExercises} of {session.exercises.length}
          </dd>
          <dt className="text-slate-500">Completed sets</dt>
          <dd data-testid="sum-sets">{sum.completedSets}</dd>
          <dt className="text-slate-500">Total reps</dt>
          <dd data-testid="sum-reps">{sum.totalReps}</dd>
          {sum.totalSeconds > 0 && (
            <>
              <dt className="text-slate-500">Timed holds</dt>
              <dd>{sum.totalSeconds} s</dd>
            </>
          )}
          <dt className="text-slate-500">Volume (kg × reps)</dt>
          <dd data-testid="sum-volume">{fmtNum(sum.volume, 0)} kg</dd>
        </dl>
      </Card>

      {sum.skippedExercises.length > 0 && (
        <Card>
          <h3 className="font-semibold">Skipped or not done</h3>
          <ul className="mt-1 ml-5 list-disc text-sm">
            {sum.skippedExercises.map((e) => (
              <li key={e.id}>{exMap.get(e.exerciseId)?.name ?? e.exerciseId}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h3 className="font-semibold">Compared with last {session.name}</h3>
        {prev && prevSum ? <Comparison cur={sum} prev={prevSum} prevDate={prev.startedAt} /> : <p className="text-sm text-slate-500">No previous {session.name} workout to compare with.</p>}
      </Card>

      <Card>
        <h3 className="font-semibold">Exercises</h3>
        <ul className="mt-1 space-y-2 text-sm">
          {done.map((e) => {
            const ex = exMap.get(e.exerciseId)
            return (
              <li key={e.id}>
                <div className="font-medium">
                  {ex?.name}
                  {e.exerciseId !== e.plannedExerciseId && <span className="text-xs font-normal text-amber-800"> (instead of {exMap.get(e.plannedExerciseId)?.name})</span>}
                </div>
                <div className="text-slate-600 tabular-nums">
                  {e.sets
                    .filter((s) => s.status === 'completed')
                    .map((s) => (ex?.logType === 'time' ? `${s.weight ? `+${fmtNum(s.weight)}kg ` : ''}${s.reps}s` : `${s.weight === null ? 'BW' : fmtNum(s.weight)}×${s.reps}`))
                    .join(', ')}
                </div>
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}

function delta(a: number, b: number, unit = '') {
  const d = a - b
  if (d === 0) return <span className="text-slate-500">same</span>
  return <span className={d > 0 ? 'text-emerald-700' : 'text-red-700'}>{`${d > 0 ? '+' : ''}${fmtNum(d, 0)}${unit}`}</span>
}

function Comparison({ cur, prev, prevDate }: { cur: SessionSummary; prev: SessionSummary; prevDate: number }) {
  return (
    <table className="mt-2 w-full text-sm" data-testid="comparison">
      <thead>
        <tr className="text-left text-slate-500">
          <th className="font-normal" />
          <th className="font-normal">Today</th>
          <th className="font-normal">{fmtDate(prevDate, { day: 'numeric', month: 'short' })}</th>
          <th className="font-normal">Change</th>
        </tr>
      </thead>
      <tbody className="tabular-nums">
        <tr>
          <td>Volume</td>
          <td>{fmtNum(cur.volume, 0)}</td>
          <td>{fmtNum(prev.volume, 0)}</td>
          <td>{delta(cur.volume, prev.volume, ' kg')}</td>
        </tr>
        <tr>
          <td>Sets</td>
          <td>{cur.completedSets}</td>
          <td>{prev.completedSets}</td>
          <td>{delta(cur.completedSets, prev.completedSets)}</td>
        </tr>
        <tr>
          <td>Reps</td>
          <td>{cur.totalReps}</td>
          <td>{prev.totalReps}</td>
          <td>{delta(cur.totalReps, prev.totalReps)}</td>
        </tr>
        <tr>
          <td>Duration</td>
          <td>{fmtDuration(cur.durationMs)}</td>
          <td>{fmtDuration(prev.durationMs)}</td>
          <td>{delta(Math.round(cur.durationMs / 60000), Math.round(prev.durationMs / 60000), ' min')}</td>
        </tr>
      </tbody>
    </table>
  )
}

export default function WorkoutSummary() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const session = useLiveQuery(() => db.sessions.get(id).then((s) => s ?? null), [id])
  const exMap = useExercises()
  const now = useNow(30000)
  if (session === undefined || !exMap) return <p className="p-4">Loading…</p>
  if (session === null)
    return (
      <p className="p-4">
        Workout not found. <Link to="/">Home</Link>
      </p>
    )

  const pending = session.exercises.reduce((n, e) => n + (e.skipped ? 0 : e.sets.filter((s) => s.status === 'pending').length), 0)

  return (
    <div className="px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <Link to={`/workout/${session.id}`} className="text-sm text-slate-600">
          ‹ Back to workout
        </Link>
        <h1 className="text-lg font-semibold">Finish workout</h1>
      </div>
      <SummaryView session={session} exMap={exMap} now={now} />
      {pending > 0 && <p className="mt-3 rounded bg-amber-50 p-2 text-sm text-amber-900">{pending} planned sets are not completed. They will be saved as not done.</p>}
      <div className="mt-4 space-y-2">
        <Btn
          variant="primary"
          className="w-full"
          data-testid="save-finish"
          onClick={() => {
            finishSession(session.id)
              .then(() => {
                toast('Workout saved.', 'success')
                nav(`/history/${session.id}`, { replace: true })
              })
              .catch(toastError)
          }}
        >
          Save and finish workout
        </Btn>
        <Btn className="w-full" onClick={() => nav(`/workout/${session.id}`)}>
          Keep training
        </Btn>
        <Btn className="w-full" onClick={() => nav('/')}>
          Leave unfinished (resume later)
        </Btn>
        <Btn
          variant="danger"
          className="w-full"
          onClick={() => {
            if (!window.confirm('Discard this workout? All sets logged in it will be deleted. This cannot be undone.')) return
            discardSession(session.id)
              .then(() => {
                toast('Workout discarded.')
                nav('/', { replace: true })
              })
              .catch(toastError)
          }}
        >
          Discard workout
        </Btn>
      </div>
    </div>
  )
}
