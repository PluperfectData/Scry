import { addWidget, removeWidget, titleFor, toLayouts } from './dashboard'

it('places a new widget below everything else in every breakpoint, no wider than its columns', () => {
  const layouts = addWidget({ lg: [{ i: 'a', x: 0, y: 0, w: 6, h: 7 }, { i: 'b', x: 6, y: 2, w: 6, h: 9 }] }, 'c')

  expect(layouts.lg?.at(-1)).toEqual({ i: 'c', x: 0, y: 11, w: 6, h: 7 })
  expect(layouts.xxs).toEqual([{ i: 'c', x: 0, y: 0, w: 2, h: 7 }])
  expect(Object.keys(layouts)).toEqual(['lg', 'md', 'sm', 'xs', 'xxs'])
})

it('removes a widget from every breakpoint', () => {
  const layouts = removeWidget(addWidget(addWidget({}, 'a'), 'b'), 'a')

  expect(layouts.md?.map((item) => item.i)).toEqual(['b'])
  expect(layouts.xs?.map((item) => item.i)).toEqual(['b'])
})

it('keeps only the stored fields and the known breakpoints from a grid layout', () => {
  const layouts = toLayouts({
    lg: [{ i: 'a', x: 1, y: 2, w: 3, h: 4, moved: false, static: false } as never],
    huge: [{ i: 'a', x: 0, y: 0, w: 1, h: 1 }],
  })

  expect(layouts).toEqual({ lg: [{ i: 'a', x: 1, y: 2, w: 3, h: 4 }] })
})

it('titles a chart by what it plots', () => {
  expect(titleFor({ kind: 'bar', sourceId: 1, join: null, name: null, scales: null, x: 'day', y: 'amount', aggregate: 'sum' })).toBe('Sum of amount by day')
  expect(titleFor({ kind: 'pie', sourceId: 1, join: null, name: null, scales: null, x: 'region', y: null, aggregate: 'count' })).toBe('Count by region')
  expect(titleFor({ kind: 'scatter', sourceId: 1, join: null, name: null, scales: null, x: 'price', y: 'qty' })).toBe('qty against price')
  expect(titleFor({ kind: 'candlestick', sourceId: 1, join: null, name: null, scales: null, x: 'day', open: 'o', high: 'h', low: 'l', close: 'c' })).toBe(
    'o, h, l, and c by day',
  )
  const table = { kind: 'table', sourceId: 1, join: null, name: null, scales: null, sort: null, pageSize: 25, formats: {}, count: false } as const
  expect(titleFor({ ...table, columns: [], name: null })).toBe('All columns')
  expect(titleFor({ ...table, columns: ['day', 'amount'], name: null })).toBe('day, amount')
  expect(titleFor({ ...table, columns: [], name: 'Q3 orders' })).toBe('Q3 orders')
  expect(titleFor({ ...table, columns: ['city', 'state'], name: null, count: true })).toBe('Count by city and state')
  expect(titleFor({ kind: 'stacked', sourceId: 1, join: null, name: null, scales: null, x: 'day', group: 'region', y: 'amount', aggregate: 'avg' })).toBe(
    'Average of amount by day and region',
  )
  expect(titleFor({ kind: 'histogram', sourceId: 1, join: null, name: null, scales: null, column: 'price', bins: 20 })).toBe('Distribution of price')
  expect(titleFor({ kind: 'boxplot', sourceId: 1, join: null, name: null, scales: null, value: 'amount', group: null })).toBe('Spread of amount')
  expect(titleFor({ kind: 'gauge', sourceId: 1, join: null, name: null, scales: null, y: 'amount', aggregate: 'sum', max: null })).toBe('Sum of amount')
  expect(titleFor({ kind: 'gauge', sourceId: 1, join: null, name: null, scales: null, y: null, aggregate: 'count', max: null })).toBe('Count of rows')
  expect(titleFor({ kind: 'radar', sourceId: 1, join: null, name: null, scales: null, columns: ['a', 'b', 'c'], group: 'region', aggregate: 'avg' })).toBe(
    'Average of a, b, and c by region',
  )
  expect(titleFor({ kind: 'sunburst', sourceId: 1, join: null, name: null, scales: null, levels: ['region', 'city'], y: 'amount', aggregate: 'sum' })).toBe(
    'Sum of amount by region, then city',
  )
  expect(titleFor({ kind: 'sankey', sourceId: 1, join: null, name: null, scales: null, from: 'origin', to: 'target', y: null, aggregate: 'count' })).toBe(
    'Count from origin to target',
  )
  expect(titleFor({ kind: 'parallel', sourceId: 1, join: null, name: null, scales: null, columns: ['a', 'b'] })).toBe('a and b')
  expect(titleFor({ kind: 'map', sourceId: 1, join: null, name: null, scales: null, map: 'usa', x: 'state', y: 'sales', aggregate: 'max' })).toBe(
    'Maximum of sales by state',
  )
  expect(titleFor({ kind: 'flows', sourceId: 1, join: null, name: null, scales: null, fromLon: 'lon1', fromLat: 'lat1', toLon: 'lon2', toLat: 'lat2' })).toBe(
    'Flows from lat1, lon1 to lat2, lon2',
  )
  expect(titleFor({ kind: 'pivot', sourceId: 1, join: null, name: null, scales: null, row: 'day', column: 'region', y: 'amount', aggregate: 'sum' })).toBe(
    'Sum of amount by day and region',
  )
})

it('titles any chart with its own name when it has one', () => {
  expect(titleFor({ kind: 'heatmap', sourceId: 1, join: null, name: 'Busy hours', scales: null, x: 'hour', group: 'day', y: null, aggregate: 'count' })).toBe(
    'Busy hours',
  )
})
