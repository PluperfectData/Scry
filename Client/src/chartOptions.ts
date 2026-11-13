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

/** One dot per `[x, y]` point, with both axes fitted to the data rather than to zero. */
export function scatterOption(series: Series, theme: Theme): EChartsCoreOption {
  const palette = PALETTES[theme]
  return {
    ...base(palette),
    tooltip: { trigger: 'item' },
    grid: GRID,
    xAxis: axis(series.xType, palette, { scale: true }),
    yAxis: axis('value', palette, { scale: true }),
    series: [{ type: 'scatter', data: series.points, symbolSize: 8 }],
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
