import { type FormEvent, useState } from 'react'
import { DEFAULT_PRESENTATION, validSeconds, type PresentationSettings } from '../presentation'
import { Help } from './Help'
import { PresentationFields } from './PresentationFields'

/** A dashboard's name and, when editing one, whether the index opens it first and how it shows in full screen. */
export function DashboardForm({
  name: initialName = '',
  isLanding: initialLanding = false,
  presentation: initialPresentation = null,
  editing,
  submitLabel,
  onSave,
  onCancel,
}: {
  name?: string
  isLanding?: boolean
  presentation?: PresentationSettings | null
  editing: boolean
  submitLabel: string
  onSave: (name: string, isLanding: boolean, presentation: PresentationSettings) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(initialName)
  const [landing, setLanding] = useState(initialLanding)
  const [presentation, setPresentation] = useState(initialPresentation ?? DEFAULT_PRESENTATION)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = !presentation.scroll || presentation.pace !== 'custom' || validSeconds(presentation.seconds)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSave(name.trim(), landing, presentation)
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
      {editing && (
        <>
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

          <fieldset className="column-formats">
            <legend>Full screen</legend>
            <label className="check">
              <input
                type="checkbox"
                checked={presentation.showTitle}
                onChange={(e) => setPresentation({ ...presentation, showTitle: e.target.checked })}
              />
              Show the title
            </label>
            <span className="field-label">
              <label className="check">
                <input
                  type="checkbox"
                  checked={presentation.scroll}
                  onChange={(e) => setPresentation({ ...presentation, scroll: e.target.checked })}
                />
                Scroll the data
              </label>
              <Help term="Scroll the data">
                In full screen, tables and pivot tables scroll through their rows, and charts with an x axis slide
                along it, on their own. A chart's own settings can turn this off or set its own speed.
              </Help>
            </span>
            {presentation.scroll && (
              <PresentationFields value={presentation} onChange={(next) => setPresentation({ ...presentation, ...next })} />
            )}
          </fieldset>
        </>
      )}

      {error && <p className="error hint">{error}</p>}

      <div className="form-actions">
        <button type="submit" disabled={busy || !valid}>
          {busy ? 'Saving…' : submitLabel}
        </button>
        <button type="button" className="quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
