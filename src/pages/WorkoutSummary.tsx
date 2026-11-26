import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate, useParams } from 'react-router'
import { IconChevronLeft } from '../components/icons'
import { Btn, Group, Loading, Stat, toast, toastError } from '../components/ui'
import { db } from '../db/db'
import type { Exercise, Session } from '../db/types'
import { useExercises, useNow } from '../lib/hooks'
import { discardSession, finishSession } from '../lib/session'
import { previousSessionForDay, summarize, type SessionSummary } from '../lib/stats'
import { compactSet, fmtDate, fmtDuration, fmtNum, fmtTime } from '../lib/util'

export function SummaryView({ session, exMap, now }: { session: Session; exMap: Map<string, Exercise>; now: number }) {
  const prev = useLiveQuery(() => previousSessionForDay(session), [session.id, session.weekday, session.startedAt])
  const sum = summarize(session, exMap, now)
  const prevSum = prev ? summarize(prev, exMap) : null
  const done = session.exercises.filter((e) => e.sets.some((s) => s.status === 'completed'))
  return (
    <div className="space-y-4" data-testid="summary">
      <div className="bg-pulse rounded-[28px] p-5">
        <p className="text-[15px] text-iris-100">
          {fmtDate(session.startedAt)}, {fmtTime(session.startedAt)} to {session.finishedAt ? fmtTime(session.finishedAt) : fmtTime(now)}
        </p>
        <h2 className="display mt-1 text-[40px] leading-none text-white">{session.name}</h2>
        <p className="num mt-4 text-[44px] leading-none text-white">{fmtDuration(sum.durationMs)}</p>
        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/15 pt-4">
          <div>
            <div className="num text-[22px] text-white" data-testid="sum-sets">
              {sum.completedSets}
            </div>
            <div className="text-[13px] text-iris-100">sets</div>
          </div>
          <div>
            <div className="num text-[22px] text-white" data-testid="sum-reps">
              {sum.totalReps}
            </div>
            <div className="text-[13px] text-iris-100">reps</div>
          </div>
          <div>
            <div className="num text-[22px] text-white" data-testid="sum-volume">
              {fmtNum(sum.volume, 0)}
            </div>
            <div className="text-[13px] text-iris-100">kg volume</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-2xl bg-ink-900 p-4">
        <Stat value={`${sum.completedExercises} of ${session.exercises.length}`} label="exercises done" testId="sum-exercises" />
        {sum.totalSeconds > 0 ? <Stat value={`${sum.totalSeconds}s`} label="held in timed sets" /> : <Stat value={sum.skippedSets} label="sets skipped" />}
      </div>

      {sum.skippedExercises.length > 0 && (
        <div className="rounded-2xl bg-ink-900 p-4">
          <h3 className="font-semibold">Skipped or not done</h3>
          <p className="mt-1 text-[15px] leading-relaxed text-ink-300">{sum.skippedExercises.map((e) => exMap.get(e.exerciseId)?.name ?? e.exerciseId).join(', ')}</p>
        </div>
      )}

      <div className="rounded-2xl bg-ink-900 p-4">
        <h3 className="font-semibold">Compared with your last {session.name}</h3>
        {prev && prevSum ? <Comparison cur={sum} prev={prevSum} prevDate={prev.startedAt} /> : <p className="mt-1 text-[15px] text-ink-400">This is your first {session.name}. Next time you'll see the difference here.</p>}
      </div>

      <Group>
        {done.map((e) => {
          const ex = exMap.get(e.exerciseId)
          return (
            <div key={e.id} className="px-4 py-3">
              <div className="font-medium text-ink-100">
                {ex?.name}
                {e.exerciseId !== e.plannedExerciseId && <span className="ml-1 text-[13px] font-normal text-iris-300">instead of {exMap.get(e.plannedExerciseId)?.name}</span>}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[15px] text-ink-300 tabular-nums">
                {e.sets
                  .filter((s) => s.status === 'completed')
                  .map((s) => (
                    <span key={s.id}>{compactSet(s.weight, s.reps, ex?.logType ?? 'weight_reps')}</span>
                  ))}
              </div>
            </div>
          )
        })}
      </Group>
    </div>
  )
}

function delta(a: number, b: number, unit = '') {
  const d = a - b
  if (d === 0) return <span className="text-ink-500">same</span>
  return <span className={d > 0 ? 'text-iris-300' : 'text-rose-400'}>{`${d > 0 ? '+' : ''}${fmtNum(d, 0)}${unit}`}</span>
}

function Comparison({ cur, prev, prevDate }: { cur: SessionSummary; prev: SessionSummary; prevDate: number }) {
  const rows: [string, number, number, string, (n: number) => string][] = [
    ['Volume', cur.volume, prev.volume, ' kg', (n) => fmtNum(n, 0)],
    ['Sets', cur.completedSets, prev.completedSets, '', String],
    ['Reps', cur.totalReps, prev.totalReps, '', String],
    ['Minutes', Math.round(cur.durationMs / 60000), Math.round(prev.durationMs / 60000), '', String],
  ]
  return (
    <table className="mt-3 w-full text-[15px]" data-testid="comparison">
      <thead>
        <tr className="text-left text-[13px] text-ink-400">
          <th className="pb-1 font-normal" />
          <th className="pb-1 font-normal">Today</th>
          <th className="pb-1 font-normal">{fmtDate(prevDate, { day: 'numeric', month: 'short' })}</th>
          <th className="pb-1 text-right font-normal">Change</th>
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {rows.map(([label, a, b, unit, f]) => (
          <tr key={label} className="border-t border-ink-800">
            <td className="py-2 text-ink-300">{label}</td>
            <td className="py-2">{f(a)}</td>
            <td className="py-2 text-ink-400">{f(b)}</td>
            <td className="py-2 text-right">{delta(a, b, unit)}</td>
          </tr>
        ))}
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
  if (session === undefined || !exMap) return <Loading label="Loading summary…" />
  if (session === null)
    return (
      <p className="p-6">
        Workout not found. <Link to="/" className="text-iris-300">Go to Today</Link>
      </p>
    )

  const pending = session.exercises.reduce((n, e) => n + (e.skipped ? 0 : e.sets.filter((s) => s.status === 'pending').length), 0)

  return (
    <div className="px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-10">
      <div className="mb-4 flex items-center justify-between">
        <Link to={`/workout/${session.id}`} className="-ml-2 flex h-11 items-center gap-1 rounded-full pr-3 pl-1 text-[15px] text-ink-300 active:bg-ink-800">
          <IconChevronLeft size={20} />
          Back to workout
        </Link>
      </div>
      <SummaryView session={session} exMap={exMap} now={now} />
      {pending > 0 && <p className="mt-4 px-1 text-[14px] text-ink-400">{pending} planned sets aren't logged. They'll be saved as not done.</p>}
      <div className="mt-6 space-y-2">
        <Btn
          variant="primary"
          className="h-14 w-full text-[17px]"
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
          Save workout
        </Btn>
        <Btn variant="secondary" className="w-full" onClick={() => nav('/')}>
          Leave unfinished, resume later
        </Btn>
        <Btn
          variant="ghost"
          className="w-full text-rose-400"
          onClick={() => {
            if (!window.confirm('Discard this workout? Every set logged in it will be deleted. This cannot be undone.')) return
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
