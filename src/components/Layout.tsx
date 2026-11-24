import { useLiveQuery } from 'dexie-react-hooks'
import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { db } from '../db/db'
import { useRestTimer } from '../lib/hooks'
import { fmtClock } from '../lib/util'
import { IconChevronRight, IconPlan, IconProgress, IconSettings, IconToday } from './icons'
import { Btn, toast } from './ui'

const NAV = [
  { to: '/', label: 'Today', icon: IconToday, match: (p: string) => p === '/' || p.startsWith('/cardio') },
  { to: '/routine', label: 'Plan', icon: IconPlan, match: (p: string) => p.startsWith('/routine') || p.startsWith('/library') },
  { to: '/progress', label: 'Progress', icon: IconProgress, match: (p: string) => p.startsWith('/progress') || p.startsWith('/history') || p.startsWith('/body') },
  { to: '/settings', label: 'Settings', icon: IconSettings, match: (p: string) => p.startsWith('/settings') },
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
    <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-2xl border border-iris-800 bg-iris-950 px-4 py-3 text-[15px]">
      <span className="text-ink-200">New version ready. Your data stays.</span>
      <div className="flex shrink-0 gap-1">
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
  const loc = useLocation()
  if (!session || loc.pathname === '/') return null
  return (
    <Link
      to={`/workout/${session.id}`}
      className="bg-drive fixed inset-x-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-[calc(32rem-2rem)] items-center justify-between rounded-full py-3 pr-3 pl-5 shadow-[0_10px_30px_rgb(80_22_168/0.45)]"
      data-testid="resume-bar"
    >
      <span className="font-semibold">{session.name} in progress</span>
      <span className="flex items-center gap-1 text-[15px] text-iris-100">
        {timer.status === 'running' && <span className="num mr-1 text-[15px]">{fmtClock(remaining)}</span>}
        Resume
        <IconChevronRight size={18} />
      </span>
    </Link>
  )
}

export function Layout() {
  const loc = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [loc.pathname])
  return (
    <div className="relative mx-auto flex min-h-dvh max-w-lg flex-col">
      <UpdateBanner />
      <main className="flex-1 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-40">
        <Outlet />
      </main>
      <ResumeBar />
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-800 bg-ink-1000/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md" aria-label="Main">
        <div className="mx-auto grid max-w-lg grid-cols-4">
          {NAV.map((n) => {
            const active = n.match(loc.pathname)
            const Icon = n.icon
            return (
              <Link
                key={n.to}
                to={n.to}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[12px] font-medium ${active ? 'text-ink-100' : 'text-ink-400'}`}
              >
                <Icon className={active ? 'text-iris-300' : ''} />
                {n.label}
              </Link>
            )
          })}
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
        <h1 className="display text-2xl">Something went wrong</h1>
        <p className="mt-2 text-ink-300">Your saved data is still on this phone. Reloading usually fixes this.</p>
        <pre className="mt-4 overflow-auto rounded-xl bg-ink-900 p-3 text-xs text-ink-300">{this.state.error.message}</pre>
        <div className="mt-5 flex gap-2">
          <Btn variant="primary" onClick={() => location.reload()}>
            Reload
          </Btn>
          <Btn
            onClick={() => {
              location.hash = '#/settings'
              location.reload()
            }}
          >
            Open backup
          </Btn>
        </div>
      </div>
    )
  }
}
