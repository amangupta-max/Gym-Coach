# Gym Companion (Phase 1: functional MVP)

A personal, local-first gym tracker. It runs entirely in the browser, stores everything in IndexedDB on the device, installs as an app on Android, and works offline. No account, no backend, no cloud database, no paid services.

UI is intentionally plain. Visual design is Phase 2.

---

## 1. Quick start (on your MacBook)

Requirements: **Node.js 20.19+ or 22.12+** (check with `node -v`; install the LTS from nodejs.org if needed).

```bash
cd gym-companion
npm install        # once
npm run dev        # development server on http://localhost:5173
```

Other commands:

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload, reachable on your Wi‑Fi |
| `npm run build` | Type-check and build the production app into `dist/` |
| `npm run preview` | Serve the built `dist/` on port 4173 (also on Wi‑Fi) |
| `npm run typecheck` | TypeScript check only |

## 2. Open it on your Android phone during development

`localhost` on the phone means *the phone itself*, not your Mac. Use the Mac's Wi‑Fi IP address instead.

1. Put the phone and the Mac on the **same Wi‑Fi** (not a guest network; those usually block devices from seeing each other).
2. Find the Mac's IP: run `ipconfig getifaddr en0` in Terminal (or System Settings → Wi‑Fi → Details). Example: `192.168.1.23`.
3. Run `npm run dev`. Vite prints a `Network:` line with the same address.
4. On the phone, open Chrome and go to `http://192.168.1.23:5173` (your IP).
5. If it does not load: when macOS asks "Allow incoming connections for node?", click **Allow**. If you missed it: System Settings → Network → Firewall → Options → allow `node`.

Important about this dev address:
- Chrome treats `http://<ip>` as **not secure**, so on that address the app **cannot be installed and will not work offline** (service workers need HTTPS). Everything else works, which is fine for testing.
- Data saved on the dev address is separate from the installed app's data (storage belongs to each web address). Don't log real workouts there.

## 3. Install it on your phone for real (works offline at the gym)

The app has to be served once over **HTTPS**. Free static hosting does that. Only the app files are hosted; your workout data never leaves the phone.

**Pick one host and keep the same link forever.** Your data is tied to that address. A new address means an empty app (you can restore a backup into it).

### Option A: GitHub Pages (automatic updates)
1. Create an empty GitHub repo, e.g. `gym-companion`, and push this folder to its `main` branch.
2. Repo **Settings → Pages → Source: GitHub Actions**.
3. The included workflow (`.github/workflows/deploy.yml`) builds and publishes on every push. Your link: `https://<your-username>.github.io/gym-companion/`.

### Option B: Netlify (drag and drop)
1. `npm run build`
2. Go to app.netlify.com/drop (free account) and drag the `dist` folder onto the page.
3. To update later: in your site's **Deploys** tab, drag the new `dist` folder onto the same site. Don't create a new site, or the link changes.

### Install on Android
1. Open your link in **Chrome** on the phone.
2. Wait a few seconds for the "App ready to work offline" message.
3. Chrome menu (⋮) → **Install app** (or "Add to Home screen"). Settings in the app also shows an **Install app** button when Chrome allows it.
4. Open it from the home screen icon. Turn on airplane mode once and check it still opens. All 49 exercise images are downloaded on install.

### Updating the app
When a new version is deployed, the app shows "A new version is available" with **Update** and **Later**. It never reloads by itself mid-workout. Updates never touch your data: the database uses versioned migrations (see section 8).

## 4. Backup and restore

All data lives only on the device it was entered on. The Mac browser and the phone **do not sync**.

- **Back up:** Settings → *Download backup (.json)*, or *Share backup* to send it to Google Drive or WhatsApp. The Home screen reminds you if you haven't backed up in 14 days.
- **Restore:** Settings → *Restore from backup file…* → pick the `.json` → confirm. A restore **replaces** everything currently in the app.
- **Spreadsheet export:** Settings → *Workout history CSV* (one row per set), plus Cardio and Body CSV.
- Always back up **before** clearing Chrome data, uninstalling, changing your hosting link, or switching phones.
- To move data between devices: back up on one, restore on the other.

## 5. Using it

Four tabs at the bottom: **Today**, **Plan**, **Progress**, **Settings**.

