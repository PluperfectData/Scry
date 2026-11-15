import { DEFAULT_PRESENTATION, planFor, xPositions, type ChartPresentation } from './presentation'

const own: ChartPresentation = { follow: 'own', wrap: 'reverse', pace: 'custom', seconds: 42, window: 5 }

it("follows the dashboard unless a chart turns scrolling off or sets its own", () => {
  expect(planFor('bar', DEFAULT_PRESENTATION, undefined)).toEqual({ seconds: 15, wrap: 'loop', window: 20 })
  expect(planFor('bar', { ...DEFAULT_PRESENTATION, scroll: false }, undefined)).toBeNull()
  expect(planFor('table', DEFAULT_PRESENTATION, { ...own, follow: 'off' })).toBeNull()
  expect(planFor('line', { ...DEFAULT_PRESENTATION, scroll: false }, own)).toEqual({ seconds: 42, wrap: 'reverse', window: 5 })
})

it('reads each pace as its seconds a screenful', () => {
  expect(planFor('table', { ...DEFAULT_PRESENTATION, pace: 'slow' }, undefined)?.seconds).toBe(30)
  expect(planFor('table', { ...DEFAULT_PRESENTATION, pace: 'fast' }, undefined)?.seconds).toBe(8)
  expect(planFor('table', { ...DEFAULT_PRESENTATION, pace: 'custom', seconds: 21 }, undefined)?.seconds).toBe(21)
})

it('leaves charts with nothing to scroll still', () => {
  expect(planFor('pie', DEFAULT_PRESENTATION, undefined)).toBeNull()
  expect(planFor('map', DEFAULT_PRESENTATION, own)).toBeNull()
})

it('slides a number or time axis by its values, in order, and any other by its categories', () => {
  expect(xPositions('line', { xType: 'time', points: [[3000, 1], [1000, 2], [3000, 5]], truncated: false })).toEqual([1000, 3000])
  expect(xPositions('bar', { xType: 'category', points: [['east', 1], ['west', 2]], truncated: false })).toEqual([0, 1])
  expect(
    xPositions('heatmap', { xType: 'category', points: [['mon', 'a', 1], ['mon', 'b', 2], ['tue', 'a', 3]], truncated: false }),
  ).toEqual([0, 1])
  expect(xPositions('candlestick', { xType: 'time', points: [[1, 1, 2, 0, 3], [2, 2, 3, 1, 4]], truncated: false })).toEqual([0, 1])
})
