import { useEffect, useState } from 'react'
import { Link, Outlet, useParams } from 'react-router'
import { enterWorkspace, getWorkspace, type WorkspaceDetail } from '../api'
import { rememberWorkspace, useWorkspace, useWorkspaces, WorkspaceContext, workspacePath } from '../workspace'

/** Opens the workspace the address names. The pages inside it call the API in that workspace. */
export function WorkspaceLayout() {
  const id = Number(useParams().workspaceId)
  const { refresh } = useWorkspaces()
  const [opened, setOpened] = useState<{ id: number; workspace: WorkspaceDetail } | null>(null)
  const [failed, setFailed] = useState<{ id: number; message: string } | null>(null)

  useEffect(() => {
    let current = true
    enterWorkspace(id)
    getWorkspace(id)
      .then((workspace) => {
        if (!current) return
        rememberWorkspace(id)
        setOpened({ id, workspace })
      })
      .catch((e: Error) => current && setFailed({ id, message: e.message }))
    return () => {
      current = false
    }
  }, [id])

  if (failed?.id === id) {
    return (
      <div className="page">
        <p className="error">{failed.message}</p>
        <p>
          <Link to="/">Open your workspaces</Link>
        </p>
      </div>
    )
  }

  // Until the workspace named is open, nothing inside it renders, so no page calls the API in the last one.
  if (opened?.id !== id) return <p className="page muted">Loading…</p>

  const value = {
    workspace: opened.workspace,
    base: workspacePath(id),
    canEdit: opened.workspace.role === 'Editor',
    update: (workspace: WorkspaceDetail) => {
      setOpened({ id, workspace })
      refresh()
    },
  }

  return (
    <WorkspaceContext.Provider value={value}>
      <Outlet />
    </WorkspaceContext.Provider>
  )
}

/** The pages that change a workspace: a viewer is told who can, in their place. */
export function RequireEditor() {
  const { workspace, canEdit, base } = useWorkspace()
  if (canEdit) return <Outlet />
  return (
    <div className="page">
      <p>
        You are a viewer in {workspace.name}, so you open its dashboards and change nothing. Its editors and Scry&apos;s
        admins manage its sources and settings.
      </p>
      <p>
        <Link to={`${base}/dashboards`}>Open its dashboards</Link>
      </p>
    </div>
  )
}
