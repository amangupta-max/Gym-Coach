import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 22, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  )
}

export const IconToday = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="3.5" />
    <path d="M3.5 10h17M8.5 3v4M15.5 3v4" />
    <circle cx="12" cy="15.2" r="1.6" fill="currentColor" stroke="none" />
  </Svg>
)
export const IconPlan = (p: P) => (
  <Svg {...p}>
    <path d="M9 6.5h11M9 12h11M9 17.5h11" />
    <circle cx="4.75" cy="6.5" r="1.25" fill="currentColor" stroke="none" />
    <circle cx="4.75" cy="12" r="1.25" fill="currentColor" stroke="none" />
    <circle cx="4.75" cy="17.5" r="1.25" fill="currentColor" stroke="none" />
  </Svg>
)
export const IconProgress = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 17.5l5.5-5.5 4 4 7.5-8" />
    <path d="M15 8h5.5v5.5" />
  </Svg>
)
export const IconSettings = (p: P) => (
  <Svg {...p}>
    <path d="M4 7.5h9M17.5 7.5H20M4 16.5h3M11.5 16.5H20" />
    <circle cx="15.25" cy="7.5" r="2.25" />
    <circle cx="9.25" cy="16.5" r="2.25" />
  </Svg>
)
export const IconCheck = (p: P) => (
  <Svg strokeWidth={2.6} {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
)
export const IconX = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
)
export const IconChevronLeft = (p: P) => (
  <Svg {...p}>
    <path d="M14.5 5.5L8 12l6.5 6.5" />
  </Svg>
)
export const IconChevronRight = (p: P) => (
  <Svg {...p}>
    <path d="M9.5 5.5L16 12l-6.5 6.5" />
  </Svg>
)
export const IconChevronDown = (p: P) => (
  <Svg {...p}>
    <path d="M5.5 9.5L12 16l6.5-6.5" />
  </Svg>
)
export const IconPlus = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)
export const IconSwap = (p: P) => (
  <Svg {...p}>
    <path d="M7 4.5L3.5 8 7 11.5M3.5 8h13M17 12.5l3.5 3.5-3.5 3.5M20.5 16h-13" />
  </Svg>
)
export const IconBook = (p: P) => (
  <Svg {...p}>
    <path d="M12 6.5c-2-1.5-5-2-8-1.5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5zM12 6.5v13" />
  </Svg>
)
export const IconPause = (p: P) => (
  <Svg {...p}>
    <path d="M9 5.5v13M15 5.5v13" strokeWidth={2.4} />
  </Svg>
)
export const IconPlay = (p: P) => (
  <Svg {...p}>
    <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
  </Svg>
)
export const IconSkip = (p: P) => (
  <Svg {...p}>
    <path d="M5.5 6l8 6-8 6zM17.5 6v12" />
  </Svg>
)
export const IconSearch = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4 4" />
  </Svg>
)
export const IconShield = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.5l7 2.8v5.2c0 4.3-3 7.6-7 9-4-1.4-7-4.7-7-9V6.3z" />
    <path d="M9 12l2 2 4-4" />
  </Svg>
)
export const IconRestart = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4" />
  </Svg>
)
