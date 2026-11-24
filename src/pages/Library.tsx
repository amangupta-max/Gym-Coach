import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ExerciseImage, ExerciseThumb } from '../components/ExerciseImage'
import { act, Btn, Card, PageTitle, Section, toast } from '../components/ui'
import { db } from '../db/db'
import { exerciseStats } from '../lib/stats'
import { byName, fmtDate, rangeText, repUnit, setLabel } from '../lib/util'
import { useExercises } from '../lib/hooks'
import { Instructions } from './ActiveWorkout'

export function LibraryList() {
  const exMap = useExercises()
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState('')
  const list = useMemo(() => Array.from(exMap?.values() ?? []).sort(byName), [exMap])
  const muscles = useMemo(() => Array.from(new Set(list.map((e) => e.targetMuscle))).sort(), [list])
  if (!exMap) return <p>Loading…</p>
  const s = q.trim().toLowerCase()
  const filtered = list.filter(
    (e) =>
      (!muscle || e.targetMuscle === muscle) &&
      (!s || e.name.toLowerCase().includes(s) || e.equipment.join(' ').toLowerCase().includes(s) || e.primaryMuscles.join(' ').toLowerCase().includes(s)),
  )
  return (
    <div>
      <PageTitle sub={`${list.length} exercises`}>Exercise Library</PageTitle>
      <div className="flex gap-2">
        <input className="min-h-11 flex-1 rounded-lg border border-slate-300 px-3" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search exercises" />
        <select className="min-h-11 rounded-lg border border-slate-300 bg-white px-2" value={muscle} onChange={(e) => setMuscle(e.target.value)} aria-label="Filter by muscle">
          <option value="">All muscles</option>
          {muscles.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </div>
      <ul className="mt-3 space-y-2">
        {filtered.map((e) => (
          <li key={e.id}>
            <Link to={`/library/${e.id}`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2">
              <ExerciseThumb exercise={e} />
              <span>
                <span className="block font-medium">{e.name}</span>
                <span className="block text-xs text-slate-500">
                  {e.targetMuscle} · {e.category} · {e.equipment[0]}
                </span>
              </span>
            </Link>
          </li>
        ))}
        {filtered.length === 0 && <li className="text-slate-500">No exercises match.</li>}
      </ul>
    </div>
  )
}

/** Shrinks a photo before storing it so IndexedDB does not fill up. */
async function shrinkImage(file: File, max = 1024): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process the image.'))), 'image/jpeg', 0.8))
}

export function ExerciseDetail() {
  const { id = '' } = useParams()
  const exMap = useExercises()
  const ex = exMap?.get(id)
  const stats = useLiveQuery(() => (ex ? exerciseStats(ex.id, ex.logType) : undefined), [ex?.id, ex?.logType])
  const custom = useLiveQuery(() => db.customImages.get(id), [id])
  if (!exMap) return <p>Loading…</p>
  if (!ex) return <p>Exercise not found.</p>
  const unit = repUnit(ex.logType)
  return (
    <div>
      <Link to="/library" className="text-sm text-slate-600">
        ‹ Library
      </Link>
      <PageTitle sub={`${ex.targetMuscle} · ${ex.category} · ${ex.difficulty}`}>{ex.name}</PageTitle>
      <ExerciseImage exercise={ex} />
      <div className="mt-2 flex gap-2">
        <label className="inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium">
          {custom ? 'Change my photo' : 'Use my own photo'}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              act(async () => {
                const blob = await shrinkImage(f)
                await db.customImages.put({ exerciseId: ex.id, blob, mime: 'image/jpeg', updatedAt: Date.now() })
              }, 'Photo saved.')()
            }}
          />
        </label>
        {custom && (
          <Btn
            small
            variant="danger"
            onClick={() => {
              if (window.confirm('Remove your photo and go back to the default image?')) void db.customImages.delete(ex.id).then(() => toast('Photo removed.'))
            }}
          >
            Remove my photo
          </Btn>
        )}
      </div>

      <Card className="mt-3">
        <dl className="grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-slate-500">Primary</dt>
          <dd>{ex.primaryMuscles.join(', ')}</dd>
          <dt className="text-slate-500">Secondary</dt>
          <dd>{ex.secondaryMuscles.join(', ') || '–'}</dd>
          <dt className="text-slate-500">Equipment</dt>
          <dd>{ex.equipment.join(', ')}</dd>
          <dt className="text-slate-500">Default</dt>
          <dd>
            {ex.defaultSets} × {rangeText(ex.defaultRepMin, ex.defaultRepMax, unit)} · {ex.defaultRestSec}s rest
          </dd>
        </dl>
        {ex.weightNote && <p className="mt-2 text-xs text-slate-600">{ex.weightNote}</p>}
      </Card>

      <Section title="Your record">
        <Card>
          {!stats || stats.history.length === 0 ? (
            <p className="text-sm text-slate-500">Not performed yet.</p>
          ) : (
            <dl className="grid grid-cols-2 gap-y-1 text-sm" data-testid="exercise-record">
              <dt className="text-slate-500">Last done</dt>
              <dd>{fmtDate(stats.last!.date)}</dd>
              <dt className="text-slate-500">Last sets</dt>
              <dd>{stats.last!.sets.map((s) => setLabel(s.weight, s.reps, ex.logType)).join(', ')}</dd>
              <dt className="text-slate-500">{ex.logType === 'assisted_reps' ? 'Least assistance' : ex.logType === 'time' ? 'Longest hold' : 'Personal best'}</dt>
              <dd>{stats.best ? `${setLabel(stats.best.weight, stats.best.reps, ex.logType)} (${fmtDate(stats.best.date)})` : '–'}</dd>
              <dt className="text-slate-500">Most {unit}</dt>
              <dd>{stats.mostReps ? `${stats.mostReps.reps} (${fmtDate(stats.mostReps.date)})` : '–'}</dd>
              <dt className="text-slate-500">Sessions</dt>
              <dd>{stats.history.length}</dd>
            </dl>
          )}
        </Card>
      </Section>

      <Section title="How to do it">
        <Card>
          <Instructions ex={ex} />
        </Card>
      </Section>

      {ex.alternatives.length > 0 && (
        <Section title="Alternatives">
          <ul className="space-y-2">
            {ex.alternatives.map((a) => {
              const alt = exMap.get(a)
              return alt ? (
                <li key={a}>
                  <Link to={`/library/${a}`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2">
                    <ExerciseThumb exercise={alt} size={44} />
                    <span>
                      <span className="block font-medium">{alt.name}</span>
                      <span className="block text-xs text-slate-500">
                        {alt.primaryMuscles.join(', ')} · {alt.equipment.join(', ')}
                      </span>
                    </span>
                  </Link>
                </li>
              ) : null
            })}
          </ul>
        </Section>
      )}
      {ex.imageCredit && (
        <p className="mt-4 text-xs text-slate-500">
          Image source: {ex.imageCredit.source}, entry “{ex.imageCredit.sourceEntry}”. License: {ex.imageCredit.license}. Original: {ex.imageCredit.url}
        </p>
      )}
    </div>
  )
}
