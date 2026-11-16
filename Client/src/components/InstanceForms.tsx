import { type FormEvent, useState } from 'react'
import { type Addresses, apiUrl, type DatabaseForm, type DatabasePlace } from '../api'

/** A MySQL database's host, port, name, user, and password. */
export function DatabaseFields({
  place,
  keepsPassword,
  submitLabel,
  onSubmit,
}: {
  place: DatabasePlace | null
  /** Whether a blank password keeps the stored one. */
  keepsPassword: boolean
  submitLabel: string
  onSubmit: (database: DatabaseForm) => Promise<void>
}) {
  const [host, setHost] = useState(place?.host ?? 'localhost')
  const [port, setPort] = useState(String(place?.port ?? 3306))
  const [name, setName] = useState(place?.name ?? 'scry')
  const [user, setUser] = useState(place?.user ?? 'scry')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSubmit({ host: host.trim(), port: Number(port), name: name.trim(), user: user.trim(), password })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>
        Host
        <input value={host} onChange={(e) => setHost(e.target.value)} required autoComplete="off" />
      </label>
      <label>
        Port
        <input type="number" min={1} max={65535} value={port} onChange={(e) => setPort(e.target.value)} required />
      </label>
      <label>
        Database
        <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="off" />
      </label>
      <label>
        User
        <input value={user} onChange={(e) => setUser(e.target.value)} required autoComplete="off" />
      </label>
      <label>
        Password
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      </label>
      <p className="hint muted">
        Scry makes the database if it is missing and the user may, then brings it up to date.
        {keepsPassword && ' Leave the password blank to keep the stored one.'}
      </p>
      {error && <p className="error hint">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={busy}>
          {busy ? 'Opening the database…' : submitLabel}
        </button>
      </div>
    </form>
  )
}

/** The client's address and the API's. One set by Scry's configuration is shown, and cannot be changed. */
export function AddressFields({
  clientOrigin,
  clientConfigured,
  apiOrigin,
  apiConfigured,
  submitLabel,
  onSubmit,
}: {
  clientOrigin: string | null
  clientConfigured: boolean
  apiOrigin: string | null
  apiConfigured: boolean
  submitLabel: string
  onSubmit: (addresses: Addresses) => Promise<void>
}) {
  const here = window.location.origin
  const [client, setClient] = useState(clientOrigin ?? here)
  const [api, setApi] = useState(apiOrigin ?? apiUrl)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const next = client.trim().replace(/\/+$/, '')
    if (!clientConfigured && next !== here && !window.confirm(`Pages at ${here} stop reaching Scry once its client is ${next}. Save anyway?`)) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await onSubmit({ clientOrigin: clientConfigured ? '' : next, apiOrigin: apiConfigured ? '' : api.trim() })
      setSaved(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>
        Client address
        <input type="url" value={client} onChange={(e) => setClient(e.target.value)} disabled={clientConfigured} required />
      </label>
      <label>
        API address
        <input type="url" value={api} onChange={(e) => setApi(e.target.value)} disabled={apiConfigured} required />
      </label>
      <p className="hint muted">
        The client address is where people open Scry, and the only site whose pages may call its API. The API address is
        where those pages reach it, and where Nexus sends rows and comes back to after linking.
        {clientConfigured && ' Scry:ClientOrigin in its configuration sets the client address.'}
        {apiConfigured && ' Scry:ApiOrigin in its configuration sets the API address.'}
      </p>
      {error && <p className="error hint">{error}</p>}
      {saved && <p className="success hint">Saved.</p>}
      <div className="form-actions">
        <button type="submit" disabled={busy || (clientConfigured && apiConfigured)}>
          {submitLabel}
        </button>
      </div>
    </form>
  )
}
