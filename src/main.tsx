import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { db } from './db/db'
import { ensureSeed } from './db/seed'
import { requestPersistentStorage } from './lib/device'
import { initInstallPrompt } from './lib/install'
import './index.css'

initInstallPrompt()

const root = createRoot(document.getElementById('root')!)

function fatal(message: string, detail?: unknown) {
  console.error(message, detail)
  root.render(
    <div style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 520, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Gym Companion could not start</h1>
      <p style={{ marginTop: 8 }}>{message}</p>
      <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', fontSize: 12, background: '#f1f5f9', padding: 8 }}>{String(detail ?? '')}</pre>
      <button style={{ marginTop: 12, padding: '10px 16px', border: '1px solid #cbd5e1', borderRadius: 8 }} onClick={() => location.reload()}>
        Reload
      </button>
    </div>,
  )
}

// If another tab upgrades the database schema, this tab must reload.
db.on('versionchange', () => {
  db.close()
  if (window.confirm('Gym Companion was updated in another tab. Reload now? Your data is safe.')) location.reload()
  return false
})

db.open()
  .then(() => ensureSeed())
  .then(() => {
    void requestPersistentStorage()
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
  .catch((e) => fatal('The local database could not be opened. Private/incognito mode or blocked site storage can cause this.', e?.message ?? e))
