import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { listKeys, makeKey, revokeKey, type IngestKey, type Me } from '../api'
import { SessionContext } from '../session'
import { WorkspaceSettingsPage } from './WorkspaceSettingsPage'

jest.mock('react-router', () => jest.requireActual('../../jest/router').reactRouterMock())
jest.mock('../workspace', () => jest.requireActual('../../jest/workspace').workspaceMock())
jest.mock('../components/MembersSection', () => ({
  MembersSection: () => jest.requireActual('react').createElement('h2', null, 'Members'),
}))
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  listKeys: jest.fn(),
  makeKey: jest.fn(),
  revokeKey: jest.fn(),
  getNexusLink: jest.fn().mockResolvedValue({ linked: false, nexusUrl: null, appName: null, workspaceName: null, pushKeyName: null, pushKeyPrefix: null, linkedAt: null }),
}))

const member: Me = { signedIn: true, id: 2, email: 'rowan@acme.test', isAdmin: false, hasPassword: true }

const admin: Me = { ...member, id: 1, email: 'admin@acme.test', isAdmin: true }

function As({ me, children }: { me: Me; children: ReactNode }) {
  return <SessionContext.Provider value={{ me, setMe: jest.fn() }}>{children}</SessionContext.Provider>
}

const nexus: IngestKey = { id: 1, name: 'Nexus', prefix: 'scry_abc1234', createdAt: '2026-11-15T12:00:00Z', sources: ['orders', 'trades'] }

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(listKeys).mockResolvedValue([nexus])
})

const card = (name: string) => screen.getByRole('heading', { level: 3, name }).closest('li') as HTMLElement

it('lists each key by its prefix with the sources it writes', async () => {
  render(<As me={member}><WorkspaceSettingsPage /></As>)

  await screen.findByRole('heading', { level: 3, name: 'Nexus' })
  expect(within(card('Nexus')).getByText('scry_abc1234…')).toBeInTheDocument()
  expect(within(card('Nexus')).getByText('Writes orders, trades')).toBeInTheDocument()
})

it('makes a key and shows it once, then lists it', async () => {
  jest.mocked(makeKey).mockResolvedValue({
    id: 2,
    name: 'Script',
    prefix: 'scry_xyz9876',
    createdAt: '2026-11-15T13:00:00Z',
    key: 'scry_xyz9876-the-whole-key',
  })
  render(<As me={member}><WorkspaceSettingsPage /></As>)

  await userEvent.click(await screen.findByRole('button', { name: 'Make key' }))
  const slideout = screen.getByRole('dialog', { name: 'Make a key' })
  await userEvent.type(within(slideout).getByLabelText('Name'), 'Script')
  await userEvent.click(within(slideout).getByRole('button', { name: 'Make key' }))

  expect(makeKey).toHaveBeenCalledWith('Script')
  expect(within(slideout).getByLabelText('Your key')).toHaveValue('scry_xyz9876-the-whole-key')
  expect(within(slideout).getByText(/Scry shows this key only once/)).toBeInTheDocument()
  expect(within(card('Script')).getByText('Writes no sources yet')).toBeInTheDocument()

  await userEvent.click(within(slideout).getByRole('button', { name: 'Done' }))
  expect(screen.queryByDisplayValue('scry_xyz9876-the-whole-key')).not.toBeInTheDocument()
})

it('revokes a key from its ×', async () => {
  jest.mocked(revokeKey).mockResolvedValue(undefined)
  render(<As me={member}><WorkspaceSettingsPage /></As>)

  await userEvent.click(await screen.findByRole('button', { name: 'Revoke Nexus' }))

  expect(revokeKey).toHaveBeenCalledWith(1)
  expect(screen.queryByRole('heading', { level: 3, name: 'Nexus' })).not.toBeInTheDocument()
})

it("names the workspace, and shows an admin its members and the way to Scry's own settings", async () => {
  render(<As me={admin}><WorkspaceSettingsPage /></As>)

  expect(screen.getByRole('heading', { level: 1, name: 'Workspace settings' })).toBeInTheDocument()
  expect(screen.getByText(/For the Default workspace/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Settings page' })).toHaveAttribute('href', '/settings')
  expect(screen.getByRole('heading', { level: 2, name: 'Members' })).toBeInTheDocument()
  await screen.findByRole('heading', { level: 3, name: 'Nexus' })
})

it('shows an editor who is not an admin no members, and no way to Scry\'s own settings', async () => {
  render(<As me={member}><WorkspaceSettingsPage /></As>)

  await screen.findByRole('heading', { level: 3, name: 'Nexus' })
  expect(screen.queryByRole('heading', { level: 2, name: 'Members' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Settings page' })).not.toBeInTheDocument()
})
