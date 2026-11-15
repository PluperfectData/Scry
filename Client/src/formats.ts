import { NUMERIC_TYPES, TIME_TYPES, type ColumnType } from './api'
import type { ColumnFormat } from './dashboard'

export type FormatKind = ColumnFormat['kind']

export const FORMAT_LABELS: Record<FormatKind, string> = {
  money: 'Money',
  number: 'Number',
  percent: 'Percent',
  date: 'Date',
  datetime: 'Date and time',
  time: 'Time',
}

export const MAX_DECIMALS = 4

/** The formats a column of this type can take: none for text and the like. */
export function formatsFor(type: ColumnType): FormatKind[] {
  if (NUMERIC_TYPES.includes(type)) return ['money', 'number', 'percent']
  if (type === 'Date') return ['date']
  if (TIME_TYPES.includes(type)) return ['date', 'datetime', 'time']
  if (type === 'Time') return ['time']
  return []
}

/** A format of this kind with its usual settings. */
export function startFormat(kind: FormatKind): ColumnFormat {
  switch (kind) {
    case 'money':
      return { kind, currency: 'USD' }
    case 'number':
      return { kind, decimals: 2 }
    case 'percent':
      return { kind, decimals: 0 }
    default:
      return { kind }
  }
}

// DuckDB's text for a date (2026-11-13), a timestamp (2026-11-13 09:30:00.5, with +00 or +05:30 when zoned), or a time.
const INSTANT = /^(?:(\d{4})-(\d{2})-(\d{2}))?(?:[ T]?(\d{2}):(\d{2}):(\d{2})(\.\d+)?)?(?:([+-])(\d{2})(?::?(\d{2}))?)?$/

/** Milliseconds since 1970 in UTC, or null for text that is not a date, a timestamp, or a time. */
export function instantOf(text: string): number | null {
  const match = INSTANT.exec(text)
  if (!match || (match[1] === undefined && match[4] === undefined)) return null
  const [, year = '1970', month = '1', day = '1', hour = '0', minute = '0', second = '0', fraction = '0', sign, zoneHours = '0', zoneMinutes = '0'] =
    match
  const utc = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second, Math.round(Number(fraction) * 1000))
  const zone = (+zoneHours * 60 + +zoneMinutes) * 60_000
  return sign === '+' ? utc - zone : sign === '-' ? utc + zone : utc
}

const TIME_STYLES: Record<'date' | 'datetime' | 'time', Intl.DateTimeFormatOptions> = {
  date: { dateStyle: 'medium' },
  datetime: { dateStyle: 'medium', timeStyle: 'short' },
  time: { timeStyle: 'short' },
}

/** Writes a cell's text in a format, in the viewer's locale unless given one. Times are shown in UTC, as charts show them. */
export function formatter(format: ColumnFormat, locale?: string): (text: string) => string {
  switch (format.kind) {
    case 'money':
    case 'number':
    case 'percent': {
      const options: Intl.NumberFormatOptions =
        format.kind === 'money'
          ? { style: 'currency', currency: format.currency }
          : {
              style: format.kind === 'percent' ? 'percent' : 'decimal',
              minimumFractionDigits: format.decimals,
              maximumFractionDigits: format.decimals,
            }
      const numbers = new Intl.NumberFormat(locale, options)
      // Intl reads a numeric string exactly, so a Decimal keeps digits a double would lose.
      return (text) => numbers.format(text as unknown as number)
    }
    default: {
      const times = new Intl.DateTimeFormat(locale, { ...TIME_STYLES[format.kind], timeZone: 'UTC' })
      return (text) => {
        const instant = instantOf(text)
        return instant === null ? text : times.format(instant)
      }
    }
  }
}

/** Every currency this browser knows, by code, with its name in the viewer's language. */
export function currencies(): { code: string; name: string }[] {
  const names = new Intl.DisplayNames(undefined, { type: 'currency' })
  return Intl.supportedValuesOf('currency').map((code) => ({ code, name: names.of(code) ?? code }))
}
