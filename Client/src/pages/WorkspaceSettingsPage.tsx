import { type FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { listKeys, makeKey, revokeKey, type IngestKey } from '../api'
import { KeyShownOnce } from '../components/KeyShownOnce'
import { MembersSection } from '../components/MembersSection'
import { NexusLinkSection } from '../components/NexusLinkSection'
import { Slideout } from '../components/Slideout'
import { Tooltip } from '../components/Tooltip'
import { useSession } from '../session'
import { useWorkspace } from '../workspace'

/** Names a key, then shows it once with a way to copy it. */
function KeyForm({ onMade, onDone }: { onMade: (key: IngestKey) => void; onDone: () => void }) {
  const [name, setName] = useState('')
  const [made, setMade] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function make(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { key, ...view } = await makeKey(name.trim())
      onMade({ ...view, sources: [] })
      setMade(key)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (made) {
    return (
      <KeyShownOnce
        label="Your key"
        value={made}
        note="Scry shows this key only once. Copy it now, and keep it where the script or service that sends rows can read it."
        onDone={onDone}
      />
    )
  }

  return (
    <form className="form" onSubmit={make}>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nexus" required maxLength={100} />
      </label>
      {error && <p className="error hint">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={busy}>
          {busy ? 'Making…' : 'Make key'}
        </button>
        <button type="button" className="quiet" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  )
}

/** A workspace's settings, for its editors: its Nexus link and push keys, and for admins, its members. */
export function WorkspaceSettingsPage() {
  const { me } = useSession()
  const { workspace } = useWorkspace()
  const [keys, setKeys] = useState<IngestKey[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [making, setMaking] = useState(false)

  useEffect(() => {
    listKeys()
      .then(setKeys)
      .catch((e: Error) => setError(e.message))
  }, [])

  async function revoke(key: IngestKey) {
    setError(null)
    try {
      await revokeKey(key.id)
      setKeys((list) => list?.filter((k) => k.id !== key.id) ?? null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="page">
      <h1>Workspace settings</h1>
      <p className="muted">
        For the {workspace.name} workspace.
        {me?.isAdmin && <> Scry&apos;s own addresses, mail, and database are on the <Link to="/settings">Settings page</Link>.</>}
      </p>

      <NexusLinkSection />

      <section>
        <div className="card-head">
          <h2>Push API keys</h2>
          <button type="button" className="secondary" onClick={() => setMaking(true)}>
            Make key
          </button>
        </div>
        <p className="muted">
          A key lets a script or another service send rows into this workspace through the push API. Each key writes only
          to the sources it makes. The <Link to="/docs/push-api">push API reference</Link> shows how to send them.
        </p>

        {error && <p className="error">{error}</p>}

        {keys === null ? (
          !error && <p className="muted">Loading…</p>
        ) : keys.length === 0 ? (
          <p className="muted">No keys yet.</p>
        ) : (
          <ul className="list cards">
            {keys.map((key) => (
              <li key={key.id}>
                <div className="card-head">
                  <h3>{key.name}</h3>
                  <Tooltip label="Revoke key">
                    <button type="button" className="widget-action" onClick={() => revoke(key)} aria-label={`Revoke ${key.name}`}>
                      ×
                    </button>
                  </Tooltip>
                </div>
                <p className="muted">
                  <code>{key.prefix}…</code>, made {new Date(key.createdAt).toLocaleString()}
                </p>
                <p className="columns">{key.sources.length === 0 ? 'Writes no sources yet' : `Writes ${key.sources.join(', ')}`}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {me?.isAdmin && <MembersSection />}

      <Slideout open={making} title="Make a key" onClose={() => setMaking(false)}>
        {making && (
          <KeyForm
            onMade={(key) => setKeys((list) => [...(list ?? []), key].sort((a, b) => a.name.localeCompare(b.name)))}
            onDone={() => setMaking(false)}
          />
        )}
      </Slideout>
    </div>
  )
}
