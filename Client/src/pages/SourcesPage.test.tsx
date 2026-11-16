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
  signInAgain,
  syncSource,
  type Connector,
  type NexusLink,
  type NexusSync,
  type Source,
} from '../api'
import { leaveFor } from '../browser'
import type { TableSettings } from '../dashboard'
import { SourcesPage } from './SourcesPage'

jest.mock('react-router', () => jest.requireActual('../../jest/router').reactRouterMock())
const { navigate } = jest.requireActual('../../jest/router')

jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  listSources: jest.fn(),
  listConnectors: jest.fn(),
  signInAgain: jest.fn(),
  syncSource: jest.fn(),
  listSourceUses: jest.fn(),
  removeSource: jest.fn(),
  getNexusLink: jest.fn(),
  listNexusConnectors: jest.fn(),
  listNexusSyncs: jest.fn(),
  connectThroughNexus: jest.fn(),
  runNexusSync: jest.fn(),
}))

jest.mock('../browser', () => ({ leaveFor: jest.fn() }))

jest.mock('../components/SchwabForm', () => ({
  SchwabForm: () => jest.requireActual('react').createElement('p', null, 'The Schwab form'),
}))

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
  connector: null,
  stream: null,
  columns: [{ name: 'day', type: 'Date' }, { name: 'amount', type: 'Int64' }],
  rowCount: 3,
  syncedAt: '2026-11-13T12:00:00Z',
  status: 'Ready',
  error: null,
}

const mockTable: Source = {
  id: 9,
  name: 'schwab_quotes',
  kind: 'Connection',
  pushedBy: null,
  pushKeyPrefix: null,
  origin: null,
  fileName: null,
  connector: 'schwab',
  stream: 'quotes',
  columns: [{ name: 'amount', type: 'Int64' }],
  rowCount: 2,
  syncedAt: '2026-11-15T12:00:00Z',
  status: 'Ready',
  error: null,
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
  { id: 'csv', name: 'CSV', description: 'Reads a delimited text file.', fields: [], needs: [] },
  { id: 'schwab', name: 'Charles Schwab', description: 'Reads a Schwab sign-in.', fields: [], needs: [] },
]

