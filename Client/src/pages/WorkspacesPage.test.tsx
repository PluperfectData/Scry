import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { listWorkspaces, makeWorkspace, type Me, removeWorkspace, renameWorkspace, type Workspace } from '../api'
import { SessionContext } from '../session'
import { WorkspacesContext } from '../workspace'
import { WorkspacesPage } from './WorkspacesPage'

jest.mock('react-router', () => jest.requireActual('../../jest/router').reactRouterMock())

jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  listWorkspaces: jest.fn(),
  makeWorkspace: jest.fn(),
  renameWorkspace: jest.fn(),
  removeWorkspace: jest.fn(),
}))

const admin: Me = { signedIn: true, id: 1, email: 'admin@acme.test', isAdmin: true, hasPassword: true }

const workspace = (id: number, name: string, role: Workspace['role'] = 'Editor'): Workspace => ({ id, name, role, createdAt: '2026-11-16T00:00:00Z' })

const refresh = jest.fn()

const renderAs = (me: Me) =>
  render(
    <SessionContext.Provider value={{ me, setMe: jest.fn() }}>
      <WorkspacesContext.Provider value={{ workspaces: null, error: null, refresh }}>
        <WorkspacesPage />
      </WorkspacesContext.Provider>
    </SessionContext.Provider>,
  )

const card = (name: string) => screen.getByRole('heading', { level: 2, name }).closest('li') as HTMLElement

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(listWorkspaces).mockResolvedValue([workspace(1, 'Default'), workspace(2, 'Finance')])
})

it('lists every workspace for an admin, each linked to its pages and its members', async () => {
  renderAs(admin)

  expect(await screen.findByRole('link', { name: 'Finance' })).toHaveAttribute('href', '/workspaces/2')
  expect(within(card('Finance')).getByRole('link', { name: 'Members' })).toHaveAttribute('href', '/workspaces/2/settings')
})

it('makes a workspace, and tells the header its list changed', async () => {
  jest.mocked(makeWorkspace).mockResolvedValue({ ...workspace(3, 'Budget'), members: [] })
  renderAs(admin)

  await userEvent.type(await screen.findByLabelText('New workspace'), 'Budget')
  await userEvent.click(screen.getByRole('button', { name: 'Make workspace' }))

  expect(makeWorkspace).toHaveBeenCalledWith('Budget')
  expect(await screen.findByRole('link', { name: 'Budget' })).toBeInTheDocument()
  expect(refresh).toHaveBeenCalled()
})

it('renames a workspace from its card', async () => {
  jest.mocked(renameWorkspace).mockResolvedValue({ ...workspace(2, 'Finance 2026'), members: [] })
  renderAs(admin)

  await screen.findByRole('link', { name: 'Finance' })
  await userEvent.click(within(card('Finance')).getByRole('button', { name: 'Rename' }))
  const slideout = screen.getByRole('dialog', { name: 'Rename workspace' })
  await userEvent.clear(within(slideout).getByLabelText('Name'))
  await userEvent.type(within(slideout).getByLabelText('Name'), 'Finance 2026')
  await userEvent.click(within(slideout).getByRole('button', { name: 'Save' }))

  expect(renameWorkspace).toHaveBeenCalledWith(2, 'Finance 2026')
  expect(await screen.findByRole('link', { name: 'Finance 2026' })).toBeInTheDocument()
})

it('removes a workspace only once its name is typed', async () => {
  jest.mocked(removeWorkspace).mockResolvedValue(undefined)
  renderAs(admin)
  await screen.findByRole('link', { name: 'Finance' })

  await userEvent.click(within(card('Finance')).getByRole('button', { name: 'Remove' }))
  const slideout = screen.getByRole('dialog', { name: 'Remove workspace' })
  const remove = within(slideout).getByRole('button', { name: 'Remove workspace' })
  expect(within(slideout).getByText(/deletes its dashboards, sources, push keys, and Nexus link/)).toBeInTheDocument()
  expect(remove).toBeDisabled()

  await userEvent.type(within(slideout).getByLabelText('Type Finance to remove it'), 'finance')
  expect(remove).toBeDisabled()
  await userEvent.clear(within(slideout).getByLabelText('Type Finance to remove it'))
  await userEvent.type(within(slideout).getByLabelText('Type Finance to remove it'), 'Finance')
  await userEvent.click(remove)

  expect(removeWorkspace).toHaveBeenCalledWith(2, 'Finance')
  expect(screen.queryByRole('link', { name: 'Finance' })).not.toBeInTheDocument()
  expect(refresh).toHaveBeenCalled()
})

it("shows a member their own workspaces with their role, and nothing to change", async () => {
  jest.mocked(listWorkspaces).mockResolvedValue([workspace(2, 'Finance', 'Viewer')])
  renderAs({ ...admin, isAdmin: false })

  expect(await screen.findByText('You are a viewer here.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('New workspace')).not.toBeInTheDocument()
})
