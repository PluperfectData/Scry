import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, listDatabases, listSources, syncSource, uploadSource, type Database, type Source } from '../api'
import type { TableSettings } from '../dashboard'
import { SourcesPage } from './SourcesPage'

jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  listSources: jest.fn(),
  listDatabases: jest.fn(),
  syncSource: jest.fn(),
  uploadSource: jest.fn(),
}))

// The form is its own unit; here it adds one table as a source when its button is pressed.
jest.mock('../components/DatabaseForm', () => ({
  DatabaseForm: ({ onAdded }: { onAdded: (sources: Source[]) => void }) =>
    jest.requireActual('react').createElement(
      'button',
      { type: 'button', onClick: () => onAdded([{ ...mockTable, rowCount: 2 }]) },
      'Add the orders table',
    ),
}))

// The preview's table is its own unit; here it only says which source it shows, and how.
jest.mock('../components/TableView', () => ({
  TableView: ({ table }: { table: TableSettings }) =>
    jest
      .requireActual('react')
      .createElement('p', null, `Rows of source ${table.sourceId}, ${table.pageSize} a page, ${table.columns.length || 'all'} columns`),
}))

const uploaded: Source = {
  id: 7,
  name: 'q3_orders',
  fileName: 'Q3 Orders.csv',
  connector: null,
  stream: null,
  columns: [{ name: 'day', type: 'Date' }, { name: 'amount', type: 'Int64' }],
  rowCount: 3,
  syncedAt: '2026-11-13T12:00:00Z',
}

const mysql: Database = { id: 'mysql', name: 'MySQL', fields: [] }

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

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(listSources).mockResolvedValue([])
  jest.mocked(listDatabases).mockResolvedValue([mysql])
})

it('names the source after the file and lists it once uploaded', async () => {
  jest.mocked(uploadSource).mockResolvedValue(uploaded)
  render(<SourcesPage />)
  const file = new File(['day,amount\n'], 'Q3 Orders.csv', { type: 'text/csv' })

  await userEvent.upload(screen.getByLabelText('CSV file'), file)
  expect(screen.getByLabelText('Name')).toHaveValue('q3_orders')
  await userEvent.click(screen.getByRole('button', { name: 'Upload' }))

  expect(uploadSource).toHaveBeenCalledWith('q3_orders', file, 'Comma')
  expect(await screen.findByRole('heading', { name: 'q3_orders' })).toBeInTheDocument()
  expect(screen.getByText('day (Date), amount (Int64)')).toBeInTheDocument()
})

it("shows the API's reason when an upload is refused", async () => {
  jest.mocked(uploadSource).mockRejectedValue(new ApiError(409, "A source named 'q3_orders' already exists."))
  render(<SourcesPage />)

  await userEvent.upload(screen.getByLabelText('CSV file'), new File([''], 'Q3 Orders.csv'))
  await userEvent.click(screen.getByRole('button', { name: 'Upload' }))

  expect(await screen.findByText("A source named 'q3_orders' already exists.")).toBeInTheDocument()
})

it("previews a source's rows in a window over the page", async () => {
  jest.mocked(listSources).mockResolvedValue([uploaded])
  render(<SourcesPage />)

  await userEvent.click(await screen.findByRole('button', { name: 'q3_orders' }))

  const preview = screen.getByRole('dialog', { name: 'q3_orders' })
  expect(within(preview).getByText('Rows of source 7, 50 a page, all columns')).toBeInTheDocument()

  await userEvent.click(within(preview).getByRole('button', { name: 'Close' }))
  expect(screen.queryByText('Rows of source 7, 50 a page, all columns')).not.toBeInTheDocument()
})

it('adds a database table as a source from the slideout, saying where it comes from', async () => {
  render(<SourcesPage />)

  await userEvent.click(await screen.findByRole('button', { name: 'Add a database' }))
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Add a database' })).getByRole('button', { name: 'Add the orders table' }))

  expect(await screen.findByRole('heading', { name: 'public_orders' })).toBeInTheDocument()
  expect(screen.getByText(/^MySQL table public\.orders: 2 rows/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Add the orders table' })).not.toBeInTheDocument()
})

it('syncs a database table again, but offers no sync for an uploaded file', async () => {
  jest.mocked(listSources).mockResolvedValue([uploaded, mockTable])
  jest.mocked(syncSource).mockResolvedValue({ ...mockTable, rowCount: 5 })
  render(<SourcesPage />)

  const syncButtons = await screen.findAllByRole('button', { name: 'Sync now' })
  expect(syncButtons).toHaveLength(1)
  await userEvent.click(syncButtons[0])

  expect(syncSource).toHaveBeenCalledWith(9)
  expect(await screen.findByText(/^MySQL table public\.orders: 5 rows/)).toBeInTheDocument()
})

it('refuses a file over 1 GB before sending it', async () => {
  render(<SourcesPage />)
  const huge = Object.defineProperty(new File([''], 'customers.csv'), 'size', { value: 2 * 1024 ** 3 })

  await userEvent.upload(screen.getByLabelText('CSV file'), huge)

  expect(screen.getByText('customers.csv is 2.0 GB. A source can be up to 1 GB.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled()
  expect(uploadSource).not.toHaveBeenCalled()
})
