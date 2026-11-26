import { db, getKV, setKV } from '../db'
import { DEFAULT_SETTINGS, IDLE_TIMER, type Exercise, type Settings } from '../types'
import { SEED_EXERCISES } from './exercises'
import { defaultCardioPlans, defaultRoutine, isUneditedV1, ROUTINE_VERSION } from './routine'

/**
 * Bump when the built-in exercise library content changes (instructions,
 * images, new exercises). Seed updates only touch built-in library entries.
 * They never touch workouts, logs, the user's routine or custom exercises.
 */
export const SEED_VERSION = 1

/**
 * Bump when src/db/seed/library.json (the big exercise library) changes.
 * The library is loaded as a separate chunk only when it needs (re)importing.
 */
export const LIBRARY_VERSION = 1

type LibraryEntry = Omit<Exercise, 'formTips' | 'commonMistakes'> & { formTips?: string[]; commonMistakes?: string[] }

function fromLibrary(x: LibraryEntry): Exercise {
  return {
    ...x,
    formTips: x.formTips ?? [],
    commonMistakes: x.commonMistakes ?? [],
    imageCredit: x.source
      ? {
          source: 'free-exercise-db (yuhonas)',
          sourceEntry: x.name,
          url: `https://github.com/yuhonas/free-exercise-db/tree/main/exercises/${x.source.folder}`,
          license: 'Unlicense (public domain), as declared by the dataset',
        }
      : undefined,
  }
}

/** Adds or refreshes the big exercise library. Never touches custom exercises or any workout data. */
async function ensureLibrary(): Promise<void> {
  if ((await getKV<number>('libraryVersion', 0)) >= LIBRARY_VERSION) return
  const { default: lib } = (await import('./library.json')) as { default: LibraryEntry[] }
  await db.transaction('rw', [db.exercises, db.kv], async () => {
    const existing = new Map((await db.exercises.toArray()).map((e) => [e.id, e]))
    const rows = lib.map(fromLibrary).filter((e) => !existing.get(e.id)?.custom)
    await db.exercises.bulkPut(rows)
    await setKV('libraryVersion', LIBRARY_VERSION)
  })
}

/**
 * Idempotent. Safe to run on every app start and after a restore.
 * - Adds any missing built-in exercises.
 * - Refreshes built-in exercise content when SEED_VERSION increases.
 * - Creates the default routine / cardio plans / settings only if absent.
 */
export async function ensureSeed(): Promise<void> {
  await db.transaction('rw', [db.exercises, db.routineDays, db.cardioPlans, db.kv], async () => {
    const appliedVersion = await getKV<number>('seedVersion', 0)
    const existing = new Set(await db.exercises.toCollection().primaryKeys())

    for (const ex of SEED_EXERCISES) {
      if (!existing.has(ex.id)) {
        await db.exercises.add(ex)
      } else if (appliedVersion < SEED_VERSION) {
        const current = await db.exercises.get(ex.id)
        if (current && !current.custom) await db.exercises.put(ex)
      }
    }

    if ((await db.routineDays.count()) === 0) {
      await db.routineDays.bulkAdd(defaultRoutine())
      await setKV('routineVersion', ROUTINE_VERSION)
    } else {
      // Routine upgrades: only replace days the user never edited. Past workouts are never touched.
      const routineVersion = await getKV<number>('routineVersion', 1)
      if (routineVersion < 2) {
        const fresh = defaultRoutine()
        for (const wd of [5, 6] as const) {
          const stored = await db.routineDays.get(wd)
          if (stored && isUneditedV1(stored)) await db.routineDays.put(fresh.find((d) => d.weekday === wd)!)
        }
      }
      if (routineVersion < ROUTINE_VERSION) await setKV('routineVersion', ROUTINE_VERSION)
    }
    if ((await db.cardioPlans.count()) === 0) {
      await db.cardioPlans.bulkAdd(defaultCardioPlans())
    }

    const settings = await getKV<Partial<Settings> | null>('settings', null)
    await setKV('settings', { ...DEFAULT_SETTINGS, ...(settings ?? {}) })
    if (!(await db.kv.get('timer'))) await setKV('timer', IDLE_TIMER)
    if (!(await db.kv.get('installedAt'))) await setKV('installedAt', Date.now())
    if (appliedVersion < SEED_VERSION) await setKV('seedVersion', SEED_VERSION)
  })
  await ensureLibrary()
}
