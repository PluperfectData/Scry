import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, listSources, uploadSource, type Source } from '../api'
import { SourcesPage } from './SourcesPage'

jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  listSources: jest.fn(),
  uploadSource: jest.fn(),
}))

const uploaded: Source = {
  id: 7,
  name: 'q3_orders',
  fileName: 'Q3 Orders.csv',
  columns: [{ name: 'day', type: 'Date' }, { name: 'amount', type: 'Int64' }],
  rowCount: 3,
  syncedAt: '2026-11-13T12:00:00Z',
}

beforeEach(() => {
  jest.mocked(listSources).mockResolvedValue([])
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
