import { useState } from 'react'
import type { Exercise } from '../db/types'
import { useExerciseImages } from '../lib/hooks'

export function ExerciseThumb({ exercise, size = 56 }: { exercise: Exercise | undefined; size?: number }) {
  const { urls } = useExerciseImages(exercise)
  return (
    <img
      src={urls[0]}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className="shrink-0 rounded-md bg-slate-200 object-cover"
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
        className="relative block w-full overflow-hidden rounded-lg bg-slate-200"
        onClick={() => setFrame((f) => f + 1)}
        aria-label={urls.length > 1 ? 'Show next position' : 'Exercise image'}
      >
        <img
          src={urls[idx]}
          alt={placeholder ? 'No verified image available' : `${exercise.name} demonstration${urls.length > 1 ? `, position ${idx + 1}` : ''}`}
          className="mx-auto max-h-64 w-full object-contain"
          data-testid="exercise-image"
        />
        {urls.length > 1 && (
          <span className="absolute right-2 bottom-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
            {idx === 0 ? 'Start' : 'End'} · tap to switch
          </span>
        )}
      </button>
      <figcaption className="mt-1 text-xs text-slate-500">
        {custom ? 'Your photo.' : placeholder ? 'No verified demonstration image yet. Add your own photo from the Exercise Library.' : null}
        {!custom && !placeholder && exercise.imageCaption ? <span className="block text-slate-600">{exercise.imageCaption}</span> : null}
        {!custom && !placeholder && exercise.imageCredit ? (
          <span className="block">
            Image: {exercise.imageCredit.source}, “{exercise.imageCredit.sourceEntry}”, {exercise.imageCredit.license}.
          </span>
        ) : null}
      </figcaption>
    </figure>
  )
}
