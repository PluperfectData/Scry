import { NUMERIC_TYPES, type Rows } from '../api'

export function TableView({ rows }: { rows: Rows }) {
  const numeric = rows.columns.map((column) => NUMERIC_TYPES.includes(column.type))

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {rows.columns.map((column, i) => (
              <th key={column.name} className={numeric[i] ? 'number' : undefined}>
                {column.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.values.map((row, r) => (
            <tr key={r}>
              {row.map((cell, i) => (
                <td key={i} className={numeric[i] ? 'number' : undefined}>
                  {cell ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
