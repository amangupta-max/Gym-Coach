// Core data types. Everything the app knows lives in IndexedDB as these records.

/** ISO weekday: 1 = Monday ... 7 = Sunday */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

/**
 * How a set is logged.
 * weight_reps:     weight (kg) + reps
 * bodyweight_reps: optional added weight (kg) + reps
 * assisted_reps:   assistance weight (kg, lower is better) + reps
 * time:            optional added weight (kg) + seconds held
 */
export type LogType = 'weight_reps' | 'bodyweight_reps' | 'assisted_reps' | 'time'

export interface ImageCredit {
  source: string
  sourceEntry: string
  url: string
  license: string
}

export interface Exercise {
  id: string
  name: string
  description?: string
  targetMuscle: string
  primaryMuscles: string[]
  secondaryMuscles: string[]
  category: 'compound' | 'isolation'
  equipment: string[]
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  instructions: string[]
  formTips: string[]
  commonMistakes: string[]
  alternatives: string[]
  /** File names inside /exercise-images/. Empty means use the placeholder. */
  images: string[]
  imageCaption?: string
  imageCredit?: ImageCredit
  defaultSets: number
  defaultRepMin: number
  defaultRepMax: number
  defaultRestSec: number
  logType: LogType
  perSide?: boolean
  weightNote?: string
  /** true for exercises the user created (never overwritten by seed updates) */
  custom?: boolean
}

export interface RoutineItem {
  id: string
  exerciseId: string
  sets: number
  repMin: number
  repMax: number
  restSec: number
  perSide: boolean
  alternatives: string[]
  note?: string
}

export interface RoutineDay {
  weekday: Weekday
  name: string
  focus: string
  isRest: boolean
  items: RoutineItem[]
  updatedAt: number
}

export type SetStatus = 'pending' | 'completed' | 'skipped'

export interface SessionSet {
  id: string
  weight: number | null
  /** reps, or seconds for time based exercises */
  reps: number | null
  status: SetStatus
  completedAt?: number
  /** added during the workout with "Add set" */
  extra?: boolean
  /** weight was copied from a previous record and not yet edited */
  prefilled?: boolean
}

export interface SessionExercise {
  id: string
  routineItemId?: string
  /** what the routine planned for this slot */
  plannedExerciseId: string
  /** what was actually performed (all stats are keyed on this) */
  exerciseId: string
  skipped: boolean
  targetSets: number
  repMin: number
  repMax: number
  restSec: number
  perSide: boolean
  alternatives: string[]
  sets: SessionSet[]
}

export type SessionStatus = 'in_progress' | 'completed'

export interface Session {
  id: string
  weekday: Weekday
  name: string
  focus: string
  status: SessionStatus
  startedAt: number
  finishedAt?: number
  currentIndex: number
  exercises: SessionExercise[]
  /** denormalised list of actual exercise ids, indexed for fast history lookups */
  exerciseIds: string[]
  updatedAt: number
  notes?: string
}

export interface CardioPlan {
  id: string
  name: string
  when: 'before_gym' | 'evening' | 'other'
  activity: 'treadmill' | 'walk' | 'other'
  /** weekdays this plan applies to */
  days: Weekday[]
  durationMin: number
  incline?: number
  speedKmh?: number
  distanceKm?: number
}

export interface CardioLog {
  id: string
  /** local date YYYY-MM-DD */
  date: string
  planId?: string
  name: string
  activity: CardioPlan['activity']
  completed: boolean
  durationMin: number | null
  incline: number | null
  speedKmh: number | null
  distanceKm: number | null
  notes?: string
  createdAt: number
  updatedAt: number
}

export type BodyLogKind = 'body_weight' | 'waist'

export interface BodyLog {
  id: string
  kind: BodyLogKind
  /** local date YYYY-MM-DD */
  date: string
  value: number
  note?: string
  createdAt: number
}

export interface CustomImage {
  exerciseId: string
  blob: Blob
  mime: string
  updatedAt: number
}

export interface KV {
  key: string
  value: unknown
}

export interface Settings {
  soundEnabled: boolean
  vibrationEnabled: boolean
  keepScreenAwake: boolean
  autoStartTimer: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  soundEnabled: true,
  vibrationEnabled: true,
  keepScreenAwake: true,
  autoStartTimer: true,
}

export type TimerStatus = 'idle' | 'running' | 'paused' | 'finished'

export interface TimerState {
  status: TimerStatus
  /** full duration of the current rest, ms */
  durationMs: number
  /** epoch ms when the rest ends (running) */
  endAt: number | null
  /** remaining ms while paused */
  pausedRemainingMs: number | null
  /** epoch ms when the rest actually finished */
  finishedAt: number | null
  sessionId?: string
  setId?: string
  label?: string
}

export const IDLE_TIMER: TimerState = {
  status: 'idle',
  durationMs: 0,
  endAt: null,
  pausedRemainingMs: null,
  finishedAt: null,
}
