import { type FormEvent, useEffect, useState } from 'react'
import { listDatabases, listSources, syncSource, uploadSource, type Database, type Source } from '../api'
import { DatabaseForm } from '../components/DatabaseForm'
import { Modal } from '../components/Modal'
import { Slideout } from '../components/Slideout'
import { TableView } from '../components/TableView'
import type { TableSettings } from '../dashboard'
import { nameFrom, tooLarge } from '../sources'

const DELIMITERS = ['Comma', 'Semicolon', 'Tab', 'Pipe']

const PREVIEW_ROWS = 50

/** A source's every column, in source order, a page at a time: a table as a chart would show it, unsaved. */
const previewOf = (source: Source): TableSettings => ({
  kind: 'table',
  sourceId: source.id,
  join: null,
  name: null,
  scales: null,
  columns: [],
  sort: null,
  pageSize: PREVIEW_ROWS,
  formats: {},
  count: false,
})

export function SourcesPage() {
  const [sources, setSources] = useState<Source[] | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [delimiter, setDelimiter] = useState('Comma')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState<TableSettings | null>(null)
  const [databases, setDatabases] = useState<Database[]>([])
  const [adding, setAdding] = useState(false)
  const [syncing, setSyncing] = useState<number | null>(null)

  useEffect(() => {
    listSources()
      .then(setSources)
      .catch((e: Error) => setError(e.message))
    listDatabases()
      .then(setDatabases)
      .catch((e: Error) => setError(e.message))
  }, [])

  const keep = (added: Source[]) =>
    setSources((list) =>
      [...(list ?? []).filter((source) => !added.some((a) => a.id === source.id)), ...added].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    )

  async function sync(source: Source) {
    setSyncing(source.id)
    setError(null)
    try {
      keep([await syncSource(source.id)])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSyncing(null)
    }
  }

  const origin = (source: Source) =>
    source.fileName ?? `${databases.find((d) => d.id === source.connector)?.name ?? source.connector} table ${source.stream}`

  // A file over the limit is refused here, since the API would hang up partway through it.
  function choose(chosen: File | null) {
    const refusal = chosen && tooLarge(chosen)
    setError(refusal)
    setFile(refusal ? null : chosen)
    if (chosen && !refusal) setName(nameFrom(chosen.name))
  }

  async function upload(event: FormEvent) {
    event.preventDefault()
    if (!file) return
    const form = event.currentTarget as HTMLFormElement
    setUploading(true)
    setError(null)
    try {
      keep([await uploadSource(name, file, delimiter)])
      form.reset()
      setFile(null)
      setName('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="page">
      <h1>Sources</h1>

      <form className="form" onSubmit={upload}>
        <label>
          CSV file
          <input type="file" accept=".csv,text/csv" onChange={(e) => choose(e.target.files?.[0] ?? null)} />
        </label>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={63} pattern="[a-z][a-z0-9_]*" />
        </label>
        <label>
          Delimiter
          <select value={delimiter} onChange={(e) => setDelimiter(e.target.value)}>
            {DELIMITERS.map((choice) => (
              <option key={choice}>{choice}</option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={uploading || !file}>
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
      </form>

      {databases.length > 0 && (
        <p>
          <button type="button" className="secondary" onClick={() => setAdding(true)}>
            Add a database
          </button>
        </p>
      )}

      {error && <p className="error">{error}</p>}

      {sources === null ? (
        !error && <p className="muted">Loading…</p>
      ) : sources.length === 0 ? (
        <p className="muted">No sources yet. Upload a CSV file or add a database to chart it.</p>
      ) : (
        <ul className="list cards">
          {sources.map((source) => (
            <li key={source.id}>
              <h2>
                <button type="button" className="link-button" onClick={() => setPreviewing(previewOf(source))}>
                  {source.name}
                </button>
              </h2>
              <p className="muted">
                {origin(source)}: {source.rowCount.toLocaleString()} rows, synced {new Date(source.syncedAt).toLocaleString()}
              </p>
              <p className="columns">{source.columns.map((column) => `${column.name} (${column.type})`).join(', ')}</p>
              {source.connector && (
                <p>
                  <button type="button" className="quiet" onClick={() => sync(source)} disabled={syncing === source.id}>
                    {syncing === source.id ? 'Syncing…' : 'Sync now'}
                  </button>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={previewing !== null}
        title={sources?.find((source) => source.id === previewing?.sourceId)?.name ?? ''}
        onClose={() => setPreviewing(null)}
      >
        {previewing && <TableView table={previewing} />}
      </Modal>

      <Slideout open={adding} title="Add a database" onClose={() => setAdding(false)}>
        {databases.length > 0 && (
          <DatabaseForm
            databases={databases}
            onAdded={(added) => {
              keep(added)
              setAdding(false)
            }}
            onCancel={() => setAdding(false)}
          />
        )}
      </Slideout>
    </div>
  )
}
