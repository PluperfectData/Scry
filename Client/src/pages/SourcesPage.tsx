import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  type ChartUse,
  connectThroughNexus,
  getNexusLink,
  listConnectors,
  listNexusConnectors,
  listNexusSyncs,
  listSources,
  listSourceUses,
  removeSource,
  runNexusSync,
  signInAgain,
  syncSource,
  type Connector,
  type NexusConnector,
  type NexusLink,
  type NexusSync,
  type Source,
} from '../api'
import { leaveFor } from '../browser'
import { ConnectorGrid } from '../components/ConnectorGrid'
import { Modal } from '../components/Modal'
import { SchwabForm } from '../components/SchwabForm'
import { Slideout } from '../components/Slideout'
import { TableView } from '../components/TableView'
import { Tooltip } from '../components/Tooltip'
import { UploadForm } from '../components/UploadForm'
import type { TableSettings } from '../dashboard'
import { useWorkspace } from '../workspace'

const PREVIEW_ROWS = 50

/// The push API is Scry's own way in, so its tile joins the connectors' after CSV's.
const PUSH: Connector = {
  id: 'push',
  name: 'Push API',
  description: 'Rows a script or another service sends with a key.',
  fields: [],
  needs: [],
}

/** Databases and services come through Nexus, so while Scry is unlinked this tile goes to Settings to link it. */
const LINK_NEXUS: Connector = {
  id: 'nexus',
  name: 'Link Nexus',
  description: 'Databases and services come through Nexus. Link it on Settings to add them here.',
  fields: [],
  needs: [],
}

const asConnector = (connector: NexusConnector): Connector => ({ ...connector, fields: [], needs: [] })

// How often the list is read again while a source syncs in the background.
const POLL_MS = 2000

const pushed = (source: Source) => source.kind === 'Push' || source.kind === 'Nexus'

const progress = (source: Source) =>
  source.status === 'Syncing'
    ? 'syncing…'
    : source.syncedAt === null
      ? pushed(source)
        ? 'no rows pushed yet'
        : 'not synced yet'
      : `${source.rowCount.toLocaleString()} rows, synced ${new Date(source.syncedAt).toLocaleString()}`

const running = (sync: NexusSync) => sync.status === 'Queued' || sync.status === 'Running'

/** How a Nexus sync stands, for its source's card, and whether that is a failure. */
function syncState(sync: NexusSync): { text: string; failed: boolean } {
  if (sync.status === 'Queued') return { text: 'Nexus has a sync of it queued.', failed: false }
  if (sync.status === 'Running') return { text: 'Nexus is syncing it…', failed: false }
  const run = sync.lastRun
  if (!run) return { text: 'Nexus has not synced it yet.', failed: false }
  const when = run.endedAt ? new Date(run.endedAt).toLocaleString() : ''
  return run.status === 'Failed'
    ? { text: `Nexus's last sync failed, ${when}: ${run.error ?? 'no reason given'}`, failed: true }
    : { text: `Nexus's last sync sent ${run.rows.toLocaleString()} rows, ${when}.`, failed: false }
}

/** What a page's address says on coming back here: a sign-in's failure, or how connecting through Nexus went. */
function arrivalOf(search: string): { error: string | null; notice: string | null } {
  const params = new URLSearchParams(search)
  const error = params.get('error')
  if (error === 'cancelled') return { error: null, notice: 'Connecting through Nexus was cancelled.' }
  if (params.has('connection')) return { error, notice: 'Connected through Nexus. Its tables are syncing in.' }
  return { error, notice: null }
}

