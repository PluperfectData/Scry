import { render, screen, waitFor } from '@testing-library/react'
import { ApiError, enterWorkspace, getWorkspace } from '../api'
import { WorkspaceContext } from '../workspace'
import { RequireEditor, WorkspaceLayout } from './WorkspaceLayout'

jest.mock('react-router', () => jest.requireActual('../../jest/router').reactRouterMock())
const { routerState } = jest.requireActual('../../jest/router')

jest.mock('../api', () => ({ ...jest.requireActual('../api'), enterWorkspace: jest.fn(), getWorkspace: jest.fn() }))

const { opened, workspaceDetail } = jest.requireActual('../../jest/workspace')

beforeEach(() => {
  jest.clearAllMocks()
  localStorage.clear()
  routerState.params = { workspaceId: '1' }
})

it('opens the workspace the address names, and remembers it for next time', async () => {
  jest.mocked(getWorkspace).mockResolvedValue(workspaceDetail())
  render(<WorkspaceLayout />)

  expect(screen.getByText('Loading…')).toBeInTheDocument()
  expect(enterWorkspace).toHaveBeenCalledWith(1)
  expect(getWorkspace).toHaveBeenCalledWith(1)
  await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())
  expect(localStorage.getItem('scry-workspace')).toBe('1')
})

it('says so when the workspace is not one the user is in', async () => {
  jest.mocked(getWorkspace).mockRejectedValue(new ApiError(404, 'There is no such workspace, or you are not in it.'))
  render(<WorkspaceLayout />)

  expect(await screen.findByText('There is no such workspace, or you are not in it.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Open your workspaces' })).toHaveAttribute('href', '/')
  expect(localStorage.getItem('scry-workspace')).toBeNull()
})

it("tells a viewer who changes the workspace, in place of its sources and settings", () => {
  render(
    <WorkspaceContext.Provider value={opened('Viewer')}>
      <RequireEditor />
    </WorkspaceContext.Provider>,
  )

  expect(screen.getByText(/You are a viewer in Default/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Open its dashboards' })).toHaveAttribute('href', '/workspaces/1/dashboards')
})

it('lets an editor through to the page', () => {
  render(
    <WorkspaceContext.Provider value={opened('Editor')}>
      <RequireEditor />
    </WorkspaceContext.Provider>,
  )

  expect(screen.queryByText(/You are a viewer/)).not.toBeInTheDocument()
})
