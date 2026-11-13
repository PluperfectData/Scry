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
  },
  dark: {
    colors: ['#7c93c9', '#c98a94', '#7fb3a0', '#c9ac7a', '#a194c4', '#7fb1bd', '#c99a7a', '#bd8fb0'],
    text: '#d4d4d4',
    muted: '#8a8a8a',
    grid: '#262626',
    up: '#7fb3a0',
    down: '#c98a94',
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

/** A line, bar, or pie chart of `[x, y]` points. */
export function seriesOption(kind: 'line' | 'bar' | 'pie', series: Series, theme: Theme): EChartsCoreOption {
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
      kind === 'line'
        ? { type: 'line', data: series.points, showSymbol: series.points.length <= MAX_POINTS_WITH_SYMBOLS }
        : { type: 'bar', data: series.points },
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