const SyncIcon = ({ spinning }: { spinning: boolean }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={spinning ? 'spinning' : undefined}>
    <path
      d="M20 11a8 8 0 0 0-15.3-3.2M4 4v4h4M4 13a8 8 0 0 0 15.3 3.2M20 20v-4h-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

/**
 * What removing a source takes with it, for the confirm: the charts that read it, and what pushes it again, by its
 * Nexus sync when one fills it.
 */
function removalQuestion(source: Source, uses: ChartUse[], sync: NexusSync | undefined): string {
  const lines = [`Remove ${source.name} and its rows?`]
  if (uses.length > 0) {
    lines.push(
      '',
      uses.length === 1 ? 'This chart reads it, and will ask for another source:' : 'These charts read it, and will ask for another source:',
      ...uses.map((use) => `• ${use.chartTitle ?? `An untitled ${use.chartKind ?? 'chart'}`}, on ${use.dashboardName}`),
    )
  }
  if (sync) {
    lines.push(
      '',
      `Nexus's sync of ${sync.stream} from ${sync.connectionName} (${sync.connectorName}) still writes it, so it comes back on that sync's next run. To stop that, remove the sync in Nexus.`,
    )
  } else if (pushed(source) && source.pushedBy) {
    lines.push(
      '',
      `The key ${source.pushedBy} can still push to it${source.origin ? `, from ${source.origin}` : ''}, and its next push makes it again. To stop that, remove what pushes it, such as its sync in Nexus.`,
    )
  }
  return lines.join('\n')
}

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
  const navigate = useNavigate()
  const { base } = useWorkspace()
  const [arrival] = useState(() => arrivalOf(window.location.search))
  const [sources, setSources] = useState<Source[] | null>(null)
  const [error, setError] = useState<string | null>(arrival.error)
  const notice = arrival.notice
  const [previewing, setPreviewing] = useState<TableSettings | null>(null)
  const [connectors, setConnectors] = useState<Connector[]>([])
  const [link, setLink] = useState<NexusLink | null>(null)
  const [nexusConnectors, setNexusConnectors] = useState<NexusConnector[]>([])
  const [nexusSyncs, setNexusSyncs] = useState<NexusSync[]>([])
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
    getNexusLink()
      .then((found) => {
        setLink(found)
        if (!found.linked) return
        listNexusConnectors()
          .then(setNexusConnectors)
          .catch((e: Error) => setError(e.message))
        listNexusSyncs()
          .then(setNexusSyncs)
          .catch((e: Error) => setError(e.message))
      })
      .catch((e: Error) => setError(e.message))
    const params = new URLSearchParams(window.location.search)
    if (params.has('error') || params.has('connection')) {
      window.history.replaceState(window.history.state, '', window.location.pathname)
    }
  }, [])

  const anySyncing = sources?.some((source) => source.status === 'Syncing') ?? false
  const nexusBusy = nexusSyncs.some(running)
  useEffect(() => {
    if (!anySyncing && !nexusBusy) return
    const timer = setInterval(() => {
      listSources()
        .then(setSources)
        .catch((e: Error) => setError(e.message))
      if (nexusBusy) {
        listNexusSyncs()
          .then(setNexusSyncs)
          .catch((e: Error) => setError(e.message))
      }
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [anySyncing, nexusBusy])

  const syncOf = (source: Source) => (source.kind === 'Nexus' ? nexusSyncs.find((s) => s.table === source.name) : undefined)

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

  async function remove(source: Source) {
    setError(null)
    try {
      if (!window.confirm(removalQuestion(source, await listSourceUses(source.id), syncOf(source)))) return
      await removeSource(source.id)
      setSources((list) => (list ?? []).filter((s) => s.id !== source.id))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function runThroughNexus(sync: NexusSync) {
    setError(null)
    try {
      const queued = await runNexusSync(sync.id)
      setNexusSyncs((list) => list.map((s) => (s.id === queued.id ? queued : s)))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function connect(connector: Connector) {
    setError(null)
    try {
      leaveFor((await connectThroughNexus(connector.id)).url)
    } catch (e) {
      close()
      setError((e as Error).message)
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
    if (pushed(source)) return source.pushedBy ? `pushed with the key ${source.pushedBy}, ${source.pushKeyPrefix}…` : 'pushed by a revoked key'
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

      {notice && <p className="success">{notice}</p>}
      {error && <p className="error">{error}</p>}

      {sources === null ? (
        !error && <p className="muted">Loading…</p>
      ) : sources.length === 0 ? (
        <p className="muted">No sources yet. Add a CSV file, or a database through Nexus, to chart it.</p>
      ) : (
        <ul className="list cards">
          {sources.map((source) => {
            const nexusSync = syncOf(source)
            const state = nexusSync && syncState(nexusSync)
            return (
              <li key={source.id}>
                <div className="card-head">
                  <h2>
                    <button type="button" className="link-button" onClick={() => setPreviewing(previewOf(source))}>
                      {source.name}
                    </button>
                  </h2>
                  <div className="widget-actions">
                    {source.connector && source.status !== 'Syncing' && source.status !== 'SignInNeeded' && (
                      <Tooltip label={syncing === source.id ? 'Syncing…' : 'Sync now'}>
                        <button
                          type="button"
                          className="widget-action"
                          onClick={() => sync(source)}
                          disabled={syncing === source.id}
                          aria-label={syncing === source.id ? `Syncing ${source.name}…` : `Sync ${source.name} now`}
                        >
                          <SyncIcon spinning={syncing === source.id} />
                        </button>
                      </Tooltip>
                    )}
                    {nexusSync && (
                      <Tooltip label={running(nexusSync) ? 'Nexus is syncing it' : 'Sync now through Nexus'}>
                        <button
                          type="button"
                          className="widget-action"
                          onClick={() => runThroughNexus(nexusSync)}
                          disabled={running(nexusSync)}
                          aria-label={running(nexusSync) ? `Nexus is syncing ${source.name}…` : `Sync ${source.name} now through Nexus`}
                        >
                          <SyncIcon spinning={running(nexusSync)} />
                        </button>
                      </Tooltip>
                    )}
                    <Tooltip label="Log">
                      <Link to={`/log?source=${source.id}`} className="widget-action" aria-label={`Log for ${source.name}`}>
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                          <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </Link>
                    </Tooltip>
                    {source.status !== 'Syncing' && (
                      <Tooltip label="Remove source">
                        <button type="button" className="widget-action" onClick={() => remove(source)} aria-label={`Remove ${source.name}`}>
                          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path
                              d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"
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
                </div>
                <p className="muted">
                  {origin(source)}: {progress(source)}
                </p>
                {source.origin && <p className="muted">From {source.origin}.</p>}
                {state && <p className={state.failed ? 'error' : 'muted'}>{state.text}</p>}
                {nexusSync?.needsSignIn && <p className="error">Its connection in Nexus needs a new sign-in. Sign in again in Nexus.</p>}
                {source.kind === 'Nexus' && !nexusSync && <p className="muted">No Nexus sync writes it now.</p>}
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
            )
          })}
        </ul>
      )}

      <Modal
        open={previewing !== null}
        title={sources?.find((source) => source.id === previewing?.sourceId)?.name ?? ''}
        onClose={() => setPreviewing(null)}
      >
        {previewing && <TableView table={previewing} />}
      </Modal>

      <Slideout
        open={adding}
        title={picked === null ? 'Add a source' : picked.id === PUSH.id ? PUSH.name : `Add ${picked.name}`}
        onClose={close}
      >
        {picked === null ? (
          <>
            <ConnectorGrid connectors={connectors.flatMap((c) => (c.id === 'csv' ? [c, PUSH] : [c]))} onPick={setPicked} />
            {link !== null && (
              <section aria-labelledby="through-nexus">
                <h3 id="through-nexus">Through Nexus</h3>
                {!link.linked ? (
                  <ConnectorGrid connectors={[LINK_NEXUS]} onPick={() => navigate(`${base}/settings`)} />
                ) : nexusConnectors.length > 0 ? (
                  <ConnectorGrid connectors={nexusConnectors.map(asConnector)} onPick={connect} />
                ) : (
                  <p className="muted">Nexus offers no connectors.</p>
                )}
              </section>
            )}
          </>
        ) : (
          <>
            <p>
              <button type="button" className="link-button" onClick={() => setPicked(null)}>
                All connectors
              </button>
            </p>
            {picked.id === PUSH.id ? (
              <div className="form">
                <p>
                  A script or another service sends rows through the push API, and each source it makes is one of yours.
                  Make it a key on Settings, then send rows as the reference shows.
                </p>
                <p>
                  <Link to={`${base}/settings`}>Make a key on Settings</Link>
                </p>
                <p>
                  <Link to="/docs/push-api">Read the push API reference</Link>
                </p>
              </div>
            ) : picked.id === 'csv' ? (
              <UploadForm onUploaded={(source) => added([source])} onCancel={close} />
            ) : (
              <SchwabForm connector={picked} onCancel={close} />
            )}
          </>
        )}
      </Slideout>
    </div>
  )
}
