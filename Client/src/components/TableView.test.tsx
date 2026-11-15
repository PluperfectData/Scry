import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getRows, type Rows } from '../api'
import type { TableSettings } from '../dashboard'
import { formatter } from '../formats'
import { TableView } from './TableView'

jest.mock('../api', () => ({ ...jest.requireActual('../api'), getRows: jest.fn() }))

const columns: Rows['columns'] = [
  { name: 'region', type: 'String' },
  { name: 'amount', type: 'Decimal' },
]

const rows = (count: number, from = 0): (string | null)[][] =>
  Array.from({ length: count }, (_, i) => [`r${from + i}`, String(from + i)])

const table = (settings: Partial<TableSettings>): TableSettings => ({
  kind: 'table',
  sourceId: 7,
  join: null,
  columns: [],
  sort: null,
  pageSize: 2,
  formats: {},
  count: false,
  name: null,
  scales: null,
  ...settings,
})

beforeEach(() => jest.clearAllMocks())

it('opens on the first page in the default sort and turns pages', async () => {
  jest.mocked(getRows).mockImplementation(async (_id, { offset }) => ({ columns, values: rows(offset === 0 ? 2 : 1, offset), total: 3 }))
  const sort = { column: 'amount', direction: 'desc' } as const
  render(<TableView table={table({ sort })} />)

  expect(await screen.findByText('Rows 1–2 of 3')).toBeInTheDocument()
  expect(getRows).toHaveBeenCalledWith(expect.objectContaining({ sourceId: 7 }), { columns: [], sort, count: false, offset: 0, limit: 2 })
  expect(screen.getByRole('columnheader', { name: /amount/ })).toHaveAttribute('aria-sort', 'descending')

  await userEvent.click(screen.getByRole('button', { name: 'Next' }))

  expect(await screen.findByText('Rows 3–3 of 3')).toBeInTheDocument()
  expect(getRows).toHaveBeenLastCalledWith(expect.objectContaining({ sourceId: 7 }), { columns: [], sort, count: false, offset: 2, limit: 2 })
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled()
})

it('sorts by a clicked header, ascending and then descending, from the first page', async () => {
  jest.mocked(getRows).mockResolvedValue({ columns, values: rows(2), total: 3 })
  render(<TableView table={table({})} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Next' }))

  await userEvent.click(screen.getByRole('button', { name: 'region' }))
  expect(getRows).toHaveBeenLastCalledWith(expect.objectContaining({ sourceId: 7 }), expect.objectContaining({ sort: { column: 'region', direction: 'asc' }, offset: 0 }))
  await waitFor(() => expect(screen.getByRole('columnheader', { name: /region/ })).toHaveAttribute('aria-sort', 'ascending'))

  await userEvent.click(screen.getByRole('button', { name: /region/ }))
  expect(getRows).toHaveBeenLastCalledWith(expect.objectContaining({ sourceId: 7 }), expect.objectContaining({ sort: { column: 'region', direction: 'desc' } }))
})

it('opens a counted table most frequent first, with its counts written as numbers and sortable from their header', async () => {
  const counted: Rows['columns'] = [{ name: 'region', type: 'String' }, { name: 'Count', type: 'Int64' }]
  jest.mocked(getRows).mockResolvedValue({ columns: counted, values: [['east', '1204'], ['west', '873']], total: 2 })
  render(<TableView table={table({ count: true })} />)

  expect(await screen.findByText('1,204')).toBeInTheDocument()
  expect(getRows).toHaveBeenCalledWith(
    expect.objectContaining({ sourceId: 7 }),
    expect.objectContaining({ count: true, sort: { column: '__scry_count', direction: 'desc' } }),
  )
  expect(screen.getByRole('columnheader', { name: /Count/ })).toHaveAttribute('aria-sort', 'descending')

  await userEvent.click(screen.getByRole('button', { name: /Count/ }))
  expect(getRows).toHaveBeenLastCalledWith(
    expect.objectContaining({ sourceId: 7 }),
    expect.objectContaining({ sort: { column: '__scry_count', direction: 'asc' } }),
  )
})

it('writes a column in its format', async () => {
  jest.mocked(getRows).mockResolvedValue({ columns, values: [['east', '1234.5']], total: 1 })
  const money = { kind: 'money', currency: 'USD' } as const
  render(<TableView table={table({ formats: { amount: money } })} />)

  const row = (await screen.findByText('east')).closest('tr')!
  expect(within(row).getByText(formatter(money)('1234.5'))).toBeInTheDocument()
})

it('loads the next 100 rows of a list once its end comes into view', async () => {
  let reveal: IntersectionObserverCallback = () => {}
  global.IntersectionObserver = class {
    constructor(callback: IntersectionObserverCallback) {
      reveal = callback
    }
    observe() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver
  jest.mocked(getRows).mockImplementation(async (_id, { offset }) => ({ columns, values: rows(offset === 0 ? 100 : 50, offset), total: 150 }))
  render(<TableView table={table({ pageSize: null })} />)
  await screen.findByText('Loading more…')

  act(() => reveal([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver))

  await screen.findByText('r149')
  expect(getRows).toHaveBeenLastCalledWith(expect.objectContaining({ sourceId: 7 }), { columns: [], sort: null, count: false, offset: 100, limit: 100 })
  expect(screen.getByText('r0')).toBeInTheDocument()
  expect(screen.queryByText('Loading more…')).not.toBeInTheDocument()
  expect(screen.getByText('150 rows')).toBeInTheDocument()
})

it('presents one scrolling list with no pages or sort buttons, the first rows again after the last when looping', async () => {
  jest.mocked(getRows).mockResolvedValue({ columns, values: rows(3), total: 3 })
  render(<TableView table={table({ pageSize: 2 })} presenting plan={{ seconds: 15, wrap: 'loop', window: 20 }} />)

  expect(await screen.findByText('3 rows')).toBeInTheDocument()
  expect(getRows).toHaveBeenCalledWith(expect.objectContaining({ sourceId: 7 }), expect.objectContaining({ offset: 0, limit: 100 }))
  expect(screen.queryByRole('button', { name: /region/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
  expect(screen.getAllByText('r0')).toHaveLength(2)
})
