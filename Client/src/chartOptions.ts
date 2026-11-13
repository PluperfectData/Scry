import type { EChartsCoreOption } from 'echarts/core'
import type { Series } from './api'
import type { Theme } from './theme'

interface Palette {
  colors: string[]
  text: string
  muted: string
  grid: string
  up: string
  down: string
  heat: string[]
  fill: string
}

/** Bright colors for the light theme; softer ones for the dark. */
export const PALETTES: Record<Theme, Palette> = {
  light: {
    colors: ['#2563eb', '#f43f5e', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899'],
    text: '#111827',
    muted: '#6b7280',
    grid: '#e5e7eb',
    up: '#10b981',
    down: '#f43f5e',
    heat: ['#eff6ff', '#60a5fa', '#1d4ed8'],
    fill: '#dbeafe',
  },
  dark: {
    colors: ['#7c93c9', '#c98a94', '#7fb3a0', '#c9ac7a', '#a194c4', '#7fb1bd', '#c99a7a', '#bd8fb0'],
    text: '#d4d4d4',
    muted: '#8a8a8a',
    grid: '#262626',
    up: '#7fb3a0',
    down: '#c98a94',
    heat: ['#1a1a1a', '#3d4a66', '#7c93c9'],
    fill: '#1f2633',
  },
}

const MAX_POINTS_WITH_SYMBOLS = 60

function base(palette: Palette) {
  return { useUTC: true, color: palette.colors, textStyle: { color: palette.text } }
}

function axis(type: string, palette: Palette, extra: object = {}) {
  return {
    type,
    axisLine: { lineStyle: { color: palette.muted } },
    axisLabel: { color: palette.muted },
    splitLine: { lineStyle: { color: palette.grid } },
    ...extra,
  }
}

const GRID = { left: 56, right: 16, top: 16, bottom: 32 }

/** A label for an x value: a UTC date or date and time for a time axis, the value itself otherwise. */
export function labelFor(x: number | string | null, xType: Series['xType']): string {
  if (xType !== 'time' || typeof x !== 'number') return String(x)
  const iso = new Date(x).toISOString()
  return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${iso.slice(11, 16)}`
}

/** A number shortened to four significant digits, for bin labels. */
function short(value: number | string | null): string {
  return String(Number(Number(value).toPrecision(4)))
}

/** Groups `[x, group, y]` points into x labels in x order, group names in sorted order, and the y per pair. */
export function pivot(series: Series) {
  const xs: string[] = []
  const xIndex = new Map<string, number>()
  const values = new Map<string, number | null>()
  for (const [x, group, y] of series.points) {
    const label = labelFor(x, series.xType)
    if (!xIndex.has(label)) {
      xIndex.set(label, xs.length)
      xs.push(label)
    }
    values.set(`${xIndex.get(label)}\u0000${group}`, y as number | null)
  }
  const groups = [...new Set(series.points.map((point) => String(point[1])))].sort((a, b) => a.localeCompare(b))
  return { xs, groups, value: (x: number, group: string) => values.get(`${x}\u0000${group}`) ?? null }
}

/** Bars of stacked rounded blocks, one bar per `[x, y]` point, on a category axis of x labels. */
export function pictorialOption(series: Series, theme: Theme): EChartsCoreOption {
  const palette = PALETTES[theme]
  return {
    ...base(palette),
    tooltip: { trigger: 'axis' },
    grid: GRID,
    xAxis: axis('category', palette, { data: series.points.map(([x]) => labelFor(x, series.xType)), splitLine: { show: false } }),
    yAxis: axis('value', palette),
    series: [
      {
        type: 'pictorialBar',
        symbol: 'roundRect',
        symbolRepeat: true,
        symbolSize: ['70%', 8],
        symbolMargin: 2,
        data: series.points.map((point) => point[1]),
      },
    ],
  }
}

/** A line, area, bar, or pie chart of `[x, y]` points. */
export function seriesOption(kind: 'line' | 'area' | 'bar' | 'pie', series: Series, theme: Theme): EChartsCoreOption {
  const palette = PALETTES[theme]
  if (kind === 'pie') {
    return {
      ...base(palette),
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'pie',
          radius: ['35%', '70%'],
          label: { color: palette.text },
          data: series.points.map(([x, y]) => ({ name: labelFor(x, series.xType), value: y })),
        },
      ],
    }
  }

  return {
    ...base(palette),
    tooltip: { trigger: 'axis' },
    grid: GRID,
    xAxis: axis(series.xType, palette, { splitLine: { show: false } }),
    yAxis: axis('value', palette),
    series: [
      kind === 'bar'
        ? { type: 'bar', data: series.points }
        : {
            type: 'line',
            data: series.points,
            showSymbol: series.points.length <= MAX_POINTS_WITH_SYMBOLS,
            ...(kind === 'area' ? { areaStyle: { opacity: 0.25 } } : {}),
          },
    ],
  }
}

/** One bar stack per x, with a segment per group, from `[x, group, y]` points. */
export function stackedOption(series: Series, theme: Theme): EChartsCoreOption {
  const palette = PALETTES[theme]
  const { xs, groups, value } = pivot(series)
  return {
    ...base(palette),
    tooltip: { trigger: 'axis' },
    legend: { type: 'scroll', top: 0, textStyle: { color: palette.muted } },
    grid: { ...GRID, top: 36 },
    xAxis: axis('category', palette, { data: xs, splitLine: { show: false } }),
    yAxis: axis('value', palette),
    series: groups.map((group) => ({
      type: 'bar',
      name: group,
      stack: 'total',
      data: xs.map((_, x) => value(x, group)),
    })),
  }
}

/** A grid of x by group, shaded by y, from `[x, group, y]` points. */
export function heatmapOption(series: Series, theme: Theme): EChartsCoreOption {
  const palette = PALETTES[theme]
  const { xs, groups, value } = pivot(series)
  const cells = xs.flatMap((_, x) => groups.map((group, g) => [x, g, value(x, group)]))
  const values = cells.map((cell) => cell[2]).filter((v): v is number => typeof v === 'number')
  return {
    ...base(palette),
    tooltip: { trigger: 'item' },
    grid: { left: 80, right: 16, top: 16, bottom: 72 },
    xAxis: axis('category', palette, { data: xs, splitLine: { show: false } }),
    yAxis: axis('category', palette, { data: groups, splitLine: { show: false } }),
    visualMap: {
      min: values.length > 0 ? Math.min(...values) : 0,
      max: values.length > 0 ? Math.max(...values) : 0,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      inRange: { color: palette.heat },
      textStyle: { color: palette.muted },
    },
    series: [{ type: 'heatmap', data: cells.filter((cell) => cell[2] !== null) }],
  }
}

/** Bars of counts from `[start, end, count]` bins, labeled by their range. */
export function histogramOption(series: Series, theme: Theme): EChartsCoreOption {
  const palette = PALETTES[theme]
  return {
    ...base(palette),
    tooltip: { trigger: 'axis' },
    grid: GRID,
    xAxis: axis('category', palette, {
      data: series.points.map(([start, end]) => `${short(start)}–${short(end)}`),
      splitLine: { show: false },
    }),
    yAxis: axis('value', palette),
    series: [{ type: 'bar', data: series.points.map((point) => point[2]), barCategoryGap: '4%' }],
  }
}

/** The value rounded up at its leading digit, as a scale's end: 22 becomes 30, and 734 becomes 800. */
export function niceCeil(value: number): number {
  if (value <= 0) return 1
  const step = 10 ** Math.floor(Math.log10(value))
  return Math.ceil(value / step) * step
}

/** Stages from `[x, y]` points, widest first. */
export function funnelOption(series: Series, theme: Theme): EChartsCoreOption {
  const palette = PALETTES[theme]
  return {
    ...base(palette),
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'funnel',
        sort: 'descending',
        left: '10%',
        width: '80%',
        label: { color: palette.text },
        data: series.points.map(([x, y]) => ({ name: labelFor(x, series.xType), value: y })),
      },
    ],
  }
}

/** One `["All rows", value]` point on a dial from zero, or below zero for a negative value. */
export function gaugeOption(series: Series, max: number | null, theme: Theme): EChartsCoreOption {
  const palette = PALETTES[theme]
  const value = Number(series.points[0]?.[1] ?? 0)
  return {
    ...base(palette),
    series: [
      {
        type: 'gauge',
        min: value < 0 ? -niceCeil(-value) : 0,
        max: max ?? niceCeil(value),
        progress: { show: true, width: 14, itemStyle: { color: palette.colors[0] } },
        axisLine: { lineStyle: { width: 14, color: [[1, palette.grid]] } },
        pointer: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { color: palette.muted, distance: 20 },
        detail: { color: palette.text, fontSize: 24, offsetCenter: [0, '10%'] },
        data: [{ value }],
      },
    ],
  }
}

/** A spoke per measure and a shape per `[group, value, ...]` point, each spoke scaled to its largest value. */
export function radarOption(series: Series, columns: string[], theme: Theme): EChartsCoreOption {
  const palette = PALETTES[theme]
  return {
    ...base(palette),
    tooltip: { trigger: 'item' },
    legend: { type: 'scroll', top: 0, textStyle: { color: palette.muted } },
    radar: {
      center: ['50%', '56%'],
      radius: '62%',
      indicator: columns.map((name, i) => ({
        name,
        max: niceCeil(Math.max(0, ...series.points.map((point) => Number(point[i + 1] ?? 0)))),
      })),
      axisName: { color: palette.muted },
      splitLine: { lineStyle: { color: palette.grid } },
      axisLine: { lineStyle: { color: palette.grid } },
      splitArea: { show: false },
    },
    series: [
      {
        type: 'radar',
        data: series.points.map(([group, ...values]) => ({ name: String(group), value: values })),
        areaStyle: { opacity: 0.15 },
      },
    ],
  }
}

export interface TreeNode {
  name: string
  value?: number
  children?: TreeNode[]
}

/** Nests `[level, ..., value]` points into a tree; the last level holds the value. */
export function nest(points: Series['points']): TreeNode[] {
  const root: TreeNode[] = []
  for (const point of points) {
    const names = point.slice(0, -1).map(String)
    let level = root
    names.forEach((name, depth) => {
      let node = level.find((candidate) => candidate.name === name)
      if (!node) {
        node = { name }
        level.push(node)
      }
      if (depth === names.length - 1) node.value = Number(point.at(-1))
      else level = node.children ??= []
    })
  }
  return root
}

/** Sums a node's value from its children when it has none of its own. */
function withTotals(nodes: TreeNode[]): TreeNode[] {
  return nodes.map((node) => {
    if (!node.children) return node
    const children = withTotals(node.children)
    return { ...node, children, value: children.reduce((sum, child) => sum + (child.value ?? 0), 0) }
  })
}

/** Nested rectangles, rings, or a branching tree from `[level, ..., value]` points. */
export function treeOption(kind: 'treemap' | 'sunburst' | 'tree', series: Series, theme: Theme): EChartsCoreOption {
  const palette = PALETTES[theme]
  const data = nest(series.points)
  const branches = {
    type: 'tree',
    data: withTotals([{ name: 'All rows', children: data }]),
    top: 16,
    bottom: 16,
    left: 72,
    right: 120,
    initialTreeDepth: 2,
    expandAndCollapse: true,
    label: { position: 'left', verticalAlign: 'middle', align: 'right', color: palette.text },
    leaves: { label: { position: 'right', align: 'left' } },
    lineStyle: { color: palette.grid },
    itemStyle: { color: palette.colors[0], borderColor: palette.colors[0] },
  }
  return {
    ...base(palette),
    tooltip: { trigger: 'item' },
    series: [
      kind === 'tree'
        ? branches
        : kind === 'treemap'
          ? {
              type: 'treemap',
              data,
              top: 8,
              bottom: 32,
              left: 8,
              right: 8,
              upperLabel: { show: true, height: 20, color: palette.text },
              breadcrumb: { bottom: 4, itemStyle: { color: palette.grid, textStyle: { color: palette.text } } },
            }
          : { type: 'sunburst', data, radius: [0, '92%'], label: { rotate: 'radial', color: palette.text } },
    ],
  }
}

/** Every name at either end of `[from, to, value]` links, in order of first appearance. */
function nodesOf(series: Series): string[] {
  return [...new Set(series.points.flatMap(([from, to]) => [String(from), String(to)]))]
}

const linksOf = (series: Series) =>
  series.points.map(([from, to, value]) => ({ source: String(from), target: String(to), value }))

/** Flows between nodes from `[from, to, value]` links, widths in proportion to value. */
export function sankeyOption(series: Series, theme: Theme): EChartsCoreOption {
  const palette = PALETTES[theme]
  return {
    ...base(palette),
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'sankey',
        left: 8,
        right: 96,
        top: 16,
        bottom: 16,
        emphasis: { focus: 'adjacency' },
        label: { color: palette.text },
        lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.4 },
        data: nodesOf(series).map((name) => ({ name })),
        links: linksOf(series),
      },
    ],
  }
}

const MIN_NODE_SIZE = 8
const MAX_NODE_SIZE = 40

/** A force-laid network from `[from, to, value]` links; each node sized by the value of its links. */
export function graphOption(series: Series, theme: Theme): EChartsCoreOption {
  const palette = PALETTES[theme]
  const weight = new Map<string, number>()
  for (const [from, to, value] of series.points) {
    for (const name of [String(from), String(to)]) weight.set(name, (weight.get(name) ?? 0) + Number(value ?? 0))
  }
  const heaviest = Math.max(1, ...weight.values())
  return {
    ...base(palette),
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'graph',
        layout: 'force',
        roam: true,
        draggable: true,
        force: { repulsion: 120, edgeLength: 80 },
        label: { show: true, position: 'right', color: palette.text },
        lineStyle: { color: palette.muted, opacity: 0.5 },
        emphasis: { focus: 'adjacency' },
        data: nodesOf(series).map((name) => ({
          name,
          value: weight.get(name),
          symbolSize: MIN_NODE_SIZE + ((MAX_NODE_SIZE - MIN_NODE_SIZE) * (weight.get(name) ?? 0)) / heaviest,
        })),
        links: linksOf(series),
      },
    ],
  }
}

/** Nodes around a circle with ribbons between them, from `[from, to, value]` links. */
export function chordOption(series: Series, theme: Theme): EChartsCoreOption {
  const palette = PALETTES[theme]
  return {
    ...base(palette),
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'chord',
        radius: ['70%', '80%'],
        label: { show: true, color: palette.text },
        lineStyle: { opacity: 0.4 },
        emphasis: { focus: 'adjacency' },
        data: nodesOf(series).map((name) => ({ name })),
        links: linksOf(series),
      },
    ],
  }
}

/** A line per `[value, ...]` row across an axis per column. */
export function parallelOption(series: Series, columns: string[], theme: Theme): EChartsCoreOption {
  const palette = PALETTES[theme]
  return {
    ...base(palette),
    parallel: { left: 48, right: 64, top: 40, bottom: 24 },
    parallelAxis: columns.map((name, dim) => ({
      dim,
      name,
      nameTextStyle: { color: palette.muted },
      axisLabel: { color: palette.muted },
      axisLine: { lineStyle: { color: palette.muted } },
    })),
    series: [{ type: 'parallel', data: series.points, lineStyle: { width: 1, opacity: 0.4 } }],
  }
}

/** Streams that widen and narrow along x, one per group, from `[x, group, y]` points. */
export function themeRiverOption(series: Series, theme: Theme): EChartsCoreOption {
  const palette = PALETTES[theme]
  return {
    ...base(palette),
    tooltip: { trigger: 'axis' },
    legend: { type: 'scroll', top: 0, textStyle: { color: palette.muted } },
    singleAxis: {
      type: series.xType === 'time' ? 'time' : 'value',
      top: 40,
      bottom: 32,
      axisLabel: { color: palette.muted },
      axisLine: { lineStyle: { color: palette.muted } },
    },
    series: [{ type: 'themeRiver', data: series.points.map(([x, group, y]) => [x, y, String(group)]) }],
  }
}

/** The shared look of a map's land. */
function land(palette: Palette) {
  return {
    roam: true,
    itemStyle: { areaColor: palette.grid, borderColor: palette.muted, borderWidth: 0.5 },
    emphasis: { itemStyle: { areaColor: palette.colors[3] }, label: { color: palette.text } },
  }
}

/** Regions shaded by `[name, y]` points, matched on the map's own region names. */
export function mapOption(series: Series, map: string, theme: Theme): EChartsCoreOption {
  const palette = PALETTES[theme]
  const values = series.points.map((point) => point[1]).filter((v): v is number => typeof v === 'number')
  return {
    ...base(palette),
    tooltip: { trigger: 'item' },
    visualMap: {
      min: values.length > 0 ? Math.min(...values) : 0,
      max: values.length > 0 ? Math.max(...values) : 0,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      inRange: { color: palette.heat },
      textStyle: { color: palette.muted },
    },
    series: [
      {
        type: 'map',
        map,
        ...land(palette),
        data: series.points.map(([name, value]) => ({ name: String(name), value })),
      },
    ],
  }
}

/** Curved lines on the world map, one per `[from longitude, from latitude, to longitude, to latitude]` row. */
export function flowsOption(series: Series, theme: Theme): EChartsCoreOption {
  const palette = PALETTES[theme]
  return {
    ...base(palette),
    geo: { map: 'world', ...land(palette) },
    series: [
      {
        type: 'lines',
        coordinateSystem: 'geo',
        lineStyle: { color: palette.colors[1], width: 1, opacity: 0.6, curveness: 0.2 },
        data: series.points.map(([fromLon, fromLat, toLon, toLat]) => ({ coords: [[fromLon, fromLat], [toLon, toLat]] })),
      },
    ],
  }
}

/** A box per `[label, min, q1, median, q3, max]` point. */
export function boxplotOption(series: Series, theme: Theme): EChartsCoreOption {
  const palette = PALETTES[theme]
  return {
    ...base(palette),
    tooltip: { trigger: 'item' },
    grid: GRID,
    xAxis: axis('category', palette, { data: series.points.map(([label]) => String(label)), splitLine: { show: false } }),
    yAxis: axis('value', palette, { scale: true }),
    series: [
      {
        type: 'boxplot',
        data: series.points.map((point) => point.slice(1)),
        itemStyle: { color: palette.fill, borderColor: palette.colors[0] },
      },
    ],
  }
}

/** One dot per `[x, y]` point, with both axes fitted to the data rather than to zero; a ripple dot pulses. */
export function scatterOption(series: Series, theme: Theme, ripple = false): EChartsCoreOption {
  const palette = PALETTES[theme]
  return {
    ...base(palette),
    tooltip: { trigger: 'item' },
    grid: GRID,
    xAxis: axis(series.xType, palette, { scale: true }),
    yAxis: axis('value', palette, { scale: true }),
    series: [
      ripple
        ? { type: 'effectScatter', data: series.points, symbolSize: 8, rippleEffect: { scale: 3 } }
        : { type: 'scatter', data: series.points, symbolSize: 8 },
    ],
  }
}

/** Candles from `[x, open, close, low, high]` points, on a category axis of their x labels. */
export function candlestickOption(series: Series, theme: Theme): EChartsCoreOption {
  const palette = PALETTES[theme]
  return {
    ...base(palette),
    tooltip: { trigger: 'axis' },
    grid: GRID,
    xAxis: axis('category', palette, {
      data: series.points.map(([x]) => labelFor(x, series.xType)),
      splitLine: { show: false },
    }),
    yAxis: axis('value', palette, { scale: true }),
    series: [
      {
        type: 'candlestick',
        data: series.points.map((point) => point.slice(1)),
        itemStyle: { color: palette.up, color0: palette.down, borderColor: palette.up, borderColor0: palette.down },
      },
    ],
  }
}
