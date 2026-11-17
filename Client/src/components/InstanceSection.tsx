import { type FormEvent, useEffect, useState } from 'react'
import { type DatabaseForm, getInstanceSettings, type InstanceSettings, saveAddresses, saveDatabase, saveLogDays } from '../api'
import { settingsMail } from '../mail'
import { AddressFields, DatabaseFields, MailForm } from './InstanceForms'

/** The instance's addresses, mail, and database, as the installer set them. */
export function InstanceSection() {
  const [settings, setSettings] = useState<InstanceSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [moved, setMoved] = useState(false)

  useEffect(() => {
    getInstanceSettings()
      .then(setSettings)
      .catch((e: Error) => setError(e.message))
  }, [])

  async function switchDatabase(database: DatabaseForm) {
    const place = settings?.database
    const elsewhere = !place || place.host !== database.host || place.port !== database.port || place.name !== database.name
    if (elsewhere && !window.confirm(`Move Scry to the database ${database.name} on ${database.host}? Its dashboards, sources, and keys come from there from now on.`)) return
    setMoved(false)
    setSettings(await saveDatabase(database))
    setMoved(true)
  }

  if (settings === null) {
    return error ? <p className="error">{error}</p> : null
  }

  const place = settings.database
  return (
    <>
      <section>
        <h2>Addresses</h2>
        <AddressFields
          clientOrigin={settings.clientOrigin}
          clientConfigured={settings.clientOriginConfigured}
          apiOrigin={settings.apiOrigin}
          apiConfigured={settings.apiOriginConfigured}
          submitLabel="Save addresses"
          onSubmit={async (addresses) => setSettings(await saveAddresses(addresses))}
        />
      </section>

      <section>
        <h2>Mail</h2>
        <MailForm mail={settings.mail} actions={settingsMail(setSettings)} />
      </section>

      <section>
        <h2>Database</h2>
        {place && (
          <p className="muted">
            Scry keeps its dashboards, sources, and keys in <code>{place.name}</code> on <code>{place.host}:{place.port}</code>, as{' '}
            <code>{place.user}</code>. The rows of each source stay in Scry's data folder, whichever database it uses.
          </p>
        )}
        {settings.databaseConfigured ? (
          <p className="muted">ConnectionStrings:Scry in Scry's configuration sets the database, so it cannot be changed here.</p>
        ) : (
          <>
            {moved && <p className="success">Scry uses this database now.</p>}
            <DatabaseFields place={place} keepsPassword submitLabel="Test and switch" onSubmit={switchDatabase} />
          </>
        )}
      </section>

      <section>
        <h2>Log</h2>
        <LogDaysForm settings={settings} onSaved={setSettings} />
      </section>
    </>
  )
}

/** How many days the Log page keeps an entry. */
function LogDaysForm({ settings, onSaved }: { settings: InstanceSettings; onSaved: (settings: InstanceSettings) => void }) {
  const [days, setDays] = useState(String(settings.logDays))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  if (settings.logDaysConfigured) {
    return <p className="muted">Scry's configuration keeps log entries for {settings.logDays} days, in Scry:LogDays.</p>
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      onSaved(await saveLogDays(Number(days)))
      setSaved(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form inline" onSubmit={submit}>
      <label>
        Keep entries for this many days
        <input type="number" min={1} max={365} step={1} value={days} onChange={(e) => setDays(e.target.value)} required />
      </label>
      <div className="form-actions">
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="success">Saved.</span>}
      </div>
      {error && <p className="error hint">{error}</p>}
    </form>
  )
}
