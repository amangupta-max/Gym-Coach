import { fmtDate, fmtNum } from '../lib/util'

export interface Point {
  x: number // epoch ms
  y: number
}

/** Minimal dependency-free SVG line chart. */
export function LineChart({ points, unit, height = 160, label }: { points: Point[]; unit: string; height?: number; label: string }) {
  if (points.length === 0) return <p className="text-sm text-slate-500">No data in this range.</p>
  const W = 340
  const H = height
  const pad = { l: 40, r: 10, t: 10, b: 24 }
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
  minY -= span * 0.1
  maxY += span * 0.1
  const sx = (x: number) => pad.l + ((x - minX) / (maxX - minX)) * (W - pad.l - pad.r)
  const sy = (y: number) => pad.t + (1 - (y - minY) / (maxY - minY)) * (H - pad.t - pad.b)
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')
  const ticks = [minY + (maxY - minY) * 0.1, (minY + maxY) / 2, maxY - (maxY - minY) * 0.1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} stroke="#e2e8f0" />
          <text x={pad.l - 4} y={sy(t) + 4} textAnchor="end" fontSize="10" fill="#64748b">
            {fmtNum(t, 1)}
          </text>
        </g>
      ))}
      <path d={path} fill="none" stroke="#059669" strokeWidth="2" />
      {points.map((p) => (
        <circle key={`${p.x}-${p.y}`} cx={sx(p.x)} cy={sy(p.y)} r="3" fill="#059669">
          <title>
            {fmtDate(p.x)}: {fmtNum(p.y)} {unit}
          </title>
        </circle>
      ))}
      <text x={pad.l} y={H - 6} fontSize="10" fill="#64748b">
        {fmtDate(points[0].x, { day: 'numeric', month: 'short' })}
      </text>
      <text x={W - pad.r} y={H - 6} fontSize="10" fill="#64748b" textAnchor="end">
        {fmtDate(points[points.length - 1].x, { day: 'numeric', month: 'short' })}
      </text>
      <text x={W - pad.r} y={pad.t + 8} fontSize="10" fill="#64748b" textAnchor="end">
        {unit}
      </text>
    </svg>
  )
}
