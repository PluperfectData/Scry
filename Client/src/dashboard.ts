export const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 } as const

export type Breakpoint = keyof typeof BREAKPOINTS

export const COLS: Record<Breakpoint, number> = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }

export const AGGREGATES = ['sum', 'avg', 'min', 'max', 'count'] as const

export type Aggregate = (typeof AGGREGATES)[number]

export const CHART_KINDS = [
  'bar',
  'stacked',
  'pictorial',
  'line',
  'area',
  'themeriver',
  'pie',
  'funnel',
  'scatter',
  'ripple',
  'heatmap',
  'histogram',
  'boxplot',
  'parallel',
  'radar',
  'treemap',
  'sunburst',
  'tree',
  'sankey',
  'graph',
  'chord',
  'map',
  'flows',
  'gauge',
  'candlestick',
  'table',
] as const

export type ChartKind = (typeof CHART_KINDS)[number]

export const CHART_LABELS: Record<ChartKind, string> = {
  bar: 'Bar',
  stacked: 'Stacked bar',
  pictorial: 'Pictorial bar',
  line: 'Line',
  area: 'Area',
  themeriver: 'Theme river',
  pie: 'Pie',
  funnel: 'Funnel',
  scatter: 'Scatter',
  ripple: 'Ripple scatter',
  heatmap: 'Heatmap',
  histogram: 'Histogram',
  boxplot: 'Box plot',
  parallel: 'Parallel coordinates',
  radar: 'Radar',
  treemap: 'Treemap',
  sunburst: 'Sunburst',
  tree: 'Tree',
  sankey: 'Sankey',
  graph: 'Network graph',
  chord: 'Chord',
  map: 'Region map',
  flows: 'Flow map',
  gauge: 'Gauge',
  candlestick: 'Candlestick',
  table: 'Table',
}

export const MAPS = { world: 'World countries', usa: 'US states' } as const

export type MapName = keyof typeof MAPS

export const MAX_VALUES = 12

export const DEFAULT_BINS = 20
export const MAX_BINS = 200
export const MAX_LEVELS = 4
export const MIN_RADAR_MEASURES = 3

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
  kind: 'line' | 'area' | 'bar' | 'pictorial' | 'pie' | 'funnel'
  x: string
  y: string | null
  aggregate: Aggregate
}

/** y aggregated per pair of x and group: a bar stack, a heatmap row, or a river stream per group. */
export interface GroupedWidget extends WidgetBase {
  kind: 'stacked' | 'heatmap' | 'themeriver'
  x: string
  group: string
  y: string | null
  aggregate: Aggregate
}

/** Equal-width bins over one number column. */
export interface HistogramWidget extends WidgetBase {
  kind: 'histogram'
  column: string
  bins: number
}

/** One number over every row, against a scale from zero; with no maximum, the scale rounds up from the value. */
export interface GaugeWidget extends WidgetBase {
  kind: 'gauge'
  y: string | null
  aggregate: Aggregate
  max: number | null
}

/** A spoke per number column and a shape per group, or one shape over every row. */
export interface RadarWidget extends WidgetBase {
  kind: 'radar'
  columns: string[]
  group: string | null
  aggregate: Aggregate
}

/** y aggregated per path through the levels: nested rectangles, rings, or a branching tree. */
export interface TreeWidget extends WidgetBase {
  kind: 'treemap' | 'sunburst' | 'tree'
  levels: string[]
  y: string | null
  aggregate: Aggregate
}

/** y aggregated per pair of ends: Sankey flows, a network of nodes, or chords around a circle. */
export interface LinkWidget extends WidgetBase {
  kind: 'sankey' | 'graph' | 'chord'
  from: string
  to: string
  y: string | null
  aggregate: Aggregate
}

/** A line per row across several number columns. */
export interface ParallelWidget extends WidgetBase {
  kind: 'parallel'
  columns: string[]
}

