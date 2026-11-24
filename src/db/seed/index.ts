import { db, getKV, setKV } from '../db'
import { DEFAULT_SETTINGS, IDLE_TIMER, type Settings } from '../types'
import { SEED_EXERCISES } from './exercises'
import { defaultCardioPlans, defaultRoutine } from './routine'

/**
 * Bump when the built-in exercise library content changes (instructions,
 * images, new exercises). Seed updates only touch built-in library entries.
 * They never touch workouts, logs, the user's routine or custom exercises.
 */
export const SEED_VERSION = 1

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
}
