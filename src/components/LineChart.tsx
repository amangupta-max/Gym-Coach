import { useId } from 'react'
import { fmtDate, fmtNum } from '../lib/util'

export interface Point {
  x: number // epoch ms
  y: number
}

/** Minimal dependency-free SVG line chart with a soft purple area fill. */
export function LineChart({ points, unit, height = 170, label }: { points: Point[]; unit: string; height?: number; label: string }) {
  const gid = useId().replace(/:/g, '')
  if (points.length === 0) return <p className="py-6 text-center text-[15px] text-ink-500">No data in this range yet.</p>
  const W = 340
  const H = height
  const pad = { l: 34, r: 8, t: 12, b: 24 }
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  let minX = Math.min(...xs)
  let maxX = Math.max(...xs)
  let minY = Math.min(...ys)
  let maxY = Math.max(...ys)
  if (minX === maxX) {
    minX -= 86400000
    maxX += 86400000
  }
  if (minY === maxY) {
    minY -= 1
    maxY += 1
  }
  const span = maxY - minY
  minY -= span * 0.15
  maxY += span * 0.15
  const sx = (x: number) => pad.l + ((x - minX) / (maxX - minX)) * (W - pad.l - pad.r)
  const sy = (y: number) => pad.t + (1 - (y - minY) / (maxY - minY)) * (H - pad.t - pad.b)
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')
  const area = `${line} L${sx(points[points.length - 1].x).toFixed(1)},${H - pad.b} L${sx(points[0].x).toFixed(1)},${H - pad.b} Z`
  const ticks = [minY + (maxY - minY) * 0.15, (minY + maxY) / 2, maxY - (maxY - minY) * 0.15]
  const last = points[points.length - 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
      <defs>
        <linearGradient id={`a${gid}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#7f42ee" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#7f42ee" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} stroke="#1d172f" />
          <text x={pad.l - 6} y={sy(t) + 4} textAnchor="end" fontSize="10" fill="#7a6e9b">
            {fmtNum(t, t < 10 ? 1 : 0)}
          </text>
        </g>
      ))}
      {points.length > 1 && <path d={area} fill={`url(#a${gid})`} />}
      <path d={line} fill="none" stroke="#9d6ff5" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p) => (
        <circle key={`${p.x}-${p.y}`} cx={sx(p.x)} cy={sy(p.y)} r={p === last ? 4.5 : 2.5} fill={p === last ? '#edeaf6' : '#9d6ff5'}>
          <title>
            {fmtDate(p.x)}: {fmtNum(p.y)} {unit}
          </title>
        </circle>
      ))}
      <text x={pad.l} y={H - 6} fontSize="10" fill="#7a6e9b">
        {fmtDate(points[0].x, { day: 'numeric', month: 'short' })}
      </text>
      <text x={W - pad.r} y={H - 6} fontSize="10" fill="#7a6e9b" textAnchor="end">
        {fmtDate(last.x, { day: 'numeric', month: 'short' })}
      </text>
    </svg>
  )
}
