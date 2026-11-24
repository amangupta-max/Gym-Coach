import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { act, Btn, Card, PageTitle, Section, toast, toastError } from '../components/ui'
import { DB_SCHEMA_VERSION, db, getKV } from '../db/db'
import { SEED_VERSION } from '../db/seed'
import { defaultRoutine } from '../db/seed/routine'
import {
  bodyCsv,
  cardioCsv,
  downloadBlob,
  exportBackupFile,
  parseBackupFile,
  restoreBackup,
  wipeAllData,
  workoutCsv,
  type BackupFile,
} from '../lib/backup'
import { isStandalone, playBeep, requestPersistentStorage, storageInfo, unlockAudio, vibrate, wakeLockSupported } from '../lib/device'
import { updateSettings, useSettings } from '../lib/hooks'
import { getInstallPrompt, onInstallPromptChange } from '../lib/install'
import { fmtDate, fmtTime, localDate } from '../lib/util'

function Toggle({ label, checked, onChange, note }: { label: string; checked: boolean; onChange: (v: boolean) => void; note?: string }) {
  return (
    <label className="flex items-start gap-3 py-2">
      <input type="checkbox" className="mt-0.5 h-6 w-6 shrink-0" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block font-medium">{label}</span>
        {note && <span className="block text-xs text-slate-500">{note}</span>}
      </span>
    </label>
  )
}

