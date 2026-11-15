import { createContext, useContext, useMemo } from 'react'
import type { Series } from './api'
import type { ChartKind } from './dashboard'

/** What scrolling does at the end of the data: start again past the seam, jump back, or turn around. */
export type Wrap = 'loop' | 'restart' | 'reverse'

export type Pace = 'slow' | 'medium' | 'fast' | 'custom'

/** Seconds a screenful of rows, or a window of the x axis, stays in view at each pace. */
export const PACES = { slow: 30, medium: 15, fast: 8 } as const

export const WRAPS: Record<Wrap, string> = {
  loop: 'Loop seamlessly',
  restart: 'Jump to the start',
  reverse: 'Back and forth',
}

export const DEFAULT_WINDOW = 20

export const MAX_SECONDS = 3600

/** Whether a custom number of seconds a screenful can be saved. */
export const validSeconds = (seconds: number) => Number.isInteger(seconds) && seconds >= 1 && seconds <= MAX_SECONDS

/** A dashboard in full screen: whether its name shows, and whether its data scrolls, how it wraps, and how fast. */
export interface PresentationSettings {
  showTitle: boolean
  scroll: boolean
  wrap: Wrap
  pace: Pace
  /** Seconds a screenful when `pace` is custom. */
  seconds: number
}

export const DEFAULT_PRESENTATION: PresentationSettings = {
  showTitle: true,
  scroll: true,
  wrap: 'loop',
  pace: 'medium',
  seconds: PACES.medium,
}

/**
 * A chart's full-screen scrolling: as its dashboard's, off, or its own wrap and pace. `window` is how many x values
 * an x-axis chart shows at once.
 */
export interface ChartPresentation {
  follow: 'dashboard' | 'off' | 'own'
  wrap: Wrap
  pace: Pace
  seconds: number
  window: number
}

/** How one chart scrolls in full screen. */
export interface ScrollPlan {
  seconds: number
  wrap: Wrap
  window: number
}

/** The charts whose data moves in full screen. */
export const MOVING_KINDS: readonly ChartKind[] = [
  'table',
  'pivot',
  'bar',
  'stacked',
  'pictorial',
  'line',
  'area',
  'scatter',
  'ripple',
  'histogram',
  'boxplot',
  'candlestick',
  'heatmap',
]

export const secondsOf = ({ pace, seconds }: { pace: Pace; seconds: number }) => (pace === 'custom' ? seconds : PACES[pace])

/** How a chart scrolls, from its own settings and its dashboard's, or null when it stays still. */
export function planFor(kind: ChartKind, dashboard: PresentationSettings, chart: ChartPresentation | undefined): ScrollPlan | null {
  if (!MOVING_KINDS.includes(kind)) return null
  const window = chart?.window ?? DEFAULT_WINDOW
  if (chart?.follow === 'off') return null
  if (chart?.follow === 'own') return { seconds: secondsOf(chart), wrap: chart.wrap, window }
  return dashboard.scroll ? { seconds: secondsOf(dashboard), wrap: dashboard.wrap, window } : null
}

/** The dashboard's presentation settings while it is in full screen; null while it is not. */
export const PresentationContext = createContext<PresentationSettings | null>(null)

/** Whether the chart is being presented, and how it scrolls if so. */
export function usePresentation(kind: ChartKind, chart: ChartPresentation | undefined) {
  const dashboard = useContext(PresentationContext)
  const plan = useMemo(() => (dashboard ? planFor(kind, dashboard, chart) : null), [dashboard, kind, chart])
  return { presenting: dashboard !== null, plan }
}

/**
 * The x positions a full-screen window slides over, in order: the x values of a number or time axis, or each category's
 * index on a category axis.
 */
export function xPositions(kind: ChartKind, data: Series): number[] {
  const byValue = (['line', 'area', 'bar', 'scatter', 'ripple'] as ChartKind[]).includes(kind) && data.xType !== 'category'
  if (byValue) return [...new Set(data.points.map((point) => Number(point[0])))].sort((a, b) => a - b)
  const crossed = kind === 'stacked' || kind === 'heatmap'
  const count = crossed ? new Set(data.points.map((point) => String(point[0]))).size : data.points.length
  return Array.from({ length: count }, (_, i) => i)
}
