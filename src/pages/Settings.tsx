import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, type ReactNode } from 'react'
import { IconChevronRight } from '../components/icons'
import { act, Btn, Group, PageTitle, Section, Switch, toast, toastError } from '../components/ui'
import { DB_SCHEMA_VERSION, db, getKV } from '../db/db'
import { SEED_VERSION } from '../db/seed'
import { defaultRoutine } from '../db/seed/routine'
import { bodyCsv, cardioCsv, downloadBlob, exportBackupFile, parseBackupFile, restoreBackup, wipeAllData, workoutCsv, type BackupFile } from '../lib/backup'
import { isStandalone, playBeep, requestPersistentStorage, storageInfo, unlockAudio, vibrate, wakeLockSupported } from '../lib/device'
import { updateSettings, useSettings } from '../lib/hooks'
import { getInstallPrompt, onInstallPromptChange } from '../lib/install'
import { fmtDate, fmtTime, localDate } from '../lib/util'

function fmtBytes(n: number | null) {
  if (n === null) return 'unknown'
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function Row({ children, onClick, testId, tone }: { children: ReactNode; onClick: () => void; testId?: string; tone?: 'danger' | 'accent' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left active:bg-ink-850 ${tone === 'danger' ? 'text-rose-400' : tone === 'accent' ? 'font-semibold text-iris-300' : 'text-ink-100'}`}
    >
      <span>{children}</span>
      <IconChevronRight size={18} className="shrink-0 text-ink-600" />
    </button>
  )
}

function Info({ label, value, testId }: { label: string; value: ReactNode; testId?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3">
      <span className="text-ink-300">{label}</span>
      <span className="text-right text-ink-100" data-testid={testId}>
        {value}
      </span>
    </div>
  )
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
  }, 'Backup downloaded. Keep a copy somewhere safe, like Google Drive.')

  const shareBackup = act(async () => {
    const file = await exportBackupFile()
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Gym Companion backup' })
    else downloadBlob(file, file.name)
  })

  return (
    <div>
      <PageTitle>Settings</PageTitle>

      <Section title="Backup" className="mt-2">
        <p className="mb-3 px-1 text-[15px] leading-snug text-ink-400">
          Everything lives only on this phone and nothing syncs. Back up before clearing Chrome data or switching phones.{' '}
          <span className="text-ink-300" data-testid="last-backup">
            Last backup: {lastBackup ? `${fmtDate(lastBackup)}, ${fmtTime(lastBackup)}` : 'never'}.
          </span>
        </p>
        <Btn variant="primary" className="w-full" onClick={downloadBackup} data-testid="export-json">
          Download backup
        </Btn>
        <Group className="mt-3">
          {'share' in navigator && <Row onClick={shareBackup}>Share backup to Drive or WhatsApp</Row>}
          <label className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3.5 active:bg-ink-850">
            <span>Restore from a backup file</span>
            <IconChevronRight size={18} className="text-ink-600" />
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
        </Group>
        {pending && (
          <div className="mt-3 rounded-2xl border border-rose-400/40 bg-ink-900 p-4" data-testid="restore-confirm">
            <div className="font-semibold">Replace everything with this backup?</div>
            <p className="mt-1 text-[15px] text-ink-300">
              Made {new Date(pending.exportedAt).toLocaleString()}, with {pending.counts?.sessions ?? pending.tables.sessions?.length ?? 0} workouts, {pending.counts?.cardioLogs ?? 0} cardio logs and {pending.counts?.bodyLogs ?? 0} body logs.
            </p>
            <p className="mt-2 text-[15px] text-ink-300">The {counts?.sessions ?? 0} workouts on this phone now will be replaced. Download a backup first if you might need them.</p>
            <div className="mt-4 flex gap-2">
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
              <Btn variant="ghost" onClick={() => setPending(null)}>
                Cancel
              </Btn>
            </div>
          </div>
        )}
      </Section>

      <Section title="Export to a spreadsheet">
        <Group>
          <Row onClick={act(async () => downloadBlob(await workoutCsv(), `gym-workouts-${localDate()}.csv`))} testId="export-csv">
            Workouts, one row per set
          </Row>
          <Row onClick={act(async () => downloadBlob(await cardioCsv(), `gym-cardio-${localDate()}.csv`))}>Cardio</Row>
          <Row onClick={act(async () => downloadBlob(await bodyCsv(), `gym-body-${localDate()}.csv`))}>Body weight and waist</Row>
        </Group>
      </Section>

      <Section title="Workout">
        <Group>
          <Switch label="Start rest timer when I log a set" checked={settings.autoStartTimer} onChange={(v) => void updateSettings({ autoStartTimer: v })} />
          <Switch
            label="Sound when rest ends"
            checked={settings.soundEnabled}
            onChange={(v) => void updateSettings({ soundEnabled: v })}
            note="Plays only while the app is on screen. Android pauses web apps in the background."
          />
          <Switch label="Vibrate when rest ends" checked={settings.vibrationEnabled} onChange={(v) => void updateSettings({ vibrationEnabled: v })} />
          <Switch
            label="Keep screen on during workouts"
            checked={settings.keepScreenAwake}
            onChange={(v) => void updateSettings({ keepScreenAwake: v })}
            note={wakeLockSupported() ? 'Keeps the rest alert working between sets. Uses a little more battery.' : 'Not supported in this browser.'}
          />
          <Row
            onClick={() => {
              unlockAudio()
              playBeep()
              vibrate()
            }}
          >
            Test sound and vibration
          </Row>
        </Group>
      </Section>

      <Section title="App and storage">
        <Group>
          <Info label="Installed as an app" value={isStandalone() ? 'Yes' : 'No, running in Chrome'} />
          <Info label="Protected from cleanup" value={storage?.persisted === null ? 'Unknown' : storage?.persisted ? 'Yes' : 'No'} testId="persisted" />
          <Info label="Storage used" value={fmtBytes(storage?.usage ?? null)} />
          <Info label="Saved" value={counts ? `${counts.sessions} workouts, ${counts.cardio} cardio, ${counts.body} body` : '…'} />
          <Info label="Version" value={`${__APP_VERSION__}, data v${DB_SCHEMA_VERSION}, library v${SEED_VERSION}`} />
          {storage?.persisted === false && (
            <Row
              tone="accent"
              onClick={() =>
                void requestPersistentStorage().then((ok) => {
                  toast(ok ? 'Storage is now protected.' : 'Chrome declined. Installing the app usually allows it.', ok ? 'success' : 'info')
                  void storageInfo().then(setStorage)
                })
              }
            >
              Protect storage from cleanup
            </Row>
          )}
          {installable && !isStandalone() && (
            <Row tone="accent" onClick={() => void getInstallPrompt()?.prompt()}>
              Install app on this phone
            </Row>
          )}
        </Group>
        {!isStandalone() && <p className="mt-2 px-1 text-[14px] text-ink-500">To install: Chrome menu, then Install app.</p>}
      </Section>

      <Section title="Reset">
        <Group>
          <Row
            tone="danger"
            onClick={act(async () => {
              if (!window.confirm('Reset the weekly routine to the original plan? Your routine edits will be lost. Workout history stays.')) return
              await db.transaction('rw', db.routineDays, async () => {
                await db.routineDays.clear()
                await db.routineDays.bulkAdd(defaultRoutine())
              })
              toast('Routine reset.')
            })}
          >
            Reset routine to the original plan
          </Row>
          <Row
            tone="danger"
            onClick={act(async () => {
              const answer = window.prompt('This deletes ALL workouts, logs and settings on this phone. Type DELETE to confirm.')
              if (answer !== 'DELETE') return toast('Nothing was deleted.')
              await wipeAllData()
              toast('All data deleted.')
            })}
          >
            Delete all data
          </Row>
        </Group>
      </Section>
    </div>
  )
}
