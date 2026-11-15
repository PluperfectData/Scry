import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { listKeys, makeKey, revokeKey, type IngestKey } from '../api'
import { SettingsPage } from './SettingsPage'

jest.mock('react-router', () => jest.requireActual('../../jest/router').reactRouterMock())
jest.mock('../api', () => ({ ...jest.requireActual('../api'), listKeys: jest.fn(), makeKey: jest.fn(), revokeKey: jest.fn() }))

const nexus: IngestKey = { id: 1, name: 'Nexus', prefix: 'scry_abc1234', createdAt: '2026-11-15T12:00:00Z', sources: ['orders', 'trades'] }

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(listKeys).mockResolvedValue([nexus])
})

const card = (name: string) => screen.getByRole('heading', { name }).closest('li') as HTMLElement

it('lists each key by its prefix with the sources it writes', async () => {
  render(<SettingsPage />)

  await screen.findByRole('heading', { name: 'Nexus' })
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
  render(<SettingsPage />)

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
  render(<SettingsPage />)

  await userEvent.click(await screen.findByRole('button', { name: 'Revoke Nexus' }))

  expect(revokeKey).toHaveBeenCalledWith(1)
  expect(screen.queryByRole('heading', { name: 'Nexus' })).not.toBeInTheDocument()
})
