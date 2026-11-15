import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { listConnectors, listSources, syncSource, type Connector, type Source } from '../api'
import type { TableSettings } from '../dashboard'
import { SourcesPage } from './SourcesPage'

jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  listSources: jest.fn(),
  listConnectors: jest.fn(),
  syncSource: jest.fn(),
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
  fileName: 'Q3 Orders.csv',
  connector: null,
  stream: null,
  columns: [{ name: 'day', type: 'Date' }, { name: 'amount', type: 'Int64' }],
  rowCount: 3,
  syncedAt: '2026-11-13T12:00:00Z',
}

const mockTable: Source = {
  id: 9,
  name: 'public_orders',
  fileName: null,
  connector: 'mysql',
  stream: 'public.orders',
  columns: [{ name: 'amount', type: 'Int64' }],
  rowCount: 2,
  syncedAt: '2026-11-15T12:00:00Z',
}

const connectors: Connector[] = [
  { id: 'csv', name: 'CSV', description: 'Reads a delimited text file.', fields: [] },
  { id: 'mysql', name: 'MySQL', description: 'Reads tables from a MySQL database.', fields: [] },
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
