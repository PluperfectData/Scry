// The workspace a page under test is in: Default, as an editor, unless the test opens it as a viewer.
import type { WorkspaceDetail, WorkspaceRole } from '../src/api'
import type { OpenWorkspace } from '../src/workspace'

export const workspaceDetail = (role: WorkspaceRole = 'Editor'): WorkspaceDetail => ({
  id: 1,
  name: 'Default',
  role,
  createdAt: '2026-11-16T00:00:00Z',
  members: null,
})

export const opened = (role: WorkspaceRole = 'Editor'): OpenWorkspace => ({
  workspace: workspaceDetail(role),
  base: '/workspaces/1',
  canEdit: role === 'Editor',
  update: jest.fn(),
})

export const openWorkspace: { current: OpenWorkspace } = { current: opened() }

export const workspaceMock = () => ({
  ...jest.requireActual('../src/workspace'),
  useWorkspace: () => openWorkspace.current,
})
