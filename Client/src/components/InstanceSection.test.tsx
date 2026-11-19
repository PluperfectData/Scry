import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getInstanceSettings, type InstanceSettings, saveAddresses, saveDatabase, saveLogDays } from '../api'
import { InstanceSection } from './InstanceSection'

jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  getInstanceSettings: jest.fn(),
  saveAddresses: jest.fn(),
  saveDatabase: jest.fn(),
  saveLogDays: jest.fn(),
}))

const settings: InstanceSettings = {
  clientOrigin: 'http://localhost',
  clientOriginConfigured: false,
  apiOrigin: 'http://localhost:6161',
  apiOriginConfigured: false,
  mail: {
    transport: 'None',
    choice: null,
    transportConfigured: false,
    tokenSet: false,
    tokenConfigured: false,
    from: null,
    fromConfigured: false,
    fromName: 'Scry',
    fromNameConfigured: false,
    mailpitUrl: null,
    mailpitConfigured: false,
    mailpitInbox: null,
  },
  database: { host: 'localhost', port: 3306, name: 'scry', user: 'scry' },
  databaseConfigured: false,
  logDays: 30,
  logDaysConfigured: false,
}

const section = (name: string) => screen.getByRole('heading', { level: 2, name }).closest('section') as HTMLElement

beforeEach(() => {
  jest.clearAllMocks()
  jest.restoreAllMocks()
  jest.mocked(getInstanceSettings).mockResolvedValue(settings)
})

it('saves the addresses', async () => {
  jest.mocked(saveAddresses).mockResolvedValue({ ...settings, apiOrigin: 'https://api.scry.example.test' })
  render(<InstanceSection />)

  const api = await screen.findByLabelText('API address')
  await userEvent.clear(api)
  await userEvent.type(api, 'https://api.scry.example.test')
  await userEvent.click(screen.getByRole('button', { name: 'Save addresses' }))

  expect(saveAddresses).toHaveBeenCalledWith({ clientOrigin: 'http://localhost', apiOrigin: 'https://api.scry.example.test' })
  expect(await within(section('Addresses')).findByText('Saved.')).toBeInTheDocument()
})

it('asks before moving to another database, and keeps the password when it is left blank', async () => {
  const confirm = jest.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
  jest.mocked(saveDatabase).mockResolvedValue({ ...settings, database: { host: 'db.example.test', port: 3306, name: 'scry', user: 'scry' } })
  render(<InstanceSection />)

  const host = await screen.findByLabelText('Host')
  expect(within(section('Database')).getByText(/Leave the password blank to keep the stored one/)).toBeInTheDocument()
  await userEvent.clear(host)
  await userEvent.type(host, 'db.example.test')
  await userEvent.click(screen.getByRole('button', { name: 'Test and switch' }))
  expect(saveDatabase).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Test and switch' }))

  expect(confirm).toHaveBeenCalledWith(
    'Move Scry to the database scry on db.example.test? Its dashboards, sources, and keys come from there from now on.',
  )
  expect(saveDatabase).toHaveBeenCalledWith({ host: 'db.example.test', port: 3306, name: 'scry', user: 'scry', password: '' })
  expect(await screen.findByText('Scry uses this database now.')).toBeInTheDocument()
})

it('shows what the configuration sets, and offers no way to change it', async () => {
  jest.mocked(getInstanceSettings).mockResolvedValue({ ...settings, databaseConfigured: true, apiOriginConfigured: true })
  render(<InstanceSection />)

  expect(await screen.findByLabelText('API address')).toBeDisabled()
  expect(screen.getByText(/ConnectionStrings:Scry in Scry's configuration sets the database/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Test and switch' })).not.toBeInTheDocument()
})

it('changes how many days the Log page keeps an entry', async () => {
  jest.mocked(saveLogDays).mockResolvedValue({ ...settings, logDays: 14 })
  render(<InstanceSection />)
  const log = await screen.findByRole('heading', { level: 2, name: 'Log' }).then(() => section('Log'))

  await userEvent.clear(within(log).getByLabelText('Keep entries for this many days'))
  await userEvent.type(within(log).getByLabelText('Keep entries for this many days'), '14')
  await userEvent.click(within(log).getByRole('button', { name: 'Save' }))

  expect(saveLogDays).toHaveBeenCalledWith(14)
  expect(await within(log).findByText('Saved.')).toBeInTheDocument()
})

it('shows the days kept as set by configuration, with nothing to change', async () => {
  jest.mocked(getInstanceSettings).mockResolvedValue({ ...settings, logDays: 7, logDaysConfigured: true })
  render(<InstanceSection />)

  expect(await screen.findByText("Scry's configuration keeps log entries for 7 days, in Scry:LogDays.")).toBeInTheDocument()
  expect(screen.queryByLabelText('Keep entries for this many days')).not.toBeInTheDocument()
})
