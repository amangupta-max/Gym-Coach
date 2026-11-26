// Downloads the exercise library photos (free-exercise-db, public domain) and
// stores resized copies in public/exercise-images/lib/ so the app serves them
// itself (no hotlinking). Runs before every build; files that already exist
// are skipped, so only the first build downloads anything.
//
// Sandboxed builds can point IMAGE_CACHE at a folder that already holds the
// original <folder>/<n>.jpg files.
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT = join(ROOT, 'public/exercise-images/lib')
const SOURCE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'
const CACHE = process.env.IMAGE_CACHE

const library = JSON.parse(readFileSync(join(ROOT, 'src/db/seed/library.json'), 'utf8'))
mkdirSync(OUT, { recursive: true })

const jobs = []
for (const ex of library) {
  if (!ex.source) continue
  ex.source.frames.forEach((frame, i) => jobs.push({ ex, frame, i }))
}

async function original(frame) {
  if (CACHE) {
    const p = join(CACHE, frame)
    if (existsSync(p)) return readFileSync(p)
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(SOURCE + frame)
      if (res.ok) return Buffer.from(await res.arrayBuffer())
      if (res.status === 404) return null
    } catch {
      /* network hiccup: retry */
    }
    await new Promise((r) => setTimeout(r, 500 * attempt))
  }
  return null
}

let made = 0
let skipped = 0
const failed = []
async function run({ ex, frame, i }) {
  const full = join(OUT, `${ex.id}-${i + 1}.jpg`)
  const thumb = join(OUT, `${ex.id}-t.jpg`)
  const needThumb = i === 0 && !existsSync(thumb)
  if (existsSync(full) && !needThumb) {
    skipped++
    return
  }
  const buf = await original(frame)
  if (!buf) {
    failed.push(frame)
    return
  }
  if (!existsSync(full)) await sharp(buf).resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 70, mozjpeg: true }).toFile(full)
  if (needThumb) await sharp(buf).resize({ width: 144, height: 144, fit: 'cover' }).jpeg({ quality: 68, mozjpeg: true }).toFile(thumb)
  made++
}

const queue = [...jobs]
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (queue.length) await run(queue.shift())
  }),
)
console.log(`library images: ${made} made, ${skipped} already present, ${failed.length} unavailable${failed.length ? ` (${failed.slice(0, 5).join(', ')})` : ''}`)
