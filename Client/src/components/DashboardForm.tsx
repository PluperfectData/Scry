import { type FormEvent, useState } from 'react'
import { Help } from './Help'

/** A dashboard's name and, when editing one, whether the index opens it first. */
export function DashboardForm({
  name: initialName = '',
  isLanding: initialLanding = false,
  offerLanding,
  submitLabel,
  onSave,
  onCancel,
}: {
  name?: string
  isLanding?: boolean
  offerLanding: boolean
  submitLabel: string
  onSave: (name: string, isLanding: boolean) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(initialName)
  const [landing, setLanding] = useState(initialLanding)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSave(name.trim(), landing)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sales" required maxLength={200} />
      </label>
      {offerLanding && (
        <span className="field-label">
          <label className="check">
            <input type="checkbox" checked={landing} onChange={(e) => setLanding(e.target.checked)} />
            Open this dashboard first
          </label>
          <Help term="Open this dashboard first">
            Scry opens this dashboard in place of the list of dashboards. Only one dashboard can, so choosing this one
            clears any other.
          </Help>
        </span>
      )}

      {error && <p className="error hint">{error}</p>}

      <div className="form-actions">
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
        <button type="button" className="quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
