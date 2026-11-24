import Dexie, { type EntityTable } from 'dexie'
import type {
  BodyLog,
  CardioLog,
  CardioPlan,
  CustomImage,
  Exercise,
  KV,
  RoutineDay,
  Session,
} from './types'

export const DB_NAME = 'gym-companion'

export type GymDB = Dexie & {
  exercises: EntityTable<Exercise, 'id'>
  routineDays: EntityTable<RoutineDay, 'weekday'>
  sessions: EntityTable<Session, 'id'>
  cardioPlans: EntityTable<CardioPlan, 'id'>
  cardioLogs: EntityTable<CardioLog, 'id'>
  bodyLogs: EntityTable<BodyLog, 'id'>
  customImages: EntityTable<CustomImage, 'exerciseId'>
  kv: EntityTable<KV, 'key'>
}

export const db = new Dexie(DB_NAME) as GymDB

/*
 * Schema versions.
 *
 * NEVER edit an existing version block once it has shipped. To change the
 * schema, add a new block with a higher number and (if needed) an
 * .upgrade(tx => ...) function that transforms existing records. Dexie runs
 * the upgrades in order, so user data is migrated instead of erased.
 *
 * Example for the future:
 *   db.version(2).stores({ sessions: 'id, status, startedAt, weekday, *exerciseIds, finishedAt' })
 *     .upgrade(tx => tx.table('sessions').toCollection().modify(s => { s.notes ??= '' }))
 */
db.version(1).stores({
  exercises: 'id, name, targetMuscle',
  routineDays: 'weekday',
  sessions: 'id, status, startedAt, weekday, *exerciseIds',
  cardioPlans: 'id',
  cardioLogs: 'id, date, planId',
  bodyLogs: 'id, kind, date',
  customImages: 'exerciseId',
  kv: 'key',
})

export const DB_SCHEMA_VERSION = 1

/** Tables included in backups, in restore order. */
export const BACKUP_TABLES = [
  'exercises',
  'routineDays',
  'sessions',
  'cardioPlans',
  'cardioLogs',
  'bodyLogs',
  'customImages',
  'kv',
] as const

export type BackupTable = (typeof BACKUP_TABLES)[number]

export async function getKV<T>(key: string, fallback: T): Promise<T> {
  const row = await db.kv.get(key)
  return row ? (row.value as T) : fallback
}

export async function setKV<T>(key: string, value: T): Promise<void> {
  await db.kv.put({ key, value })
}
