import { type FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  type Addresses,
  askForInstallCode,
  type DatabaseForm,
  getInstall,
  installAddresses,
  installAdmin,
  installDatabase,
  installMail,
  installMailOff,
  installTestMail,
  type InstallView,
  type MailActions,
  type Me,
} from '../api'
import { AddressFields, DatabaseFields, MailForm } from '../components/InstanceForms'
import { useSession } from '../session'

const MIN_PASSWORD = 12

// The code arrives after the # of the link Scry logs.
function codeInLink(): string | null {
  return decodeURIComponent(window.location.hash.slice(1)).trim() || null
}

/**
 * The first-run installer: the database, then the client's address and the API's, then mail, then the first admin. On
 * an instance already set up, it changes the addresses, for when a wrong client address keeps Scry's pages from
 * reaching its API, and makes an admin for someone locked out.
 */
export function InstallPage() {
  const { setMe } = useSession()
  const navigate = useNavigate()
  const [code, setCode] = useState<string | null>(codeInLink)
  const [view, setView] = useState<InstallView | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Mail has no stage of its own: the page shows it on reaching the admin stage, until Continue.
  const [mailSettled, setMailSettled] = useState(false)
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

  async function madeAdmin(made: Me) {
    setMe(made)
    if (view?.installed) {
      navigate('/')
      return
    }
    setFinished(true)
  }

  const mailActions: MailActions = {
    save: async (serverToken, from, fromName) => setView(await installMail(code, serverToken, from, fromName)),
    off: async () => setView(await installMailOff(code)),
    test: (to) => installTestMail(code, to),
    asksForRecipient: true,
  }

  function body() {
    if (view === null) return error ? null : <p className="muted">Loading…</p>
    if (finished) return <Finish />
    if (view.installed) return <Installed view={view} code={code} onCode={setCode} onSaved={setView} onAdmin={madeAdmin} />
    if (!view.allowed) return <CodeStage given={code} recovery={false} onCode={setCode} />
    switch (view.stage) {
      case 'Database':
        return <DatabaseStage view={view} onSave={async (database) => setView(await installDatabase(code, database))} />
      case 'Address':
        return <AddressStage view={view} onSave={async (addresses) => setView(await installAddresses(code, addresses))} />
      case 'Admin':
        return mailSettled ? (
          <AdminStage mail={view.mail} onMake={async (email, password) => madeAdmin(await installAdmin(code, email, password))} />
        ) : (
          <MailStage view={view} actions={mailActions} onContinue={() => setMailSettled(true)} />
        )
      default:
        return null
    }
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
  const names = ['Database', 'Addresses', 'Mail', 'First admin']
  return (
    <p className="muted">
      Step {at} of {names.length}: {names[at - 1]}
    </p>
  )
}

/** Asks for the install code, for a page on another machine than Scry's. */
function CodeStage({ given, recovery, onCode }: { given: string | null; recovery: boolean; onCode: (code: string) => void }) {
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
        {recovery
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
            {recovery ? 'Write a code to the log' : 'Write the code to the log again'}
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

/** An email and a password, twice. Once mail works the password may stay blank, to sign in by mailed links. */
function AdminForm({
  submitLabel,
  passwordOptional,
  onMake,
}: {
  submitLabel: string
  passwordOptional: boolean
  onMake: (email: string, password: string) => Promise<void>
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (password !== confirm) {
      setError('The two passwords differ.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onMake(email.trim(), password)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <form className="form stacked" onSubmit={submit}>
      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      </label>
      {passwordOptional && (
        <p className="hint muted">
          A password is optional: leave both fields blank to sign in with mailed links. You can set one later on your Account
          page.
        </p>
      )}
      <label>
        {passwordOptional ? 'Password (optional)' : 'Password'}
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={MIN_PASSWORD}
          required={!passwordOptional}
          autoComplete="new-password"
        />
      </label>
      <label>
        {passwordOptional ? 'The same password again (optional)' : 'The same password again'}
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required={!passwordOptional}
          autoComplete="new-password"
        />
      </label>
      <p className="hint muted">At least {MIN_PASSWORD} characters.</p>
      {error && <p className="error hint">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={busy}>
          {busy ? 'Making…' : submitLabel}
        </button>
      </div>
    </form>
  )
}

function MailStage({ view, actions, onContinue }: { view: InstallView; actions: MailActions; onContinue: () => void }) {
  return (
    <>
      <Steps at={3} />
      <p>
        Scry mails sign-in links and invites. With mail, the first admin may sign in by mailed link alone. Without it, an
        invite gives a link to pass on, the sign-in page offers only passwords, and the first admin needs a password.
      </p>
      {view.mailSettings && <MailForm mail={view.mailSettings} actions={actions} />}
      <div className="form-actions">
        <button type="button" onClick={onContinue}>
          {view.mail ? 'Continue' : 'Continue without mail'}
        </button>
      </div>
    </>
  )
}

function AdminStage({ mail, onMake }: { mail: boolean; onMake: (email: string, password: string) => Promise<void> }) {
  return (
    <>
      <Steps at={4} />
      <p>The first admin invites everyone else, and changes the instance's settings.</p>
      <AdminForm submitLabel="Make the admin and sign in" passwordOptional={mail} onMake={onMake} />
    </>
  )
}

function Finish() {
  const navigate = useNavigate()

  return (
    <>
      <p className="success">Scry is set up, and you are signed in.</p>
      <p>
        A workspace holds dashboards and the sources they chart. Open Scry to make the first one, or to open those this
        database has already. The Settings page changes the addresses, mail, and database later.
      </p>
      <div className="form-actions">
        <button type="button" onClick={() => navigate('/')}>
          Open Scry
        </button>
      </div>
    </>
  )
}

/** An instance already set up: a way to change its addresses when its pages cannot reach it, and to make an admin. */
function Installed({
  view,
  code,
  onCode,
  onSaved,
  onAdmin,
}: {
  view: InstallView
  code: string | null
  onCode: (code: string) => void
  onSaved: (view: InstallView) => void
  onAdmin: (made: Me) => Promise<void>
}) {
  const [changing, setChanging] = useState(false)
  const [recovering, setRecovering] = useState(false)

  return (
    <>
      <p>
        Scry is set up. Its addresses, mail, and database are on the <Link to="/settings">Settings page</Link>, for admins.
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
          <CodeStage given={code} recovery onCode={onCode} />
        )}
      </section>
      <section>
        <h2>Locked out</h2>
        {!recovering ? (
          <>
            <p className="muted">When no admin can sign in, make one here.</p>
            <button type="button" className="secondary" onClick={() => setRecovering(true)}>
              Make an admin
            </button>
          </>
        ) : view.allowed ? (
          <>
            <p className="muted">
              This makes the address an admin, with this password when one is given, and signs it out everywhere else. A new
              address becomes a new admin.
            </p>
            <AdminForm
              submitLabel="Make the admin and sign in"
              passwordOptional={view.mail}
              onMake={async (email, password) => onAdmin(await installAdmin(code, email, password))}
            />
          </>
        ) : (
          <CodeStage given={code} recovery onCode={onCode} />
        )}
      </section>
    </>
  )
}
