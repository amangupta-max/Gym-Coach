import type { CardioPlan, RoutineDay, RoutineItem, Weekday } from '../types'

type Slot = [exerciseId: string, sets: number, repMin: number, repMax: number, restSec: number, alternatives: string[], perSide?: boolean]

function items(prefix: string, slots: Slot[]): RoutineItem[] {
  return slots.map(([exerciseId, sets, repMin, repMax, restSec, alternatives, perSide], i) => ({
    id: `${prefix}-${i + 1}`,
    exerciseId,
    sets,
    repMin,
    repMax,
    restSec,
    alternatives,
    perSide: !!perSide,
  }))
}

/**
 * Routine versions.
 * v1: Push, Pull, Legs, Rest, Upper Body, Lower Body + Core, Rest
 * v2: Push, Pull, Legs, Rest, Shoulders + Arms, Chest + Back, Rest (legs once a week)
 */
export const ROUTINE_VERSION = 2

export function defaultRoutine(): RoutineDay[] {
  const now = Date.now()
  const day = (weekday: Weekday, name: string, focus: string, slots: Slot[] | null, version = ''): RoutineDay => ({
    weekday,
    name,
    focus,
    isRest: slots === null,
    items: slots ? items(`${version}d${weekday}`, slots) : [],
    updatedAt: now,
  })
  return [
    day(1, 'Push', 'Chest, shoulders and triceps', [
      ['barbell-bench-press', 3, 8, 10, 120, ['seated-chest-press-machine']],
      ['incline-dumbbell-press', 3, 10, 12, 90, ['incline-chest-press-machine']],
      ['machine-shoulder-press', 3, 8, 12, 90, ['seated-dumbbell-shoulder-press']],
      ['cable-lateral-raise', 3, 12, 15, 60, ['dumbbell-lateral-raise']],
      ['triceps-rope-pushdown', 3, 10, 15, 60, ['straight-bar-pushdown']],
      ['overhead-cable-triceps-extension', 2, 12, 15, 60, ['single-dumbbell-overhead-extension']],
    ]),
    day(2, 'Pull', 'Back, rear delts and biceps', [
      ['lat-pulldown', 3, 8, 12, 90, ['assisted-pull-up']],
      ['seated-cable-row', 3, 10, 12, 90, ['seated-machine-row']],
      ['chest-supported-dumbbell-row', 3, 10, 12, 90, ['one-arm-dumbbell-row']],
      ['face-pull', 2, 12, 15, 60, ['reverse-pec-deck']],
      ['dumbbell-bicep-curl', 3, 10, 12, 60, ['ez-bar-curl']],
      ['hammer-curl', 2, 10, 12, 60, ['rope-hammer-curl']],
    ]),
    day(3, 'Legs', 'Quads, hamstrings, glutes and calves', [
      ['barbell-squat', 3, 8, 10, 120, ['hack-squat', 'goblet-squat']],
      ['romanian-deadlift', 3, 10, 12, 120, ['dumbbell-romanian-deadlift']],
      ['leg-press', 3, 10, 12, 90, ['bulgarian-split-squat']],
      ['lying-leg-curl', 3, 12, 15, 60, ['seated-leg-curl']],
      ['leg-extension', 2, 12, 15, 60, []],
      ['standing-calf-raise', 3, 12, 15, 60, ['seated-calf-raise']],
    ]),
    day(4, 'Rest', 'Recovery', null),
    day(5, 'Shoulders + Arms', 'Shoulders, biceps, triceps and core', [
      ['seated-dumbbell-shoulder-press', 3, 8, 12, 90, ['machine-shoulder-press']],
      ['dumbbell-lateral-raise', 3, 12, 15, 60, ['cable-lateral-raise']],
      ['reverse-pec-deck', 2, 12, 15, 60, ['cable-rear-delt-fly', 'face-pull']],
      ['ez-bar-curl', 3, 10, 12, 60, ['dumbbell-bicep-curl']],
      ['straight-bar-pushdown', 3, 10, 15, 60, ['triceps-rope-pushdown']],
      ['rope-hammer-curl', 2, 10, 12, 60, ['hammer-curl']],
      ['cable-crunch', 3, 12, 15, 60, ['weighted-floor-crunch']],
      ['plank', 3, 30, 45, 45, []],
    ], 'r2'),
    day(6, 'Chest + Back', 'Chest and back', [
      ['incline-chest-press-machine', 3, 10, 12, 90, ['incline-dumbbell-press']],
      ['close-grip-lat-pulldown', 3, 10, 12, 90, ['lat-pulldown', 'assisted-pull-up']],
      ['seated-chest-press-machine', 3, 10, 12, 90, ['barbell-bench-press']],
      ['seated-machine-row', 3, 10, 12, 90, ['seated-cable-row']],
      ['single-arm-cable-row', 2, 12, 12, 60, ['single-arm-machine-row', 'one-arm-dumbbell-row'], true],
      ['pec-deck', 2, 12, 15, 60, []],
    ], 'r2'),
    day(7, 'Rest', 'Recovery', null),
  ]
}

