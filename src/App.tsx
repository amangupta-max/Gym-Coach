import { createHashRouter, Navigate, RouterProvider } from 'react-router'
import { ErrorBoundary, FocusLayout, Layout } from './components/Layout'
import { TimerWatcher } from './components/RestTimer'
import { Toaster } from './components/ui'
import ActiveWorkout from './pages/ActiveWorkout'
import Cardio from './pages/Cardio'
import { HistoryDetail, HistoryList } from './pages/History'
import Home from './pages/Home'
import { ExerciseDetail, LibraryList } from './pages/Library'
import Progress from './pages/Progress'
import { RoutineDayPage, RoutineList } from './pages/Routine'
import Settings from './pages/Settings'
import WorkoutSummary from './pages/WorkoutSummary'

// Hash routing: works on any static host (GitHub Pages, Netlify) and offline
// without server rewrite rules.
const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/routine', element: <RoutineList /> },
      { path: '/routine/:weekday', element: <RoutineDayPage /> },
      { path: '/library', element: <LibraryList /> },
      { path: '/library/:id', element: <ExerciseDetail /> },
      { path: '/history', element: <HistoryList /> },
      { path: '/history/:id', element: <HistoryDetail /> },
      { path: '/progress', element: <Progress /> },
      { path: '/cardio', element: <Cardio /> },
      { path: '/settings', element: <Settings /> },
    ],
  },
  {
    element: <FocusLayout />,
    children: [
      { path: '/workout/:id', element: <ActiveWorkout /> },
      { path: '/workout/:id/finish', element: <WorkoutSummary /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])

export default function App() {
  return (
    <ErrorBoundary>
      <TimerWatcher />
      <Toaster />
      <RouterProvider router={router} />
    </ErrorBoundary>
  )
}
