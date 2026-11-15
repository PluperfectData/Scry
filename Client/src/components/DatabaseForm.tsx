import { type FormEvent, useState } from 'react'
import { addDatabaseSources, listTables, type Connector, type DatabaseTable, type Source } from '../api'
import { SettingInput } from './SettingInput'
import { sourceName } from '../sources'

/** Connects to a database, lists its tables, and adds the ones picked as sources, each under a name it can change. */
export function DatabaseForm({
  database,
  onAdded,
  onCancel,
}: {
  database: Connector
  onAdded: (sources: Source[]) => void
  onCancel: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [tables, setTables] = useState<DatabaseTable[] | null>(null)
  // Each picked table, keyed by its name in the database, to the name of the source it becomes.
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const settings = Object.fromEntries(database.fields.map((field) => [field.name, values[field.name] || null]))
  const count = Object.keys(picked).length

  // New settings may reach a different database, so the tables listed for the old ones go.
  function change(update: () => void) {
    update()
    setTables(null)
    setPicked({})
  }

  async function list(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      setTables(await listTables(database.id, settings))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function add() {
    setBusy(true)
    setError(null)
    try {
      onAdded(await addDatabaseSources(database.id, settings, Object.entries(picked).map(([table, name]) => ({ table, name }))))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={list}>
      {database.fields.map((field) => (
        <SettingInput
          key={field.name}
          field={field}
          value={values[field.name] ?? ''}
          onChange={(value) => change(() => setValues((current) => ({ ...current, [field.name]: value })))}
        />
      ))}

      {tables !== null && (
        <fieldset className="column-formats">
          <legend>Tables</legend>
          {tables.length === 0 && <p className="muted hint">This database has no tables to read.</p>}
          {tables.map((table) => (
            <div key={table.name} className="format-pick">
              <label className="check">
                <input
                  type="checkbox"
                  checked={table.name in picked}
                  onChange={(e) =>
                    setPicked(({ [table.name]: _dropped, ...rest }) =>
                      e.target.checked ? { ...rest, [table.name]: sourceName(table.name) } : rest,
                    )
                  }
                />
                {table.name}
              </label>
              {table.name in picked && (
                <label>
                  Source name
                  <input
                    value={picked[table.name]}
                    onChange={(e) => setPicked((current) => ({ ...current, [table.name]: e.target.value }))}
                    maxLength={63}
                    aria-label={`Source name for ${table.name}`}
                  />
                </label>
              )}
            </div>
          ))}
        </fieldset>
      )}

      {error && <p className="error hint">{error}</p>}

      <div className="form-actions">
        {tables === null ? (
          <button type="submit" disabled={busy}>
            {busy ? 'Connecting…' : 'List tables'}
          </button>
        ) : (
          <button type="button" onClick={add} disabled={busy || count === 0}>
            {busy ? 'Adding…' : `Add ${count} ${count === 1 ? 'source' : 'sources'}`}
          </button>
        )}
        <button type="button" className="quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
