import { useLiveQuery } from 'dexie-react-hooks'
import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { db } from '../db/db'
import { useRestTimer } from '../lib/hooks'
import { fmtClock } from '../lib/util'
import { Btn, toast } from './ui'

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/routine', label: 'Routine' },
  { to: '/library', label: 'Library' },
  { to: '/history', label: 'History' },
  { to: '/progress', label: 'Progress' },
  { to: '/settings', label: 'Settings' },
]

function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(err) {
      console.warn('Service worker registration failed', err)
    },
  })
  useEffect(() => {
    if (offlineReady) {
      toast('App ready to work offline.', 'success')
      setOfflineReady(false)
    }
  }, [offlineReady, setOfflineReady])
  if (!needRefresh) return null
  return (
    <div className="flex items-center justify-between gap-2 bg-sky-100 px-3 py-2 text-sm text-sky-900">
      <span>A new version is available. Your data is kept.</span>
      <div className="flex gap-1">
        <Btn small variant="ghost" onClick={() => setNeedRefresh(false)}>
          Later
        </Btn>
        <Btn small variant="primary" onClick={() => void updateServiceWorker(true)}>
          Update
        </Btn>
      </div>
    </div>
  )
}

function ResumeBar() {
  const session = useLiveQuery(() => db.sessions.where('status').equals('in_progress').first(), [])
  const { timer, remaining } = useRestTimer()
  if (!session) return null
  return (
    <Link
      to={`/workout/${session.id}`}
      className="flex items-center justify-between bg-amber-100 px-4 py-2 text-sm font-medium text-amber-950"
      data-testid="resume-bar"
    >
      <span>Unfinished workout: {session.name}</span>
      <span>{timer.status === 'running' ? `Rest ${fmtClock(remaining)} · ` : ''}Resume ›</span>
    </Link>
  )
}

export function Layout() {
  const loc = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [loc.pathname])
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <UpdateBanner />
      <ResumeBar />
      <main className="flex-1 px-4 pt-4 pb-24">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-lg grid-cols-6">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex min-h-14 items-center justify-center px-1 text-center text-[12px] font-medium ${isActive ? 'text-emerald-700' : 'text-slate-600'}`
              }
            >
              {({ isActive }) => <span className={isActive ? 'border-b-2 border-emerald-600 pb-0.5' : ''}>{n.label}</span>}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

/** Full-screen layout without bottom nav, for the active workout. */
export function FocusLayout() {
  return (
    <div className="mx-auto min-h-dvh max-w-lg">
      <UpdateBanner />
      <Outlet />
    </div>
  )
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info)
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto max-w-lg p-6">
        <h1 className="text-xl font-bold">Something went wrong</h1>
        <p className="mt-2 text-slate-700">Your saved data is still in the app's storage. Reloading usually fixes this.</p>
        <pre className="mt-3 overflow-auto rounded bg-slate-100 p-2 text-xs">{this.state.error.message}</pre>
        <div className="mt-4 flex gap-2">
          <Btn variant="primary" onClick={() => location.reload()}>
            Reload
          </Btn>
          <Btn
            onClick={() => {
              location.hash = '#/settings'
              location.reload()
            }}
          >
            Open Settings (backup)
          </Btn>
        </div>
      </div>
    )
  }
}