beforeEach(() => {
  jest.clearAllMocks()
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
  expect(within(slideout).getAllByRole('button', { name: /^(CSV|Charles Schwab)/ })).toHaveLength(2)
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

it('syncs a Schwab source again, but offers no sync for an uploaded file', async () => {
  jest.mocked(listSources).mockResolvedValue([mockUpload, mockTable])
  jest.mocked(syncSource).mockResolvedValue({ ...mockTable, rowCount: 5 })
  render(<SourcesPage />)

  const syncButtons = await screen.findAllByRole('button', { name: /^Sync .* now$/ })
  expect(syncButtons.map((button) => button.getAttribute('aria-label'))).toEqual(['Sync schwab_quotes now'])
  await userEvent.click(syncButtons[0])

  expect(syncSource).toHaveBeenCalledWith(9)
  expect(await screen.findByText(/^Charles Schwab stream quotes: 5 rows/)).toBeInTheDocument()
})

const schwabBalances: Source = {
  ...mockTable,
  id: 12,
  name: 'schwab_balances',
  connector: 'schwab',
  stream: 'balances',
}

it('opens the Schwab form from its tile', async () => {
  render(<SourcesPage />)

  await pick(/^Charles Schwab/)

  expect(within(screen.getByRole('dialog', { name: 'Add Charles Schwab' })).getByText('The Schwab form')).toBeInTheDocument()
})

it('shows a source syncing in the background, and reads the list again until it is done', async () => {
  jest.useFakeTimers()
  try {
    jest
      .mocked(listSources)
      .mockResolvedValueOnce([{ ...schwabBalances, status: 'Syncing', syncedAt: null, rowCount: 0, columns: [] }])
      .mockResolvedValue([{ ...schwabBalances, rowCount: 2 }])
    render(<SourcesPage />)

    expect(await screen.findByText('Charles Schwab stream balances: syncing…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Sync .* now$/ })).not.toBeInTheDocument()

    expect(await screen.findByText(/^Charles Schwab stream balances: 2 rows/, {}, { timeout: 5000 })).toBeInTheDocument()
  } finally {
    jest.useRealTimers()
  }
})

it('offers a new sign-in in place of the sync icon once Schwab ends one', async () => {
  const ended = 'Schwab ended the sign-in, which it does every 7 days. Sign in to Schwab again.'
  jest.mocked(listSources).mockResolvedValue([{ ...schwabBalances, status: 'SignInNeeded', error: ended }])
  jest.mocked(signInAgain).mockResolvedValue({ url: 'https://api.schwabapi.com/v1/oauth/authorize?state=abc' })
  render(<SourcesPage />)

  expect(await screen.findByText(ended)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^Sync .* now$/ })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Sign in again' }))

  expect(signInAgain).toHaveBeenCalledWith(12)
  expect(leaveFor).toHaveBeenCalledWith('https://api.schwabapi.com/v1/oauth/authorize?state=abc')
})

it('says why a sign-in failed when Schwab sends the browser back, then clears it from the address', async () => {
  window.history.pushState({}, '', `/sources?error=${encodeURIComponent('Schwab did not sign you in: access_denied.')}`)
  render(<SourcesPage />)

  expect(await screen.findByText('Schwab did not sign you in: access_denied.')).toBeInTheDocument()
  expect(window.location.search).toBe('')
})

it('says which key pushes a pushed source and where its rows come from, and offers it no sync', async () => {
  jest.mocked(listSources).mockResolvedValue([
    { ...mockTable, id: 20, name: 'trades', kind: 'Push', connector: null, stream: null, pushedBy: 'Nexus at localhost:6163', pushKeyPrefix: 'scry_ab12', origin: 'Nexus workspace Acme, connection Shop (MySQL), stream shop.orders', rowCount: 3 },
    { ...mockTable, id: 21, name: 'events', kind: 'Push', connector: null, stream: null, pushedBy: null, syncedAt: null, rowCount: 0 },
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
  const tiles = await within(grid).findAllByRole('button', { name: /^(CSV|Push API|Charles Schwab)/ })
  expect(tiles.map((tile) => tile.querySelector('.connector-name')?.textContent)).toEqual(['CSV', 'Push API', 'Charles Schwab'])
  await userEvent.click(tiles[1])

  const panel = screen.getByRole('dialog', { name: 'Push API' })
  expect(within(panel).getByRole('link', { name: 'Make a key on Settings' })).toHaveAttribute('href', '/settings')
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
    ...mockTable,
    id: 20,
    name: 'trades',
    kind: 'Push',
    connector: null,
    stream: null,
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
  ...mockTable,
  id: 30,
  name: 'shop_orders',
  kind: 'Nexus',
  connector: null,
  stream: null,
  pushedBy: 'Nexus at localhost:6163',
  pushKeyPrefix: 'scry_ab12',
  origin: 'Nexus workspace Acme, connection Shop (MySQL), stream shop.orders',
  rowCount: 1200,
}

const ordersSync: NexusSync = {
  id: 11,
  connectionName: 'Shop',
  connectorName: 'MySQL',
  needsSignIn: false,
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

  expect(navigate).toHaveBeenCalledWith('/settings')
})

it("offers Nexus's connectors once linked, and opens Nexus's connect page for the one picked", async () => {
  jest.mocked(getNexusLink).mockResolvedValue(linked)
  jest.mocked(listNexusConnectors).mockResolvedValue([{ id: 'mysql', name: 'MySQL', description: 'Reads tables from MySQL.' }])
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

it("says when a Nexus source's sync failed or its connection needs a new sign-in", async () => {
  jest.mocked(listSources).mockResolvedValue([shopOrders, { ...shopOrders, id: 31, name: 'old_orders' }])
  jest.mocked(getNexusLink).mockResolvedValue(linked)
  jest.mocked(listNexusSyncs).mockResolvedValue([
    { ...ordersSync, status: 'Failed', needsSignIn: true, lastRun: { ...ordersSync.lastRun!, status: 'Failed', rows: 0, error: 'Could not reach db.test.' } },
  ])
  render(<SourcesPage />)

  expect(await screen.findByText(/^Nexus's last sync failed, .+: Could not reach db\.test\.$/)).toBeInTheDocument()
  expect(screen.getByText('Its connection in Nexus needs a new sign-in. Sign in again in Nexus.')).toBeInTheDocument()
  expect(screen.getByText('No Nexus sync writes it now.')).toBeInTheDocument()
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
