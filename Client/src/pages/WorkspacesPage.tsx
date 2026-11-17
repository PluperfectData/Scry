import { type FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { listWorkspaces, removeWorkspace, renameWorkspace, type Workspace } from '../api'
import { Slideout } from '../components/Slideout'
import { WorkspaceForm } from '../components/WorkspaceForm'
import { useSession } from '../session'
import { useWorkspaces, workspacePath } from '../workspace'

const byName = (a: Workspace, b: Workspace) => a.name.localeCompare(b.name)

/** Renames a workspace. */
function RenameForm({ workspace, onDone }: { workspace: Workspace; onDone: (renamed: Workspace | null) => void }) {
  const [name, setName] = useState(workspace.name)
  const [error, setError] = useState<string | null>(null)

  async function save(event: FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      onDone(await renameWorkspace(workspace.id, name.trim()))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <form className="form" onSubmit={save}>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
      </label>
      {error && <p className="error hint">{error}</p>}
      <div className="form-actions">
        <button type="submit">Save</button>
        <button type="button" className="quiet" onClick={() => onDone(null)}>
          Cancel
        </button>
      </div>
    </form>
  )
}

/** Removes a workspace once its name is typed, since nothing it holds can be brought back. */
function RemoveForm({ workspace, onDone }: { workspace: Workspace; onDone: (removed: boolean) => void }) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await removeWorkspace(workspace.id, typed)
      onDone(true)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={remove}>
      <p>
        Removing {workspace.name} deletes its dashboards, sources, push keys, and Nexus link, with its DuckDB file and
        uploads. Nexus is asked to revoke the link&apos;s key. None of it can be brought back.
      </p>
      <label>
        Type {workspace.name} to remove it
        <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" required />
      </label>
      {error && <p className="error hint">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={busy || typed.trim() !== workspace.name}>
          {busy ? 'Removing…' : 'Remove workspace'}
        </button>
        <button type="button" className="quiet" onClick={() => onDone(false)}>
          Cancel
        </button>
      </div>
    </form>
  )
}

/** Every workspace, for an admin: make one, rename one, or remove one. A member sees their own, with their role. */
export function WorkspacesPage() {
  const { me } = useSession()
  const { refresh } = useWorkspaces()
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<Workspace | null>(null)
  const [removing, setRemoving] = useState<Workspace | null>(null)

  useEffect(() => {
    listWorkspaces()
      .then(setWorkspaces)
      .catch((e: Error) => setError(e.message))
  }, [])

  function changed(list: (current: Workspace[]) => Workspace[]) {
    setWorkspaces((current) => list(current ?? []).sort(byName))
    refresh()
  }

  return (
    <div className="page">
      <h1>Workspaces</h1>
      <p className="muted">
        Each workspace has its own dashboards, sources, push keys, and link to Nexus. Its members are editors or viewers,
        set on its Settings page.
      </p>
      {error && <p className="error">{error}</p>}

      {workspaces === null ? (
        !error && <p className="muted">Loading…</p>
      ) : workspaces.length === 0 ? (
        <p className="muted">{me?.isAdmin ? 'No workspaces yet. Make the first one below.' : 'You are in no workspace yet. An admin adds you to one.'}</p>
      ) : (
        <ul className="list cards">
          {workspaces.map((workspace) => (
            <li key={workspace.id}>
              <div className="card-head">
                <h2>
                  <Link to={workspacePath(workspace.id)}>{workspace.name}</Link>
                </h2>
                {me?.isAdmin && (
                  <div className="row-actions">
                    <Link to={`${workspacePath(workspace.id)}/settings`}>Members</Link>
                    <button type="button" className="secondary" onClick={() => setRenaming(workspace)}>
                      Rename
                    </button>
                    <button type="button" className="quiet" onClick={() => setRemoving(workspace)}>
                      Remove
                    </button>
                  </div>
                )}
              </div>
              <p className="muted">
                {me?.isAdmin
                  ? `Made ${new Date(workspace.createdAt).toLocaleDateString()}`
                  : workspace.role === 'Editor'
                    ? 'You are an editor here.'
                    : 'You are a viewer here.'}
              </p>
            </li>
          ))}
        </ul>
      )}

      {me?.isAdmin && <WorkspaceForm onMade={(made) => changed((list) => [...list, made])} />}

      <Slideout open={renaming !== null} title="Rename workspace" onClose={() => setRenaming(null)}>
        {renaming && (
          <RenameForm
            key={renaming.id}
            workspace={renaming}
            onDone={(renamed) => {
              if (renamed) changed((list) => list.map((w) => (w.id === renamed.id ? { ...w, name: renamed.name } : w)))
              setRenaming(null)
            }}
          />
        )}
      </Slideout>

      <Slideout open={removing !== null} title="Remove workspace" onClose={() => setRemoving(null)}>
        {removing && (
          <RemoveForm
            key={removing.id}
            workspace={removing}
            onDone={(removed) => {
              if (removed) changed((list) => list.filter((w) => w.id !== removing.id))
              setRemoving(null)
            }}
          />
        )}
      </Slideout>
    </div>
  )
}
