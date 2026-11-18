import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  connectThroughNexus,
  getNexusLink,
  listConnectors,
  listNexusConnectors,
  listNexusSyncs,
  listSources,
  listSourceUses,
  removeSource,
  runNexusSync,
  signInAgainThroughNexus,
  type Connector,
  type NexusLink,
  type NexusSignIn,
  type NexusSync,
  type Source,
} from '../api'
import { leaveFor } from '../browser'
import type { TableSettings } from '../dashboard'
import { when } from '../signIn'
import { SourcesPage } from './SourcesPage'

jest.mock('react-router', () => jest.requireActual('../../jest/router').reactRouterMock())
const { navigate } = jest.requireActual('../../jest/router')

jest.mock('../workspace', () => jest.requireActual('../../jest/workspace').workspaceMock())

jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  listSources: jest.fn(),
  listConnectors: jest.fn(),
  listSourceUses: jest.fn(),
  removeSource: jest.fn(),
  getNexusLink: jest.fn(),
  listNexusConnectors: jest.fn(),
  listNexusSyncs: jest.fn(),
  connectThroughNexus: jest.fn(),
  runNexusSync: jest.fn(),
  signInAgainThroughNexus: jest.fn(),
}))

jest.mock('../browser', () => ({ leaveFor: jest.fn() }))

// The upload form is its own unit; here it adds one source when its button is pressed.
jest.mock('../components/UploadForm', () => ({
  UploadForm: ({ onUploaded }: { onUploaded: (source: Source) => void }) =>
    jest.requireActual('react').createElement('button', { type: 'button', onClick: () => onUploaded(mockUpload) }, 'Upload the orders file'),
}))

// The preview's table is its own unit; here it only says which source it shows, and how.
jest.mock('../components/TableView', () => ({
  TableView: ({ table }: { table: TableSettings }) =>
    jest
      .requireActual('react')
      .createElement('p', null, `Rows of source ${table.sourceId}, ${table.pageSize} a page, ${table.columns.length || 'all'} columns`),
}))

const mockUpload: Source = {
  id: 7,
  name: 'q3_orders',
  kind: 'Upload',
  pushedBy: null,
  pushKeyPrefix: null,
  origin: null,
  fileName: 'Q3 Orders.csv',
  columns: [{ name: 'day', type: 'Date' }, { name: 'amount', type: 'Int64' }],
  rowCount: 3,
  syncedAt: '2026-11-13T12:00:00Z',
  signIn: null,
}

const mockPushed: Source = {
  id: 9,
  name: 'events',
  kind: 'Push',
  pushedBy: null,
  pushKeyPrefix: null,
  origin: null,
  fileName: null,
  columns: [{ name: 'amount', type: 'Int64' }],
  rowCount: 2,
  syncedAt: '2026-11-15T12:00:00Z',
  signIn: null,
}

const unlinked: NexusLink = { linked: false, nexusUrl: null, appName: null, workspaceName: null, pushKeyName: null, pushKeyPrefix: null, linkedAt: null }

const linked: NexusLink = {
  linked: true,
  nexusUrl: 'http://localhost:6163',
  appName: 'Scry at localhost:6161',
  workspaceName: 'Acme',
  pushKeyName: 'Nexus at localhost:6163',
  pushKeyPrefix: 'scry_ab12',
  linkedAt: '2026-11-15T12:00:00Z',
}

const connectors: Connector[] = [
  { id: 'csv', name: 'CSV', description: 'Reads a delimited text file.', fields: [] },
]

beforeEach(() => {
  jest.clearAllMocks()
  sessionStorage.clear()
  jest.mocked(listSources).mockResolvedValue([])
  jest.mocked(listConnectors).mockResolvedValue(connectors)
  jest.mocked(getNexusLink).mockResolvedValue(unlinked)
  jest.mocked(listNexusConnectors).mockResolvedValue([])
  jest.mocked(listNexusSyncs).mockResolvedValue([])
})

async function pick(name: RegExp) {
  await userEvent.click(screen.getByRole('button', { name: 'Add source' }))
  const slideout = screen.getByRole('dialog', { name: 'Add a source' })
  await userEvent.click(await within(slideout).findByRole('button', { name }))
}

