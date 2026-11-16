import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { askForInstallCode, getInstall, installAddresses, installDatabase, type InstallView } from '../api'
import { InstallPage } from './InstallPage'

jest.mock('react-router', () => jest.requireActual('../../jest/router').reactRouterMock())
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  getInstall: jest.fn(),
  installDatabase: jest.fn(),
  installAddresses: jest.fn(),
  askForInstallCode: jest.fn(),
}))
const { navigate } = jest.requireActual('../../jest/router')

const view = (overrides: Partial<InstallView>): InstallView => ({
  installed: false,
  stage: 'Database',
  local: true,
  allowed: true,
  databaseConfigured: false,
  database: null,
  databaseProblem: null,
  clientOrigin: null,
  clientOriginConfigured: false,
  apiOrigin: null,
  apiOriginConfigured: false,
  ...overrides,
})

beforeEach(() => {
  jest.clearAllMocks()
  window.history.replaceState(null, '', '/install')
})

it('takes the database, then the addresses, then sends the visitor to add a source', async () => {
  jest.mocked(getInstall).mockResolvedValue(view({}))
  jest.mocked(installDatabase).mockResolvedValue(view({ stage: 'Address' }))
  jest.mocked(installAddresses).mockResolvedValue(view({ stage: 'Done', installed: true }))
  render(<InstallPage />)

  await screen.findByText('Step 1 of 2: Database')
  await userEvent.type(screen.getByLabelText('Password'), 'secret')
  await userEvent.click(screen.getByRole('button', { name: 'Test and save' }))
  await screen.findByText('Step 2 of 2: Addresses')
  expect(screen.getByLabelText('Client address')).toHaveValue('http://localhost')
  expect(screen.getByLabelText('API address')).toHaveValue('http://localhost:6161')
  await userEvent.click(screen.getByRole('button', { name: 'Save addresses' }))
  await screen.findByText('Scry is set up.')
  await userEvent.click(screen.getByRole('button', { name: 'Add a source' }))

  expect(installDatabase).toHaveBeenCalledWith(null, { host: 'localhost', port: 3306, name: 'scry', user: 'scry', password: 'secret' })
  expect(installAddresses).toHaveBeenCalledWith(null, { clientOrigin: 'http://localhost', apiOrigin: 'http://localhost:6161' })
  expect(navigate).toHaveBeenCalledWith('/sources')
})

it('shows why the database did not open, and keeps the form', async () => {
  jest.mocked(getInstall).mockResolvedValue(view({}))
  jest.mocked(installDatabase).mockRejectedValue(new Error("Access denied for user 'scry'@'localhost'"))
  render(<InstallPage />)

  await userEvent.click(await screen.findByRole('button', { name: 'Test and save' }))

  expect(await screen.findByText("Access denied for user 'scry'@'localhost'")).toBeInTheDocument()
  expect(screen.getByLabelText('Host')).toHaveValue('localhost')
})

it('asks a page on another machine for the code, and sends it with every step', async () => {
  jest.mocked(getInstall).mockImplementation(async (code) => (code === 'ABCD-EFGH-JKMN' ? view({ local: false }) : view({ local: false, allowed: false })))
  jest.mocked(askForInstallCode).mockResolvedValue(undefined)
  render(<InstallPage />)

  await userEvent.click(await screen.findByRole('button', { name: 'Write the code to the log again' }))
  expect(await screen.findByText('Scry wrote the code to its log.')).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Install code'), 'ABCD-EFGH-JKMN')
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

  expect(await screen.findByText('Step 1 of 2: Database')).toBeInTheDocument()
  expect(getInstall).toHaveBeenLastCalledWith('ABCD-EFGH-JKMN')
})

it('reads the code from the link Scry logs, then takes it out of the address bar', async () => {
  window.history.replaceState(null, '', '/install#WXYZ-2345-6789')
  jest.mocked(getInstall).mockResolvedValue(view({ local: false }))
  render(<InstallPage />)

  await screen.findByText('Step 1 of 2: Database')

  expect(getInstall).toHaveBeenCalledWith('WXYZ-2345-6789')
  expect(window.location.hash).toBe('')
})

it('says when the configuration sets a database Scry cannot open', async () => {
  jest.mocked(getInstall).mockResolvedValue(view({ databaseConfigured: true, databaseProblem: 'Unknown database' }))
  render(<InstallPage />)

  expect(await screen.findByText(/in ConnectionStrings:Scry, and Scry cannot open it: Unknown database/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Test and save' })).not.toBeInTheDocument()
})

it('shows an address set by configuration and leaves it out of the step', async () => {
  jest.mocked(getInstall).mockResolvedValue(view({ stage: 'Address', clientOrigin: 'https://scry.example.test', clientOriginConfigured: true }))
  jest.mocked(installAddresses).mockResolvedValue(view({ stage: 'Done', installed: true }))
  render(<InstallPage />)

  const client = await screen.findByLabelText('Client address')
  expect(client).toBeDisabled()
  expect(client).toHaveValue('https://scry.example.test')
  await userEvent.click(screen.getByRole('button', { name: 'Save addresses' }))

  expect(installAddresses).toHaveBeenCalledWith(null, { clientOrigin: '', apiOrigin: 'http://localhost:6161' })
})

it('changes the addresses of an instance already set up, with the code from the log', async () => {
  const installed = { installed: true, stage: 'Done' as const, local: false }
  jest.mocked(getInstall).mockImplementation(async (code) =>
    code ? view({ ...installed, clientOrigin: 'https://scry.example.test', apiOrigin: 'https://api.scry.example.test' }) : view({ ...installed, allowed: false }),
  )
  jest.mocked(installAddresses).mockResolvedValue(view(installed))
  jest.spyOn(window, 'confirm').mockReturnValue(true)
  render(<InstallPage />)

  await userEvent.click(await screen.findByRole('button', { name: 'Change the addresses' }))
  await userEvent.type(screen.getByLabelText('Install code'), 'ABCD-EFGH-JKMN')
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Save addresses' }))

  expect(window.confirm).toHaveBeenCalledWith('Pages at http://localhost stop reaching Scry once its client is https://scry.example.test. Save anyway?')
  expect(installAddresses).toHaveBeenCalledWith('ABCD-EFGH-JKMN', {
    clientOrigin: 'https://scry.example.test',
    apiOrigin: 'https://api.scry.example.test',
  })
  expect(await screen.findByText('Saved.')).toBeInTheDocument()
})
