import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  askForInstallCode,
  getInstall,
  installAddresses,
  installAdmin,
  installDatabase,
  installMail,
  installMailOff,
  installTestMail,
  type InstallView,
  type MailSettings,
  type Me,
} from '../api'
import { SessionContext } from '../session'
import { InstallPage } from './InstallPage'

jest.mock('react-router', () => jest.requireActual('../../jest/router').reactRouterMock())
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  getInstall: jest.fn(),
  installDatabase: jest.fn(),
  installAddresses: jest.fn(),
  installAdmin: jest.fn(),
  installMail: jest.fn(),
  installMailOff: jest.fn(),
  installTestMail: jest.fn(),
  askForInstallCode: jest.fn(),
}))
const { navigate } = jest.requireActual('../../jest/router')

const founder: Me = { signedIn: true, id: 1, email: 'founder@acme.test', isAdmin: true, hasPassword: true }

const mailOff: MailSettings = {
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
}

// Development's mail: to Mailpit, as configuration says.
const mailToMailpit: MailSettings = {
  ...mailOff,
  transport: 'Mailpit',
  mailpitUrl: 'http://localhost:8025',
  mailpitConfigured: true,
  mailpitInbox: 'http://localhost:8025',
}

const setMe = jest.fn()

const renderPage = () =>
  render(
    <SessionContext.Provider value={{ me: null, setMe }}>
      <InstallPage />
    </SessionContext.Provider>,
  )

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
  mail: false,
  mailSettings: null,
  ...overrides,
})

beforeEach(() => {
  jest.clearAllMocks()
  window.history.replaceState(null, '', '/install')
})