it('uploads a CSV file from the slideout and lists it, closing the slideout', async () => {
  render(<SourcesPage />)

  await pick(/^CSV/)
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Add CSV' })).getByRole('button', { name: 'Upload the orders file' }))

  expect(await screen.findByRole('heading', { name: 'q3_orders' })).toBeInTheDocument()
  expect(screen.getByText('day (Date), amount (Int64)')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Upload the orders file' })).not.toBeInTheDocument()
})

it('goes back from a form to every connector', async () => {
  render(<SourcesPage />)

  await pick(/^CSV/)
  await userEvent.click(screen.getByRole('button', { name: 'All connectors' }))

  const slideout = screen.getByRole('dialog', { name: 'Add a source' })
  expect(within(slideout).getAllByRole('button', { name: /^(CSV|Push API)/ })).toHaveLength(2)
  expect(screen.queryByRole('button', { name: 'Upload the orders file' })).not.toBeInTheDocument()
})

it("previews a source's rows in a window over the page", async () => {
  jest.mocked(listSources).mockResolvedValue([mockUpload])
  render(<SourcesPage />)

  await userEvent.click(await screen.findByRole('button', { name: 'q3_orders' }))

  const preview = screen.getByRole('dialog', { name: 'q3_orders' })
  expect(within(preview).getByText('Rows of source 7, 50 a page, all columns')).toBeInTheDocument()

  await userEvent.click(within(preview).getByRole('button', { name: 'Close' }))
  expect(screen.queryByText('Rows of source 7, 50 a page, all columns')).not.toBeInTheDocument()
})

it('says which key pushes a pushed source and where its rows come from, and offers it no sync', async () => {
  jest.mocked(listSources).mockResolvedValue([
    { ...mockPushed, id: 20, name: 'trades', kind: 'Push', pushedBy: 'Nexus at localhost:6163', pushKeyPrefix: 'scry_ab12', origin: 'Nexus workspace Acme, connection Shop (MySQL), stream shop.orders', rowCount: 3 },
    { ...mockPushed, id: 21, name: 'events', kind: 'Push', pushedBy: null, syncedAt: null, rowCount: 0 },
  ])
  render(<SourcesPage />)

  expect(await screen.findByText(/^pushed with the key Nexus at localhost:6163, scry_ab12…: 3 rows/)).toBeInTheDocument()
  expect(screen.getByText('From Nexus workspace Acme, connection Shop (MySQL), stream shop.orders.')).toBeInTheDocument()
  expect(screen.getByText('pushed by a revoked key: no rows pushed yet')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^Sync .* now$/ })).not.toBeInTheDocument()
})

it('offers the push API beside CSV, pointing to Settings and the reference', async () => {
  render(<SourcesPage />)

  await userEvent.click(screen.getByRole('button', { name: 'Add source' }))
  const grid = screen.getByRole('dialog', { name: 'Add a source' })
  const tiles = await within(grid).findAllByRole('button', { name: /^(CSV|Push API)/ })
  expect(tiles.map((tile) => tile.querySelector('.connector-name')?.textContent)).toEqual(['CSV', 'Push API'])
  await userEvent.click(tiles[1])

  const panel = screen.getByRole('dialog', { name: 'Push API' })
  expect(within(panel).getByRole('link', { name: 'Make a key on Settings' })).toHaveAttribute('href', '/workspaces/1/settings')
  expect(within(panel).getByRole('link', { name: 'Read the push API reference' })).toHaveAttribute('href', '/docs/push-api')
})

it('removes a source after a confirm that names the charts reading it', async () => {
  jest.mocked(listSources).mockResolvedValue([mockUpload])
  jest.mocked(listSourceUses).mockResolvedValue([
    { dashboardId: 3, dashboardName: 'Sales', chartTitle: 'Revenue', chartKind: 'line' },
    { dashboardId: 3, dashboardName: 'Sales', chartTitle: null, chartKind: 'bar' },
  ])
  jest.mocked(removeSource).mockResolvedValue(undefined)
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true)
  render(<SourcesPage />)

  await userEvent.click(await screen.findByRole('button', { name: 'Remove q3_orders' }))

  expect(listSourceUses).toHaveBeenCalledWith(7)
  expect(confirm).toHaveBeenCalledWith(
    'Remove q3_orders and its rows?\n\nThese charts read it, and will ask for another source:\n• Revenue, on Sales\n• An untitled bar, on Sales',
  )
  expect(removeSource).toHaveBeenCalledWith(7)
  expect(await screen.findByText(/^No sources yet/)).toBeInTheDocument()
  confirm.mockRestore()
})

