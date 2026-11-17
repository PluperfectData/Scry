import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getLog, type LogEntries, type LogEntry, type Me, type Workspace } from '../api'
import { SessionContext } from '../session'
import { WorkspacesContext } from '../workspace'
import { LogPage } from './LogPage'

jest.mock('react-router', () => jest.requireActual('../../jest/router').reactRouterMock())
const { routerState, setSearchParams } = jest.requireActual('../../jest/router')

jest.mock('../api', () => ({ ...jest.requireActual('../api'), getLog: jest.fn() }))

const admin: Me = { signedIn: true, id: 1, email: 'admin@acme.test', isAdmin: true, hasPassword: true }
const editor: Me = { ...admin, id: 2, email: 'rowan@acme.test', isAdmin: false }

const committed: LogEntry = {
  id: 12,
  at: '2026-11-16T15:00:00Z',
  level: 'Information',
  text: 'A commit to source orders left it holding 1,204 rows.',
  actor: 'key Nexus at nexus.test',
  workspaceId: 1,
  workspaceName: 'Default',
  sourceId: 7,
}

const refused: LogEntry = {
  ...committed,
  id: 11,
  level: 'Warning',
  text: 'Push key Script was refused writing to source orders, which another key made.',
  actor: 'key Script',
}

const invited: LogEntry = {
  ...committed,
  id: 10,
  text: 'bob@acme.test was invited.',
  actor: 'admin@acme.test',
  workspaceId: null,
  workspaceName: null,
  sourceId: null,
}

const workspaces: Workspace[] = [
  { id: 1, name: 'Default', role: 'Editor', createdAt: '2026-11-16T00:00:00Z' },
  { id: 2, name: 'Finance', role: 'Viewer', createdAt: '2026-11-16T00:00:00Z' },
]

const page = (entries: LogEntry[], next: number | null = null, subject: string | null = null): LogEntries => ({ entries, next, subject })

const renderAs = (me: Me) =>
  render(
    <SessionContext.Provider value={{ me, setMe: jest.fn() }}>
      <WorkspacesContext.Provider value={{ workspaces, error: null, refresh: jest.fn() }}>
        <LogPage />
      </WorkspacesContext.Provider>
    </SessionContext.Provider>,
  )

beforeEach(() => {
  jest.clearAllMocks()
  routerState.search = new URLSearchParams()
  jest.mocked(getLog).mockResolvedValue(page([committed, refused, invited]))
})

it('lists what happened, newest first, with each level in words, its workspace, and who did it', async () => {
  renderAs(admin)

  const entries = within(await screen.findByRole('list')).getAllByRole('listitem')
  expect(entries).toHaveLength(3)
  expect(within(entries[0]).getByText(committed.text)).toBeInTheDocument()
  expect(within(entries[0]).getByText('Info')).toBeInTheDocument()
  expect(within(entries[0]).getByRole('link', { name: 'Default' })).toHaveAttribute('href', '/workspaces/1')
  expect(within(entries[0]).getByText('by key Nexus at nexus.test')).toBeInTheDocument()
  expect(within(entries[1]).getByText('Warning')).toBeInTheDocument()
  expect(within(entries[2]).getByText('The instance')).toBeInTheDocument()
  expect(getLog).toHaveBeenCalledWith({})
})

it('filters by workspace and by level through the address', async () => {
  renderAs(admin)
  await screen.findByText(committed.text)

  await userEvent.selectOptions(screen.getByLabelText('Show'), 'Warnings and errors')
  expect(String(setSearchParams.mock.lastCall[0])).toBe('level=Warning')

  await userEvent.selectOptions(screen.getByLabelText('Workspace'), 'Default')
  expect(String(setSearchParams.mock.lastCall[0])).toBe('workspace=1')
})

it('reads the filter from the address it was opened at', async () => {
  routerState.search = new URLSearchParams('workspace=instance&level=Warning')
  renderAs(admin)
  await screen.findByText(committed.text)

  expect(getLog).toHaveBeenCalledWith({ instance: true, level: 'Warning' })
})

it('names the source it shows, and goes back to every entry', async () => {
  routerState.search = new URLSearchParams('source=7')
  jest.mocked(getLog).mockResolvedValue(page([committed], null, 'Source orders'))
  renderAs(editor)

  expect(await screen.findByText(/Showing Source orders only/)).toBeInTheDocument()
  expect(getLog).toHaveBeenCalledWith({ source: 7 })

  await userEvent.click(screen.getByRole('button', { name: 'Show every entry' }))
  expect(String(setSearchParams.mock.lastCall[0])).toBe('')
})

it('shows older entries below the ones it has', async () => {
  jest.mocked(getLog).mockResolvedValueOnce(page([committed], 12)).mockResolvedValueOnce(page([invited]))
  renderAs(admin)
  await screen.findByText(committed.text)

  await userEvent.click(screen.getByRole('button', { name: 'Show older' }))

  expect(getLog).toHaveBeenLastCalledWith({ before: 12 })
  expect(await screen.findByText(invited.text)).toBeInTheDocument()
  expect(screen.getByText(committed.text)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Show older' })).not.toBeInTheDocument()
})

it("offers an editor the workspaces they edit, and not the ones they view or the instance's entries", async () => {
  renderAs(editor)
  await screen.findByText(committed.text)

  const options = within(screen.getByLabelText('Workspace')).getAllByRole('option').map((option) => option.textContent)
  expect(options).toEqual(['All the workspaces I edit', 'Default'])
  expect(screen.getByText('What happened in the workspaces you edit, newest first.')).toBeInTheDocument()
})