it('takes the database, the addresses, mail, then the first admin, signs them in, and opens Scry', async () => {
  jest.mocked(getInstall).mockResolvedValueOnce(view({}))
  jest.mocked(installDatabase).mockResolvedValue(view({ stage: 'Address' }))
  jest.mocked(installAddresses).mockResolvedValue(view({ stage: 'Admin', mailSettings: mailOff }))
  jest.mocked(installAdmin).mockResolvedValue(founder)
  renderPage()

  await screen.findByText('Step 1 of 4: Database')
  await userEvent.type(screen.getByLabelText('Password'), 'secret')
  await userEvent.click(screen.getByRole('button', { name: 'Test and save' }))
  await screen.findByText('Step 2 of 4: Addresses')
  expect(screen.getByLabelText('Client address')).toHaveValue('http://localhost')
  expect(screen.getByLabelText('API address')).toHaveValue('http://localhost:6161')
  await userEvent.click(screen.getByRole('button', { name: 'Save addresses' }))
  await screen.findByText('Step 3 of 4: Mail')
  expect(screen.getByLabelText('Postmark server token')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Continue without mail' }))
  await screen.findByText('Step 4 of 4: First admin')
  expect(screen.getByLabelText('Password')).toBeRequired()
  await userEvent.type(screen.getByLabelText('Email'), 'founder@acme.test')
  await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery')
  await userEvent.type(screen.getByLabelText('The same password again'), 'correct horse battery')
  await userEvent.click(screen.getByRole('button', { name: 'Make the admin and sign in' }))
  expect(await screen.findByText('Scry is set up, and you are signed in.')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Open Scry' }))

  expect(installDatabase).toHaveBeenCalledWith(null, { host: 'localhost', port: 3306, name: 'scry', user: 'scry', password: 'secret' })
  expect(installAddresses).toHaveBeenCalledWith(null, { clientOrigin: 'http://localhost', apiOrigin: 'http://localhost:6161' })
  expect(installAdmin).toHaveBeenCalledWith(null, 'founder@acme.test', 'correct horse battery')
  expect(setMe).toHaveBeenCalledWith(founder)
  expect(navigate).toHaveBeenCalledWith('/')
})

it('makes the first admin with no password once mail works, to sign in by mailed links', async () => {
  jest.mocked(getInstall).mockResolvedValue(view({ stage: 'Admin', mail: true, mailSettings: mailToMailpit }))
  jest.mocked(installAdmin).mockResolvedValue({ ...founder, hasPassword: false })
  renderPage()

  expect(await screen.findByText(/Mail goes to Mailpit, which delivers nothing/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'http://localhost:8025' })).toHaveAttribute('href', 'http://localhost:8025')
  expect(screen.getByLabelText("Mailpit's address")).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(screen.getByLabelText('Password (optional)')).not.toBeRequired()
  expect(screen.getByLabelText('The same password again (optional)')).not.toBeRequired()
  expect(screen.getByText(/leave both fields blank to sign in with mailed links/)).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Email'), 'founder@acme.test')
  await userEvent.click(screen.getByRole('button', { name: 'Make the admin and sign in' }))

  expect(installAdmin).toHaveBeenCalledWith(null, 'founder@acme.test', '')
  expect(await screen.findByText('Scry is set up, and you are signed in.')).toBeInTheDocument()
})

it('turns mail off, then chooses Mailpit again with nothing to retype', async () => {
  const postmark: MailSettings = { ...mailToMailpit, transport: 'Postmark', choice: 'Postmark', tokenSet: true, from: 'test@acme.test' }
  jest.mocked(getInstall).mockResolvedValue(view({ stage: 'Admin', mail: true, mailSettings: postmark }))
  jest.mocked(installMailOff).mockResolvedValue(view({ stage: 'Admin', mailSettings: { ...postmark, transport: 'None', choice: 'Off' } }))
  jest.mocked(installMail).mockResolvedValue(view({ stage: 'Admin', mail: true, mailSettings: { ...mailToMailpit, choice: 'Mailpit', from: 'test@acme.test' } }))
  jest.spyOn(window, 'confirm').mockReturnValue(true)
  renderPage()

  expect(await screen.findByText('Mail goes through Postmark.')).toBeInTheDocument()
  await userEvent.click(screen.getByLabelText('Nowhere: mail is off'))
  await userEvent.click(screen.getByRole('button', { name: 'Turn mail off' }))
  expect(await screen.findByText('Mail is off.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Continue without mail' })).toBeInTheDocument()
  await userEvent.click(screen.getByLabelText('Mailpit, which keeps every message for you to read'))
  await userEvent.click(screen.getByRole('button', { name: 'Save mail' }))

  expect(installMailOff).toHaveBeenCalledWith(null)
  expect(installMail).toHaveBeenCalledWith(null, {
    transport: 'Mailpit',
    serverToken: '',
    from: 'test@acme.test',
    fromName: 'Scry',
    mailpitUrl: 'http://localhost:8025',
  })
  expect(await screen.findByText('Mail now goes to Mailpit. Send a test mail to check it.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
})

it('sends to a Mailpit the page names, and says where to read the test mail', async () => {
  const mailpit: MailSettings = { ...mailOff, transport: 'Mailpit', choice: 'Mailpit', mailpitUrl: 'http://localhost:8025', mailpitInbox: 'http://localhost:8025' }
  jest.mocked(getInstall).mockResolvedValue(view({ stage: 'Admin', mailSettings: mailOff }))
  jest.mocked(installMail).mockResolvedValue(view({ stage: 'Admin', mail: true, mailSettings: mailpit }))
  jest.mocked(installTestMail).mockResolvedValue({ sentTo: 'founder@acme.test', transport: 'Mailpit', inbox: 'http://localhost:8025' })
  renderPage()

  await userEvent.click(await screen.findByLabelText('Mailpit, which keeps every message for you to read'))
  expect(screen.getByLabelText('From address (optional)')).not.toBeRequired()
  await userEvent.type(screen.getByLabelText("Mailpit's address"), 'http://localhost:8025')
  await userEvent.click(screen.getByRole('button', { name: 'Save mail' }))
  await userEvent.type(await screen.findByLabelText('Send a test mail to'), 'founder@acme.test')
  await userEvent.click(screen.getByRole('button', { name: 'Send a test mail' }))

  expect(installMail).toHaveBeenCalledWith(null, expect.objectContaining({ transport: 'Mailpit', mailpitUrl: 'http://localhost:8025', from: '' }))
  expect(await screen.findByText('Sent a test mail to founder@acme.test. Read it in Mailpit at http://localhost:8025.')).toBeInTheDocument()
})

it('saves mail in the installer, and sends a test mail to the address given', async () => {
  jest.mocked(getInstall).mockResolvedValue(view({ stage: 'Admin', mailSettings: mailOff }))
  jest.mocked(installMail).mockResolvedValue(view({ stage: 'Admin', mail: true, mailSettings: { ...mailOff, transport: 'Postmark', tokenSet: true, from: 'scry@acme.test' } }))
  jest.mocked(installTestMail).mockResolvedValue({ sentTo: 'founder@acme.test', transport: 'Postmark', inbox: null })
  renderPage()

  await userEvent.type(await screen.findByLabelText('Postmark server token'), 'postmark-token')
  await userEvent.type(screen.getByLabelText('From address'), 'scry@acme.test')
  await userEvent.click(screen.getByRole('button', { name: 'Save mail' }))
  await userEvent.type(await screen.findByLabelText('Send a test mail to'), 'founder@acme.test')
  await userEvent.click(screen.getByRole('button', { name: 'Send a test mail' }))

  expect(installMail).toHaveBeenCalledWith(null, {
    transport: 'Postmark',
    serverToken: 'postmark-token',
    from: 'scry@acme.test',
    fromName: 'Scry',
    mailpitUrl: '',
  })
  expect(installTestMail).toHaveBeenCalledWith(null, 'founder@acme.test')
  expect(await screen.findByText('Sent a test mail to founder@acme.test.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
})

it('refuses two different passwords for the first admin before asking Scry', async () => {
  jest.mocked(getInstall).mockResolvedValue(view({ stage: 'Admin', mailSettings: mailOff }))
  renderPage()

  await userEvent.click(await screen.findByRole('button', { name: 'Continue without mail' }))
  await userEvent.type(await screen.findByLabelText('Email'), 'founder@acme.test')
  await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery')
  await userEvent.type(screen.getByLabelText('The same password again'), 'correct horse batter')
  await userEvent.click(screen.getByRole('button', { name: 'Make the admin and sign in' }))

  expect(await screen.findByText('The two passwords differ.')).toBeInTheDocument()
  expect(installAdmin).not.toHaveBeenCalled()
})

it('makes an admin for someone locked out of an instance already set up, then opens Scry', async () => {
  jest.mocked(getInstall).mockResolvedValue(view({ installed: true, stage: 'Done' }))
  jest.mocked(installAdmin).mockResolvedValue(founder)
  renderPage()

  await userEvent.click(await screen.findByRole('button', { name: 'Make an admin' }))
  await userEvent.type(screen.getByLabelText('Email'), 'founder@acme.test')
  await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery')
  await userEvent.type(screen.getByLabelText('The same password again'), 'correct horse battery')
  await userEvent.click(screen.getByRole('button', { name: 'Make the admin and sign in' }))

  expect(installAdmin).toHaveBeenCalledWith(null, 'founder@acme.test', 'correct horse battery')
  expect(setMe).toHaveBeenCalledWith(founder)
  expect(navigate).toHaveBeenCalledWith('/')
})

it('shows why the database did not open, and keeps the form', async () => {
  jest.mocked(getInstall).mockResolvedValue(view({}))
  jest.mocked(installDatabase).mockRejectedValue(new Error("Access denied for user 'scry'@'localhost'"))
  renderPage()

  await userEvent.click(await screen.findByRole('button', { name: 'Test and save' }))

  expect(await screen.findByText("Access denied for user 'scry'@'localhost'")).toBeInTheDocument()
  expect(screen.getByLabelText('Host')).toHaveValue('localhost')
})

it('asks a page on another machine for the code, and sends it with every step', async () => {
  jest.mocked(getInstall).mockImplementation(async (code) => (code === 'ABCD-EFGH-JKMN' ? view({ local: false }) : view({ local: false, allowed: false })))
  jest.mocked(askForInstallCode).mockResolvedValue(undefined)
  renderPage()

  await userEvent.click(await screen.findByRole('button', { name: 'Write the code to the log again' }))
  expect(await screen.findByText('Scry wrote the code to its log.')).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Install code'), 'ABCD-EFGH-JKMN')
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

  expect(await screen.findByText('Step 1 of 4: Database')).toBeInTheDocument()
  expect(getInstall).toHaveBeenLastCalledWith('ABCD-EFGH-JKMN')
})

it('reads the code from the link Scry logs, then takes it out of the address bar', async () => {
  window.history.replaceState(null, '', '/install#WXYZ-2345-6789')
  jest.mocked(getInstall).mockResolvedValue(view({ local: false }))
  renderPage()

  await screen.findByText('Step 1 of 4: Database')

  expect(getInstall).toHaveBeenCalledWith('WXYZ-2345-6789')
  expect(window.location.hash).toBe('')
})

it('says when the configuration sets a database Scry cannot open', async () => {
  jest.mocked(getInstall).mockResolvedValue(view({ databaseConfigured: true, databaseProblem: 'Unknown database' }))
  renderPage()

  expect(await screen.findByText(/in ConnectionStrings:Scry, and Scry cannot open it: Unknown database/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Test and save' })).not.toBeInTheDocument()
})

it('shows an address set by configuration and leaves it out of the step', async () => {
  jest.mocked(getInstall).mockResolvedValue(view({ stage: 'Address', clientOrigin: 'https://scry.example.test', clientOriginConfigured: true }))
  jest.mocked(installAddresses).mockResolvedValue(view({ stage: 'Done', installed: true }))
  renderPage()

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
  renderPage()

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
