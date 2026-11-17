import { type FormEvent, useState } from 'react'
import { makeWorkspace, type WorkspaceDetail } from '../api'

/** Makes a workspace, for admins. */
export function WorkspaceForm({ onMade }: { onMade: (workspace: WorkspaceDetail) => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function make(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const made = await makeWorkspace(name.trim())
      setName('')
      onMade(made)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form inline" onSubmit={make}>
      <label>
        New workspace
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Finance" required maxLength={200} />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? 'Making…' : 'Make workspace'}
      </button>
      {error && <p className="error hint">{error}</p>}
    </form>
  )
}
