import { formatsFor, formatter, instantOf } from './formats'

it('offers money, number, and percent for numbers, and the time formats each time type can show', () => {
  expect(formatsFor('Decimal')).toEqual(['money', 'number', 'percent'])
  expect(formatsFor('Date')).toEqual(['date'])
  expect(formatsFor('Timestamp')).toEqual(['date', 'datetime', 'time'])
  expect(formatsFor('Time')).toEqual(['time'])
  expect(formatsFor('String')).toEqual([])
})

it('writes money in its currency, keeping every digit of a decimal', () => {
  expect(formatter({ kind: 'money', currency: 'USD' }, 'en-US')('1234.5')).toBe('$1,234.50')
  expect(formatter({ kind: 'money', currency: 'JPY' }, 'en-US')('1234')).toBe('¥1,234')
  expect(formatter({ kind: 'money', currency: 'USD' }, 'en-US')('12345678901234567.89')).toBe('$12,345,678,901,234,567.89')
})

it('writes numbers and percents with the chosen decimals', () => {
  expect(formatter({ kind: 'number', decimals: 1 }, 'en-US')('1234.56')).toBe('1,234.6')
  expect(formatter({ kind: 'number', decimals: 2 }, 'de-DE')('1234.5')).toBe('1.234,50')
  expect(formatter({ kind: 'percent', decimals: 0 }, 'en-US')('0.256')).toBe('26%')
})

it('reads DuckDB text for a date, a timestamp, a zoned timestamp, and a time, in UTC', () => {
  expect(instantOf('2026-11-13')).toBe(Date.UTC(2026, 10, 13))
  expect(instantOf('2026-11-13 09:30:00.25')).toBe(Date.UTC(2026, 10, 13, 9, 30, 0, 250))
  expect(instantOf('2026-11-13 09:30:00+05:30')).toBe(Date.UTC(2026, 10, 13, 4, 0))
  expect(instantOf('2026-11-13 09:30:00-05')).toBe(Date.UTC(2026, 10, 13, 14, 30))
  expect(instantOf('09:30:00')).toBe(Date.UTC(1970, 0, 1, 9, 30))
  expect(instantOf('east')).toBeNull()
})

it('writes dates and times in UTC, and leaves text that is not one as it is', () => {
  expect(formatter({ kind: 'date' }, 'en-US')('2026-11-13 23:30:00-05')).toBe('Nov 14, 2026')
  expect(formatter({ kind: 'datetime' }, 'en-US')('2026-11-13 09:30:00')).toMatch(/^Nov 13, 2026, 9:30\sAM$/)
  expect(formatter({ kind: 'time' }, 'en-US')('09:30:00')).toMatch(/^9:30\sAM$/)
  expect(formatter({ kind: 'date' }, 'en-US')('someday')).toBe('someday')
})
