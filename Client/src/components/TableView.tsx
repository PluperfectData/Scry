import { useEffect, useRef, useState } from 'react'
import { NUMERIC_TYPES, getRows, type Column } from '../api'
import { COUNT_SORT, LIST_CHUNK, type ColumnFormat, type TableSettings, type TableSort } from '../dashboard'
import { formatter } from '../formats'

const COUNTS: ColumnFormat = { kind: 'number', decimals: 0 }

interface Loaded {
  sortKey: string
  start: number
  columns: Column[]
  values: (string | null)[][]
  total: number
}

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const

/**
 * A source's rows, a page at a time or as one list that loads more as its end comes into view. A header click sorts
 * by that column for as long as the table is shown; the settings keep the default sort.
 */
export function TableView({ table }: { table: TableSettings }) {
  const paged = table.pageSize !== null
  const size = table.pageSize ?? LIST_CHUNK
  const [sort, setSort] = useState<TableSort | null>(
    table.sort ?? (table.count ? { column: COUNT_SORT, direction: 'desc' } : null),
  )
  const [page, setPage] = useState(0)
  const [chunks, setChunks] = useState(1)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const end = useRef<HTMLTableRowElement>(null)

  const sortKey = JSON.stringify(sort)
  const offset = paged ? page * size : (chunks - 1) * size

  useEffect(() => {
    let live = true
    getRows(table, { columns: table.columns, sort, count: table.count, offset, limit: size })
      .then((rows) => {
        if (!live) return
        setError(null)
        // A list adds each chunk to the ones before it, as long as they were loaded in the same sort.
        setLoaded((current) => ({
          sortKey,
          start: paged ? offset : 0,
          columns: rows.columns,
          total: rows.total,
          values: !paged && offset > 0 && current?.sortKey === sortKey ? [...current.values, ...rows.values] : rows.values,
        }))
      })
      .catch((e: Error) => {
        if (live) setError(e.message)
      })
    return () => {
      live = false
    }
  }, [table, sort, sortKey, offset, size, paged])

  const listed = !paged && loaded?.sortKey === sortKey ? loaded.values.length : 0
  const more = listed > 0 && listed < (loaded?.total ?? 0)

  useEffect(() => {
    if (!more || !end.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setChunks(listed / size + 1)
      },
      { root: wrap.current, rootMargin: '200px' },
    )
    observer.observe(end.current)
    return () => observer.disconnect()
  }, [more, listed, size])

  function restart() {
    setPage(0)
    setChunks(1)
    if (wrap.current) wrap.current.scrollTop = 0
  }

  function sortBy(column: string) {
    setSort((current) => ({ column, direction: current?.column === column && current.direction === 'asc' ? 'desc' : 'asc' }))
    restart()
  }

  function turn(to: number) {
    setPage(to)
    if (wrap.current) wrap.current.scrollTop = 0
  }

  if (error) return <p className="error">{error}</p>
  if (!loaded) return <p className="muted">Loading…</p>

  // A counted table's last column is its count, which sorts by its own key rather than by a column's name.
  const counted = (i: number) => table.count && i === loaded.columns.length - 1
  const keyOf = (i: number) => (counted(i) ? COUNT_SORT : loaded.columns[i].name)
  const numeric = loaded.columns.map((column) => NUMERIC_TYPES.includes(column.type))
  const write = loaded.columns.map((column, i) => {
    const format = counted(i) ? COUNTS : table.formats[column.name]
    return format ? formatter(format) : null
  })
  const last = loaded.start + loaded.values.length

  return (
    <>
      <div ref={wrap} className="table-wrap">
        <table>
          <thead>
            <tr>
              {loaded.columns.map((column, i) => {
                const direction = sort?.column === keyOf(i) ? sort.direction : null
                return (
                  <th
                    key={column.name}
                    className={numeric[i] ? 'number' : undefined}
                    aria-sort={direction ? ARIA_SORT[direction] : undefined}
                  >
                    <button type="button" className="sort" onClick={() => sortBy(keyOf(i))}>
                      {column.name}
                      <span aria-hidden="true">{direction === 'asc' ? '▲' : direction === 'desc' ? '▼' : ''}</span>
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {loaded.values.map((row, r) => (
              <tr key={loaded.start + r}>
                {row.map((cell, i) => (
                  <td key={i} className={numeric[i] ? 'number' : undefined}>
                    {cell === null ? '' : (write[i]?.(cell) ?? cell)}
                  </td>
                ))}
              </tr>
            ))}
            {more && (
              <tr ref={end}>
                <td colSpan={loaded.columns.length} className="muted">
                  Loading more…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        {paged ? (
          <>
            <span className="muted">
              {loaded.total === 0
                ? 'No rows'
                : `Rows ${(loaded.start + 1).toLocaleString()}–${last.toLocaleString()} of ${loaded.total.toLocaleString()}`}
            </span>
            <span className="table-turn">
              <button type="button" className="quiet" onClick={() => turn(page - 1)} disabled={page === 0}>
                Previous
              </button>
              <button type="button" className="quiet" onClick={() => turn(page + 1)} disabled={last >= loaded.total}>
                Next
              </button>
            </span>
          </>
        ) : (
          <span className="muted">{`${loaded.total.toLocaleString()} ${loaded.total === 1 ? 'row' : 'rows'}`}</span>
        )}
      </div>
    </>
  )
}
