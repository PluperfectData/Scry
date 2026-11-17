import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { WorkspaceForm } from '../components/WorkspaceForm'
import { useNotices } from '../notices'
import { useSession } from '../session'
import { currentOf, useWorkspaces, workspacePath } from '../workspace'

/** Opens the workspace last opened in this browser, or the first by name. With none, an admin makes one. */
export function HomePage() {
  const { me } = useSession()
  const { workspaces, error, refresh } = useWorkspaces()
  const { notify } = useNotices()
  const navigate = useNavigate()

  // A Schwab sign-in Scry lost track of comes back here with its reason, since its workspace is unknown.
  useEffect(() => {
    const arrival = new URLSearchParams(window.location.search).get('error')
    if (arrival) notify(arrival, { tone: 'error', seconds: null, id: 'home-arrival' })
  }, [notify])

  const open = currentOf(workspaces, null)
  useEffect(() => {
    if (open) navigate(workspacePath(open.id), { replace: true })
  }, [open, navigate])

  if (error) return <p className="page error">{error}</p>
  if (workspaces === null || open) return <p className="page muted">Loading…</p>

  return (
    <div className="page">
      <h1>No workspaces yet</h1>
      {me?.isAdmin ? (
        <>
          <p>A workspace holds dashboards, sources, push keys, and a link to Nexus. Make the first one to start.</p>
          <WorkspaceForm
            onMade={(made) => {
              refresh()
              navigate(workspacePath(made.id))
            }}
          />
        </>
      ) : (
        <p className="muted">You are in no workspace yet. An admin adds you to one.</p>
      )}
    </div>
  )
}
