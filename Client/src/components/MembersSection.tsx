import { type FormEvent, useEffect, useState } from 'react'
import { listUsers, removeMember, setMember, type User, type WorkspaceDetail, type WorkspaceRole } from '../api'
import { useWorkspace } from '../workspace'

/** The open workspace's members, for admins: add a user as an editor or a viewer, change a role, or take one out. */
export function MembersSection() {
  const { workspace, update } = useWorkspace()
  const [users, setUsers] = useState<User[]>([])
  const [picked, setPicked] = useState('')
  const [role, setRole] = useState<WorkspaceRole>('Viewer')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listUsers()
      .then(setUsers)
      .catch((e: Error) => setError(e.message))
  }, [])

  const members = workspace.members ?? []
  // Admins edit every workspace already, so only members are added.
  const outside = users.filter((user) => !user.isAdmin && !members.some((member) => member.userId === user.id))

  async function act(action: () => Promise<WorkspaceDetail>) {
    setError(null)
    try {
      update(await action())
      setPicked('')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function add(event: FormEvent) {
    event.preventDefault()
    void act(() => setMember(workspace.id, Number(picked), role))
  }

  return (
    <section>
      <h2>Members</h2>
      <p className="muted">
        Editors change this workspace&apos;s dashboards, sources, push keys, and Nexus link. Viewers open its dashboards and
        change nothing. Admins are editors in every workspace.
      </p>
      {error && <p className="error">{error}</p>}
      {members.length === 0 ? (
        <p className="muted">No members yet.</p>
      ) : (
        <ul className="list">
          {members.map((member) => (
            <li key={member.userId}>
              <span>{member.email}</span>
              <div className="row-actions">
                <select
                  aria-label={`Role for ${member.email}`}
                  value={member.role}
                  onChange={(e) => act(() => setMember(workspace.id, member.userId, e.target.value as WorkspaceRole))}
                >
                  <option value="Editor">Editor</option>
                  <option value="Viewer">Viewer</option>
                </select>
                <button type="button" className="quiet" onClick={() => act(() => removeMember(workspace.id, member.userId))}>
                  Take out
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {outside.length > 0 && (
        <form className="form inline" onSubmit={add}>
          <label>
            Add a member
            <select value={picked} onChange={(e) => setPicked(e.target.value)} required>
              <option value="">Pick a user</option>
              {outside.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.email}
                </option>
              ))}
            </select>
          </label>
          <label>
            As
            <select value={role} onChange={(e) => setRole(e.target.value as WorkspaceRole)}>
              <option value="Viewer">Viewer</option>
              <option value="Editor">Editor</option>
            </select>
          </label>
          <button type="submit">Add member</button>
        </form>
      )}
    </section>
  )
}
