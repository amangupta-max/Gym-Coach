import { BACKUP_TABLES, DB_SCHEMA_VERSION, db, setKV, type BackupTable } from '../db/db'
import { ensureSeed } from '../db/seed'
import { IDLE_TIMER, type CustomImage, type Session } from '../db/types'
import { exerciseMap } from './stats'
import { localDate } from './util'

export const BACKUP_APP_ID = 'gym-companion'
export const BACKUP_FORMAT = 1

interface SerializedImage {
  exerciseId: string
  mime: string
  updatedAt: number
  dataUrl: string
}

export interface BackupFile {
  app: typeof BACKUP_APP_ID
  format: number
  dbVersion: number
  exportedAt: string
  counts: Record<string, number>
  tables: Record<BackupTable, unknown[]>
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const [head, body] = dataUrl.split(',', 2)
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? 'application/octet-stream'
  const bin = atob(body)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export async function buildBackup(): Promise<BackupFile> {
  const tables = {} as Record<BackupTable, unknown[]>
  const counts: Record<string, number> = {}
  for (const name of BACKUP_TABLES) {
    if (name === 'customImages') {
      const imgs = await db.customImages.toArray()
      tables.customImages = await Promise.all(
        imgs.map(async (i): Promise<SerializedImage> => ({ exerciseId: i.exerciseId, mime: i.mime, updatedAt: i.updatedAt, dataUrl: await blobToDataUrl(i.blob) })),
      )
    } else {
      tables[name] = await db.table(name).toArray()
    }
    counts[name] = tables[name].length
  }
  return { app: BACKUP_APP_ID, format: BACKUP_FORMAT, dbVersion: DB_SCHEMA_VERSION, exportedAt: new Date().toISOString(), counts, tables }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export function backupFilename() {
  return `gym-companion-backup-${localDate()}.json`
}

export async function exportBackupFile(): Promise<File> {
  const data = await buildBackup()
  const json = JSON.stringify(data)
  await setKV('lastBackupAt', Date.now())
  return new File([json], backupFilename(), { type: 'application/json' })
}

export class BackupError extends Error {}

export function validateBackup(raw: unknown): BackupFile {
  if (!raw || typeof raw !== 'object') throw new BackupError('This file is not a valid backup (not JSON object).')
  const b = raw as Partial<BackupFile>
  if (b.app !== BACKUP_APP_ID) throw new BackupError('This file is not a Gym Companion backup.')
  if (typeof b.format !== 'number' || b.format > BACKUP_FORMAT) throw new BackupError('This backup was made by a newer version of the app. Update the app first.')
  if (!b.tables || typeof b.tables !== 'object') throw new BackupError('Backup is missing its data tables.')
  for (const name of BACKUP_TABLES) {
    const t = (b.tables as Record<string, unknown>)[name]
    if (t !== undefined && !Array.isArray(t)) throw new BackupError(`Backup table "${name}" is corrupted.`)
  }
  const sessions = ((b.tables as Record<string, unknown>).sessions ?? []) as Session[]
  for (const s of sessions) {
    if (!s || typeof s.id !== 'string' || !Array.isArray(s.exercises) || typeof s.startedAt !== 'number')
      throw new BackupError('Backup contains an invalid workout record.')
  }
  return b as BackupFile
}

export async function parseBackupFile(file: File): Promise<BackupFile> {
  let raw: unknown
  try {
    raw = JSON.parse(await file.text())
  } catch {
    throw new BackupError('Could not read the file. Is it a .json backup?')
  }
  return validateBackup(raw)
}

/** Replaces ALL local data with the backup contents, in one transaction. */
export async function restoreBackup(backup: BackupFile): Promise<void> {
  const images: CustomImage[] = []
  for (const i of (backup.tables.customImages ?? []) as SerializedImage[]) {
    images.push({ exerciseId: i.exerciseId, mime: i.mime, updatedAt: i.updatedAt, blob: await dataUrlToBlob(i.dataUrl) })
  }
  const tables = BACKUP_TABLES.map((n) => db.table(n))
  await db.transaction('rw', tables, async () => {
    for (const name of BACKUP_TABLES) {
      const table = db.table(name)
      await table.clear()
      const rows = name === 'customImages' ? images : ((backup.tables[name] ?? []) as object[])
      if (rows.length) await table.bulkPut(rows)
    }
    // A rest timer from another device makes no sense here.
    await setKV('timer', IDLE_TIMER)
  })
  await ensureSeed()
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

export async function workoutCsv(): Promise<Blob> {
  const exMap = await exerciseMap()
  const sessions = (await db.sessions.toArray()).filter((s) => s.status === 'completed').sort((a, b) => a.startedAt - b.startedAt)
  const rows: unknown[][] = [
    ['date', 'workout', 'session_id', 'started_at', 'finished_at', 'exercise_order', 'exercise', 'planned_exercise', 'substituted', 'set_number', 'weight_kg', 'reps_or_seconds', 'unit', 'set_status', 'extra_set', 'volume_kg'],
  ]
  for (const s of sessions) {
    s.exercises.forEach((ex, i) => {
      const e = exMap.get(ex.exerciseId)
      const planned = exMap.get(ex.plannedExerciseId)
      const logType = e?.logType ?? 'weight_reps'
      ex.sets.forEach((set, j) => {
        const vol = set.status === 'completed' && logType !== 'assisted_reps' && logType !== 'time' ? (set.weight ?? 0) * (set.reps ?? 0) : ''
        rows.push([
          localDate(s.startedAt),
          s.name,
          s.id,
          new Date(s.startedAt).toISOString(),
          s.finishedAt ? new Date(s.finishedAt).toISOString() : '',
          i + 1,
          e?.name ?? ex.exerciseId,
          planned?.name ?? ex.plannedExerciseId,
          ex.exerciseId !== ex.plannedExerciseId ? 'yes' : 'no',
          j + 1,
          set.weight ?? '',
          set.reps ?? '',
          logType === 'time' ? 'seconds' : 'reps',
          ex.skipped && set.status === 'pending' ? 'exercise_skipped' : set.status,
          set.extra ? 'yes' : 'no',
          vol,
        ])
      })
    })
  }
  return new Blob([toCsv(rows)], { type: 'text/csv' })
}

export async function cardioCsv(): Promise<Blob> {
  const logs = (await db.cardioLogs.toArray()).sort((a, b) => a.date.localeCompare(b.date))
  const rows: unknown[][] = [['date', 'activity', 'name', 'completed', 'duration_min', 'incline', 'speed_kmh', 'distance_km', 'notes']]
  for (const l of logs) rows.push([l.date, l.activity, l.name, l.completed ? 'yes' : 'no', l.durationMin, l.incline, l.speedKmh, l.distanceKm, l.notes ?? ''])
  return new Blob([toCsv(rows)], { type: 'text/csv' })
}

export async function bodyCsv(): Promise<Blob> {
  const logs = (await db.bodyLogs.toArray()).sort((a, b) => a.date.localeCompare(b.date))
  const rows: unknown[][] = [['date', 'measurement', 'value', 'unit', 'note']]
  for (const l of logs) rows.push([l.date, l.kind === 'waist' ? 'waist' : 'body_weight', l.value, l.kind === 'waist' ? 'cm' : 'kg', l.note ?? ''])
  return new Blob([toCsv(rows)], { type: 'text/csv' })
}

export async function wipeAllData(): Promise<void> {
  const tables = BACKUP_TABLES.map((n) => db.table(n))
  await db.transaction('rw', tables, async () => {
    for (const t of tables) await t.clear()
  })
  await ensureSeed()
}