it('keeps a source when the confirm is declined, and warns that its next push makes it again', async () => {
  const pushed: Source = {
    ...mockPushed,
    id: 20,
    name: 'trades',
    kind: 'Push',
    pushedBy: 'Nexus at localhost:6163',
    pushKeyPrefix: 'scry_ab12',
    origin: 'Nexus workspace Acme, connection Shop (MySQL), stream shop.orders',
  }
  jest.mocked(listSources).mockResolvedValue([pushed])
  jest.mocked(listSourceUses).mockResolvedValue([])
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false)
  render(<SourcesPage />)

  await userEvent.click(await screen.findByRole('button', { name: 'Remove trades' }))

  expect(confirm).toHaveBeenCalledWith(
    'Remove trades and its rows?\n\nThe key Nexus at localhost:6163 can still push to it, from Nexus workspace Acme, connection Shop (MySQL), stream shop.orders, and its next push makes it again. To stop that, remove what pushes it, such as its sync in Nexus.',
  )
  expect(removeSource).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'trades' })).toBeInTheDocument()
  confirm.mockRestore()
})

const shopOrders: Source = {
  ...mockPushed,
  id: 30,
  name: 'shop_orders',
  kind: 'Nexus',
  pushedBy: 'Nexus at localhost:6163',
  pushKeyPrefix: 'scry_ab12',
  origin: 'Nexus workspace Acme, connection Shop (MySQL), stream shop.orders',
  rowCount: 1200,
}

const ordersSync: NexusSync = {
  id: 11,
  connectionId: 4,
  connectionName: 'Shop',
  connectorName: 'MySQL',
  signIn: null,
  stream: 'shop.orders',
  table: 'shop_orders',
  mode: 'FullRefresh',
  status: 'Ready',
  lastRun: { status: 'Succeeded', startedAt: '2026-11-15T12:00:00Z', endedAt: '2026-11-15T12:01:00Z', rows: 1200, error: null },
}

async function openThroughNexus() {
  await userEvent.click(screen.getByRole('button', { name: 'Add source' }))
  return within(await screen.findByRole('region', { name: 'Through Nexus' }))
}

it('offers a Link Nexus tile while Scry is unlinked, which goes to Settings', async () => {
  render(<SourcesPage />)

  const nexus = await openThroughNexus()
  await userEvent.click(nexus.getByRole('button', { name: /^Link Nexus/ }))

  expect(navigate).toHaveBeenCalledWith('/workspaces/1/settings')
})

it("offers Nexus's connectors once linked, and opens Nexus's connect page for the one picked", async () => {
  jest.mocked(getNexusLink).mockResolvedValue(linked)
  jest.mocked(listNexusConnectors).mockResolvedValue([{ id: 'mysql', name: 'MySQL', description: 'Reads tables from MySQL.', notReady: null }])
  jest.mocked(connectThroughNexus).mockResolvedValue({ url: 'http://localhost:6165/connect#nxc_token' })
  render(<SourcesPage />)

  const nexus = await openThroughNexus()
  await userEvent.click(await nexus.findByRole('button', { name: /^MySQL/ }))

  expect(connectThroughNexus).toHaveBeenCalledWith('mysql')
  expect(leaveFor).toHaveBeenCalledWith('http://localhost:6165/connect#nxc_token')
})

it('says how connecting through Nexus went on coming back, then clears it from the address', async () => {
  window.history.pushState({}, '', '/sources?connection=4')
  const { unmount } = render(<SourcesPage />)
  expect(await screen.findByText('Connected through Nexus. Its tables are syncing in.')).toBeInTheDocument()
  expect(window.location.search).toBe('')
  unmount()

  window.history.pushState({}, '', '/sources?error=cancelled')
  render(<SourcesPage />)
  expect(await screen.findByText('Connecting through Nexus was cancelled.')).toBeInTheDocument()
  expect(screen.queryByText('cancelled')).not.toBeInTheDocument()
})

it("shows a Nexus source's sync, and runs it through Nexus", async () => {
  jest.mocked(listSources).mockResolvedValue([shopOrders])
  jest.mocked(getNexusLink).mockResolvedValue(linked)
  jest.mocked(listNexusSyncs).mockResolvedValue([ordersSync])
  jest.mocked(runNexusSync).mockResolvedValue({ ...ordersSync, status: 'Queued' })
  render(<SourcesPage />)

  expect(await screen.findByText(/^Nexus's last sync sent 1,200 rows/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Sync shop_orders now through Nexus' }))

  expect(runNexusSync).toHaveBeenCalledWith(11)
  expect(await screen.findByText('Nexus has a sync of it queued.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Nexus is syncing shop_orders…' })).toBeDisabled()
})

