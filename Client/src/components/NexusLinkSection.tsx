import { type FormEvent, useEffect, useState } from 'react'
import { getNexusLink, type NexusLink, startNexusPairing, unlinkNexus } from '../api'
import { leaveFor } from '../browser'

/**
 * The open workspace's link to Nexus. Linking sends an admin to Nexus to approve it, and Nexus sends them back here,
 * linked, with the outcome in the address.
 */
export function NexusLinkSection() {
  const [link, setLink] = useState<NexusLink | null>(null)
  const [nexusUrl, setNexusUrl] = useState('http://localhost:6163')
  const [busy, setBusy] = useState(false)
  // Nexus's callback comes back to this page with ?linked=1, or with the reason it failed.
  const [notice] = useState(() => (new URLSearchParams(window.location.search).has('linked') ? 'This workspace is linked to Nexus.' : null))
  const [error, setError] = useState<string | null>(() => new URLSearchParams(window.location.search).get('error'))

  useEffect(() => {
    getNexusLink()
      .then(setLink)
      .catch((e: Error) => setError(e.message))
    const search = new URLSearchParams(window.location.search)
    if (search.has('linked') || search.has('error')) {
      window.history.replaceState(window.history.state, '', window.location.pathname)
    }
  }, [])

  async function pair(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      leaveFor((await startNexusPairing(nexusUrl.trim())).approveUrl)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  async function unlink() {
    if (!window.confirm('Unlink this workspace from Nexus? Both keys are revoked, and Nexus stops sending rows. The sources it sent stay.')) return
    setBusy(true)
    setError(null)
    try {
      await unlinkNexus()
      setLink({ linked: false, nexusUrl: null, appName: null, workspaceName: null, pushKeyName: null, pushKeyPrefix: null, linkedAt: null })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h2>Nexus</h2>
      <p className="muted">
        Nexus connects Scry to databases and services, keeps their sign-ins, and sends their rows here. Linking asks an admin
        of the Nexus instance to approve this workspace, and the two exchange keys themselves. Each workspace links on its
        own.
      </p>
      {notice && <p className="success">{notice}</p>}
      {error && <p className="error">{error}</p>}
      {link === null ? (
        !error && <p className="muted">Loading…</p>
      ) : link.linked ? (
        <>
          <p>
            Linked to Nexus at <code>{link.nexusUrl}</code> as {link.appName}, in the {link.workspaceName} workspace, since{' '}
            {new Date(link.linkedAt!).toLocaleString()}.
          </p>
          <p className="muted">
            {link.pushKeyPrefix ? (
              <>
                Nexus sends rows with the push key {link.pushKeyName}, <code>{link.pushKeyPrefix}…</code>.
              </>
            ) : (
              'The push key Nexus sends rows with was revoked. Unlink, then link again.'
            )}
          </p>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={unlink} disabled={busy}>
              Unlink
            </button>
          </div>
        </>
      ) : (
        <form className="form" onSubmit={pair}>
          <label>
            Nexus address
            <input type="url" value={nexusUrl} onChange={(e) => setNexusUrl(e.target.value)} required />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={busy}>
              {busy ? 'Opening Nexus…' : 'Link Nexus'}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