export function defaultCardioPlans(): CardioPlan[] {
  return [
    {
      id: 'treadmill-warmup',
      name: 'Treadmill warm-up',
      when: 'before_gym',
      activity: 'treadmill',
      days: [1, 2, 3, 5, 6],
      durationMin: 10,
      incline: 3.5,
      speedKmh: 6,
    },
    {
      id: 'evening-walk',
      name: 'Evening brisk walk',
      when: 'evening',
      activity: 'walk',
      days: [1, 2, 3, 4, 5, 6, 7],
      durationMin: 45,
    },
  ]
}

/**
 * Friday and Saturday exactly as v1 shipped them. Used only to tell whether
 * the user has edited those days before the v2 upgrade replaces them.
 */
export const V1_FRI_SAT: Record<5 | 6, Pick<RoutineDay, 'name' | 'focus' | 'isRest' | 'items'>> = {
  5: {
    name: 'Upper Body',
    focus: 'Chest, back, shoulders and arms',
    isRest: false,
    items: items('d5', [
      ['incline-chest-press-machine', 3, 10, 12, 90, ['incline-dumbbell-press']],
      ['close-grip-lat-pulldown', 3, 10, 12, 90, ['assisted-pull-up']],
      ['single-arm-cable-row', 2, 12, 12, 60, ['single-arm-machine-row'], true],
      ['dumbbell-lateral-raise', 3, 12, 15, 60, ['cable-lateral-raise']],
      ['reverse-pec-deck', 2, 12, 15, 60, ['cable-rear-delt-fly']],
      ['ez-bar-curl', 2, 10, 12, 60, ['dumbbell-bicep-curl']],
      ['straight-bar-pushdown', 2, 12, 15, 60, ['triceps-rope-pushdown']],
    ]),
  },
  6: {
    name: 'Lower Body + Core',
    focus: 'Glutes, quads, hamstrings, calves and core',
    isRest: false,
    items: items('d6', [
      ['bulgarian-split-squat', 3, 10, 10, 90, ['reverse-lunge'], true],
      ['hip-thrust', 3, 10, 12, 90, ['glute-bridge']],
      ['seated-leg-curl', 3, 12, 15, 60, ['lying-leg-curl']],
      ['leg-extension', 2, 12, 15, 60, []],
      ['seated-calf-raise', 3, 15, 20, 60, ['standing-calf-raise']],
      ['cable-crunch', 3, 12, 15, 60, ['weighted-floor-crunch']],
      ['plank', 3, 30, 45, 45, []],
      ['hanging-knee-raise', 2, 10, 15, 60, ['reverse-crunch']],
    ]),
  },
}

/** True when a stored day still matches what v1 shipped (the user never edited it). */
export function isUneditedV1(day: RoutineDay): boolean {
  if (day.weekday !== 5 && day.weekday !== 6) return false
  const v1 = V1_FRI_SAT[day.weekday]
  const norm = (d: Pick<RoutineDay, 'name' | 'focus' | 'isRest' | 'items'>) =>
    JSON.stringify({ n: d.name, f: d.focus, r: d.isRest, i: d.items.map((x) => [x.exerciseId, x.sets, x.repMin, x.repMax, x.restSec, x.perSide, x.alternatives]) })
  return norm(day) === norm(v1)
}
