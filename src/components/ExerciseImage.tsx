import { useState } from 'react'
import type { Exercise } from '../db/types'
import { useExerciseImages } from '../lib/hooks'

export function ExerciseThumb({ exercise, size = 56 }: { exercise: Exercise | undefined; size?: number }) {
  const { urls, placeholder } = useExerciseImages(exercise)
  return (
    <img
      src={urls[0]}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className={`shrink-0 rounded-xl object-cover ${placeholder ? 'bg-ink-800 opacity-60' : 'bg-white'}`}
      style={{ width: size, height: size }}
    />
  )
}

export function ExerciseImage({ exercise }: { exercise: Exercise }) {
  const { urls, custom, placeholder } = useExerciseImages(exercise)
  const [frame, setFrame] = useState(0)
  const idx = frame % urls.length
  return (
    <figure>
      <button
        type="button"
        className={`relative block w-full overflow-hidden rounded-2xl ${placeholder ? 'bg-ink-850' : 'bg-white'}`}
        onClick={() => setFrame((f) => f + 1)}
        aria-label={urls.length > 1 ? 'Show the other position' : 'Exercise image'}
      >
        <img
          src={urls[idx]}
          alt={placeholder ? 'No verified image available' : `${exercise.name} demonstration${urls.length > 1 ? `, position ${idx + 1}` : ''}`}
          className={`mx-auto max-h-72 w-full object-contain ${placeholder ? 'opacity-50' : ''}`}
          data-testid="exercise-image"
        />
        {urls.length > 1 && (
          <span className="absolute right-3 bottom-3 flex gap-1.5" aria-hidden="true">
            {urls.map((_, i) => (
              <span key={i} className={`h-1.5 w-5 rounded-full ${i === idx ? 'bg-iris-600' : 'bg-ink-900/25'}`} />
            ))}
          </span>
        )}
      </button>
      <figcaption className="mt-2 space-y-0.5 text-[13px] leading-snug text-ink-400">
        {urls.length > 1 && <span className="block text-ink-300">Tap the photo to see the {idx === 0 ? 'end' : 'start'} position.</span>}
        {custom && <span className="block">Your photo.</span>}
        {placeholder && <span className="block">No verified demonstration photo yet. Add your own from the exercise page.</span>}
        {!custom && !placeholder && exercise.imageCaption && <span className="block text-ink-300">{exercise.imageCaption}</span>}
        {!custom && !placeholder && exercise.imageCredit && (
          <span className="block">
            Photo: {exercise.imageCredit.source}, {exercise.imageCredit.license}.
          </span>
        )}
      </figcaption>
    </figure>
  )
}
