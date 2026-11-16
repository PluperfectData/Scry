import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { listConnectors, listSources, signInAgain, syncSource, type Connector, type Source } from '../api'
import { leaveFor } from '../browser'
import type { TableSettings } from '../dashboard'
import { SourcesPage } from './SourcesPage'

jest.mock('react-router', () => jest.requireActual('../../jest/router').reactRouterMock())

jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  listSources: jest.fn(),
  listConnectors: jest.fn(),
  signInAgain: jest.fn(),
  syncSource: jest.fn(),
}))

jest.mock('../browser', () => ({ leaveFor: jest.fn() }))

jest.mock('../components/SchwabForm', () => ({
  SchwabForm: () => jest.requireActual('react').createElement('p', null, 'The Schwab form'),
}))

// The forms are their own units; here each adds one source when its button is pressed.
jest.mock('../components/DatabaseForm', () => ({
  DatabaseForm: ({ database, onAdded }: { database: Connector; onAdded: (sources: Source[]) => void }) =>
    jest.requireActual('react').createElement(
      'button',
      { type: 'button', onClick: () => onAdded([{ ...mockTable, rowCount: 2 }]) },
      `Add the orders table from ${database.name}`,
    ),
}))

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
  name: 'public_orders',
  kind: 'Connection',
  pushedBy: null,
  pushKeyPrefix: null,
  origin: null,
  fileName: null,
  connector: 'mysql',
  stream: 'public.orders',
  columns: [{ name: 'amount', type: 'Int64' }],
  rowCount: 2,
  syncedAt: '2026-11-15T12:00:00Z',
  status: 'Ready',
  error: null,
}

const connectors: Connector[] = [
  { id: 'csv', name: 'CSV', description: 'Reads a delimited text file.', fields: [], needs: [] },
  { id: 'mysql', name: 'MySQL', description: 'Reads tables from a MySQL database.', fields: [], needs: [] },
  { id: 'schwab', name: 'Charles Schwab', description: 'Reads a Schwab sign-in.', fields: [], needs: [] },
]

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(listSources).mockResolvedValue([])
  jest.mocked(listConnectors).mockResolvedValue(connectors)
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

it('adds a database table from the connector picked, saying where it comes from', async () => {
  render(<SourcesPage />)

  await pick(/^MySQL/)
  await userEvent.click(screen.getByRole('button', { name: 'Add the orders table from MySQL' }))

  expect(await screen.findByRole('heading', { name: 'public_orders' })).toBeInTheDocument()
  expect(screen.getByText(/^MySQL table public\.orders: 2 rows/)).toBeInTheDocument()
})

it('goes back from a form to every connector', async () => {
  render(<SourcesPage />)

  await pick(/^MySQL/)
  await userEvent.click(screen.getByRole('button', { name: 'All connectors' }))

  const slideout = screen.getByRole('dialog', { name: 'Add a source' })
  expect(within(slideout).getAllByRole('button', { name: /^(CSV|MySQL)/ })).toHaveLength(2)
  expect(screen.queryByRole('button', { name: 'Add the orders table from MySQL' })).not.toBeInTheDocument()
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

it('syncs a database table again, but offers no sync for an uploaded file', async () => {
  jest.mocked(listSources).mockResolvedValue([mockUpload, mockTable])
  jest.mocked(syncSource).mockResolvedValue({ ...mockTable, rowCount: 5 })
  render(<SourcesPage />)

  const syncButtons = await screen.findAllByRole('button', { name: /^Sync .* now$/ })
  expect(syncButtons.map((button) => button.getAttribute('aria-label'))).toEqual(['Sync public_orders now'])
  await userEvent.click(syncButtons[0])

  expect(syncSource).toHaveBeenCalledWith(9)
  expect(await screen.findByText(/^MySQL table public\.orders: 5 rows/)).toBeInTheDocument()
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
  const tiles = await within(grid).findAllByRole('button', { name: /^(CSV|Push API|MySQL|Charles Schwab)/ })
  expect(tiles.map((tile) => tile.querySelector('.connector-name')?.textContent)).toEqual(['CSV', 'Push API', 'MySQL', 'Charles Schwab'])
  await userEvent.click(tiles[1])

  const panel = screen.getByRole('dialog', { name: 'Push API' })
  expect(within(panel).getByRole('link', { name: 'Make a key on Settings' })).toHaveAttribute('href', '/settings')
  expect(within(panel).getByRole('link', { name: 'Read the push API reference' })).toHaveAttribute('href', '/docs/push-api')
})
