import type { Series } from '../api'

const OTHER = 'Other'

/**
 * A pivot table from `[row, column, value, row's place, column's place]` points: a row per row value and a column per
 * column value, each in its place. A null column value is the one column the rest share, named Other.
 */
export function PivotView({ series, rowLabel }: { series: Series; rowLabel: string }) {
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

  return (
    <div className="table-wrap">
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
          {rowPlaces.map((rowPlace) => (
            <tr key={rowPlace}>
              <th scope="row">{rows.get(rowPlace)}</th>
              {columnPlaces.map((columnPlace) => (
                <td key={columnPlace} className="number">
                  {cells.get(`${rowPlace} ${columnPlace}`)?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