- **Today:** today's workout with **Start workout**, an unfinished workout to resume or discard, other days to train, this week's dots, and today's cardio.
- **Workout screen:** the bar under the header has one segment per exercise; tap a segment to jump. Each set row has weight, reps and a round **tick**: tap it to log the set, tap again to undo. *Skip set* sits under the next set to do. *How to* opens the photo, steps, form tips and logging rule. *Swap* replaces the exercise for today only. The bottom bar has previous, *Skip exercise* and *Next*.
- **Weights are references, never prescriptions:** weight boxes are pre-filled (lighter text) from the same set last time, and each row shows "Last 35 kg × 10". The app never increases them. Reps are always typed by you.
- **Rest timer:** logging a set opens the purple rest dock with a countdown ring, ±15 s, +30 s, *Set time*, pause, restart and *Skip rest*. *Hide* shrinks it to a pill so you can edit the next set.
- **Finishing:** *Finish* shows the summary (duration, sets, reps, volume, skipped exercises, comparison with the last same workout). *Save workout* stores it. *Leave unfinished* keeps it resumable. Navigating away never finishes a workout.
- **Plan:** *Week* lists each day; open one to start it, edit it (sets, reps, rest, order, alternatives, rest day) or reset it. *Exercises* is the 49 exercise library with search and muscle filters; *Use my own photo* replaces an image.
- **Progress:** *Overview* (workouts per week, exercise charts with date range, personal records), *History* (every saved workout, editable), *Body* (body weight and waist).
- **Cardio:** from Today. Treadmill warm-up (10 min, incline 3.5, 6 km/h) and 45 min evening walk are preloaded. Nothing counts as done until you log it.

### Logging conventions (consistency matters more than the convention)
- Dumbbells: weight of **one** dumbbell. Barbell / EZ bar: **total** including the bar. Machines: number on the stack (plate-loaded: plates only).
- Per-arm / per-leg exercises: reps **per side**.
- Plank: seconds held (weight optional).
- Assisted pull-up: the **assistance** weight (lower = stronger). Not counted in volume.
- Bodyweight moves (knee raises, reverse crunch, glute bridge): weight empty = bodyweight; counted in reps, not volume.
- Volume = logged weight × reps, with no multipliers.

## 6. Known limitations (honest list)

- **Timer sound when the screen is off:** the timer *time* is always correct (it stores the end timestamp and recalculates), but Android pauses web apps in the background, so the **beep/vibration only fires if the app is on screen when the rest ends**. *Keep screen on during workouts* (on by default) keeps the screen awake while the workout screen is open, which makes the beep reliable in practice. No push notifications are used, because a web app can't reliably schedule them on Android without a server.
- **Storage can be cleared:** Chrome may evict site data under extreme storage pressure, and *Clear browsing data* or uninstalling deletes it. The app asks Chrome to mark storage as persistent (Settings shows the status), but **regular JSON backups are the real safety net**.
- **No sync** between devices by design. Use backup/restore to move data.
- **Dev over Wi‑Fi (http)** can't be installed or used offline; that needs the HTTPS link.
- **Images:** 47 of 49 exercises have a verified public domain photo. Two show a placeholder (Dumbbell Romanian Deadlift, Single-Arm Machine Row). Three photos show a close variation and say so in a caption (seated cable lateral raise, band-assisted pull-up, floor crunch without weight). The photos come from a dataset that declares them public domain; see `docs/IMAGE_CREDITS.md`.
- Charts are deliberately basic. Library exercise content is read-only in Phase 1 (except your own photo); routines are fully editable.
- The JavaScript bundle is ~600 KB plus a 90 KB font, all precached once.

## 7. Tested features

Automated end-to-end test (`tests/e2e.py`, real headless Chrome, production build with service worker), run at `/` and at a `/gym-companion/` sub-path (GitHub Pages layout). **24/24 checks pass** on both:

