import { type FormEvent, useEffect, useState } from 'react'
import { listSchwabStreams, startSchwabSignIn, type Connector, type StreamSummary } from '../api'
import { leaveFor } from '../browser'
import { SettingInput } from './SettingInput'

const START_DATE = 'startDate'

const yearAgo = () => {
  const date = new Date()
  date.setUTCFullYear(date.getUTCFullYear() - 1)
  return date.toISOString().slice(0, 10)
}

const listed = (names: string[]) =>
  names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`

/** Takes a Schwab connection's settings and the streams to add as sources, then sends the browser to Schwab's sign-in. */
export function SchwabForm({ connector, onCancel }: { connector: Connector; onCancel: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({ [START_DATE]: yearAgo() })
  const [streams, setStreams] = useState<StreamSummary[] | null>(null)
  // Each picked stream, keyed by its name at Schwab, to the name of the source it becomes.
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ready = connector.needs.length === 0
  const count = Object.keys(picked).length

  useEffect(() => {
    if (!ready) return
    listSchwabStreams()
      .then(setStreams)
      .catch((e: Error) => setError(e.message))
  }, [ready])

  async function signIn(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const settings = Object.fromEntries(connector.fields.map((field) => [field.name, values[field.name] || null]))
      const { url } = await startSchwabSignIn(settings, Object.entries(picked).map(([table, name]) => ({ table, name })))
      leaveFor(url)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  if (!ready) {
    return (
      <div className="form">
        <p>
          Scry signs in through a Schwab app of yours. Set {listed(connector.needs)} in Scry's settings to that app's key
          and secret, then restart Scry's API.
        </p>
        <div className="form-actions">
          <button type="button" className="quiet" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <form className="form" onSubmit={signIn}>
      {connector.fields.map((field) => (
        <SettingInput
          key={field.name}
          field={field}
          value={values[field.name] ?? ''}
          onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
        />
      ))}

      {streams !== null && (
        <fieldset className="column-formats">
          <legend>Streams</legend>
          {streams.map((stream) => (
            <div key={stream.name} className="format-pick">
              <label className="check">
                <input
                  type="checkbox"
                  checked={stream.name in picked}
                  onChange={(e) =>
                    setPicked(({ [stream.name]: _dropped, ...rest }) =>
                      e.target.checked ? { ...rest, [stream.name]: `schwab_${stream.name}` } : rest,
                    )
                  }
                />
                {stream.name}
              </label>
              {stream.name in picked && (
                <label>
                  Source name
                  <input
                    value={picked[stream.name]}
                    onChange={(e) => setPicked((current) => ({ ...current, [stream.name]: e.target.value }))}
                    maxLength={63}
                    aria-label={`Source name for ${stream.name}`}
                  />
                </label>
              )}
            </div>
          ))}
        </fieldset>
      )}

      <p className="muted hint">Schwab's sign-in page opens next. Once you're back here, Scry copies the picked streams.</p>
      {error && <p className="error hint">{error}</p>}

      <div className="form-actions">
        <button type="submit" disabled={busy || count === 0}>
          {busy ? 'Opening Schwab…' : 'Sign in to Schwab'}
        </button>
        <button type="button" className="quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