/** y aggregated per region, shaded on a map; x holds the region names. */
export interface MapWidget extends WidgetBase {
  kind: 'map'
  map: MapName
  x: string
  y: string | null
  aggregate: Aggregate
}

/** A line per row on a world map, between two longitude and latitude pairs. */
export interface FlowWidget extends WidgetBase {
  kind: 'flows'
  fromLon: string
  fromLat: string
  toLon: string
  toLat: string
}

/** A box of a number column per group, or one box over every row. */
export interface BoxplotWidget extends WidgetBase {
  kind: 'boxplot'
  value: string
  group: string | null
}

/** One point per row; a ripple scatter animates each point. */
export interface ScatterWidget extends WidgetBase {
  kind: 'scatter' | 'ripple'
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

export type Widget =
  | SeriesWidget
  | GroupedWidget
  | ScatterWidget
  | HistogramWidget
  | BoxplotWidget
  | GaugeWidget
  | RadarWidget
  | TreeWidget
  | LinkWidget
  | ParallelWidget
  | MapWidget
  | FlowWidget
  | CandlestickWidget
  | TableWidget

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

/** Names joined as a list: `a`, `a and b`, or `a, b, and c`. */
export function listOf(names: string[]): string {
  if (names.length <= 2) return names.join(' and ')
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`
}

const measure = (aggregate: Aggregate, y: string | null) =>
  aggregate === 'count' ? 'Count' : `${AGGREGATE_NAMES[aggregate]} of ${y}`

export function titleFor(settings: WidgetSettings): string {
  switch (settings.kind) {
    case 'gauge':
      return settings.aggregate === 'count' ? 'Count of rows' : measure(settings.aggregate, settings.y)
    case 'radar': {
      const of = `${AGGREGATE_NAMES[settings.aggregate]} of ${listOf(settings.columns)}`
      return settings.group ? `${of} by ${settings.group}` : of
    }
    case 'treemap':
    case 'sunburst':
    case 'tree':
      return `${measure(settings.aggregate, settings.y)} by ${settings.levels.join(', then ')}`
    case 'sankey':
    case 'graph':
    case 'chord':
      return `${measure(settings.aggregate, settings.y)} from ${settings.from} to ${settings.to}`
    case 'parallel':
      return listOf(settings.columns)
    case 'map':
      return `${measure(settings.aggregate, settings.y)} by ${settings.x}`
    case 'flows':
      return `Flows from ${settings.fromLat}, ${settings.fromLon} to ${settings.toLat}, ${settings.toLon}`
    case 'ripple':
      return `${settings.y} against ${settings.x}`
    case 'themeriver':
      return settings.aggregate === 'count'
        ? `Count by ${settings.x} and ${settings.group}`
        : `${AGGREGATE_NAMES[settings.aggregate]} of ${settings.y} by ${settings.x} and ${settings.group}`
    case 'line':
    case 'area':
    case 'bar':
    case 'pictorial':
    case 'pie':
    case 'funnel':
      return settings.aggregate === 'count'
        ? `Count by ${settings.x}`
        : `${AGGREGATE_NAMES[settings.aggregate]} of ${settings.y} by ${settings.x}`
    case 'stacked':
    case 'heatmap':
      return settings.aggregate === 'count'
        ? `Count by ${settings.x} and ${settings.group}`
        : `${AGGREGATE_NAMES[settings.aggregate]} of ${settings.y} by ${settings.x} and ${settings.group}`
    case 'histogram':
      return `Distribution of ${settings.column}`
    case 'boxplot':
      return settings.group ? `Spread of ${settings.value} by ${settings.group}` : `Spread of ${settings.value}`
    case 'scatter':
      return `${settings.y} against ${settings.x}`
    case 'candlestick':
      return `${settings.open}, ${settings.high}, ${settings.low}, and ${settings.close} by ${settings.x}`
    case 'table':
      return settings.columns.length > 0 ? settings.columns.join(', ') : 'All columns'
  }
}
