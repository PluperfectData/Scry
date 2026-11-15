import { useCallback, useRef } from 'react'
import type { Series } from '../api'
import { seamOf, useAutoScroll } from '../autoScroll'
import type { ScrollPlan } from '../presentation'

const OTHER = 'Other'

// Looping, this many of the first rows follow the last, which covers a screenful in any widget.
const LOOP_ROWS = 100

/**
 * A pivot table from `[row, column, value, row's place, column's place]` points: a row per row value and a column per
 * column value, each in its place. A null column value is the one column the rest share, named Other. Presented, it
 * scrolls itself by `plan`, down its rows and, when wider than its box, across its columns.
 */
export function PivotView({
  series,
  rowLabel,
  presenting = false,
  plan = null,
}: {
  series: Series
  rowLabel: string
  presenting?: boolean
  plan?: ScrollPlan | null
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const seam = useRef<HTMLTableRowElement>(null)
  const seamAt = useCallback(() => seamOf(wrap.current, seam.current), [])
  useAutoScroll(wrap, presenting ? plan : null, 'y', { seam: seamAt })
  useAutoScroll(wrap, presenting ? plan : null, 'x')

  const rows = new Map<number, string>()
  const columns = new Map<number, string>()
  const cells = new Map<string, number>()
  for (const [row, column, value, rowPlace, columnPlace] of series.points) {
    rows.set(Number(rowPlace), String(row))
    columns.set(Number(columnPlace), column === null ? OTHER : String(column))
    cells.set(`${rowPlace} ${columnPlace}`, Number(value))
  }
  const rowPlaces = [...rows.keys()].sort((a, b) => a - b)
  const columnPlaces = [...columns.keys()].sort((a, b) => a - b)

  if (rowPlaces.length === 0) return <p className="muted">No rows</p>

  const looping = presenting && plan?.wrap === 'loop'
  const row = (rowPlace: number, key: string, copy: boolean) => (
    <tr key={key} ref={copy && rowPlace === rowPlaces[0] ? seam : undefined} aria-hidden={copy ? 'true' : undefined}>
      <th scope="row">{rows.get(rowPlace)}</th>
      {columnPlaces.map((columnPlace) => (
        <td key={columnPlace} className="number">
          {cells.get(`${rowPlace} ${columnPlace}`)?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? ''}
        </td>
      ))}
    </tr>
  )

  return (
    <div ref={wrap} className="table-wrap" data-presenting={presenting ? '' : undefined}>
      <table>
        <thead>
          <tr>
            <th scope="col">{rowLabel}</th>
            {columnPlaces.map((place) => (
              <th key={place} scope="col" className="number">
                {columns.get(place)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowPlaces.map((rowPlace) => row(rowPlace, String(rowPlace), false))}
          {looping && rowPlaces.slice(0, LOOP_ROWS).map((rowPlace) => row(rowPlace, `again ${rowPlace}`, true))}
        </tbody>
      </table>
    </div>
  )
}