function fmtBytes(n: number | null) {
  if (n === null) return 'unknown'
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export default function Settings() {
  const settings = useSettings()
  const lastBackup = useLiveQuery(() => getKV<number | null>('lastBackupAt', null), [])
  const counts = useLiveQuery(async () => ({ sessions: await db.sessions.count(), cardio: await db.cardioLogs.count(), body: await db.bodyLogs.count() }), [])
  const [storage, setStorage] = useState<Awaited<ReturnType<typeof storageInfo>> | null>(null)
  const [pending, setPending] = useState<BackupFile | null>(null)
  const [installable, setInstallable] = useState(!!getInstallPrompt())

  useEffect(() => {
    void storageInfo().then(setStorage)
    return onInstallPromptChange(() => setInstallable(!!getInstallPrompt()))
  }, [])

  const downloadBackup = act(async () => {
    const file = await exportBackupFile()
    downloadBlob(file, file.name)
  }, 'Backup downloaded. Keep it somewhere safe (e.g. Google Drive).')

  const shareBackup = act(async () => {
    const file = await exportBackupFile()
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Gym Companion backup' })
    else downloadBlob(file, file.name)
  })

  return (
    <div>
      <PageTitle>Settings</PageTitle>

      <Section title="Backup and restore">
        <Card>
          <p className="text-sm text-slate-700">
            All data is stored only on this device. Phone and computer do not sync. Back up before clearing browser data, uninstalling, or switching phones.
          </p>
          <p className="mt-1 text-sm" data-testid="last-backup">
            Last backup: {lastBackup ? `${fmtDate(lastBackup)} ${fmtTime(lastBackup)}` : 'never'}
          </p>
          <div className="mt-3 grid gap-2">
            <Btn variant="primary" onClick={downloadBackup} data-testid="export-json">
              Download backup (.json)
            </Btn>
            {'share' in navigator && <Btn onClick={shareBackup}>Share backup to Drive / WhatsApp…</Btn>}
            <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white px-4 font-medium">
              Restore from backup file…
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                data-testid="restore-input"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) parseBackupFile(f).then(setPending).catch(toastError)
                }}
              />
            </label>
          </div>
          {pending && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm" data-testid="restore-confirm">
              <div className="font-semibold">Restore this backup?</div>
              <div>Made {new Date(pending.exportedAt).toLocaleString()}</div>
              <div>
                {pending.counts?.sessions ?? pending.tables.sessions?.length ?? 0} workouts, {pending.counts?.cardioLogs ?? 0} cardio logs, {pending.counts?.bodyLogs ?? 0} body logs
              </div>
              <p className="mt-1 text-amber-900">This REPLACES everything currently in the app ({counts?.sessions ?? 0} workouts). Download a backup of the current data first if you might need it.</p>
              <div className="mt-2 flex gap-2">
                <Btn
                  variant="danger"
                  data-testid="restore-confirm-button"
                  onClick={() => {
                    restoreBackup(pending)
                      .then(() => {
                        setPending(null)
                        toast('Backup restored.', 'success')
                      })
                      .catch(toastError)
                  }}
                >
                  Replace my data
                </Btn>
                <Btn onClick={() => setPending(null)}>Cancel</Btn>
              </div>
            </div>
          )}
        </Card>
      </Section>

      <Section title="Export to spreadsheet (CSV)">
        <Card>
          <div className="grid gap-2">
            <Btn onClick={act(async () => downloadBlob(await workoutCsv(), `gym-workouts-${localDate()}.csv`))} data-testid="export-csv">
              Workout history CSV (one row per set)
            </Btn>
            <Btn onClick={act(async () => downloadBlob(await cardioCsv(), `gym-cardio-${localDate()}.csv`))}>Cardio CSV</Btn>
            <Btn onClick={act(async () => downloadBlob(await bodyCsv(), `gym-body-${localDate()}.csv`))}>Body weight and waist CSV</Btn>
          </div>
        </Card>
      </Section>

      <Section title="Workout">
        <Card>
          <Toggle label="Start rest timer automatically" checked={settings.autoStartTimer} onChange={(v) => void updateSettings({ autoStartTimer: v })} />
          <Toggle
            label="Sound when rest ends"
            checked={settings.soundEnabled}
            onChange={(v) => void updateSettings({ soundEnabled: v })}
            note="Plays only while the app is on screen. Android pauses web apps in the background, so a locked phone may stay silent."
          />
          <Toggle label="Vibrate when rest ends" checked={settings.vibrationEnabled} onChange={(v) => void updateSettings({ vibrationEnabled: v })} />
          <Toggle
            label="Keep screen on during workouts"
            checked={settings.keepScreenAwake}
            onChange={(v) => void updateSettings({ keepScreenAwake: v })}
            note={wakeLockSupported() ? 'Recommended: keeps the timer sound working between sets. Uses a bit more battery.' : 'Not supported in this browser.'}
          />
          <Btn
            small
            className="mt-1"
            onClick={() => {
              unlockAudio()
              playBeep()
              vibrate()
            }}
          >
            Test sound and vibration
          </Btn>
        </Card>
      </Section>

      <Section title="App and storage">
        <Card>
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-slate-500">Installed as app</dt>
            <dd>{isStandalone() ? 'Yes' : 'No (running in browser)'}</dd>
            <dt className="text-slate-500">Storage protected</dt>
            <dd data-testid="persisted">{storage?.persisted === null ? 'unknown' : storage?.persisted ? 'Yes' : 'No'}</dd>
            <dt className="text-slate-500">Storage used</dt>
            <dd>{fmtBytes(storage?.usage ?? null)}</dd>
            <dt className="text-slate-500">Saved records</dt>
            <dd>
              {counts ? `${counts.sessions} workouts · ${counts.cardio} cardio · ${counts.body} body` : '…'}
            </dd>
            <dt className="text-slate-500">Version</dt>
            <dd>
              {__APP_VERSION__} · db v{DB_SCHEMA_VERSION} · library v{SEED_VERSION}
            </dd>
          </dl>
          {storage?.persisted === false && (
            <Btn
              small
              className="mt-2"
              onClick={() =>
                void requestPersistentStorage().then((ok) => {
                  toast(ok ? 'Storage is now protected.' : 'The browser declined. Installing the app usually allows it.', ok ? 'success' : 'info')
                  void storageInfo().then(setStorage)
                })
              }
            >
              Protect storage from automatic cleanup
            </Btn>
          )}
          {installable && !isStandalone() && (
            <Btn variant="primary" className="mt-2 w-full" onClick={() => void getInstallPrompt()?.prompt()}>
              Install app on this device
            </Btn>
          )}
          {!isStandalone() && (
            <p className="mt-2 text-xs text-slate-500">To install on Android: open the Chrome menu (⋮) and tap “Install app” or “Add to Home screen”.</p>
          )}
        </Card>
      </Section>

      <Section title="Danger zone">
        <Card className="border-red-200">
          <div className="grid gap-2">
            <Btn
              variant="danger"
              onClick={act(async () => {
                if (!window.confirm('Reset the whole weekly routine to the original plan? Your routine edits will be lost. Workout history is NOT affected.')) return
                await db.transaction('rw', db.routineDays, async () => {
                  await db.routineDays.clear()
                  await db.routineDays.bulkAdd(defaultRoutine())
                })
                toast('Routine reset.')
              })}
            >
              Reset routine to default
            </Btn>
            <Btn
              variant="danger"
              onClick={act(async () => {
                const answer = window.prompt('This deletes ALL workouts, logs and settings on this device. Type DELETE to confirm.')
                if (answer !== 'DELETE') return toast('Nothing was deleted.')
                await wipeAllData()
                toast('All data deleted.')
              })}
            >
              Delete all data
            </Btn>
          </div>
        </Card>
      </Section>
    </div>
  )
}
