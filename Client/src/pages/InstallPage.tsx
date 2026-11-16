import { type FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  type Addresses,
  askForInstallCode,
  type DatabaseForm,
  getInstall,
  installAddresses,
  installDatabase,
  type InstallView,
} from '../api'
import { AddressFields, DatabaseFields } from '../components/InstanceForms'

// The code arrives after the # of the link Scry logs.
function codeInLink(): string | null {
  return decodeURIComponent(window.location.hash.slice(1)).trim() || null
}

/**
 * The first-run installer: the database, then the client's address and the API's. On an instance already set up, it
 * changes the addresses, for when a wrong client address keeps Scry's pages from reaching its API.
 */
export function InstallPage() {
  const [code, setCode] = useState<string | null>(codeInLink)
  const [view, setView] = useState<InstallView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)

  // The code leaves the address bar once read, so it stays out of the browser's history.
  useEffect(() => {
    if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
  }, [])

  useEffect(() => {
    getInstall(code)
      .then(setView)
      .catch((e: Error) => setError(e.message))
  }, [code])

  function body() {
    if (view === null) return error ? null : <p className="muted">Loading…</p>
    if (finished) return <Finished />
    if (view.installed) return <Installed view={view} code={code} onCode={setCode} onSaved={setView} />
    if (!view.allowed) return <CodeStage given={code} repair={false} onCode={setCode} />
    if (view.stage === 'Database') {
      return <DatabaseStage view={view} onSave={async (database) => setView(await installDatabase(code, database))} />
    }
    return (
      <AddressStage
        view={view}
        onSave={async (addresses) => {
          const next = await installAddresses(code, addresses)
          setView(next)
          setFinished(next.installed)
        }}
      />
    )
  }

  return (
    <div className="page narrow">
      <h1>Set up Scry</h1>
      {error && <p className="error">{error}</p>}
      {body()}
    </div>
  )
}

function Steps({ at }: { at: number }) {
  const names = ['Database', 'Addresses']
  return (
    <p className="muted">
      Step {at} of {names.length}: {names[at - 1]}
    </p>
  )
}

/** Asks for the install code, for a page on another machine than Scry's. */
function CodeStage({ given, repair, onCode }: { given: string | null; repair: boolean; onCode: (code: string) => void }) {
  const [entered, setEntered] = useState('')
  const [asked, setAsked] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    onCode(entered.trim())
  }

  async function ask() {
    setError(null)
    try {
      await askForInstallCode()
      setAsked(true)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <>
      <p>
        {repair
          ? 'This page is not on the machine Scry runs on, so it needs an install code. Ask for one, and Scry writes it to its log, good for an hour.'
          : 'This page is not on the machine Scry runs on, so it needs the install code. Scry writes the code to its log when it starts, with a link to this page that carries it.'}
      </p>
      {given && <p className="error">That is not the install code. Copy it from Scry's log.</p>}
      <form className="form" onSubmit={submit}>
        <label>
          Install code
          <input value={entered} onChange={(e) => setEntered(e.target.value)} placeholder="ABCD-EFGH-JKMN" required autoComplete="off" />
        </label>
        {error && <p className="error hint">{error}</p>}
        {asked && <p className="success hint">Scry wrote the code to its log.</p>}
        <div className="form-actions">
          <button type="submit">Continue</button>
          <button type="button" className="link-button" onClick={ask}>
            {repair ? 'Write a code to the log' : 'Write the code to the log again'}
          </button>
        </div>
      </form>
    </>
  )
}

function DatabaseStage({ view, onSave }: { view: InstallView; onSave: (database: DatabaseForm) => Promise<void> }) {
  if (view.databaseConfigured) {
    return (
      <>
        <Steps at={1} />
        <p>
          Scry's configuration sets its database, in ConnectionStrings:Scry, and Scry cannot open it
          {view.databaseProblem ? `: ${view.databaseProblem}` : '.'}
        </p>
        <p className="muted">Fix the connection string, or remove it to set the database here, then restart Scry.</p>
      </>
    )
  }

  return (
    <>
      <Steps at={1} />
      {view.databaseProblem ? (
        <p className="error">Scry cannot open its database: {view.databaseProblem}</p>
      ) : (
        <p>Scry keeps its dashboards, sources, and keys in a MySQL database.</p>
      )}
      <DatabaseFields place={view.database} keepsPassword={false} submitLabel="Test and save" onSubmit={onSave} />
    </>
  )
}

function AddressStage({ view, onSave }: { view: InstallView; onSave: (addresses: Addresses) => Promise<void> }) {
  return (
    <>
      <Steps at={2} />
      <p>Scry takes requests from its own pages alone, and tells Nexus where to send rows.</p>
      <AddressFields
        clientOrigin={view.clientOrigin}
        clientConfigured={view.clientOriginConfigured}
        apiOrigin={view.apiOrigin}
        apiConfigured={view.apiOriginConfigured}
        submitLabel="Save addresses"
        onSubmit={onSave}
      />
    </>
  )
}

function Finished() {
  const navigate = useNavigate()

  return (
    <>
      <p className="success">Scry is set up.</p>
      <p>Add a source to bring data in, then chart it on a dashboard. The Settings page changes the addresses and the database later.</p>
      <div className="form-actions">
        <button type="button" onClick={() => navigate('/sources')}>
          Add a source
        </button>
      </div>
    </>
  )
}

/** An instance already set up: a way to change its addresses when its pages cannot reach it. */
function Installed({
  view,
  code,
  onCode,
  onSaved,
}: {
  view: InstallView
  code: string | null
  onCode: (code: string) => void
  onSaved: (view: InstallView) => void
}) {
  const [changing, setChanging] = useState(false)

  return (
    <>
      <p>
        Scry is set up. Its addresses and database are on the <Link to="/settings">Settings page</Link>.
      </p>
      <section>
        <h2>Pages that cannot reach Scry</h2>
        {!changing ? (
          <>
            <p className="muted">When a wrong client address keeps Scry's pages from reaching its API, change the addresses here.</p>
            <button type="button" className="secondary" onClick={() => setChanging(true)}>
              Change the addresses
            </button>
          </>
        ) : view.allowed ? (
          <AddressFields
            clientOrigin={view.clientOrigin}
            clientConfigured={view.clientOriginConfigured}
            apiOrigin={view.apiOrigin}
            apiConfigured={view.apiOriginConfigured}
            submitLabel="Save addresses"
            onSubmit={async (addresses) => onSaved(await installAddresses(code, addresses))}
          />
        ) : (
          <CodeStage given={code} repair onCode={onCode} />
        )}
      </section>
    </>
  )
}
