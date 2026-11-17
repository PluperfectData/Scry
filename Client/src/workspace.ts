import { createContext, useContext } from 'react'
import type { Workspace, WorkspaceDetail } from './api'

/** The workspace a page is in: what the API says of it, where its pages start, and whether the user may change it. */
export interface OpenWorkspace {
  workspace: WorkspaceDetail
  /** Where its pages start, such as `/workspaces/3`. */
  base: string
  canEdit: boolean
  /** Takes the workspace as a change left it, such as a new member. */
  update: (workspace: WorkspaceDetail) => void
}

export const WorkspaceContext = createContext<OpenWorkspace | null>(null)

export function useWorkspace(): OpenWorkspace {
  const open = useContext(WorkspaceContext)
  if (!open) throw new Error('This page belongs inside a workspace.')
  return open
}

/** The workspaces the signed-in user is in, which the header lists, and a way to read them again after a change. */
export interface Workspaces {
  workspaces: Workspace[] | null
  error: string | null
  refresh: () => void
}

export const WorkspacesContext = createContext<Workspaces>({ workspaces: null, error: null, refresh: () => {} })

export const useWorkspaces = () => useContext(WorkspacesContext)

export const workspacePath = (id: number) => `/workspaces/${id}`

const LAST = 'scry-workspace'

/** Remembers the workspace last opened in this browser, which `/` opens next time. */
export function rememberWorkspace(id: number) {
  try {
    localStorage.setItem(LAST, String(id))
  } catch {
    // Without storage, `/` opens the first workspace by name.
  }
}

export function lastWorkspace(): number | null {
  try {
    const id = Number(localStorage.getItem(LAST))
    return Number.isInteger(id) && id > 0 ? id : null
  } catch {
    return null
  }
}

/** The workspace the header offers links for: the one the page is in, or else the last opened, or else the first. */
export function currentOf(workspaces: Workspace[] | null, inPage: number | null): Workspace | null {
  if (!workspaces || workspaces.length === 0) return null
  if (inPage !== null) return workspaces.find((workspace) => workspace.id === inPage) ?? null
  const last = lastWorkspace()
  return workspaces.find((workspace) => workspace.id === last) ?? workspaces[0]
}
