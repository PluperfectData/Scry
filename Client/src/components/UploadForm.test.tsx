import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, uploadSource, type Source } from '../api'
import { UploadForm } from './UploadForm'

jest.mock('../api', () => ({ ...jest.requireActual('../api'), uploadSource: jest.fn() }))

const uploaded: Source = {
  id: 7,
  name: 'q3_orders',
  fileName: 'Q3 Orders.csv',
  connector: null,
  stream: null,
  columns: [{ name: 'day', type: 'Date' }],
  rowCount: 3,
  syncedAt: '2026-11-13T12:00:00Z',
}

beforeEach(() => jest.clearAllMocks())

it('names the source after the file, then hands back what was uploaded', async () => {
  jest.mocked(uploadSource).mockResolvedValue(uploaded)
  const onUploaded = jest.fn()
  render(<UploadForm onUploaded={onUploaded} onCancel={jest.fn()} />)
  const file = new File(['day,amount\n'], 'Q3 Orders.csv', { type: 'text/csv' })

  await userEvent.upload(screen.getByLabelText('CSV file'), file)
  expect(screen.getByLabelText('Name')).toHaveValue('q3_orders')
  await userEvent.click(screen.getByRole('button', { name: 'Upload' }))

  expect(uploadSource).toHaveBeenCalledWith('q3_orders', file, 'Comma')
  expect(onUploaded).toHaveBeenCalledWith(uploaded)
})

it("shows the API's reason when an upload is refused", async () => {
  jest.mocked(uploadSource).mockRejectedValue(new ApiError(409, "A source named 'q3_orders' already exists."))
  const onUploaded = jest.fn()
  render(<UploadForm onUploaded={onUploaded} onCancel={jest.fn()} />)

  await userEvent.upload(screen.getByLabelText('CSV file'), new File([''], 'Q3 Orders.csv'))
  await userEvent.click(screen.getByRole('button', { name: 'Upload' }))

  expect(await screen.findByText("A source named 'q3_orders' already exists.")).toBeInTheDocument()
  expect(onUploaded).not.toHaveBeenCalled()
})

it('refuses a file over 1 GB before sending it', async () => {
  render(<UploadForm onUploaded={jest.fn()} onCancel={jest.fn()} />)
  const huge = Object.defineProperty(new File([''], 'customers.csv'), 'size', { value: 2 * 1024 ** 3 })

  await userEvent.upload(screen.getByLabelText('CSV file'), huge)

  expect(screen.getByText('customers.csv is 2.0 GB. A source can be up to 1 GB.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled()
  expect(uploadSource).not.toHaveBeenCalled()
})
