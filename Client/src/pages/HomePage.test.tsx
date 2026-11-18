import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeWorkspace, type Me, type Workspace } from '../api'
import { SessionContext } from '../session'
import { WorkspacesContext } from '../workspace'
import { HomePage } from './HomePage'

jest.mock('react-router', () => jest.requireActual('../../jest/router').reactRouterMock())
const { navigate } = jest.requireActual('../../jest/router')

jest.mock('../api', () => ({ ...jest.requireActual('../api'), makeWorkspace: jest.fn() }))

const member: Me = { signedIn: true, id: 2, email: 'rowan@acme.test', isAdmin: false, hasPassword: true }

const workspace = (id: number, name: string): Workspace => ({ id, name, role: 'Editor', createdAt: '2026-11-16T00:00:00Z' })

const refresh = jest.fn()

const renderWith = (me: Me, workspaces: Workspace[] | null) =>
  render(
    <SessionContext.Provider value={{ me, setMe: jest.fn() }}>
      <WorkspacesContext.Provider value={{ workspaces, error: null, refresh }}>
        <HomePage />
      </WorkspacesContext.Provider>
    </SessionContext.Provider>,
  )

beforeEach(() => {
  jest.clearAllMocks()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
})

it('opens the workspace last opened in this browser', () => {
  localStorage.setItem('scry-workspace', '2')
  renderWith(member, [workspace(1, 'Default'), workspace(2, 'Finance')])

  expect(navigate).toHaveBeenCalledWith('/workspaces/2', { replace: true })
})

it('opens the first workspace by name when the last one opened is gone', () => {
  localStorage.setItem('scry-workspace', '9')
  renderWith(member, [workspace(1, 'Default'), workspace(2, 'Finance')])

  expect(navigate).toHaveBeenCalledWith('/workspaces/1', { replace: true })
})

it('offers an admin with no workspace to make the first one, then opens it', async () => {
  jest.mocked(makeWorkspace).mockResolvedValue({ ...workspace(4, 'Finance'), members: [] })
  renderWith({ ...member, isAdmin: true }, [])

  await userEvent.type(screen.getByLabelText('New workspace'), 'Finance')
  await userEvent.click(screen.getByRole('button', { name: 'Make workspace' }))

  expect(makeWorkspace).toHaveBeenCalledWith('Finance')
  expect(refresh).toHaveBeenCalled()
  expect(navigate).toHaveBeenCalledWith('/workspaces/4')
})

it('tells a member in no workspace that an admin adds them', () => {
  renderWith(member, [])

  expect(screen.getByText('You are in no workspace yet. An admin adds you to one.')).toBeInTheDocument()
  expect(screen.queryByLabelText('New workspace')).not.toBeInTheDocument()
})
