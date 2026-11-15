import { useEffect, useState } from 'react'
import { listConnectors, listSources, syncSource, type Connector, type Source } from '../api'
import { ConnectorGrid } from '../components/ConnectorGrid'
import { DatabaseForm } from '../components/DatabaseForm'
import { Modal } from '../components/Modal'
import { Slideout } from '../components/Slideout'
import { TableView } from '../components/TableView'
import { Tooltip } from '../components/Tooltip'
import { UploadForm } from '../components/UploadForm'
import type { TableSettings } from '../dashboard'

const PREVIEW_ROWS = 50

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
  const [error, setError] = useState<string | null>(null)
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
  }, [])

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

  async function sync(source: Source) {
    setSyncing(source.id)
    setError(null)
    try {
      keep([await syncSource(source.id)])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSyncing(null)
    }
  }

  const origin = (source: Source) =>
    source.fileName ?? `${connectors.find((c) => c.id === source.connector)?.name ?? source.connector} table ${source.stream}`

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
                {source.connector && (
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
                {origin(source)}: {source.rowCount.toLocaleString()} rows, synced {new Date(source.syncedAt).toLocaleString()}
              </p>
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
            ) : (
              <DatabaseForm key={picked.id} database={picked} onAdded={added} onCancel={close} />
            )}
          </>
        )}
      </Slideout>
    </div>
  )
}