| # | Test | Result |
|---|---|---|
| 1 | Open Monday's workout and start it | Pass |
| 2 | Switch Barbell Bench Press to Seated Chest Press Machine | Pass |
| 3 | Different weights and reps for all sets, editable | Pass |
| 4 | Completing a set starts the rest timer (120 s); +30 s, pause/resume; undo; each set independent | Pass |
| 5 | Page closed for ~6 s and reopened: timer still accurate (measured drift: 1 ms) | Pass |
| 6 | Browser refresh preserves workout progress | Pass |
| 7 | Browser fully closed and reopened: unfinished workout recovered and resumable | Pass |
| 8 | Finish workout: summary totals correct (4 sets, 41 reps, 1,225 kg), appears in history | Pass |
| 9 | Next week's workout shows previous weights; weights pre-filled 30/35/35, not increased | Pass |
| 10 | Export JSON, delete all data, restore: workouts, unfinished workout and cardio come back | Pass |
| 11 | Offline: app loads, all 49 exercise images load, workout logging works | Pass |
| 12 | Substitution tracked under the actual exercise (bench shows no history; machine has it; PR list correct) | Pass |
| + | Planned cardio not auto-completed; cardio logging; CSV export; body weight log; no JS errors | Pass |

Also verified: dev server over a LAN IP on plain http (insecure context) can start a workout, log a set, run the timer and survive a reload.

**Still to check on your actual phone** (about 10 minutes, things only a real device can show):
1. Install from your HTTPS link; the icon appears on the home screen and opens full screen.
2. Airplane mode on: the app opens, images show, you can log a set.
3. Complete a set, lock the phone for 30 s, unlock: the countdown shows the right remaining time.
4. Keep the workout screen open through a full rest: you hear the beep and feel the vibration (check the phone isn't on silent; Settings has *Test sound and vibration*).
5. Swipe the app away from recent apps mid-workout, reopen: it offers to resume.
6. Settings → *Storage protected* should say Yes once installed.
7. Download a backup and confirm the file appears in your Downloads or Drive.

To run the automated test yourself (optional): `npm run build && npx vite preview --port 4173`, then `pip install playwright && python -m playwright install chromium && python tests/e2e.py`.

## 8. Project structure

```
gym-companion/
├─ index.html
├─ vite.config.ts              # host 0.0.0.0, PWA manifest + offline precache, BASE_PATH
├─ .github/workflows/deploy.yml  # GitHub Pages deploy
├─ public/
│  ├─ icons/                   # app icons (generated)
│  └─ exercise-images/         # local exercise photos, placeholder.svg, attribution.json
├─ docs/IMAGE_CREDITS.md
├─ tests/e2e.py                # the 12 acceptance tests
└─ src/
   ├─ main.tsx                 # opens DB, seeds, renders; startup error screen
   ├─ App.tsx                  # routes (hash routing, works offline on any static host)
   ├─ db/
   │  ├─ db.ts                 # Dexie schema + versioning/migration rules
   │  ├─ types.ts              # all record types
   │  └─ seed/                 # exercise library, weekly routine, cardio plans, image map
   ├─ lib/
   │  ├─ session.ts            # workout actions (start, complete/undo/skip set, replace, finish…)
   │  ├─ stats.ts              # previous performance, PBs, summaries, comparisons
   │  ├─ timer.ts              # timestamp-based rest timer persisted in IndexedDB
   │  ├─ backup.ts             # JSON backup/restore, CSV exports
   │  ├─ device.ts             # sound, vibration, wake lock, persistent storage
   │  ├─ hooks.ts, util.ts, install.ts
   ├─ components/              # Layout, RestTimer, ExerciseImage, LineChart, ui
   └─ pages/                   # Home, Routine, Library, ActiveWorkout, WorkoutSummary,
                               # History, Progress, Cardio, Settings
```

### Data model (IndexedDB database `gym-companion`)
`exercises`, `routineDays` (weekday 1–7 with ordered items), `sessions` (each workout with its exercises and every set; `plannedExerciseId` vs actual `exerciseId`), `cardioPlans`, `cardioLogs`, `bodyLogs`, `customImages`, `kv` (settings, rest timer state, seed version, last backup time).

### Changing things safely later
- **Schema changes:** never edit `db.version(1)`. Add `db.version(2).stores(...).upgrade(...)` in `src/db/db.ts`. Dexie migrates existing data in place.
- **Library content changes:** edit `src/db/seed/exercises.ts` and bump `SEED_VERSION` in `src/db/seed/index.ts`. Only built-in library entries are refreshed; workouts, logs, your routine and your photos are never touched.
- **Images:** drop a file in `public/exercise-images/` and reference it in `src/db/seed/imageMap.ts`, or simply use *Use my own photo* in the app. The exercise data structure doesn't change.
