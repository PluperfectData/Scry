import { renderHook } from '@testing-library/react'
import { REST_MS, useAutoScroll } from './autoScroll'
import type { ScrollPlan } from './presentation'

// A scrolling box `height` pixels tall over content `content` pixels tall.
const box = (height: number, content: number) =>
  ({ clientHeight: height, scrollHeight: content, scrollTop: 0, clientWidth: 0, scrollWidth: 0, scrollLeft: 0 }) as unknown as HTMLElement

const plan = (wrap: ScrollPlan['wrap']): ScrollPlan => ({ seconds: 10, wrap, window: 20 })

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

it('scrolls a screenful every plan.seconds', () => {
  const element = box(100, 1000)
  const restart = plan('restart')
  renderHook(() => useAutoScroll({ current: element }, restart, 'y'))

  jest.advanceTimersByTime(5000)

  expect(element.scrollTop).toBeGreaterThanOrEqual(48)
  expect(element.scrollTop).toBeLessThanOrEqual(51)
})

it('rests at the end, then jumps back to the start', () => {
  const element = box(100, 150)
  const restart = plan('restart')
  renderHook(() => useAutoScroll({ current: element }, restart, 'y'))

  jest.advanceTimersByTime(6000)
  expect(element.scrollTop).toBe(50)

  jest.advanceTimersByTime(REST_MS)
  expect(element.scrollTop).toBe(0)
})

it('rests at the end, then turns around', () => {
  const element = box(100, 150)
  const reverse = plan('reverse')
  renderHook(() => useAutoScroll({ current: element }, reverse, 'y'))

  jest.advanceTimersByTime(5100 + REST_MS + 1000)

  expect(element.scrollTop).toBeLessThan(50)
  expect(element.scrollTop).toBeGreaterThan(30)
})

it('loops past the seam back to where the first rows began, unseen', () => {
  const element = box(100, 1000)
  const loop = plan('loop')
  renderHook(() => useAutoScroll({ current: element }, loop, 'y', { seam: () => 30 }))

  jest.advanceTimersByTime(10_000)

  expect(element.scrollTop).toBeLessThan(30)
})

it('holds at the end while more rows load', () => {
  const element = box(100, 150)
  const restart = plan('restart')
  renderHook(() => useAutoScroll({ current: element }, restart, 'y', { waiting: true }))

  jest.advanceTimersByTime(6000 + REST_MS * 2)

  expect(element.scrollTop).toBe(50)
})
