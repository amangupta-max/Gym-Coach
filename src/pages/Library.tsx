import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ExerciseImage, ExerciseThumb } from '../components/ExerciseImage'
import { IconChevronLeft, IconSearch } from '../components/icons'
import { act, Btn, fieldClass, Group, PageTitle, Section, Stat, toast } from '../components/ui'
import { db } from '../db/db'
import { useExercises } from '../lib/hooks'
import { exerciseStats } from '../lib/stats'
import { equipmentGroup, EQUIPMENT_ORDER, searchExercises } from '../lib/search'
import { fmtDate, fmtRest, rangeText, repUnit, setLabel } from '../lib/util'
import { Instructions } from './ActiveWorkout'
import { PlanTabs } from './Routine'

const PAGE = 60

export function LibraryList() {
  const exMap = useExercises()
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState('')
  const [equipment, setEquipment] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const list = useMemo(() => Array.from(exMap?.values() ?? []), [exMap])
  const muscles = useMemo(() => Array.from(new Set(list.map((e) => e.targetMuscle))).sort(), [list])
  const equipments = useMemo(() => EQUIPMENT_ORDER.filter((g) => list.some((e) => equipmentGroup(e) === g)), [list])
  const filtered = useMemo(() => searchExercises(list, q, { muscle: muscle || undefined, equipment: equipment || undefined }), [list, q, muscle, equipment])
  if (!exMap) return null
  const chips = (items: string[], value: string, set: (v: string) => void, label: string) => (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label={label}>
      {['', ...items].map((v) => (
        <button
          key={v || 'all'}
          type="button"
          onClick={() => {
            set(v)
            setLimit(PAGE)
          }}
          aria-pressed={value === v}
          className={`h-9 shrink-0 rounded-full px-4 text-[14px] font-medium ${value === v ? 'bg-iris-600 text-white' : 'bg-ink-900 text-ink-300'}`}
        >
          {v || 'All'}
        </button>
      ))}
    </div>
  )
  return (
    <div>
      <PageTitle>Plan</PageTitle>
      <PlanTabs />
      <div className="relative">
        <IconSearch size={19} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-500" />
        <input
          className={`${fieldClass} pl-11`}
          type="search"
          placeholder={`Search ${list.length} exercises`}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setLimit(PAGE)
          }}
          aria-label="Search exercises"
        />
      </div>
      <div className="mt-3 space-y-2">
        {chips(muscles, muscle, setMuscle, 'Filter by muscle')}
        {chips(equipments, equipment, setEquipment, 'Filter by equipment')}
      </div>
      <p className="mt-3 px-1 text-[13px] text-ink-500">{filtered.length} exercises</p>
      {filtered.length === 0 ? (
        <p className="mt-6 text-center text-ink-400">Nothing matches. Try another word, or set the filters to All.</p>
      ) : (
        <Group className="mt-2">
          {filtered.slice(0, limit).map((e) => (
            <Link key={e.id} to={`/library/${e.id}`} className="flex items-center gap-3 px-3 py-2.5 active:bg-ink-850">
              <ExerciseThumb exercise={e} size={48} />
              <span className="min-w-0">
                <span className="block font-medium text-ink-100">{e.name}</span>
                <span className="block truncate text-[14px] text-ink-400">
                  {e.primaryMuscles.join(', ')}, {equipmentGroup(e).toLowerCase()}
                </span>
              </span>
            </Link>
          ))}
        </Group>
      )}
      {filtered.length > limit && (
        <Btn variant="secondary" className="mt-3 w-full" onClick={() => setLimit((l) => l + PAGE)}>
          Show more ({filtered.length - limit} left)
        </Btn>
      )}
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
  if (!exMap) return null
  if (!ex) return <p>Exercise not found.</p>
  const unit = repUnit(ex.logType)
  const tag = (t: string) => (
    <span key={t} className="rounded-full bg-ink-900 px-3 py-1 text-[13px] text-ink-300">
      {t}
    </span>
  )
  return (
    <div>
      <Link to="/library" className="-ml-2 mb-3 inline-flex h-10 items-center gap-1 rounded-full pr-3 pl-1 text-[15px] text-ink-300 active:bg-ink-800">
        <IconChevronLeft size={20} />
        Exercises
      </Link>
      <PageTitle>{ex.name}</PageTitle>
      <div className="-mt-2 mb-5 flex flex-wrap gap-1.5 px-1">
        {tag(ex.targetMuscle)}
        {tag(ex.category === 'compound' ? 'Compound' : 'Isolation')}
        {tag(ex.difficulty[0].toUpperCase() + ex.difficulty.slice(1))}
        {tag(ex.equipment.join(', '))}
      </div>
      <ExerciseImage exercise={ex} />
      <div className="mt-3 flex flex-wrap gap-2">
        <label className="inline-flex min-h-9 cursor-pointer items-center rounded-full border border-ink-600/70 bg-ink-800 px-4 text-[15px] font-semibold">
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
          <Btn small variant="ghost" className="text-rose-400" onClick={() => window.confirm('Remove your photo and go back to the default image?') && void db.customImages.delete(ex.id).then(() => toast('Photo removed.'))}>
            Remove my photo
          </Btn>
        )}
      </div>

      <Section title="Your record">
        {!stats || stats.history.length === 0 ? (
          <p className="rounded-2xl bg-ink-900 px-4 py-4 text-ink-400">Not performed yet.</p>
        ) : (
          <div className="rounded-2xl bg-ink-900 p-4" data-testid="exercise-record">
            <div className="grid grid-cols-2 gap-4">
              <Stat value={stats.best ? setLabel(stats.best.weight, stats.best.reps, ex.logType) : '–'} label={ex.logType === 'assisted_reps' ? 'least assistance' : ex.logType === 'time' ? 'longest hold' : 'personal best'} />
              <Stat value={stats.mostReps ? stats.mostReps.reps : '–'} label={`most ${unit}`} />
            </div>
            <p className="mt-4 border-t border-ink-800 pt-3 text-[15px] text-ink-300">
              Last done {fmtDate(stats.last!.date)}: {stats.last!.sets.map((s) => setLabel(s.weight, s.reps, ex.logType)).join(', ')}
            </p>
            <p className="mt-1 text-[14px] text-ink-500">{stats.history.length} sessions logged</p>
          </div>
        )}
      </Section>

      <Section title="How to do it">
        <div className="rounded-2xl bg-ink-900 p-4">
          <p className="text-[15px] text-ink-300">
            Default {ex.defaultSets} × {rangeText(ex.defaultRepMin, ex.defaultRepMax, unit)}, {fmtRest(ex.defaultRestSec)} rest.
          </p>
          {ex.weightNote && <p className="mt-2 text-[15px] text-ink-300">{ex.weightNote}</p>}
          <Instructions ex={ex} />
        </div>
      </Section>

      {ex.alternatives.length > 0 && (
        <Section title="Alternatives">
          <Group>
            {ex.alternatives.map((a) => {
              const alt = exMap.get(a)
              return alt ? (
                <Link key={a} to={`/library/${a}`} className="flex items-center gap-3 px-3 py-2.5 active:bg-ink-850">
                  <ExerciseThumb exercise={alt} size={44} />
                  <span>
                    <span className="block font-medium">{alt.name}</span>
                    <span className="block text-[14px] text-ink-400">{alt.primaryMuscles.join(', ')}</span>
                  </span>
                </Link>
              ) : null
            })}
          </Group>
        </Section>
      )}
      {ex.imageCredit && (
        <p className="mt-6 px-1 text-[13px] leading-snug text-ink-500">
          Photo source: {ex.imageCredit.source}, entry “{ex.imageCredit.sourceEntry}”. {ex.imageCredit.license}.
        </p>
      )}
    </div>
  )
}
