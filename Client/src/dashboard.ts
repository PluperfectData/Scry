export const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 } as const

export type Breakpoint = keyof typeof BREAKPOINTS

export const COLS: Record<Breakpoint, number> = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }

export const AGGREGATES = ['sum', 'avg', 'min', 'max', 'count'] as const

export type Aggregate = (typeof AGGREGATES)[number]

export const CHART_KINDS = ['bar', 'line', 'pie', 'scatter', 'candlestick', 'table'] as const

export type ChartKind = (typeof CHART_KINDS)[number]

export const CHART_LABELS: Record<ChartKind, string> = {
  bar: 'Bar',
  line: 'Line',
  pie: 'Pie',
  scatter: 'Scatter',
  candlestick: 'Candlestick',
  table: 'Table',
}

/** One item's place in a react-grid-layout grid, in grid units. */
export interface GridItem {
  i: string
  x: number
  y: number
  w: number
  h: number
}

/** A layout for each breakpoint, so a dashboard keeps its own arrangement at every width. */
export type Layouts = Partial<Record<Breakpoint, GridItem[]>>

interface WidgetBase {
  id: string
  title: string
  sourceId: number
}

/** y aggregated per value of x. */
export interface SeriesWidget extends WidgetBase {
  kind: 'line' | 'bar' | 'pie'
  x: string
  y: string | null
  aggregate: Aggregate
}

/** One point per row. */
export interface ScatterWidget extends WidgetBase {
  kind: 'scatter'
  x: string
  y: string
}

/** One candle per row. */
export interface CandlestickWidget extends WidgetBase {
  kind: 'candlestick'
  x: string
  open: string
  high: string
  low: string
  close: string
}

/** The source's rows; no columns chosen means every column. */
export interface TableWidget extends WidgetBase {
  kind: 'table'
  columns: string[]
}

export type Widget = SeriesWidget | ScatterWidget | CandlestickWidget | TableWidget

type WithoutNames<T> = T extends unknown ? Omit<T, 'id' | 'title'> : never

/** A widget's settings, before it has an id or a title. */
export type WidgetSettings = WithoutNames<Widget>

const WIDGET_WIDTH = 6
const WIDGET_HEIGHT = 7

const breakpoints = Object.keys(BREAKPOINTS) as Breakpoint[]

/** Places a new widget at the left, below everything else, in every breakpoint's layout. */
export function addWidget(layouts: Layouts, id: string): Layouts {
  const next: Layouts = {}
  for (const breakpoint of breakpoints) {
    const items = layouts[breakpoint] ?? []
    const bottom = items.reduce((lowest, item) => Math.max(lowest, item.y + item.h), 0)
    next[breakpoint] = [
      ...items,
      { i: id, x: 0, y: bottom, w: Math.min(WIDGET_WIDTH, COLS[breakpoint]), h: WIDGET_HEIGHT },
    ]
  }
  return next
}

export function removeWidget(layouts: Layouts, id: string): Layouts {
  const next: Layouts = {}
  for (const breakpoint of breakpoints) {
    const items = layouts[breakpoint]
    if (items) next[breakpoint] = items.filter((item) => item.i !== id)
  }
  return next
}

/** Keeps only the known breakpoints and the fields Scry stores from react-grid-layout's layouts. */
export function toLayouts(layouts: Partial<Record<string, readonly GridItem[]>>): Layouts {
  const next: Layouts = {}
  for (const breakpoint of breakpoints) {
    const items = layouts[breakpoint]
    if (items) next[breakpoint] = items.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }))
  }
  return next
}

const AGGREGATE_NAMES: Record<Aggregate, string> = {
  sum: 'Sum',
  avg: 'Average',
  min: 'Minimum',
  max: 'Maximum',
  count: 'Count',
}

export function titleFor(settings: WidgetSettings): string {
  switch (settings.kind) {
    case 'line':
    case 'bar':
    case 'pie':
      return settings.aggregate === 'count'
        ? `Count by ${settings.x}`
        : `${AGGREGATE_NAMES[settings.aggregate]} of ${settings.y} by ${settings.x}`
    case 'scatter':
      return `${settings.y} against ${settings.x}`
    case 'candlestick':
      return `${settings.open}, ${settings.high}, ${settings.low}, and ${settings.close} by ${settings.x}`
    case 'table':
      return settings.columns.length > 0 ? settings.columns.join(', ') : 'All columns'
  }
}