// A Charles Schwab sign-in that Schwab ended an hour ago.
const ended = (): NexusSignIn => ({
  kind: 'FixedClock',
  signedInAt: '2026-11-11T14:14:00Z',
  endsAt: '2026-11-18T14:14:00Z',
  endingSoon: false,
  ended: true,
  endedAt: '2026-11-18T14:14:00Z',
  keptAliveAt: null,
  accounts: ['…1234'],
})

it("says when a Nexus source's sync failed or its connection's sign-in ended, and signs it in again through Nexus", async () => {
  jest.mocked(listSources).mockResolvedValue([shopOrders, { ...shopOrders, id: 31, name: 'old_orders' }])
  jest.mocked(getNexusLink).mockResolvedValue(linked)
  jest.mocked(listNexusSyncs).mockResolvedValue([
    {
      ...ordersSync,
      connectorName: 'Charles Schwab',
      signIn: ended(),
      status: 'Failed',
      lastRun: { ...ordersSync.lastRun!, status: 'Failed', rows: 0, error: 'Its connection needs a new sign-in. Sign in again first.' },
    },
  ])
  jest.mocked(signInAgainThroughNexus).mockResolvedValue({ url: 'http://localhost:6165/connect#nxc_renew' })
  render(<SourcesPage />)

  expect(await screen.findByText(/^Nexus's last sync failed, .+: Its connection needs a new sign-in\. Sign in again first\.$/)).toBeInTheDocument()
  expect(
    screen.getByText(`Its Charles Schwab sign-in in Nexus ended ${when('2026-11-18T14:14:00Z')}. Nexus syncs nothing from it until someone signs in again.`),
  ).toHaveClass('error')
  expect(screen.getByText('Reads the account …1234.')).toBeInTheDocument()
  expect(screen.getByText('No Nexus sync writes it now.')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Sign in again' }))

  expect(signInAgainThroughNexus).toHaveBeenCalledWith(4)
  expect(leaveFor).toHaveBeenCalledWith('http://localhost:6165/connect#nxc_renew')
  expect(sessionStorage.getItem('scry-renewing')).toBe('4')
})

it("offers a fixed clock's Sign in again early, and shows the list's sign-in before Nexus's syncs arrive", async () => {
  const endsAt = new Date(Date.now() + 3 * 86_400_000).toISOString()
  jest.mocked(listSources).mockResolvedValue([
    { ...shopOrders, signIn: { ...ended(), ended: false, endedAt: null, endsAt, provider: 'Charles Schwab' } },
  ])
  jest.mocked(getNexusLink).mockResolvedValue(linked)
  jest.mocked(listNexusSyncs).mockResolvedValue([{ ...ordersSync, connectorName: 'Charles Schwab', signIn: { ...ended(), ended: false, endedAt: null, endsAt } }])
  render(<SourcesPage />)

  expect(
    await screen.findByText(`Signed in to Charles Schwab in Nexus ${when('2026-11-11T14:14:00Z')}. Charles Schwab ends it ${when(endsAt)}, in 3 days.`),
  ).toHaveClass('muted')
  expect(await screen.findByRole('button', { name: 'Sign in again' })).toBeInTheDocument()
})

it('says a renewal through Nexus went through on coming back', async () => {
  sessionStorage.setItem('scry-renewing', '4')
  window.history.pushState({}, '', '/sources?connection=4')
  render(<SourcesPage />)

  expect(await screen.findByText('Signed in again. Its tables sync again.')).toBeInTheDocument()
  expect(sessionStorage.getItem('scry-renewing')).toBeNull()
})

it("names the Nexus sync that would bring a removed source back", async () => {
  jest.mocked(listSources).mockResolvedValue([shopOrders])
  jest.mocked(getNexusLink).mockResolvedValue(linked)
  jest.mocked(listNexusSyncs).mockResolvedValue([ordersSync])
  jest.mocked(listSourceUses).mockResolvedValue([])
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false)
  render(<SourcesPage />)
  await screen.findByText(/^Nexus's last sync sent/)

  await userEvent.click(screen.getByRole('button', { name: 'Remove shop_orders' }))

  expect(confirm).toHaveBeenCalledWith(
    "Remove shop_orders and its rows?\n\nNexus's sync of shop.orders from Shop (MySQL) still writes it, so it comes back on that sync's next run. To stop that, remove the sync in Nexus.",
  )
  confirm.mockRestore()
})

it("links each source to its own entries on the Log page", async () => {
  jest.mocked(listSources).mockResolvedValue([mockUpload])
  render(<SourcesPage />)

  expect(await screen.findByRole('link', { name: 'Log for q3_orders' })).toHaveAttribute('href', '/log?source=7')
})
