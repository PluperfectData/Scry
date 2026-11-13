import {
  boxplotOption,
  candlestickOption,
  chordOption,
  flowsOption,
  funnelOption,
  gaugeOption,
  graphOption,
  heatmapOption,
  histogramOption,
  labelFor,
  mapOption,
  nest,
  niceCeil,
  PALETTES,
  parallelOption,
  pictorialOption,
  radarOption,
  sankeyOption,
  scatterOption,
  seriesOption,
  stackedOption,
  themeRiverOption,
  treeOption,
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

it('makes each point a funnel stage, widest first', () => {
  const option = funnelOption({ xType: 'category', points: [['visit', 100], ['buy', 20]], truncated: false }, 'light')

  expect(option).toMatchObject({
    series: [{ type: 'funnel', sort: 'descending', data: [{ name: 'visit', value: 100 }, { name: 'buy', value: 20 }] }],
  })
})

it('rounds a scale up at its leading digit', () => {
  expect([niceCeil(22), niceCeil(734), niceCeil(1), niceCeil(0.37), niceCeil(0)]).toEqual([30, 800, 1, 0.4, 1])
})

it('puts a gauge value on a dial from zero to the maximum given, or rounded up from the value', () => {
  const total = { xType: 'category' as const, points: [['All rows', 22]], truncated: false }

  expect(gaugeOption(total, null, 'light')).toMatchObject({ series: [{ type: 'gauge', min: 0, max: 30, data: [{ value: 22 }] }] })
  expect(gaugeOption(total, 50, 'light')).toMatchObject({ series: [{ max: 50 }] })
})

it('scales each radar spoke to its largest value and draws a shape per group', () => {
  const option = radarOption(
    { xType: 'category', points: [['east', 4, 2, 3], ['west', 30, 10, 20]], truncated: false },
    ['c', 'a', 'b'],
    'light',
  )

  expect(option).toMatchObject({
    radar: { indicator: [{ name: 'c', max: 30 }, { name: 'a', max: 10 }, { name: 'b', max: 20 }] },
    series: [{ type: 'radar', data: [{ name: 'east', value: [4, 2, 3] }, { name: 'west', value: [30, 10, 20] }] }],
  })
})

it('nests tree points by their levels, with the value on the last', () => {
  expect(nest([['east', 'boston', 15], ['east', 'nyc', 7], ['west', 'la', 4]])).toEqual([
    { name: 'east', children: [{ name: 'boston', value: 15 }, { name: 'nyc', value: 7 }] },
    { name: 'west', children: [{ name: 'la', value: 4 }] },
  ])
})

it('draws the same tree as rectangles or rings', () => {
  const series = { xType: 'category' as const, points: [['east', 15], ['west', 4]], truncated: false }

  expect(treeOption('treemap', series, 'light')).toMatchObject({
    series: [{ type: 'treemap', data: [{ name: 'east', value: 15 }, { name: 'west', value: 4 }] }],
  })
  expect(treeOption('sunburst', series, 'dark')).toMatchObject({ series: [{ type: 'sunburst' }] })
})

const links = { xType: 'category' as const, points: [['a', 'b', 8], ['b', 'c', 2]], truncated: false }

it('turns links into Sankey nodes and flows', () => {
  expect(sankeyOption(links, 'light')).toMatchObject({
    series: [
      {
        type: 'sankey',
        data: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
        links: [{ source: 'a', target: 'b', value: 8 }, { source: 'b', target: 'c', value: 2 }],
      },
    ],
  })
})

it('sizes each network node by the value of its links, the heaviest largest', () => {
  const option = graphOption(links, 'light') as { series: { data: { name: string; symbolSize: number }[] }[] }
  const size = Object.fromEntries(option.series[0].data.map((node) => [node.name, node.symbolSize]))

  expect(size.b).toBe(40)
  expect(size.a).toBeCloseTo(8 + (32 * 8) / 10)
  expect(size.c).toBeCloseTo(8 + (32 * 2) / 10)
})

it('draws chords between the same nodes', () => {
  expect(chordOption(links, 'dark')).toMatchObject({ series: [{ type: 'chord', data: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] }] })
})

it('roots a tree diagram at all rows, totaling each branch', () => {
  const option = treeOption('tree', { xType: 'category', points: [['east', 'boston', 15], ['east', 'nyc', 7]], truncated: false }, 'light')

  expect(option).toMatchObject({
    series: [
      {
        type: 'tree',
        data: [{ name: 'All rows', value: 22, children: [{ name: 'east', value: 22, children: [{ name: 'boston' }, { name: 'nyc' }] }] }],
      },
    ],
  })
})

it('gives parallel coordinates an axis per column, in order', () => {
  const option = parallelOption({ xType: 'value', points: [[2, 1], [8, 7]], truncated: false }, ['y', 'x'], 'light')

  expect(option).toMatchObject({
    parallelAxis: [{ dim: 0, name: 'y' }, { dim: 1, name: 'x' }],
    series: [{ type: 'parallel', data: [[2, 1], [8, 7]] }],
  })
})

it('reorders grouped points into theme river streams on a time axis', () => {
  expect(themeRiverOption(grouped, 'light')).toMatchObject({
    singleAxis: { type: 'time' },
    series: [{ type: 'themeRiver', data: [[JAN_1, 5, 'west'], [JAN_1, 10, 'east'], [JAN_2, 7, 'east']] }],
  })
})

it('draws pictorial bars as repeated blocks on x labels', () => {
  const option = pictorialOption({ xType: 'category', points: [['east', 2]], truncated: false }, 'light')

  expect(option).toMatchObject({
    xAxis: { data: ['east'] },
    series: [{ type: 'pictorialBar', symbolRepeat: true, data: [2] }],
  })
})

it('pulses each point of a ripple scatter', () => {
  expect(scatterOption({ xType: 'value', points: [[1, 2]], truncated: false }, 'light', true)).toMatchObject({
    series: [{ type: 'effectScatter', data: [[1, 2]] }],
  })
})

it('shades named regions on the chosen map', () => {
  const option = mapOption(
    { xType: 'category', points: [['United States of America', 30], ['Canada', 10]], truncated: false },
    'world',
    'light',
  )

  expect(option).toMatchObject({
    visualMap: { min: 10, max: 30 },
    series: [{ type: 'map', map: 'world', data: [{ name: 'United States of America', value: 30 }, { name: 'Canada', value: 10 }] }],
  })
})

it('draws a flow per row between its two places on the world map', () => {
  const option = flowsOption({ xType: 'value', points: [[-74, 40.7, -0.1, 51.5]], truncated: false }, 'light')

  expect(option).toMatchObject({
    geo: { map: 'world' },
    series: [{ type: 'lines', coordinateSystem: 'geo', data: [{ coords: [[-74, 40.7], [-0.1, 51.5]] }] }],
  })
})

it('labels a time with its minutes only when it has some', () => {
  expect(labelFor(Date.UTC(2026, 0, 1, 9, 30), 'time')).toBe('2026-01-01 09:30')
  expect(labelFor('east', 'category')).toBe('east')
})
