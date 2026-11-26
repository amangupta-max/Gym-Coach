import type { Exercise } from '../db/types'

/**
 * Exercise search that copes with gym slang and misleading names:
 * "hyperextension" finds back extensions, "pec deck" finds flyes, "rod" finds bar moves,
 * "rdl" finds Romanian deadlifts, plurals and hyphens don't matter, and every word you
 * type must match somewhere in the name, muscles or equipment.
 */
const SYNONYMS: string[][] = [
  ['hyperextension', 'back extension', 'hyper extension', 'back raise'],
  ['reverse pec deck', 'reverse fly', 'rear delt fly', 'reverse machine fly'],
  ['pec deck', 'butterfly', 'chest fly', 'flye', 'fly'],
  ['rod', 'bar', 'barbell'],
  ['ez bar', 'curl bar', 'e z'],
  ['smith', 'smith machine'],
  ['rdl', 'romanian deadlift', 'stiff leg'],
  ['skull crusher', 'skullcrusher', 'lying triceps extension', 'lying triceps press'],
  ['pulldown', 'pull down', 'lat pull'],
  ['pull up', 'pullup', 'chin up', 'chinup'],
  ['abs', 'abdominal', 'core', 'crunch'],
  ['quad', 'quadricep', 'quads'],
  ['delt', 'shoulder'],
  ['lat', 'lats', 'back'],
  ['tricep', 'triceps'],
  ['bicep', 'biceps'],
  ['db', 'dumbbell'],
  ['bb', 'barbell'],
  ['kb', 'kettlebell'],
  ['bodyweight', 'body only', 'no equipment'],
  ['calf raise', 'calf press', 'calves'],
  ['hip thrust', 'glute bridge', 'hip raise'],
  ['dip', 'dips'],
  ['shrug', 'traps'],
  ['ohp', 'overhead press', 'shoulder press', 'military press'],
  ['row', 'rows'],
  ['press down', 'pushdown', 'push down'],
]

export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[-/_(),.]/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .join(' ')
}

const GROUPS = SYNONYMS.map((g) => g.map(norm))

/** Equipment family for filtering, derived from equipment text and name. */
export function equipmentGroup(ex: Pick<Exercise, 'name' | 'equipment'>): string {
  const t = `${ex.name} ${ex.equipment.join(' ')}`.toLowerCase()
  if (t.includes('smith')) return 'Smith machine'
  if (t.includes('cable') || t.includes('pulley') || t.includes('rope attachment')) return 'Cable'
  if (/machine|leverage|pec deck|leg press|hack squat|lat pulldown|assisted pull/.test(t)) return 'Machine'
  if (/barbell|ez curl|ez bar|e z curl/.test(t)) return 'Barbell'
  if (t.includes('dumbbell')) return 'Dumbbell'
  if (t.includes('kettlebell')) return 'Kettlebell'
  if (t.includes('band')) return 'Band'
  if (/bodyweight|body only|pull up bar|pull-up bar|mat|floor|hyperextension bench|bench/.test(t)) return 'Bodyweight'
  return 'Other'
}

export const EQUIPMENT_ORDER = ['Machine', 'Cable', 'Dumbbell', 'Barbell', 'Smith machine', 'Bodyweight', 'Kettlebell', 'Band', 'Other']

const hayCache = new WeakMap<Exercise, string>()
function haystack(ex: Exercise): string {
  let h = hayCache.get(ex)
  if (!h) {
    h = ` ${norm([ex.name, ex.targetMuscle, ...ex.primaryMuscles, ...ex.secondaryMuscles, ...ex.equipment, equipmentGroup(ex)].join(' '))} `
    hayCache.set(ex, h)
  }
  return h
}

/** Returns a score > 0 if the exercise matches the query (higher = better), 0 if not. */
export function matchScore(ex: Exercise, query: string): number {
  let q = ` ${norm(query)} `
  if (!q.trim()) return 1
  const hay = haystack(ex)
  const name = ` ${norm(ex.name)} `
  let score = 1
  // Multi-word and slang terms first: any member of the synonym group may match.
  for (const group of GROUPS) {
    const hit = [...group].sort((a, b) => b.length - a.length).find((phrase) => q.includes(` ${phrase} `))
    if (!hit) continue
    q = q.replace(` ${hit} `, ' ')
    const found = group.find((phrase) => hay.includes(` ${phrase}`))
    if (!found) return 0
    if (group.some((phrase) => name.includes(phrase))) score += 3
  }
  for (const word of q.trim().split(' ').filter(Boolean)) {
    if (!hay.includes(` ${word}`)) return 0
    if (name.includes(` ${word}`)) score += 2
  }
  if (name.trim().startsWith(norm(query))) score += 5
  return score
}

export function searchExercises(list: Exercise[], query: string, filters: { muscle?: string; equipment?: string } = {}): Exercise[] {
  const scored: [number, Exercise][] = []
  for (const ex of list) {
    if (filters.muscle && ex.targetMuscle !== filters.muscle) continue
    if (filters.equipment && equipmentGroup(ex) !== filters.equipment) continue
    const s = matchScore(ex, query)
    if (s > 0) scored.push([s, ex])
  }
  // Built-in curated exercises (no "fx-" prefix) first when scores tie: they have full form tips.
  scored.sort((a, b) => b[0] - a[0] || Number(a[1].id.startsWith('fx-')) - Number(b[1].id.startsWith('fx-')) || a[1].name.localeCompare(b[1].name))
  return scored.map(([, e]) => e)
}
