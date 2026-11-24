import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Btn, Card, Empty, Modal, PageTitle, Section, toast, toastError } from '../components/ui'
import { db } from '../db/db'
import type { CardioLog, CardioPlan } from '../db/types'
import { fmtDate, fmtNum, isoWeekday, localDate, parseNum, uid, WEEKDAY_SHORT } from '../lib/util'

type Draft = {
  id?: string
  date: string
  planId?: string
  name: string
  activity: CardioPlan['activity']
  durationMin: string
  incline: string
  speedKmh: string
  distanceKm: string
  notes: string
}

const str = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n))

function draftFromPlan(p: CardioPlan, date: string, existing?: CardioLog): Draft {
  if (existing) return draftFromLog(existing)
  return { date, planId: p.id, name: p.name, activity: p.activity, durationMin: str(p.durationMin), incline: str(p.incline), speedKmh: str(p.speedKmh), distanceKm: str(p.distanceKm), notes: '' }
}

function draftFromLog(l: CardioLog): Draft {
  return { id: l.id, date: l.date, planId: l.planId, name: l.name, activity: l.activity, durationMin: str(l.durationMin), incline: str(l.incline), speedKmh: str(l.speedKmh), distanceKm: str(l.distanceKm), notes: l.notes ?? '' }
}

function CardioForm({ draft, onDone }: { draft: Draft; onDone: () => void }) {
  const [d, setD] = useState<Draft>(draft)
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setD({ ...d, [k]: e.target.value })
  const dur = parseNum(d.durationMin)
  const spd = parseNum(d.speedKmh)
  const est = dur && spd ? (dur / 60) * spd : null

  const save = (completed: boolean) => {
    const now = Date.now()
    const log: CardioLog = {
      id: d.id ?? uid(),
      date: d.date,
      planId: d.planId,
      name: d.name.trim() || 'Cardio',
      activity: d.activity,
      completed,
      durationMin: parseNum(d.durationMin),
      incline: parseNum(d.incline),
      speedKmh: parseNum(d.speedKmh),
      distanceKm: parseNum(d.distanceKm),
      notes: d.notes.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    }
    db.transaction('rw', db.cardioLogs, async () => {
      const prev = d.id ? await db.cardioLogs.get(d.id) : undefined
      await db.cardioLogs.put({ ...log, createdAt: prev?.createdAt ?? now })
    })
      .then(() => {
        toast(completed ? 'Cardio logged as completed.' : 'Saved as not done.', 'success')
        onDone()
      })
      .catch(toastError)
  }

  const field = 'mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2'
  return (
    <div className="space-y-2" data-testid="cardio-form">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-600">
          Date
          <input type="date" className={field} value={d.date} onChange={set('date')} />
        </label>
        <label className="text-xs text-slate-600">
          Activity
          <select className={field} value={d.activity} onChange={set('activity')}>
            <option value="treadmill">Treadmill</option>
            <option value="walk">Walk</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>
      <label className="block text-xs text-slate-600">
        Name
        <input className={field} value={d.name} onChange={set('name')} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-600">
          Duration (min)
          <input inputMode="decimal" className={field} value={d.durationMin} onChange={set('durationMin')} aria-label="Duration minutes" />
        </label>
        <label className="text-xs text-slate-600">
          Distance (km)
          <input inputMode="decimal" className={field} value={d.distanceKm} onChange={set('distanceKm')} placeholder={est ? `≈ ${fmtNum(est, 2)}` : ''} aria-label="Distance km" />
        </label>
        {d.activity === 'treadmill' && (
          <>
            <label className="text-xs text-slate-600">
              Incline
              <input inputMode="decimal" className={field} value={d.incline} onChange={set('incline')} aria-label="Incline" />
            </label>
            <label className="text-xs text-slate-600">
              Speed (km/h)
              <input inputMode="decimal" className={field} value={d.speedKmh} onChange={set('speedKmh')} aria-label="Speed" />
            </label>
          </>
        )}
      </div>
      {est !== null && !d.distanceKm && (
        <button type="button" className="text-xs text-emerald-700 underline" onClick={() => setD({ ...d, distanceKm: fmtNum(est, 2).replace(',', '.') })}>
          Use estimated distance ({fmtNum(est, 2)} km)
        </button>
      )}
      <label className="block text-xs text-slate-600">
        Notes
        <input className={field} value={d.notes} onChange={set('notes')} />
      </label>
      <div className="flex gap-2 pt-1">
        <Btn variant="primary" className="flex-1" onClick={() => save(true)} data-testid="cardio-save-done">
          Save as completed
        </Btn>
        <Btn onClick={() => save(false)}>Not done</Btn>
      </div>
    </div>
  )
}

