import { type FormEvent, useState } from 'react'
import { uploadSource, type Source } from '../api'
import { nameFrom, tooLarge } from '../sources'

const DELIMITERS = ['Comma', 'Semicolon', 'Tab', 'Pipe']

/** Uploads a CSV file as a source, named after the file unless renamed. */
export function UploadForm({ onUploaded, onCancel }: { onUploaded: (source: Source) => void; onCancel: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [delimiter, setDelimiter] = useState('Comma')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    setUploading(true)
    setError(null)
    try {
      onUploaded(await uploadSource(name, file, delimiter))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
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

      {error && <p className="error hint">{error}</p>}

      <div className="form-actions">
        <button type="submit" disabled={uploading || !file}>
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
        <button type="button" className="quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
