import {
  boxplotOption,
  candlestickOption,
  heatmapOption,
  histogramOption,
  labelFor,
  PALETTES,
  scatterOption,
  seriesOption,
  stackedOption,
} from './chartOptions'

const JAN_1 = Date.UTC(2026, 0, 1)
const JAN_2 = Date.UTC(2026, 0, 2)

it('draws a line on the axis type the API sends, in UTC, with the theme colors', () => {
  const option = seriesOption('line', { xType: 'time', points: [[JAN_1, 15], [JAN_2, 7]], truncated: false }, 'light')

  expect(option).toMatchObject({
    useUTC: true,
    color: PALETTES.light.colors,
    xAxis: { type: 'time' },
    yAxis: { type: 'value' },
    series: [{ type: 'line', data: [[JAN_1, 15], [JAN_2, 7]], showSymbol: true }],
  })
})

it('drops the point markers on a long line', () => {
  const points = Array.from({ length: 61 }, (_, i) => [i, i])

  expect(seriesOption('line', { xType: 'value', points, truncated: false }, 'light')).toMatchObject({
    series: [{ showSymbol: false }],
  })
})

it('draws bars from the same points as a line', () => {
  const option = seriesOption('bar', { xType: 'category', points: [['east', 2]], truncated: false }, 'dark')

  expect(option).toMatchObject({ color: PALETTES.dark.colors, series: [{ type: 'bar', data: [['east', 2]] }] })
})

it('makes each point a named pie slice', () => {
  const option = seriesOption('pie', { xType: 'time', points: [[JAN_1, 3], [JAN_2, 1]], truncated: false }, 'light')

  expect(option).toMatchObject({
    series: [{ type: 'pie', data: [{ name: '2026-01-01', value: 3 }, { name: '2026-01-02', value: 1 }] }],
  })
})

it('fits both scatter axes to the data', () => {
  const option = scatterOption({ xType: 'value', points: [[1.5, 2]], truncated: false }, 'light')

  expect(option).toMatchObject({
    xAxis: { type: 'value', scale: true },
    yAxis: { scale: true },
    series: [{ type: 'scatter', data: [[1.5, 2]] }],
  })
})

it('puts candles on a category axis of their x labels, rising and falling in the theme colors', () => {
  const option = candlestickOption(
    { xType: 'time', points: [[JAN_1, 10, 11, 9, 12], [JAN_2, 11, 12, 10, 13]], truncated: false },
    'light',
  )

  expect(option).toMatchObject({
    xAxis: { type: 'category', data: ['2026-01-01', '2026-01-02'] },
    series: [
      {
        type: 'candlestick',
        data: [[10, 11, 9, 12], [11, 12, 10, 13]],
        itemStyle: { color: PALETTES.light.up, color0: PALETTES.light.down },
      },
    ],
  })
})

it('fills the area under an area chart', () => {
  const option = seriesOption('area', { xType: 'value', points: [[1, 2]], truncated: false }, 'light')

  expect(option).toMatchObject({ series: [{ type: 'line', areaStyle: { opacity: 0.25 } }] })
})

const grouped = {
  xType: 'time' as const,
  points: [[JAN_1, 'west', 5], [JAN_1, 'east', 10], [JAN_2, 'east', 7]],
  truncated: false,
}

it('stacks a bar per group, leaving a gap where a group has no value', () => {
  const option = stackedOption(grouped, 'light')

  expect(option).toMatchObject({
    xAxis: { type: 'category', data: ['2026-01-01', '2026-01-02'] },
    series: [
      { type: 'bar', name: 'east', stack: 'total', data: [10, 7] },
      { type: 'bar', name: 'west', stack: 'total', data: [5, null] },
    ],
  })
})

it('shades a heatmap cell per x and group, scaled from the smallest value to the largest', () => {
  const option = heatmapOption(grouped, 'dark')

  expect(option).toMatchObject({
    yAxis: { type: 'category', data: ['east', 'west'] },
    visualMap: { min: 5, max: 10, inRange: { color: PALETTES.dark.heat } },
    series: [{ type: 'heatmap', data: [[0, 0, 10], [0, 1, 5], [1, 0, 7]] }],
  })
})

it('labels histogram bars by their range', () => {
  const option = histogramOption(
    { xType: 'value', points: [[1, 4, 3], [4, 7, 3], [7, 10, 4]], truncated: false },
    'light',
  )

  expect(option).toMatchObject({
    xAxis: { data: ['1–4', '4–7', '7–10'] },
    series: [{ type: 'bar', data: [3, 3, 4] }],
  })
})

it('draws a box per group from its five numbers', () => {
  const option = boxplotOption({ xType: 'category', points: [['east', 7, 7.75, 8.5, 9.25, 10]], truncated: false }, 'light')

  expect(option).toMatchObject({
    xAxis: { data: ['east'] },
    series: [{ type: 'boxplot', data: [[7, 7.75, 8.5, 9.25, 10]] }],
  })
})

it('labels a time with its minutes only when it has some', () => {
  expect(labelFor(Date.UTC(2026, 0, 1, 9, 30), 'time')).toBe('2026-01-01 09:30')
  expect(labelFor('east', 'category')).toBe('east')
})
