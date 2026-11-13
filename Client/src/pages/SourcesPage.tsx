import { type FormEvent, useEffect, useState } from 'react'
import { listSources, uploadSource, type Source } from '../api'
import { nameFrom } from '../sources'

const DELIMITERS = ['Comma', 'Semicolon', 'Tab', 'Pipe']

export function SourcesPage() {
  const [sources, setSources] = useState<Source[] | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [delimiter, setDelimiter] = useState('Comma')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listSources()
      .then(setSources)
      .catch((e: Error) => setError(e.message))
  }, [])

  function choose(chosen: File | null) {
    setFile(chosen)
    if (chosen) setName(nameFrom(chosen.name))
  }

  async function upload(event: FormEvent) {
    event.preventDefault()
    if (!file) return
    const form = event.currentTarget as HTMLFormElement
    setUploading(true)
    setError(null)
    try {
      const created = await uploadSource(name, file, delimiter)
      setSources((list) => [...(list ?? []), created].sort((a, b) => a.name.localeCompare(b.name)))
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
    <>
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

      {error && <p className="error">{error}</p>}

      {sources === null ? (
        !error && <p className="muted">Loading…</p>
      ) : sources.length === 0 ? (
        <p className="muted">No sources yet. Upload a CSV file to chart it.</p>
      ) : (
        <ul className="list cards">
          {sources.map((source) => (
            <li key={source.id}>
              <h2>{source.name}</h2>
              <p className="muted">
                {source.fileName}: {source.rowCount.toLocaleString()} rows, synced{' '}
                {new Date(source.syncedAt).toLocaleString()}
              </p>
              <p className="columns">{source.columns.map((column) => `${column.name} (${column.type})`).join(', ')}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