function PlanEditor({ plan, onDone }: { plan: CardioPlan; onDone: () => void }) {
  const [p, setP] = useState(plan)
  const num = (k: 'durationMin' | 'incline' | 'speedKmh', label: string) => (
    <label className="text-xs text-slate-600">
      {label}
      <input
        inputMode="decimal"
        className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-2"
        defaultValue={str(p[k])}
        onChange={(e) => setP({ ...p, [k]: parseNum(e.target.value) ?? undefined })}
      />
    </label>
  )
  return (
    <div className="space-y-2">
      <label className="block text-xs text-slate-600">
        Name
        <input className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-2" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
      </label>
      <div className="grid grid-cols-3 gap-2">
        {num('durationMin', 'Minutes')}
        {p.activity === 'treadmill' && num('incline', 'Incline')}
        {p.activity === 'treadmill' && num('speedKmh', 'km/h')}
      </div>
      <div className="text-xs text-slate-600">Days</div>
      <div className="flex flex-wrap gap-1">
        {([1, 2, 3, 4, 5, 6, 7] as const).map((wd) => (
          <label key={wd} className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-sm">
            <input type="checkbox" checked={p.days.includes(wd)} onChange={(e) => setP({ ...p, days: e.target.checked ? [...p.days, wd].sort() : p.days.filter((x) => x !== wd) })} />
            {WEEKDAY_SHORT[wd]}
          </label>
        ))}
      </div>
      <Btn
        variant="primary"
        className="w-full"
        onClick={() =>
          db.cardioPlans
            .put({ ...p, durationMin: p.durationMin || 1 })
            .then(() => {
              toast('Plan updated.', 'success')
              onDone()
            })
            .catch(toastError)
        }
      >
        Save plan
      </Btn>
    </div>
  )
}

export default function Cardio() {
  const [params, setParams] = useSearchParams()
  const today = localDate()
  const plans = useLiveQuery(() => db.cardioPlans.toArray(), [])
  const logs = useLiveQuery(() => db.cardioLogs.orderBy('date').reverse().limit(120).toArray(), [])
  const [form, setForm] = useState<Draft | null>(null)
  const [editPlan, setEditPlan] = useState<CardioPlan | null>(null)
  const planParam = params.get('plan')

  // Opened from Home via ?plan=… : open that plan's form once, then clear the param.
  useEffect(() => {
    if (!planParam || !plans || !logs) return
    const p = plans.find((x) => x.id === planParam)
    if (p) setForm(draftFromPlan(p, today, logs.find((l) => l.planId === p.id && l.date === today)))
    setParams({}, { replace: true })
  }, [planParam, plans, logs, today, setParams])

  if (!plans || !logs) return <p>Loading…</p>

  const wd = isoWeekday()
  const todays = plans.filter((p) => p.days.includes(wd))

  return (
    <div>
      <PageTitle sub="Separate from strength training. Planned cardio only counts once you log it.">Cardio</PageTitle>
      <Section title={`Today · ${fmtDate(today)}`}>
        {todays.length === 0 ? (
          <Empty>No cardio planned today.</Empty>
        ) : (
          <ul className="space-y-2">
            {todays.map((p) => {
              const log = logs.find((l) => l.planId === p.id && l.date === today)
              return (
                <li key={p.id}>
                  <Card>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold">{p.name}</div>
                        <div className="text-xs text-slate-500">
                          {p.when === 'before_gym' ? 'Before gym' : p.when === 'evening' ? 'Evening' : ''} · {p.durationMin} min
                          {p.incline !== undefined ? ` · incline ${p.incline}` : ''}
                          {p.speedKmh !== undefined ? ` · ${p.speedKmh} km/h` : ''}
                        </div>
                        <div className={`mt-1 text-sm font-medium ${log?.completed ? 'text-emerald-700' : 'text-slate-500'}`} data-testid={`cardio-status-${p.id}`}>
                          {log ? (log.completed ? '✓ Completed' : 'Marked not done') : 'Not logged yet'}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Btn small variant={log ? 'secondary' : 'primary'} onClick={() => setForm(draftFromPlan(p, today, log))} data-testid={`cardio-log-${p.id}`}>
                          {log ? 'Edit' : 'Log'}
                        </Btn>
                        <Btn small variant="ghost" onClick={() => setEditPlan(p)}>
                          Plan
                        </Btn>
                      </div>
                    </div>
                  </Card>
                </li>
              )
            })}
          </ul>
        )}
        <Btn
          className="mt-2 w-full"
          onClick={() => setForm({ date: today, name: 'Cardio', activity: 'other', durationMin: '', incline: '', speedKmh: '', distanceKm: '', notes: '' })}
        >
          + Log other cardio
        </Btn>
      </Section>

      <Section title="Cardio history">
        {logs.length === 0 ? (
          <Empty>No cardio logged yet.</Empty>
        ) : (
          <ul className="space-y-1 text-sm">
            {logs.map((l) => (
              <li key={l.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-2">
                <button type="button" className="text-left" onClick={() => setForm(draftFromLog(l))}>
                  <span className="font-medium">{l.name}</span> <span className="text-slate-500">· {fmtDate(l.date)}</span>
                  <span className="block text-xs text-slate-600">
                    {l.completed ? '✓ done' : 'not done'}
                    {l.durationMin !== null ? ` · ${fmtNum(l.durationMin)} min` : ''}
                    {l.incline !== null ? ` · incline ${fmtNum(l.incline)}` : ''}
                    {l.speedKmh !== null ? ` · ${fmtNum(l.speedKmh)} km/h` : ''}
                    {l.distanceKm !== null ? ` · ${fmtNum(l.distanceKm, 2)} km` : ''}
                  </span>
                </button>
                <button
                  type="button"
                  className="text-xs text-red-700 underline"
                  onClick={() => window.confirm(`Delete ${l.name} on ${fmtDate(l.date)}?`) && void db.cardioLogs.delete(l.id).then(() => toast('Deleted.'))}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit cardio' : 'Log cardio'}>
        {form && <CardioForm key={form.id ?? form.planId ?? 'new'} draft={form} onDone={() => setForm(null)} />}
      </Modal>
      <Modal open={!!editPlan} onClose={() => setEditPlan(null)} title="Edit cardio plan">
        {editPlan && <PlanEditor plan={editPlan} onDone={() => setEditPlan(null)} />}
      </Modal>
    </div>
  )
}
