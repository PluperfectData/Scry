import { useEffect, useState } from 'react'
import { listConnectors, listSources, signInAgain, syncSource, type Connector, type Source } from '../api'
import { leaveFor } from '../browser'
import { ConnectorGrid } from '../components/ConnectorGrid'
import { DatabaseForm } from '../components/DatabaseForm'
import { Modal } from '../components/Modal'
import { SchwabForm } from '../components/SchwabForm'
import { Slideout } from '../components/Slideout'
import { TableView } from '../components/TableView'
import { Tooltip } from '../components/Tooltip'
import { UploadForm } from '../components/UploadForm'
import type { TableSettings } from '../dashboard'

const PREVIEW_ROWS = 50

// How often the list is read again while a source syncs in the background.
const POLL_MS = 2000

const progress = (source: Source) =>
  source.status === 'Syncing'
    ? 'syncing…'
    : source.syncedAt === null
      ? 'not synced yet'
      : `${source.rowCount.toLocaleString()} rows, synced ${new Date(source.syncedAt).toLocaleString()}`

/** A source's every column, in source order, a page at a time: a table as a chart would show it, unsaved. */
const previewOf = (source: Source): TableSettings => ({
  kind: 'table',
  sourceId: source.id,
  join: null,
  name: null,
  scales: null,
  columns: [],
  sort: null,
  pageSize: PREVIEW_ROWS,
  formats: {},
  count: false,
})

export function SourcesPage() {
  const [sources, setSources] = useState<Source[] | null>(null)
  // A sign-in that failed comes back to this page with its reason in the address.
  const [error, setError] = useState<string | null>(() => new URLSearchParams(window.location.search).get('error'))
  const [previewing, setPreviewing] = useState<TableSettings | null>(null)
  const [connectors, setConnectors] = useState<Connector[]>([])
  const [adding, setAdding] = useState(false)
  // The connector picked from the grid, whose form the slideout shows in place of the grid.
  const [picked, setPicked] = useState<Connector | null>(null)
  const [syncing, setSyncing] = useState<number | null>(null)

  useEffect(() => {
    listSources()
      .then(setSources)
      .catch((e: Error) => setError(e.message))
    listConnectors()
      .then(setConnectors)
      .catch((e: Error) => setError(e.message))
    if (new URLSearchParams(window.location.search).has('error')) {
      window.history.replaceState(window.history.state, '', window.location.pathname)
    }
  }, [])

  const anySyncing = sources?.some((source) => source.status === 'Syncing') ?? false
  useEffect(() => {
    if (!anySyncing) return
    const timer = setInterval(() => {
      listSources()
        .then(setSources)
        .catch((e: Error) => setError(e.message))
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [anySyncing])

  const keep = (added: Source[]) =>
    setSources((list) =>
      [...(list ?? []).filter((source) => !added.some((a) => a.id === source.id)), ...added].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    )

  function close() {
    setAdding(false)
    setPicked(null)
  }

  function added(list: Source[]) {
    keep(list)
    close()
  }

  // A failed sync is recorded on its source, so the card shows it; anything else shows over the list.
  async function sync(source: Source) {
    setSyncing(source.id)
    setError(null)
    try {
      keep([await syncSource(source.id)])
    } catch (e) {
      const list = await listSources().catch(() => null)
      if (list) setSources(list)
      const recorded = list?.find((s) => s.id === source.id)
      if (recorded?.status !== 'Failed' && recorded?.status !== 'SignInNeeded') setError((e as Error).message)
    } finally {
      setSyncing(null)
    }
  }

  async function renew(source: Source) {
    setError(null)
    try {
      leaveFor((await signInAgain(source.id)).url)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const origin = (source: Source) => {
    if (source.fileName) return source.fileName
    const name = connectors.find((c) => c.id === source.connector)?.name ?? source.connector
    return `${name} ${source.connector === 'schwab' ? 'stream' : 'table'} ${source.stream}`
  }

  return (
    <div className="page">
      <div className="title-row">
        <h1>Sources</h1>
        <div className="title-actions">
          <Tooltip label="Add source">
            <button type="button" className="icon-button emblem" onClick={() => setAdding(true)}>
              <span className="sr-only">Add source</span>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </button>
          </Tooltip>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {sources === null ? (
        !error && <p className="muted">Loading…</p>
      ) : sources.length === 0 ? (
        <p className="muted">No sources yet. Add a CSV file or a database to chart it.</p>
      ) : (
        <ul className="list cards">
          {sources.map((source) => (
            <li key={source.id}>
              <div className="card-head">
                <h2>
                  <button type="button" className="link-button" onClick={() => setPreviewing(previewOf(source))}>
                    {source.name}
                  </button>
                </h2>
                {source.connector && source.status !== 'Syncing' && source.status !== 'SignInNeeded' && (
                  <Tooltip label={syncing === source.id ? 'Syncing…' : 'Sync now'}>
                    <button
                      type="button"
                      className="widget-action"
                      onClick={() => sync(source)}
                      disabled={syncing === source.id}
                      aria-label={syncing === source.id ? `Syncing ${source.name}…` : `Sync ${source.name} now`}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={syncing === source.id ? 'spinning' : undefined}>
                        <path
                          d="M20 11a8 8 0 0 0-15.3-3.2M4 4v4h4M4 13a8 8 0 0 0 15.3 3.2M20 20v-4h-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </Tooltip>
                )}
              </div>
              <p className="muted">
                {origin(source)}: {progress(source)}
              </p>
              {source.error && <p className="error">{source.error}</p>}
              {source.status === 'SignInNeeded' && (
                <p>
                  <button type="button" className="secondary" onClick={() => renew(source)}>
                    Sign in again
                  </button>
                </p>
              )}
              <p className="columns">{source.columns.map((column) => `${column.name} (${column.type})`).join(', ')}</p>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={previewing !== null}
        title={sources?.find((source) => source.id === previewing?.sourceId)?.name ?? ''}
        onClose={() => setPreviewing(null)}
      >
        {previewing && <TableView table={previewing} />}
      </Modal>

      <Slideout open={adding} title={picked ? `Add ${picked.name}` : 'Add a source'} onClose={close}>
        {picked === null ? (
          <ConnectorGrid connectors={connectors} onPick={setPicked} />
        ) : (
          <>
            <p>
              <button type="button" className="link-button" onClick={() => setPicked(null)}>
                All connectors
              </button>
            </p>
            {picked.id === 'csv' ? (
              <UploadForm onUploaded={(source) => added([source])} onCancel={close} />
            ) : picked.id === 'schwab' ? (
              <SchwabForm connector={picked} onCancel={close} />
            ) : (
              <DatabaseForm key={picked.id} database={picked} onAdded={added} onCancel={close} />
            )}
          </>
        )}
      </Slideout>
    </div>
  )
}
